/**
 * ComponentErrorBoundary
 *
 * A production-grade error boundary that catches render errors in its
 * subtree and displays a fallback UI with recovery options. Supports
 * three visual variants:
 *
 *   - "section"  (default) -- card-style fallback for dashboard panels,
 *                              charts, and form sections
 *   - "full-page"          -- centered full-viewport fallback for route-
 *                              level boundaries
 *   - "inline"             -- minimal inline message for small widgets
 *
 * Usage:
 *   <ComponentErrorBoundary name="PortfolioChart">
 *     <PortfolioChart data={data} />
 *   </ComponentErrorBoundary>
 *
 *   <ComponentErrorBoundary variant="inline" name="PriceWidget">
 *     <PriceWidget />
 *   </ComponentErrorBoundary>
 *
 *   <ComponentErrorBoundary
 *     variant="full-page"
 *     onError={(err) => trackError(err)}
 *   >
 *     <Outlet />
 *   </ComponentErrorBoundary>
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import logger from '../../lib/logger';
import { classifyError, errorToString } from '../../lib/errorUtils';
import type { ClassifiedError } from '../../lib/errorUtils';

// ---------------------------------------------------------------------------
// Props & State
// ---------------------------------------------------------------------------

export type ErrorBoundaryVariant = 'section' | 'full-page' | 'inline';

export interface ComponentErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI rendered when an error is caught. */
  fallback?: ReactNode;
  /**
   * Optional label for identifying this boundary in error logs.
   * Helps distinguish which section of the app threw.
   */
  name?: string;
  /**
   * Visual variant of the default fallback UI.
   * @default "section"
   */
  variant?: ErrorBoundaryVariant;
  /**
   * Callback invoked when an error is caught. Useful for analytics
   * or external error tracking beyond the built-in logger.
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  classified: ClassifiedError | null;
}

// ---------------------------------------------------------------------------
// ComponentErrorBoundary
// ---------------------------------------------------------------------------

export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  state: ComponentErrorBoundaryState = {
    hasError: false,
    error: null,
    classified: null,
  };

  static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
    return {
      hasError: true,
      error,
      classified: classifyError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.name ? ` [${this.props.name}]` : '';
    logger.error(
      `ComponentErrorBoundary${label} caught an error:`,
      error,
      info.componentStack,
    );

    // Forward to external tracking callback if provided.
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, classified: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleReportIssue = () => {
    const subject = encodeURIComponent(
      `Bug Report: ${this.props.name ?? 'UI Error'}`,
    );
    const body = encodeURIComponent(
      [
        `Error: ${errorToString(this.state.error)}`,
        `Component: ${this.props.name ?? 'Unknown'}`,
        `URL: ${window.location.href}`,
        `Time: ${new Date().toISOString()}`,
        `User Agent: ${navigator.userAgent}`,
      ].join('\n'),
    );
    window.open(
      `mailto:mark@fueki-tech.com?subject=${subject}&body=${body}`,
      '_blank',
    );
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // If a custom fallback was provided, render it instead.
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const variant = this.props.variant ?? 'section';

    switch (variant) {
      case 'full-page':
        return this.renderFullPage();
      case 'inline':
        return this.renderInline();
      case 'section':
      default:
        return this.renderSection();
    }
  }

  // ---- Full-page fallback ----
  private renderFullPage() {
    const classified = this.state.classified;
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-[#0D0F14]/80 backdrop-blur-xl p-8 text-center shadow-2xl">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
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

          {/* Title */}
          <h2 className="text-lg font-semibold text-white mb-2">
            Something went wrong
          </h2>

          {/* Message */}
          <p className="text-sm text-gray-400 mb-1">
            {classified?.message ?? 'An unexpected error occurred in this section.'}
          </p>

          {/* Suggested action */}
          {classified?.suggestedAction && (
            <p className="text-xs text-gray-500 mb-6">
              {classified.suggestedAction}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-5 py-2.5 text-sm font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20"
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

            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Reload page
            </button>

            <button
              onClick={this.handleReportIssue}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
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
                  d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.117-1.329-.822-2.605-2.055-2.605a1.5 1.5 0 0 0-1.5 1.5v.034A7.503 7.503 0 0 1 12 6a7.503 7.503 0 0 1-3.5.834v-.034a1.5 1.5 0 0 0-1.5-1.5c-1.233 0-1.938 1.276-2.055 2.605a23.91 23.91 0 0 1-1.152 6.135A24.1 24.1 0 0 1 12 12.75Z"
                />
              </svg>
              Report issue
            </button>
          </div>

          {/* Error details (collapsible) */}
          <details className="text-left">
            <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-400 transition-colors select-none">
              Error details
            </summary>
            <pre className="mt-3 rounded-xl bg-black/30 border border-white/[0.04] p-4 text-xs text-amber-300/80 overflow-x-auto whitespace-pre-wrap break-all max-h-40 scrollbar-thin">
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  // ---- Section fallback (default) ----
  private renderSection() {
    const classified = this.state.classified;
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="rounded-2xl border border-red-500/20 bg-[#0D0F14]/80 backdrop-blur-xl p-6 text-center max-w-md w-full shadow-lg">
          {/* Icon */}
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
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

          {/* Title */}
          <p className="text-base font-semibold text-red-400 mb-1">
            Something went wrong
          </p>

          {/* Message */}
          <p className="text-sm text-gray-400 mb-1">
            {classified?.message ?? 'This section encountered an unexpected error.'}
          </p>

          {/* Suggested action */}
          {classified?.suggestedAction && (
            <p className="text-xs text-gray-500 mb-4">
              {classified.suggestedAction}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
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

            <button
              onClick={this.handleReportIssue}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
            >
              Report issue
            </button>
          </div>

          {/* Error details (collapsible) */}
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-400 transition-colors select-none">
              Error details
            </summary>
            <pre className="mt-2 rounded-lg bg-black/30 border border-white/[0.04] p-3 text-xs text-amber-300/80 overflow-x-auto whitespace-pre-wrap break-all max-h-32 scrollbar-thin">
              {this.state.error?.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  // ---- Inline fallback ----
  private renderInline() {
    const classified = this.state.classified;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
        {/* Icon */}
        <svg
          className="h-4 w-4 shrink-0 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>

        <span className="flex-1 text-sm text-red-400">
          {classified?.message ?? 'Error loading this content.'}
        </span>

        <button
          onClick={this.handleRetry}
          className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          Retry
        </button>
      </div>
    );
  }
}

export default ComponentErrorBoundary;
