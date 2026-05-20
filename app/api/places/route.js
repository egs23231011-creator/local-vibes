import { NextResponse } from "next/server";
 
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
 
  if (!query || !query.trim()) {
    return NextResponse.json(
      { error: "Missing required query parameter" },
      { status: 400 }
    );
  }
 
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key is not configured" },
      { status: 500 }
    );
  }
 
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&key=${apiKey}`;
 
    const res = await fetch(url, { next: { revalidate: 60 } });
 
    if (!res.ok) {
      return NextResponse.json(
        { error: `Google Places request failed with status ${res.status}` },
        { status: 502 }
      );
    }
 
    const data = await res.json();
 
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: `Google Places error: ${data.status}` },
        { status: 502 }
      );
    }
 
    return NextResponse.json({ results: data.results ?? [] });
  } catch (err) {
    console.error("[places/route] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach Google Places API" },
      { status: 502 }
    );
  }
}
