import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../config';

interface Coordinates {
  lon: number;
  lat: number;
}

export interface TravelEstimate {
  distanceKm: number;
  durationMinutes: number;
}

const GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';
const MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const REQUEST_TIMEOUT_MS = 5000;
// Appointment start times are derived from this duration (as the travel
// buffer) — a raw "13 minutes" produces an ugly 09:22 start time. Rounding
// UP to the nearest 15 minutes keeps generated times on the same clean
// grid as everything else (SLOT_STEP_MINUTES) and never underestimates the
// actual trip.
const DURATION_ROUNDING_STEP_MINUTES = 15;

// Driving distance/duration between two French addresses via
// OpenRouteService (free tier, no card required). Every failure mode
// (disabled, network error, address not found, quota exceeded) resolves to
// null rather than throwing — callers fall back to the flat base travel
// fee, so a geocoding outage never blocks a booking.
@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);

  // The studio address never changes at runtime — geocode it once and
  // reuse the coordinates instead of hitting the API on every estimate.
  private originCache: Coordinates | null = null;

  async estimate(originAddress: string, destinationAddress: string): Promise<TravelEstimate | null> {
    if (!config.GEOCODING_ENABLED) return null;

    try {
      const origin = this.originCache ?? (await this.geocode(originAddress));
      if (!origin) return null;
      this.originCache = origin;

      const destination = await this.geocode(destinationAddress);
      if (!destination) return null;

      return await this.route(origin, destination);
    } catch (err) {
      this.logger.warn(`Travel distance estimate failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async geocode(address: string): Promise<Coordinates | null> {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('api_key', config.GEOCODING_API_KEY);
    url.searchParams.set('text', address);
    url.searchParams.set('size', '1');
    url.searchParams.set('boundary.country', 'FR');

    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;

    const body: any = await res.json();
    const coords = body?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    return { lon: coords[0], lat: coords[1] };
  }

  private async route(origin: Coordinates, destination: Coordinates): Promise<TravelEstimate | null> {
    const res = await fetch(MATRIX_URL, {
      method: 'POST',
      headers: { Authorization: config.GEOCODING_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          [origin.lon, origin.lat],
          [destination.lon, destination.lat],
        ],
        metrics: ['distance', 'duration'],
        sources: [0],
        destinations: [1],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body: any = await res.json();
    const distanceMeters = body?.distances?.[0]?.[0];
    const durationSeconds = body?.durations?.[0]?.[0];
    if (typeof distanceMeters !== 'number' || typeof durationSeconds !== 'number') return null;

    return {
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.ceil(durationSeconds / 60 / DURATION_ROUNDING_STEP_MINUTES) * DURATION_ROUNDING_STEP_MINUTES,
    };
  }
}
