import { useEffect, useState, type FormEvent } from "react";
import { request } from "../infrastructure/api";
import { useDataRefresh } from "../infrastructure/useDataRefresh";
import { useToasts } from "./Toasts";
import { DataTable, useResetTablePage } from "./DataTable";
import { RecordTime } from "./RecordDates";
import { enumEs } from "../application/locale";
interface ConfigData {
  state: "DRAFT" | "READY";
  name: string;
  instructions: string;
  fallback: string;
  sourceIds: string[];
  maxDailyRequests: number;
  maxContextRecords: number;
}
interface KnowledgeData {
  title: string;
  content: string;
  state: "DRAFT" | "PUBLISHED";
}
interface Row<T> {
  id: string;
  data: T;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface AssistantOverview {
  config: Row<ConfigData>;
  knowledge: Row<KnowledgeData>[];
  sources: { id: string; label: string; description: string; status: string }[];
  policy: {
    readOnly: boolean;
    enforceUserPermissions: boolean;
    enforceCustomerScope: boolean;
    requireSources: boolean;
    allergenQualityWorkflow: boolean;
  };
  provider: {
    provider: string;
    available: boolean;
    keyConfigured: boolean;
    model: string;
  };
  runtime: { available: boolean; reason: string };
  activity: { id: string; action: string; resource: string; at: string }[];
}
export function AssistantManagement({ companyId }: { companyId: string }) {
  const [view, setView] = useState<AssistantOverview | null>(null);
  const [config, setConfig] = useState<Row<ConfigData> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState<Row<KnowledgeData> | null>(null);
  const [remove, setRemove] = useState<Row<KnowledgeData> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const { notify, toasts } = useToasts();
  useResetTablePage(search);
  const refresh = useDataRefresh(
    companyId,
    !dirty && !editor && !remove && !busy,
  );
  useEffect(() => {
    if (dirty || editor || remove || busy) return;
    let live = true;
    request<AssistantOverview>("/assistant", companyId)
      .then((v) => {
        if (live) {
          setView(v);
          setConfig(v.config);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, refresh, reload, dirty, !!editor, !!remove, busy]);
  function change<K extends keyof ConfigData>(key: K, value: ConfigData[K]) {
    setConfig((c) => (c ? { ...c, data: { ...c.data, [key]: value } } : c));
    setDirty(true);
  }
  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    if (!config || busy) return;
    setBusy(true);
    try {
      const saved = await request<Row<ConfigData>>(
        "/assistant/config",
        companyId,
        "PUT",
        { data: config.data, version: config.version },
      );
      setConfig(saved);
      setDirty(false);
      setReload((v) => v + 1);
      notify("Configuración del asistente guardada.", false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function saveKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    try {
      await request(
        "/assistant/knowledge" + (editor.id ? "/" + editor.id : ""),
        companyId,
        editor.id ? "PUT" : "POST",
        { data: editor.data, version: editor.version },
      );
      setEditor(null);
      setReload((v) => v + 1);
      notify("Contenido guardado.", false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function deleteKnowledge() {
    if (!remove || busy) return;
    setBusy(true);
    try {
      await request("/assistant/knowledge/" + remove.id, companyId, "DELETE", {
        version: remove.version,
      });
      setRemove(null);
      setReload((v) => v + 1);
      notify("Contenido eliminado.", false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const rows =
    view?.knowledge.filter((r) =>
      (r.data.title + " " + r.data.content)
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
    ) ?? [];
  return (
    <>
      {toasts}
      <div className="page-heading">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Asistente IA</h1>
          <p>
            Gestiona el futuro asistente del frontend del cliente para la
            empresa activa.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy || dirty || !!editor || !!remove}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {!view || !config ? (
        <p>Cargando configuración…</p>
      ) : (
        <>
          <section
            className="panel assistant-section"
            aria-label="Estado del asistente"
          >
            <h2>Estado de la integración</h2>
            <p>
              <strong>
                Chat pendiente de conectar al frontend del cliente.
              </strong>{" "}
              {view.runtime.reason}
            </p>
            <p>
              Proveedor de la POC: <strong>Gemini</strong> ·{" "}
              {view.provider.keyConfigured
                ? "Clave configurada en el servidor"
                : "Clave pendiente en el servidor"}{" "}
              ·{" "}
              {view.provider.available
                ? "Disponible para las funciones actuales de IA"
                : "Revisa la configuración del proveedor en el servidor"}
              .
            </p>
            <p className="fine">
              Esta pantalla no hace llamadas a Gemini, no crea conversaciones y
              no modifica la configuración de IA de pedidos ni de búsqueda
              semántica. AWS queda para la futura infraestructura.
            </p>
          </section>
          <form
            className="panel assistant-section"
            aria-label="Configuración del asistente"
            onSubmit={saveConfig}
          >
            <h2>Configuración</h2>
            <fieldset disabled={busy || !!editor || !!remove}>
              <div className="form-grid">
                <label>
                  Nombre del asistente
                  <input
                    required
                    maxLength={80}
                    value={config.data.name}
                    onChange={(e) => change("name", e.target.value)}
                  />
                </label>
                <label>
                  Estado de la configuración
                  <select
                    value={config.data.state}
                    onChange={(e) =>
                      change("state", e.target.value as ConfigData["state"])
                    }
                  >
                    <option value="DRAFT">Borrador</option>
                    <option value="READY">Preparada para integrar</option>
                  </select>
                </label>
                <label>
                  Consultas máximas por empresa y día
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={config.data.maxDailyRequests}
                    onChange={(e) =>
                      change("maxDailyRequests", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Máximo de registros de contexto por consulta
                  <input
                    type="number"
                    required
                    min={1}
                    max={50}
                    value={config.data.maxContextRecords}
                    onChange={(e) =>
                      change("maxContextRecords", Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <p className="fine">
                Estos límites se guardan para el futuro asistente; todavía no
                hay consumo ni cuotas de chat en funcionamiento.
              </p>
              <label>
                Instrucciones de estilo y atención
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={config.data.instructions}
                  onChange={(e) => change("instructions", e.target.value)}
                />
              </label>
              <label>
                Respuesta cuando falta información
                <textarea
                  required
                  rows={3}
                  maxLength={500}
                  value={config.data.fallback}
                  onChange={(e) => change("fallback", e.target.value)}
                />
              </label>
              <p className="fine">
                No incluyas claves ni datos sensibles. Las instrucciones no
                pueden ampliar permisos ni sustituir datos verificados.
              </p>
              <h3>Fuentes previstas</h3>
              {view.sources.map((s) => (
                <label key={s.id} className="assistant-source">
                  <input
                    type="checkbox"
                    checked={config.data.sourceIds.includes(s.id)}
                    onChange={(e) =>
                      change(
                        "sourceIds",
                        e.target.checked
                          ? [...config.data.sourceIds, s.id]
                          : config.data.sourceIds.filter((id) => id !== s.id),
                      )
                    }
                  />
                  <span>
                    <strong>{s.label}</strong>
                    <br />
                    {s.description}
                    <br />
                    <small>
                      {s.status === "SEMANTIC_PRODUCTS"
                        ? "Base semántica de productos disponible; conexión al chat pendiente"
                        : s.status === "CURATED"
                          ? "Administración disponible; conexión al chat pendiente"
                          : "Recuperación para el chat pendiente"}
                    </small>
                  </span>
                </label>
              ))}
              <div className="actions">
                <button type="submit" className="primary" disabled={!dirty}>
                  Guardar configuración
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!dirty}
                  onClick={() => {
                    setDirty(false);
                    setConfig(view.config);
                    setReload((n) => n + 1);
                  }}
                >
                  Descartar cambios
                </button>
              </div>
            </fieldset>
            {config.createdAt && (
              <p className="fine">
                Creación: <RecordTime value={config.createdAt} /> · Última
                edición: <RecordTime value={config.updatedAt!} />
              </p>
            )}
          </form>
          <section
            className="panel assistant-section"
            aria-label="Permisos del asistente"
          >
            <h2>Permisos y reglas obligatorias</h2>
            <ul>
              <li>
                Solo consultas: no crea ni modifica registros, pedidos o
                aprobaciones.
              </li>
              <li>
                Cada respuesta deberá respetar la empresa, el cliente, el centro
                y los permisos del usuario conectado.
              </li>
              <li>
                Las cifras y los estados se consultarán en la base de datos. Las
                respuestas deberán identificar sus fuentes.
              </li>
              <li>
                Los contenidos de ayuda no sustituyen la validación de alérgenos
                ni las aprobaciones de Calidad.
              </li>
              <li>
                Credenciales, sesiones y secretos quedan fuera de las fuentes.
              </li>
            </ul>
            <p className="fine">
              Solo Administración gestiona esta sección. Los permisos del
              usuario final se conectarán con su autenticación en el futuro
              frontend; seleccionar una fuente aquí no concede acceso a sus
              registros.
            </p>
          </section>
          <section
            className="panel assistant-section"
            aria-label="Contenidos de ayuda"
          >
            <h2>Contenidos de ayuda</h2>
            <p>
              Preguntas frecuentes y pautas operativas revisadas. «Publicado»
              identifica contenido aprobado para la futura integración; aún no
              se envía al modelo.
            </p>
            <div className="actions">
              <input
                aria-label="Buscar contenidos de ayuda"
                placeholder="Buscar en todos los contenidos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={busy || !!editor || !!remove || dirty}
                onClick={() =>
                  setEditor({
                    id: "",
                    data: { title: "", content: "", state: "DRAFT" },
                    version: 0,
                    createdAt: null,
                    updatedAt: null,
                  })
                }
              >
                Añadir contenido
              </button>
            </div>
            {!rows.length ? (
              <p>No hay contenidos que mostrar.</p>
            ) : (
              <DataTable id="assistant-knowledge" primary filterKey={search}>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Creación</th>
                    <th>Última edición</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.data.title}</td>
                      <td>
                        {r.data.state === "PUBLISHED"
                          ? "Publicado"
                          : "Borrador"}
                      </td>
                      <td data-sort-value={r.createdAt}>
                        <RecordTime value={r.createdAt!} />
                      </td>
                      <td data-sort-value={r.updatedAt}>
                        <RecordTime value={r.updatedAt!} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy || dirty || !!editor || !!remove}
                            onClick={() => setEditor(structuredClone(r))}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy || dirty || !!editor || !!remove}
                            onClick={() => setRemove(r)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
          {editor && (
            <form
              className="panel assistant-section"
              aria-label="Editar contenido de ayuda"
              onSubmit={saveKnowledge}
            >
              <h2>{editor.id ? "Editar contenido" : "Nuevo contenido"}</h2>
              <fieldset disabled={busy}>
                <label>
                  Título
                  <input
                    required
                    maxLength={160}
                    value={editor.data.title}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, title: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Contenido
                  <textarea
                    required
                    rows={8}
                    maxLength={8000}
                    value={editor.data.content}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, content: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Estado del contenido
                  <select
                    value={editor.data.state}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: {
                          ...editor.data,
                          state: e.target.value as KnowledgeData["state"],
                        },
                      })
                    }
                  >
                    <option value="DRAFT">Borrador</option>
                    <option value="PUBLISHED">Publicado</option>
                  </select>
                </label>
                <div className="actions">
                  <button className="primary" type="submit">
                    Guardar contenido
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setEditor(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </fieldset>
              {editor.createdAt && (
                <p className="fine">
                  Creación: <RecordTime value={editor.createdAt} /> · Última
                  edición: <RecordTime value={editor.updatedAt!} />
                </p>
              )}
            </form>
          )}
          {remove && (
            <section
              role="alertdialog"
              aria-label="Confirmar eliminación"
              className="panel assistant-section"
            >
              <p>¿Eliminar «{remove.data.title}»?</p>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={deleteKnowledge}
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
          <section className="panel assistant-section">
            <h2>Historial de gestión</h2>
            <p>
              Últimos 200 cambios de configuración y contenidos de esta empresa.
              El seguimiento de conversaciones y consumo se incorporará al
              conectar el frontend.
            </p>
            {!view.activity.length ? (
              <p>Todavía no hay cambios registrados.</p>
            ) : (
              <DataTable id="assistant-activity">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Elemento</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {view.activity.map((r) => (
                    <tr key={r.id}>
                      <td>{enumEs(r.action)}</td>
                      <td>
                        {r.resource === "assistantConfig"
                          ? "Configuración"
                          : "Contenido de ayuda"}
                      </td>
                      <td data-sort-value={r.at}>
                        <RecordTime value={r.at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
        </>
      )}
    </>
  );
}
