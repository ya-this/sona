import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Непредвиденная ошибка интерфейса',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Sona UI error:', error, info);
  }

  private handleResetAndReload = () => {
    try {
      const keysToClear: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sona_')) {
          keysToClear.push(k);
        }
      }
      for (const k of keysToClear) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // Ignore restricted storage mode
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-black text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-[#0e0e0e] p-6 space-y-4">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Восстановление сеанса
              </p>
              <h1 className="text-xl font-bold text-white">
                Произошёл сбой отображения
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {this.state.errorMessage}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white text-black hover:opacity-90 transition-opacity"
              >
                Сбросить кэш и перезапустить
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-white/20 text-zinc-200 hover:bg-white/10 transition-colors"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
