import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./contexts/AuthContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import { PlatformAlertProvider } from "./lib/platformAlert";

// Polyfill fetch to prevent Supabase from trying to import @supabase/node-fetch
if (typeof globalThis.fetch === 'undefined') {
  // @ts-ignore
  globalThis.fetch = fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global unhandled-rejection guard
// ─────────────────────────────────────────────────────────────────────────────
// Certain Supabase/edge-function calls (and any fire-and-forget network work)
// can reject with a transient NetworkError ("A network error occurred.",
// "Failed to fetch", "Network request failed", etc.) if the browser loses
// connectivity or a request is racing a page transition.
//
// In most of our callers those errors are already handled (try/catch, offline
// queue, .catch() on the returned promise). But if *any* promise anywhere in
// the tree slips through without a handler, the browser's default behavior
// surfaces it as an uncaught runtime error in the console/error overlay with
// the shape: {"message":"A network error occurred.","name":"NetworkError",
// "_source":"unhandledrejection"}.
//
// This listener silences *only* that class of benign transient transport
// failures and re-raises anything else untouched, so real programming bugs
// still reach developers.
const isBenignNetworkError = (err: any): boolean => {
  if (!err) return false;
  const name = (err.name || '').toString();
  const msg = (err.message || (typeof err === 'string' ? err : '') || '').toString();
  const lower = msg.toLowerCase();
  return (
    name === 'NetworkError' ||
    name === 'AbortError' ||
    name === 'TypeError' && lower.includes('failed to fetch') ||
    lower.includes('a network error occurred') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('signal is aborted')
  );
};

export default function RootLayout() {
  // Install the guard once, on the web only. On native, React Native's own
  // LogBox already handles unhandled rejections; we don't want to touch that.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    const onUnhandledRejection = (event: any) => {
      const reason = event?.reason;
      if (isBenignNetworkError(reason)) {
        // Quiet the browser's default error overlay for transient network
        // blips — the calling code is responsible for user-facing feedback
        // (via the offline queue, retry UI, toasts, etc.).
        if (typeof event?.preventDefault === 'function') {
          event.preventDefault();
        }
        // Still log (at info level) so devs can see it in the console.
        // eslint-disable-next-line no-console
        console.info(
          '[RootLayout] Suppressed benign unhandled network rejection:',
          reason?.message || reason
        );
      }
    };

    const onError = (event: any) => {
      // Some browsers route fetch-level errors through the `error` event
      // rather than `unhandledrejection` — catch those too.
      if (isBenignNetworkError(event?.error)) {
        if (typeof event?.preventDefault === 'function') {
          event.preventDefault();
        }
        // eslint-disable-next-line no-console
        console.info(
          '[RootLayout] Suppressed benign network error event:',
          event?.error?.message || event?.message
        );
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return (
    <AuthProvider>
      <ImpersonationProvider>
        <ViewModeProvider>
          <PlatformAlertProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(client)" options={{ headerShown: false }} />
            </Stack>
          </PlatformAlertProvider>
        </ViewModeProvider>
      </ImpersonationProvider>
    </AuthProvider>
  );
}
