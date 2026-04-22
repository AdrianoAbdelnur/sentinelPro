"use client";

import type { DeviceSummary } from "@/lib/features/prevention/aggregates";

type FleetSummaryPanelProps = {
  summary: DeviceSummary;
  loading: boolean;
  error: string | null;
  lastRefresh: string;
  showOutliers: boolean;
  onToggleOutliers: (checked: boolean) => void;
  onRefresh: () => void;
};

export function FleetSummaryPanel({
  summary,
  loading,
  error,
  lastRefresh,
  showOutliers,
  onToggleOutliers,
  onRefresh,
}: FleetSummaryPanelProps) {
  return (
    <article className="pointer-events-auto rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-[0.16em] text-cyan-200">Resumen de flota</h1>
        <button
          className="rounded-md border border-cyan-500/60 bg-cyan-600/20 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/35"
          onClick={onRefresh}
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={showOutliers}
          onChange={(e) => onToggleOutliers(e.target.checked)}
        />
        Mostrar outliers lejanos
      </label>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>Total de vehiculos</span>
          <strong className="text-cyan-300">{summary.total}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>En linea</span>
          <strong className="text-emerald-300">{summary.online}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>En movimiento</span>
          <strong className="text-amber-300">{summary.moving}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>Estacionados</span>
          <strong className="text-lime-300">{summary.parking}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>En ralenti</span>
          <strong className="text-sky-300">{summary.idle}</strong>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
          <span>Sin ubicacion</span>
          <strong className="text-fuchsia-300">{summary.notLocated}</strong>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">Ultimo refresco: {lastRefresh}</p>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </article>
  );
}
