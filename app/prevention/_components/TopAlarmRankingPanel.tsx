"use client";

import type { DeviceRankingItem } from "@/lib/features/prevention/aggregates";

type TopAlarmRankingPanelProps = {
  beginTime: string;
  endTime: string;
  ranking: DeviceRankingItem[];
  onOpenRange: () => void;
};

export function TopAlarmRankingPanel({
  beginTime,
  endTime,
  ranking,
  onOpenRange,
}: TopAlarmRankingPanelProps) {
  return (
    <article className="pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-cyan-200">Ranking de alarmas</h2>
          <p className="mt-1 text-xs text-slate-400">
            {beginTime && endTime ? `${beginTime} -> ${endTime}` : "Rango sin definir"}
          </p>
        </div>
        <button
          className="rounded-md border border-cyan-500/70 bg-cyan-600/20 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/35"
          onClick={onOpenRange}
        >
          Rango
        </button>
      </div>
      <div className="mt-3 min-h-0 space-y-2 overflow-auto">
        {ranking.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos para el rango seleccionado.</p>
        ) : (
          ranking.map((item, index) => (
            <div key={item.deviceId} className="rounded-lg bg-slate-800/80 p-2.5">
              <div className="flex items-center justify-between text-sm">
                <p>
                  <span className="mr-2 text-slate-400">No.{index + 1}</span>
                  <strong>{item.plate}</strong>
                </p>
                <strong className="text-rose-300">{item.alarmCount}</strong>
              </div>
              <p className="mt-1 text-xs text-slate-400">{item.deviceId} - {item.name}</p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
