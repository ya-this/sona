import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  MonitorSpeaker,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { PlaybackDevice, RepeatMode, Track } from '../types/music';
import { formatTimecode } from '../utils/stats';
import { sonaAudioEngine } from '../audio/engine';
import { CoverArt } from './CoverArt';
import { VolumeDialControl } from './VolumeDialControl';

interface PlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  showVisualizer: boolean;
  showAudioBadge: boolean;
  devices: PlaybackDevice[];
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (sec: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (trackId: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

export function PlayerBar({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  shuffle,
  repeat,
  showVisualizer,
  showAudioBadge,
  devices,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onSelectDevice,
}: PlayerBarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(false);

  useEffect(() => {
    if (!showVisualizer) return;
    let rafId = 0;
    const bins = new Uint8Array(new ArrayBuffer(64));

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const hasAudio = sonaAudioEngine.getFrequencyData(bins);
          const barCount = 18;
          const barWidth = Math.max(2, Math.floor((w - (barCount - 1) * 2) / barCount));
          const accent =
            getComputedStyle(document.documentElement).getPropertyValue('--sona-accent').trim() ||
            '#0284c7';

          for (let i = 0; i < barCount; i++) {
            const raw = hasAudio
              ? bins[i + 2] / 255
              : isPlaying
                ? 0.14 + Math.abs(Math.sin(Date.now() * 0.004 + i * 0.6)) * 0.35
                : 0.07;
            const barH = Math.max(2, Math.round(raw * h));
            const x = i * (barWidth + 2);
            ctx.fillStyle = isPlaying ? accent : 'rgba(148, 163, 184, 0.42)';
            ctx.globalAlpha = isPlaying ? 0.85 : 0.45;
            ctx.fillRect(x, h - barH, barWidth, barH);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (isPlaying) {
        rafId = window.requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, showVisualizer]);

  const activeDevice = devices.find((d) => d.active) ?? devices[0];
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer
      aria-label="Панель воспроизведения"
      className="shrink-0 px-3 sm:px-6 pb-3 sm:pb-4 pt-1 relative z-30"
    >
      <div
        className="max-w-[1260px] mx-auto h-[74px] sm:h-[80px] px-3.5 sm:px-5 glass-elevated flex items-center justify-between gap-3 sm:gap-4"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        {/* Left: Track info */}
        <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-[28%] max-w-[320px]">
          {currentTrack ? (
            <>
              <CoverArt
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 shadow-md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                    {currentTrack.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => onToggleLike(currentTrack.id)}
                    aria-label={
                      currentTrack.liked ? 'Убрать из понравившихся' : 'Добавить в понравившиеся'
                    }
                    className="p-1 text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors shrink-0"
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      style={
                        currentTrack.liked
                          ? { color: 'var(--sona-accent)', fill: 'var(--sona-accent)' }
                          : undefined
                      }
                    />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 truncate">
                  <span className="truncate">{currentTrack.artist}</span>
                  {showAudioBadge && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">
                        ·
                      </span>
                      <span className="hidden sm:inline font-mono-tabular text-[11px] truncate">
                        {currentTrack.codec}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Загрузите треки для воспроизведения
            </p>
          )}
        </div>

        {/* Center: Playback controls & seek bar */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-[460px]">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onToggleShuffle}
              aria-label="Перемешать"
              aria-pressed={shuffle}
              className="hidden sm:inline-flex p-1.5 rounded-md transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              style={shuffle ? { color: 'var(--sona-accent)' } : undefined}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              aria-label="Предыдущий трек"
              className="p-1.5 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
              className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sona-accent)]"
              style={{
                backgroundColor: 'var(--sona-accent)',
                color: 'var(--sona-accent-fg)',
              }}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Следующий трек"
              className="p-1.5 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onCycleRepeat}
              aria-label={`Повтор: ${repeat === 'off' ? 'выкл' : repeat === 'all' ? 'все' : 'один'}`}
              className="hidden sm:inline-flex p-1.5 rounded-md transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              style={repeat !== 'off' ? { color: 'var(--sona-accent)' } : undefined}
            >
              {repeat === 'one' ? (
                <Repeat1 className="w-3.5 h-3.5" />
              ) : (
                <Repeat className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-2.5">
            <span className="text-[11px] font-mono-tabular text-zinc-600 dark:text-zinc-400 w-9 text-right shrink-0">
              {formatTimecode(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              <div className="w-full h-1.5 bg-zinc-900/12 dark:bg-white/15 rounded-full overflow-hidden pointer-events-none">
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{ width: `${progressPct}%`, backgroundColor: 'var(--sona-accent)' }}
                />
              </div>
              <input
                type="range"
                aria-label="Перемотка трека"
                min={0}
                max={Math.max(1, duration)}
                step={1}
                value={Math.min(duration, Math.floor(currentTime))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[11px] font-mono-tabular text-zinc-600 dark:text-zinc-400 w-9 shrink-0">
              {formatTimecode(duration)}
            </span>
          </div>
        </div>

        {/* Right: Device output selector + Standard Volume Slider */}
        <div className="flex items-center justify-end gap-2 md:w-[28%] max-w-[320px] shrink-0">
          {showVisualizer && (
            <canvas
              ref={canvasRef}
              width={48}
              height={18}
              aria-hidden="true"
              className="hidden xl:block mr-0.5 shrink-0"
            />
          )}

          {/* Device selector */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setDevicesOpen((v) => !v)}
              aria-label="Устройства вывода"
              aria-expanded={devicesOpen}
              title={activeDevice?.name ?? 'Устройства'}
              className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white rounded-lg transition-colors"
            >
              <MonitorSpeaker className="w-4 h-4" />
            </button>

            {devicesOpen && (
              <div
                className="absolute bottom-14 right-0 w-68 glass-popover p-2.5 z-50"
                style={{ borderRadius: 'var(--sona-radius)' }}
              >
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2 pb-2 border-b border-zinc-300/50 dark:border-white/10">
                  Устройства
                </p>
                <div className="mt-1.5 space-y-1">
                  {devices.map((dev) => (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => {
                        onSelectDevice(dev.id);
                        setDevicesOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                        dev.active
                          ? 'glass-tab-active text-zinc-950 dark:text-white'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/40 dark:hover:bg-white/8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="truncate">{dev.name}</span>
                        {dev.active && (
                          <span style={{ color: 'var(--sona-accent-text)' }}>Активно</span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        {dev.outputDriver}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <VolumeDialControl
            volume={volume}
            muted={muted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        </div>
      </div>
    </footer>
  );
}
