import type { AudioPlugin, CrossfadeSettings, Track } from '../types/music';
import {
  buildGainCurveSamples,
  computeTransitionPlan,
  EQ_FREQUENCIES,
  clampEqDb,
  type TransitionPlan,
} from '../utils/audioLogic';
import { loadLocalAudioUrl } from '../storage/offlineDb';

interface LocalDeck {
  trackId: string;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  objectUrl: string;
  fadeTimer: number | null;
  rateTimer: number | null;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeWarmthCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = Math.max(0, amount) * 0.45;
  const nSamples = 1024;
  const curve = new Float32Array(new ArrayBuffer(nSamples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

function createRoomImpulse(ctx: AudioContext, duration = 1.8, decay = 2.4): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * env * 0.55;
    }
  }
  return impulse;
}

export class SonaAudioEngine {
  private ctx: AudioContext | null = null;
  private inputGain: GainNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private karaokeFilter: BiquadFilterNode | null = null;
  private warmthNode: WaveShaperNode | null = null;
  private exciterNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private spatialDelay: DelayNode | null = null;
  private spatialGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Dual-deck local HTMLAudio playback for crossfading & gapless transitions
  private activeDeck: LocalDeck | null = null;
  private fadingDecks: Set<LocalDeck> = new Set();
  private gapTimer: number | null = null;
  private playRequestSeq = 0;
  private lastTransitionPlan: TransitionPlan | null = null;

  // Procedural synth scheduler for built-in catalog tracks
  private synthTimer: number | null = null;
  private stepIndex = 0;
  private activeTrack: Track | null = null;
  private isPlaying = false;
  private volume = 0.78;
  private muted = false;
  private eqBands: number[] = Array(10).fill(0);
  private preampDb = 0;
  private karaokeMinus = false;
  private plugins: AudioPlugin[] = [];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;

