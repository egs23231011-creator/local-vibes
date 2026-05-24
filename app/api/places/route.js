import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache";
 
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
 
  if (!query || !query.trim()) {
    return NextResponse.json(
      { error: "Missing required query parameter" },
      { status: 400 }
    );
  }
 
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  console.log("ENV CHECK:", process.env.GOOGLE_MAPS_API_KEY ? "SET" : "MISSING");
  console.log("GOOGLE MAPS KEY LOADED:", !!apiKey);
  if (!apiKey) {
    console.error("Google Maps API key is not configured");
    return NextResponse.json(
      { error: "Google Maps API key is not configured" },
      { status: 500 }
    );
  }
 
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&key=${apiKey}`;
 
    const res = await fetch(url, { next: { revalidate: 60 } });
 
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Google Places request failed:", res.status, errorText);
      return NextResponse.json(
        { error: `Google Places request failed with status ${res.status}` },
        { status: 502 }
      );
    }
 
    const data = await res.json();

    // Handle REQUEST_DENIED error specifically
    if (data.status === "REQUEST_DENIED") {
      console.error("Google Places REQUEST_DENIED:", data.error_message);
      return NextResponse.json(
        { error: "Google Places API access denied. Please check API key configuration." },
        { status: 403 }
      );
    }
 
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Google Places error:", data.status, data.error_message);
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
