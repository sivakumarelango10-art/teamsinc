import React from 'react';
import { RefreshCw, AlertTriangle, Home, Sparkles } from 'lucide-react';
import { isChunkLoadError } from '../../utils/lazyWithRetry';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('TeamSinc Uncaught Application Error:', error, errorInfo);
  }

  handleReload = () => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith('teamsync_reload_') || key.startsWith('teamsync_preload_')) {
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
      const isChunk = isChunkLoadError(this.state.error);

      if (isChunk) {
        return (
          <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6 shadow-xl">
              <Sparkles className="w-8 h-8" />
            </div>

            <h1 className="text-xl md:text-2xl font-black tracking-tight mb-2">
              New Update Available
            </h1>
            <p className="text-xs md:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
              TeamSync has been updated with new features and improvements. Please reload to activate the latest release.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                Reload TeamSync
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Go to Home
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-red-400 mb-6 shadow-xl">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h1 className="text-xl md:text-2xl font-black tracking-tight mb-2">
            Something unexpected occurred
          </h1>
          <p className="text-xs md:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
            TeamSinc encountered a temporary glitch. We have protected your session and state.
          </p>

          {this.state.error?.message && (
            <div className="mb-6 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-left max-w-lg w-full text-xs font-mono text-neutral-400 overflow-x-auto">
              <span className="text-red-400 font-bold">Error:</span> {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              Reload TeamSinc
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
