"use client";

type RangeModalProps = {
  open: boolean;
  beginValue: string;
  endValue: string;
  onBeginChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
};

export function RangeModal({
  open,
  beginValue,
  endValue,
  onBeginChange,
  onEndChange,
  onClose,
  onApply,
}: RangeModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-cyan-200">Configurar Rango</h3>
        <p className="mt-1 text-xs text-slate-400">Formato: YYYY-MM-DD HH:mm:ss</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Desde</span>
            <input
              className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              value={beginValue}
              onChange={(e) => onBeginChange(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Hasta</span>
            <input
              className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              value={endValue}
              onChange={(e) => onEndChange(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="rounded-md border border-cyan-500/70 bg-cyan-600/20 px-3 py-1.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-600/35"
            onClick={onApply}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
