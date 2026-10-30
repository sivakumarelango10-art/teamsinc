import React from 'react';
import { RefreshCw, Sparkles, AlertCircle, ArrowLeft } from 'lucide-react';
import { isChunkLoadError } from '../../utils/lazyWithRetry';

/**
 * Route-Level Error Boundary for Lazy-Loaded Components & Stale Chunk Recovery.
 * Provides a graceful, localized fallback without crashing the entire app shell.
 */
export class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error)
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[TeamSync] ChunkErrorBoundary caught error in route [${this.props.routeName || 'route'}]:`, error, errorInfo);
  }

  handleReload = () => {
    try {
      // Clear all chunk reload guards in sessionStorage before refreshing
      if (typeof window !== 'undefined' && window.sessionStorage) {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith('teamsync_reload_') || key.startsWith('teamsync_chunk_') || key.startsWith('teamsync_preload_')) {
            sessionStorage.removeItem(key);
          }
        });
      }
    } catch {}

    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { routeName = 'Page' } = this.props;

      if (this.state.isChunkError) {
        return (
          <div className="flex-1 min-h-[400px] flex items-center justify-center p-6">
            <div className="w-full max-w-md p-8 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                <Sparkles className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  New Update Available
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  A newer version of <span className="text-white font-medium">{routeName}</span> has been deployed. Please refresh to load the latest features and security updates.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/20 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Update & Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Non-chunk error fallback
      return (
        <div className="flex-1 min-h-[400px] flex items-center justify-center p-6">
          <div className="w-full max-w-md p-8 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Temporary Loading Issue</h3>
              <p className="text-xs text-neutral-400">
                {this.state.error?.message || `Unable to load ${routeName} at this time.`}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium transition"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;

