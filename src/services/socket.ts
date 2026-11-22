import { io, type Socket } from 'socket.io-client';
import type { FlightLog, Mission, TelemetryPoint, Vehicle } from '../types/mission.ts';

export interface TelemetryUpdateEvent {
  vehicle: Vehicle;
  telemetryPoint: TelemetryPoint;
}

export function createMissionSocket(
  token: string,
  handlers: {
    onReady?: () => void;
    onDisconnect?: () => void;
    onTelemetryUpdate: (payload: TelemetryUpdateEvent) => void;
    onMissionUpdated: (mission: Mission) => void;
    onVehicleUpdated: (vehicle: Vehicle) => void;
    onLogCreated: (log: FlightLog) => void;
  }
): Socket {
  const socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    handlers.onReady?.();
  });

  socket.on('disconnect', () => {
    handlers.onDisconnect?.();
  });

  socket.on('telemetry:update', handlers.onTelemetryUpdate);
  socket.on('mission:updated', handlers.onMissionUpdated);
  socket.on('vehicle:updated', handlers.onVehicleUpdated);
  socket.on('log:created', handlers.onLogCreated);

  return socket;
}
