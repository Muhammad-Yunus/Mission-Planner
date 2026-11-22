export interface WaypointNode {
  seq: number;
  lat: number;
  lng: number;
  alt: number;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface Vehicle {
  id: number;
  code: string;
  model: string;
  status: string;
  batteryPercent: number;
  signalPercent: number;
  voltage: number;
  temperatureC: number;
  mahUsed: number;
  mahTotal: number;
  lat: number;
  lng: number;
  altitudeAmsl: number;
  altitudeAto: number;
  altitudeAtd: number;
  headingDeg: number;
  bearingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  groundDistanceM: number;
  windSpeedMs: number;
  groundSpeedMs: number;
  airSpeedMs: number;
  gnssSpeedMs: number;
  activeWaypointIndex: number;
  updatedAt: string;
}

export interface Mission {
  id: number;
  vehicleId: number | null;
  routeCode: string;
  name: string;
  missionType: string;
  camera: 'Aeria X' | 'COD 3D';
  planAbove: 'AED' | 'EgTI' | 'Prot. 3';
  resolutionCmPx: number;
  latOverlapPct: number;
  longOverlapPct: number;
  areaHa: number;
  areaKm: number;
  flightAltitudeM: number;
  photosCount: number;
  photoIntervalM: number;
  imageCoverage: string;
  estFlightTime: string;
  estFlightDistanceM: number;
  flightLineSpacingM: number;
  waypointsCount: number;
  perpendicularLines: boolean;
  reverseFlight: boolean;
  showWaypoints: boolean;
  isLocked: boolean;
  status: 'Active' | 'Paused' | 'Completed';
  riskLevel: string;
  centerLat: number;
  centerLng: number;
  waypointsJson: WaypointNode[];
  updatedAt: string;
}

export interface TelemetryPoint {
  id: number;
  vehicleId: number;
  missionId: number | null;
  lat: number;
  lng: number;
  altitudeAmsl: number;
  altitudeAto: number;
  altitudeAtd: number;
  speedKts: number;
  groundSpeedMs: number;
  airSpeedMs: number;
  windSpeedMs: number;
  gnssSpeedMs: number;
  groundDistanceM: number;
  headingDeg: number;
  bearingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  voltage: number;
  temperatureC: number;
  mahUsed: number;
  mahTotal: number;
  batteryPercent: number;
  signalPercent: number;
  activeWaypointIndex: number;
  recordedAt: string;
}

export interface FlightLog {
  id: number;
  vehicleId: number;
  missionId: number | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface IngestApiKeyItem {
  id: number;
  name: string;
  keyPrefix: string;
  vehicleCode: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export type DrawMode = 'off' | 'custom' | 'survey';

export type NavTab = 'overview' | 'routes' | 'logbook' | 'options' | 'help';
