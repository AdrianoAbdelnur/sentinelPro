"use client";

import { useState } from "react";
import type { AttentionItem, JsonValue } from "@/lib/features/prevention/aggregates";

type EvidenceModalProps = {
  open: boolean;
  item: AttentionItem | null;
  recording: JsonValue | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

function valueOrDash(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function mediaKindFromRecording(recording: JsonValue | null): "video" | "image" {
  const fileType = String(recording?.fileType ?? "").trim();
  if (fileType === "4") return "image";

  const url = String(recording?.downUrl ?? recording?.url ?? "").trim().toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(url)) {
    return "image";
  }
  return "video";
}

export function EvidenceModal({
  open,
  item,
  recording,
  loading,
  error,
  onClose,
}: EvidenceModalProps) {
  const [jsonOpen, setJsonOpen] = useState(false);

  if (!open || !item) return null;

  const videoUrl = String(recording?.downUrl ?? recording?.url ?? "").trim();
  const mediaKind = mediaKindFromRecording(recording);
  const recordingStart = valueOrDash(recording?.start);
  const recordingStop = valueOrDash(recording?.stop);
  const fullEvidenceJson = JSON.stringify(
    {
      item,
      rawAlarm: item.raw ?? null,
      recording: recording ?? null,
    },
    null,
    2,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <h3 className="text-lg font-semibold">Evidencia</h3>
          <button
            className="rounded-md border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>

        <div className="grid gap-0 lg:grid-cols-[1.3fr_1fr]">
          <section className="border-b border-slate-700 p-4 lg:border-b-0 lg:border-r">
            {loading ? (
              <div className="flex h-[340px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-sm text-slate-300">
                Buscando evidencia...
              </div>
            ) : videoUrl && mediaKind === "video" ? (
              <video
                className="h-[340px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                src={videoUrl}
                controls
                preload="metadata"
              />
            ) : videoUrl && mediaKind === "image" ? (
              <img
                className="h-[340px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                src={videoUrl}
                alt="Evidencia"
              />
            ) : (
              <div className="flex h-[340px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-sm text-slate-300">
                No se encontro URL de evidencia para este evento.
              </div>
            )}

            {error ? (
              <p className="mt-3 rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}
          </section>

          <section className="space-y-3 p-4 text-sm">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Vehiculo</p>
              <p className="mt-2 font-semibold">{item.deviceId}</p>
              <p className="text-slate-300">{item.plate} - {item.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-400">Alarma</p>
                <p className="mt-1 font-medium">{item.alarmType}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-400">Canal</p>
                <p className="mt-1 font-medium">CH {item.channel}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-400">Hora</p>
                <p className="mt-1 font-medium">{item.createdAt}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-400">Velocidad</p>
                <p className="mt-1 font-medium">{item.speed} km/h</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-400">Ubicacion</p>
              <p className="mt-1 font-medium">
                {item.latitude ?? "-"}, {item.longitude ?? "-"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-400">Ventana de grabacion</p>
              <p className="mt-1">Inicio: {recordingStart}</p>
              <p>Fin: {recordingStop}</p>
            </div>

            <button
              className="w-full rounded-md border border-cyan-500/70 bg-cyan-600/20 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-600/35"
              onClick={() => setJsonOpen(true)}
            >
              Ver evidencia completa (JSON)
            </button>
          </section>
        </div>

        {jsonOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6"
            onClick={() => setJsonOpen(false)}
          >
            <div
              className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <h4 className="text-sm font-semibold text-slate-100">JSON completo de alarma y evidencia</h4>
                <button
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={() => setJsonOpen(false)}
                >
                  Cerrar
                </button>
              </header>
              <pre className="max-h-[70vh] overflow-auto p-4 text-xs text-slate-200">
                {fullEvidenceJson}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
