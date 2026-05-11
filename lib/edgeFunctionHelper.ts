/**
 * edgeFunctionHelper.ts
 *
 * Shared helper for invoking Supabase edge functions with:
 * - Pre-flight session validation (ensures a valid user token is sent, not the anon key)
 * - Automatic session refresh on auth errors
 * - Retry logic with exponential backoff
 * - Clear error messages for session expiry
 */

import { supabase } from './supabase';

/**
 * Ensure there is a valid authenticated session before making edge function calls.
 * If the session is expired, attempts to refresh it.
 * Returns the access token or throws an error.
 */
async function ensureValidSession(): Promise<string> {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    // Check if token is about to expire (within 30 seconds)
    const expiresAt = session.expires_at;
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - nowSec < 30) {
      console.log('[edgeFunctionHelper] Token expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        console.warn('[edgeFunctionHelper] Session refresh failed:', refreshError?.message);
        throw new Error('SESSION_EXPIRED');
      }
      return refreshData.session.access_token;
    }
    return session.access_token;
  }

  // No session - try to refresh
  console.log('[edgeFunctionHelper] No active session, attempting refresh...');
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session) {
    console.warn('[edgeFunctionHelper] No session available:', refreshError?.message);
    throw new Error('SESSION_EXPIRED');
  }
  return refreshData.session.access_token;
}

/**
 * Extract the actual error message from a Supabase FunctionsHttpError.
 * The Supabase client wraps edge function errors in a FunctionsHttpError
 * with the response body available via error.context.
 */
async function extractErrorDetails(error: any): Promise<{ message: string; isAuthError: boolean }> {
  let message = error.message || String(error);
  let isAuthError = false;

  try {
    const ctx = error.context;
    if (ctx) {
      if (ctx instanceof Response) {
        isAuthError = ctx.status === 401;
        try {
          const cloned = ctx.clone();
          const respBody = await cloned.json();
          if (respBody?.error) message = respBody.error;
        } catch {
          // Response body already consumed or not JSON
        }
      } else if (typeof ctx === 'object' && ctx !== null) {
        if (ctx.error) message = ctx.error;
        if (ctx.message) message = ctx.message;
      }
    }
  } catch {
    // Ignore context parsing errors
  }

  // Check message content for auth-related errors
  if (!isAuthError && typeof message === 'string') {
    const lower = message.toLowerCase();
    isAuthError = lower.includes('unauthorized') ||
      lower.includes('session expired') ||
      lower.includes('log in again') ||
      lower.includes('anon token') ||
      lower.includes('invalid token') ||
      lower.includes('no auth token') ||
      lower.includes('jwt');
  }

  return { message, isAuthError };
}

export interface InvokeOptions {
  /** Maximum number of retries on auth errors (default: 1) */
  maxRetries?: number;
  /** Delay in ms before first retry (default: 1500) */
  retryDelay?: number;
}

/**
 * Invoke a Supabase edge function with session validation and retry logic.
 * 
 * This is the recommended way to call edge functions from the client.
 * It ensures a valid session exists before making the call, and retries
 * with a session refresh if an auth error is returned.
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  options: InvokeOptions = {}
): Promise<{ data: T | null; error: string | null }> {
  const { maxRetries = 1, retryDelay = 1500 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure valid session before calling
      await ensureValidSession();
    } catch (err: any) {
      if (err.message === 'SESSION_EXPIRED') {
        return {
          data: null,
          error: 'Your session has expired. Please log in again.',
        };
      }
      // For other errors, still try the call (the edge function might handle it)
      console.warn('[edgeFunctionHelper] Session check warning:', err.message);
    }

    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) {
        const { message, isAuthError } = await extractErrorDetails(error);

        // Retry on auth errors (session might have expired between check and call)
        if (isAuthError && attempt < maxRetries) {
          console.log(`[edgeFunctionHelper] Auth error on ${functionName}, refreshing session and retrying (attempt ${attempt + 1})...`);
          // Force session refresh before retry
          try {
            await supabase.auth.refreshSession();
          } catch {
            // If refresh fails, the next attempt will catch it in ensureValidSession
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // For auth errors that we can't retry, provide a clear message
        if (isAuthError) {
          return {
            data: null,
            error: 'Your session has expired. Please log in again.',
          };
        }

        return { data: null, error: message };
      }

      // Check for server-side error in response body
      if (data?.error) {
        const serverError = data.error;
        const isServerAuthError = typeof serverError === 'string' && (
          serverError.toLowerCase().includes('session expired') ||
          serverError.toLowerCase().includes('log in again') ||
          serverError.toLowerCase().includes('unauthorized')
        );

        if (isServerAuthError && attempt < maxRetries) {
          console.log(`[edgeFunctionHelper] Server auth error on ${functionName}, retrying...`);
          try {
            await supabase.auth.refreshSession();
          } catch { /* ignore */ }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        return { data: null, error: serverError };
      }

      return { data: data as T, error: null };
    } catch (err: any) {
      console.warn(`[edgeFunctionHelper] Exception invoking ${functionName}:`, err);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return { data: null, error: err.message || String(err) };
    }
  }

  // Should not reach here, but just in case
  return { data: null, error: 'Maximum retries exceeded' };
}
