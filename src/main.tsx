import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AutoConnect, ThirdwebProvider } from 'thirdweb/react'
import './index.css'
import App from './App'
import { datadogRum } from '@datadog/browser-rum'
import logger from './lib/logger'
import { classifyError } from './lib/errorUtils'
import {
  getThirdwebAppMetadata,
  THIRDWEB_DEFAULT_CHAIN,
  THIRDWEB_WALLETS,
  thirdwebClient,
} from './lib/thirdweb'
import { WalletConnectionController } from './wallet/WalletConnectionController'


datadogRum.init({
    applicationId: '1ba97554-02c8-446b-acc7-89d85d2b7295',
    clientToken: 'pub0ae646ad664e439de9f2ec075d7f69ae',
    site: 'us5.datadoghq.com',
    service: 'fueki-frontend',
    env: 'prod',
    version: '0.1.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackBfcacheViews: true,
    defaultPrivacyLevel: 'mask-user-input',
})

// ---------------------------------------------------------------------------
// Global error handlers
//
// These catch errors that escape React's error boundary system:
//   - Unhandled promise rejections (e.g. forgotten awaits, background tasks)
//   - Uncaught exceptions in event handlers and async callbacks
//
// All errors are logged via the structured logger and forwarded to Datadog
// RUM so they appear in monitoring dashboards.
// ---------------------------------------------------------------------------

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const classified = classifyError(event.reason)
  logger.error(
    `[global] Unhandled promise rejection [${classified.category}]: ${classified.message}`,
    event.reason,
  )
  datadogRum.addError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
    source: 'unhandledrejection',
    category: classified.category,
    severity: classified.severity,
  })
  // Do NOT call event.preventDefault() -- let the browser log it in the
  // console as well so developers see it during local development.
})

window.addEventListener('error', (event: ErrorEvent) => {
  // Ignore ResizeObserver errors (benign browser noise).
  if (event.message?.includes('ResizeObserver')) return

  const classified = classifyError(event.error ?? event.message)
  logger.error(
    `[global] Uncaught error [${classified.category}]: ${classified.message}`,
    event.error,
  )
  datadogRum.addError(event.error instanceof Error ? event.error : new Error(event.message), {
    source: 'window.onerror',
    category: classified.category,
    severity: classified.severity,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

// ---------------------------------------------------------------------------
// Root error boundary
//
// This is the outermost safety net. It catches unhandled React render
// errors that escape all inner ComponentErrorBoundary instances. The
// fallback UI is styled with inline styles (no Tailwind dependency) so
// it renders correctly even if CSS fails to load.
// ---------------------------------------------------------------------------

interface EBState {
  error: Error | null
}

class RootErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('[RootErrorBoundary] caught an error:', error, info.componentStack)
    datadogRum.addError(error, {
      source: 'RootErrorBoundary',
      componentStack: info.componentStack ?? '',
    })
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  private handleReportIssue = () => {
    const error = this.state.error
    const subject = encodeURIComponent('Bug Report: Application Crash')
    const body = encodeURIComponent(
      [
        `Error: ${error?.message ?? 'Unknown'}`,
        `URL: ${window.location.href}`,
        `Time: ${new Date().toISOString()}`,
        `User Agent: ${navigator.userAgent}`,
      ].join('\n'),
    )
    window.open(`mailto:mark@fueki-tech.com?subject=${subject}&body=${body}`, '_blank')
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 40,
            maxWidth: 560,
            margin: '80px auto',
            background: '#0D0F14',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 16,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              borderRadius: 16,
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f87171"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>

          <h2 style={{ color: '#f87171', margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#9CA3AF', margin: '0 0 8px', fontSize: 14, lineHeight: 1.5 }}>
            An unexpected error crashed the application.
          </p>
          <p style={{ color: '#6B7280', margin: '0 0 24px', fontSize: 13 }}>
            You can try again or reload the page. If the problem persists, please report it.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 24px',
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#818CF8',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#9CA3AF',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Reload page
            </button>
            <button
              onClick={this.handleReportIssue}
              style={{
                padding: '10px 24px',
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#9CA3AF',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Report issue
            </button>
          </div>

          <details style={{ textAlign: 'left' }}>
            <summary
              style={{
                color: '#4B5563',
                cursor: 'pointer',
                fontSize: 12,
                userSelect: 'none',
              }}
            >
              Error details
            </summary>
            <pre
              style={{
                marginTop: 12,
                padding: 16,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'rgba(253, 230, 138, 0.8)',
                fontSize: 12,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThirdwebProvider>
        {thirdwebClient && (
          <AutoConnect
            client={thirdwebClient}
            wallets={THIRDWEB_WALLETS}
            appMetadata={getThirdwebAppMetadata()}
            chain={THIRDWEB_DEFAULT_CHAIN}
          />
        )}
        <WalletConnectionController />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThirdwebProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
