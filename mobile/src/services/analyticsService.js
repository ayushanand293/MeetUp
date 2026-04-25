/**
 * Lightweight analytics service for product-flow instrumentation.
 *
 * Behavior:
 * - Always logs events in development
 * - Best-effort POST to backend analytics endpoint when available
 * - Never throws; analytics must not break user flows
 */

import client from '../api/client';
import { CLIENT_ANALYTICS_ENABLED } from '../config';

const DEBUG = process.env.NODE_ENV !== 'production';

const ANALYTICS_ENDPOINT = '/analytics/events';

const sanitize = (data = {}) => {
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) return;
    if (typeof value === 'string' && value.length > 512) {
      out[key] = `${value.slice(0, 512)}...`;
      return;
    }
    out[key] = value;
  });
  return out;
};

const track = async (eventName, metadata = {}) => {
  if (!eventName) return;
  if (!CLIENT_ANALYTICS_ENABLED) return;

  const { session_id, sessionId, ...properties } = sanitize(metadata);
  const resolvedSessionId = session_id || sessionId || null;

  const payload = {
    events: [
      {
        event_name: eventName,
        session_id: resolvedSessionId,
        properties: {
          ...properties,
          ts: new Date().toISOString(),
        },
      },
    ],
  };

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[Analytics]', payload);
  }

  try {
    await client.post(ANALYTICS_ENDPOINT, payload);
  } catch (_) {
    // Endpoint is optional for now; ignore failures.
  }
};

const analyticsService = {
  track,
};

export default analyticsService;
