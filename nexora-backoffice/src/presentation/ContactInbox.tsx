import { useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { request } from "../infrastructure/api";
import { useDataRefresh } from "../infrastructure/useDataRefresh";
import { DataTable, useResetTablePage } from "./DataTable";
import { RecordTime } from "./RecordDates";
import { useToasts } from "./Toasts";
export interface ContactLead {
  id: string;
  version: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  data: {
    name: string;
    email: string;
    company: string;
    centerCount?: number;
    phone: string;
    sector: string;
    message: string;
    privacyVersion: string;
    privacyAcknowledged: boolean;
  };
}
const states: Record<string, string> = {
  NEW: "Nueva",
  CONTACTED: "Contactada",
  ARCHIVED: "Archivada",
};
const sectors: Record<string, string> = {
  CATERING: "Catering y restauración colectiva",
  PREPARED_FOOD: "Comida preparada",
  SUPPLIER: "Proveedor o distribuidor",
  CENTER: "Centro o comprador",
  OTHER: "Otro",
};
export function ContactInbox({ companyId }: { companyId: string }) {
  const [records, setRecords] = useState<ContactLead[]>([]),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [state, setState] = useState(""),
    [view, setView] = useState<ContactLead | null>(null),
    [next, setNext] = useState(""),
    [remove, setRemove] = useState<ContactLead | null>(null),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const { notify, toasts } = useToasts();
  const paused = busy || !!view || !!remove;
  const tick = useDataRefresh(companyId, !paused);
  useResetTablePage(JSON.stringify([q, state]));
  useEffect(() => {
    if (paused) return;
    let live = true;
    request<{ records: ContactLead[] }>("/contacts", companyId)
      .then((r) => {
        if (live) {
          setRecords(r.records);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, tick, reload, paused]);
  const rows = records.filter(
    (r) =>
      (!state || r.state === state) &&
      [
        r.data.name,
        r.data.email,
        r.data.company,
        r.data.phone,
        r.data.message,
        sectors[r.data.sector] ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(q.toLocaleLowerCase("es")),
  );
  async function update() {
    if (!view || busy) return;
    setBusy(true);
    try {
      await request("/contacts/" + view.id, companyId, "PUT", {
        version: view.version,
        state: next,
      });
      setView(null);
      setReload((n) => n + 1);
      notify("Estado de la solicitud actualizado.", false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    if (!remove || busy) return;
    setBusy(true);
    try {
      await request("/contacts/" + remove.id, companyId, "DELETE", {
        version: remove.version,
      });
      setRemove(null);
      setReload((n) => n + 1);
      notify("Solicitud eliminada.", false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {toasts}
      <div className="page-heading">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Solicitudes web</h1>
          <p>
            Consultas recibidas desde www.cuinora.com. Su contenido no se envía
            a la IA ni se utiliza para newsletters.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            disabled={paused}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {view && (
        <section
          className="panel profile-panel"
          aria-label="Detalle de solicitud"
        >
          <h2>{view.data.company}</h2>
          <dl className="contact-details">
            <dt>Nombre</dt>
            <dd>{view.data.name}</dd>
            <dt>Correo</dt>
            <dd>
              <a href={"mailto:" + encodeURIComponent(view.data.email)}>
                {view.data.email}
              </a>
            </dd>
            <dt>Número de centros</dt>
            <dd>{view.data.centerCount ?? "—"}</dd>
            <dt>Teléfono</dt>
            <dd>{view.data.phone || "—"}</dd>
            <dt>Tipo de empresa</dt>
            <dd>{sectors[view.data.sector] ?? "—"}</dd>
            <dt>Recibida</dt>
            <dd>
              <RecordTime value={view.createdAt} />
            </dd>
            <dt>Última edición</dt>
            <dd>
              <RecordTime value={view.updatedAt} />
            </dd>
            <dt>Privacidad informada</dt>
            <dd>
              {view.data.privacyAcknowledged ? "Sí" : "No"} · versión{" "}
              {view.data.privacyVersion}
            </dd>
          </dl>
          <h3>Mensaje</h3>
          <p className="contact-message">{view.data.message}</p>
          <form
            aria-label="Estado de solicitud"
            onSubmit={(e) => {
              e.preventDefault();
              void update();
            }}
          >
            <label>
              Estado
              <select
                className="user-role-select"
                value={next}
                disabled={busy}
                onChange={(e) => setNext(e.target.value)}
              >
                {Object.entries(states).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button
                className="primary"
                type="submit"
                disabled={busy || next === view.state}
              >
                Guardar estado
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setView(null)}
              >
                Cerrar detalle
              </button>
            </div>
          </form>
        </section>
      )}
      {remove && (
        <section
          className="panel profile-panel"
          role="alertdialog"
          aria-label="Eliminar solicitud"
        >
          <h2>Eliminar solicitud</h2>
          <p>
            Se eliminarán los datos y el mensaje de «{remove.data.company}».
            Esta acción no se puede deshacer desde el backoffice.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={purge}
            >
              Confirmar eliminación
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <section className="panel profile-panel">
        <div className="contact-filters">
          <label>
            Buscar solicitudes
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, empresa, correo o mensaje…"
            />
          </label>
          <label>
            Filtrar estado
            <select
              className="user-role-select"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {Object.entries(states).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DataTable
          id="contact-leads"
          primary
          filterKey={JSON.stringify([q, state])}
        >
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Recibida</th>
              <th>Última edición</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.data.company}</td>
                <td>{r.data.name}</td>
                <td>{r.data.email}</td>
                <td>{states[r.state] ?? r.state}</td>
                <td data-sort-value={r.createdAt}>
                  <RecordTime value={r.createdAt} />
                </td>
                <td data-sort-value={r.updatedAt}>
                  <RecordTime value={r.updatedAt} />
                </td>
                <td>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={paused}
                      aria-label={"Ver solicitud de " + r.data.company}
                      onClick={() => {
                        setView(r);
                        setNext(r.state);
                      }}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={paused}
                      aria-label={"Eliminar solicitud de " + r.data.company}
                      onClick={() => setRemove(r)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!rows.length && (
          <p>No hay solicitudes que coincidan con los filtros.</p>
        )}
        <p className="fine">
          Conservación del formulario: 180 días desde su envío. Las solicitudes
          se eliminan automáticamente al superar ese plazo.
        </p>
      </section>
    </>
  );
}
