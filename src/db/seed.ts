import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { vehicles, missions, telemetryPoints, flightLogs, type WaypointNode } from './schema.ts';
import { generateRoute17Waypoints, buildSmoothFlightTrack } from '../shared/flightTrack.ts';

export const ROUTE_17_WAYPOINTS: WaypointNode[] = generateRoute17Waypoints(118.3);

function getInitialDroneTrackPoint() {
  const { missionSamples } = buildSmoothFlightTrack(ROUTE_17_WAYPOINTS);
  // Position drone right near Waypoint 11 (end of Row 4, matching reference screenshot)
  const wp11Sample =
    missionSamples.find((s) => s.nearestWaypointSeq === 11) ||
    missionSamples[Math.floor(missionSamples.length * 0.45)];
  return wp11Sample;
}

export async function seedIfNeeded() {
  const [{ value: vehicleCount }] = await db.select({ value: count() }).from(vehicles);
  const initialDronePt = getInitialDroneTrackPoint();

  if (vehicleCount > 0) {
    // Ensure Route 17 & Route 18 waypoints stay synced with the smooth rounded mapping geometry
    const [existingRoute17] = await db
      .select()
      .from(missions)
      .where(eq(missions.routeCode, 'Route № 17'))
      .limit(1);

    if (
      existingRoute17 &&
      existingRoute17.waypointsJson?.[2]?.lat !== ROUTE_17_WAYPOINTS[2]?.lat
    ) {
      await db
        .update(missions)
        .set({ waypointsJson: ROUTE_17_WAYPOINTS, updatedAt: new Date() })
        .where(eq(missions.routeCode, 'Route № 17'));

      await db
        .update(missions)
        .set({ waypointsJson: ROUTE_17_WAYPOINTS, updatedAt: new Date() })
        .where(eq(missions.routeCode, 'Route № 18'));

      await db
        .update(vehicles)
        .set({
          lat: initialDronePt.lat,
          lng: initialDronePt.lng,
          headingDeg: Math.round(initialDronePt.headingDeg),
          activeWaypointIndex: 11,
          updatedAt: new Date(),
        })
        .where(eq(vehicles.code, 'Modelo AX3'));
    }
    return;
  }

  const [ax3] = await db
    .insert(vehicles)
    .values({
      code: 'Modelo AX3',
      model: 'Quadrotor Survey AX3',
      status: 'Connected',
      batteryPercent: 86,
      signalPercent: 75,
      voltage: 14.3,
      temperatureC: 27.0,
      mahUsed: 2663,
      mahTotal: 4366,
      lat: initialDronePt.lat,
      lng: initialDronePt.lng,
      altitudeAmsl: 446,
      altitudeAto: 1,
      altitudeAtd: 1.2,
      headingDeg: Math.round(initialDronePt.headingDeg),
      bearingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundDistanceM: 4.2,
      windSpeedMs: 0.4,
      groundSpeedMs: 0,
      airSpeedMs: 0,
      gnssSpeedMs: 0.15,
      activeWaypointIndex: 11,
    })
    .returning();

  const [v4] = await db
    .insert(vehicles)
    .values({
      code: 'AeroSurvey V4',
      model: 'Fixed-Wing VTOL V4',
      status: 'Standby',
      batteryPercent: 94,
      signalPercent: 88,
      voltage: 22.8,
      temperatureC: 24.5,
      mahUsed: 840,
      mahTotal: 5200,
      lat: ROUTE_17_WAYPOINTS[0].lat,
      lng: ROUTE_17_WAYPOINTS[0].lng,
      altitudeAmsl: 448,
      altitudeAto: 0,
      altitudeAtd: 0.0,
      headingDeg: 45,
      bearingDeg: 12,
      pitchDeg: 0,
      rollDeg: 0,
      groundDistanceM: 0,
      windSpeedMs: 0.6,
      groundSpeedMs: 0,
      airSpeedMs: 0,
      gnssSpeedMs: 0.05,
      activeWaypointIndex: 1,
    })
    .returning();

  const [route17] = await db
    .insert(missions)
    .values({
      vehicleId: ax3.id,
      routeCode: 'Route № 17',
      name: 'Routes № 17',
      missionType: 'Horizontal mapp.',
      camera: 'Aeria X',
      planAbove: 'EgTI',
      resolutionCmPx: 2.5,
      latOverlapPct: 75,
      longOverlapPct: 68,
      areaHa: 9.0,
      areaKm: 0.09,
      flightAltitudeM: 118.3,
      photosCount: 138,
      photoIntervalM: 50,
      imageCoverage: '150x100 m',
      estFlightTime: '00:11:34',
      estFlightDistanceM: 9637,
      flightLineSpacingM: 38,
      waypointsCount: 23,
      perpendicularLines: false,
      reverseFlight: true,
      showWaypoints: true,
      isLocked: false,
      status: 'Paused',
      riskLevel: 'Low',
      centerLat: 46.54354,
      centerLng: 6.51716,
      waypointsJson: ROUTE_17_WAYPOINTS,
    })
    .returning();

  await db.insert(missions).values({
    vehicleId: v4.id,
    routeCode: 'Route № 18',
    name: 'Corridor Survey 18',
    missionType: 'Linear corridor',
    camera: 'COD 3D',
    planAbove: 'AED',
    resolutionCmPx: 3.0,
    latOverlapPct: 70,
    longOverlapPct: 65,
    areaHa: 14.5,
    areaKm: 0.145,
    flightAltitudeM: 140.0,
    photosCount: 210,
    photoIntervalM: 45,
    imageCoverage: '180x120 m',
    estFlightTime: '00:16:10',
    estFlightDistanceM: 12450,
    flightLineSpacingM: 44,
    waypointsCount: 23,
    perpendicularLines: true,
    reverseFlight: false,
    showWaypoints: true,
    isLocked: false,
    status: 'Paused',
    riskLevel: 'Low',
    centerLat: 46.54354,
    centerLng: 6.51716,
    waypointsJson: ROUTE_17_WAYPOINTS,
  });

  const now = Date.now();
  const curveProfile = [
    { offsetMin: -120, alt: 120, speed: 20, wp: 1 },
    { offsetMin: -112, alt: 140, speed: 25, wp: 2 },
    { offsetMin: -105, alt: 1900, speed: 120, wp: 3 },
    { offsetMin: -98, alt: 4600, speed: 460, wp: 4 },
    { offsetMin: -90, alt: 5800, speed: 590, wp: 5 },
    { offsetMin: -80, alt: 5750, speed: 600, wp: 6 },
    { offsetMin: -70, alt: 5950, speed: 595, wp: 7 },
    { offsetMin: -60, alt: 5720, speed: 600, wp: 8 },
    { offsetMin: -50, alt: 5600, speed: 598, wp: 8 },
    { offsetMin: -40, alt: 5980, speed: 602, wp: 9 },
    { offsetMin: -30, alt: 5920, speed: 601, wp: 10 },
    { offsetMin: -20, alt: 6350, speed: 603, wp: 10 },
    { offsetMin: -10, alt: 6500, speed: 604, wp: 11 },
    { offsetMin: 0, alt: 6620, speed: 605, wp: 11 },
  ];

  await db.insert(telemetryPoints).values(
    curveProfile.map((pt) => ({
      vehicleId: ax3.id,
      missionId: route17.id,
      lat: ax3.lat,
      lng: ax3.lng,
      altitudeAmsl: pt.alt / 14.8,
      altitudeAto: 1,
      altitudeAtd: 1.2,
      speedKts: pt.speed,
      groundSpeedMs: 0,
      airSpeedMs: 0,
      windSpeedMs: 0.4,
      gnssSpeedMs: 0.15,
      groundDistanceM: 4.2,
      headingDeg: 315,
      bearingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      voltage: 14.3,
      temperatureC: 27.0,
      mahUsed: 2663,
      mahTotal: 4366,
      batteryPercent: 86,
      signalPercent: 75,
      activeWaypointIndex: pt.wp,
      recordedAt: new Date(now + pt.offsetMin * 60_000),
    }))
  );

  await db.insert(flightLogs).values([
    {
      vehicleId: ax3.id,
      missionId: route17.id,
      eventType: 'MISSION_START',
      message: 'Route № 17 initialized on Modelo AX3 (23 waypoints, EgTI datum)',
      metadata: { waypoints: 23, areaHa: 9.0 },
    },
    {
      vehicleId: ax3.id,
      missionId: route17.id,
      eventType: 'WAYPOINT_REACHED',
      message: 'Waypoint 11 cleared at 118.3 m/AED, GNSS velocity 0.15 m/s',
      metadata: { waypoint: 11, gnssSpeedMs: 0.15 },
    },
    {
      vehicleId: ax3.id,
      missionId: route17.id,
      eventType: 'MISSION_PAUSE',
      message: 'Hover hold engaged near Waypoint 11 — awaiting telemetry or resume command',
      metadata: { altitudeAto: 1, headingDeg: 315 },
    },
  ]);
}
