import { getCache, setCache } from '@/lib/cache';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(request) {
  // Rate limit check
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: rateLimit.error }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref");
 
  if (!ref) {
    return new Response(JSON.stringify({ error: "Missing 'ref' query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
 
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  console.log("GOOGLE MAPS KEY LOADED:", !!apiKey);
  if (!apiKey) {
    console.error("Google Maps API key is not configured");
    return new Response(JSON.stringify({ error: "Google Maps API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
 
  // Check cache first
  const cacheKey = `place-photo:${ref}`;
  const cachedResult = getCache(cacheKey);
  if (cachedResult) {
    console.log("Cache hit for photo ref:", ref);
    return new Response(cachedResult.body, {
      status: 200,
      headers: {
        "Content-Type": cachedResult.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  }

  const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;
 
  try {
    const googleRes = await fetch(googleUrl);
 
    if (!googleRes.ok) {
      const errorText = await googleRes.text();
      console.error("Photo fetch failed:", googleRes.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to fetch photo from Google" }), {
        status: googleRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }
 
    const contentType = googleRes.headers.get("content-type") ?? "image/jpeg";
 
    // Store in cache
    const bodyBuffer = await googleRes.arrayBuffer();
    setCache(cacheKey, { body: bodyBuffer, contentType });

    return new Response(bodyBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[places/photo] Fetch error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
