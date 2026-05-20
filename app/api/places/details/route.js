import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json(
        { error: 'placeId parameter is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Places API key not configured' },
        { status: 500 }
      );
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews,opening_hours&key=${apiKey}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch place details' },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      return NextResponse.json(
        { error: data.error_message || 'Place details request failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      reviews: data.result.reviews || [],
      opening_hours: data.result.opening_hours || null
    });

  } catch (error) {
    console.error('Place details API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
