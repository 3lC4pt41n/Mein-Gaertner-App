import { supabase, SUPABASE_PUBLISHABLE_KEY } from '../supabase';
import { requestWithPolicy } from './networkPolicy';
import { formatContextForPrompt } from '../utils/contextUtils';

const AI_EDGE_POLICY = { timeout: 90000, retries: 0 };
const AVATAR_EDGE_POLICY = { timeout: 120000, retries: 0 };

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

async function getAccessToken({ waitForHydration = true } = {}) {
  const readToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  let token = await readToken();
  if (!token && waitForHydration) {
    // After returning from camera intent on Android, session hydration can lag briefly.
    await sleep(150);
    token = await readToken();
  }

  return token;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeEdge(
  functionName,
  body,
  accessToken,
  { useExplicitAuthHeader = true, timeout = 45000, retries = 1 } = {}
) {
  const invokeOptions = { body };
  if (useExplicitAuthHeader && accessToken) {
    invokeOptions.headers = {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    };
  }

  return requestWithPolicy(() => supabase.functions.invoke(functionName, invokeOptions), {
    timeout,
    retries,
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
// Authorization + apikey werden explizit gesetzt, um stale function headers in RN zu vermeiden.
// Wrapped with requestWithPolicy for timeout + retry on transient failures.
async function callEdgeFunction(functionName, body, policyOptions = {}) {
  let accessToken = await getAccessToken();
  if (!accessToken) {
    const err = new Error('Nicht eingeloggt');
    err.code = 'AUTH_REQUIRED';
    err.status = 401;
    throw err;
  }

  // AI calls get a generous timeout (image uploads can be large) and 1 retry
  let { data, error } = await invokeEdge(functionName, body, accessToken, {
    useExplicitAuthHeader: true,
    ...policyOptions,
  });

  // Auth-recovery: one explicit retry with a freshly-read access token.
  let parsedInitial = null;
  if (error) {
    ({ parsed: parsedInitial } = await parseInvokeError(error));
  }
  if (error && isAuthFailure(error, parsedInitial)) {
    await sleep(250);
    const latestToken = (await getAccessToken({ waitForHydration: false })) || accessToken;
    const explicitRetry = await invokeEdge(functionName, body, latestToken, {
      useExplicitAuthHeader: true,
      ...policyOptions,
    });
    data = explicitRetry.data;
    error = explicitRetry.error;
    accessToken = latestToken;

    // Final fallback: let supabase-js attach function headers implicitly.
    if (error) {
      const { parsed: parsedAfterExplicit } = await parseInvokeError(error);
      if (isAuthFailure(error, parsedAfterExplicit)) {
        const sdkFallback = await invokeEdge(functionName, body, null, {
          useExplicitAuthHeader: false,
          ...policyOptions,
        });
        data = sdkFallback.data;
        error = sdkFallback.error;
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
  return callEdgeFunction(
    'ai-plant-scan',
    {
      base64: base64Image,
      language,
    },
    AI_EDGE_POLICY
  );
}

// Pflanze erkennen über eine Supabase Storage Signed URL.
// Vermeidet große Base64-JSON-Requests, die auf iOS instabil werden können.
export async function recognizePlantFromImageUrl(imageUrl, language) {
  return callEdgeFunction(
    'ai-plant-scan',
    {
      image_url: imageUrl,
      language,
    },
    AI_EDGE_POLICY
  );
}

// Pflanzen-Details generieren (Name → Details JSON)
// species_id ist optional – wenn vorhanden, nutzt die Edge Function den Dex-Cache.
// forceRefresh: true → Cache überspringen und neu generieren (z.B. Schema-Update)
export async function generatePlantDetails(name, note, language, speciesId, forceRefresh = false) {
  const body = { name, note, language };
  if (speciesId) body.species_id = speciesId;
  if (forceRefresh) body.force_refresh = true;
  return callEdgeFunction('ai-plant-details', body, AI_EDGE_POLICY);
}

// Healthcheck durchführen (Bild-URL → Healthcheck JSON)
export async function performHealthcheck(imageUrl, plantName, language) {
  return callEdgeFunction(
    'ai-healthcheck',
    {
      image_url: imageUrl,
      plant_name: plantName,
      language,
    },
    AI_EDGE_POLICY
  );
}

// Chat-Nachricht an Ben senden
// History wird server-seitig geladen, nicht mehr vom Client gesendet
export async function chatWithBen(text, imageUrl, language, context) {
  const body = {
    text: text || undefined,
    image_url: imageUrl || undefined,
    language,
  };

  if (context) {
    body.context = context;
    body.contextText = formatContextForPrompt(context);
  }

  return callEdgeFunction('ai-chat', body, AI_EDGE_POLICY);
}

// User-Foto -> personalisierter Gaertner-Avatar
// Wenn generateGeneric = true, wird kein Foto benötigt (generischer Avatar)
export async function generateGardenerAvatar(base64Image, language, generateGeneric = false) {
  const body = { language };
  if (generateGeneric) {
    body.generate_generic = true;
  } else {
    body.base64 = base64Image;
  }
  return callEdgeFunction('ai-gardener-avatar', body, AVATAR_EDGE_POLICY);
}
