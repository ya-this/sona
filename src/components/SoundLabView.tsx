import { Headphones, Plus, RotateCcw, Sliders, Waves } from 'lucide-react';
import type { AudioPlugin, CrossfadeSettings, HeadphonePreset } from '../types/music';
import { EQ_FREQUENCIES } from '../utils/audioLogic';

interface SoundLabViewProps {
  eqBands: number[];
  preampDb: number;
  selectedPresetId: string;
  headphonePresets: HeadphonePreset[];
  plugins: AudioPlugin[];
  crossfade: CrossfadeSettings;
  onSelectPreset: (presetId: string) => void;
  onChangeBand: (bandIndex: number, db: number) => void;
  onChangePreamp: (db: number) => void;
  onResetEq: () => void;
  onTogglePlugin: (pluginId: string) => void;
  onChangePluginIntensity: (pluginId: string, intensity: number) => void;
  onInstallPlugin: (pluginId: string) => void;
  onChangeCrossfade: (patch: Partial<CrossfadeSettings>) => void;
}

const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export function SoundLabView({
  eqBands,
  preampDb,
  selectedPresetId,
  headphonePresets,
  plugins,
  crossfade,
  onSelectPreset,
  onChangeBand,
  onChangePreamp,
  onResetEq,
  onTogglePlugin,
  onChangePluginIntensity,
  onInstallPlugin,
  onChangeCrossfade,
}: SoundLabViewProps) {
  const svgW = 600;
  const svgH = 84;
  const points = eqBands.map((db, idx) => {
    const x = (idx / (eqBands.length - 1)) * svgW;
    const y = svgH / 2 - (db / 12) * (svgH * 0.42);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const eqPath = `M ${points.join(' L ')}`;

  const installedPlugins = plugins.filter((p) => p.installed);
  const storePlugins = plugins.filter((p) => !p.installed);

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
          Звук и DSP
        </h1>
        <div className="flex items-center gap-2">
          <label htmlFor="headphone-preset-select" className="sr-only">
            Профиль наушников
          </label>
          <select
            id="headphone-preset-select"
            value={selectedPresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium glass-surface text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--sona-accent)]"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {headphonePresets.map((p) => (
              <option key={p.id} value={p.id} className="bg-white dark:bg-zinc-900">
                {p.name}
              </option>
            ))}
            <option value="custom" className="bg-white dark:bg-zinc-900">
              Свой профиль
            </option>
          </select>

          <button
            type="button"
            onClick={onResetEq}
            aria-label="Сбросить эквалайзер"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium glass-surface text-zinc-700 dark:text-zinc-200 hover:bg-white/75 dark:hover:bg-white/10"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сброс
          </button>
        </div>
      </div>

      {/* 10-Band Headphone EQ */}
      <section className="p-5 sm:p-6 glass-surface space-y-5" style={{ borderRadius: 'var(--sona-radius)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
            <Headphones className="w-4 h-4" style={{ color: 'var(--sona-accent)' }} />
            Эквалайзер под наушники
          </h2>
          <div className="flex flex-wrap gap-1 p-1 glass-tab-tray" style={{ borderRadius: 'var(--sona-radius-sm)' }}>
            {headphonePresets.slice(0, 5).map((preset) => {
              const active = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    active
                      ? 'glass-tab-active text-zinc-950 dark:text-white'
                      : 'glass-tab text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                  style={{ borderRadius: 'calc(var(--sona-radius-sm) - 3px)' }}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-20" aria-hidden="true">
          <line x1="0" y1={svgH / 2} x2={svgW} y2={svgH / 2} stroke="currentColor" strokeOpacity="0.16" strokeDasharray="4 4" />
          <path
            d={eqPath}
            fill="none"
            stroke="var(--sona-accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="grid grid-cols-5 sm:grid-cols-11 gap-2.5 items-end">
          <div className="flex flex-col items-center gap-1.5 pr-2 sm:border-r border-zinc-300/40 dark:border-white/10">
            <span className="text-[11px] font-mono-tabular text-zinc-500">
              {preampDb > 0 ? `+${preampDb}` : preampDb}
            </span>
            <input
              type="range"
              aria-label="Предусиление Preamp"
              min={-12}
              max={12}
              step={0.5}
              value={preampDb}
              onChange={(e) => onChangePreamp(Number(e.target.value))}
              className="sona-eq-slider"
            />
            <span className="text-[11px] font-mono-tabular font-medium text-zinc-600 dark:text-zinc-300">
              Pre
            </span>
          </div>

          {EQ_FREQUENCIES.map((freq, idx) => {
            const db = eqBands[idx] ?? 0;
            return (
              <div key={freq} className="flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-mono-tabular text-zinc-500">
                  {db > 0 ? `+${db}` : db}
                </span>
                <input
                  type="range"
                  aria-label={`Полоса ${FREQ_LABELS[idx]} Гц`}
                  min={-12}
                  max={12}
                  step={0.5}
                  value={db}
                  onChange={(e) => onChangeBand(idx, Number(e.target.value))}
                  className="sona-eq-slider"
                />
                <span className="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400">
                  {FREQ_LABELS[idx]}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Crossfade + DSP Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Seamless Crossfade */}
        <div
          className="lg:col-span-5 p-5 glass-surface space-y-4"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
              <Waves className="w-4 h-4" style={{ color: 'var(--sona-accent)' }} />
              Переход треков
            </h2>
            <span className="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400">
              {crossfade.enabled && crossfade.durationSec > 0
                ? `${crossfade.durationSec} с · ${
                    crossfade.curve === 'equal-power' ? 'равном.' : 'линейн.'
                  }`
                : crossfade.gapless
                  ? 'без пауз'
                  : 'пауза 0.65 с'}
            </span>
          </div>

          <div className="space-y-3.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-zinc-800 dark:text-zinc-200">Gapless (без пауз)</p>
                <p className="text-[11px] text-zinc-500">
                  Бесшовная склейка, если кроссфейд выключен
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={crossfade.gapless}
                aria-label="Воспроизведение без пауз"
                onClick={() => onChangeCrossfade({ gapless: !crossfade.gapless })}
                className="w-10 h-5 rounded-full p-0.5 transition-colors shrink-0"
                style={{
                  backgroundColor: crossfade.gapless ? 'var(--sona-accent)' : 'rgba(148,163,184,0.35)',
                }}
              >
                <span
                  className={`block w-4 h-4 rounded-full transition-transform ${
                    crossfade.gapless ? 'translate-x-5' : 'translate-x-0'
                  }`}
                  style={{ backgroundColor: crossfade.gapless ? 'var(--sona-accent-fg)' : '#ffffff' }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-zinc-800 dark:text-zinc-200">Кроссфейд</p>
                <p className="text-[11px] text-zinc-500">
                  Плавное наложение конца и начала треков
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={crossfade.enabled}
                aria-label="Плавный кроссфейд"
                onClick={() => onChangeCrossfade({ enabled: !crossfade.enabled })}
                className="w-10 h-5 rounded-full p-0.5 transition-colors shrink-0"
                style={{
                  backgroundColor: crossfade.enabled ? 'var(--sona-accent)' : 'rgba(148,163,184,0.35)',
                }}
              >
                <span
                  className={`block w-4 h-4 rounded-full transition-transform ${
                    crossfade.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                  style={{ backgroundColor: crossfade.enabled ? 'var(--sona-accent-fg)' : '#ffffff' }}
                />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Длительность</span>
                <span className="font-mono-tabular font-semibold text-zinc-950 dark:text-white">
                  {crossfade.enabled ? `${crossfade.durationSec} с` : 'выкл.'}
                </span>
              </div>
              <input
                type="range"
                aria-label="Длительность кроссфейда в секундах"
                min={0}
                max={12}
                step={1}
                disabled={!crossfade.enabled}
                value={crossfade.enabled ? crossfade.durationSec : 0}
                onChange={(e) => onChangeCrossfade({ durationSec: Number(e.target.value) })}
                className="sona-slider w-full disabled:opacity-40"
              />
            </div>

            <div
              className={`flex items-center justify-between gap-2 pt-1 transition-opacity ${
                crossfade.enabled ? 'opacity-100' : 'opacity-45'
              }`}
            >
              <div className="flex items-center gap-1 p-1 glass-tab-tray" style={{ borderRadius: 'var(--sona-radius-sm)' }}>
                {(
                  [
                    ['equal-power', 'Равномощная'],
                    ['linear', 'Линейная'],
                  ] as const
                ).map(([curve, label]) => (
                  <button
                    key={curve}
                    type="button"
                    disabled={!crossfade.enabled}
                    onClick={() => onChangeCrossfade({ curve })}
                    className={`px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed ${
                      crossfade.curve === curve
                        ? 'glass-tab-active text-zinc-950 dark:text-white'
                        : 'glass-tab text-zinc-600 dark:text-zinc-400'
                    }`}
                    style={{ borderRadius: 'calc(var(--sona-radius-sm) - 3px)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label
                className={`inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 ${
                  crossfade.enabled ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!crossfade.enabled}
                  checked={crossfade.bpmSync}
                  onChange={(e) => onChangeCrossfade({ bpmSync: e.target.checked })}
                  className="accent-[var(--sona-accent)]"
                />
                BPM
              </label>
            </div>

            <div
              className={`p-3 glass-subtle transition-opacity ${
                crossfade.enabled ? 'opacity-100' : 'opacity-45'
              }`}
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <svg viewBox="0 0 260 64" className="w-full h-16" aria-hidden="true">
                {!crossfade.enabled ? (
                  crossfade.gapless ? (
                    <>
                      <path d="M 10 14 L 128 14 L 130 54" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />
                      <path d="M 130 54 L 132 14 L 250 14" fill="none" stroke="var(--sona-accent)" strokeWidth="2.2" />
                    </>
                  ) : (
                    <>
                      <path d="M 10 14 L 108 14 L 108 54" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />
                      <path d="M 152 54 L 152 14 L 250 14" fill="none" stroke="var(--sona-accent)" strokeWidth="2.2" />
                    </>
                  )
                ) : crossfade.curve === 'equal-power' ? (
                  <>
                    <path d="M 10 12 Q 130 12 210 54" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />
                    <path d="M 50 54 Q 130 12 250 12" fill="none" stroke="var(--sona-accent)" strokeWidth="2.2" />
                  </>
                ) : (
                  <>
                    <path d="M 10 12 L 210 54" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />
                    <path d="M 50 54 L 250 12" fill="none" stroke="var(--sona-accent)" strokeWidth="2.2" />
                  </>
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* DSP Plugins Grid */}
        <div
          className="lg:col-span-7 p-5 glass-surface space-y-4"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4" style={{ color: 'var(--sona-accent)' }} />
              DSP-плагины
            </h2>
            <span className="text-xs font-mono-tabular text-zinc-500">
              {installedPlugins.filter((p) => p.enabled).length}/{installedPlugins.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {installedPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-3.5 glass-subtle space-y-2.5"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                      {plugin.name}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{plugin.category}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plugin.enabled}
                    aria-label={`Плагин ${plugin.name}`}
                    onClick={() => onTogglePlugin(plugin.id)}
                    className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0"
                    style={{
                      backgroundColor: plugin.enabled ? 'var(--sona-accent)' : 'rgba(148,163,184,0.35)',
                    }}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform ${
                        plugin.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                      style={{ backgroundColor: plugin.enabled ? 'var(--sona-accent-fg)' : '#ffffff' }}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    aria-label={`Глубина эффекта ${plugin.name}`}
                    min={0}
                    max={100}
                    value={plugin.intensity}
                    disabled={!plugin.enabled}
                    onChange={(e) => onChangePluginIntensity(plugin.id, Number(e.target.value))}
                    className="sona-slider flex-1 disabled:opacity-40"
                  />
                  <span className="text-[11px] font-mono-tabular text-zinc-500 w-8 text-right">
                    {plugin.intensity}%
                  </span>
                </div>
              </div>
            ))}

            {storePlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-3.5 glass-subtle flex items-center justify-between gap-2"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                    {plugin.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">{plugin.category}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onInstallPlugin(plugin.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium glass-surface text-zinc-800 dark:text-zinc-100 whitespace-nowrap shrink-0"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <Plus className="w-3 h-3" />
                  Добавить
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
