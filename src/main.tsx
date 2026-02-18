import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { datadogRum } from '@datadog/browser-rum';


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
});
// ---------------------------------------------------------------------------
// Root error boundary -- catches unhandled React render errors.
//
// This is the outermost safety net. Granular ComponentErrorBoundary instances
// should be used around individual features (charts, forms, exchange panels)
// so that a single component failure does not crash the entire application.
// ---------------------------------------------------------------------------

interface EBState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    datadogRum.addError(error, {
      source: 'ErrorBoundary',
      componentStack: info.componentStack ?? '',
    });
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 800, margin: '40px auto', background: '#1a1a2e', border: '1px solid #ff4444', borderRadius: 12, fontFamily: 'sans-serif', color: '#fff' }}>
          <h2 style={{ color: '#ff4444', margin: '0 0 16px' }}>Something went wrong</h2>
          <p style={{ color: '#ccc', margin: '0 0 16px', fontSize: 14 }}>
            An unexpected error occurred. You can try again or reload the page.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '8px 20px',
                background: '#ff4444',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
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
                padding: '8px 20px',
                background: 'transparent',
                color: '#aaa',
                border: '1px solid #444',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Reload page
            </button>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ color: '#888', cursor: 'pointer', fontSize: 13 }}>
              Error details
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#ffa', fontSize: 13, marginTop: 8 }}>
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
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
