import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { Database, migrate } from "../src/database.js";
import { PlaceCoordinates, nominatimGeocoder, placeKey } from "../src/place-coordinates.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let database: Database;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date("2026-11-20T10:00:00Z");
const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });

before(async () => {
  const directory = resolve(".local/tests", randomUUID());
  const url = `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${await freePort()}/place_coordinates_test`;
  cluster = await startDatabase(url, join(directory, "postgres"));
  database = new Database(url);
  await migrate(database);
});
after(async () => {
  await database?.close();
  await cluster?.stop();
});

test("place keys are city level and normalised", () => {
  assert.equal(placeKey({ city: " Kota ", state: "Rajasthan", country: "India" }), "kota, rajasthan, india");
  assert.equal(placeKey({ city: "New  Delhi", country: "India" }), "new delhi, india");
  assert.equal(placeKey(null), undefined);
  assert.equal(placeKey({ city: "" }), undefined);
});

test("a city is looked up once, cached, and shared; a miss is retried only after a day", async () => {
  const calls: string[] = [];
  let answer: { latitude: number; longitude: number } | null = { latitude: 25.18, longitude: 75.84 };
  const places = new PlaceCoordinates(
    database,
    async (query) => {
      calls.push(query);
      return answer;
    },
    () => clock,
  );
  const kota = { city: "Kota", state: "Rajasthan", country: "India" };
  assert.deepEqual(await places.ensure(kota), { latitude: 25.18, longitude: 75.84 });
  assert.deepEqual(await places.ensure({ ...kota, city: "KOTA" }), { latitude: 25.18, longitude: 75.84 });
  assert.deepEqual(calls, ["kota, rajasthan, india"]);
  const client = await database.pool.connect();
  try {
    assert.deepEqual(await places.cached(client, kota), { latitude: 25.18, longitude: 75.84 });
  } finally {
    client.release();
  }

  answer = null;
  const nowhere = { city: "Fictional Nowhere", country: "India" };
  assert.equal(await places.ensure(nowhere), null);
  assert.equal(await places.ensure(nowhere), null);
  assert.equal(calls.length, 2);
  clock = new Date(clock.getTime() + 25 * 3600 * 1000);
  answer = { latitude: 10, longitude: 20 };
  assert.deepEqual(await places.ensure(nowhere), { latitude: 10, longitude: 20 });
  assert.equal(calls.length, 3);
});

test("lookup failures are not cached and never throw; without a geocoder nothing is sent", async () => {
  let calls = 0;
  const failing = new PlaceCoordinates(database, async () => {
    calls++;
    throw new Error("network down");
  });
  const place = { city: "Fictional Failure", country: "India" };
  assert.equal(await failing.ensure(place), null);
  assert.equal(await failing.ensure(place), null);
  assert.equal(calls, 2);
  const row = await database.pool.query("SELECT 1 FROM place_coordinates WHERE place_key=$1", [placeKey(place)]);
  assert.equal(row.rowCount, 0);
  assert.equal(await new PlaceCoordinates(database, undefined).ensure(place), null);
});

test("Nominatim requests send only the city query with an identifying User-Agent", async () => {
  const seen: { url: string; agent: string | null }[] = [];
  const geocoder = nominatimGeocoder({
    url: "https://nominatim.example.test/search",
    userAgent: "TutorMarketplace/1.0 (+https://example.test)",
    fetchImpl: (async (input: URL, init?: RequestInit) => {
      seen.push({ url: String(input), agent: new Headers(init?.headers).get("User-Agent") });
      return new Response(JSON.stringify([{ lat: "25.1800", lon: "75.8400" }]), { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(await geocoder("kota, rajasthan, india"), { latitude: 25.18, longitude: 75.84 });
  const url = new URL(seen[0]!.url);
  assert.equal(url.searchParams.get("q"), "kota, rajasthan, india");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(seen[0]!.agent, "TutorMarketplace/1.0 (+https://example.test)");
  const empty = nominatimGeocoder({
    url: "https://nominatim.example.test/search",
    userAgent: "TutorMarketplace/1.0",
    fetchImpl: (async () => new Response("[]", { status: 200 })) as typeof fetch,
  });
  assert.equal(await empty("nowhere"), null);
});
