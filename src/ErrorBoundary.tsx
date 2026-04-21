import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--app-bg)] px-6 text-center text-[var(--app-text)]">
          <p className="text-lg font-medium">Something went wrong</p>
          <pre className="max-w-full overflow-auto rounded border border-red-900/50 bg-red-950/30 p-4 text-left text-xs text-red-200">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded bg-[var(--app-accent)] px-4 py-2 text-sm text-white hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
