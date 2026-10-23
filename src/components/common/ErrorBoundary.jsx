import React from 'react';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

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
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
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
