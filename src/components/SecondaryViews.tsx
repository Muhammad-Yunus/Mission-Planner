import React, { useState } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Search,
  Download,
  Terminal,
  Radio,
  Route,
  Battery,
  Wifi,
} from 'lucide-react';
import type {
  FlightLog,
  IngestApiKeyItem,
  Mission,
  NavTab,
  Vehicle,
} from '../types/mission.ts';

/* -------------------------------------------------------------------------- */
/* OVERVIEW VIEW                                                              */
/* -------------------------------------------------------------------------- */
export const OverviewView: React.FC<{
  vehicles: Vehicle[];
  missions: Mission[];
  selectedVehicleId: number | null;
  onSelectVehicle: (id: number) => void;
  onOpenRoute: (missionId: number) => void;
  socketConnected: boolean;
}> = ({
  vehicles,
  missions,
  selectedVehicleId,
  onSelectVehicle,
  onOpenRoute,
  socketConnected,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-[#141518] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#26282E] pb-4">
          <div>
            <h1 className="text-lg font-semibold text-white">Fleet &amp; Mission Overview</h1>
            <p className="text-xs text-[#8E9299] mt-0.5">
              Real-time vehicle state synchronized from PostgreSQL via Socket.IO
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#D1D5DB]">
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>{socketConnected ? 'WebSocket Connected' : 'Reconnecting...'}</span>
          </div>
        </div>

        {/* Vehicles Grid */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8E9299] mb-3">
            Registered UAV Vehicles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicles.map((v) => {
              const active = v.id === selectedVehicleId;
              return (
                <div
                  key={v.id}
                  onClick={() => onSelectVehicle(v.id)}
                  className={`bg-[#1C1E22] border rounded-xl p-4 cursor-pointer transition-colors ${
                    active
                      ? 'border-[#95ADD8]'
                      : 'border-[#2A2C32] hover:border-[#3D414A]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{v.code}</div>
                      <div className="text-xs text-[#8E9299]">{v.model}</div>
                    </div>
                    <span className="text-xs font-medium text-[#9CB5E6]">{v.status}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-[#282B31] text-xs">
                    <div>
                      <div className="text-[10.5px] text-[#8E9299]">Battery</div>
                      <div className="font-mono-tabular text-white font-medium flex items-center gap-1 mt-0.5">
                        <Battery className="w-3.5 h-3.5 text-[#9CB5E6]" />
                        {v.batteryPercent}% · {v.voltage.toFixed(1)}V
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#8E9299]">Link</div>
                      <div className="font-mono-tabular text-white font-medium flex items-center gap-1 mt-0.5">
                        <Wifi className="w-3.5 h-3.5 text-[#9CB5E6]" />
                        {v.signalPercent}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#8E9299]">Active WP</div>
                      <div className="font-mono-tabular text-white font-medium mt-0.5">
                        WP {v.activeWaypointIndex} · {v.altitudeAmsl.toFixed(0)}m
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Missions List */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8E9299] mb-3">
            Configured Flight Missions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {missions.map((m) => (
              <div
                key={m.id}
                className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl p-4 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{m.routeCode}</div>
                    <div className="text-xs text-[#8E9299]">
                      {m.name} · {m.missionType}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#ECA87E]">{m.status}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs font-mono-tabular text-[#D1D5DB]">
                  <div>
                    <span className="block text-[10px] text-[#8E9299]">Area</span>
                    {m.areaHa.toFixed(1)} ha
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#8E9299]">Altitude</span>
                    {m.flightAltitudeM.toFixed(1)} m
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#8E9299]">Photos</span>
                    {m.photosCount}
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#8E9299]">Waypoints</span>
                    {m.waypointsCount}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenRoute(m.id)}
                  className="h-9 rounded-lg bg-[#353840] hover:bg-[#41454F] text-xs font-medium text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Route className="w-3.5 h-3.5 text-[#9CB5E6]" />
                  Open in Satellite Planner
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* LOGBOOK VIEW                                                               */
/* -------------------------------------------------------------------------- */
export const LogbookView: React.FC<{ logs: FlightLog[] }> = ({ logs }) => {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const eventTypes = ['ALL', 'MISSION_START', 'MISSION_PAUSE', 'WAYPOINT_REACHED', 'CONFIG_SAVED', 'MISSION_RESET'];

  const filtered = logs.filter((log) => {
    const matchesType = filterType === 'ALL' || log.eventType === filterType;
    const matchesSearch =
      !query.trim() ||
      log.message.toLowerCase().includes(query.toLowerCase()) ||
      log.eventType.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleExportCsv = () => {
    const header = 'ID,Timestamp,EventType,VehicleID,Message\n';
    const rows = filtered
      .map(
        (l) =>
          `${l.id},"${new Date(l.createdAt).toISOString()}","${l.eventType}",${l.vehicleId},"${l.message.replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission-planner-logbook-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#141518] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26282E] pb-4">
          <div>
            <h1 className="text-lg font-semibold text-white">Flight Logbook</h1>
            <p className="text-xs text-[#8E9299] mt-0.5">
              Immutable telemetry &amp; mission command events stored in PostgreSQL
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3.5 rounded-lg bg-[#26282E] hover:bg-[#32353D] border border-[#353942] text-xs font-medium text-white inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#9CB5E6]" />
            Export CSV
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search log messages or events..."
              className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#1C1E22] border border-[#2C2F36] text-xs text-white placeholder-[#6B7280] focus:outline-none focus:border-[#95ADD8]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-[#1C1E22] border border-[#2C2F36] rounded-lg p-1">
            {eventTypes.map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => setFilterType(et)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  filterType === et
                    ? 'bg-[#363942] text-white'
                    : 'text-[#8E9299] hover:text-white'
                }`}
              >
                {et === 'ALL' ? 'All Events' : et.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Log Table */}
        <div className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2C32] text-[11px] font-medium text-[#8E9299] bg-[#18191D]">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Event</th>
                  <th className="py-2.5 px-4">Vehicle</th>
                  <th className="py-2.5 px-4">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#25272C] text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-[#8E9299]">
                      No flight log events match the current filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-[#22252A] transition-colors">
                      <td className="py-2.5 px-4 font-mono-tabular text-[#9CA3AF] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-[#9CB5E6] whitespace-nowrap">
                        {log.eventType}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-[#D1D5DB] whitespace-nowrap">
                        #{log.vehicleId}
                      </td>
                      <td className="py-2.5 px-4 text-[#E5E7EB]">{log.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* OPTIONS VIEW (API KEYS + SWAGGER DOCS)                                     */
/* -------------------------------------------------------------------------- */
export const OptionsView: React.FC<{
  apiKeys: IngestApiKeyItem[];
  onCreateKey: (name: string, vehicleCode?: string) => Promise<string>;
  onRevokeKey: (id: number) => Promise<void>;
}> = ({ apiKeys, onCreateKey, onRevokeKey }) => {
  const [name, setName] = useState('');
  const [vehicleCode, setVehicleCode] = useState('Modelo AX3');
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const raw = await onCreateKey(name.trim(), vehicleCode.trim() || undefined);
      setCreatedRawKey(raw);
      setName('');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#141518] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#26282E] pb-4">
          <div>
            <h1 className="text-lg font-semibold text-white">System Options &amp; Ingest API Keys</h1>
            <p className="text-xs text-[#8E9299] mt-0.5">
              Separate X-API-Key credentials for external UAV systems &amp; Swagger documentation
            </p>
          </div>
          <a
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-lg bg-[#95ADD8] hover:bg-[#A6BCE2] text-[#141518] text-xs font-semibold inline-flex items-center gap-2 transition-colors"
          >
            Open Swagger Docs
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Newly Created Key Banner */}
        {createdRawKey && (
          <div className="bg-[#1F252F] border border-[#95ADD8]/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-white">
                New Ingest API Key Created (shown once — copy it now)
              </div>
              <code className="block mt-1 text-xs font-mono-tabular text-[#9CB5E6] break-all">
                {createdRawKey}
              </code>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(createdRawKey)}
              className="h-8 px-3 rounded-lg bg-[#353B46] hover:bg-[#434A57] text-xs text-white inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Key'}
            </button>
          </div>
        )}

        {/* Generate New Key Form */}
        <form
          onSubmit={handleCreate}
          className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] font-medium text-[#8E9299] mb-1.5">
              External System Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PX4 MAVLink Bridge"
              className="w-full h-9 px-3 rounded-lg bg-[#141518] border border-[#2F3239] text-xs text-white placeholder-[#52565E] focus:outline-none focus:border-[#95ADD8]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#8E9299] mb-1.5">
              Vehicle Scope (optional)
            </label>
            <input
              type="text"
              value={vehicleCode}
              onChange={(e) => setVehicleCode(e.target.value)}
              placeholder="Modelo AX3 (or blank for any)"
              className="w-full h-9 px-3 rounded-lg bg-[#141518] border border-[#2F3239] text-xs text-white placeholder-[#52565E] focus:outline-none focus:border-[#95ADD8]"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="h-9 px-4 rounded-lg bg-[#ECA87E] hover:bg-[#F3B58E] text-[#141518] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Generating...' : 'Generate Ingest Key'}
          </button>
        </form>

        {/* Active Keys List */}
        <div className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2A2C32] flex items-center gap-2">
            <Key className="w-4 h-4 text-[#9CB5E6]" />
            <span className="text-xs font-semibold text-white">Issued Ingest API Keys</span>
          </div>
          <div className="divide-y divide-[#25272C]">
            {apiKeys.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8E9299]">
                No database API keys generated yet. Generate one above or use your configured
                <code className="mx-1 text-[#D1D5DB]">INGEST_API_KEY</code> environment variable.
              </div>
            ) : (
              apiKeys.map((k) => (
                <div
                  key={k.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-medium text-white flex items-center gap-2">
                      <span>{k.name}</span>
                      <span className="font-mono-tabular text-[11px] text-[#9CB5E6]">
                        {k.keyPrefix}...
                      </span>
                      {!k.isActive && (
                        <span className="text-[11px] text-rose-400">Revoked</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8E9299] mt-0.5">
                      Scope: {k.vehicleCode || 'All vehicles'} · Last used:{' '}
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                    </div>
                  </div>
                  {k.isActive && (
                    <button
                      type="button"
                      onClick={() => onRevokeKey(k.id)}
                      className="h-8 px-3 rounded-lg bg-[#272930] hover:bg-rose-500/20 text-rose-300 text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* HELP & INTEGRATION GUIDE VIEW                                              */
/* -------------------------------------------------------------------------- */
export const HelpView: React.FC<{ onSelectTab: (tab: NavTab) => void }> = ({ onSelectTab }) => {
  const sampleCurl = `curl -X POST http://localhost:3000/api/v1/ingest/telemetry \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <YOUR_INGEST_API_KEY>" \\
  -d '{
    "vehicleCode": "Modelo AX3",
    "lat": 46.54396,
    "lng": 6.51754,
    "altitudeAmsl": 448.2,
    "altitudeAto": 118.3,
    "groundSpeedMs": 9.4,
    "airSpeedMs": 9.8,
    "windSpeedMs": 0.6,
    "headingDeg": 315,
    "batteryPercent": 84,
    "voltage": 14.2,
    "activeWaypointIndex": 13
  }'`;

  return (
    <div className="flex-1 overflow-y-auto bg-[#141518] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="border-b border-[#26282E] pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-white">
              External Telemetry Ingest &amp; Operator Guide
            </h1>
            <p className="text-xs text-[#8E9299] mt-0.5">
              Zero browser/backend dummy timers — all real-time updates arrive via External Ingest API + Socket.IO
            </p>
          </div>
          <a
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-lg bg-[#ECA87E] hover:bg-[#F3B58E] text-[#141518] text-xs font-semibold inline-flex items-center gap-2 transition-colors"
          >
            Explore Swagger UI
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Terminal className="w-4 h-4 text-[#9CB5E6]" />
            1. Run the External Simulation Script
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Generate an Ingest API key in{' '}
            <button
              type="button"
              onClick={() => onSelectTab('options')}
              className="text-[#9CB5E6] underline cursor-pointer"
            >
              Options
            </button>{' '}
            (or use the <code className="text-[#E5E7EB]">INGEST_API_KEY</code> environment variable),
            then run the standalone simulator script from your terminal to stream live drone flight
            telemetry into <code className="text-[#E5E7EB]">POST /api/v1/ingest/telemetry</code>:
          </p>
          <pre className="p-3.5 rounded-lg bg-[#121316] border border-[#282B31] text-xs font-mono-tabular text-[#D1D5DB] overflow-x-auto">
            npm run simulate -- --key=&lt;YOUR_INGEST_API_KEY&gt;
          </pre>
        </div>

        <div className="bg-[#1C1E22] border border-[#2A2C32] rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Radio className="w-4 h-4 text-[#ECA87E]" />
            2. Integrate External Hardware / MAVLink Bridge
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Send HTTP POST JSON packets (single object or batch array) authenticated with{' '}
            <code className="text-[#E5E7EB]">X-API-Key</code>. Every accepted packet is persisted
            to PostgreSQL and immediately pushed to all connected operators via Socket.IO{' '}
            <code className="text-[#E5E7EB]">telemetry:update</code>.
          </p>
          <pre className="p-3.5 rounded-lg bg-[#121316] border border-[#282B31] text-xs font-mono-tabular text-[#D1D5DB] overflow-x-auto">
            {sampleCurl}
          </pre>
        </div>
      </div>
    </div>
  );
};
