"use client";

import type { AttentionItem } from "@/lib/features/prevention/aggregates";

type SpecialAttentionPanelProps = {
  items: AttentionItem[];
  onOpenEvidence: (item: AttentionItem) => void;
  onOpenFilters: () => void;
};

export function SpecialAttentionPanel({
  items,
  onOpenEvidence,
  onOpenFilters,
}: SpecialAttentionPanelProps) {
  return (
    <article className="pointer-events-auto min-h-0 overflow-auto rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-amber-200">Atencion especial</h2>
        <button
          className="rounded-md border border-amber-500/70 bg-amber-600/20 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-600/35"
          onClick={onOpenFilters}
        >
          Alarmas
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Sin alarmas recientes para mostrar.</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="rounded-lg border border-slate-700 bg-slate-800/80 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.deviceId}</p>
                  <p className="text-xs text-slate-300">
                    EC {item.alarmCode ?? "-"} - {item.alarmType}
                  </p>
                  <p className="text-xs text-slate-400">{item.createdAt}</p>
                </div>
                <button
                  className="rounded-md border border-cyan-500/70 bg-cyan-600/20 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/35"
                  onClick={() => onOpenEvidence(item)}
                >
                  Evidencia
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
