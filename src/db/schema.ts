import {
  pgTable,
  serial,
  text,
  integer,
  real,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export interface WaypointNode {
  seq: number;
  lat: number;
  lng: number;
  alt: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('operator'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ingestApiKeys = pgTable('ingest_api_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  vehicleCode: text('vehicle_code'),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  model: text('model').notNull(),
  status: text('status').notNull().default('Connected'),
  batteryPercent: integer('battery_percent').notNull().default(86),
  signalPercent: integer('signal_percent').notNull().default(75),
  voltage: real('voltage').notNull().default(14.3),
  temperatureC: real('temperature_c').notNull().default(27.0),
  mahUsed: integer('mah_used').notNull().default(2663),
  mahTotal: integer('mah_total').notNull().default(4366),
  lat: doublePrecision('lat').notNull().default(46.54354),
  lng: doublePrecision('lng').notNull().default(6.51716),
  altitudeAmsl: real('altitude_amsl').notNull().default(446),
  altitudeAto: real('altitude_ato').notNull().default(1),
  altitudeAtd: real('altitude_atd').notNull().default(1.2),
  headingDeg: real('heading_deg').notNull().default(315),
  bearingDeg: real('bearing_deg').notNull().default(0),
  pitchDeg: real('pitch_deg').notNull().default(0),
  rollDeg: real('roll_deg').notNull().default(0),
  groundDistanceM: real('ground_distance_m').notNull().default(4.2),
  windSpeedMs: real('wind_speed_ms').notNull().default(0.4),
  groundSpeedMs: real('ground_speed_ms').notNull().default(0),
  airSpeedMs: real('air_speed_ms').notNull().default(0),
  gnssSpeedMs: real('gnss_speed_ms').notNull().default(0.15),
  activeWaypointIndex: integer('active_waypoint_index').notNull().default(11),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missions = pgTable('missions', {
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  routeCode: text('route_code').notNull(),
  name: text('name').notNull(),
  missionType: text('mission_type').notNull().default('Horizontal mapp.'),
  camera: text('camera').notNull().default('Aeria X'),
  planAbove: text('plan_above').notNull().default('EgTI'),
  resolutionCmPx: real('resolution_cm_px').notNull().default(2.5),
  latOverlapPct: integer('lat_overlap_pct').notNull().default(75),
  longOverlapPct: integer('long_overlap_pct').notNull().default(68),
  areaHa: real('area_ha').notNull().default(9.0),
  areaKm: real('area_km').notNull().default(0.09),
  flightAltitudeM: real('flight_altitude_m').notNull().default(118.3),
  photosCount: integer('photos_count').notNull().default(138),
  photoIntervalM: integer('photo_interval_m').notNull().default(50),
  imageCoverage: text('image_coverage').notNull().default('150x100 m'),
  estFlightTime: text('est_flight_time').notNull().default('00:11:34'),
  estFlightDistanceM: integer('est_flight_distance_m').notNull().default(9637),
  flightLineSpacingM: integer('flight_line_spacing_m').notNull().default(38),
  waypointsCount: integer('waypoints_count').notNull().default(23),
  perpendicularLines: boolean('perpendicular_lines').notNull().default(false),
  reverseFlight: boolean('reverse_flight').notNull().default(true),
  showWaypoints: boolean('show_waypoints').notNull().default(true),
  isLocked: boolean('is_locked').notNull().default(false),
  status: text('status').notNull().default('Paused'),
  riskLevel: text('risk_level').notNull().default('Low'),
  centerLat: doublePrecision('center_lat').notNull().default(46.54354),
  centerLng: doublePrecision('center_lng').notNull().default(6.51716),
  waypointsJson: jsonb('waypoints_json').$type<WaypointNode[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const telemetryPoints = pgTable('telemetry_points', {
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id')
    .references(() => vehicles.id, { onDelete: 'cascade' })
    .notNull(),
  missionId: integer('mission_id').references(() => missions.id, { onDelete: 'set null' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  altitudeAmsl: real('altitude_amsl').notNull(),
  altitudeAto: real('altitude_ato').notNull(),
  altitudeAtd: real('altitude_atd').notNull(),
  speedKts: real('speed_kts').notNull(),
  groundSpeedMs: real('ground_speed_ms').notNull(),
  airSpeedMs: real('air_speed_ms').notNull(),
  windSpeedMs: real('wind_speed_ms').notNull(),
  gnssSpeedMs: real('gnss_speed_ms').notNull(),
  groundDistanceM: real('ground_distance_m').notNull(),
  headingDeg: real('heading_deg').notNull(),
  bearingDeg: real('bearing_deg').notNull(),
  pitchDeg: real('pitch_deg').notNull().default(0),
  rollDeg: real('roll_deg').notNull().default(0),
  voltage: real('voltage').notNull(),
  temperatureC: real('temperature_c').notNull(),
  mahUsed: integer('mah_used').notNull(),
  mahTotal: integer('mah_total').notNull(),
  batteryPercent: integer('battery_percent').notNull(),
  signalPercent: integer('signal_percent').notNull(),
  activeWaypointIndex: integer('active_waypoint_index').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

export const flightLogs = pgTable('flight_logs', {
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id')
    .references(() => vehicles.id, { onDelete: 'cascade' })
    .notNull(),
  missionId: integer('mission_id').references(() => missions.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
