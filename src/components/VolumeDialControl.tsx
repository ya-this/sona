import { useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { clampVolume } from '../utils/volumeDial';

interface VolumeDialControlProps {
  volume: number;
  muted: boolean;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
}

export function VolumeDialControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: VolumeDialControlProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const effective = muted ? 0 : clampVolume(volume);
  const pct = Math.round(effective * 100);

  const VolumeIcon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;

  return (
    <div className="relative flex items-center shrink-0">
      {/* Desktop: Classic clean horizontal volume slider */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2.5 py-1.5 glass-plaque select-none"
        style={{ borderRadius: 'var(--sona-radius-sm)' }}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          onVolumeChange(clampVolume(effective + delta));
        }}
      >
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted || effective === 0 ? 'Включить звук' : 'Выключить звук'}
          title={muted || effective === 0 ? 'Включить звук' : 'Выключить звук'}
          className="p-0.5 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors shrink-0"
        >
          <VolumeIcon className="w-4 h-4" />
        </button>

        <div className="relative w-24 lg:w-28 h-5 flex items-center group">
          <div className="w-full h-1.5 rounded-full bg-zinc-900/12 dark:bg-white/15 overflow-hidden pointer-events-none">
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{
                width: `${pct}%`,
                backgroundColor: 'var(--sona-accent)',
              }}
            />
          </div>
          <div
            aria-hidden="true"
            className="w-3 h-3 rounded-full shadow-sm pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-transform duration-100 group-hover:scale-115"
            style={{
              left: `${pct}%`,
              backgroundColor: 'var(--sona-accent)',
            }}
          />
          <input
            type="range"
            aria-label="Громкость"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => onVolumeChange(clampVolume(Number(e.target.value) / 100))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        <span className="text-[11px] font-mono-tabular font-medium text-zinc-700 dark:text-zinc-300 w-8 text-right shrink-0">
          {pct}%
        </span>
      </div>

      {/* Mobile: Compact speaker toggle opening clean slider popover */}
      <div className="md:hidden relative">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={`Громкость ${pct}%`}
          aria-expanded={mobileOpen}
          className="w-9 h-9 glass-plaque rounded-full flex items-center justify-center text-zinc-800 dark:text-zinc-100"
        >
          <VolumeIcon className="w-4 h-4" />
        </button>

        {mobileOpen && (
          <div
            className="absolute bottom-14 right-0 w-56 glass-popover p-3.5 z-50 space-y-2.5"
            style={{ borderRadius: 'var(--sona-radius)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-900 dark:text-white">Громкость</span>
              <span className="font-mono-tabular text-zinc-600 dark:text-zinc-400">{pct}%</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                className="p-1.5 glass-plaque rounded-lg text-zinc-800 dark:text-zinc-100 shrink-0"
              >
                <VolumeIcon className="w-4 h-4" />
              </button>

              <div className="relative flex-1 h-5 flex items-center">
                <div className="w-full h-1.5 rounded-full bg-zinc-900/12 dark:bg-white/15 overflow-hidden pointer-events-none">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: 'var(--sona-accent)',
                    }}
                  />
                </div>
                <div
                  aria-hidden="true"
                  className="w-3 h-3 rounded-full shadow-sm pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{
                    left: `${pct}%`,
                    backgroundColor: 'var(--sona-accent)',
                  }}
                />
                <input
                  type="range"
                  aria-label="Громкость"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  onChange={(e) => onVolumeChange(clampVolume(Number(e.target.value) / 100))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
