"use client";
 
import { useState, useEffect, useRef, useMemo } from "react";
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
const VIBE_PRESETS = [
  { key: "workFocus",     label: "Work Focus",     emoji: "💻" },
  { key: "socialEnergy",  label: "Social Energy",  emoji: "🎉" },
  { key: "aesthetic",     label: "Aesthetic",      emoji: "✨" },
  { key: "calmEscape",    label: "Calm Escape",    emoji: "🌿" },
  { key: "foodQuality",   label: "Food & Drink",   emoji: "🍽️" },
  { key: "dateNight",     label: "Date Night",     emoji: "🕯️" },
];

const INTENT_FILTER_OPTIONS = [
  { key: null, label: "All" },
  ...VIBE_PRESETS.map(({ key, label }) => ({ key, label })),
];

const PRICE_MAP = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

const FAVORITES_STORAGE_KEY = "favorites_places";
const TASTE_PROFILE_STORAGE_KEY = "taste_profile";

function loadFavoritesPlaceIdsFromStorage() {
  try {
    let raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("favoritePlaces");
      if (legacy) {
        localStorage.setItem(FAVORITES_STORAGE_KEY, legacy);
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** @type {Record<string, readonly string[]>} */
const INTENT_KEYWORD_GROUPS = {
  workFocus: [
    "laptop", "wifi", "wi-fi", "wfh", "remote work", "outlet", "socket", "plug",
    "study", "studying", "focus", "productive", "cowork", "meeting", "zoom",
    "quiet enough to work", "good for work", "workspace",
  ],
  socialEnergy: [
    "lively", "buzzing", "vibrant", "packed", "crowded", "busy", "party",
    "friends", "group", "meet up", "hangout", "nightlife", "dj", "dancing",
    "social", "energetic", "fun atmosphere",
  ],
  aesthetic: [
    "beautiful", "gorgeous", "stunning", "instagram", "instagrammable", "aesthetic",
    "interior", "decor", "design", "ambiance", "ambience", "vibes", "chic",
    "minimalist", "cozy aesthetic", "photo-worthy", "picturesque",
  ],
  calmEscape: [
    "peaceful", "relaxing", "serene", "tranquil", "quiet", "calm", "chill",
    "escape", "oasis", "zen", "meditative", "low key", "intimate and quiet",
    "hidden gem", "underrated", "slow",
  ],
  foodQuality: [
    "delicious", "tasty", "flavor", "flavour", "fresh", "chef", "menu",
    "brunch", "pastry", "pastries", "croissant", "coffee", "espresso",
    "cocktail", "wine", "beer", "seasonal", "quality ingredients", "worth the price",
  ],
  dateNight: [
    "romantic", "date night", "date spot", "anniversary", "intimate", "candle",
    "candlelit", "couples", "special occasion", "cozy for two", "proposal",
  ],
};

const INTENT_RANK_KEYS = VIBE_PRESETS.map(({ key }) => key);

/** @type {Record<string, readonly string[]>} */
const INTENT_RELEVANCE = {
  "café":         ["workFocus", "calmEscape", "aesthetic"],
  restaurant:     ["foodQuality", "dateNight", "aesthetic"],
  bar:            ["socialEnergy", "dateNight", "aesthetic"],
  bakery:         ["aesthetic", "foodQuality", "calmEscape"],
  "dessert cafe": ["aesthetic", "dateNight", "foodQuality"],
  market:         ["aesthetic", "foodQuality", "socialEnergy"],
  park:           ["calmEscape", "aesthetic", "socialEnergy"],
};

/** Maps Google Places `types[0]` values to an INTENT_RELEVANCE category. */
const GOOGLE_PRIMARY_TYPE_TO_CATEGORY = {
  cafe: "café",
  coffee_shop: "café",
  espresso_bar: "café",
  tea_house: "café",
  restaurant: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  food: "restaurant",
  bar: "bar",
  night_club: "bar",
  bakery: "bakery",
  park: "park",
  grocery_or_supermarket: "market",
  supermarket: "market",
  convenience_store: "market",
  farmer_market: "market",
  shopping_mall: "market",
  dessert_shop: "dessert cafe",
  ice_cream_shop: "dessert cafe",
  confectionery: "dessert cafe",
  candy_store: "dessert cafe",
};

function relevanceCategoryFromPlace(place) {
  const primary = place?.types?.[0];
  if (!primary) return null;
  const t = String(primary).toLowerCase();
  if (INTENT_RELEVANCE[t]) return t;
  return GOOGLE_PRIMARY_TYPE_TO_CATEGORY[t] ?? null;
}

function getAllowedIntentsForPlace(place) {
  const cat = relevanceCategoryFromPlace(place);
  if (cat && Array.isArray(INTENT_RELEVANCE[cat]) && INTENT_RELEVANCE[cat].length) {
    return [...INTENT_RELEVANCE[cat]];
  }
  return [...INTENT_RANK_KEYS];
}

function fillIntentsToFullShape(partial, allowedIntents) {
  const allowed = new Set(allowedIntents);
  const out = {};
  for (const k of INTENT_RANK_KEYS) {
    out[k] = allowed.has(k) ? Math.round(Number(partial[k]) || 0) : 0;
  }
  return out;
}

function deterministicIntentScores(placeId, allowedIntents) {
  const seed = placeId
    ? String(placeId).split("").reduce((a, c) => a + c.charCodeAt(0), 0)
    : 42;
  const values = {
    workFocus:     40 + ((seed * 3) % 55),
    socialEnergy:  35 + ((seed * 5) % 60),
    aesthetic:     30 + ((seed * 7) % 65),
    calmEscape:    38 + ((seed * 11) % 58),
    foodQuality:   45 + ((seed * 13) % 50),
    dateNight:     32 + ((seed * 17) % 63),
  };
  const allowed = new Set(allowedIntents);
  const out = {};
  for (const k of INTENT_RANK_KEYS) {
    out[k] = allowed.has(k) ? values[k] : 0;
  }
  return out;
}

function buildIntentTextCorpus(place, reviews) {
  const chunks = [];
  if (place?.name) chunks.push(place.name);
  if (Array.isArray(place?.types)) chunks.push(place.types.join(" "));
  for (const r of reviews ?? []) {
    if (r?.text) chunks.push(r.text);
  }
  return chunks.join(" ").toLowerCase();
}

function scoreIntentsFromKeywordHeuristics(corpus, allowedIntents) {
  if (!corpus || corpus.trim().length < 8) return null;

  const allowed = new Set(allowedIntents);
  const scores = {};
  let totalHits = 0;

  for (const key of Object.keys(INTENT_KEYWORD_GROUPS)) {
    if (!allowed.has(key)) continue;
    let hits = 0;
    for (const phrase of INTENT_KEYWORD_GROUPS[key]) {
      if (!phrase) continue;
      let idx = 0;
      while (true) {
        idx = corpus.indexOf(phrase, idx);
        if (idx === -1) break;
        hits += 1;
        idx += phrase.length;
        if (hits > 24) break;
      }
    }
    totalHits += hits;
    const base = 26;
    const bump = Math.min(74, hits * 5);
    scores[key] = Math.min(100, Math.max(12, base + bump));
  }

  if (totalHits === 0) return null;

  const keys = Object.keys(scores);
  const mean = keys.reduce((s, k) => s + scores[k], 0) / keys.length;
  const spread = Math.min(18, Math.floor(totalHits / 3));
  for (const k of keys) {
    scores[k] = Math.round(
      Math.min(100, Math.max(15, scores[k] + (scores[k] - mean) * 0.15 + spread * 0.4)),
    );
  }
  return fillIntentsToFullShape(scores, allowedIntents);
}

const ANTI_MATCH_WARNINGS = {
  workFocus: "Rarely a dead-quiet study hall — expect humanity around you.",
  socialEnergy: "Not the loudest room on the block most nights.",
  aesthetic: "Instagram moments can be hit-or-miss here.",
  calmEscape: "Zen seekers may notice more bustle than silence.",
  foodQuality: "Food and drink are not always the headline.",
  dateNight: "Dim, romantic corners are not the default vibe.",
};

const VENUE_PERSONALITY_FALLBACK = {
  workFocus: "Studious neighborhood nook",
  socialEnergy: "Buzz-forward hangout",
  aesthetic: "Design-led space",
  calmEscape: "Low-key retreat",
  foodQuality: "Snack-and-sip focused",
  dateNight: "Soft-light evening energy",
};

const WHY_THIS_PLACE_LINE = {
  workFocus: "laptop-friendly rhythms stay readable without going library-silent.",
  socialEnergy: "ambient chatter and arrivals keep the energy honest.",
  aesthetic: "the visual story carries more weight than the menu alone.",
  calmEscape: "small pauses between orders feel softer than a rush-hour diner.",
  foodQuality: "what lands on the table tends to steer the memory.",
  dateNight: "lighting and seating lean toward unhurried evenings.",
};

function googleTypesSet(place) {
  const types = place?.types;
  if (!Array.isArray(types)) return new Set();
  return new Set(types.map((t) => String(t).toLowerCase()));
}

function hasCafeLibraryProductivityTypes(types) {
  return ["cafe", "coffee_shop", "book_store", "library", "coworking_space"].some((x) => types.has(x));
}

function hasNightlifeTypes(types) {
  return ["bar", "night_club", "pub"].some((x) => types.has(x));
}

function hasDessertBakeryTypes(types) {
  return ["bakery", "dessert_shop", "ice_cream_shop", "confectionery", "candy_store"].some((x) =>
    types.has(x),
  );
}

function buildAntiMatchWarnings(numericScores) {
  const ranked = [...INTENT_RANK_KEYS]
    .map((k) => [k, numericScores[k] ?? 0])
    .sort((a, b) => a[1] - b[1]);
  const out = [];
  for (const [k, v] of ranked) {
    if (v > 34) continue;
    const msg = ANTI_MATCH_WARNINGS[k];
    if (msg) out.push(msg);
    if (out.length >= 3) break;
  }
  return out;
}

function buildVenuePersonality(place, dominant, types) {
  if (hasNightlifeTypes(types)) {
    if (dominant === "dateNight" || dominant === "socialEnergy") return "Late-night social hub";
    return "Social-forward nightlife spot";
  }
  if (hasCafeLibraryProductivityTypes(types)) {
    if (dominant === "workFocus") return "Quiet productivity pocket";
    return "Calm daytime third place";
  }
  if (hasDessertBakeryTypes(types)) return "Sweet-tooth friendly stop";
  if (types.has("park")) return "Breathe-deep outdoor pocket";
  if (types.has("restaurant")) return "Table-first gathering spot";
  return VENUE_PERSONALITY_FALLBACK[dominant] ?? "Neighborhood all-rounder";
}

function buildWhyThisPlace(personality, dominant) {
  const detail = WHY_THIS_PLACE_LINE[dominant] ?? "the mix still feels intentional, not random.";
  return `${personality} — ${detail}`;
}

/**
 * Intent scores from review/name/type keyword heuristics, else deterministic fallback.
 * Relevance (via place.types[0]) limits which intents get base scores; foodQuality is always base-scored.
 * Also returns venuePersonality, whyThisPlace, antiMatchWarnings (data-only; not rendered yet).
 * @returns {Record<string, unknown>}
 */
function scoreIntentVibes(place, reviews) {
  const allowedIntents = getAllowedIntentsForPlace(place);
  const intentsToScore = [...new Set([...allowedIntents, "foodQuality"])];
  const corpus = buildIntentTextCorpus(place, reviews);
  const fromText = scoreIntentsFromKeywordHeuristics(corpus, intentsToScore);
  let scores = fromText ?? deterministicIntentScores(place?.place_id, intentsToScore);

  const types = googleTypesSet(place);
  const primary = String(place?.types?.[0] || "").toLowerCase();
  const baseFq = Number(scores.foodQuality) || 0;
  if (primary === "bar" || primary === "pub" || primary === "night_club") {
    scores = { ...scores, foodQuality: baseFq * 0.6 + 25 };
  } else if (primary === "restaurant" || primary === "cafe" || primary === "bakery") {
    scores = { ...scores, foodQuality: baseFq * 1.2 };
  }

  // Enhanced context weighting
  if (primary === "cafe" || primary === "café") {
    const wf = Number(scores.workFocus) || 0;
    const ce = Number(scores.calmEscape) || 0;
    scores = {
      ...scores,
      workFocus: Math.min(100, Math.round(wf * 1.25 + 8)),
      calmEscape: Math.min(100, Math.round(ce * 1.2 + 5)),
    };
  } else if (primary === "bar" || primary === "pub" || primary === "night_club") {
    const se = Number(scores.socialEnergy) || 0;
    const dn = Number(scores.dateNight) || 0;
    scores = {
      ...scores,
      socialEnergy: Math.min(100, Math.round(se * 1.4 + 15)),
      dateNight: Math.min(100, Math.round(dn * 1.35 + 12)),
    };
  } else if (primary === "restaurant") {
    const fq = Number(scores.foodQuality) || 0;
    const dn = Number(scores.dateNight) || 0;
    scores = {
      ...scores,
      foodQuality: Math.min(100, Math.round(fq * 1.3 + 10)),
      dateNight: Math.min(100, Math.round(dn * 1.15 + 5)),
    };
  }

  if (hasCafeLibraryProductivityTypes(types)) {
    const se = Number(scores.socialEnergy) || 0;
    const wf = Number(scores.workFocus) || 0;
    scores = {
      ...scores,
      socialEnergy: Math.max(se * 0.7, 15),
      workFocus: Math.min(100, Math.round(wf * 1.12 + 4)),
    };
  }

  if (hasNightlifeTypes(types)) {
    const se = Number(scores.socialEnergy) || 0;
    const dn = Number(scores.dateNight) || 0;
    const wf = Number(scores.workFocus) || 0;
    scores = {
      ...scores,
      socialEnergy: Math.min(100, Math.max(se, 56)),
      dateNight: Math.min(100, Math.max(dn, 50)),
      workFocus: Math.min(100, Math.max(Math.round(wf * 0.88), 14)),
    };
  }

  if (hasDessertBakeryTypes(types)) {
    const ae = Number(scores.aesthetic) || 0;
    const ce = Number(scores.calmEscape) || 0;
    scores = {
      ...scores,
      aesthetic: Math.min(100, Math.round(ae * 1.14 + 3)),
      calmEscape: Math.min(100, Math.round(ce * 1.1 + 3)),
    };
  }

  const out = {};
  for (const k of INTENT_RANK_KEYS) {
    out[k] = Math.min(100, Math.max(0, Math.round(Number(scores[k]) || 0)));
  }

  // Reduce irrelevant intent noise - lower minimum score
  for (const k of INTENT_RANK_KEYS) {
    if (out[k] === 0) {
      out[k] = 3;
    }
  }

  // Normalize scores to prevent flat clustering
  const avg = avgIntentScore(out);
  if (avg > 0) {
    const spread = Math.max(...Object.values(out)) - Math.min(...Object.values(out));
    if (spread < 20) {
      // If scores are too clustered, amplify differences
      for (const k of INTENT_RANK_KEYS) {
        out[k] = Math.min(100, Math.round((out[k] - avg) * 1.3 + avg));
      }
    }
  }

  // Improve contrast for top 2 intents
  const sortedKeys = [...INTENT_RANK_KEYS].sort((a, b) => out[b] - out[a]);
  if (sortedKeys.length >= 2) {
    const top1 = sortedKeys[0];
    const top2 = sortedKeys[1];
    const top1Score = out[top1];
    const top2Score = out[top2];
    // Boost top 2 to stand out more
    out[top1] = Math.min(100, Math.round(top1Score * 1.08 + 3));
    out[top2] = Math.min(100, Math.round(top2Score * 1.05 + 2));
  }

  const dominant = dominantVibeFromScores(out);
  const venuePersonality = buildVenuePersonality(place, dominant, types);
  const whyThisPlace = buildWhyThisPlace(venuePersonality, dominant);
  const antiMatchWarnings = buildAntiMatchWarnings(out);

  return {
    ...out,
    venuePersonality,
    whyThisPlace,
    antiMatchWarnings,
  };
}

/** Ranking-only: extra weight on selected intents per category (defaults to 1). */
const RANKING_INTENT_WEIGHTS = {
  "café":         { workFocus: 1.65, calmEscape: 1.65, aesthetic: 1 },
  "dessert cafe": { aesthetic: 1.55, foodQuality: 1.55, dateNight: 0.9 },
  market:         { foodQuality: 1.55, socialEnergy: 1.55, aesthetic: 0.95 },
};

function relevantIntentKeysForPlaceType(placeType) {
  const keys = INTENT_RELEVANCE[placeType];
  if (Array.isArray(keys) && keys.length) return keys;
  return INTENT_RANK_KEYS;
}

/** Full intent keys; non-relevant intents zeroed for the current place type. */
function filterScoresByPlaceTypeRelevance(scores, placeType) {
  const keys = relevantIntentKeysForPlaceType(placeType);
  const filtered = {};
  for (const k of INTENT_RANK_KEYS) {
    filtered[k] = keys.includes(k) ? (scores[k] ?? 0) : 0;
  }
  return filtered;
}

function avgRelevantIntentScore(scores, placeType) {
  const keys = relevantIntentKeysForPlaceType(placeType);
  let s = 0;
  for (const k of keys) s += scores[k] ?? 0;
  return s / keys.length;
}

/** Ranking-only weighted mean over relevance intents (search placeType + RANKING_INTENT_WEIGHTS). */
function rankingWeightedRelevantAverage(scores, placeType) {
  const keys = relevantIntentKeysForPlaceType(placeType);
  const typeWeights = RANKING_INTENT_WEIGHTS[placeType] || {};
  let num = 0;
  let den = 0;
  for (const k of keys) {
    const w = typeWeights[k] ?? 1;
    num += (scores[k] ?? 0) * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

function avgIntentScore(scores) {
  let s = 0;
  for (const k of INTENT_RANK_KEYS) s += scores[k] ?? 0;
  return s / INTENT_RANK_KEYS.length;
}

function dominantVibeFromScores(scores) {
  let bestKey = INTENT_RANK_KEYS[0];
  let best = scores[bestKey] ?? 0;
  for (const k of INTENT_RANK_KEYS) {
    const v = scores[k] ?? 0;
    if (v > best) {
      best = v;
      bestKey = k;
    }
  }
  return bestKey;
}

function topVibesFromScores(scores) {
  return [...INTENT_RANK_KEYS]
    .sort((a, b) => {
      const d = (scores[b] ?? 0) - (scores[a] ?? 0);
      if (d !== 0) return d;
      return INTENT_RANK_KEYS.indexOf(a) - INTENT_RANK_KEYS.indexOf(b);
    })
    .slice(0, 2);
}

/** Deterministic copy snippets for AI-style "Best for:" summaries (intent keys → phrases). */
const INTENT_SUMMARY_PHRASES = {
  workFocus: "quiet work sessions",
  socialEnergy: "social energy",
  aesthetic: "aesthetic study mornings",
  calmEscape: "calm focus",
  foodQuality: "relaxed coffee",
  dateNight: "late-night dates",
};

function buildBestForSummary(place, displayVibes) {
  const dominant = place.dominantVibe ?? dominantVibeFromScores(displayVibes);
  const top =
    Array.isArray(place.topVibes) && place.topVibes.length > 0
      ? place.topVibes
      : topVibesFromScores(displayVibes);

  const keys = [];
  const seen = new Set();
  const push = (k) => {
    if (!k || seen.has(k) || !INTENT_RANK_KEYS.includes(k)) return;
    seen.add(k);
    keys.push(k);
  };
  push(dominant);
  for (const k of top) push(k);

  const phrases = keys
    .slice(0, 3)
    .map((k) => INTENT_SUMMARY_PHRASES[k])
    .filter(Boolean);
  if (phrases.length === 0) return null;

  let body;
  if (phrases.length === 1) body = phrases[0];
  else if (phrases.length === 2) body = `${phrases[0]} and ${phrases[1]}`;
  else body = `${phrases[0]}, ${phrases[1]}, and ${phrases[2]}`;

  return `Best for: ${body}`;
}

function weightedFallbackScore(place, scores, placeType) {
  const rating = Number(place.rating) || 0;
  const reviewCount = Number(place.user_ratings_total) || 0;
  const avgVibe = rankingWeightedRelevantAverage(scores, placeType);
  return rating + reviewCount + avgVibe;
}

/**
 * Sorts a copy of `places` by vibe intent or weighted fallback; attaches dominantVibe + topVibes.
 * Ranking uses scoreIntentVibes(place, []) only (same heuristics as initial card display).
 */
function rankAndEnrichPlaces(places, selectedIntent, placeType, tasteProfile) {
  if (!Array.isArray(places) || places.length === 0) return [];
  const intentKey =
    selectedIntent && INTENT_RANK_KEYS.includes(selectedIntent) ? selectedIntent : null;
  const favoriteIds = new Set(loadFavoritesPlaceIdsFromStorage());

  const rows = places.map((place, index) => {
    const scores = scoreIntentVibes(place, []);
    return {
      place,
      index,
      scores,
      dominantVibe: dominantVibeFromScores(scores),
      topVibes: topVibesFromScores(scores),
    };
  });

  rows.sort((a, b) => {
    let pa;
    let pb;
    if (intentKey) {
      pa = a.scores[intentKey] ?? 0;
      pb = b.scores[intentKey] ?? 0;
    } else {
      pa = weightedFallbackScore(a.place, a.scores, placeType);
      pb = weightedFallbackScore(b.place, b.scores, placeType);
    }
    if (favoriteIds.has(a.place?.place_id)) pa += 25;
    if (favoriteIds.has(b.place?.place_id)) pb += 25;

    // Taste affinity bonus
    if (tasteProfile) {
      const aBonus = calculateTasteAffinityBonus(a.place, a.scores, tasteProfile, placeType);
      const bBonus = calculateTasteAffinityBonus(b.place, b.scores, tasteProfile, placeType);
      pa += aBonus;
      pb += bBonus;
    }

    if (pb !== pa) return pb - pa;
    return a.index - b.index;
  });

  return rows.map(({ place, dominantVibe, topVibes }) => ({
    ...place,
    dominantVibe,
    topVibes,
  }));
}

function calculateTasteAffinityBonus(place, scores, tasteProfile, placeType) {
  let bonus = 0;

  // Intent match bonus (5-15 based on match strength)
  if (tasteProfile.preferredIntents) {
    const intentScores = tasteProfile.preferredIntents;
    let totalMatchScore = 0;
    let matchCount = 0;

    for (const key of INTENT_RANK_KEYS) {
      const userPref = intentScores[key] ?? 0;
      const placeScore = scores[key] ?? 0;
      const diff = Math.abs(userPref - placeScore);
      if (diff < 20) {
        totalMatchScore += (20 - diff) / 20;
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const avgMatch = totalMatchScore / matchCount;
      bonus += Math.round(avgMatch * 15);
    }
  }

  // Place type match bonus (+10)
  if (tasteProfile.preferredPlaceTypes && place?.types?.[0]) {
    const primaryType = place.types[0].toLowerCase().replace(/_/g, " ");
    if (tasteProfile.preferredPlaceTypes[primaryType]) {
      bonus += 10;
    }
  }

  return bonus;
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────
 
function PriceLevel({ level }) {
  if (!level) return null;
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.05em", color: "var(--terracotta)",
      border: "1px solid rgba(196,97,42,0.4)", borderRadius: 4,
      padding: "2px 6px", lineHeight: 1,
    }}>
      {PRICE_MAP[level] ?? ""}
    </span>
  );
}
 
function OpenBadge({ openingHours }) {
  if (!openingHours || openingHours.open_now === undefined) return null;
  const isOpen = openingHours.open_now;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
      padding: "4px 10px", borderRadius: 999,
      border: isOpen ? "1px solid #bbf7d0" : "1px solid #e7e5e4",
      background: isOpen ? "#f0fdf4" : "#f5f5f4",
      color: isOpen ? "#15803d" : "#a8a29e",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isOpen ? "#22c55e" : "#a8a29e",
        flexShrink: 0,
      }} />
      {isOpen ? "Open Now" : "Closed"}
    </span>
  );
}

const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

function FavoriteHeartButton({ favorited, onClick }) {
  return (
    <button
      type="button"
      aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
      aria-pressed={favorited}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(44,24,16,0.45)",
        backdropFilter: "blur(4px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        {favorited ? (
          <path fill="var(--terracotta)" d={HEART_PATH} />
        ) : (
          <path
            fill="none"
            stroke="var(--cream)"
            strokeWidth="1.85"
            strokeLinejoin="round"
            d={HEART_PATH}
          />
        )}
      </svg>
    </button>
  );
}
 
