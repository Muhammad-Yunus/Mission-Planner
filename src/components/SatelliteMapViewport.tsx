/// <reference types="google.maps" />
import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import type { DrawMode, LatLngLiteral, Mission, Vehicle, WaypointNode } from '../types/mission.ts';
import { buildSmoothFlightTrack } from '../shared/flightTrack.ts';

interface SatelliteMapViewportProps {
  mission: Mission;
  vehicle: Vehicle | null;
  is3D: boolean;
  recenterSignal: number;
  drawMode: DrawMode;
  draftWaypoints: WaypointNode[];
  draftPolygon: LatLngLiteral[];
  onMapDrawClick: (latLng: LatLngLiteral) => void;
  onDragWaypoint: (seq: number, latLng: LatLngLiteral) => void;
  onRemoveWaypoint: (seq: number) => void;
  onDragPolygonVertex: (index: number, latLng: LatLngLiteral) => void;
  onRemovePolygonVertex: (index: number) => void;
}

function pointsToSvgPolyline(pts: Array<{ x: number; y: number }>, closed = false): string {
  if (pts.length === 0) return '';
  const d = pts
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return closed && pts.length >= 3 ? `${d} Z` : d;
}

const FlightOverlayLayer: React.FC<{
  waypoints: WaypointNode[];
  missionType: string;
  polygon: LatLngLiteral[];
  drawMode: DrawMode;
  vehicle: Vehicle | null;
  showWaypoints: boolean;
  is3D: boolean;
  activeWaypointIndex: number;
  reverseFlight: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragWaypoint: (seq: number, latLng: LatLngLiteral) => void;
  onRemoveWaypoint: (seq: number) => void;
  onDragPolygonVertex: (index: number, latLng: LatLngLiteral) => void;
  onRemovePolygonVertex: (index: number) => void;
}> = ({
  waypoints,
  missionType,
  polygon,
  drawMode,
  vehicle,
  showWaypoints,
  is3D,
  activeWaypointIndex,
  reverseFlight,
  onDragStart,
  onDragEnd,
  onDragWaypoint,
  onRemoveWaypoint,
  onDragPolygonVertex,
  onRemovePolygonVertex,
}) => {
  const map = useMap();
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const stateRef = useRef({ waypoints, missionType, polygon, drawMode, vehicle, is3D, reverseFlight });
  stateRef.current = { waypoints, missionType, polygon, drawMode, vehicle, is3D, reverseFlight };

  const dragCallbacksRef = useRef({
    onDragStart,
    onDragEnd,
    onDragWaypoint,
    onDragPolygonVertex,
  });
  dragCallbacksRef.current = {
    onDragStart,
    onDragEnd,
    onDragWaypoint,
    onDragPolygonVertex,
  };

  const [draggingHandle, setDraggingHandle] = useState<{
    kind: 'waypoint' | 'polygon';
    id: number;
  } | null>(null);

  const [projected, setProjected] = useState<{
    wps: Array<{ seq: number; rawSeq: number; x: number; y: number; groundY: number; alt: number }>;
    polyPts: Array<{ index: number; x: number; y: number }>;
    trackPts: Array<{ x: number; y: number }>;
    drone: { x: number; y: number; groundY: number } | null;
    width: number;
    height: number;
  }>({ wps: [], polyPts: [], trackPts: [], drone: null, width: 1200, height: 700 });

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.OverlayView) return;

    class FlightPathOverlay extends google.maps.OverlayView {
      private container: HTMLDivElement | null = null;

      onAdd() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.pointerEvents = 'none';
      }

      draw() {
        const projection = this.getProjection();
        const div = map?.getDiv();
        if (!projection || !div) return;

        const {
          waypoints: curWps,
          missionType: curMissionType,
          polygon: curPoly,
          drawMode: curDrawMode,
          vehicle: curVehicle,
          is3D: curIs3D,
          reverseFlight: curReverse,
        } = stateRef.current;

        const w = div.clientWidth || 1200;
        const h = div.clientHeight || 700;
        const elevationPx = curIs3D ? 42 : 0;

        // Project waypoint badges
        const wps = curWps.map((wp, idx) => {
          const px = projection.fromLatLngToContainerPixel(
            new google.maps.LatLng(wp.lat, wp.lng)
          );
          const x = px ? px.x : w / 2;
          const groundY = px ? px.y : h / 2;
          return {
            seq: curDrawMode === 'off' && curReverse ? curWps.length - idx : wp.seq,
            rawSeq: wp.seq,
            x,
            y: groundY - elevationPx,
            groundY,
            alt: wp.alt,
          };
        });

        // Project survey area polygon vertices on ground plane
        const polyPts = curPoly.map((pt, index) => {
          const px = projection.fromLatLngToContainerPixel(
            new google.maps.LatLng(pt.lat, pt.lng)
          );
          return {
            index,
            x: px ? px.x : w / 2,
            y: px ? px.y : h / 2,
          };
        });

        // Project smooth C1-continuous flight track (survey U-turns OR custom filleted path)
        const effectiveType = curDrawMode === 'custom' ? 'Custom path' : curMissionType;
        const { entryPoints, missionSamples, exitPoints } = buildSmoothFlightTrack(
          curWps,
          effectiveType
        );
        const allGeoTrack = [
          ...entryPoints,
          ...missionSamples.map((s) => ({ lat: s.lat, lng: s.lng })),
          ...exitPoints,
        ];

        const trackPts = allGeoTrack.map((gp) => {
          const px = projection.fromLatLngToContainerPixel(
            new google.maps.LatLng(gp.lat, gp.lng)
          );
          return {
            x: px ? px.x : w / 2,
            y: (px ? px.y : h / 2) - elevationPx,
          };
        });

        // Project exact drone position onto the elevated flight plane
        let drone: { x: number; y: number; groundY: number } | null = null;
        if (curVehicle) {
          const dpx = projection.fromLatLngToContainerPixel(
            new google.maps.LatLng(curVehicle.lat, curVehicle.lng)
          );
          if (dpx) {
            drone = {
              x: dpx.x,
              y: dpx.y - elevationPx,
              groundY: dpx.y,
            };
          }
        }

        setProjected({ wps, polyPts, trackPts, drone, width: w, height: h });
      }

      onRemove() {
        if (this.container?.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
      }
    }

    const overlay = new FlightPathOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    const idleListener = map.addListener('idle', () => overlay.draw());
    const boundsListener = map.addListener('bounds_changed', () => overlay.draw());

    return () => {
      idleListener.remove();
      boundsListener.remove();
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    overlayRef.current?.draw();
  }, [waypoints, missionType, polygon, drawMode, vehicle, is3D, reverseFlight]);

  useEffect(() => {
    if (!draggingHandle) return;

    const handleMove = (ev: PointerEvent) => {
      const overlay = overlayRef.current;
      const div = map?.getDiv();
      if (!overlay || !div) return;
      const projection = overlay.getProjection();
      if (!projection) return;

      const rect = div.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const elevationOffset =
        draggingHandle.kind === 'waypoint' && stateRef.current.is3D ? 42 : 0;
      const py = ev.clientY - rect.top + elevationOffset;

      const latLng = projection.fromContainerPixelToLatLng(new google.maps.Point(px, py));
      if (!latLng) return;
      const coord = {
        lat: Number(latLng.lat().toFixed(6)),
        lng: Number(latLng.lng().toFixed(6)),
      };

      if (draggingHandle.kind === 'waypoint') {
        dragCallbacksRef.current.onDragWaypoint(draggingHandle.id, coord);
      } else {
        dragCallbacksRef.current.onDragPolygonVertex(draggingHandle.id, coord);
      }
    };

    const handleUp = () => {
      setDraggingHandle(null);
      dragCallbacksRef.current.onDragEnd();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingHandle, map]);

  const pathD = pointsToSvgPolyline(projected.trackPts);
  const polyD = pointsToSvgPolyline(projected.polyPts, projected.polyPts.length >= 3);
  const visibleWaypoints = drawMode !== 'off' || showWaypoints;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <svg
        width={projected.width}
        height={projected.height}
        className="w-full h-full overflow-visible"
      >
        <defs>
          <filter id="flight-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0B1120" floodOpacity="0.65" />
          </filter>
        </defs>

        {/* Survey Area Boundary Polygon Preview */}
        {drawMode === 'survey' && polyD && (
          <path
            d={polyD}
            fill={projected.polyPts.length >= 3 ? 'rgba(236, 168, 126, 0.14)' : 'none'}
            stroke="#ECA87E"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}

        {is3D &&
          visibleWaypoints &&
          projected.wps.map((wp) => (
            <g key={`stem-${wp.rawSeq}`}>
              <line
                x1={wp.x}
                y1={wp.y}
                x2={wp.x}
                y2={wp.groundY}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="1.2"
              />
              <circle cx={wp.x} cy={wp.groundY} r="2" fill="rgba(255,255,255,0.35)" />
            </g>
          ))}

        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={drawMode !== 'off' ? '#A8C2F0' : '#9CB5E6'}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={drawMode !== 'off' ? '8 4' : undefined}
            filter="url(#flight-glow)"
          />
        )}

        {is3D && projected.drone && (
          <line
            x1={projected.drone.x}
            y1={projected.drone.y}
            x2={projected.drone.x}
            y2={projected.drone.groundY}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* Survey Polygon Corner Handles */}
      {drawMode === 'survey' &&
        projected.polyPts.map((pt) => {
          const isBeingDragged =
            draggingHandle?.kind === 'polygon' && draggingHandle.id === pt.index;
          const label = String.fromCharCode(65 + (pt.index % 26));
          return (
            <button
              key={`poly-${pt.index}`}
              type="button"
              title={`Corner ${label} — Drag to move, double-click to remove`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                dragCallbacksRef.current.onDragStart();
                setDraggingHandle({ kind: 'polygon', id: pt.index });
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRemovePolygonVertex(pt.index);
              }}
              style={{
                transform: `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute top-0 left-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg border-2 transition-transform ${
                isBeingDragged
                  ? 'bg-white text-[#141518] border-[#ECA87E] scale-115 cursor-grabbing'
                  : 'bg-[#ECA87E] text-[#141518] border-[#16181B] hover:scale-110 cursor-grab'
              }`}
            >
              {label}
            </button>
          );
        })}

      {/* Waypoint Badges (Interactive & Draggable in Custom Draw Mode) */}
      {visibleWaypoints &&
        projected.wps.map((wp) => {
          const isCompleted = drawMode === 'off' && wp.seq <= activeWaypointIndex;
          const isCustomEditable = drawMode === 'custom';
          const isBeingDragged =
            draggingHandle?.kind === 'waypoint' && draggingHandle.id === wp.rawSeq;

          if (isCustomEditable) {
            return (
              <button
                key={`wp-edit-${wp.rawSeq}`}
                type="button"
                title={`Waypoint ${wp.seq} — Drag to reposition, double-click to remove`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dragCallbacksRef.current.onDragStart();
                  setDraggingHandle({ kind: 'waypoint', id: wp.rawSeq });
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onRemoveWaypoint(wp.rawSeq);
                }}
                style={{
                  transform: `translate3d(${wp.x}px, ${wp.y}px, 0) translate(-50%, -50%)`,
                }}
                className={`pointer-events-auto absolute top-0 left-0 w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-[10px] font-bold tabular-nums shadow-lg border transition-transform ${
                  isBeingDragged
                    ? 'bg-[#ECA87E] border-white text-[#111827] scale-115 cursor-grabbing'
                    : 'bg-[#A2BAEA] border-[#ECA87E] text-[#111827] hover:scale-110 cursor-grab'
                }`}
              >
                {wp.seq}
              </button>
            );
          }

          return (
            <div
              key={`wp-${wp.rawSeq}`}
              style={{
                transform: `translate3d(${wp.x}px, ${wp.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`absolute top-0 left-0 w-[20px] h-[20px] rounded-[4px] flex items-center justify-center text-[10px] font-semibold tabular-nums shadow-md transition-colors ${
                isCompleted
                  ? 'bg-[#222B3B]/95 border border-[#5B7299]/60 text-[#D1D5DB]'
                  : 'bg-[#A2BAEA] border border-[#C6D7F7] text-[#111827]'
              }`}
            >
              {wp.seq}
            </div>
          );
        })}

      {/* Drone anchored DEAD-CENTER at (drone.x, drone.y), with callout floating cleanly above it */}
      {projected.drone && vehicle && (
        <div
          style={{
            transform: `translate3d(${projected.drone.x}px, ${projected.drone.y}px, 0) translate(-50%, -50%)`,
          }}
          className="absolute top-0 left-0 w-[38px] h-[38px] flex items-center justify-center transition-transform duration-300"
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1A1C20]/88 backdrop-blur-md border border-white/15 rounded-[8px] px-3 py-2 shadow-2xl min-w-[116px] text-left">
            <div className="text-[9.5px] text-[#9CA3AF] leading-tight">AMSL</div>
            <div className="text-[11.5px] font-semibold text-white tabular-nums leading-snug mb-1.5">
              {vehicle.altitudeAtd.toFixed(1)} m/ATD
            </div>
            <div className="text-[9.5px] text-[#9CA3AF] leading-tight">GNSS status</div>
            <div className="text-[11.5px] font-semibold text-white tabular-nums leading-snug">
              {vehicle.gnssSpeedMs.toFixed(2)} m/s
            </div>
          </div>

          <div
            style={{ transform: `rotate(${vehicle.headingDeg - (is3D ? 315 : 0)}deg)` }}
            className="transition-transform duration-300 drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)]"
          >
            <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path
                d="M11 11L29 29M29 11L11 29"
                stroke="#F9FAFB"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <ellipse cx="10" cy="10" rx="6" ry="2.2" transform="rotate(-45 10 10)" fill="#E5E7EB" fillOpacity="0.65" stroke="#FFFFFF" strokeWidth="1.2" />
              <ellipse cx="30" cy="10" rx="6" ry="2.2" transform="rotate(45 30 10)" fill="#E5E7EB" fillOpacity="0.65" stroke="#FFFFFF" strokeWidth="1.2" />
              <ellipse cx="10" cy="30" rx="6" ry="2.2" transform="rotate(45 10 30)" fill="#E5E7EB" fillOpacity="0.65" stroke="#FFFFFF" strokeWidth="1.2" />
              <ellipse cx="30" cy="30" rx="6" ry="2.2" transform="rotate(-45 30 30)" fill="#E5E7EB" fillOpacity="0.65" stroke="#FFFFFF" strokeWidth="1.2" />
              <rect x="16.5" y="14.5" width="7" height="11" rx="2.5" fill="#FFFFFF" />
              <polygon points="20,10 17.5,14.5 22.5,14.5" fill="#ECA87E" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

const MapCameraController: React.FC<{
  missionId: number;
  missionCenter: { lat: number; lng: number };
  center: { lat: number; lng: number };
  is3D: boolean;
  recenterSignal: number;
}> = ({ missionId, missionCenter, center, is3D, recenterSignal }) => {
  const map = useMap();
  const centerRef = useRef(center);
  centerRef.current = center;
  const missionCenterRef = useRef(missionCenter);
  missionCenterRef.current = missionCenter;
  const prevMissionIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;
    map.setTilt(is3D ? 45 : 0);
    map.setHeading(is3D ? 315 : 0);
  }, [map, is3D]);

  useEffect(() => {
    if (!map) return;
    if (prevMissionIdRef.current !== null && prevMissionIdRef.current !== missionId) {
      map.panTo(missionCenterRef.current);
      map.setZoom(17);
    }
    prevMissionIdRef.current = missionId;
  }, [map, missionId]);

  useEffect(() => {
    if (!map || recenterSignal === 0) return;
    map.panTo(centerRef.current);
    map.setZoom(17);
  }, [map, recenterSignal]);

  return null;
};

const MapInner: React.FC<SatelliteMapViewportProps> = ({
  mission,
  vehicle,
  is3D,
  recenterSignal,
  drawMode,
  draftWaypoints,
  draftPolygon,
  onMapDrawClick,
  onDragWaypoint,
  onRemoveWaypoint,
  onDragPolygonVertex,
  onRemovePolygonVertex,
}) => {
  const status = useApiLoadingStatus();
  const [isDraggingVertex, setIsDraggingVertex] = useState(false);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="w-full h-full bg-[#1C2024] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[#16181B] border border-[#2E3138] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white">Google Maps Satellite Unavailable</h3>
          <p className="text-xs text-[#9CA3AF] mt-1.5">
            Unable to authenticate Google Maps JavaScript API. Verify that{' '}
            <code className="text-[#E5E7EB]">VITE_GOOGLE_MAPS_API_KEY</code> is valid and has Maps
            JavaScript API enabled.
          </p>
        </div>
      </div>
    );
  }

  const activeWaypoints = drawMode !== 'off' ? draftWaypoints : (mission.waypointsJson || []);
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

  return (
    <div
      className={`relative w-full h-full ${
        drawMode !== 'off' ? '[&_.gm-style]:!cursor-crosshair' : ''
      }`}
    >
      <GoogleMap
        mapId={mapId}
        defaultCenter={{ lat: mission.centerLat, lng: mission.centerLng }}
        defaultZoom={17}
        mapTypeId="satellite"
        tilt={is3D ? 45 : 0}
        heading={is3D ? 315 : 0}
        gestureHandling={isDraggingVertex ? 'none' : 'greedy'}
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          if (drawMode === 'off' || isDraggingVertex) return;
          if (ev.detail.latLng) {
            onMapDrawClick({
              lat: Number(ev.detail.latLng.lat.toFixed(6)),
              lng: Number(ev.detail.latLng.lng.toFixed(6)),
            });
          }
        }}
      />

      <MapCameraController
        missionId={mission.id}
        missionCenter={{ lat: mission.centerLat, lng: mission.centerLng }}
        center={{
          lat: vehicle?.lat ?? mission.centerLat,
          lng: vehicle?.lng ?? mission.centerLng,
        }}
        is3D={is3D}
        recenterSignal={recenterSignal}
      />

      <FlightOverlayLayer
        waypoints={activeWaypoints}
        missionType={drawMode === 'survey' ? 'Horizontal mapp.' : mission.missionType}
        polygon={draftPolygon}
        drawMode={drawMode}
        vehicle={vehicle}
        showWaypoints={mission.showWaypoints}
        is3D={is3D}
        activeWaypointIndex={vehicle?.activeWaypointIndex ?? 11}
        reverseFlight={mission.reverseFlight}
        onDragStart={() => setIsDraggingVertex(true)}
        onDragEnd={() => setIsDraggingVertex(false)}
        onDragWaypoint={onDragWaypoint}
        onRemoveWaypoint={onRemoveWaypoint}
        onDragPolygonVertex={onDragPolygonVertex}
        onRemovePolygonVertex={onRemovePolygonVertex}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, transparent 52%, rgba(12, 14, 17, 0.35) 100%)',
        }}
      />
    </div>
  );
};

export const SatelliteMapViewport: React.FC<SatelliteMapViewportProps> = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!apiKey) {
    return (
      <div className="w-full h-full bg-[#1C2024] flex items-center justify-center p-6">
        <div className="max-w-md bg-[#16181B] border border-[#2E3138] rounded-xl p-5 text-center">
          <h3 className="text-sm font-semibold text-white">Google Maps API Key Not Configured</h3>
          <p className="text-xs text-[#9CA3AF] mt-1.5">
            Set <code className="text-[#E5E7EB]">VITE_GOOGLE_MAPS_API_KEY</code> in your environment
            secrets to render the satellite map view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="CH">
      <MapInner {...props} />
    </APIProvider>
  );
};
