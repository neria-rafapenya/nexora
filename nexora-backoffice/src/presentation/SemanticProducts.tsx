import { useEffect, useRef, useState } from "react";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
interface Status {
  available: boolean;
  model: string;
  total: number;
  indexed: number;
  pending: number;
  usedToday: number;
  maxDailyRequests: number;
}
export function SemanticProducts({
  companyId,
  familyId,
  temperature,
  canIndex,
  onResults,
  onLoading,
}: {
  companyId: string;
  familyId: string;
  temperature: string;
  canIndex: boolean;
  onResults: (rows: RecordRow[]) => void;
  onLoading: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [q, setQ] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const seq = ++generation.current;
    onResults([]);
    onLoading(false);
    setConfirmed(false);
    setError("");
    setNotice("");
    setBusy(false);
    setStatus(null);
    request<Status>("/product-search/status", companyId)
      .then((s) => {
        if (generation.current === seq) setStatus(s);
      })
      .catch((e) => {
        if (generation.current === seq) setError(e.message);
      });
    return () => {
      generation.current++;
    };
  }, [companyId, familyId, temperature, onResults, onLoading]);
  async function run(index = false) {
    const seq = generation.current;
    setBusy(true);
    onLoading(true);
    setError("");
    setNotice("");
    onResults([]);
    try {
      if (index) {
        const s = await request<Status>(
          "/product-search/index",
          companyId,
          "POST",
          { demoConfirmed: confirmed },
        );
        if (generation.current === seq) {
          setStatus(s);
          setNotice(
            s.pending
              ? "Se ha actualizado parte del índice. Quedan productos pendientes."
              : "Índice actualizado. Ya puedes buscar.",
          );
        }
      } else {
        const result = await request<{
          records: RecordRow[];
          pending: number;
          cached: boolean;
        }>("/product-search", companyId, "POST", {
          q,
          familyId,
          temperature,
          demoConfirmed: confirmed,
        });
        if (generation.current === seq) {
          onResults(result.records);
          setNotice(
            `${result.records.length} resultados por similitud.${result.pending ? " Hay productos pendientes de indexar." : ""}${result.cached ? " Consulta reutilizada sin nueva llamada." : ""}`,
          );
        }
      }
      const freshStatus = await request<Status>(
        "/product-search/status",
        companyId,
      );
      if (generation.current === seq) setStatus(freshStatus);
    } catch (e) {
      if (generation.current === seq) setError((e as Error).message);
    } finally {
      if (generation.current === seq) {
        setBusy(false);
        onLoading(false);
      }
    }
  }
  return (
    <section className="panel" aria-label="Búsqueda semántica de productos">
      <h3>Buscar por significado · POC</h3>
      <p>
        Describe el producto en español o inglés, por ejemplo «pescado
        congelado» o «legumbres para guiso». Se ordenan las referencias por
        similitud; no garantiza compatibilidad con dietas o alérgenos.
      </p>
      {status && (
        <p>
          {status.indexed} / {status.total} productos indexados ·{" "}
          {status.pending} pendientes · Solicitudes de hoy: {status.usedToday} /{" "}
          {status.maxDailyRequests}.
          {!status.available ? " Conexión pendiente de configuración." : ""}
        </p>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || !status?.available}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirmo que la consulta y el catálogo contienen únicamente datos
        ficticios de la POC.
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="actions">
          <input
            aria-label="Descripción del producto"
            maxLength={300}
            value={q}
            disabled={busy}
            onChange={(e) => setQ(e.target.value)}
            placeholder="¿Qué producto buscas?"
          />
          <button
            className="primary"
            disabled={
              busy ||
              !status?.available ||
              !confirmed ||
              q.trim().length < 2 ||
              !status.indexed
            }
          >
            Buscar por significado
          </button>
          {canIndex && (
            <button
              type="button"
              className="secondary"
              disabled={
                busy || !status?.available || !confirmed || !status.pending
              }
              onClick={() => void run(true)}
            >
              {busy ? "Procesando…" : "Actualizar índice"}
            </button>
          )}
        </div>
      </form>
      <p className="fine">
        Solo se buscan productos activos del catálogo ficticio. Se aplican los
        filtros seleccionados. Los cambios de descripción o familia requieren
        actualizar el índice. Cada búsqueda se envía únicamente al pulsar el
        botón.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
