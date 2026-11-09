import { useState } from "react";
import { request } from "../infrastructure/api";
import {
  customerAccepted,
  label,
  type OrderView,
  type OrderPermissions,
} from "../application/orderModel";
import { errorEs } from "../application/locale";
export function OrderWorkflow({
  companyId,
  view,
  permissions,
  disabled,
  onChanged,
}: {
  companyId: string;
  view: OrderView;
  permissions: OrderPermissions;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [evidence, setEvidence] = useState(""),
    [reason, setReason] = useState(""),
    [scenario, setScenario] = useState("SUCCESS"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const d = view.order.data,
    state = String(d.state),
    revision = Number(d.commercialRevision),
    queued = !!d.erpDeliveryId;
  const locked = disabled || busy || !permissions.write;
  const mutable = ["DRAFT", "SUBMITTED", "IN_REVIEW"].includes(state);
  async function act(action: string, extra = {}) {
    setBusy(true);
    setError("");
    try {
      await request(
        "/orders/" + view.order.id + "/" + action,
        companyId,
        "POST",
        { version: view.order.version, ...extra },
      );
      onChanged();
    } catch (e) {
      setError(errorEs((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mt">
      <h3>Aceptación y aprobación · Revisión {revision}</h3>
      <p>
        Cliente:{" "}
        {customerAccepted(view.order)
          ? "Revisión aceptada"
          : "Aceptación pendiente"}
        {d.customerAcceptanceSource === "MOCK"
          ? " · SIMULACIÓN"
          : d.submissionSource === "INBOUND_REFERENCE" &&
              d.submittedRevision === revision
            ? " · Solicitud de origen registrada por el equipo"
            : ""}
        . Equipo interno: {label(state)}.
      </p>
      <p className="fine">
        Los cambios comerciales requieren aceptar la nueva revisión. La IA
        propone; el equipo aprueba. La validación técnica de alérgenos
        corresponde a Calidad.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {d.submissionEvidence ? (
        <p>Solicitud original: {String(d.submissionEvidence)}</p>
      ) : null}
      {d.rejectionReason ? (
        <p>Motivo del rechazo: {String(d.rejectionReason)}</p>
      ) : null}
      {permissions.write && !queued && (
        <>
          {mutable &&
            d.submittedRevision == null &&
            !view.approvals?.length && (
              <div className="mt">
                <label htmlFor="submission-reference">
                  Referencia de la solicitud original del cliente
                </label>
                <input
                  id="submission-reference"
                  value={evidence}
                  maxLength={4000}
                  onChange={(e) => setEvidence(e.target.value)}
                  disabled={locked}
                  placeholder="Correo, documento o referencia verificable"
                />
                <button
                  className="secondary"
                  disabled={locked || !evidence.trim()}
                  onClick={() => act("submit", { evidence })}
                >
                  Registrar solicitud original
                </button>
              </div>
            )}
          <div className="actions mt">
            {state === "SUBMITTED" && (
              <button
                className="secondary"
                disabled={locked}
                onClick={() => act("start-review")}
              >
                Iniciar revisión interna
              </button>
            )}
            {(mutable || state === "APPROVED") && (
              <button
                className="secondary"
                disabled={locked}
                onClick={() => act("request-acceptance")}
              >
                Preparar aceptación del cliente
              </button>
            )}
            {["AWAITING_CLIENT", "APPROVED", "REJECTED"].includes(state) && (
              <button
                className="secondary"
                disabled={locked}
                onClick={() => act("reopen")}
              >
                Reabrir revisión
              </button>
            )}
          </div>
          {state === "AWAITING_CLIENT" && (
            <p>
              Esperando respuesta para esta revisión. La respuesta real llegará
              desde el futuro frontend del cliente; todavía no se envían
              notificaciones.
            </p>
          )}
          {state === "AWAITING_CLIENT" && permissions.mockClient && (
            <details className="mt">
              <summary>
                Simular respuesta del cliente · Solo demostración
              </summary>
              <label htmlFor="mock-evidence">Referencia de la simulación</label>
              <input
                id="mock-evidence"
                value={evidence}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setEvidence(e.target.value)}
              />
              <div className="actions">
                <button
                  className="secondary"
                  disabled={locked || !evidence.trim()}
                  onClick={() =>
                    act("mock-client-decision", {
                      revision,
                      decision: "ACCEPTED",
                      evidence,
                    })
                  }
                >
                  Simular aceptación
                </button>
                <button
                  className="secondary danger"
                  disabled={locked || !evidence.trim()}
                  onClick={() =>
                    act("mock-client-decision", {
                      revision,
                      decision: "REJECTED",
                      evidence,
                    })
                  }
                >
                  Simular rechazo
                </button>
              </div>
            </details>
          )}
          {(mutable || state === "AWAITING_CLIENT") && (
            <details className="mt">
              <summary>Rechazar pedido</summary>
              <label htmlFor="rejection-reason">
                Motivo del rechazo interno
              </label>
              <input
                id="rejection-reason"
                value={reason}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="secondary danger"
                disabled={locked || !reason.trim()}
                onClick={() => act("reject", { reason })}
              >
                Rechazar internamente
              </button>
            </details>
          )}
        </>
      )}
      {!!view.approvals?.length && (
        <details className="mt">
          <summary>Historial de aceptación</summary>
          <ul>
            {view.approvals.map((a) => (
              <li key={a.id}>
                Revisión {String(a.data.revision)} · {label(a.data.state)} ·{" "}
                {label(a.data.source)}
                {a.data.evidence ? " · " + String(a.data.evidence) : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h3 className="mt">Entrega al ERP · {label(d.erpState ?? "NOT_SENT")}</h3>
      <p className="fine">
        La aprobación y la descarga de CSV/JSON no confirman recepción en el
        ERP. No se reserva stock local.{" "}
        {permissions.mockErp
          ? "Conector de demostración: no se envían pedidos a un ERP real."
          : "Conector externo pendiente de configurar."}
      </p>
      {state === "APPROVED" && !queued && permissions.write && (
        <button
          className="secondary"
          disabled={locked}
          onClick={() => act("erp-queue")}
        >
          Preparar envío al ERP
        </button>
      )}
      {view.erpDelivery && (
        <>
          <p>
            Identificador de envío:{" "}
            <code>{String(view.erpDelivery.data.idempotencyKey)}</code>
          </p>
          {d.externalOrderId ? (
            <p>
              Pedido externo: <strong>{String(d.externalOrderId)}</strong>
            </p>
          ) : null}
          {view.erpDelivery.data.lastError ? (
            <p role="status">
              Resultado: {label(view.erpDelivery.data.lastError)}
            </p>
          ) : null}
          {permissions.mockErp && d.erpState !== "ACCEPTED" && (
            <div className="actions">
              <select
                aria-label="Respuesta del ERP simulado"
                disabled={locked}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="SUCCESS">Aceptación</option>
                <option value="REJECT">Rechazo</option>
                <option value="TIMEOUT">Sin respuesta</option>
                <option value="TIMEOUT_AFTER_ACCEPT">
                  Aceptación con respuesta perdida
                </option>
              </select>
              <button
                className="primary"
                disabled={locked}
                onClick={() => act("erp-send", { scenario })}
              >
                {d.erpState === "ERROR" || d.erpState === "SENDING"
                  ? "Reintentar envío simulado"
                  : "Enviar al ERP simulado"}
              </button>
            </div>
          )}
          <details className="mt">
            <summary>
              Intentos de envío ({view.erpAttempts?.length ?? 0})
            </summary>
            <ul>
              {view.erpAttempts?.map((a) => (
                <li key={a.id}>
                  Intento {String(a.data.number)} · {label(a.data.state)} ·{" "}
                  {String(a.data.startedAt)}{" "}
                  {a.data.errorCode ? label(a.data.errorCode) : ""}
                </li>
              ))}
            </ul>
          </details>
          {permissions.write && !view.erpChangeRequests?.length && (
            <details className="mt">
              <summary>Solicitar cancelación al ERP</summary>
              <p>
                Se registrará una solicitud pendiente. La cancelación efectiva
                requiere la respuesta del ERP y su integración futura.
              </p>
              <label htmlFor="erp-cancel-reason">Motivo de cancelación</label>
              <input
                id="erp-cancel-reason"
                disabled={locked}
                value={reason}
                maxLength={4000}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="secondary danger"
                disabled={locked || !reason.trim()}
                onClick={() => act("erp-cancel-request", { reason })}
              >
                Registrar solicitud de cancelación
              </button>
            </details>
          )}
        </>
      )}
      {view.erpChangeRequests?.map((r) => (
        <p key={r.id}>
          Cancelación solicitada · {label(r.data.state)} ·{" "}
          {String(r.data.reason)}
        </p>
      ))}
    </section>
  );
}
