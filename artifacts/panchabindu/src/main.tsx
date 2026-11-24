import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { initClientObservability } from '@/lib/observability/sentry';
import { installLifecycle } from '@/lib/analytics/tracker';

import './index.css';

// Fire-and-forget: loads the SDK chunk only when VITE_SENTRY_DSN is configured at build time.
void initClientObservability();

// First-party analytics lifecycle (idle/visibility/beacon/error hooks). Consent-gated
// internally; registering listeners is passive and sends nothing by itself.
installLifecycle();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