function VibeBar({ label, emoji, value }) {
  const bg =
    value >= 75 ? "var(--espresso)" :
    value >= 50 ? "var(--terracotta)" :
    value >= 30 ? "#fcd34d" : "#d6d3d1";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {emoji} {label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 900, color: "var(--espresso)", fontVariantNumeric: "tabular-nums" }}>
          {value}%
        </span>
      </div>
      <div style={{ width: "100%", background: "var(--parchment-dark)", borderRadius: 999, height: 4 }}>
        <div style={{ width: `${value}%`, background: bg, height: 4, borderRadius: 999, transition: "width 0.7s ease" }} />
      </div>
    </div>
  );
}
 
function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span style={{ display: "inline-flex", gap: 2 }} aria-label={`${rating} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
          style={{ color: i <= full ? "var(--terracotta)" : (i === full + 1 && half ? "rgba(196,97,42,0.35)" : "#e7e5e4") }}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}
 
function TornEdge() {
  return (
    <svg viewBox="0 0 400 20" xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none" style={{ width: "100%", height: 20, display: "block" }}>
      <path
        d="M0,20 L0,8 Q10,2 20,10 Q30,18 45,6 Q55,0 70,9 Q82,16 95,5 Q108,0 118,11 Q130,18 145,7 Q158,0 170,8 Q182,16 195,4 Q207,0 220,10 Q232,18 248,5 Q260,0 272,9 Q285,17 298,6 Q310,0 325,11 Q337,18 350,7 Q362,0 375,8 Q388,16 400,5 L400,20 Z"
        fill="var(--parchment)"
      />
    </svg>
  );
}
 
// ─── PlaceCard ────────────────────────────────────────────────────────────────
 
function PlaceCard({ place, featured = false, isFavorite: checkFavorite, onToggleFavorite, onClick, tasteProfile }) {
  const [imgError,    setImgError]    = useState(false);
  const [vibes,       setVibes]       = useState(null);
  const [editorLine,  setEditorLine]  = useState(null);
  const [bestFor,     setBestFor]     = useState([]);
 
  useEffect(() => {
    if (!place.place_id) {
      setVibes(scoreIntentVibes(place, []));
      return;
    }
    let cancelled = false;
 
    async function loadVibes() {
      try {
        const detailsRes = await fetch(`/api/places/details?placeId=${encodeURIComponent(place.place_id)}`);
        if (!detailsRes.ok) throw new Error("details failed");
        const details = await detailsRes.json();
 
        const reviews = details.result?.reviews ?? [];
        
        // Skip analyze call if no reviews available
        if (!reviews || reviews.length === 0) {
          console.log("No reviews available, skipping analyze for:", place.place_id);
          if (!cancelled) setVibes(scoreIntentVibes(place, []));
          return;
        }

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: place.place_id, placeName: place.name, reviews }),
        });
        if (!analyzeRes.ok) {
          const errorData = await analyzeRes.json().catch(() => ({ error: "Unknown error" }));
          console.error("Analyze API error:", errorData);
          throw new Error("analyze failed");
        }
        const analysis = await analyzeRes.json();

        if (cancelled) return;
        const fallback = scoreIntentVibes(place, reviews);
        setVibes({
          workFocus:     analysis.workFocus     ?? fallback.workFocus,
          socialEnergy:  analysis.socialEnergy  ?? fallback.socialEnergy,
          aesthetic:     analysis.aesthetic     ?? fallback.aesthetic,
          calmEscape:    analysis.calmEscape    ?? fallback.calmEscape,
          foodQuality:   analysis.foodQuality   ?? fallback.foodQuality,
          dateNight:     analysis.dateNight     ?? fallback.dateNight,
        });
        if (analysis.editorLine) setEditorLine(analysis.editorLine);
        if (Array.isArray(analysis.bestFor) && analysis.bestFor.length) setBestFor(analysis.bestFor);
      } catch {
        if (!cancelled) setVibes(scoreIntentVibes(place, []));
      }
    }
 
    loadVibes();
    return () => { cancelled = true; };
  }, [place.place_id]);
 
  const displayVibes = vibes ?? scoreIntentVibes(place, []);
  const bestForSummary = buildBestForSummary(place, displayVibes);
  const photoRef = place.photos?.[0]?.photo_reference;
  const photoUrl = photoRef && !imgError
    ? `/api/places/photo?ref=${encodeURIComponent(photoRef)}`
    : null;
  const favorited = Boolean(place.place_id && checkFavorite?.(place.place_id));
  const persistedFavorited = useMemo(
    () => Boolean(place.place_id && loadFavoritesPlaceIdsFromStorage().includes(place.place_id)),
    [place.place_id, favorited],
  );

  // Taste comparison for "Why you'll like this"
  const whyYoullLikeThis = useMemo(() => {
    if (!tasteProfile?.preferredIntents) return null;
    const favoriteIds = loadFavoritesPlaceIdsFromStorage();
    if (favoriteIds.length <= 2) return null;

    const userPrefs = tasteProfile.preferredIntents;
    const placeScores = displayVibes;

    // Find matching intents where user preference and place score are both high (> 60)
    const matches = [];
    for (const key of INTENT_RANK_KEYS) {
      const userPref = userPrefs[key] ?? 0;
      const placeScore = placeScores[key] ?? 0;
      if (userPref > 60 && placeScore > 60) {
        const preset = VIBE_PRESETS.find(p => p.key === key);
        if (preset) matches.push(preset.label);
      }
    }

    if (matches.length === 0) return null;
    return `You like places with: ${matches.slice(0, 2).join(" + ")} vibes`;
  }, [tasteProfile, displayVibes]);
  const heartOverlay = place.place_id ? (
    <FavoriteHeartButton
      favorited={favorited}
      onClick={() => onToggleFavorite?.(place.place_id)}
    />
  ) : null;
 
  // ── Featured ───────────────────────────────────────────────────────────────
  if (featured) {
    return (
      <div onClick={onClick} style={{
        background: "var(--parchment)",
        border: persistedFavorited ? "1px solid rgba(196,97,42,0.26)" : "1px solid rgba(26,16,8,0.10)",
        borderRadius: 24,
        boxShadow: persistedFavorited
          ? "0 4px 18px rgba(44,24,16,0.14), 0 2px 8px rgba(196,97,42,0.12)"
          : "0 2px 12px rgba(44,24,16,0.10), 0 1px 3px rgba(44,24,16,0.06)",
        overflow: "hidden",
        marginBottom: 20,
        cursor: onClick ? "pointer" : "default",
        maxWidth: "100%",
      }}>
        {/* Photo */}
        <div style={{ position: "relative", height: "clamp(200px, 40vw, 300px)", background: "#d6d3d1", overflow: "hidden" }}>
          {photoUrl ? (
            <img src={photoUrl} alt={place.name}
              style={{ width: "100%", maxWidth: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={() => setImgError(true)} />
          ) : (
            <div style={{
              width: "100%", height: "100%", display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, rgba(44,24,16,0.12), rgba(196,97,42,0.12))",
            }}>
              <span style={{ fontSize: 72, opacity: 0.2 }}>☕</span>
            </div>
          )}
          <div style={{ position: "absolute", top: 16, left: 16,
            background: "var(--espresso)", color: "var(--cream)",
            fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.25em",
            padding: "6px 12px", borderRadius: 4, transform: "rotate(-1.5deg)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            ★ Editor's Pick
          </div>
          {place.opening_hours || heartOverlay ? (
            <div style={{
              position: "absolute", top: 16, right: 16, zIndex: 5,
              display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
            }}>
              {heartOverlay}
              {place.opening_hours ? <OpenBadge openingHours={place.opening_hours} /> : null}
            </div>
          ) : null}
          {place.types?.[0] && (
            <div style={{
              position: "absolute", bottom: 16, left: 16,
              background: "rgba(44,24,16,0.75)", backdropFilter: "blur(4px)",
              color: "var(--cream)", fontSize: 9, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.15em",
              padding: "4px 10px", borderRadius: 999,
            }}>
              {place.types[0].replace(/_/g, " ")}
            </div>
          )}
          {persistedFavorited && (
            <div style={{
              position: "absolute", bottom: 16, right: 16, zIndex: 4,
              fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
              color: "var(--cream)", background: "rgba(196,97,42,0.92)",
              padding: "3px 8px", borderRadius: 999, pointerEvents: "none",
            }}>
              Favorited
            </div>
          )}
        </div>
 
        {/* Content */}
        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, minWidth: 0 }}>
            <PriceLevel level={place.price_level} />
            {bestFor.map((tag) => (
              <span key={tag} style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--terracotta)",
                background: "rgba(196,97,42,0.08)", padding: "3px 8px", borderRadius: 999,
              }}>{tag}</span>
            ))}
          </div>
 
          <h2 style={{
            fontFamily: "'Georgia','Times New Roman',serif",
            fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 900,
            color: "var(--espresso)", lineHeight: 1.15,
            margin: "0 0 6px", wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            {place.name}
          </h2>
          <p style={{ fontSize: 12, color: "#a8a29e", marginBottom: 12, lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "anywhere" }}>
            {place.formatted_address}
          </p>
 
          {editorLine && (
            <p style={{
              fontFamily: "'Georgia',serif", fontStyle: "italic",
              fontSize: 14, color: "var(--espresso)", opacity: 0.65,
              margin: "0 0 16px", lineHeight: 1.6,
              borderLeft: "3px solid var(--terracotta)", paddingLeft: 12,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              "{editorLine}"
            </p>
          )}

          {bestForSummary && (
            <p style={{
              fontSize: 12, fontWeight: 500, color: "var(--espresso)", opacity: 0.52,
              margin: "0 0 16px", lineHeight: 1.55,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              {bestForSummary}
            </p>
          )}

          {whyYoullLikeThis && (
            <p style={{
              fontSize: 12, fontWeight: 500, color: "var(--terracotta)", opacity: 0.7,
              margin: "0 0 16px", lineHeight: 1.55,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              {whyYoullLikeThis}
            </p>
          )}
 
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, minWidth: 0 }}>
            {place.rating ? (
              <>
                <StarRating rating={place.rating} />
                <span style={{ fontSize: 14, fontWeight: 900, color: "var(--terracotta)" }}>
                  {place.rating.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: "#a8a29e" }}>
                  ({place.user_ratings_total?.toLocaleString() ?? "—"} reviews)
                </span>
              </>
            ) : (
              <span style={{ fontSize: 11, color: "#d6d3d1", fontStyle: "italic" }}>No ratings yet</span>
            )}
          </div>
 
          <div style={{ borderTop: "1px solid rgba(26,16,8,0.08)", paddingTop: 16 }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.3em", color: "var(--terracotta)", marginBottom: 12 }}>
              Vibe Report
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {VIBE_PRESETS.map(({ key, label, emoji }) => (
                <VibeBar key={key} label={label} emoji={emoji} value={displayVibes[key]} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
 
  // ── Regular card ──────────────────────────────────────────────────────────
  return (
    <div onClick={onClick} style={{
      background: "var(--parchment)",
      border: persistedFavorited ? "1px solid rgba(196,97,42,0.26)" : "1px solid rgba(26,16,8,0.10)",
      borderRadius: 16,
      boxShadow: persistedFavorited
        ? "0 4px 16px rgba(44,24,16,0.13), 0 2px 6px rgba(196,97,42,0.11)"
        : "0 2px 12px rgba(44,24,16,0.10), 0 1px 3px rgba(44,24,16,0.06)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      cursor: onClick ? "pointer" : "default",
      maxWidth: "100%",
    }}>
      <div style={{ position: "relative", height: "clamp(140px, 25vw, 176px)", background: "#d6d3d1", overflow: "hidden", flexShrink: 0 }}>
        {photoUrl ? (
          <img src={photoUrl} alt={place.name}
            style={{ width: "100%", maxWidth: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setImgError(true)} />
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(44,24,16,0.10), rgba(196,97,42,0.10))",
          }}>
            <span style={{ fontSize: 48, opacity: 0.2 }}>☕</span>
          </div>
        )}
        {(heartOverlay || place.opening_hours) && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 5,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
        }}>
          {heartOverlay}
          <OpenBadge openingHours={place.opening_hours} />
        </div>
        )}
        {place.types?.[0] && (
          <div style={{
            position: "absolute", bottom: 10, left: 10,
            background: "rgba(44,24,16,0.75)", backdropFilter: "blur(4px)",
            color: "var(--cream)", fontSize: 9, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.15em",
            padding: "3px 8px", borderRadius: 999,
          }}>
            {place.types[0].replace(/_/g, " ")}
          </div>
        )}
        {persistedFavorited && (
          <div style={{
            position: "absolute", bottom: 10, right: 10, zIndex: 4,
            fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "var(--cream)", background: "rgba(196,97,42,0.92)",
            padding: "3px 8px", borderRadius: 999, pointerEvents: "none",
          }}>
            Favorited
          </div>
        )}
      </div>
 
      {/* Torn edge */}
      <div style={{ marginTop: -4, position: "relative", zIndex: 1 }}>
        <TornEdge />
      </div>
 
      <div style={{ padding: "4px 16px 20px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "'Georgia','Times New Roman',serif",
            fontSize: 17, fontWeight: 900, color: "var(--espresso)",
            lineHeight: 1.25, margin: 0, flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            {place.name}
          </h2>
          <PriceLevel level={place.price_level} />
        </div>
 
        <p style={{ fontSize: 11, color: "#a8a29e", marginBottom: 10, lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "anywhere" }}>
          {place.formatted_address}
        </p>
 
        {editorLine && (
          <p style={{
            fontFamily: "'Georgia',serif", fontStyle: "italic",
            fontSize: 12, color: "var(--espresso)", opacity: 0.6,
            margin: "0 0 10px", lineHeight: 1.5,
            borderLeft: "2px solid var(--terracotta)", paddingLeft: 8,
            wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            "{editorLine}"
          </p>
        )}

        {bestForSummary && (
          <p style={{
            fontSize: 11, fontWeight: 500, color: "var(--espresso)", opacity: 0.52,
            margin: "0 0 10px", lineHeight: 1.5,
            wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            {bestForSummary}
          </p>
        )}

        {whyYoullLikeThis && (
          <p style={{
            fontSize: 11, fontWeight: 500, color: "var(--terracotta)", opacity: 0.7,
            margin: "0 0 10px", lineHeight: 1.5,
            wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            {whyYoullLikeThis}
          </p>
        )}
 
        {bestFor.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {bestFor.map((tag) => (
              <span key={tag} style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "var(--terracotta)",
                background: "rgba(196,97,42,0.08)", padding: "2px 7px", borderRadius: 999,
              }}>{tag}</span>
            ))}
          </div>
        )}
 
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, minWidth: 0 }}>
          {place.rating ? (
            <>
              <StarRating rating={place.rating} />
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--terracotta)" }}>
                {place.rating.toFixed(1)}
              </span>
              <span style={{ fontSize: 10, color: "#a8a29e" }}>
                ({place.user_ratings_total?.toLocaleString() ?? "—"})
              </span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#d6d3d1", fontStyle: "italic" }}>No ratings yet</span>
          )}
        </div>
 
        <div style={{ borderTop: "1px solid rgba(26,16,8,0.08)", paddingTop: 12, marginTop: "auto" }}>
          <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase",
            letterSpacing: "0.3em", color: "var(--terracotta)", marginBottom: 10 }}>
            Vibe Report
          </p>
          {VIBE_PRESETS.map(({ key, label, emoji }) => (
            <VibeBar key={key} label={label} emoji={emoji} value={displayVibes[key]} />
          ))}
        </div>
      </div>
    </div>
  );
}
 
// ─── Skeleton ─────────────────────────────────────────────────────────────────
 
function Skeleton({ featured = false }) {
  if (featured) {
    return (
      <div style={{
        background: "var(--parchment)", border: "1px solid rgba(26,16,8,0.10)",
        borderRadius: 24, overflow: "hidden", marginBottom: 20,
        animation: "pulse 1.8s ease-in-out infinite",
        maxWidth: "100%",
      }}>
        <div style={{ height: "clamp(200px, 40vw, 300px)", background: "#e7e5e4" }} />
        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ height: 12, background: "#e7e5e4", borderRadius: 8, width: "30%", marginBottom: 14 }} />
          <div style={{ height: 36, background: "#e7e5e4", borderRadius: 8, width: "60%", marginBottom: 10 }} />
          <div style={{ height: 10, background: "#f5f5f4", borderRadius: 8, marginBottom: 20 }} />
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 8, background: "#f5f5f4", borderRadius: 8, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      background: "var(--parchment)", border: "1px solid rgba(26,16,8,0.10)",
      borderRadius: 16, overflow: "hidden",
      animation: "pulse 1.8s ease-in-out infinite",
      maxWidth: "100%",
    }}>
      <div style={{ height: "clamp(140px, 25vw, 176px)", background: "#e7e5e4" }} />
      <div style={{ padding: 16 }}>
        <div style={{ height: 14, background: "#e7e5e4", borderRadius: 8, width: "60%", marginBottom: 10 }} />
        <div style={{ height: 10, background: "#f5f5f4", borderRadius: 8, marginBottom: 8 }} />
        <div style={{ height: 10, background: "#f5f5f4", borderRadius: 8, width: "50%", marginBottom: 16 }} />
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 7, background: "#f5f5f4", borderRadius: 8, marginBottom: 7 }} />
        ))}
      </div>
    </div>
  );
}
 
// ─── PlaceDetailModal ────────────────────────────────────────────────────────────

function PlaceDetailModal({ place, onClose, isFavorite, onToggleFavorite }) {
  const [imgError, setImgError] = useState(false);
  const [vibes, setVibes] = useState(null);
  const [editorLine, setEditorLine] = useState(null);
  const [bestFor, setBestFor] = useState([]);

  useEffect(() => {
    if (!place?.place_id) {
      setVibes(scoreIntentVibes(place, []));
      return;
    }
    let cancelled = false;

    async function loadVibes() {
      try {
        const detailsRes = await fetch(`/api/places/details?placeId=${encodeURIComponent(place.place_id)}`);
        if (!detailsRes.ok) throw new Error("details failed");
        const details = await detailsRes.json();

        const reviews = details.result?.reviews ?? [];
        
        // Skip analyze call if no reviews available
        if (!reviews || reviews.length === 0) {
          console.log("No reviews available, skipping analyze for:", place.place_id);
          if (!cancelled) setVibes(scoreIntentVibes(place, []));
          return;
        }

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: place.place_id, placeName: place.name, reviews }),
        });
        if (!analyzeRes.ok) {
          const errorData = await analyzeRes.json().catch(() => ({ error: "Unknown error" }));
          console.error("Analyze API error:", errorData);
          throw new Error("analyze failed");
        }
        const analysis = await analyzeRes.json();

        if (cancelled) return;
        const fallback = scoreIntentVibes(place, reviews);
        setVibes({
          workFocus:     analysis.workFocus     ?? fallback.workFocus,
          socialEnergy:  analysis.socialEnergy  ?? fallback.socialEnergy,
          aesthetic:     analysis.aesthetic     ?? fallback.aesthetic,
          calmEscape:    analysis.calmEscape    ?? fallback.calmEscape,
          foodQuality:   analysis.foodQuality   ?? fallback.foodQuality,
          dateNight:     analysis.dateNight     ?? fallback.dateNight,
        });
        if (analysis.editorLine) setEditorLine(analysis.editorLine);
        if (Array.isArray(analysis.bestFor) && analysis.bestFor.length) setBestFor(analysis.bestFor);
      } catch {
        if (!cancelled) setVibes(scoreIntentVibes(place, []));
      }
    }

    loadVibes();
    return () => { cancelled = true; };
  }, [place?.place_id]);

  const displayVibes = vibes ?? scoreIntentVibes(place, []);
  const bestForSummary = buildBestForSummary(place, displayVibes);
  const dominantVibe = dominantVibeFromScores(displayVibes);
  const topVibes = topVibesFromScores(displayVibes);
  const photoRef = place?.photos?.[0]?.photo_reference;
  const photoUrl = photoRef && !imgError
    ? `/api/places/photo?ref=${encodeURIComponent(photoRef)}`
    : null;
  const favorited = Boolean(place?.place_id && isFavorite?.(place?.place_id));

  if (!place) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      background: "rgba(44,24,16,0.6)",
      backdropFilter: "blur(4px)",
      animation: "fadeIn 0.2s ease-out",
    }}>
      <div style={{
        background: "var(--parchment)",
        borderRadius: 24,
        maxWidth: 600,
        width: "100%",
        maxHeight: "90dvh",
        overflow: "auto",
        boxShadow: "0 8px 32px rgba(44,24,16,0.3)",
        position: "relative",
        animation: "slideUp 0.3s ease-out",
      }}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            background: "rgba(44,24,16,0.6)",
            color: "var(--cream)",
            fontSize: 24,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          ×
        </button>

        {/* Photo */}
        <div style={{ position: "relative", height: "clamp(200px, 50vw, 320px)", background: "#d6d3d1", overflow: "hidden" }}>
          {photoUrl ? (
            <img src={photoUrl} alt={place.name}
              style={{ width: "100%", maxWidth: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={() => setImgError(true)} />
          ) : (
            <div style={{
              width: "100%", height: "100%", display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, rgba(44,24,16,0.12), rgba(196,97,42,0.12))",
            }}>
              <span style={{ fontSize: 72, opacity: 0.2 }}>☕</span>
            </div>
          )}
          {place.opening_hours && (
            <div style={{
              position: "absolute", top: 16, left: 16,
              background: "rgba(44,24,16,0.75)", backdropFilter: "blur(4px)",
              color: "var(--cream)", fontSize: 9, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.15em",
              padding: "4px 10px", borderRadius: 999,
            }}>
              {place.opening_hours.open_now ? "Open Now" : "Closed"}
            </div>
          )}
          {place.types?.[0] && (
            <div style={{
              position: "absolute", bottom: 16, left: 16,
              background: "rgba(44,24,16,0.75)", backdropFilter: "blur(4px)",
              color: "var(--cream)", fontSize: 9, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.15em",
              padding: "4px 10px", borderRadius: 999,
            }}>
              {place.types[0].replace(/_/g, " ")}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: "28px 32px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, minWidth: 0 }}>
            <PriceLevel level={place.price_level} />
            {place.place_id && (
              <FavoriteHeartButton
                favorited={favorited}
                onClick={() => onToggleFavorite?.(place.place_id)}
              />
            )}
          </div>

          <h2 style={{
            fontFamily: "'Georgia','Times New Roman',serif",
            fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 900,
            color: "var(--espresso)", lineHeight: 1.15,
            margin: "0 0 8px", wordBreak: "break-word", overflowWrap: "anywhere",
          }}>
            {place.name}
          </h2>
          <p style={{ fontSize: 13, color: "#a8a29e", marginBottom: 12, lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "anywhere" }}>
            {place.formatted_address}
          </p>
          {place.place_id && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}&query_place_id=${encodeURIComponent(place.place_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--terracotta)",
                textDecoration: "none",
                marginBottom: 16,
                cursor: "pointer",
              }}
            >
              Get Directions →
            </a>
          )}

          {editorLine && (
            <p style={{
              fontFamily: "'Georgia',serif", fontStyle: "italic",
              fontSize: 15, color: "var(--espresso)", opacity: 0.65,
              margin: "0 0 20px", lineHeight: 1.6,
              borderLeft: "3px solid var(--terracotta)", paddingLeft: 14,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              "{editorLine}"
            </p>
          )}

          {bestForSummary && (
            <p style={{
              fontSize: 13, fontWeight: 500, color: "var(--espresso)", opacity: 0.52,
              margin: "0 0 20px", lineHeight: 1.55,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              {bestForSummary}
            </p>
          )}

          {bestFor.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, minWidth: 0 }}>
              {bestFor.map((tag) => (
                <span key={tag} style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--terracotta)",
                  background: "rgba(196,97,42,0.08)", padding: "3px 10px", borderRadius: 999,
                }}>{tag}</span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, minWidth: 0 }}>
            {place.rating ? (
              <>
                <StarRating rating={place.rating} />
                <span style={{ fontSize: 16, fontWeight: 900, color: "var(--terracotta)" }}>
                  {place.rating.toFixed(1)}
                </span>
                <span style={{ fontSize: 12, color: "#a8a29e" }}>
                  ({place.user_ratings_total?.toLocaleString() ?? "—"} reviews)
                </span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "#d6d3d1", fontStyle: "italic" }}>No ratings yet</span>
            )}
          </div>

          <div style={{ borderTop: "1px solid rgba(26,16,8,0.08)", paddingTop: 20, marginBottom: 24 }}>
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.3em", color: "var(--terracotta)", marginBottom: 12 }}>
              Why this place?
            </p>
            <p style={{ fontSize: 13, color: "var(--espresso)", lineHeight: 1.6, margin: 0, wordBreak: "break-word", overflowWrap: "anywhere" }}>
              Dominant vibe: <span style={{ fontWeight: 700, color: "var(--terracotta)" }}>
                {VIBE_PRESETS.find(p => p.key === dominantVibe)?.label || dominantVibe}
              </span>
            </p>
            <p style={{ fontSize: 13, color: "var(--espresso)", lineHeight: 1.6, margin: "8px 0 0", wordBreak: "break-word", overflowWrap: "anywhere" }}>
              Top vibes: {topVibes.map(v => VIBE_PRESETS.find(p => p.key === v)?.label || v).join(", ")}
            </p>
          </div>

          <div style={{ borderTop: "1px solid rgba(26,16,8,0.08)", paddingTop: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.3em", color: "var(--terracotta)", marginBottom: 16 }}>
              Vibe Breakdown
            </p>
            {bestForSummary && (
              <p style={{
                fontSize: 13, fontWeight: 500, color: "var(--espresso)", opacity: 0.7,
                marginBottom: 16, lineHeight: 1.55,
                wordBreak: "break-word", overflowWrap: "anywhere",
              }}>
                {bestForSummary}
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {VIBE_PRESETS.map(({ key, label, emoji }) => (
                <VibeBar key={key} label={label} emoji={emoji} value={displayVibes[key]} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Google Map Component ───────────────────────────────────────────────────────

function GoogleMap({ places, selectedPlace, onPlaceClick, isFavorite }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load Google Maps script dynamically
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.google && !scriptLoaded) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = () => {
        setScriptLoaded(true);
      };
      document.head.appendChild(script);
    } else if (window.google) {
      setScriptLoaded(true);
    }
  }, [scriptLoaded]);

  // Initialize map and markers
  useEffect(() => {
    if (!scriptLoaded || !mapRef.current || places.length === 0) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: places[0]?.geometry?.location?.lat || 37.7749, lng: places[0]?.geometry?.location?.lng || -122.4194 },
        zoom: 13,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        ],
      });
    }

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add markers for each place
    places.forEach((place) => {
      if (!place.geometry?.location) return;

      const scores = scoreIntentVibes(place, []);
      const dominant = dominantVibeFromScores(scores);

      const colorMap = {
        workFocus: "#22c55e",    // green
        socialEnergy: "#f97316", // orange
        aesthetic: "#a855f7",    // purple
        calmEscape: "#3b82f6",   // blue
        foodQuality: "#eab308",  // yellow
        dateNight: "#ef4444",    // red
      };

      const markerColor = colorMap[dominant] || "#6b7280";

      const marker = new window.google.maps.Marker({
        position: { lat: place.geometry.location.lat, lng: place.geometry.location.lng },
        map: mapInstanceRef.current,
        title: place.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: markerColor,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => {
        onPlaceClick(place);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds to show all markers
    if (markersRef.current.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markersRef.current.forEach(marker => bounds.extend(marker.getPosition()));
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [scriptLoaded, places, onPlaceClick]);

  if (!scriptLoaded) {
    return (
      <div style={{ height: 500, background: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#666" }}>Loading map...</p>
      </div>
    );
  }

  return <div ref={mapRef} style={{ width: "100%", height: 500, borderRadius: 16, overflow: "hidden" }} />;
}

// ─── Home ─────────────────────────────────────────────────────────────────────
 
export default function Home() {
  const [query,     setQuery]     = useState("");
  const [placeType, setPlaceType] = useState("café");
  const [results,   setResults]   = useState([]);
  const [feedResults, setFeedResults] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [error,     setError]     = useState("");
  const [searched,  setSearched]  = useState(false);
  const [selectedIntent, setSelectedIntent] = useState(null);
  const [viewMode,  setViewMode]  = useState("list"); // "list" or "map"
  const rawResultsRef = useRef([]);
  const feedRawResultsRef = useRef([]);

  const [favorites, setFavorites] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [tasteProfile, setTasteProfile] = useState(null);

  // Log Google Maps API key in development mode
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("MAP KEY LOADED", process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      setFavorites(loadFavoritesPlaceIdsFromStorage());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TASTE_PROFILE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.preferredIntents) {
          setTasteProfile(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Load For You Feed on mount
  useEffect(() => {
    async function loadFeed() {
      console.log("Loading For You Feed...");
      setFeedLoading(true);
      try {
        // Use default query for feed
        const searchQuery = "cafes near me";
        const searchPlaceType = "café";

        console.log("Fetching feed with query:", searchQuery);
        const res = await fetch(`/api/places?query=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        
        if (res.ok) {
          console.log("Feed API response:", data.results?.length, "places");
          feedRawResultsRef.current = data.results ?? [];
          const enriched = rankAndEnrichPlaces(feedRawResultsRef.current, null, searchPlaceType, tasteProfile);
          console.log("Setting feedResults with", enriched.length, "places");
          setFeedResults(enriched);
        } else {
          console.error("Feed API error:", data.error);
        }
      } catch (err) {
        console.error("Feed loading error:", err);
      } finally {
        setFeedLoading(false);
      }
    }

    loadFeed();
  }, []);

  function isFavorite(placeId) {
    return Boolean(placeId && favorites.includes(placeId));
  }

  function toggleFavorite(placeId) {
    if (!placeId) return;
    setFavorites((prev) => {
      const next = prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function computeTasteProfile() {
    const favoriteIds = loadFavoritesPlaceIdsFromStorage();
    if (!favoriteIds.length) {
      setTasteProfile(null);
      return;
    }

    const profile = {
      preferredIntents: {
        workFocus: 0,
        socialEnergy: 0,
        aesthetic: 0,
        calmEscape: 0,
        foodQuality: 0,
        dateNight: 0,
      },
      preferredPlaceTypes: {},
      averagePriceLevel: 0,
    };

    let totalPriceLevel = 0;
    let placeCount = 0;

    for (const placeId of favoriteIds) {
      try {
        const detailsRes = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (!detailsRes.ok) continue;
        const details = await detailsRes.json();
        const place = details.result;

        if (!place) continue;

        const reviews = place.reviews ?? [];
        
        // Skip analyze call if no reviews available
        if (!reviews || reviews.length === 0) {
          vibes = scoreIntentVibes(place, reviews);
        } else {
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId, placeName: place.name, reviews }),
          });
          let vibes;
          if (analyzeRes.ok) {
            const analysis = await analyzeRes.json();
            const fallback = scoreIntentVibes(place, reviews);
            vibes = {
              workFocus: analysis.workFocus ?? fallback.workFocus,
              socialEnergy: analysis.socialEnergy ?? fallback.socialEnergy,
              aesthetic: analysis.aesthetic ?? fallback.aesthetic,
              calmEscape: analysis.calmEscape ?? fallback.calmEscape,
              foodQuality: analysis.foodQuality ?? fallback.foodQuality,
              dateNight: analysis.dateNight ?? fallback.dateNight,
            };
          } else {
            const errorData = await analyzeRes.json().catch(() => ({ error: "Unknown error" }));
            console.error("Analyze API error in taste profile:", errorData);
            vibes = scoreIntentVibes(place, reviews);
          }
        }

        profile.preferredIntents.workFocus += vibes.workFocus ?? 0;
        profile.preferredIntents.socialEnergy += vibes.socialEnergy ?? 0;
        profile.preferredIntents.aesthetic += vibes.aesthetic ?? 0;
        profile.preferredIntents.calmEscape += vibes.calmEscape ?? 0;
        profile.preferredIntents.foodQuality += vibes.foodQuality ?? 0;
        profile.preferredIntents.dateNight += vibes.dateNight ?? 0;

        if (place.price_level) {
          totalPriceLevel += place.price_level;
        }

        if (place.types && place.types.length > 0) {
          const primaryType = place.types[0].toLowerCase().replace(/_/g, " ");
          profile.preferredPlaceTypes[primaryType] = (profile.preferredPlaceTypes[primaryType] || 0) + 1;
        }

        placeCount++;
      } catch {
        continue;
      }
    }

    if (placeCount > 0) {
      profile.preferredIntents.workFocus = Math.round(profile.preferredIntents.workFocus / placeCount);
      profile.preferredIntents.socialEnergy = Math.round(profile.preferredIntents.socialEnergy / placeCount);
      profile.preferredIntents.aesthetic = Math.round(profile.preferredIntents.aesthetic / placeCount);
      profile.preferredIntents.calmEscape = Math.round(profile.preferredIntents.calmEscape / placeCount);
      profile.preferredIntents.foodQuality = Math.round(profile.preferredIntents.foodQuality / placeCount);
      profile.preferredIntents.dateNight = Math.round(profile.preferredIntents.dateNight / placeCount);
      profile.averagePriceLevel = Math.round((totalPriceLevel / placeCount) * 10) / 10;
    }

    setTasteProfile(profile);
    try {
      localStorage.setItem(TASTE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!rawResultsRef.current.length) return;
    setResults(rankAndEnrichPlaces(rawResultsRef.current, selectedIntent, placeType, tasteProfile));
  }, [selectedIntent, placeType, favorites, tasteProfile]);

  useEffect(() => {
    if (!feedRawResultsRef.current.length) return;
    const lastPlaceType = localStorage.getItem("last_place_type") || "café";
    setFeedResults(rankAndEnrichPlaces(feedRawResultsRef.current, selectedIntent, lastPlaceType, tasteProfile));
  }, [selectedIntent, tasteProfile]);

  useEffect(() => {
    computeTasteProfile();
  }, [favorites]);

  // Transform query with cuisine/intent keywords for better API results
  function transformSearchQuery(inputQuery, currentPlaceType) {
    const lowerQuery = inputQuery.toLowerCase();
    let transformedQuery = inputQuery;
    let transformedPlaceType = currentPlaceType;

    // Detect cuisine/intent keywords and enhance query
    if (lowerQuery.includes('pho') || lowerQuery.includes('vietnamese')) {
      transformedQuery = inputQuery + ' Vietnamese restaurant';
      transformedPlaceType = 'restaurant';
    } else if (lowerQuery.includes('chinese')) {
      transformedQuery = inputQuery + ' Chinese restaurant dim sum';
      transformedPlaceType = 'restaurant';
    } else if (lowerQuery.includes('japanese') || lowerQuery.includes('sushi')) {
      transformedQuery = inputQuery + ' Japanese restaurant sushi';
      transformedPlaceType = 'restaurant';
    } else if (lowerQuery.includes('korean')) {
      transformedQuery = inputQuery + ' Korean restaurant Korean BBQ';
      transformedPlaceType = 'restaurant';
    } else if (lowerQuery.includes('dessert') || lowerQuery.includes('sweets') || lowerQuery.includes('bakery')) {
      transformedQuery = inputQuery + ' dessert cafe bakery sweets';
      transformedPlaceType = 'bakery';
    } else if (lowerQuery.includes('coffee') || lowerQuery.includes('café') || lowerQuery.includes('cafe')) {
      transformedQuery = inputQuery + ' café coffee shop';
      transformedPlaceType = 'café';
    } else if (lowerQuery.includes('bar') || lowerQuery.includes('drinks') || lowerQuery.includes('nightlife')) {
      transformedQuery = inputQuery + ' bar drinks nightlife';
      transformedPlaceType = 'bar';
    } else if (lowerQuery.includes('study') || lowerQuery.includes('work') || lowerQuery.includes('quiet')) {
      transformedQuery = inputQuery + ' quiet café coffee shop work friendly';
      transformedPlaceType = 'café';
    }

    return { transformedQuery, transformedPlaceType };
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    rawResultsRef.current = [];
    setResults([]);
    setSearched(true);
    
    // Transform query with cuisine/intent keywords for better API results
    const { transformedQuery, transformedPlaceType } = transformSearchQuery(query, placeType);
    
    // Save original query for display purposes
    try {
      localStorage.setItem("last_search_query", query);
      localStorage.setItem("last_place_type", transformedPlaceType);
    } catch {
      /* ignore */
    }
    
    try {
      // Use transformed query for API call
      const res  = await fetch(`/api/places?query=${encodeURIComponent(`${transformedPlaceType} in ${transformedQuery}`)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      rawResultsRef.current = data.results ?? [];
      setResults(rankAndEnrichPlaces(rawResultsRef.current, selectedIntent, transformedPlaceType, tasteProfile));
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const placeTypes = ["café", "restaurant", "bar", "bakery", "market", "park", "dessert cafe"];

  const visibleResults = useMemo(() => {
    if (!showFavoritesOnly) return results;
    const fav = new Set(favorites);
    return results.filter((p) => p.place_id && fav.has(p.place_id));
  }, [results, showFavoritesOnly, favorites]);

  const visibleFeedResults = useMemo(() => {
    if (!showFavoritesOnly) return feedResults;
    const fav = new Set(favorites);
    return feedResults.filter((p) => p.place_id && fav.has(p.place_id));
  }, [feedResults, showFavoritesOnly, favorites]);
 
  return (
    <>
      <style>{`
        :root {
          --espresso:       #2C1810;
          --parchment:      #F5EDD8;
          --parchment-dark: #EAD9B8;
          --cream:          #FDF6E3;
          --terracotta:     #C4612A;
          --ink:            #1A1008;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
 
        .hero-grain::after {
          content: '';
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
          pointer-events: none; opacity: 0.4; mix-blend-mode: overlay;
        }
        .hero-dots::before {
          content: '';
          position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(253,246,227,0.12) 1px, transparent 1px);
          background-size: 18px 18px; pointer-events: none;
        }
        .place-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 640px)  { .place-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .place-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>
 
      <main style={{ minHeight: "100dvh", background: "var(--cream)", fontFamily: "system-ui,sans-serif" }}>
 
        {/* ── HERO ── */}
        <header className="hero-grain hero-dots" style={{
          position: "relative", overflow: "hidden",
          background: "linear-gradient(160deg, var(--espresso) 0%, #3D1F0F 50%, #5C2D12 100%)",
          paddingTop: "5rem", paddingBottom: "4rem",
        }}>
          <div style={{ position:"absolute", right:-64, top:-64, width:320, height:320,
            borderRadius:"50%", background:"var(--terracotta)", opacity:0.10, pointerEvents:"none" }} />
          <div style={{ position:"absolute", left:-32, bottom:0, width:192, height:192,
            borderRadius:"50%", background:"var(--parchment)", opacity:0.05, pointerEvents:"none" }} />
 
          <div style={{ position:"relative", maxWidth:896, margin:"0 auto", padding:"0 24px", textAlign:"center" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:12, marginBottom:24 }}>
              <span style={{ height:1, width:48, background:"rgba(196,97,42,0.6)", display:"block" }} />
              <span style={{ color:"var(--terracotta)", fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.4em" }}>
                A Field Guide to Your City
              </span>
              <span style={{ height:1, width:48, background:"rgba(196,97,42,0.6)", display:"block" }} />
            </div>
 
            <h1 style={{
              fontFamily:"'Georgia','Times New Roman',serif",
              fontSize:"clamp(3.5rem, 10vw, 7rem)", fontWeight:900,
              color:"var(--cream)", lineHeight:1, letterSpacing:"-0.02em", margin:"0 0 16px",
            }}>
              Local <em style={{ color:"var(--terracotta)", fontStyle:"italic" }}>Vibes</em>
            </h1>
 
            <div style={{
              display:"inline-block",
              borderTop:"1px solid rgba(253,246,227,0.15)",
              borderBottom:"1px solid rgba(253,246,227,0.15)",
              padding:"12px 24px", marginBottom:24,
            }}>
              <p style={{
                fontFamily:"'Georgia',serif", fontStyle:"italic",
                fontSize:15, color:"var(--parchment)", opacity:0.75,
                maxWidth:420, margin:"0 auto", lineHeight:1.6,
              }}>
                Skip the algorithm. Find places with soul — the ones your barista actually goes to.
              </p>
            </div>
 
            <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.35em",
              color:"rgba(245,237,216,0.3)", margin:0 }}>
              Vol. I &nbsp;·&nbsp; {new Date().toLocaleDateString("en-US", { month:"long", year:"numeric" })} Edition
            </p>
          </div>
 
          {/* Torn bottom edge */}
          <div style={{ position:"absolute", bottom:0, left:0, right:0 }}>
            <svg viewBox="0 0 400 20" xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none" style={{ width:"100%", height:20, display:"block" }}>
              <path d="M0,20 L0,8 Q10,2 20,10 Q30,18 45,6 Q55,0 70,9 Q82,16 95,5 Q108,0 118,11 Q130,18 145,7 Q158,0 170,8 Q182,16 195,4 Q207,0 220,10 Q232,18 248,5 Q260,0 272,9 Q285,17 298,6 Q310,0 325,11 Q337,18 350,7 Q362,0 375,8 Q388,16 400,5 L400,20 Z"
                fill="var(--cream)" />
            </svg>
          </div>
        </header>
 
        {/* ── STICKY SEARCH ── */}
        <div style={{
          position:"sticky", top:0, zIndex:20,
          background:"var(--espresso)",
          borderBottom:"1px solid rgba(245,237,216,0.1)",
          boxShadow:"0 4px 20px rgba(44,24,16,0.3)",
          padding:16,
        }}>
          <form onSubmit={handleSearch} style={{
            maxWidth:672, margin:"0 auto",
            display:"flex", flexWrap:"wrap", gap:8, minWidth:0,
          }}>
            <select value={placeType} onChange={(e) => setPlaceType(e.target.value)}
              style={{
                background:"rgba(245,237,216,0.1)", color:"var(--parchment)",
                border:"1px solid rgba(245,237,216,0.2)", borderRadius:12,
                padding:"10px 12px", fontSize:14, fontWeight:600,
                cursor:"pointer", outline:"none",
              }}>
              {placeTypes.map((t) => (
                <option key={t} value={t} style={{ background:"var(--espresso)" }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
 
            <div style={{ flex:1, minWidth:0, display:"flex", gap:8 }}>
              <input type="text" value={query} onChange={(e) => {
                const newQuery = e.target.value;
                setQuery(newQuery);
                // If query is cleared, restore feed
                if (!newQuery.trim() && searched) {
                  setSearched(false);
                  setResults([]);
                  setError("");
                }
              }}
                placeholder="City or neighborhood…"
                style={{
                  flex:1, minWidth:0, background:"var(--parchment)", color:"var(--espresso)",
                  border:"1px solid rgba(44,24,16,0.2)", borderRadius:12,
                  padding:"10px 16px", fontSize:14, outline:"none",
                }} />
              <button type="submit" disabled={loading} style={{
                background:"var(--terracotta)", color:"var(--cream)",
                border:"none", borderRadius:12, padding:"10px 20px",
                fontSize:14, fontWeight:700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1, whiteSpace:"nowrap",
              }}>
                {loading ? "…" : "Find Spots"}
              </button>
            </div>
          </form>
        </div>
 
        {/* ── RESULTS ── */}
        <section style={{ maxWidth:1152, margin:"0 auto", padding:"40px 16px" }}>

          {/* View Toggle */}
          {(!loading && (results.length > 0 || visibleFeedResults.length > 0)) && (
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                background: "var(--parchment)",
                borderRadius: 999,
                padding: 4,
                display: "flex",
                gap: 4,
                border: "1px solid rgba(44,24,16,0.15)",
              }}>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: viewMode === "list" ? "var(--espresso)" : "transparent",
                    color: viewMode === "list" ? "var(--cream)" : "var(--espresso)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  List View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: viewMode === "map" ? "var(--espresso)" : "transparent",
                    color: viewMode === "map" ? "var(--cream)" : "var(--espresso)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  Map View
                </button>
              </div>
            </div>
          )}
 
          {error && (
            <div style={{
              background:"#fef2f2", border:"1px solid #fecaca", color:"#b91c1c",
              fontSize:14, borderRadius:12, padding:"12px 16px", marginBottom:24,
            }}>
              ⚠️ {error}
            </div>
          )}
 
          {loading && (
            <>
              <Skeleton featured />
              <div className="place-grid">
                {[1,2,3,4,5].map((i) => <Skeleton key={i} />)}
              </div>
            </>
          )}
 
          {!loading && results.length > 0 && (
            <>
              {viewMode === "list" && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <p style={{
                      fontSize: 9, fontWeight: 900, textTransform: "uppercase",
                      letterSpacing: "0.25em", color: "var(--terracotta)", margin: "0 0 10px",
                    }}>
                      Rank by intent
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {INTENT_FILTER_OPTIONS.map((opt) => {
                        const active =
                          (opt.key === null && selectedIntent === null) ||
                          (opt.key !== null && opt.key === selectedIntent);
                        return (
                          <button
                            key={opt.key === null ? "all" : opt.key}
                            type="button"
                            onClick={() => setSelectedIntent(opt.key)}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "8px 14px",
                              borderRadius: 999,
                              border: active
                                ? "1px solid var(--terracotta)"
                                : "1px solid rgba(44,24,16,0.15)",
                              background: active ? "rgba(196,97,42,0.12)" : "var(--parchment)",
                              color: active ? "var(--terracotta)" : "var(--espresso)",
                              cursor: "pointer",
                              outline: "none",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowFavoritesOnly((v) => !v)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "8px 14px",
                          borderRadius: 999,
                          marginLeft: "auto",
                          border: showFavoritesOnly
                            ? "1px solid var(--terracotta)"
                            : "1px solid rgba(44,24,16,0.15)",
                          background: showFavoritesOnly ? "rgba(196,97,42,0.12)" : "var(--parchment)",
                          color: showFavoritesOnly ? "var(--terracotta)" : "var(--espresso)",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        Favorites only
                      </button>
                    </div>
                  </div>

                  {showFavoritesOnly && visibleResults.length === 0 ? (
                    <p style={{
                      fontSize: 13, color: "var(--espresso)", opacity: 0.5, marginBottom: 20, lineHeight: 1.5,
                    }}>
                      No favorited spots in these results.
                    </p>
                  ) : (
                    <>
                    {/* Section header */}
                    <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
                      <span style={{ fontSize:9, fontWeight:900, textTransform:"uppercase",
                        letterSpacing:"0.4em", color:"var(--terracotta)" }}>
                        {visibleResults.length} Spots Reviewed
                      </span>
                      <span style={{ height:1, flex:1, background:"rgba(44,24,16,0.12)" }} />
                      <span style={{ fontSize:9, fontWeight:900, textTransform:"uppercase",
                        letterSpacing:"0.4em", color:"var(--espresso)", opacity:0.4 }}>
                        {query}
                      </span>
                    </div>

                    {/* Featured card — standalone block, fully outside the grid */}
                    <PlaceCard place={visibleResults[0]} featured isFavorite={isFavorite} onToggleFavorite={toggleFavorite} onClick={() => setSelectedPlace(visibleResults[0])} tasteProfile={tasteProfile} />

                    {/* Regular cards grid */}
                    {visibleResults.length > 1 && (
                      <div className="place-grid">
                        {visibleResults.slice(1).map((place) => (
                          <PlaceCard key={place.place_id} place={place} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} onClick={() => setSelectedPlace(place)} tasteProfile={tasteProfile} />
                        ))}
                      </div>
                    )}
                    </>
                  )}
                </>
              )}

              {viewMode === "map" && (
                <GoogleMap
                  places={visibleResults}
                  selectedPlace={selectedPlace}
                  onPlaceClick={setSelectedPlace}
                  isFavorite={isFavorite}
                />
              )}
            </>
          )}
 
          {!loading && searched && results.length === 0 && !error && (
            <div style={{ textAlign:"center", padding:"80px 0" }}>
              <span style={{ fontSize:64, display:"block", marginBottom:16, opacity:0.3 }}>🌿</span>
              <p style={{ fontSize:14, color:"var(--espresso)", opacity:0.5 }}>
                No spots found. Try a different city or type.
              </p>
            </div>
          )}
 
          {!loading && !searched && (
            <>
              {console.log("Render check - feedLoading:", feedLoading, "visibleFeedResults.length:", visibleFeedResults.length, "searched:", searched)}
              {feedLoading && (
                <>
                  <Skeleton featured />
                  <div className="place-grid">
                    {[1,2,3,4,5].map((i) => <Skeleton key={i} />)}
                  </div>
                </>
              )}

              {!feedLoading && visibleFeedResults.length > 0 && (
                <>
                  {viewMode === "list" && (
                    <>
                      <div style={{ marginBottom: 20 }}>
                        <p style={{
                          fontSize: 9, fontWeight: 900, textTransform: "uppercase",
                          letterSpacing: "0.25em", color: "var(--terracotta)", margin: "0 0 10px",
                        }}>
                          For You
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          {INTENT_FILTER_OPTIONS.map((opt) => {
                            const active =
                              (opt.key === null && selectedIntent === null) ||
                              (opt.key !== null && opt.key === selectedIntent);
                            return (
                              <button
                                key={opt.key === null ? "all" : opt.key}
                                type="button"
                                onClick={() => setSelectedIntent(opt.key)}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  padding: "8px 14px",
                                  borderRadius: 999,
                                  border: active
                                    ? "1px solid var(--terracotta)"
                                    : "1px solid rgba(44,24,16,0.15)",
                                  background: active ? "rgba(196,97,42,0.12)" : "var(--parchment)",
                                  color: active ? "var(--terracotta)" : "var(--espresso)",
                                  cursor: "pointer",
                                  outline: "none",
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setShowFavoritesOnly((v) => !v)}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "8px 14px",
                              borderRadius: 999,
                              marginLeft: "auto",
                              border: showFavoritesOnly
                                ? "1px solid var(--terracotta)"
                                : "1px solid rgba(44,24,16,0.15)",
                              background: showFavoritesOnly ? "rgba(196,97,42,0.12)" : "var(--parchment)",
                              color: showFavoritesOnly ? "var(--terracotta)" : "var(--espresso)",
                              cursor: "pointer",
                              outline: "none",
                            }}
                          >
                            Favorites only
                          </button>
                        </div>
                      </div>

                      {showFavoritesOnly && visibleFeedResults.length === 0 ? (
                        <p style={{
                          fontSize: 13, color: "var(--espresso)", opacity: 0.5, marginBottom: 20, lineHeight: 1.5,
                        }}>
                          No favorited spots in your feed.
                        </p>
                      ) : (
                        <>
                          {/* Section header */}
                          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
                            <span style={{ fontSize:9, fontWeight:900, textTransform:"uppercase",
                              letterSpacing:"0.4em", color:"var(--terracotta)" }}>
                              {visibleFeedResults.length} Spots For You
                            </span>
                            <span style={{ height:1, flex:1, background:"rgba(44,24,16,0.12)" }} />
                          </div>

                          {/* Featured card — standalone block, fully outside the grid */}
                          <PlaceCard place={visibleFeedResults[0]} featured isFavorite={isFavorite} onToggleFavorite={toggleFavorite} onClick={() => setSelectedPlace(visibleFeedResults[0])} tasteProfile={tasteProfile} />

                          {/* Regular cards grid */}
                          {visibleFeedResults.length > 1 && (
                            <div className="place-grid">
                              {visibleFeedResults.slice(1).map((place) => (
                                <PlaceCard key={place.place_id} place={place} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} onClick={() => setSelectedPlace(place)} tasteProfile={tasteProfile} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {viewMode === "map" && (
                    <GoogleMap
                      places={visibleFeedResults}
                      selectedPlace={selectedPlace}
                      onPlaceClick={setSelectedPlace}
                      isFavorite={isFavorite}
                    />
                  )}
                </>
              )}

              {!feedLoading && visibleFeedResults.length === 0 && (
                <div style={{ textAlign:"center", padding:"80px 0", maxWidth:320, margin:"0 auto" }}>
                  <span style={{ fontSize:72, display:"block", marginBottom:20, opacity:0.2 }}>☕</span>
                  <p style={{
                    fontSize:14, lineHeight:1.7, color:"var(--espresso)", opacity:0.45,
                    fontFamily:"'Georgia',serif", fontStyle:"italic",
                  }}>
                    Every neighborhood has a hidden gem. Type yours above and we'll find it.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
 
        {/* ── FOOTER ── */}
        <footer style={{
          textAlign:"center", padding:"32px 0",
          borderTop:"1px solid rgba(44,24,16,0.1)",
          fontSize:10, fontWeight:600, textTransform:"uppercase",
          letterSpacing:"0.2em", color:"var(--espresso)", opacity:0.35,
        }}>
          Powered by Google Places &nbsp;·&nbsp; Vibe scores are illustrative
        </footer>
      </main>

      {/* Place Detail Modal */}
      {selectedPlace && (
        <PlaceDetailModal
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </>
  );
}


