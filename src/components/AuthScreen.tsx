import React, { useState } from 'react';
import { Lock, Mail, User, ArrowRight, FileCode2, ShieldCheck } from 'lucide-react';
import { authApi, setAuthToken } from '../services/api.ts';
import type { UserProfile } from '../types/mission.ts';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile, token: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'register'
          ? await authApi.register({ email, name, password })
          : await authApi.login({ email, password });

      setAuthToken(res.token);
      onAuthenticated(res.user, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#141518] text-[#F3F4F6] flex flex-col justify-between p-6 md:p-10">
      {/* Top Bar */}
      <div className="flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path
              d="M5 14C9.5 14 12.5 11.5 14 5C15.5 11.5 18.5 14 23 14C18.5 14 15.5 16.5 14 23C12.5 16.5 9.5 14 5 14Z"
              stroke="#9CB5E6"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="14" r="2.2" fill="#F3F4F6" />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            Mission Planner
          </span>
        </div>

        <a
          href="/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#222429] hover:bg-[#2C2F36] border border-[#34373D] text-xs font-medium text-[#E5E7EB] transition-colors whitespace-nowrap"
        >
          <FileCode2 className="w-3.5 h-3.5 text-[#9CB5E6]" />
          Swagger API Docs
        </a>
      </div>

      {/* Main Auth Card */}
      <div className="max-w-md w-full mx-auto my-8">
        <div className="bg-[#1C1E22] border border-[#2D3036] rounded-xl p-6 md:p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-white tracking-tight">
              {mode === 'login' ? 'Operator Sign In' : 'Create Operator Account'}
            </h1>
            <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
              Sign in with your PostgreSQL operator account to access live Google Maps satellite
              missions and Socket.IO telemetry streams.
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#141518] border border-[#2A2C32] rounded-lg mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-[#32353C] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              Register Operator
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-[#32353C] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              Sign In
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                  Operator Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Flight Lead"
                    className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141518] border border-[#2F3239] text-sm text-white placeholder-[#52565E] focus:outline-none focus:border-[#9CB5E6]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pilot@missionplanner.io"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141518] border border-[#2F3239] text-sm text-white placeholder-[#52565E] focus:outline-none focus:border-[#9CB5E6]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141518] border border-[#2F3239] text-sm text-white placeholder-[#52565E] focus:outline-none focus:border-[#9CB5E6]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-[#ECA87E] hover:bg-[#F3B58E] disabled:opacity-60 text-[#141518] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {loading
                ? 'Authenticating...'
                : mode === 'login'
                ? 'Sign In to Mission Console'
                : 'Create Account & Launch Console'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#2A2C32] flex items-start gap-2.5 text-[11px] text-[#8E9299]">
            <ShieldCheck className="w-4 h-4 text-[#9CB5E6] shrink-0 mt-0.5" />
            <span>
              User sessions use JWT Bearer auth in memory. External telemetry ingestion uses
              separated <code className="text-[#D1D5DB]">X-API-Key</code> credentials managed in
              Options.
            </span>
          </div>
        </div>
      </div>

      {/* Subtle Footer */}
      <div className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 text-[11px] text-[#6B7280]">
        <span>Mission Planner · Ground Control Station</span>
        <span>PostgreSQL + Drizzle ORM · Socket.IO Real-time Sync</span>
      </div>
    </div>
  );
};
