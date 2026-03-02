import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RATE_LIMIT_MAP = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_REQUESTS = 50; // 50 requests per minute per IP

/**
 * Check and enforce rate limiting by IP
 */
const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const limitData = RATE_LIMIT_MAP.get(ip);

  if (!limitData || now > limitData.resetTime) {
    RATE_LIMIT_MAP.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limitData.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  limitData.count++;
  return true;
};

/**
 * Get client IP from headers
 */
const getClientIP = (req: Request): string => {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
};

/**
 * Validate latitude and longitude
 */
const validateCoordinates = (lat: string | null, lon: string | null): boolean => {
  if (!lat || !lon) return false;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  return !isNaN(latitude) && !isNaN(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
};

/**
 * Main handler
 */
serve(async (req: Request) => {
  // Support CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
    });
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  }

  // Get client IP for rate limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  }

  // Parse query parameters
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const type = url.searchParams.get("type") || "current";
  const units = url.searchParams.get("units") || "metric";
  const lang = url.searchParams.get("lang") || "en";

  // Validate coordinates
  if (!validateCoordinates(lat, lon)) {
    return new Response(JSON.stringify({ error: "Invalid latitude or longitude" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  }

  // Validate type parameter
  if (!["current", "forecast"].includes(type)) {
    return new Response(JSON.stringify({ error: "Invalid type parameter. Must be 'current' or 'forecast'" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  }

  try {
    // Get API key from environment
    const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
    if (!apiKey) {
      console.error("OPENWEATHER_API_KEY not configured");
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    }

    // Build OpenWeatherMap API URL
    const endpoint = type === "current" ? "/data/2.5/weather" : "/data/2.5/forecast";
    const weatherUrl = `https://api.openweathermap.org${endpoint}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}&lang=${lang}`;

    // Fetch from OpenWeatherMap
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      console.error(`OpenWeatherMap API error: ${weatherResponse.status}`);
      return new Response(JSON.stringify({ error: "Failed to fetch weather data" }), {
        status: weatherResponse.status,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    }

    const data = await weatherResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600", // Cache for 10 minutes
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Error in weather proxy:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  }
});
