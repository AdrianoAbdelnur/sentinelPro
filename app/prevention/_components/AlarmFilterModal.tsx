"use client";

export type AlarmFilterOption = {
  code: number;
  label: string;
};

type AlarmFilterModalProps = {
  open: boolean;
  options: AlarmFilterOption[];
  selectedCodes: Set<number>;
  onToggleCode: (code: number, checked: boolean) => void;
  onClose: () => void;
};

export function AlarmFilterModal({
  open,
  options,
  selectedCodes,
  onToggleCode,
  onClose,
}: AlarmFilterModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-amber-200">Filtro de Alarmas (Socket)</h3>
        <p className="mt-1 text-xs text-slate-400">Solo aplica a Atencion especial en tiempo real.</p>

        <div className="mt-4 max-h-[52vh] space-y-2 overflow-auto pr-1">
          {options.map((option) => (
            <label
              key={option.code}
              className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedCodes.has(option.code)}
                onChange={(e) => onToggleCode(option.code, e.target.checked)}
              />
              <span className="text-slate-200">
                EC {option.code} - {option.label}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
