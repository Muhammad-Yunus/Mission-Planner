import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db, pool } from './src/db/index.ts';
import {
  users,
  ingestApiKeys,
  vehicles,
  missions,
  telemetryPoints,
  flightLogs,
} from './src/db/schema.ts';
import { seedIfNeeded } from './src/db/seed.ts';
import { buildSmoothFlightTrack } from './src/shared/flightTrack.ts';
import {
  hashPassword,
  verifyPassword,
  signUserToken,
  verifyUserToken,
  requireUserAuth,
  requireIngestApiKey,
  generateRawApiKey,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import { swaggerDocument } from './src/server/swagger.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  await seedIfNeeded();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  // Lightweight sliding-window rate limiter for auth endpoints
  const authAttempts = new Map<string, number[]>();
  const authRateLimit: express.RequestHandler = (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const recent = (authAttempts.get(ip) || []).filter((ts) => now - ts < 60_000);
    if (recent.length >= 30) {
      res.status(429).json({ error: 'Too many authentication attempts. Try again in 1 minute.' });
      return;
    }
    recent.push(now);
    authAttempts.set(ip, recent);
    next();
  };

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Same-origin or AI Studio preview origins
        callback(null, origin || true);
      },
      credentials: true,
    },
  });

  // Socket.IO user authentication middleware
  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : typeof socket.handshake.headers.authorization === 'string' &&
          socket.handshake.headers.authorization.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice('Bearer '.length).trim()
        : '';

    if (!token) {
      next(new Error('Unauthorized: Bearer token required for WebSocket connection'));
      return;
    }

    try {
      const payload = verifyUserToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Unauthorized: Invalid or expired WebSocket token'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('socket:ready', {
      connectedAt: new Date().toISOString(),
      operator: socket.data.user?.email,
    });
  });

  // ---------------------------------------------------------------------------
  // Swagger API Documentation
  // ---------------------------------------------------------------------------
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerDocument);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'Mission Planner — API Documentation',
  }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'Mission Planner', timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // User-Based App Authentication (/api/auth/*)
  // ---------------------------------------------------------------------------
  const registerSchema = z.object({
    email: z.string().email().max(160),
    name: z.string().min(2).max(100),
    password: z.string().min(6).max(128),
  });

  app.post('/api/auth/register', authRateLimit, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration data', details: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: 'An operator account with this email already exists.' });
      return;
    }

    const [{ value: userCount }] = await db.select({ value: count() }).from(users);

    const role = userCount === 0 ? 'admin' : 'operator';
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: parsed.data.name.trim(),
        passwordHash: hashPassword(parsed.data.password),
        role,
      })
      .returning();

    const token = signUserToken({
      userId: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    });

    res.status(201).json({
      token,
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
      },
    });
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post('/api/auth/login', authRateLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signUserToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.get('/api/auth/me', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // ---------------------------------------------------------------------------
  // Protected App Routes (User Auth Required)
  // ---------------------------------------------------------------------------
  app.get('/api/vehicles', requireUserAuth, async (_req, res) => {
    const rows = await db.select().from(vehicles).orderBy(asc(vehicles.id));
    res.json({ vehicles: rows });
  });

  app.get('/api/vehicles/:id/telemetry', requireUserAuth, async (req, res) => {
    const vehicleId = Number(req.params.id);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 500);
    const points = await db
      .select()
      .from(telemetryPoints)
      .where(eq(telemetryPoints.vehicleId, vehicleId))
      .orderBy(desc(telemetryPoints.recordedAt))
      .limit(limit);

    res.json({ points: points.reverse() });
  });

  app.get('/api/missions', requireUserAuth, async (_req, res) => {
    const rows = await db.select().from(missions).orderBy(asc(missions.id));
    res.json({ missions: rows });
  });

  const waypointNodeSchema = z.object({
    seq: z.number().int().min(1).max(500),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    alt: z.number().min(1).max(5000),
  });

  const missionUpdateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    missionType: z.enum(['Horizontal mapp.', 'Linear corridor', 'Custom path']).optional(),
    camera: z.enum(['Aeria X', 'COD 3D']).optional(),
    planAbove: z.enum(['AED', 'EgTI', 'Prot. 3']).optional(),
    resolutionCmPx: z.number().min(0.5).max(20).optional(),
    latOverlapPct: z.number().int().min(10).max(95).optional(),
    longOverlapPct: z.number().int().min(10).max(95).optional(),
    areaHa: z.number().min(0).max(100000).optional(),
    areaKm: z.number().min(0).max(1000).optional(),
    flightAltitudeM: z.number().min(10).max(1500).optional(),
    photosCount: z.number().int().min(0).max(50000).optional(),
    photoIntervalM: z.number().int().min(5).max(500).optional(),
    estFlightTime: z.string().min(4).max(20).optional(),
    estFlightDistanceM: z.number().int().min(0).max(1000000).optional(),
    waypointsCount: z.number().int().min(2).max(500).optional(),
    perpendicularLines: z.boolean().optional(),
    reverseFlight: z.boolean().optional(),
    showWaypoints: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    vehicleId: z.number().int().positive().optional(),
    centerLat: z.number().min(-90).max(90).optional(),
    centerLng: z.number().min(-180).max(180).optional(),
    waypointsJson: z.array(waypointNodeSchema).min(2).max(300).optional(),
  });

  app.patch('/api/missions/:id', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const missionId = Number(req.params.id);
    if (!Number.isInteger(missionId) || missionId <= 0) {
      res.status(400).json({ error: 'Invalid mission ID' });
      return;
    }

    const parsed = missionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid mission parameters', details: parsed.error.flatten() });
      return;
    }

    const [existing] = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }

    if (existing.isLocked && parsed.data.isLocked !== false) {
      res.status(423).json({ error: 'Mission parameters are locked. Unlock before editing.' });
      return;
    }

    const nextResolution = parsed.data.resolutionCmPx ?? existing.resolutionCmPx;
    const nextLatOverlap = parsed.data.latOverlapPct ?? existing.latOverlapPct;
    const nextLongOverlap = parsed.data.longOverlapPct ?? existing.longOverlapPct;
    const nextDist = parsed.data.estFlightDistanceM ?? existing.estFlightDistanceM;

    const computedAlt = Number((nextResolution * 47.32).toFixed(1));
    const computedSpacing = Math.max(12, Math.round(150 * (1 - nextLatOverlap / 100)));
    const computedPhotos = Math.max(
      12,
      Math.round((nextDist || 9637) / Math.max(20, (100 - nextLongOverlap) * 2.1))
    );

    const [updated] = await db
      .update(missions)
      .set({
        ...parsed.data,
        flightAltitudeM: parsed.data.flightAltitudeM ?? computedAlt,
        flightLineSpacingM: computedSpacing,
        photosCount: parsed.data.photosCount ?? computedPhotos,
        waypointsCount:
          parsed.data.waypointsCount ?? parsed.data.waypointsJson?.length ?? existing.waypointsCount,
        updatedAt: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    if (updated.vehicleId) {
      const hasWaypointsUpdate = Boolean(parsed.data.waypointsJson);
      const [log] = await db
        .insert(flightLogs)
        .values({
          vehicleId: updated.vehicleId,
          missionId: updated.id,
          eventType: hasWaypointsUpdate ? 'PATH_UPDATED' : 'CONFIG_SAVED',
          message: hasWaypointsUpdate
            ? `Flight path updated on "${updated.name}" (${updated.waypointsCount} waypoints, ${updated.estFlightDistanceM} m) by ${req.user?.name || 'Operator'}`
            : `Mission "${updated.name}" parameters saved by ${req.user?.name || 'Operator'}`,
          metadata: hasWaypointsUpdate
            ? { waypointsCount: updated.waypointsCount, missionType: updated.missionType }
            : parsed.data,
        })
        .returning();
      io.emit('log:created', log);
    }

    io.emit('mission:updated', updated);
    res.json({ mission: updated });
  });

  const commandSchema = z.object({
    command: z.enum(['play', 'pause', 'step', 'reset', 'toggle_lock', 'flag']),
  });

  app.post('/api/missions/:id/command', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const missionId = Number(req.params.id);
    if (!Number.isInteger(missionId) || missionId <= 0) {
      res.status(400).json({ error: 'Invalid mission ID' });
      return;
    }

    const parsed = commandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid mission command' });
      return;
    }

    const [mission] = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }

    let updatedMission = mission;
    let updatedVehicle = null;
    let logType = 'MISSION_EVENT';
    let logMessage = '';

    const cmd = parsed.data.command;
    if (cmd === 'play' || cmd === 'pause') {
      const nextStatus = cmd === 'play' ? 'Active' : 'Paused';
      [updatedMission] = await db
        .update(missions)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(missions.id, mission.id))
        .returning();
      if (mission.vehicleId) {
        [updatedVehicle] = await db
          .update(vehicles)
          .set({ status: cmd === 'play' ? 'In Flight' : 'Connected', updatedAt: new Date() })
          .where(eq(vehicles.id, mission.vehicleId))
          .returning();
      }
      logType = cmd === 'play' ? 'MISSION_START' : 'MISSION_PAUSE';
      logMessage = `Mission ${mission.routeCode} ${cmd === 'play' ? 'resumed' : 'paused'} by ${req.user?.name}`;
    } else if (cmd === 'toggle_lock') {
      [updatedMission] = await db
        .update(missions)
        .set({ isLocked: !mission.isLocked, updatedAt: new Date() })
        .where(eq(missions.id, mission.id))
        .returning();
      logType = 'CONFIG_SAVED';
      logMessage = `Mission ${mission.routeCode} ${updatedMission.isLocked ? 'locked' : 'unlocked'}`;
    } else if (cmd === 'step' && mission.vehicleId) {
      const [veh] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, mission.vehicleId))
        .limit(1);
      if (veh) {
        const waypoints = mission.waypointsJson || [];
        const nextIdx = Math.min(waypoints.length, veh.activeWaypointIndex + 1);
        const wp = waypoints.find((w) => w.seq === nextIdx) || waypoints[nextIdx - 1];
        const { missionSamples } = buildSmoothFlightTrack(waypoints, mission.missionType);
        const trackSample = missionSamples.find((s) => s.nearestWaypointSeq === nextIdx);
        [updatedVehicle] = await db
          .update(vehicles)
          .set({
            activeWaypointIndex: nextIdx,
            lat: wp ? wp.lat : veh.lat,
            lng: wp ? wp.lng : veh.lng,
            headingDeg: trackSample ? Math.round(trackSample.headingDeg) : veh.headingDeg,
            updatedAt: new Date(),
          })
          .where(eq(vehicles.id, veh.id))
          .returning();
        logType = 'WAYPOINT_REACHED';
        logMessage = `Manual waypoint step to WP ${nextIdx} on ${mission.routeCode}`;
      }
    } else if (cmd === 'reset' && mission.vehicleId) {
      const waypoints = mission.waypointsJson || [];
      const firstWp = waypoints[0];
      const { missionSamples } = buildSmoothFlightTrack(waypoints, mission.missionType);
      const firstSample = missionSamples[0];
      [updatedMission] = await db
        .update(missions)
        .set({ status: 'Paused', updatedAt: new Date() })
        .where(eq(missions.id, mission.id))
        .returning();
      [updatedVehicle] = await db
        .update(vehicles)
        .set({
          activeWaypointIndex: 1,
          lat: firstWp ? firstWp.lat : 46.54355,
          lng: firstWp ? firstWp.lng : 6.51505,
          headingDeg: firstSample ? Math.round(firstSample.headingDeg) : 15,
          groundSpeedMs: 0,
          airSpeedMs: 0,
          status: 'Connected',
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, mission.vehicleId))
        .returning();
      logType = 'MISSION_RESET';
      logMessage = `Mission ${mission.routeCode} progress reset to Waypoint 1`;
    } else if (cmd === 'flag') {
      logType = 'WAYPOINT_REACHED';
      logMessage = `Operator flagged current position on ${mission.routeCode}`;
    }

    if (mission.vehicleId && logMessage) {
      const [log] = await db
        .insert(flightLogs)
        .values({
          vehicleId: mission.vehicleId,
          missionId: mission.id,
          eventType: logType,
          message: logMessage,
        })
        .returning();
      io.emit('log:created', log);
    }

    io.emit('mission:updated', updatedMission);
    if (updatedVehicle) {
      io.emit('vehicle:updated', updatedVehicle);
    }

    res.json({ mission: updatedMission, vehicle: updatedVehicle });
  });

  app.get('/api/logs', requireUserAuth, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
    const logs = await db
      .select()
      .from(flightLogs)
      .orderBy(desc(flightLogs.createdAt))
      .limit(limit);
    res.json({ logs });
  });

  // ---------------------------------------------------------------------------
  // Ingest API Key Management (User Auth Required)
  // ---------------------------------------------------------------------------
  app.get('/api/keys', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const baseQuery = db
      .select({
        id: ingestApiKeys.id,
        name: ingestApiKeys.name,
        keyPrefix: ingestApiKeys.keyPrefix,
        vehicleCode: ingestApiKeys.vehicleCode,
        isActive: ingestApiKeys.isActive,
        lastUsedAt: ingestApiKeys.lastUsedAt,
        createdAt: ingestApiKeys.createdAt,
      })
      .from(ingestApiKeys);

    const keys =
      req.user?.role === 'admin'
        ? await baseQuery.orderBy(desc(ingestApiKeys.createdAt))
        : await baseQuery
            .where(eq(ingestApiKeys.userId, req.user!.userId))
            .orderBy(desc(ingestApiKeys.createdAt));

    res.json({ keys });
  });

  const createKeySchema = z.object({
    name: z.string().min(2).max(100),
    vehicleCode: z.string().max(64).optional().nullable(),
  });

  app.post('/api/keys', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = createKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Key name is required' });
      return;
    }

    const { rawKey, keyPrefix, keyHash } = generateRawApiKey();
    const [created] = await db
      .insert(ingestApiKeys)
      .values({
        userId: req.user?.userId ?? null,
        name: parsed.data.name.trim(),
        keyPrefix,
        keyHash,
        vehicleCode: parsed.data.vehicleCode?.trim() || null,
        isActive: true,
      })
      .returning({
        id: ingestApiKeys.id,
        name: ingestApiKeys.name,
        keyPrefix: ingestApiKeys.keyPrefix,
        vehicleCode: ingestApiKeys.vehicleCode,
        isActive: ingestApiKeys.isActive,
        createdAt: ingestApiKeys.createdAt,
      });

    res.status(201).json({
      key: created,
      rawKey, // Shown once!
    });
  });

  app.delete('/api/keys/:id', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid key ID' });
      return;
    }

    const condition =
      req.user?.role === 'admin'
        ? eq(ingestApiKeys.id, id)
        : and(eq(ingestApiKeys.id, id), eq(ingestApiKeys.userId, req.user!.userId));

    const updated = await db
      .update(ingestApiKeys)
      .set({ isActive: false })
      .where(condition)
      .returning({ id: ingestApiKeys.id });

    if (updated.length === 0) {
      res.status(404).json({ error: 'API key not found or access denied' });
      return;
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // External System Ingest API (X-API-Key Auth Only — Completely Separated!)
  // ---------------------------------------------------------------------------
  const telemetryPacketSchema = z.object({
    vehicleCode: z.string().min(1).max(64),
    missionId: z.number().int().positive().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    altitudeAmsl: z.number().min(-500).max(20000).optional(),
    altitudeAto: z.number().min(-500).max(10000).optional(),
    altitudeAtd: z.number().min(-500).max(10000).optional(),
    speedKts: z.number().min(0).max(2000).optional(),
    groundSpeedMs: z.number().min(0).max(500).optional(),
    airSpeedMs: z.number().min(0).max(500).optional(),
    windSpeedMs: z.number().min(0).max(200).optional(),
    gnssSpeedMs: z.number().min(0).max(500).optional(),
    groundDistanceM: z.number().min(0).max(1000000).optional(),
    headingDeg: z.number().min(0).max(360).optional(),
    bearingDeg: z.number().min(0).max(360).optional(),
    pitchDeg: z.number().min(-90).max(90).optional(),
    rollDeg: z.number().min(-180).max(180).optional(),
    voltage: z.number().min(0).max(100).optional(),
    temperatureC: z.number().min(-60).max(150).optional(),
    mahUsed: z.number().int().min(0).max(100000).optional(),
    mahTotal: z.number().int().min(1).max(100000).optional(),
    batteryPercent: z.number().int().min(0).max(100).optional(),
    signalPercent: z.number().int().min(0).max(100).optional(),
    activeWaypointIndex: z.number().int().min(0).max(1000).optional(),
    status: z.enum(['Connected', 'In Flight', 'Standby', 'Offline']).optional(),
  });

  app.get('/api/v1/ingest/mission/:vehicleCode', requireIngestApiKey, async (req: AuthenticatedRequest, res) => {
    const vehicleCode = String(req.params.vehicleCode || '').trim();
    if (!vehicleCode) {
      res.status(400).json({ error: 'Vehicle code is required' });
      return;
    }
    if (req.ingestKey?.vehicleCode && req.ingestKey.vehicleCode !== vehicleCode) {
      res.status(403).json({
        error: `API key is scoped to vehicle "${req.ingestKey.vehicleCode}", not "${vehicleCode}".`,
      });
      return;
    }
    const [veh] = await db.select().from(vehicles).where(eq(vehicles.code, vehicleCode)).limit(1);
    if (!veh) {
      res.status(404).json({ error: `Vehicle "${vehicleCode}" not found` });
      return;
    }
    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.vehicleId, veh.id))
      .orderBy(asc(missions.id))
      .limit(1);
    if (!mission) {
      res.status(404).json({ error: `No mission assigned to "${vehicleCode}"` });
      return;
    }
    res.json({
      missionId: mission.id,
      routeCode: mission.routeCode,
      missionType: mission.missionType,
      waypoints: mission.waypointsJson,
    });
  });

  app.post('/api/v1/ingest/telemetry', requireIngestApiKey, async (req: AuthenticatedRequest, res) => {
    const packetsRaw = Array.isArray(req.body) ? req.body : [req.body];
    if (packetsRaw.length === 0 || packetsRaw.length > 100) {
      res.status(400).json({ error: 'Provide 1 to 100 telemetry packets per request.' });
      return;
    }

    const parsedArray = z.array(telemetryPacketSchema).safeParse(packetsRaw);
    if (!parsedArray.success) {
      res.status(400).json({ error: 'Telemetry validation failed', details: parsedArray.error.flatten() });
      return;
    }

    const insertedPoints = [];
    let lastUpdatedVehicle = null;

    for (const pkt of parsedArray.data) {
      if (req.ingestKey?.vehicleCode && req.ingestKey.vehicleCode !== pkt.vehicleCode) {
        res.status(403).json({
          error: `API key is scoped to vehicle "${req.ingestKey.vehicleCode}", not "${pkt.vehicleCode}".`,
        });
        return;
      }

      let [veh] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.code, pkt.vehicleCode))
        .limit(1);

      if (!veh) {
        [veh] = await db
          .insert(vehicles)
          .values({
            code: pkt.vehicleCode,
            model: pkt.vehicleCode,
            status: pkt.status || 'In Flight',
            lat: pkt.lat,
            lng: pkt.lng,
          })
          .returning();
      }

      let resolvedMissionId: number | null = pkt.missionId ?? null;
      if (!resolvedMissionId) {
        const [linkedMission] = await db
          .select({ id: missions.id })
          .from(missions)
          .where(eq(missions.vehicleId, veh.id))
          .orderBy(asc(missions.id))
          .limit(1);
        resolvedMissionId = linkedMission?.id ?? null;
      }

      const nextPointData = {
        vehicleId: veh.id,
        missionId: resolvedMissionId,
        lat: pkt.lat,
        lng: pkt.lng,
        altitudeAmsl: pkt.altitudeAmsl ?? veh.altitudeAmsl,
        altitudeAto: pkt.altitudeAto ?? veh.altitudeAto,
        altitudeAtd: pkt.altitudeAtd ?? veh.altitudeAtd,
        speedKts: pkt.speedKts ?? Number(((pkt.groundSpeedMs ?? veh.groundSpeedMs) * 1.94384).toFixed(2)),
        groundSpeedMs: pkt.groundSpeedMs ?? veh.groundSpeedMs,
        airSpeedMs: pkt.airSpeedMs ?? veh.airSpeedMs,
        windSpeedMs: pkt.windSpeedMs ?? veh.windSpeedMs,
        gnssSpeedMs: pkt.gnssSpeedMs ?? veh.gnssSpeedMs,
        groundDistanceM: pkt.groundDistanceM ?? veh.groundDistanceM,
        headingDeg: pkt.headingDeg ?? veh.headingDeg,
        bearingDeg: pkt.bearingDeg ?? veh.bearingDeg,
        pitchDeg: pkt.pitchDeg ?? veh.pitchDeg,
        rollDeg: pkt.rollDeg ?? veh.rollDeg,
        voltage: pkt.voltage ?? veh.voltage,
        temperatureC: pkt.temperatureC ?? veh.temperatureC,
        mahUsed: pkt.mahUsed ?? veh.mahUsed,
        mahTotal: pkt.mahTotal ?? veh.mahTotal,
        batteryPercent: pkt.batteryPercent ?? veh.batteryPercent,
        signalPercent: pkt.signalPercent ?? veh.signalPercent,
        activeWaypointIndex: pkt.activeWaypointIndex ?? veh.activeWaypointIndex,
      };

      const [insertedPt] = await db.insert(telemetryPoints).values(nextPointData).returning();
      insertedPoints.push(insertedPt);

      const prevWaypoint = veh.activeWaypointIndex;
      [lastUpdatedVehicle] = await db
        .update(vehicles)
        .set({
          lat: nextPointData.lat,
          lng: nextPointData.lng,
          altitudeAmsl: nextPointData.altitudeAmsl,
          altitudeAto: nextPointData.altitudeAto,
          altitudeAtd: nextPointData.altitudeAtd,
          groundSpeedMs: nextPointData.groundSpeedMs,
          airSpeedMs: nextPointData.airSpeedMs,
          windSpeedMs: nextPointData.windSpeedMs,
          gnssSpeedMs: nextPointData.gnssSpeedMs,
          groundDistanceM: nextPointData.groundDistanceM,
          headingDeg: nextPointData.headingDeg,
          bearingDeg: nextPointData.bearingDeg,
          pitchDeg: nextPointData.pitchDeg,
          rollDeg: nextPointData.rollDeg,
          voltage: nextPointData.voltage,
          temperatureC: nextPointData.temperatureC,
          mahUsed: nextPointData.mahUsed,
          mahTotal: nextPointData.mahTotal,
          batteryPercent: nextPointData.batteryPercent,
          signalPercent: nextPointData.signalPercent,
          activeWaypointIndex: nextPointData.activeWaypointIndex,
          status: pkt.status ?? 'In Flight',
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, veh.id))
        .returning();

      if (nextPointData.activeWaypointIndex !== prevWaypoint) {
        const [log] = await db
          .insert(flightLogs)
          .values({
            vehicleId: veh.id,
            missionId: pkt.missionId ?? null,
            eventType: 'WAYPOINT_REACHED',
            message: `${veh.code} progressed to Waypoint ${nextPointData.activeWaypointIndex} (${nextPointData.altitudeAto.toFixed(1)}m ATO)`,
            metadata: {
              lat: nextPointData.lat,
              lng: nextPointData.lng,
              waypoint: nextPointData.activeWaypointIndex,
            },
          })
          .returning();
        io.emit('log:created', log);
      }

      // Broadcast real-time update immediately to all connected browser sessions
      io.emit('telemetry:update', {
        vehicle: lastUpdatedVehicle,
        telemetryPoint: insertedPt,
      });
    }

    res.status(201).json({
      ingested: insertedPoints.length,
      vehicle: lastUpdatedVehicle,
      latestPoint: insertedPoints[insertedPoints.length - 1],
    });
  });

  const missionEventSchema = z.object({
    vehicleCode: z.string().min(1).max(64),
    missionId: z.number().int().positive().optional(),
    eventType: z.string().min(2).max(64),
    message: z.string().min(2).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  app.post('/api/v1/ingest/mission-event', requireIngestApiKey, async (req, res) => {
    const parsed = missionEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid mission event', details: parsed.error.flatten() });
      return;
    }

    const [veh] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.code, parsed.data.vehicleCode))
      .limit(1);

    if (!veh) {
      res.status(404).json({ error: `Vehicle "${parsed.data.vehicleCode}" not found` });
      return;
    }

    const [log] = await db
      .insert(flightLogs)
      .values({
        vehicleId: veh.id,
        missionId: parsed.data.missionId ?? null,
        eventType: parsed.data.eventType,
        message: parsed.data.message,
        metadata: parsed.data.metadata ?? null,
      })
      .returning();

    io.emit('log:created', log);
    res.status(201).json({ log });
  });

  // Ensure unmatched /api/* routes return JSON 404 rather than HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ---------------------------------------------------------------------------
  // Frontend Serving (Vite dev middleware or Production static bundle)
  // ---------------------------------------------------------------------------
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mission Planner server running on http://0.0.0.0:${PORT}`);
    console.log(`Swagger API docs available at http://0.0.0.0:${PORT}/api-docs`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down Mission Planner gracefully...`);
    io.close();
    httpServer.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start Mission Planner server:', err);
  process.exit(1);
});
