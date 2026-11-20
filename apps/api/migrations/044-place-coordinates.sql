-- Map coordinates for a Tutor's public city (owner-approved "Your city" card, 20 Nov 2026).
-- A shared cache keyed by the normalised public place text ("city, state, country"). It holds
-- no account data: many Tutors in one city share one row. A row with no coordinates records
-- a failed lookup so it is not retried on every visit.
CREATE TABLE place_coordinates (
  place_key text PRIMARY KEY CHECK (length(place_key) BETWEEN 1 AND 300),
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  source text NOT NULL CHECK (source IN ('NOMINATIM')),
  fetched_at timestamptz NOT NULL,
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);
