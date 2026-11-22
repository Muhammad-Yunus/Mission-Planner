import type {
  FlightLog,
  IngestApiKeyItem,
  Mission,
  TelemetryPoint,
  UserProfile,
  Vehicle,
} from '../types/mission.ts';

// Hold Bearer JWT strictly in JS memory (never localStorage/sessionStorage)
let inMemoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && inMemoryToken && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      inMemoryToken = null;
      unauthorizedHandler?.();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const authApi = {
  register: (payload: { email: string; name: string; password: string }) =>
    apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => apiRequest<{ user: UserProfile }>('/api/auth/me'),
};

export const missionApi = {
  getVehicles: () => apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
  getVehicleTelemetry: (vehicleId: number, limit = 80) =>
    apiRequest<{ points: TelemetryPoint[] }>(`/api/vehicles/${vehicleId}/telemetry?limit=${limit}`),
  getMissions: () => apiRequest<{ missions: Mission[] }>('/api/missions'),
  updateMission: (missionId: number, patch: Partial<Mission>) =>
    apiRequest<{ mission: Mission }>(`/api/missions/${missionId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  sendCommand: (
    missionId: number,
    command: 'play' | 'pause' | 'step' | 'reset' | 'toggle_lock' | 'flag'
  ) =>
    apiRequest<{ mission: Mission; vehicle: Vehicle | null }>(`/api/missions/${missionId}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  getLogs: (limit = 100) => apiRequest<{ logs: FlightLog[] }>(`/api/logs?limit=${limit}`),
  getApiKeys: () => apiRequest<{ keys: IngestApiKeyItem[] }>('/api/keys'),
  createApiKey: (payload: { name: string; vehicleCode?: string | null }) =>
    apiRequest<{ key: IngestApiKeyItem; rawKey: string }>('/api/keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeApiKey: (id: number) =>
    apiRequest<{ ok: boolean }>(`/api/keys/${id}`, {
      method: 'DELETE',
    }),
};
