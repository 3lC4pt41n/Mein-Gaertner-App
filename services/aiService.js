import { supabase } from '../supabase';
import { requestWithPolicy } from './networkPolicy';

function isAuthFailure(error, parsed) {
  // Only treat as auth failure when we have strong signals.
  // NEVER match on vague substrings like 'session' – too many false positives.
  const status = parsed?.status || error?.status || error?.context?.status;
  const code = parsed?.code || error?.code;
  if (status === 401 || code === 'UNAUTHORIZED' || code === 'AUTH_REQUIRED') return true;
  const msg = `${parsed?.error || ''} ${error?.message || ''}`.toLowerCase();
  return (
    msg.includes('unauthorized') ||
    msg.includes('not authenticated') ||
    msg.includes('nicht authentifiziert') ||
    msg.includes('nicht eingeloggt') ||
    msg.includes('invalid token') ||
    msg.includes('token expired')
  );
}

async function getSessionWithRefresh({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session;
  }

  if (typeof supabase.auth.refreshSession === 'function') {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session?.access_token) return data.session;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeEdge(functionName, body, accessToken, { useExplicitAuthHeader = false } = {}) {
  const invokeOptions = { body };
  if (useExplicitAuthHeader && accessToken) {
    invokeOptions.headers = {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  return requestWithPolicy(() => supabase.functions.invoke(functionName, invokeOptions), {
    timeout: 45000,
    retries: 1,
    label: `ai.${functionName}`,
  });
}

async function parseInvokeError(error) {
  let parsed;
  let contextText = '';

  try {
    if (error?.context && typeof error.context.clone === 'function') {
      const cloned = error.context.clone();
      if (typeof cloned.json === 'function') {
        try {
          parsed = await cloned.json();
        } catch {
          contextText = (await cloned.text()) || '';
          try {
            parsed = JSON.parse(contextText);
          } catch {
            parsed = null;
          }
        }
      } else if (typeof error.context.json === 'function') {
        parsed = await error.context.json();
      }
    } else if (error?.context && typeof error.context.json === 'function') {
      parsed = await error.context.json();
    } else if (typeof error?.context === 'string') {
      contextText = error.context;
      try {
        parsed = JSON.parse(error.context);
      } catch {
        parsed = null;
      }
    } else if (error?.context && typeof error.context === 'object') {
      parsed = error.context;
    }
  } catch {
    parsed = null;
  }

  const firstDetail =
    Array.isArray(parsed?.details) && parsed.details.length > 0
      ? parsed.details.find((d) => d?.message)?.message || null
      : null;

  return { parsed, contextText, firstDetail };
}

// Helper: Edge Function aufrufen über den Supabase Client.
// Authorization wird explizit gesetzt, um Auth-Races in RN zu vermeiden.
// Wrapped with requestWithPolicy for timeout + retry on transient failures.
async function callEdgeFunction(functionName, body) {
  // Warm-up: camera resume can briefly race with session hydration in AsyncStorage.
  let session = await getSessionWithRefresh();
  let accessToken = session?.access_token || null;

  // If session isn't ready yet, force one refresh attempt before first invoke.
  if (!accessToken) {
    session = await getSessionWithRefresh({ forceRefresh: true });
    accessToken = session?.access_token || null;
  }

  if (!accessToken) {
    const err = new Error('Nicht eingeloggt');
    err.code = 'AUTH_REQUIRED';
    err.status = 401;
    throw err;
  }

  // AI calls get a generous timeout (image uploads can be large) and 1 retry
  let { data, error } = await invokeEdge(functionName, body, accessToken, {
    useExplicitAuthHeader: false,
  });
  let explicitAttempted = false;

  // Auth-recovery: retry up to 2 times with forced refresh.
  let parsedInitial = null;
  if (error) {
    ({ parsed: parsedInitial } = await parseInvokeError(error));
  }
  if (error && isAuthFailure(error, parsedInitial)) {
    const delaysMs = [250, 700];
    for (const delayMs of delaysMs) {
      await sleep(delayMs);
      const refreshedSession = await getSessionWithRefresh({ forceRefresh: true });
      const refreshedToken = refreshedSession?.access_token || null;
      if (!refreshedToken) continue;
      accessToken = refreshedToken;

      // Retry 1: SDK-managed headers (preferred path, worked before regression).
      const retryResult = await invokeEdge(functionName, body, refreshedToken, {
        useExplicitAuthHeader: false,
      });
      data = retryResult.data;
      error = retryResult.error;
      if (!error) break;

      const { parsed: parsedRetry } = await parseInvokeError(error);
      if (!isAuthFailure(error, parsedRetry)) break;

      // Retry 2: explicit bearer fallback for rare token propagation races in RN.
      const explicitRetry = await invokeEdge(functionName, body, refreshedToken, {
        useExplicitAuthHeader: true,
      });
      explicitAttempted = true;
      data = explicitRetry.data;
      error = explicitRetry.error;
      if (!error) break;

      const { parsed: parsedExplicit } = await parseInvokeError(error);
      if (!isAuthFailure(error, parsedExplicit)) break;
    }

    // Final fallback if we never reached the explicit path in the loop.
    if (error && accessToken && !explicitAttempted) {
      const { parsed: parsedAfterRetries } = await parseInvokeError(error);
      if (isAuthFailure(error, parsedAfterRetries)) {
        const fallbackResult = await invokeEdge(functionName, body, accessToken, {
          useExplicitAuthHeader: true,
        });
        explicitAttempted = true;
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
    }
  }

  if (error) {
    const { parsed, contextText, firstDetail } = await parseInvokeError(error);

    // Spezialbehandlung: Auth
    if (isAuthFailure(error, parsed)) {
      // Never auto-signOut here. A failed AI request must not hard-logout the user.
      const err = new Error(parsed?.error || 'Nicht eingeloggt');
      err.code = 'AUTH_REQUIRED';
      err.status = 401;
      throw err;
    }

    // Spezialbehandlung: Nicht genug Credits (HTTP 402)
    if (parsed?.code === 'INSUFFICIENT_CREDITS' || error.message?.includes('402')) {
      const err = new Error(parsed?.error || 'Nicht genügend Credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.balance = parsed?.balance;
      err.required = parsed?.required;
      throw err;
    }

    // Spezialbehandlung: Rate Limit (HTTP 429)
    if (parsed?.code === 'RATE_LIMIT_EXCEEDED' || error.message?.includes('429')) {
      const err = new Error(parsed?.error || 'Zu viele Anfragen. Bitte warte etwas.');
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.retryAfter = parsed?.retry_after_seconds;
      throw err;
    }

    // Benutzerfreundliche Fallback-Meldung statt rohem SDK-Text
    const parsedMessage =
      parsed?.error && firstDetail
        ? `${parsed.error}: ${firstDetail}`
        : parsed?.error || firstDetail;

    const userMsg =
      parsedMessage ||
      contextText ||
      (error.message && !error.message.includes('non-2xx')
        ? error.message
        : `Fehler bei ${functionName} – bitte versuche es erneut.`);

    const err = new Error(userMsg);
    err.code = parsed?.code || error?.code;
    err.status = parsed?.status || error?.status || error?.context?.status;
    throw err;
  }

  return data;
}

// Pflanze erkennen (Foto → Name + Note)
export async function recognizePlant(base64Image, language) {
  return callEdgeFunction('ai-plant-scan', {
    base64: base64Image,
    language,
  });
}

// Pflanzen-Details generieren (Name → Details JSON)
export async function generatePlantDetails(name, note, language) {
  return callEdgeFunction('ai-plant-details', { name, note, language });
}

// Healthcheck durchführen (Bild-URL → Healthcheck JSON)
export async function performHealthcheck(imageUrl, plantName, language) {
  return callEdgeFunction('ai-healthcheck', {
    image_url: imageUrl,
    plant_name: plantName,
    language,
  });
}

// Chat-Nachricht an Ben senden
// History wird server-seitig geladen, nicht mehr vom Client gesendet
export async function chatWithBen(text, imageUrl, language) {
  return callEdgeFunction('ai-chat', {
    text: text || undefined,
    image_url: imageUrl || undefined,
    language,
  });
}

// User-Foto -> personalisierter Gaertner-Avatar
export async function generateGardenerAvatar(base64Image, language) {
  return callEdgeFunction('ai-gardener-avatar', {
    base64: base64Image,
    language,
  });
}
