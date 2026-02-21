import { datadogRum } from '@datadog/browser-rum';
import logger from './logger';
import type { HelpLevel } from '../types/auth';

export interface TooltipOpenedAnalyticsEvent {
  tooltipId: string;
  helpLevel: HelpLevel;
  route: string;
  flow: 'mint' | 'securityMint' | 'swap' | 'pool' | 'orbital';
  component: string;
}

export function trackTooltipOpened(event: TooltipOpenedAnalyticsEvent): void {
  try {
    datadogRum.addAction('tooltip_opened', {
      eventName: 'tooltip_opened',
      tooltipId: event.tooltipId,
      helpLevel: event.helpLevel,
      route: event.route,
      flow: event.flow,
      component: event.component,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('Failed to send tooltip_opened analytics event', {
      tooltipId: event.tooltipId,
      error,
    });
  }
}
