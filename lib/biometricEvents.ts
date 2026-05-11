/**
 * Lightweight event bus for biometric data updates.
 *
 * When a trainer (or client) completes a biometric assessment via
 * BiometricEntryForm, the form calls `emitBiometricsUpdated(userId)`.
 *
 * Any screen that displays biometric data (client dashboard, biometrics
 * tab, ClientDetailModal, etc.) subscribes via `onBiometricsUpdated(cb)`
 * and re-fetches its data when the event fires.
 */

type Listener = (userId: string) => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to biometric-update events.
 * Returns an unsubscribe function (call it in useEffect cleanup).
 */
export function onBiometricsUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Emit a biometric-update event for a given user.
 * All active listeners will be called with the userId.
 */
export function emitBiometricsUpdated(userId: string): void {
  listeners.forEach((listener) => {
    try {
      listener(userId);
    } catch (err) {
      console.error('[biometricEvents] listener error:', err);
    }
  });
}
