import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { corsHeaders as defaultCorsHeaders } from './credits.ts';

// ─── Rate-Limit-Konfiguration pro Aktion ────────────────────────────
// maxRequests innerhalb von windowMinutes
export const RATE_LIMITS: Record<string, { maxRequests: number; windowMinutes: number }> = {
  chat: { maxRequests: 50, windowMinutes: 60 }, // 50 Nachrichten/Stunde
  plant_scan: { maxRequests: 25, windowMinutes: 60 }, // 25 Scans/Stunde
  plant_details: { maxRequests: 25, windowMinutes: 60 }, // 25 Details/Stunde
  healthcheck: { maxRequests: 15, windowMinutes: 60 }, // 15 Checks/Stunde
  avatar: { maxRequests: 5, windowMinutes: 60 }, // 5 Avatare/Stunde
};

/**
 * Prüft ob der User das Rate Limit für eine Aktion überschritten hat.
 * Nutzt die bestehende usage_log-Tabelle — kein zusätzlicher Service nötig.
 *
 * @returns null wenn OK, sonst ein fertiges 429-Response-Objekt
 */
export async function checkRateLimit(
  serviceClient: SupabaseClient,
  userId: string,
  action: string,
  responseHeaders: Record<string, string> = defaultCorsHeaders
): Promise<Response | null> {
  const config = RATE_LIMITS[action];
  if (!config) return null; // Unbekannte Aktion → kein Limit

  const since = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await serviceClient
    .from('usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', since);

  if (error) {
    // Bei DB-Fehler lieber durchlassen als User blocken
    console.error('Rate-Limit-Check fehlgeschlagen:', error);
    return null;
  }

  const used = count ?? 0;
  if (used >= config.maxRequests) {
    const retryAfterSec = config.windowMinutes * 60;
    return new Response(
      JSON.stringify({
        error: 'Zu viele Anfragen. Bitte warte etwas.',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: config.maxRequests,
        window_minutes: config.windowMinutes,
        retry_after_seconds: retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          ...responseHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
        },
      }
    );
  }

  return null; // Alles gut
}
