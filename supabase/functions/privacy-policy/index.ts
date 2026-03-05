import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Single source of truth: GitHub Pages hosts the canonical privacy policy.
// This edge function redirects there to avoid content drift between two copies.
const CANONICAL_URL = 'https://3lc4pt41n.github.io/Mein-Gaertner-App/privacy-policy.html';

serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  return new Response(null, {
    status: 301,
    headers: {
      Location: CANONICAL_URL,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
