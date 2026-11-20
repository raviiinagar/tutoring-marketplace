import type { PoolClient } from "pg";
import type { Database } from "./database.js";

/** City-level coordinates for the "Your city" map. Never an address, never per account. */
export type Coordinates = { latitude: number; longitude: number };
type Place = { city?: string | null; state?: string | null; country?: string | null } | null | undefined;
export type Geocoder = (query: string) => Promise<Coordinates | null>;

const RETRY_FAILED_AFTER_MS = 24 * 3600 * 1000;

export function placeKey(place: Place): string | undefined {
  if (!place?.city) return undefined;
  const key = [place.city, place.state, place.country]
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
  return key.length ? key.slice(0, 300) : undefined;
}

/**
 * OpenStreetMap Nominatim search (free, no key). Its usage policy asks for an identifying
 * User-Agent and at most one request per second, so calls are serialised and spaced out.
 */
export function nominatimGeocoder(options: {
  url: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Geocoder {
  const fetchImpl = options.fetchImpl ?? fetch;
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;
  return (query) => {
    const run = queue.then(async () => {
      const wait = last + 1100 - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      last = Date.now();
      const url = new URL(options.url);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url, {
        headers: { "User-Agent": options.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      });
      if (!response.ok) throw new Error("GEOCODER_" + response.status);
      const rows = (await response.json()) as { lat?: string; lon?: string }[];
      const latitude = Number(rows?.[0]?.lat),
        longitude = Number(rows?.[0]?.lon);
      return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
        ? { latitude, longitude }
        : null;
    });
    queue = run.catch(() => undefined);
    return run;
  };
}

export class PlaceCoordinates {
  constructor(
    private readonly db: Database,
    private readonly geocoder: Geocoder | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Cached coordinates only; never calls out. */
  async cached(client: PoolClient, place: Place): Promise<Coordinates | null> {
    const key = placeKey(place);
    if (!key) return null;
    const row = (
      await client.query("SELECT latitude,longitude FROM place_coordinates WHERE place_key=$1", [key])
    ).rows[0];
    return row && row.latitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null;
  }

  /**
   * Looks the place up once and caches the result (including a miss, retried after a day).
   * Best effort: any failure leaves the card without a map and never blocks the caller.
   */
  async ensure(place: Place): Promise<Coordinates | null> {
    const key = placeKey(place);
    if (!key || !this.geocoder) return null;
    try {
      const row = (
        await this.db.pool.query(
          "SELECT latitude,longitude,fetched_at FROM place_coordinates WHERE place_key=$1",
          [key],
        )
      ).rows[0];
      if (row?.latitude !== null && row?.latitude !== undefined)
        return { latitude: row.latitude, longitude: row.longitude };
      if (row && this.now().getTime() - new Date(row.fetched_at).getTime() < RETRY_FAILED_AFTER_MS)
        return null;
      const found = await this.geocoder(key);
      await this.db.pool.query(
        `INSERT INTO place_coordinates(place_key,latitude,longitude,source,fetched_at) VALUES($1,$2,$3,'NOMINATIM',$4)
         ON CONFLICT(place_key) DO UPDATE SET latitude=$2,longitude=$3,fetched_at=$4`,
        [key, found?.latitude ?? null, found?.longitude ?? null, this.now()],
      );
      return found;
    } catch {
      return null;
    }
  }
}
