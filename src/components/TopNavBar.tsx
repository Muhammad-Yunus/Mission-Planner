import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  Route,
  CalendarDays,
  Settings,
  HelpCircle,
  ChevronDown,
  Wifi,
  LogOut,
  Menu,
  X,
  FileCode2,
} from 'lucide-react';
import type { NavTab, UserProfile, Vehicle } from '../types/mission.ts';

interface TopNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  onSelectVehicle: (vehicleId: number) => void;
  user: UserProfile;
  onLogout: () => void;
  socketConnected: boolean;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'routes', label: 'Routes', icon: Route },
  { id: 'logbook', label: 'Logbook', icon: CalendarDays },
  { id: 'options', label: 'Options', icon: Settings },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

function QuadcopterGlyph({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="6.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="17.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="17.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function BatterySegments({ percent }: { percent: number }) {
  const bars = Math.max(0, Math.min(4, Math.round(percent / 25)));
  return (
    <div className="flex items-center gap-1.5" title={`Battery ${percent}%`}>
      <div className="flex items-center">
        <div className="w-[22px] h-[12px] rounded-[2.5px] border border-[#9CA3AF] p-[1.5px] flex items-center gap-[1.5px]">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-full flex-1 rounded-[1px] ${
                idx < bars ? 'bg-[#E5E7EB]' : 'bg-transparent'
              }`}
            />
          ))}
        </div>
        <div className="w-[2px] h-[5px] bg-[#9CA3AF] rounded-r-[1px] ml-[1px]" />
      </div>
      <span className="text-[12px] font-medium text-[#E5E7EB] tabular-nums">{percent}%</span>
    </div>
  );
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  activeTab,
  onSelectTab,
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  user,
  onLogout,
  socketConnected,
}) => {
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const vehicleRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) {
        setVehicleMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const battery = selectedVehicle?.batteryPercent ?? 86;
  const signal = selectedVehicle?.signalPercent ?? 75;

  return (
    <header className="relative z-40 h-[48px] bg-[#1A1B1E] border-b border-[#2A2C31] px-3 md:px-4 flex items-center justify-between gap-4 select-none shrink-0">
      {/* Left Zone: Brand + Navigation */}
      <div className="flex items-center gap-6 lg:gap-9 min-w-0">
        {/* Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('routes')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer group"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 28 28"
            fill="none"
            className="text-[#9CB5E6] group-hover:text-white transition-colors"
            aria-hidden="true"
          >
            <path
              d="M5 14C9.5 14 12.5 11.5 14 5C15.5 11.5 18.5 14 23 14C18.5 14 15.5 16.5 14 23C12.5 16.5 9.5 14 5 14Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[15.5px] font-medium tracking-[-0.01em] text-[#F3F4F6]">
            Mission Planner
          </span>
        </button>

        {/* Desktop Nav Tabs */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-7">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                className={`flex items-center gap-2 text-[12.5px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 ${
                  isActive ? 'text-white' : 'text-[#8E9299] hover:text-[#D1D5DB]'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded-[4px] transition-colors ${
                    isActive ? 'bg-[#E5E7EB] text-[#18191C]' : 'text-[#8E9299]'
                  }`}
                >
                  <Icon className="w-[13px] h-[13px]" />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Zone: Vehicle Dropdown + Battery + Signal + Operator */}
      <div className="flex items-center gap-3 md:gap-5 shrink-0">
        {/* Vehicle Dropdown */}
        <div className="relative" ref={vehicleRef}>
          <button
            type="button"
            onClick={() => setVehicleMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 bg-[#24262B] hover:bg-[#2B2E34] border border-[#32353C] rounded-[7px] px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="w-6 h-6 rounded-[5px] bg-[#1B1D21] border border-[#2F3238] flex items-center justify-center text-[#D1D5DB]">
              <QuadcopterGlyph className="w-3.5 h-3.5" />
            </span>
            <div className="text-left leading-tight mr-1 hidden sm:block">
              <div className="text-[11.5px] font-medium text-[#F3F4F6]">
                {selectedVehicle?.code || 'Modelo AX3'}
              </div>
              <div className="text-[10px] text-[#8E9299] flex items-center gap-1">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    socketConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>{selectedVehicle?.status || 'Connected'}</span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#8E9299]" />
          </button>

          {vehicleMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-56 bg-[#1F2126] border border-[#32353C] rounded-lg shadow-2xl py-1 z-50">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Connected Vehicles
              </div>
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onSelectVehicle(v.id);
                    setVehicleMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#2A2D34] transition-colors cursor-pointer ${
                    selectedVehicle?.id === v.id ? 'bg-[#282B31]' : ''
                  }`}
                >
                  <div>
                    <div className="text-xs font-medium text-white">{v.code}</div>
                    <div className="text-[10.5px] text-[#8E9299]">{v.model}</div>
                  </div>
                  <span className="text-[11px] font-mono-tabular text-[#9CB5E6]">
                    {v.batteryPercent}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Battery */}
        <div className="hidden sm:flex items-center">
          <BatterySegments percent={battery} />
        </div>

        {/* Signal */}
        <div className="hidden sm:flex items-center gap-1.5" title={`Telemetry link ${signal}%`}>
          <Wifi className="w-3.5 h-3.5 text-[#E5E7EB]" />
          <span className="text-[12px] font-medium text-[#E5E7EB] tabular-nums">{signal}%</span>
        </div>

        {/* Account Menu */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            title={user.email}
            className="w-7 h-7 rounded-md bg-[#2A2C32] hover:bg-[#353840] border border-[#3B3E46] flex items-center justify-center text-[11px] font-semibold text-[#E5E7EB] cursor-pointer"
          >
            {user.name.slice(0, 2).toUpperCase()}
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 bg-[#1F2126] border border-[#32353C] rounded-lg shadow-2xl py-1.5 z-50">
              <div className="px-3 py-1.5 border-b border-[#2D3036]">
                <div className="text-xs font-medium text-white truncate">{user.name}</div>
                <div className="text-[11px] text-[#8E9299] truncate">{user.email}</div>
              </div>
              <a
                href="/api-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 flex items-center gap-2 text-xs text-[#D1D5DB] hover:bg-[#2A2D34] transition-colors"
              >
                <FileCode2 className="w-3.5 h-3.5 text-[#9CB5E6]" />
                Swagger API Docs
              </a>
              <button
                type="button"
                onClick={onLogout}
                className="w-full px-3 py-2 flex items-center gap-2 text-xs text-rose-300 hover:bg-[#2A2D34] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="md:hidden p-1.5 rounded-md bg-[#24262B] border border-[#32353C] text-[#D1D5DB]"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="absolute top-[48px] left-0 right-0 bg-[#1A1B1E] border-b border-[#2E3036] p-3 flex flex-col gap-1 md:hidden z-50 shadow-2xl">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectTab(id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#2C2F36] text-white'
                    : 'text-[#9CA3AF] hover:bg-[#23252A] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
          <div className="mt-2 pt-2 border-t border-[#2A2C31] flex items-center justify-between px-3 text-xs text-[#D1D5DB]">
            <BatterySegments percent={battery} />
            <span className="flex items-center gap-1.5 tabular-nums">
              <Wifi className="w-3.5 h-3.5" /> {signal}%
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
