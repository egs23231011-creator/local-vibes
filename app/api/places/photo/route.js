export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref");
 
  if (!ref) {
    return new Response(JSON.stringify({ error: "Missing 'ref' query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
 
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Google Places API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
 
  const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;
 
  try {
    const googleRes = await fetch(googleUrl);
 
    if (!googleRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch photo from Google" }), {
        status: googleRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }
 
    const contentType = googleRes.headers.get("content-type") ?? "image/jpeg";
 
    return new Response(googleRes.body, {
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
 