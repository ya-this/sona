import { useState } from 'react';
import { FolderOpen, Menu, Moon, Search, Sun, X } from 'lucide-react';
import type { NavTab } from '../types/music';

interface TopGlassNavProps {
  activeTab: NavTab;
  searchQuery: string;
  theme: 'dark' | 'light';
  onSelectTab: (tab: NavTab) => void;
  onSearchChange: (q: string) => void;
  onToggleTheme: () => void;
  onOpenLocalFiles: () => void;
}

const PRIMARY_TABS: Array<{ id: NavTab; label: string }> = [
  { id: 'home', label: 'Медиатека' },
  { id: 'playlists', label: 'Плейлисты' },
  { id: 'sound', label: 'Звук' },
  { id: 'karaoke', label: 'Караоке' },
  { id: 'stats', label: 'Статистика' },
];

export function TopGlassNav({
  activeTab,
  searchQuery,
  theme,
  onSelectTab,
  onSearchChange,
  onToggleTheme,
  onOpenLocalFiles,
}: TopGlassNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="shrink-0 px-3 sm:px-6 pt-3 sm:pt-4 pb-1 z-30 relative">
      <div
        className="max-w-[1260px] mx-auto h-15 px-3.5 sm:px-5 glass-elevated flex items-center justify-between gap-3 sm:gap-5"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Меню навигации"
            className="lg:hidden p-1.5 -ml-1 text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="inline-flex items-center gap-2.5 text-zinc-950 dark:text-white whitespace-nowrap shrink-0"
          >
            <svg
              className="w-4 h-4 text-[#191E12] dark:text-white animate-reticle shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" strokeDasharray="2 2" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            <span className="font-display italic text-lg sm:text-xl font-semibold tracking-tight">
              Sona
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Tab Tray */}
        <nav
          aria-label="Основная навигация"
          className="hidden lg:flex items-center gap-1 p-1 glass-tab-tray"
          style={{ borderRadius: 'var(--sona-radius-sm)' }}
        >
          {PRIMARY_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-mono-tabular uppercase tracking-[0.14em] whitespace-nowrap shrink-0 ${
                  active
                    ? 'glass-tab-active font-bold text-[#191E12] dark:text-white'
                    : 'glass-tab font-medium text-[#191E12]/65 dark:text-white/65 hover:text-[#191E12] dark:hover:text-white'
                }`}
                style={{ borderRadius: 'calc(var(--sona-radius-sm) - 3px)' }}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-[#191E12] dark:bg-white"
                  />
                )}
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Search + Theme Toggle + Local Files Picker */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden md:block w-40 xl:w-52">
            <Search className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск..."
              aria-label="Поиск по медиатеке"
              className="w-full pl-8 pr-3 py-1.5 text-xs glass-plaque text-zinc-950 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-[var(--sona-accent)]"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            />
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="p-2 glass-plaque text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors shrink-0"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenLocalFiles}
            aria-label="Открыть локальные аудиофайлы"
            title="Открыть локальные аудиофайлы (MP3, FLAC, WAV, OGG, M4A)"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/14 transition-colors whitespace-nowrap shrink-0"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Файлы</span>
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden mt-2 max-w-[1260px] mx-auto p-3 glass-elevated space-y-2.5"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск..."
              aria-label="Поиск по медиатеке"
              className="w-full pl-8 pr-3 py-2 text-xs glass-plaque text-zinc-950 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRIMARY_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2 text-left text-xs font-medium ${
                    active
                      ? 'glass-tab-active text-zinc-950 dark:text-white'
                      : 'glass-tab text-zinc-800 dark:text-zinc-200'
                  }`}
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
