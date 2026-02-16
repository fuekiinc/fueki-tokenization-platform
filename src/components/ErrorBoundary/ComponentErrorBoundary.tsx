import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Props & State
// ---------------------------------------------------------------------------

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI rendered when an error is caught. */
  fallback?: ReactNode;
  /**
   * Optional label for identifying this boundary in error logs.
   * Helps distinguish which section of the app threw.
   */
  name?: string;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// ComponentErrorBoundary
//
// A reusable class component that catches render errors in its subtree and
// shows a user-friendly fallback UI with a retry button. Use this around
// individual features (charts, forms, exchange panels, modals) so that a
// single component failure does not crash the entire application.
//
// Usage:
//   <ComponentErrorBoundary name="PortfolioChart">
//     <PortfolioChart data={data} />
//   </ComponentErrorBoundary>
//
//   <ComponentErrorBoundary fallback={<EmptyState message="Chart unavailable" />}>
//     <ValueChart />
//   </ComponentErrorBoundary>
// ---------------------------------------------------------------------------

export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  state: ComponentErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.name ? ` [${this.props.name}]` : '';
    // In production, send this to an error tracking service (Sentry, Datadog).
    console.error(
      `ComponentErrorBoundary${label} caught an error:`,
      error,
      info.componentStack,
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback was provided, render it instead.
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // Default fallback UI.
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center max-w-md w-full">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <p className="text-base font-semibold text-red-400 mb-1">
              Something went wrong
            </p>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              This section encountered an unexpected error.
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                />
              </svg>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
