/**
 * PHP & MySQL Backend API Client Service
 * Designed for cPanel, Shared Hosting, or standard LAMP/LEMP stacks.
 * Replaces Firebase with direct PHP REST endpoints & real-time WebSocket/EventSource sync.
 */

export interface PhpConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey?: string;
}

const DEFAULT_API_URL = '/api/php_sync.php';

export function getPhpConfig(): PhpConfig {
  let savedApiUrl = '';
  let savedWsUrl = '';
  let savedApiKey = '';

  try {
    if (typeof localStorage !== 'undefined') {
      savedApiUrl = localStorage.getItem('tradecore_php_api_url') || '';
      savedWsUrl = localStorage.getItem('tradecore_php_ws_url') || '';
      savedApiKey = localStorage.getItem('tradecore_php_api_key') || '';
    }
  } catch (e) {}

  const apiUrl = savedApiUrl || (import.meta as any).env?.VITE_PHP_API_URL || DEFAULT_API_URL;
  const wsUrl = savedWsUrl || (import.meta as any).env?.VITE_PHP_WS_URL || '';

  return {
    apiUrl,
    wsUrl,
    apiKey: savedApiKey
  };
}

export function savePhpConfig(config: Partial<PhpConfig>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (config.apiUrl !== undefined) localStorage.setItem('tradecore_php_api_url', config.apiUrl);
      if (config.wsUrl !== undefined) localStorage.setItem('tradecore_php_ws_url', config.wsUrl);
      if (config.apiKey !== undefined) localStorage.setItem('tradecore_php_api_key', config.apiKey);
    }
  } catch (e) {
    console.error('Failed to save PHP config:', e);
  }
}

/**
 * Fetch unified system state from PHP backend
 */
export async function fetchSystemDataFromPhp(): Promise<any | null> {
  const { apiUrl, apiKey } = getPhpConfig();
  if (!apiUrl) return null;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(`${apiUrl}?action=get_state`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      console.warn(`[PHP API] Server returned status ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (result && result.success && result.data) {
      return result.data;
    } else if (result && !result.error) {
      return result;
    }
    return null;
  } catch (error) {
    console.warn('[PHP API] Unable to connect to PHP backend:', error);
    return null;
  }
}

/**
 * Save unified system state to PHP backend
 */
export async function saveSystemDataToPhp(data: any): Promise<boolean> {
  const { apiUrl, apiKey } = getPhpConfig();
  if (!apiUrl) return false;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const payload = {
      action: 'save_state',
      data: data,
      lastUpdated: new Date().toISOString()
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[PHP API] Save failed with HTTP ${response.status}`);
      return false;
    }

    const result = await response.json();
    return !!(result && (result.success || result.status === 'ok'));
  } catch (error) {
    console.error('[PHP API] Error saving data to PHP backend:', error);
    return false;
  }
}

/**
 * Connect to WebSocket or Server-Sent Events (SSE) server on PHP host for multi-device real-time sync
 */
let activeWebSocket: WebSocket | null = null;
let activeEventSource: EventSource | null = null;

export function connectPhpRealtimeSync(onUpdateCallback: (data: any) => void): () => void {
  const { apiUrl, wsUrl } = getPhpConfig();

  // 1. Attempt WebSocket if wsUrl is provided
  if (wsUrl && typeof WebSocket !== 'undefined') {
    try {
      if (activeWebSocket) {
        activeWebSocket.close();
      }
      const ws = new WebSocket(wsUrl);
      activeWebSocket = ws;

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message && message.type === 'STATE_UPDATE' && message.data) {
            onUpdateCallback(message.data);
          }
        } catch (e) {
          console.error('[PHP Realtime] Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('[PHP Realtime] WebSocket connection warning:', err);
      };

      return () => {
        if (ws) {
          ws.close();
          activeWebSocket = null;
        }
      };
    } catch (err) {
      console.warn('[PHP Realtime] Failed to initialize WebSocket:', err);
    }
  }

  // 2. Fallback to PHP Server-Sent Events (SSE) if supported by cPanel backend
  if (apiUrl && typeof EventSource !== 'undefined') {
    try {
      if (activeEventSource) {
        activeEventSource.close();
      }
      const sseUrl = `${apiUrl}?action=stream_updates`;
      const sse = new EventSource(sseUrl);
      activeEventSource = sse;

      sse.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message && message.data) {
            onUpdateCallback(message.data);
          }
        } catch (e) {
          console.error('[PHP Realtime SSE] Error parsing SSE event:', e);
        }
      };

      sse.onerror = () => {
        sse.close();
      };

      return () => {
        if (sse) {
          sse.close();
          activeEventSource = null;
        }
      };
    } catch (e) {
      console.warn('[PHP Realtime SSE] SSE unavailable:', e);
    }
  }

  return () => {};
}
