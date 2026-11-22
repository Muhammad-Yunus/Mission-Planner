import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AuthScreen } from './components/AuthScreen.tsx';
import { TopNavBar } from './components/TopNavBar.tsx';
import { MissionControlRibbon } from './components/MissionControlRibbon.tsx';
import { SatelliteMapViewport } from './components/SatelliteMapViewport.tsx';
import { TelemetryHudOverlays } from './components/TelemetryHudOverlays.tsx';
import { DrawPathPlannerBar } from './components/DrawPathPlannerBar.tsx';
import {
  HelpView,
  LogbookView,
  OptionsView,
  OverviewView,
} from './components/SecondaryViews.tsx';
import { missionApi, setAuthToken } from './services/api.ts';
import { createMissionSocket } from './services/socket.ts';
import {
  computeMissionPathStats,
  generateRoute17Waypoints,
  generateSurveyGridFromPolygon,
} from './shared/flightTrack.ts';
import type {
  DrawMode,
  FlightLog,
  IngestApiKeyItem,
  LatLngLiteral,
  Mission,
  NavTab,
  TelemetryPoint,
  UserProfile,
  Vehicle,
  WaypointNode,
} from './types/mission.ts';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('routes');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [logs, setLogs] = useState<FlightLog[]>([]);
  const [apiKeys, setApiKeys] = useState<IngestApiKeyItem[]>([]);

  const [socketConnected, setSocketConnected] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Interactive Draw Path Planning state
  const [drawMode, setDrawMode] = useState<DrawMode>('off');
  const [draftWaypoints, setDraftWaypoints] = useState<WaypointNode[]>([]);
  const [draftPolygon, setDraftPolygon] = useState<LatLngLiteral[]>([]);
  const [savingDrawnPath, setSavingDrawnPath] = useState(false);

  const selectedVehicleIdRef = useRef<number | null>(null);
  selectedVehicleIdRef.current = selectedVehicleId;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    const [vehRes, misRes, logRes, keyRes] = await Promise.all([
      missionApi.getVehicles(),
      missionApi.getMissions(),
      missionApi.getLogs(100),
      missionApi.getApiKeys(),
    ]);

    setVehicles(vehRes.vehicles);
    setMissions(misRes.missions);
    setLogs(logRes.logs);
    setApiKeys(keyRes.keys);

    const defaultVehicle = vehRes.vehicles[0] ?? null;
    if (defaultVehicle) {
      setSelectedVehicleId((prev) => prev ?? defaultVehicle.id);
      const telRes = await missionApi.getVehicleTelemetry(defaultVehicle.id, 80);
      setTelemetryHistory(telRes.points);
    }

    if (misRes.missions[0]) {
      setSelectedMissionId((prev) => prev ?? misRes.missions[0].id);
    }
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    loadWorkspaceData().catch((err) => {
      console.error('Failed to load workspace data:', err);
      showToast('Failed to load mission data from PostgreSQL');
    });

    const socket = createMissionSocket(token, {
      onReady: () => setSocketConnected(true),
      onDisconnect: () => setSocketConnected(false),
      onTelemetryUpdate: ({ vehicle, telemetryPoint }) => {
        setVehicles((prev) => {
          const exists = prev.some((v) => v.id === vehicle.id);
          return exists ? prev.map((v) => (v.id === vehicle.id ? vehicle : v)) : [...prev, vehicle];
        });
        if (selectedVehicleIdRef.current === vehicle.id) {
          setTelemetryHistory((prev) => [...prev.slice(-79), telemetryPoint]);
        }
      },
      onMissionUpdated: (updatedMission) => {
        setMissions((prev) =>
          prev.map((m) => (m.id === updatedMission.id ? updatedMission : m))
        );
      },
      onVehicleUpdated: (updatedVehicle) => {
        setVehicles((prev) =>
          prev.map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v))
        );
      },
      onLogCreated: (newLog) => {
        setLogs((prev) => {
          if (prev.some((l) => l.id === newLog.id)) return prev;
          return [newLog, ...prev].slice(0, 150);
        });
      },
    });

    return () => {
      socket.disconnect();
      setSocketConnected(false);
    };
  }, [token, user, loadWorkspaceData, showToast]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0] ?? null;
  const selectedMission =
    missions.find((m) => m.id === selectedMissionId) ?? missions[0] ?? null;

  const handleSelectVehicle = async (vehicleId: number) => {
    setSelectedVehicleId(vehicleId);
    const matchingMission = missions.find((m) => m.vehicleId === vehicleId);
    if (matchingMission) {
      setSelectedMissionId(matchingMission.id);
    }
    try {
      const telRes = await missionApi.getVehicleTelemetry(vehicleId, 80);
      setTelemetryHistory(telRes.points);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateMission = async (patch: Partial<Mission>) => {
    if (!selectedMission) return;
    try {
      const res = await missionApi.updateMission(selectedMission.id, patch);
      setMissions((prev) => prev.map((m) => (m.id === res.mission.id ? res.mission : m)));
      showToast('Mission parameters saved to PostgreSQL');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update mission');
    }
  };

  const handleSendCommand = async (
    command: 'play' | 'pause' | 'step' | 'reset' | 'toggle_lock' | 'flag'
  ) => {
    if (!selectedMission) return;
    try {
      const res = await missionApi.sendCommand(selectedMission.id, command);
      setMissions((prev) => prev.map((m) => (m.id === res.mission.id ? res.mission : m)));
      if (res.vehicle) {
        setVehicles((prev) => prev.map((v) => (v.id === res.vehicle!.id ? res.vehicle! : v)));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Command failed');
    }
  };

  // Live generated survey waypoints & metrics when drawing a polygon
  const surveyPreview = useMemo(() => {
    if (drawMode !== 'survey' || !selectedMission || draftPolygon.length < 3) {
      return { waypoints: [] as WaypointNode[], areaHa: 0, areaKm: 0 };
    }
    return generateSurveyGridFromPolygon(draftPolygon, {
      spacingM: selectedMission.flightLineSpacingM,
      altitudeM: selectedMission.flightAltitudeM,
      perpendicular: selectedMission.perpendicularLines,
      reverse: selectedMission.reverseFlight,
    });
  }, [drawMode, draftPolygon, selectedMission]);

  const activeDraftWaypoints = useMemo(() => {
    if (drawMode === 'survey') return surveyPreview.waypoints;
    if (drawMode === 'custom') return draftWaypoints;
    return [];
  }, [drawMode, draftWaypoints, surveyPreview.waypoints]);

  const activeDraftStats = useMemo(() => {
    if (drawMode === 'off' || activeDraftWaypoints.length < 2) {
      return {
        estFlightDistanceM: 0,
        estFlightTime: '00:00:00',
        photosCount: 0,
        waypointsCount: activeDraftWaypoints.length,
        areaHa: surveyPreview.areaHa,
        areaKm: surveyPreview.areaKm,
        centerLat: selectedMission?.centerLat ?? 46.54354,
        centerLng: selectedMission?.centerLng ?? 6.51716,
      };
    }
    const effectiveType = drawMode === 'survey' ? 'Horizontal mapp.' : 'Custom path';
    return computeMissionPathStats(
      activeDraftWaypoints,
      effectiveType,
      selectedMission?.photoIntervalM ?? 50,
      drawMode === 'survey' ? { areaHa: surveyPreview.areaHa, areaKm: surveyPreview.areaKm } : undefined
    );
  }, [drawMode, activeDraftWaypoints, surveyPreview.areaHa, surveyPreview.areaKm, selectedMission]);

  const handleToggleDrawMode = () => {
    if (!selectedMission) return;
    if (drawMode !== 'off') {
      setDrawMode('off');
      return;
    }
    if (selectedMission.isLocked) {
      showToast('Unlock mission parameters before drawing a flight path');
      return;
    }
    setDrawMode('custom');
    setDraftWaypoints(
      selectedMission.missionType === 'Custom path' ? selectedMission.waypointsJson || [] : []
    );
    setDraftPolygon([]);
  };

  const handleChangeDrawMode = (nextMode: 'custom' | 'survey') => {
    setDrawMode(nextMode);
    if (
      nextMode === 'custom' &&
      draftWaypoints.length === 0 &&
      selectedMission?.missionType === 'Custom path'
    ) {
      setDraftWaypoints(selectedMission.waypointsJson || []);
    }
  };

  const handleMapDrawClick = (latLng: LatLngLiteral) => {
    if (!selectedMission) return;
    if (drawMode === 'custom') {
      setDraftWaypoints((prev) => [
        ...prev,
        {
          seq: prev.length + 1,
          lat: latLng.lat,
          lng: latLng.lng,
          alt: selectedMission.flightAltitudeM,
        },
      ]);
    } else if (drawMode === 'survey') {
      setDraftPolygon((prev) => [...prev, latLng]);
    }
  };

  const handleDragWaypoint = (seq: number, latLng: LatLngLiteral) => {
    setDraftWaypoints((prev) =>
      prev.map((wp) => (wp.seq === seq ? { ...wp, lat: latLng.lat, lng: latLng.lng } : wp))
    );
  };

  const handleRemoveWaypoint = (seq: number) => {
    setDraftWaypoints((prev) =>
      prev
        .filter((wp) => wp.seq !== seq)
        .map((wp, idx) => ({ ...wp, seq: idx + 1 }))
    );
  };

  const handleDragPolygonVertex = (index: number, latLng: LatLngLiteral) => {
    setDraftPolygon((prev) => prev.map((pt, i) => (i === index ? latLng : pt)));
  };

  const handleRemovePolygonVertex = (index: number) => {
    setDraftPolygon((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUndoDraw = () => {
    if (drawMode === 'custom') {
      setDraftWaypoints((prev) => prev.slice(0, -1));
    } else if (drawMode === 'survey') {
      setDraftPolygon((prev) => prev.slice(0, -1));
    }
  };

  const handleClearDraw = () => {
    if (drawMode === 'custom') {
      setDraftWaypoints([]);
    } else if (drawMode === 'survey') {
      setDraftPolygon([]);
    }
  };

  const handleRestorePreset17 = async () => {
    if (!selectedMission || selectedMission.isLocked) return;
    setSavingDrawnPath(true);
    try {
      const presetWps = generateRoute17Waypoints(118.3);
      await handleUpdateMission({
        missionType: 'Horizontal mapp.',
        waypointsJson: presetWps,
        waypointsCount: 23,
        estFlightDistanceM: 9637,
        estFlightTime: '00:11:34',
        photosCount: 138,
        areaHa: 9.0,
        areaKm: 0.09,
        centerLat: 46.54354,
        centerLng: 6.51716,
      });
      await handleSendCommand('reset');
      setDraftWaypoints([]);
      setDraftPolygon([]);
      setDrawMode('off');
      showToast('Restored default Route № 17 survey grid');
    } finally {
      setSavingDrawnPath(false);
    }
  };

  const handleApplyDrawnPath = async () => {
    if (!selectedMission || activeDraftWaypoints.length < 2) return;
    setSavingDrawnPath(true);
    try {
      const nextMissionType: Mission['missionType'] =
        drawMode === 'survey' ? 'Horizontal mapp.' : 'Custom path';

      await handleUpdateMission({
        missionType: nextMissionType,
        waypointsJson: activeDraftWaypoints,
        waypointsCount: activeDraftStats.waypointsCount,
        estFlightDistanceM: activeDraftStats.estFlightDistanceM,
        estFlightTime: activeDraftStats.estFlightTime,
        photosCount: activeDraftStats.photosCount,
        areaHa: activeDraftStats.areaHa,
        areaKm: activeDraftStats.areaKm,
        centerLat: activeDraftStats.centerLat,
        centerLng: activeDraftStats.centerLng,
      });

      // Reset drone progress onto Waypoint 1 of the newly saved route
      await handleSendCommand('reset');
      setDrawMode('off');
      showToast(`Saved ${activeDraftWaypoints.length}-waypoint flight path to PostgreSQL`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save drawn flight path');
    } finally {
      setSavingDrawnPath(false);
    }
  };

  const handleCreateApiKey = async (name: string, vehicleCode?: string) => {
    const res = await missionApi.createApiKey({ name, vehicleCode });
    setApiKeys((prev) => [res.key, ...prev]);
    return res.rawKey;
  };

  const handleRevokeApiKey = async (id: number) => {
    await missionApi.revokeApiKey(id);
    setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: false } : k)));
    showToast('Ingest API key revoked');
  };

  const handleLogout = () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  if (!user || !token) {
    return (
      <AuthScreen
        onAuthenticated={(u, t) => {
          setUser(u);
          setToken(t);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#141518] text-[#F3F4F6] overflow-hidden">
      <TopNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        vehicles={vehicles}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={handleSelectVehicle}
        user={user}
        onLogout={handleLogout}
        socketConnected={socketConnected}
      />

      {activeTab === 'routes' && selectedMission && (
        <div className="flex-1 flex flex-col min-h-0">
          <MissionControlRibbon
            mission={selectedMission}
            vehicle={selectedVehicle}
            onUpdateMission={handleUpdateMission}
            onSendCommand={handleSendCommand}
            onSelectTab={setActiveTab}
            onCenterMap={() => setRecenterSignal((s) => s + 1)}
            drawMode={drawMode}
            onToggleDrawMode={handleToggleDrawMode}
          />

          <main className="relative flex-1 min-h-0 w-full overflow-hidden">
            <SatelliteMapViewport
              mission={selectedMission}
              vehicle={selectedVehicle}
              is3D={is3D}
              recenterSignal={recenterSignal}
              drawMode={drawMode}
              draftWaypoints={activeDraftWaypoints}
              draftPolygon={draftPolygon}
              onMapDrawClick={handleMapDrawClick}
              onDragWaypoint={handleDragWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onDragPolygonVertex={handleDragPolygonVertex}
              onRemovePolygonVertex={handleRemovePolygonVertex}
            />

            <DrawPathPlannerBar
              drawMode={drawMode}
              onChangeMode={handleChangeDrawMode}
              pointCount={drawMode === 'survey' ? draftPolygon.length : draftWaypoints.length}
              previewWaypointsCount={activeDraftWaypoints.length}
              previewDistanceM={activeDraftStats.estFlightDistanceM}
              previewTime={activeDraftStats.estFlightTime}
              previewAreaHa={activeDraftStats.areaHa}
              canUndo={drawMode === 'survey' ? draftPolygon.length > 0 : draftWaypoints.length > 0}
              canClear={drawMode === 'survey' ? draftPolygon.length > 0 : draftWaypoints.length > 0}
              canApply={activeDraftWaypoints.length >= 2}
              saving={savingDrawnPath}
              isLocked={selectedMission.isLocked}
              onUndo={handleUndoDraw}
              onClear={handleClearDraw}
              onRestorePreset={handleRestorePreset17}
              onCancel={() => setDrawMode('off')}
              onApply={handleApplyDrawnPath}
            />

            <TelemetryHudOverlays
              vehicle={selectedVehicle}
              telemetryHistory={telemetryHistory}
              is3D={is3D}
              onToggle3D={() => setIs3D((v) => !v)}
              onRecenter={() => setRecenterSignal((s) => s + 1)}
              drawMode={drawMode}
              onToggleDrawMode={handleToggleDrawMode}
            />
          </main>
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewView
          vehicles={vehicles}
          missions={missions}
          selectedVehicleId={selectedVehicle?.id ?? null}
          onSelectVehicle={handleSelectVehicle}
          onOpenRoute={(missionId) => {
            setSelectedMissionId(missionId);
            setActiveTab('routes');
          }}
          socketConnected={socketConnected}
        />
      )}

      {activeTab === 'logbook' && <LogbookView logs={logs} />}

      {activeTab === 'options' && (
        <OptionsView
          apiKeys={apiKeys}
          onCreateKey={handleCreateApiKey}
          onRevokeKey={handleRevokeApiKey}
        />
      )}

      {activeTab === 'help' && <HelpView onSelectTab={setActiveTab} />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#1F2227] border border-[#3B3F48] text-xs font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
