import React from 'react';
import {
  PenTool,
  Grid,
  Undo2,
  Trash2,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import type { DrawMode } from '../types/mission.ts';

interface DrawPathPlannerBarProps {
  drawMode: DrawMode;
  onChangeMode: (mode: 'custom' | 'survey') => void;
  pointCount: number;
  previewWaypointsCount: number;
  previewDistanceM: number;
  previewTime: string;
  previewAreaHa: number;
  canUndo: boolean;
  canClear: boolean;
  canApply: boolean;
  saving: boolean;
  isLocked: boolean;
  onUndo: () => void;
  onClear: () => void;
  onRestorePreset: () => void;
  onCancel: () => void;
  onApply: () => void;
}

export const DrawPathPlannerBar: React.FC<DrawPathPlannerBarProps> = ({
  drawMode,
  onChangeMode,
  pointCount,
  previewWaypointsCount,
  previewDistanceM,
  previewTime,
  previewAreaHa,
  canUndo,
  canClear,
  canApply,
  saving,
  isLocked,
  onUndo,
  onClear,
  onRestorePreset,
  onCancel,
  onApply,
}) => {
  if (drawMode === 'off') return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-24px)] max-w-[780px] bg-[#16181B]/92 backdrop-blur-md border border-white/15 rounded-[10px] px-3 py-2 shadow-2xl pointer-events-auto">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#1D1F24] border border-[#2D3038] rounded-[6px] p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onChangeMode('custom')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              drawMode === 'custom'
                ? 'bg-[#95ADD8] text-[#141619]'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            <PenTool className="w-3 h-3" />
            Custom Waypoints
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('survey')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              drawMode === 'survey'
                ? 'bg-[#ECA87E] text-[#141619]'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Grid className="w-3 h-3" />
            Survey Area
          </button>
        </div>

        {/* Live Telemetry Preview */}
        <div className="flex items-center gap-2 text-[11px] text-[#D1D5DB] tabular-nums min-w-0">
          {drawMode === 'custom' ? (
            <span className="truncate">
              Click map to add WPs · Drag nodes to move · Double-click node to remove
            </span>
          ) : (
            <span className="truncate">
              {pointCount < 3
                ? `Click ${3 - pointCount} more corner${3 - pointCount === 1 ? '' : 's'} on map to generate grid`
                : `${pointCount} corners · ${previewAreaHa.toFixed(1)} ha`}
            </span>
          )}
          <span className="text-[#6B7280]" aria-hidden="true">·</span>
          <span className="font-medium text-white whitespace-nowrap">
            {previewWaypointsCount} WPs · {previewDistanceM} m · {previewTime}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last point"
            className="h-[26px] px-2 rounded-[5px] bg-[#26282D] hover:bg-[#32353C] disabled:opacity-40 border border-[#343740] text-[11px] text-[#E5E7EB] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            title="Clear all drawn points"
            className="h-[26px] px-2 rounded-[5px] bg-[#26282D] hover:bg-[#32353C] disabled:opacity-40 border border-[#343740] text-[11px] text-[#E5E7EB] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>

          <button
            type="button"
            onClick={onRestorePreset}
            title="Load Route 17 default template"
            className="h-[26px] px-2 rounded-[5px] bg-[#26282D] hover:bg-[#32353C] border border-[#343740] text-[11px] text-[#D1D5DB] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            Preset 17
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="h-[26px] px-2.5 rounded-[5px] bg-[#2D3037] hover:bg-[#393D46] text-[11px] font-medium text-[#D1D5DB] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>

          <button
            type="button"
            disabled={!canApply || saving || isLocked}
            onClick={onApply}
            title={isLocked ? 'Unlock mission before saving path' : 'Save drawn path to PostgreSQL'}
            className="h-[26px] px-3 rounded-[5px] bg-[#ECA87E] hover:bg-[#F3B58E] disabled:opacity-45 text-[11px] font-semibold text-[#141518] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Check className="w-3 h-3" />
            {saving ? 'Saving...' : 'Apply Path'}
          </button>
        </div>
      </div>
    </div>
  );
};
