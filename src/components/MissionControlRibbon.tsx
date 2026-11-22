import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Cpu,
  Route,
  Settings,
  Lock,
  Unlock,
  Flag,
  Pause,
  Play,
  SkipForward,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  PenTool,
} from 'lucide-react';
import type { Mission, Vehicle, NavTab, DrawMode } from '../types/mission.ts';

interface MissionControlRibbonProps {
  mission: Mission;
  vehicle: Vehicle | null;
  onUpdateMission: (patch: Partial<Mission>) => Promise<void>;
  onSendCommand: (command: 'play' | 'pause' | 'step' | 'reset' | 'toggle_lock' | 'flag') => Promise<void>;
  onSelectTab: (tab: NavTab) => void;
  onCenterMap: () => void;
  drawMode: DrawMode;
  onToggleDrawMode: () => void;
}

interface TickSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

const RulerTickSlider: React.FC<TickSliderProps> = ({
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  formatValue,
}) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="relative flex-1 h-[26px] bg-[#141518] border border-[#2A2C32] rounded-[5px] flex items-center px-2 overflow-hidden">
        {/* Vertical ruler tick marks */}
        <div className="w-full flex items-center justify-between pointer-events-none">
          {ticks.map((t) => (
            <span
              key={t}
              className={`w-[1px] bg-[#3B3F47] ${t % 2 === 0 ? 'h-2.5' : 'h-1.5 opacity-60'}`}
            />
          ))}
        </div>

        {/* Thumb handle matching screenshot */}
        <div
          className="absolute top-[2px] bottom-[2px] w-[18px] -ml-[9px] rounded-[4px] bg-[#383B43] border border-[#4E525C] shadow-sm flex items-center justify-center pointer-events-none transition-[left] duration-75"
          style={{ left: `calc(${pct}% * 0.84 + 8%)` }}
        >
          <span className="w-[1px] h-3 bg-[#7D828C]" />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Parameter slider"
        />
      </div>

      <div className="w-[42px] h-[26px] bg-[#26282D] border border-[#32353C] rounded-[5px] flex items-center justify-center text-[11.5px] font-medium text-[#E5E7EB] tabular-nums shrink-0">
        {formatValue ? formatValue(value) : value}
      </div>
    </div>
  );
};

