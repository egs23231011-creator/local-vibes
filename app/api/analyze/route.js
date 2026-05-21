import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { reviews, placeId, placeName } = body;

    // Validate reviews
    if (!reviews || !Array.isArray(reviews)) {
      console.error('Missing or invalid reviews field:', body);
      return NextResponse.json(
        { error: 'reviews array is required' },
        { status: 400 }
      );
    }

    // Validate that we have at least one review to analyze
    if (reviews.length === 0) {
      console.error('Empty reviews array provided');
      return NextResponse.json(
        { error: 'reviews array cannot be empty' },
        { status: 400 }
      );
    }

    // placeName is optional, but if provided must be a string
    const displayName = placeName || placeId || 'this place';
    if (typeof displayName !== 'string') {
      console.error('Invalid placeName/placeId:', { placeName, placeId });
      return NextResponse.json(
        { error: 'placeName or placeId must be a valid string' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Gemini API key not configured');
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Format reviews for Gemini
    const reviewsText = reviews.map(review => 
      `Rating: ${review.rating}/5 - ${review.text}`
    ).join('\n\n');

    const prompt = `Analyze these Google reviews for "${placeName}" and return ONLY a JSON object with exactly these keys, no other text or explanation:

${reviewsText}

Return ONLY JSON object with exactly these keys:
{
  "localFeel": (1-100),
  "quietness": (1-100),
  "dateNight": (1-100),
  "studyFriendly": (1-100),
  "editorLine": "one witty specific sentence about this place",
  "bestFor": ["tag1", "tag2"]
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', response.status, errorData);
      return NextResponse.json(
        { error: 'Failed to analyze reviews' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('No content from Gemini:', data);
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 500 }
      );
    }

    // Parse JSON from Gemini's response
    let analysis;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      return NextResponse.json(
        { error: 'Failed to parse analysis' },
        { status: 500 }
      );
    }

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
