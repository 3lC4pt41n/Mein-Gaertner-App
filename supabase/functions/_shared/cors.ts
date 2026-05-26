const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:19006',
  'http://localhost:8081',
  'http://localhost:3000',
  'https://3lc4pt41n.github.io',
  'https://florascout.app',
  'https://www.florascout.app',
];

const DEFAULT_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

function readOriginConfig(): { allowAll: boolean; allowedOrigins: Set<string> } {
  const raw = Deno.env.get('ALLOWED_WEB_ORIGINS')?.trim();

  if (raw === '*') {
    return { allowAll: true, allowedOrigins: new Set() };
  }

  const origins = raw
    ? raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  return { allowAll: false, allowedOrigins: new Set(origins) };
}

const originConfig = readOriginConfig();

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // Native apps / non-browser clients
  if (originConfig.allowAll) return true;
  return originConfig.allowedOrigins.has(origin);
}

export function getCorsHeaders(
  req: Request,
  methods = 'POST, OPTIONS',
  headers = DEFAULT_ALLOWED_HEADERS
): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowOrigin = !origin ? '*' : isAllowedOrigin(origin) ? origin : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': headers,
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  };
}

export function rejectDisallowedOrigin(
  req: Request,
  corsHeaders: Record<string, string>
): Response | null {
  const origin = req.headers.get('origin');
  if (isAllowedOrigin(origin)) {
    return null;
  }

  return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
