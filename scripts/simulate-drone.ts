import 'dotenv/config';
import { ROUTE_17_WAYPOINTS } from '../src/db/seed.ts';
import { buildSmoothFlightTrack } from '../src/shared/flightTrack.ts';

/**
 * External UAV Telemetry Simulation Script
 *
 * Acts as an independent external ground station / flight controller bridge
 * sending telemetry frames to POST /api/v1/ingest/telemetry using X-API-Key auth,
 * following the exact smooth rounded flight track (straight sweeps + 180-deg rounded U-turns).
 *
 * Usage:
 *   npm run simulate
 *   npx tsx scripts/simulate-drone.ts --key=mp_live_... --url=http://localhost:3000
 */

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const API_URL = parseArg('url') || process.env.SIMULATE_URL || 'http://localhost:3000';
const RAW_API_KEY = parseArg('key') || process.env.INGEST_API_KEY;
const VEHICLE_CODE = parseArg('vehicle') || 'Modelo AX3';
const INTERVAL_MS = Number(parseArg('interval') || 500);

if (!RAW_API_KEY) {
  console.error(
    'Missing API Key. Set INGEST_API_KEY in .env or pass --key=<your_api_key> (generate one in Options -> Ingest API Keys).'
  );
  process.exit(1);
}
const API_KEY: string = RAW_API_KEY;
const MISSION_ID_ARG = parseArg('mission-id');
const MISSION_ID = MISSION_ID_ARG ? Number(MISSION_ID_ARG) : undefined;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function run() {
  console.log(`[External Simulator] Target: ${API_URL}/api/v1/ingest/telemetry`);
  console.log(`[External Simulator] Vehicle: ${VEHICLE_CODE}, Interval: ${INTERVAL_MS}ms`);

  let activeWaypoints = ROUTE_17_WAYPOINTS;
  let activeMissionType = 'Horizontal mapp.';
  try {
    const missionRes = await fetch(
      `${API_URL}/api/v1/ingest/mission/${encodeURIComponent(VEHICLE_CODE)}`,
      { headers: { 'X-API-Key': API_KEY } }
    );
    if (missionRes.ok) {
      const missionJson = (await missionRes.json()) as {
        waypoints?: typeof ROUTE_17_WAYPOINTS;
        missionType?: string;
        routeCode?: string;
      };
      if (Array.isArray(missionJson.waypoints) && missionJson.waypoints.length >= 2) {
        activeWaypoints = missionJson.waypoints;
        activeMissionType = missionJson.missionType || 'Horizontal mapp.';
        console.log(
          `[External Simulator] Loaded live path "${missionJson.routeCode}" (${activeWaypoints.length} WPs, ${activeMissionType})`
        );
      }
    }
  } catch {
    // Fallback to default ROUTE_17_WAYPOINTS if server isn't up yet
  }

  const { missionSamples } = buildSmoothFlightTrack(activeWaypoints, activeMissionType);
  // Start near Waypoint 11 on Route 17, or WP 1 on custom drawn paths
  const startIndex =
    activeWaypoints.length === 23
      ? missionSamples.findIndex((s) => s.nearestWaypointSeq === 11)
      : 0;
  let sampleIdx = startIndex >= 0 ? startIndex : 0;
  let totalDistanceM = 4.2;
  let mahUsed = 2663;
  const mahTotal = 4366;

  const tick = async () => {
    const cur = missionSamples[sampleIdx];
    const prev = missionSamples[(sampleIdx - 1 + missionSamples.length) % missionSamples.length];

    const stepDist = haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    if (stepDist < 100) {
      totalDistanceM += stepDist;
    }

    const groundSpeedMs = Number((8.5 + Math.sin(Date.now() / 2000) * 1.1).toFixed(2));
    const windSpeedMs = Number((0.4 + Math.abs(Math.cos(Date.now() / 3500)) * 0.9).toFixed(2));
    const airSpeedMs = Number((groundSpeedMs + windSpeedMs * 0.6).toFixed(2));
    const speedKts = Number((groundSpeedMs * 1.94384 * 28).toFixed(1));

    mahUsed = Math.min(mahTotal - 100, mahUsed + 1);
    const batteryPercent = Math.max(10, Math.round(((mahTotal - mahUsed) / mahTotal) * 100));
    const voltage = Number((12.8 + (batteryPercent / 100) * 2.0).toFixed(1));

    const payload: Record<string, unknown> = {
      vehicleCode: VEHICLE_CODE,
      lat: cur.lat,
      lng: cur.lng,
      altitudeAmsl: Number((446 + Math.sin(Date.now() / 4000) * 1.6).toFixed(1)),
      altitudeAto: Number((118.3 + Math.sin(Date.now() / 3000) * 1.0).toFixed(1)),
      altitudeAtd: Number((1.2 + Math.cos(Date.now() / 2500) * 0.15).toFixed(2)),
      speedKts,
      groundSpeedMs,
      airSpeedMs,
      windSpeedMs,
      gnssSpeedMs: Number((0.12 + Math.random() * 0.06).toFixed(2)),
      groundDistanceM: Number(totalDistanceM.toFixed(1)),
      headingDeg: Math.round(cur.headingDeg),
      bearingDeg: Math.round(cur.headingDeg),
      pitchDeg: Number((Math.sin(Date.now() / 1800) * 3.8).toFixed(1)),
      rollDeg: Number((Math.cos(Date.now() / 2200) * 4.5).toFixed(1)),
      voltage,
      temperatureC: 27.0,
      mahUsed,
      mahTotal,
      batteryPercent,
      signalPercent: 75 + Math.round(Math.sin(Date.now() / 5000) * 4),
      activeWaypointIndex: cur.nearestWaypointSeq,
      status: 'In Flight',
    };

    if (MISSION_ID && Number.isInteger(MISSION_ID)) {
      payload.missionId = MISSION_ID;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/ingest/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[External Simulator] Ingest failed (${response.status}): ${text}`);
      } else {
        console.log(
          `[Ingested] WP ${cur.nearestWaypointSeq} | Lat ${cur.lat.toFixed(6)}, Lng ${cur.lng.toFixed(6)} | Hdg ${Math.round(cur.headingDeg)}° | Bat ${batteryPercent}%`
        );
      }
    } catch (err) {
      console.error('[External Simulator] Network error:', err instanceof Error ? err.message : err);
    }

    sampleIdx = (sampleIdx + 1) % missionSamples.length;
  };

  await tick();
  const timer = setInterval(tick, INTERVAL_MS);
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n[External Simulator] Stopped cleanly.');
    process.exit(0);
  });
}

run();
