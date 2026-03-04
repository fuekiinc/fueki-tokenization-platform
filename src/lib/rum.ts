import logger from './logger';

type RumContext = Record<string, unknown>;
type RumErrorEvent = { error: Error; context: RumContext };
type RumActionEvent = { name: string; context: RumContext };
type RumClient = {
  addAction: (name: string, context?: RumContext) => void;
  addError: (error: Error, context?: RumContext) => void;
  init: (config: Record<string, unknown>) => void;
};

const ddAppId = import.meta.env.VITE_DD_APPLICATION_ID as string | undefined;
const ddClientToken = import.meta.env.VITE_DD_CLIENT_TOKEN as string | undefined;

let rumClient: RumClient | null = null;
let rumInitPromise: Promise<RumClient | null> | null = null;
const pendingErrors: RumErrorEvent[] = [];
const pendingActions: RumActionEvent[] = [];

function flushQueues() {
  if (!rumClient) return;

  for (const event of pendingErrors.splice(0)) {
    rumClient.addError(event.error, event.context);
  }

  for (const event of pendingActions.splice(0)) {
    rumClient.addAction(event.name, event.context);
  }
}

async function loadRumClient(): Promise<RumClient | null> {
  if (!ddAppId || !ddClientToken) {
    return null;
  }

  if (rumClient) {
    return rumClient;
  }

  if (rumInitPromise) {
    return rumInitPromise;
  }

  rumInitPromise = (async () => {
    try {
      const { datadogRum } = await import('@datadog/browser-rum');
      datadogRum.init({
        applicationId: ddAppId,
        clientToken: ddClientToken,
        site: (import.meta.env.VITE_DD_SITE as string) || 'us5.datadoghq.com',
        service: 'fueki-frontend',
        env: (import.meta.env.VITE_DD_ENV as string) || (import.meta.env.DEV ? 'dev' : 'prod'),
        version: '0.1.0',
        sessionSampleRate: 100,
        sessionReplaySampleRate: 20,
        trackBfcacheViews: true,
        defaultPrivacyLevel: 'mask-user-input',
      });

      rumClient = datadogRum as unknown as RumClient;
      flushQueues();
      return rumClient;
    } catch (error) {
      logger.warn('[telemetry] Failed to initialize Datadog RUM', error);
      return null;
    }
  })();

  const loaded = await rumInitPromise;
  if (!loaded) {
    rumInitPromise = null;
  }
  return loaded;
}

export function initRumDeferred(delayMs = 1500) {
  if (!ddAppId || !ddClientToken) {
    return;
  }
  window.setTimeout(() => {
    void loadRumClient();
  }, delayMs);
}

export function addRumError(error: Error, context: RumContext = {}) {
  if (rumClient) {
    rumClient.addError(error, context);
    return;
  }

  pendingErrors.push({ error, context });
  void loadRumClient();
}

export function addRumAction(name: string, context: RumContext = {}) {
  if (rumClient) {
    rumClient.addAction(name, context);
    return;
  }

  pendingActions.push({ name, context });
  void loadRumClient();
}
