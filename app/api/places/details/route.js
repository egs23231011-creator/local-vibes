import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(request) {
  // Rate limit check
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.error },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json(
        { error: 'placeId parameter is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    console.log("GOOGLE MAPS KEY LOADED:", !!apiKey);
    if (!apiKey) {
      console.error("Google Maps API key is not configured");
      return NextResponse.json(
        { error: 'Google Maps API key not configured' },
        { status: 500 }
      );
    }

    // Check cache first
    const cacheKey = `place-details:${placeId}`;
    const cachedResult = getCache(cacheKey);
    if (cachedResult) {
      console.log("Cache hit for placeId:", placeId);
      return NextResponse.json(cachedResult);
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews,opening_hours&key=${apiKey}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Place details request failed:", response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch place details' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Handle REQUEST_DENIED error specifically
    if (data.status === 'REQUEST_DENIED') {
      console.error("Google Places REQUEST_DENIED:", data.error_message);
      return NextResponse.json(
        { error: 'Google Places API access denied. Please check API key configuration.' },
        { status: 403 }
      );
    }

    if (data.status !== 'OK') {
      console.error("Place details error:", data.status, data.error_message);
      return NextResponse.json(
        { error: data.error_message || 'Place details request failed' },
        { status: 400 }
      );
    }

    const result = {
      reviews: data.result.reviews || [],
      opening_hours: data.result.opening_hours || null
    };

    // Store in cache for 10 minutes
    setCache(cacheKey, result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Place details API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
