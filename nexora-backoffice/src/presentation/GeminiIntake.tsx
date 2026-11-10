import { useEffect, useState } from "react";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
export interface GeminiStatus {
  provider: string;
  enabled: boolean;
  keyConfigured: boolean;
  freeTierConfirmed: boolean;
  model: string;
  modelAllowed: boolean;
  available: boolean;
  maxDailyRequests: number;
  usedToday: number;
}
export function GeminiIntake({
  companyId,
  messageId,
  version,
  disabled,
  onBusy,
  onOrder,
}: {
  companyId: string;
  messageId: string;
  version: number;
  disabled: boolean;
  onBusy: (v: boolean) => void;
  onOrder: (o: RecordRow) => void;
}) {
  const [status, setStatus] = useState<GeminiStatus | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    request<GeminiStatus>("/orders/ai/status", companyId)
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch(() => {
        if (live)
          setError("La conexión con Gemini todavía no está disponible.");
      });
    return () => {
      live = false;
    };
  }, [companyId]);
  useEffect(() => {
    setConfirmed(false);
    setError("");
  }, [companyId, messageId, version]);
  async function generate() {
    onBusy(true);
    setError("");
    try {
      const result = await request<{ record: RecordRow }>(
        "/order-inbox/" + messageId + "/process-ai",
        companyId,
        "POST",
        { version, demoConfirmed: confirmed },
      );
      onOrder(result.record);
    } catch (e) {
      setError((e as Error).message);
      try {
        setStatus(await request<GeminiStatus>("/orders/ai/status", companyId));
      } catch {
        /* Preserve the original operation error. */
      }
    } finally {
      onBusy(false);
    }
  }
  return (
    <details className="mt">
      <summary>Interpretar el pedido con Gemini · POC</summary>
      <p>
        Gemini propondrá productos y cantidades a partir del texto guardado. La
        revisión de cada línea, la aceptación del cliente y la aprobación
        interna seguirán siendo obligatorias.
      </p>
      {status && (
        <p>
          Modelo: {status.model} · Solicitudes de hoy: {status.usedToday} /{" "}
          {status.maxDailyRequests}.{" "}
          {!status.available
            ? "Conexión pendiente de configuración. La propuesta simulada sigue disponible."
            : ""}
        </p>
      )}
      <p className="fine">
        Se enviarán el texto guardado y las referencias del catálogo ficticio.
        No se cambiará de proveedor ni se reintentará automáticamente si se
        agota la cuota.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled || !status?.available}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirmo que el texto contiene únicamente datos ficticios de la POC.
      </label>
      <button
        className="secondary"
        disabled={
          disabled ||
          !confirmed ||
          !status?.available ||
          status.usedToday >= status.maxDailyRequests
        }
        onClick={generate}
      >
        Generar propuesta con Gemini
      </button>
    </details>
  );
}
