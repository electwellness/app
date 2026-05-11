import { createClient } from '@supabase/supabase-js';

// WebSocket shim for Node.js build environments (Expo web static export).
// Supabase Realtime requires a WebSocket constructor at client creation time.
// In the browser/React Native runtime, a real WebSocket exists and this is a no-op.
if (typeof globalThis.WebSocket === 'undefined') {
  class NoopWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  (globalThis as any).WebSocket = NoopWebSocket;
}

// Initialize database client
// Credentials are read from environment variables (EXPO_PUBLIC_* are inlined at build time).
// Configure these in Vercel: Project Settings → Environment Variables.
// For local development, place them in a `.env` file at the project root.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (
  !process.env.EXPO_PUBLIC_SUPABASE_URL ||
  !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
) {
  console.warn(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Using placeholder values — set the real ones in Vercel → Project Settings → ' +
      'Environment Variables (or a local .env file) for the app to actually connect.'
  );
}


/**
 * Custom fetch wrapper with automatic retry for transient network failures.
 * Handles "Failed to fetch" (Status 0) errors that occur when the server is
 * temporarily unreachable due to DNS hiccups, cold starts, or CORS pre-flight issues.
 *
 * IMPORTANT: Does NOT add its own AbortController/timeout — the browser and
 * Supabase client already manage request timeouts. Adding a second
 * AbortController caused "signal is aborted without reason" errors.
 */
const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 800;

  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Use the native fetch directly — no extra AbortController.
      // The caller (Supabase client) may pass its own signal via init.signal.
      const response = await fetch(input, init);
      return response;
    } catch (err: any) {
      lastError = err;

      // If the caller explicitly aborted (e.g. component unmount, user cancel),
      // do NOT retry — propagate immediately.
      if (err?.name === 'AbortError') {
        throw err;
      }

      // Only retry on network-level transport failures:
      //   - TypeError: "Failed to fetch" (browser could not reach the server)
      //   - "NetworkError" / "Network request failed" (React Native)
      const msg = err?.message || '';
      const isTransientNetworkError =
        (err?.name === 'TypeError' && msg.includes('Failed to fetch')) ||
        msg.includes('NetworkError') ||
        msg.includes('Network request failed');

      if (!isTransientNetworkError || attempt >= MAX_RETRIES - 1) {
        throw err;
      }

      // Exponential backoff: 800ms, 1600ms, 3200ms
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(
        `[Supabase] Network error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms...`,
        msg
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithRetry,
  },
});

export { supabase };

