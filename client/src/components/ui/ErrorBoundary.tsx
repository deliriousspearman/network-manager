import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    this.setState({ errorInfo: info.componentStack ?? null });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  copyError = async () => {
    const err = this.state.error;
    if (!err) return;
    const text = [
      `Error: ${err.message}`,
      err.stack ? `\nStack:\n${err.stack}` : '',
      this.state.errorInfo ? `\nComponent stack:${this.state.errorInfo}` : '',
      `\nURL: ${window.location.href}`,
      `User agent: ${navigator.userAgent}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard API can be denied (insecure context, permission); fall back to selection.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); this.setState({ copied: true }); setTimeout(() => this.setState({ copied: false }), 2000); }
      finally { document.body.removeChild(ta); }
    }
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error ?? new Error('Unknown error');
      if (this.props.fallback) {
        return this.props.fallback(err, this.reset);
      }
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {err.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                this.reset();
                window.location.reload();
              }}
            >
              Reload Page
            </button>
            <button
              className="btn btn-secondary"
              onClick={this.copyError}
              title="Copy the error message and stack to your clipboard so you can paste it into a bug report."
            >
              {this.state.copied ? 'Copied' : 'Copy error'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