export const MissionControlRibbon: React.FC<MissionControlRibbonProps> = ({
  mission,
  vehicle,
  onUpdateMission,
  onSendCommand,
  onSelectTab,
  onCenterMap,
  drawMode,
  onToggleDrawMode,
}) => {
  const [nameInput, setNameInput] = useState(mission.name);
  const [resolution, setResolution] = useState(mission.resolutionCmPx);
  const [latOverlap, setLatOverlap] = useState(mission.latOverlapPct);
  const [longOverlap, setLongOverlap] = useState(mission.longOverlapPct);
  const [camera, setCamera] = useState<'Aeria X' | 'COD 3D'>(mission.camera);
  const [planAbove, setPlanAbove] = useState<'AED' | 'EgTI' | 'Prot. 3'>(mission.planAbove);
  const [perpendicular, setPerpendicular] = useState(mission.perpendicularLines);
  const [reverseFlight, setReverseFlight] = useState(mission.reverseFlight);
  const [saving, setSaving] = useState(false);
  const [collapsedMobile, setCollapsedMobile] = useState(false);
  const [activeRail, setActiveRail] = useState<'pin' | 'drone' | 'route' | 'draw' | 'gear'>('route');

  useEffect(() => {
    setNameInput(mission.name);
    setResolution(mission.resolutionCmPx);
    setLatOverlap(mission.latOverlapPct);
    setLongOverlap(mission.longOverlapPct);
    setCamera(mission.camera);
    setPlanAbove(mission.planAbove);
    setPerpendicular(mission.perpendicularLines);
    setReverseFlight(mission.reverseFlight);
  }, [mission]);

  const handleSaveDefault = async () => {
    setSaving(true);
    try {
      await onUpdateMission({
        name: nameInput,
        camera,
        planAbove,
        resolutionCmPx: resolution,
        latOverlapPct: latOverlap,
        longOverlapPct: longOverlap,
        perpendicularLines: perpendicular,
        reverseFlight,
      });
    } finally {
      setSaving(false);
    }
  };

  const voltage = vehicle?.voltage ?? 14.3;
  const tempC = vehicle?.temperatureC ?? 27;
  const mahUsed = vehicle?.mahUsed ?? 2663;
  const mahTotal = vehicle?.mahTotal ?? 4366;
  const isPlaying = mission.status === 'Active';

  return (
    <section className="relative z-30 bg-[#1D1F22] border-b border-[#2B2D33] select-none shrink-0">
      {/* Mobile collapse header */}
      <div className="flex xl:hidden items-center justify-between px-3 py-2 border-b border-[#282A2F]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">{mission.routeCode}</span>
          <span className="text-[11px] text-[#8E9299]">{mission.missionType}</span>
          <span className="text-[11px] font-mono-tabular text-[#9CB5E6] ml-1">
            {voltage.toFixed(1).replace('.', ',')}V · {mahUsed}/{mahTotal}mAh
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsedMobile((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#27292E] border border-[#353840] text-[11px] text-[#E5E7EB]"
        >
          {collapsedMobile ? (
            <>
              Expand <ChevronDown className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Collapse <ChevronUp className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      <div className={`${collapsedMobile ? 'hidden xl:flex' : 'flex'} items-stretch`}>
        {/* Far-Left Vertical Tool Rail */}
        <aside className="hidden sm:flex w-[42px] bg-[#191B1E] border-r border-[#292B30] flex-col items-center py-2.5 gap-2 shrink-0">
          {[
            { id: 'pin' as const, icon: MapPin, label: 'Center Map', action: () => { setActiveRail('pin'); onCenterMap(); } },
            { id: 'drone' as const, icon: Cpu, label: 'Vehicle Overview', action: () => { setActiveRail('drone'); onSelectTab('overview'); } },
            { id: 'route' as const, icon: Route, label: 'Route Planner', action: () => { setActiveRail('route'); if (drawMode !== 'off') onToggleDrawMode(); } },
            { id: 'draw' as const, icon: PenTool, label: 'Draw Flight Path', action: () => { setActiveRail('draw'); onToggleDrawMode(); } },
            { id: 'gear' as const, icon: Settings, label: 'Options', action: () => { setActiveRail('gear'); onSelectTab('options'); } },
          ].map(({ id, icon: Icon, label, action }) => {
            const active = id === 'draw' ? drawMode !== 'off' : (drawMode === 'off' && activeRail === id);
            return (
              <button
                key={id}
                type="button"
                title={label}
                onClick={action}
                className={`relative w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#32353C] text-white'
                    : 'text-[#7D828A] hover:text-[#D1D5DB] hover:bg-[#23252A]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {active && (
                  <span className="absolute -bottom-0.5 left-1.5 right-1.5 h-[1.5px] bg-white rounded-full" />
                )}
              </button>
            );
          })}
        </aside>

        {/* Main Ribbon Content */}
        <div className="flex-1 px-3 py-2.5 flex flex-col xl:flex-row items-stretch xl:items-center gap-3.5 xl:gap-5 overflow-x-auto">
          {/* ZONE 1: Route № 17 Card + LCD + 2x2 Action Keypad */}
          <div className="bg-[#23252A] border border-[#2E3138] rounded-[8px] p-2.5 flex items-stretch gap-3 shrink-0">
            {/* Left Route Summary */}
            <div className="w-[144px] flex flex-col justify-between text-[11.5px]">
              <div className="flex items-start gap-2 pb-1.5">
                <span className="w-6 h-6 rounded-[4px] bg-[#30333A] flex items-center justify-center text-[#E5E7EB] shrink-0 mt-0.5">
                  <Route className="w-3.5 h-3.5" />
                </span>
                <div className="leading-tight min-w-0">
                  <div className="text-[12px] font-medium text-white truncate">
                    {mission.routeCode}
                  </div>
                  <div className="text-[10.5px] text-[#8E9299] truncate">
                    {mission.missionType}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#30333A] py-1 text-[#E5E7EB] tabular-nums">
                {mission.estFlightTime.slice(3)}
              </div>
              <div className="border-t border-[#30333A] py-1 text-[#E5E7EB] tabular-nums">
                {resolution.toFixed(1)} cm / px
              </div>
              <div className="border-t border-[#30333A] pt-1 flex items-center justify-between text-[#E5E7EB] tabular-nums">
                <span>{mission.areaHa.toFixed(1)} ha</span>
                <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
                  {mission.riskLevel}
                  <AlertCircle className="w-3 h-3 text-[#8E9299]" />
                </span>
              </div>
            </div>

            {/* Right LCD + 2x2 Keypad */}
            <div className="w-[156px] flex flex-col justify-between gap-2">
              <div className="bg-[#B3BDC3] border border-[#111316] rounded-[5px] px-2 py-1.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.35)] font-mono-tabular text-[#14171A] leading-tight">
                <div className="flex items-center justify-between text-[11px] font-bold tracking-tight">
                  <span>{voltage.toFixed(1).replace('.', ',')} VOLT</span>
                  <span>{Math.round(tempC)}°C</span>
                </div>
                <div className="text-[11px] font-bold tracking-tight mt-0.5">
                  {mahUsed} / {mahTotal} MAH
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  title={mission.isLocked ? 'Unlock Parameters' : 'Lock Parameters'}
                  onClick={() => onSendCommand('toggle_lock')}
                  className={`h-[30px] rounded-[5px] flex items-center justify-center transition-colors cursor-pointer ${
                    mission.isLocked
                      ? 'bg-[#ECA87E] text-[#141518]'
                      : 'bg-[#393C43] hover:bg-[#464A52] text-[#E5E7EB]'
                  }`}
                >
                  {mission.isLocked ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  title="Flag Current Waypoint"
                  onClick={() => onSendCommand('flag')}
                  className="h-[30px] rounded-[5px] bg-[#393C43] hover:bg-[#464A52] text-[#E5E7EB] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  title={isPlaying ? 'Pause Mission' : 'Resume Mission'}
                  onClick={() => onSendCommand(isPlaying ? 'pause' : 'play')}
                  className="h-[30px] rounded-[5px] bg-[#95ADD8] hover:bg-[#A5BCE4] text-[#141619] flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  title="Step to Next Waypoint"
                  onClick={() => onSendCommand('step')}
                  className="h-[30px] rounded-[5px] bg-[#393C43] hover:bg-[#464A52] text-[#E5E7EB] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            </div>
          </div>

          {/* ZONES 2, 3, 4: Parameter Columns */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5 min-w-0">
            {/* Column 1 */}
            <div className="flex flex-col justify-between gap-1.5">
              {/* Name */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] text-[11px] text-[#7D828A] shrink-0">Name</span>
                <input
                  type="text"
                  disabled={mission.isLocked}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 text-[11.5px] text-[#E5E7EB] focus:outline-none focus:border-[#95ADD8] disabled:opacity-60 min-w-0"
                />
              </div>

              {/* Camera */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] text-[11px] text-[#7D828A] shrink-0">Camera</span>
                <div className="flex-1 grid grid-cols-2 bg-[#17181B] border border-[#2C2E35] rounded-[5px] p-[2px] h-[26px]">
                  {(['Aeria X', 'COD 3D'] as const).map((cam) => (
                    <button
                      key={cam}
                      type="button"
                      disabled={mission.isLocked}
                      onClick={() => {
                        setCamera(cam);
                        onUpdateMission({ camera: cam });
                      }}
                      className={`text-[11px] font-medium rounded-[3px] transition-colors cursor-pointer whitespace-nowrap ${
                        camera === cam
                          ? 'bg-[#3A3D45] text-white'
                          : 'text-[#8E9299] hover:text-[#D1D5DB]'
                      }`}
                    >
                      {cam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan above */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] text-[11px] text-[#7D828A] shrink-0">Plan above</span>
                <div className="flex-1 grid grid-cols-3 bg-[#17181B] border border-[#2C2E35] rounded-[5px] p-[2px] h-[26px]">
                  {(['AED', 'EgTI', 'Prot. 3'] as const).map((datum) => (
                    <button
                      key={datum}
                      type="button"
                      disabled={mission.isLocked}
                      onClick={() => {
                        setPlanAbove(datum);
                        onUpdateMission({ planAbove: datum });
                      }}
                      className={`text-[11px] font-medium rounded-[3px] transition-colors cursor-pointer whitespace-nowrap ${
                        planAbove === datum
                          ? 'bg-[#3A3D45] text-white'
                          : 'text-[#8E9299] hover:text-[#D1D5DB]'
                      }`}
                    >
                      {datum}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] text-[10.5px] leading-tight text-[#7D828A] shrink-0">
                  Resolution
                  <br />
                  cm / px
                </span>
                <RulerTickSlider
                  value={resolution}
                  min={1.0}
                  max={6.0}
                  step={0.5}
                  disabled={mission.isLocked}
                  onChange={setResolution}
                  formatValue={(v) => v.toFixed(1)}
                />
              </div>

              {/* Lat. overlap */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] text-[10.5px] leading-tight text-[#7D828A] shrink-0">
                  Lat. overlap
                  <br />%
                </span>
                <RulerTickSlider
                  value={latOverlap}
                  min={30}
                  max={90}
                  step={1}
                  disabled={mission.isLocked}
                  onChange={setLatOverlap}
                />
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col justify-between gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-[82px] text-[11px] text-[#7D828A] shrink-0">Area</span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.areaHa.toFixed(1)} ha, {mission.areaKm.toFixed(2)} km
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[82px] text-[11px] text-[#7D828A] shrink-0">
                  Flight altitude
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.flightAltitudeM.toFixed(1)} m/{planAbove}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[82px] text-[11px] text-[#7D828A] shrink-0">Photos</span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.photosCount}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[82px] text-[11px] text-[#7D828A] shrink-0">
                  Photo interval
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.photoIntervalM} m
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[82px] text-[10.5px] leading-tight text-[#7D828A] shrink-0">
                  Long. overlap
                  <br />%
                </span>
                <RulerTickSlider
                  value={longOverlap}
                  min={30}
                  max={90}
                  step={1}
                  disabled={mission.isLocked}
                  onChange={setLongOverlap}
                />
              </div>
            </div>

            {/* Column 3 */}
            <div className="flex flex-col justify-between gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-[98px] text-[11px] text-[#7D828A] shrink-0">
                  Image coverage
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.imageCoverage}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[98px] text-[11px] text-[#7D828A] shrink-0">
                  Est. flight time
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.estFlightTime}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[98px] text-[11px] text-[#7D828A] shrink-0">
                  Est. flight distance
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.estFlightDistanceM} m
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[98px] text-[11px] text-[#7D828A] shrink-0">
                  Flight line spacing
                </span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.flightLineSpacingM} m
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-[98px] text-[11px] text-[#7D828A] shrink-0">Waypoints</span>
                <div className="flex-1 h-[26px] bg-[#26282D] border border-[#31343B] rounded-[5px] px-2.5 flex items-center text-[11.5px] text-[#E5E7EB] tabular-nums">
                  {mission.waypointsCount}
                </div>
              </div>
            </div>
          </div>

          {/* ZONE 5: Right Toggles & Action Buttons */}
          <div className="w-full xl:w-[196px] flex flex-col justify-between gap-1.5 shrink-0">
            <div className="flex items-center justify-between h-[26px]">
              <span className="text-[11px] text-[#8E9299]">Perpendicular lines</span>
              <button
                type="button"
                role="switch"
                aria-checked={perpendicular}
                disabled={mission.isLocked}
                onClick={() => {
                  const next = !perpendicular;
                  setPerpendicular(next);
                  onUpdateMission({ perpendicularLines: next });
                }}
                className={`w-[36px] h-[22px] rounded-[5px] p-[2px] transition-colors cursor-pointer flex items-center ${
                  perpendicular ? 'bg-[#EE9B6D] justify-end' : 'bg-[#2C2E35] justify-start'
                }`}
              >
                <span className="w-[16px] h-[18px] rounded-[3px] bg-[#18191C] shadow" />
              </button>
            </div>

            <div className="flex items-center justify-between h-[26px]">
              <span className="text-[11px] text-[#8E9299]">Reverse flight</span>
              <button
                type="button"
                role="switch"
                aria-checked={reverseFlight}
                disabled={mission.isLocked}
                onClick={() => {
                  const next = !reverseFlight;
                  setReverseFlight(next);
                  onUpdateMission({ reverseFlight: next });
                }}
                className={`w-[36px] h-[22px] rounded-[5px] p-[2px] transition-colors cursor-pointer flex items-center ${
                  reverseFlight ? 'bg-[#EE9B6D] justify-end' : 'bg-[#2C2E35] justify-start'
                }`}
              >
                <span className="w-[16px] h-[18px] rounded-[3px] bg-[#18191C] shadow" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onSendCommand('reset')}
              className="h-[26px] w-full rounded-[5px] bg-[#3A3D44] hover:bg-[#464A52] text-[11.5px] font-medium text-[#E5E7EB] transition-colors cursor-pointer"
            >
              Reset progress
            </button>

            <button
              type="button"
              onClick={() => onUpdateMission({ showWaypoints: !mission.showWaypoints })}
              className={`h-[26px] w-full rounded-[5px] text-[11.5px] font-medium transition-colors cursor-pointer ${
                mission.showWaypoints
                  ? 'bg-[#3A3D44] hover:bg-[#464A52] text-[#E5E7EB]'
                  : 'bg-[#26282D] hover:bg-[#31343B] text-[#8E9299]'
              }`}
            >
              {mission.showWaypoints ? 'Show waypoints' : 'Hide waypoints'}
            </button>

            <button
              type="button"
              disabled={saving || mission.isLocked}
              onClick={handleSaveDefault}
              className="h-[26px] w-full rounded-[5px] bg-[#ECA87E] hover:bg-[#F3B58E] disabled:opacity-50 text-[11.5px] font-semibold text-[#151619] transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save as default'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
