import React from 'react';
import {
  TrendingUp,
  Crosshair,
  Navigation,
  Wind,
  Gauge,
  Compass,
  Move,
  Box,
  PenTool,
} from 'lucide-react';
import type { TelemetryPoint, Vehicle, DrawMode } from '../types/mission.ts';

interface TelemetryHudOverlaysProps {
  vehicle: Vehicle | null;
  telemetryHistory: TelemetryPoint[];
  is3D: boolean;
  onToggle3D: () => void;
  onRecenter: () => void;
  drawMode: DrawMode;
  onToggleDrawMode: () => void;
}

function formatDms(decimal: number, posChar: string, negChar: string): string {
  const dir = decimal >= 0 ? posChar : negChar;
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(3).padStart(6, '0');
  return `${deg}° ${String(min).padStart(2, '0')}' ${sec}" ${dir}`;
}

function getCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

export const TelemetryHudOverlays: React.FC<TelemetryHudOverlaysProps> = ({
  vehicle,
  telemetryHistory,
  is3D,
  onToggle3D,
  onRecenter,
  drawMode,
  onToggleDrawMode,
}) => {
  const altAto = vehicle?.altitudeAto ?? 1;
  const bearing = vehicle?.bearingDeg ?? 0;
  const heading = vehicle?.headingDeg ?? 315;
  const pitch = vehicle?.pitchDeg ?? 0;
  const roll = vehicle?.rollDeg ?? 0;
  const groundDist = vehicle?.groundDistanceM ?? 4.2;
  const windSpeed = vehicle?.windSpeedMs ?? 0.4;
  const groundSpeed = vehicle?.groundSpeedMs ?? 0;
  const airSpeed = vehicle?.airSpeedMs ?? 0;
  const lat = vehicle?.lat ?? 46.54354;
  const lng = vehicle?.lng ?? 6.51716;
  const altAmsl = vehicle?.altitudeAmsl ?? 446;

  // Build dual-axis SVG chart series from PostgreSQL telemetry history
  const chartW = 264;
  const chartH = 92;
  const points = telemetryHistory.length >= 2 ? telemetryHistory : [];

  const speedCoords = points.map((pt, i) => {
    const x = (i / Math.max(1, points.length - 1)) * chartW;
    const normSpeed = Math.min(1, Math.max(0, pt.speedKts / 900));
    const y = chartH - normSpeed * chartH;
    return { x, y };
  });

  const altCoords = points.map((pt, i) => {
    const x = (i / Math.max(1, points.length - 1)) * chartW;
    // Map altitudeAmsl or scaled metric onto 0..12K axis cleanly
    const scaledVal = pt.altitudeAmsl * 14.8;
    const normAlt = Math.min(1, Math.max(0, scaledVal / 12000));
    const y = chartH - normAlt * chartH;
    return { x, y };
  });

  const toLine = (coords: Array<{ x: number; y: number }>) =>
    coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  const toArea = (coords: Array<{ x: number; y: number }>) => {
    if (coords.length === 0) return '';
    return `${toLine(coords)} L ${coords[coords.length - 1].x.toFixed(1)} ${chartH} L ${coords[0].x.toFixed(1)} ${chartH} Z`;
  };

  const speedLine = toLine(speedCoords);
  const speedArea = toArea(speedCoords);
  const altLine = toLine(altCoords);
  const altArea = toArea(altCoords);

  const timeLabels = (() => {
    if (points.length < 6) {
      return ['18:00', '18:30', '19:00', '19:30', '20:00', 'Now'];
    }
    const indices = [0, 0.2, 0.4, 0.6, 0.8].map((f) => Math.floor(f * (points.length - 1)));
    const labels = indices.map((idx) => {
      const d = new Date(points[idx].recordedAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    return [...labels, 'Now'];
  })();

  return (
    <>
      {/* LEFT-BOTTOM TELEMETRY HUD STACK */}
      <div className="absolute left-3 md:left-4 bottom-3 md:bottom-4 z-20 flex flex-col gap-2 pointer-events-auto max-w-[174px]">
        {/* Card 1: Altitude ATO + Artificial Horizon FPV + Bearing */}
        <div className="bg-[#16181B]/88 backdrop-blur-md border border-white/10 rounded-[10px] p-2.5 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[5px] bg-[#25272C] border border-white/5 flex items-center justify-center text-[#9CA3AF] shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] text-[#9CA3AF]">Altitude ATO</div>
              <div className="text-[11.5px] font-semibold text-white tabular-nums">
                {Math.round(altAto)} m
              </div>
            </div>
          </div>

          {/* Live Artificial Horizon / FPV Reticle Window */}
          <div className="my-2 h-[106px] rounded-[7px] overflow-hidden relative border border-white/10 bg-[#1B231E]">
            {/* Tilting horizon layer driven by live pitchDeg & rollDeg */}
            <div
              className="absolute -inset-8 transition-transform duration-200"
              style={{
                transform: `translateY(${pitch * 1.8}px) rotate(${roll}deg)`,
              }}
            >
              {/* Atmospheric Sky */}
              <div
                className="h-1/2 w-full"
                style={{
                  background:
                    'linear-gradient(180deg, #4E5B69 0%, #7C8790 65%, #A7AAAE 100%)',
                }}
              />
              {/* Treeline & Meadow Terrain */}
              <div
                className="h-1/2 w-full relative"
                style={{
                  background:
                    'linear-gradient(180deg, #212A1C 0%, #374F2B 35%, #466634 100%)',
                }}
              >
                <div className="absolute top-0 inset-x-0 h-2 bg-[#1A2117] opacity-85" />
              </div>
            </div>

            {/* HUD Crosshair & Pitch Ladder Reticle */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] tracking-[2px] text-white/80">····</span>
                <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white flex items-center justify-center">
                  <span className="w-0.5 h-0.5 bg-white rounded-full" />
                </span>
                <span className="text-[9px] tracking-[2px] text-white/80">····</span>
              </div>
            </div>
            {/* Vertical center dots */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 pointer-events-none">
              <span className="text-[8px] leading-none text-white/60">·<br/>·</span>
              <span className="text-[8px] leading-none text-white/60">·<br/>·</span>
            </div>
            {/* Side elevation ladder ticks */}
            <div className="absolute left-1.5 inset-y-2 flex flex-col justify-between pointer-events-none opacity-60">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-2 h-[1px] bg-white" />
              ))}
            </div>
            <div className="absolute right-1.5 inset-y-2 flex flex-col justify-between pointer-events-none opacity-60">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-2 h-[1px] bg-white" />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[5px] bg-[#25272C] border border-white/5 flex items-center justify-center text-[#9CA3AF] shrink-0">
              <Crosshair className="w-3.5 h-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] text-[#9CA3AF]">Bearing</div>
              <div className="text-[11.5px] font-semibold text-white tabular-nums">
                {Math.round(bearing)}&apos; {getCardinal(bearing)}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Ground Distance, Wind, Ground Speed, Air Speed */}
        <div className="hidden sm:flex bg-[#16181B]/88 backdrop-blur-md border border-white/10 rounded-[10px] p-2.5 flex-col gap-2 shadow-2xl">
          {[
            { icon: Navigation, label: 'Ground Distance', val: `${groundDist.toFixed(1)} m` },
            { icon: Wind, label: 'Wind speed', val: `${windSpeed.toFixed(1)} m/s` },
            { icon: Compass, label: 'Ground speed', val: `${Number(groundSpeed.toFixed(1))} m/s` },
            { icon: Gauge, label: 'Air speed', val: `${Number(airSpeed.toFixed(1))} m/s` },
          ].map(({ icon: Icon, label, val }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-[5px] bg-[#25272C] border border-white/5 flex items-center justify-center text-[#9CA3AF] shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] text-[#9CA3AF]">{label}</div>
                <div className="text-[11.5px] font-semibold text-white tabular-nums">{val}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT-BOTTOM CONTROLS, COMPASS & SPEED/ALTITUDE GRAPH */}
      <div className="absolute right-3 md:right-4 bottom-3 md:bottom-4 z-20 flex flex-col items-end gap-2 pointer-events-auto max-w-[calc(100vw-24px)]">
        {/* Map Mode Switcher + Circular Compass Rose */}
        <div className="flex flex-col items-end gap-2">
          <div className="bg-[#16181B]/88 backdrop-blur-md border border-white/10 rounded-[8px] p-1 flex items-center gap-1 shadow-xl">
            <button
              type="button"
              onClick={onToggleDrawMode}
              title={drawMode === 'off' ? 'Draw Flight Path' : 'Close Path Drawing'}
              className={`w-7 h-7 rounded-[5px] flex items-center justify-center transition-colors cursor-pointer ${
                drawMode !== 'off'
                  ? 'bg-[#ECA87E] text-[#141518]'
                  : 'bg-[#24262B] hover:bg-[#31343B] text-[#E5E7EB]'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRecenter}
              title="Center map on active vehicle"
              className="w-7 h-7 rounded-[5px] bg-[#24262B] hover:bg-[#31343B] text-[#E5E7EB] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggle3D}
              title={is3D ? 'Switch to 2D Top-Down View' : 'Switch to 3D Tilted View'}
              className={`w-7 h-7 rounded-[5px] flex items-center justify-center transition-colors cursor-pointer ${
                is3D
                  ? 'bg-[#3A3D45] text-white'
                  : 'bg-[#24262B] hover:bg-[#31343B] text-[#9CA3AF]'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Circular Compass Rose */}
          <div className="relative w-[68px] h-[68px] rounded-full bg-[#16181B]/90 backdrop-blur-md border border-white/15 shadow-2xl flex items-center justify-center">
            <svg viewBox="0 0 80 80" className="w-full h-full">
              {/* Outer radial degree ticks */}
              {Array.from({ length: 36 }).map((_, idx) => {
                const angle = idx * 10;
                const major = idx % 3 === 0;
                return (
                  <line
                    key={idx}
                    x1="40"
                    y1={major ? '3' : '5'}
                    x2="40"
                    y2="8"
                    stroke={major ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={major ? '1.3' : '0.8'}
                    transform={`rotate(${angle} 40 40)`}
                  />
                );
              })}
              {/* Crosshairs */}
              <line x1="40" y1="10" x2="40" y2="70" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <line x1="10" y1="40" x2="70" y2="40" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              {/* Rotating orange heading indicator */}
              <g transform={`rotate(${heading} 40 40)`}>
                <polygon points="40,6 36,13 44,13" fill="#E59866" />
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-[11.5px] font-bold text-white tabular-nums">
                {Math.round(heading)}°
              </span>
              <span className="text-[9.5px] font-medium text-[#9CA3AF] mt-0.5">
                {getCardinal(heading)}
              </span>
            </div>
          </div>
        </div>

        {/* Speed & Altitude Graph Card */}
        <div className="hidden md:block w-[356px] bg-[#16181B]/90 backdrop-blur-md border border-white/10 rounded-[10px] p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-medium text-[#F3F4F6]">
              Speed &amp; altitude graph
            </span>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1.5 text-[#D1D5DB]">
                <span className="w-2 h-[1.5px] bg-[#7E9BE0]" />
                Speed
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#D1D5DB]">
                <span className="w-2 h-[1.5px] bg-[#E59866]" />
                Altitude
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Left Y-axis (Altitude 12K..0) */}
            <div className="h-[92px] flex flex-col justify-between text-[9.5px] text-[#8E9299] tabular-nums text-right pr-1">
              <span>12K</span>
              <span>8K</span>
              <span>4K</span>
              <span>0</span>
            </div>

            {/* Chart Area */}
            <div className="flex-1 h-[92px] relative">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7E9BE0" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#7E9BE0" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E59866" stopOpacity="0.34" />
                    <stop offset="100%" stopColor="#E59866" stopOpacity="0.03" />
                  </linearGradient>
                </defs>

                {/* Subtle horizontal gridlines */}
                {[0, 0.33, 0.66, 1].map((frac) => (
                  <line
                    key={frac}
                    x1="0"
                    y1={frac * chartH}
                    x2={chartW}
                    y2={frac * chartH}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                ))}

                {speedArea && <path d={speedArea} fill="url(#speedGrad)" />}
                {altArea && <path d={altArea} fill="url(#altGrad)" />}
                {speedLine && (
                  <path d={speedLine} fill="none" stroke="#85A2E6" strokeWidth="1.6" />
                )}
                {altLine && (
                  <path d={altLine} fill="none" stroke="#E59866" strokeWidth="1.6" />
                )}
              </svg>
            </div>

            {/* Right Y-axis (Speed 900 kts..0 kts) */}
            <div className="h-[92px] flex flex-col justify-between text-[9.5px] text-[#8E9299] tabular-nums text-left pl-1">
              <span>900 kts</span>
              <span>600 kts</span>
              <span>300 kts</span>
              <span>0 kts</span>
            </div>
          </div>

          {/* X-axis timestamps */}
          <div className="mt-1.5 pl-6 pr-11 flex items-center justify-between text-[9.5px] text-[#8E9299] tabular-nums">
            {timeLabels.map((lbl, idx) => (
              <span key={`${lbl}-${idx}`} className={lbl === 'Now' ? 'text-[#85A2E6] font-semibold' : ''}>
                {lbl}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom Coordinate & Elevation Strip */}
        <div className="bg-[#16181B]/90 backdrop-blur-md border border-white/10 rounded-[7px] px-2.5 py-1 text-[10px] sm:text-[10.5px] font-mono-tabular text-[#D1D5DB] shadow-xl truncate max-w-full">
          {formatDms(lat, 'N', 'S')}. {formatDms(lng, 'E', 'W')}, {Math.round(altAmsl)} m/AMSL, Improved SRTM. GLONASS
        </div>
      </div>
    </>
  );
};