    // 10-band EQ
    this.eqNodes = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = clampEqDb(this.eqBands[idx] ?? 0);
      return filter;
    });

    // Karaoke mid-band vocal attenuation filter
    this.karaokeFilter = ctx.createBiquadFilter();
    this.karaokeFilter.type = 'peaking';
    this.karaokeFilter.frequency.value = 1400;
    this.karaokeFilter.Q.value = 0.85;
    this.karaokeFilter.gain.value = 0;

    // DSP plugins chain
    this.warmthNode = ctx.createWaveShaper();
    this.warmthNode.curve = makeWarmthCurve(0);
    this.warmthNode.oversample = '2x';

    this.exciterNode = ctx.createBiquadFilter();
    this.exciterNode.type = 'highshelf';
    this.exciterNode.frequency.value = 6500;
    this.exciterNode.gain.value = 0;

    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -14;
    this.compressorNode.ratio.value = 1;

    // Parallel reverb + spatial stereo width
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = createRoomImpulse(ctx);
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 0;

    this.spatialDelay = ctx.createDelay(0.05);
    this.spatialDelay.delayTime.value = 0.014;
    this.spatialGain = ctx.createGain();
    this.spatialGain.gain.value = 0;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.82;

    // Wire serial chain
    let cursor: AudioNode = this.inputGain;
    for (const eq of this.eqNodes) {
      cursor.connect(eq);
      cursor = eq;
    }
    cursor.connect(this.karaokeFilter);
    this.karaokeFilter.connect(this.warmthNode);
    this.warmthNode.connect(this.exciterNode);
    this.exciterNode.connect(this.compressorNode);

    // Dry & wet sends
    this.compressorNode.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    this.compressorNode.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGain);

    this.compressorNode.connect(this.spatialDelay);
    this.spatialDelay.connect(this.spatialGain);
    this.spatialGain.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.applyAllDsp();
    return ctx;
  }

  public setVolume(vol: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }
  }

  public setEqualizer(bands: number[], preampDb = 0): void {
    this.eqBands = bands.map(clampEqDb);
    this.preampDb = clampEqDb(preampDb);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.eqNodes.forEach((node, idx) => {
      node.gain.setTargetAtTime(this.eqBands[idx] ?? 0, now, 0.03);
    });
    if (this.inputGain) {
      const linearPreamp = Math.pow(10, this.preampDb / 20);
      this.inputGain.gain.setTargetAtTime(linearPreamp, now, 0.03);
    }
  }

  public setKaraokeMinus(enabled: boolean): void {
    this.karaokeMinus = enabled;
    if (this.karaokeFilter && this.ctx) {
      this.karaokeFilter.gain.setTargetAtTime(enabled ? -11 : 0, this.ctx.currentTime, 0.05);
    }
  }

  public setPlugins(plugins: AudioPlugin[]): void {
    this.plugins = plugins;
    this.applyAllDsp();
  }

  private applyAllDsp(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const byId = new Map(this.plugins.map((p) => [p.id, p]));

    const warmth = byId.get('tube-warmth');
    if (this.warmthNode) {
      this.warmthNode.curve = makeWarmthCurve(warmth?.enabled ? warmth.intensity : 0);
    }

    const exciter = byId.get('crystal-exciter');
    if (this.exciterNode) {
      const gainDb = exciter?.enabled ? (exciter.intensity / 100) * 6.5 : 0;
      this.exciterNode.gain.setTargetAtTime(gainDb, now, 0.04);
    }

    const normalizer = byId.get('dynamic-norm');
    if (this.compressorNode) {
      const active = Boolean(normalizer?.enabled);
      const ratio = active ? 2 + (normalizer!.intensity / 100) * 8 : 1;
      const threshold = active ? -10 - (normalizer!.intensity / 100) * 18 : 0;
      this.compressorNode.ratio.setTargetAtTime(ratio, now, 0.04);
      this.compressorNode.threshold.setTargetAtTime(threshold, now, 0.04);
    }

    const reverb = byId.get('acoustic-reverb');
    if (this.reverbWetGain) {
      const wet = reverb?.enabled ? (reverb.intensity / 100) * 0.42 : 0;
      this.reverbWetGain.gain.setTargetAtTime(wet, now, 0.05);
    }

    const spatial = byId.get('spatial-stage');
    if (this.spatialGain && this.spatialDelay) {
      const amt = spatial?.enabled ? (spatial.intensity / 100) * 0.3 : 0;
      this.spatialGain.gain.setTargetAtTime(amt, now, 0.05);
      this.spatialDelay.delayTime.setTargetAtTime(0.01 + amt * 0.025, now, 0.05);
    }
  }

  public async playTrack(
    track: Track,
    crossfade?: CrossfadeSettings,
    options?: { reason?: 'manual' | 'auto'; outgoingTrack?: Track | null }
  ): Promise<void> {
    const ctx = this.ensureContext();
    const requestId = ++this.playRequestSeq;
    this.clearGapTimer();

    const reason = options?.reason ?? 'manual';
    const previousTrack = options?.outgoingTrack ?? this.activeTrack;
    const wasActivelyPlaying = this.isPlaying && previousTrack !== null;
    const isTrackChange = previousTrack !== null && previousTrack.id !== track.id;
    const shouldTransition = wasActivelyPlaying && (isTrackChange || reason === 'auto');

    const activeDeckDur =
      this.activeDeck &&
      Number.isFinite(this.activeDeck.audio.duration) &&
      this.activeDeck.audio.duration > 0
        ? this.activeDeck.audio.duration
        : previousTrack?.durationSec;

    const minDuration =
      activeDeckDur && track.durationSec > 0
        ? Math.min(activeDeckDur, track.durationSec)
        : track.durationSec || activeDeckDur || 0;

    const plan = computeTransitionPlan({
      crossfade,
      outgoingBpm: previousTrack?.bpm,
      incomingBpm: track.bpm,
      trackDurationSec: minDuration,
      reason,
    });
    this.lastTransitionPlan = plan;

    this.stopSynth();
    this.activeTrack = track;
    this.isPlaying = true;

    const beginPlayback = async () => {
      if (this.playRequestSeq !== requestId || !this.isPlaying) return;

      if (track.localFileKey) {
        const useCrossfade =
          shouldTransition &&
          (plan.mode === 'crossfade' || plan.mode === 'gapless') &&
          plan.fadeDurationSec > 0;
        await this.playLocalAudioFile(track, plan, useCrossfade, requestId);
        return;
      }

      this.stopAllLocalDecks();
      if (ctx) {
        if (this.masterGain && shouldTransition && plan.mode === 'crossfade') {
          const fadeSec = Math.min(plan.fadeDurationSec * 0.5, 2);
          const target = this.muted ? 0 : this.volume;
          const now = ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(0.02, now);
          this.masterGain.gain.linearRampToValueAtTime(target, now + fadeSec);
        }
        this.startSynth(track);
      }
    };

    if (shouldTransition && plan.mode === 'gap' && plan.gapPauseMs > 0) {
      this.stopAllLocalDecks();
      this.gapTimer = window.setTimeout(() => {
        this.gapTimer = null;
        void beginPlayback();
      }, plan.gapPauseMs);
      return;
    }

    await beginPlayback();
  }

  private clearGapTimer(): void {
    if (this.gapTimer !== null) {
      window.clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private disposeDeck(deck: LocalDeck): void {
    if (deck.fadeTimer !== null) {
      window.clearTimeout(deck.fadeTimer);
      deck.fadeTimer = null;
    }
    if (deck.rateTimer !== null) {
      window.clearTimeout(deck.rateTimer);
      deck.rateTimer = null;
    }
    deck.audio.pause();
    deck.audio.src = '';
    try {
      deck.source.disconnect();
    } catch {
      // already disconnected
    }
    try {
      deck.gain.disconnect();
    } catch {
      // already disconnected
    }
    if (deck.objectUrl) {
      URL.revokeObjectURL(deck.objectUrl);
    }
    this.fadingDecks.delete(deck);
  }

  private disposeAllFadingDecks(): void {
    for (const deck of Array.from(this.fadingDecks)) {
      this.disposeDeck(deck);
    }
  }

  private stopAllLocalDecks(): void {
    if (this.activeDeck) {
      this.disposeDeck(this.activeDeck);
      this.activeDeck = null;
    }
    this.disposeAllFadingDecks();
  }

  private applyGainCurve(
    param: AudioParam,
    ctx: AudioContext,
    curve: CrossfadeSettings['curve'],
    direction: 'in' | 'out',
    durationSec: number,
    scale = 1
  ): void {
    const now = ctx.currentTime;
    const dur = Math.max(0.02, durationSec);
    const samples = buildGainCurveSamples(curve, direction, 32);
    if (scale !== 1) {
      for (let i = 0; i < samples.length; i++) {
        samples[i] *= scale;
      }
    }
    try {
      param.cancelScheduledValues(now);
      param.setValueCurveAtTime(samples, now, dur);
    } catch {
      // Fallback if Web Audio scheduling hits an overlapping quantum
      param.cancelScheduledValues(now);
      param.setValueAtTime(direction === 'in' ? 0.001 : Math.max(0.001, scale), now);
      param.linearRampToValueAtTime(direction === 'in' ? scale : 0.0001, now + dur);
    }
  }

  private async playLocalAudioFile(
    track: Track,
    plan: TransitionPlan,
    useCrossfade: boolean,
    requestId: number
  ): Promise<void> {
    const key = track.localFileKey;
    if (!key) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.inputGain) return;

    const url = await loadLocalAudioUrl(key);
    if (!url) return;

    if (this.playRequestSeq !== requestId || !this.isPlaying) {
      URL.revokeObjectURL(url);
      return;
    }

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    if (useCrossfade && plan.playbackRateMatch !== 1) {
      audio.playbackRate = plan.playbackRateMatch;
    }

    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.inputGain);

    const incomingDeck: LocalDeck = {
      trackId: track.id,
      audio,
      source,
      gain,
      objectUrl: url,
      fadeTimer: null,
      rateTimer: null,
    };

    const outgoingDeck = this.activeDeck;
    if (useCrossfade && outgoingDeck && !outgoingDeck.audio.paused) {
      // Prevent accumulation if user skips rapidly during fades
      if (this.fadingDecks.size >= 2) {
        const oldest = this.fadingDecks.values().next().value;
        if (oldest) this.disposeDeck(oldest);
      }

      this.fadingDecks.add(outgoingDeck);
      const currentOutGain = Math.max(0.05, Math.min(1, outgoingDeck.gain.gain.value || 1));
      this.applyGainCurve(
        outgoingDeck.gain.gain,
        ctx,
        plan.curve,
        'out',
        plan.fadeDurationSec,
        currentOutGain
      );
      outgoingDeck.fadeTimer = window.setTimeout(() => {
        this.disposeDeck(outgoingDeck);
      }, Math.ceil(plan.fadeDurationSec * 1000) + 140);

      this.applyGainCurve(gain.gain, ctx, plan.curve, 'in', plan.fadeDurationSec, 1);

      if (plan.playbackRateMatch !== 1) {
        incomingDeck.rateTimer = window.setTimeout(() => {
          incomingDeck.rateTimer = null;
          incomingDeck.audio.playbackRate = 1;
        }, Math.ceil(plan.fadeDurationSec * 1000) + 120);
      }
    } else {
      this.stopAllLocalDecks();
      gain.gain.setValueAtTime(1, ctx.currentTime);
    }

    this.activeDeck = incomingDeck;

    try {
      await audio.play();
    } catch {
      // Browser autoplay restriction handled gracefully
    }
  }

  public seekLocalAudio(timeSec: number): void {
    if (this.activeDeck && Number.isFinite(timeSec)) {
      this.activeDeck.audio.currentTime = Math.max(0, timeSec);
    }
    if (this.fadingDecks.size > 0) {
      this.disposeAllFadingDecks();
    }
  }

  public getLocalAudioState(): {
    active: boolean;
    currentTime: number;
    duration: number;
    ended: boolean;
  } {
    const audio = this.activeDeck?.audio;
    if (!audio) {
      return { active: false, currentTime: 0, duration: 0, ended: false };
    }
    return {
      active: true,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      ended: audio.ended,
    };
  }

  public getTransitionDebugState(): {
    activeTrackId: string | null;
    fadingCount: number;
    gapPending: boolean;
    lastPlan: TransitionPlan | null;
  } {
    return {
      activeTrackId: this.activeDeck?.trackId ?? this.activeTrack?.id ?? null,
      fadingCount: this.fadingDecks.size,
      gapPending: this.gapTimer !== null,
      lastPlan: this.lastTransitionPlan,
    };
  }

  public pause(): void {
    this.playRequestSeq++;
    this.clearGapTimer();
    this.isPlaying = false;
    this.stopSynth();
    this.disposeAllFadingDecks();
    if (this.activeDeck) {
      this.activeDeck.audio.pause();
    }
  }

  public resume(): void {
    if (!this.activeTrack) return;
    const ctx = this.ensureContext();
    this.isPlaying = true;
    if (this.activeDeck) {
      if (ctx) {
        const now = ctx.currentTime;
        this.activeDeck.gain.gain.cancelScheduledValues(now);
        this.activeDeck.gain.gain.setValueAtTime(1, now);
      }
      void this.activeDeck.audio.play().catch(() => {});
    } else if (this.activeTrack.localFileKey) {
      void this.playTrack(this.activeTrack, undefined, { reason: 'manual' });
    } else {
      this.startSynth(this.activeTrack);
    }
  }

  private stopSynth(): void {
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  private startSynth(track: Track): void {
    this.stopSynth();
    if (!this.ctx || !this.inputGain) return;

    const { synth } = track;
    const stepMs = Math.max(180, Math.round((60 / Math.max(60, synth.bpm)) * 500)); // eighth-note step

    const triggerStep = () => {
      if (!this.isPlaying || !this.ctx || !this.inputGain) return;
      const now = this.ctx.currentTime;
      const barIdx = Math.floor(this.stepIndex / 8) % synth.chords.length;
      const stepInBar = this.stepIndex % 8;
      const chord = synth.chords[barIdx] ?? [0, 3, 7];

      // Warm sustained chord pad on beat 1 of each bar
      if (stepInBar === 0) {
        chord.forEach((semi, voiceIdx) => {
          if (!this.ctx || !this.inputGain) return;
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const env = this.ctx.createGain();
          osc.type = synth.padWave;
          osc.frequency.value = midiToFreq(synth.rootMidi + semi);
          osc.detune.value = (voiceIdx - 1) * 5;

          filter.type = 'lowpass';
          filter.frequency.value = Math.min(2600, synth.brightness);

          const padDur = (stepMs * 8) / 1000;
          env.gain.setValueAtTime(0.0001, now);
          env.gain.linearRampToValueAtTime(0.048, now + 0.18);
          env.gain.exponentialRampToValueAtTime(0.0008, now + padDur + 0.25);

          osc.connect(filter);
          filter.connect(env);
          env.connect(this.inputGain);
          osc.start(now);
          osc.stop(now + padDur + 0.3);
        });

        // Subtle warm sub-bass root note
        const bass = this.ctx.createOscillator();
        const bassEnv = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.value = midiToFreq(synth.rootMidi + chord[0] - 12);
        const bassDur = (stepMs * 6) / 1000;
        bassEnv.gain.setValueAtTime(0.0001, now);
        bassEnv.gain.linearRampToValueAtTime(0.09, now + 0.06);
        bassEnv.gain.exponentialRampToValueAtTime(0.0008, now + bassDur);
        bass.connect(bassEnv);
        bassEnv.connect(this.inputGain);
        bass.start(now);
        bass.stop(now + bassDur + 0.05);
      }

      // Delicate melodic arpeggio pluck
      const arpNoteIdx = synth.arpPattern[stepInBar % synth.arpPattern.length];
      if (arpNoteIdx >= 0) {
        const semi = chord[arpNoteIdx % chord.length] + 12;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const env = this.ctx.createGain();
        osc.type = synth.wave;
        osc.frequency.value = midiToFreq(synth.rootMidi + semi);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(synth.brightness * 1.35, now);
        filter.frequency.exponentialRampToValueAtTime(420, now + 0.35);

        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(0.042, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.inputGain);
        osc.start(now);
        osc.stop(now + 0.45);
      }

      // Soft minimalist rhythmic pulse for electronic/lofi styles
      if ((synth.pulseStyle === 'electronic' || synth.pulseStyle === 'lofi') && stepInBar % 2 === 0) {
        const pulse = this.ctx.createOscillator();
        const pulseEnv = this.ctx.createGain();
        pulse.type = 'triangle';
        pulse.frequency.setValueAtTime(stepInBar % 4 === 0 ? 110 : 76, now);
        pulse.frequency.exponentialRampToValueAtTime(36, now + 0.09);
        pulseEnv.gain.setValueAtTime(stepInBar % 4 === 0 ? 0.08 : 0.03, now);
        pulseEnv.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
        pulse.connect(pulseEnv);
        pulseEnv.connect(this.inputGain);
        pulse.start(now);
        pulse.stop(now + 0.12);
      }

      this.stepIndex++;
    };

    triggerStep();
    this.synthTimer = window.setInterval(triggerStep, stepMs);
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.isPlaying) {
      target.fill(0);
      return false;
    }
    this.analyser.getByteFrequencyData(target);
    return true;
  }

  public dispose(): void {
    this.playRequestSeq++;
    this.clearGapTimer();
    this.stopSynth();
    this.stopAllLocalDecks();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const sonaAudioEngine = new SonaAudioEngine();
