import { GeminiIntake } from "./GeminiIntake";
import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Download,
  RefreshCw,
  Trash2,
  FileText,
  Inbox,
  CheckCircle2,
} from "lucide-react";
import { OrderWorkflow } from "./OrderWorkflow";
import {
  customerAccepted,
  type OrderPermissions,
} from "../application/orderModel";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import { enumEs, errorEs } from "../application/locale";
import {
  label,
  amount,
  rowName,
  orderPath,
  reviewDraft,
  reviewPayload,
  downloadOrder,
  type OrderContext,
  type OrderView,
  type ReviewDraft,
} from "../application/orderModel";
const sections = [
  ["list", "/orders", "Todos los pedidos"],
  ["inbox", "/orders/inbox", "Bandeja de entrada"],
  ["review", "/orders/review", "En revisión"],
  ["alerts", "/orders/alerts", "Alertas"],
  ["baskets", "/orders/baskets", "Cestas habituales"],
];
export function Orders({
  companyId,
  section = "list",
  recordId,
  isNew,
  permissions,
}: {
  companyId: string;
  section?: string;
  recordId?: string;
  isNew: boolean;
  permissions: OrderPermissions;
}) {
  const [context, setContext] = useState<OrderContext | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (!permissions.read) return;
    let live = true;
    request<OrderContext>("/orders/catalog", companyId)
      .then((c) => {
        if (live) setContext(c);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, permissions.read, reload]);
  if (!permissions.read)
    return (
      <section className="panel empty">
        <h1>Acceso restringido</h1>
        <p>No tienes permisos para consultar pedidos.</p>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIONES · F2</span>
          <h1>Pedidos multicanal</h1>
          <p>Recibe, revisa y aprueba pedidos para su envío al ERP.</p>
        </div>
        <span className="pill">POC · DATOS DE DEMOSTRACIÓN</span>
      </div>
      <nav className="order-tabs" aria-label="Secciones de pedidos">
        {sections.map(([id, path, name]) => (
          <Link
            key={id}
            className={section === id ? "active" : ""}
            to={orderPath(path, companyId)}
          >
            {name}
          </Link>
        ))}
      </nav>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button
            className="secondary"
            onClick={() => {
              setError("");
              setReload((x) => x + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {!context ? (
        <p role="status">Cargando catálogo y clientes…</p>
      ) : isNew && !permissions.write ? (
        <section className="panel empty">
          <h2>Acceso restringido</h2>
          <p>No tienes permisos para crear pedidos o entradas.</p>
        </section>
      ) : (
        <div key={section + ":" + recordId + ":" + isNew}>
          {section === "inbox" ? (
            isNew ? (
              <NewMessage companyId={companyId} context={context} />
            ) : recordId ? (
              <MessageDetail
                companyId={companyId}
                id={recordId}
                writable={permissions.write}
              />
            ) : (
              <MessageList companyId={companyId} writable={permissions.write} />
            )
          ) : section === "alerts" ? (
            <Alerts
              companyId={companyId}
              context={context}
              writable={permissions.write}
            />
          ) : section === "baskets" ? (
            <Baskets
              companyId={companyId}
              context={context}
              writable={permissions.write}
            />
          ) : isNew ? (
            <NewOrder companyId={companyId} context={context} />
          ) : recordId ? (
            <OrderDetail
              permissions={permissions}
              companyId={companyId}
              id={recordId}
              context={context}
              writable={permissions.write}
            />
          ) : (
            <OrderList
              companyId={companyId}
              context={context}
              writable={permissions.write}
              reviewOnly={section === "review"}
            />
          )}
        </div>
      )}
    </>
  );
}
function Status({ value }: { value: unknown }) {
  return (
    <span className={"pill order-state state-" + String(value).toLowerCase()}>
      {label(value)}
    </span>
  );
}
function Problem({ error }: { error: string }) {
  return error ? (
    <div className="alert" role="alert">
      {error}
    </div>
  ) : null;
}
function OrderList({
  companyId,
  context,
  writable,
  reviewOnly,
}: {
  companyId: string;
  context: OrderContext;
  writable: boolean;
  reviewOnly: boolean;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    request<{ records: RecordRow[] }>("/orders", companyId)
      .then((d) => {
        if (live) setRows(d.records);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [companyId, reload]);
  const filtered = rows
    .filter(
      (r) =>
        (!reviewOnly ||
          ["DRAFT", "SUBMITTED", "IN_REVIEW", "AWAITING_CLIENT"].includes(
            String(r.data.state),
          )) &&
        (!state || r.data.state === state) &&
        (!search ||
          [r.data.number, rowName(context.clients, r.data.clientId)]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      String(b.data.createdAt).localeCompare(String(a.data.createdAt)),
    );
  return (
    <>
      <div className="section-heading">
        <h2>
          {reviewOnly ? "Pendientes de revisión" : "Todos los pedidos"} ·{" "}
          {filtered.length}
        </h2>
        {writable && (
          <Link className="primary" to={orderPath("/orders/new", companyId)}>
            <Plus size={16} />
            Nuevo pedido manual
          </Link>
        )}
      </div>
      <Problem error={error} />
      <section className="panel list-panel">
        <div className="list-toolbar">
          <input
            className="order-search"
            aria-label="Buscar pedidos"
            placeholder="Buscar por número o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Estado del pedido"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {[
              "DRAFT",
              "SUBMITTED",
              "IN_REVIEW",
              "AWAITING_CLIENT",
              "APPROVED",
              "REJECTED",
              "CANCELLED",
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="Actualizar pedidos"
            onClick={() => {
              setLoading(true);
              setReload((x) => x + 1);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {loading ? (
          <p className="empty-copy">Cargando pedidos…</p>
        ) : !filtered.length ? (
          <Empty text="No hay pedidos en esta vista. Crea uno manual o procesa un mensaje de la bandeja." />
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente / centro</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        className="record-link"
                        to={orderPath("/orders/" + r.id, companyId)}
                      >
                        {String(r.data.number)}
                      </Link>
                    </td>
                    <td>
                      {rowName(context.clients, r.data.clientId)}
                      <small className="block">
                        {rowName(context.centers, r.data.centerId)}
                      </small>
                    </td>
                    <td>{String(r.data.deliveryDate ?? "Pendiente")}</td>
                    <td>
                      <Status value={r.data.state} />
                      <small className="block">
                        ERP: {label(r.data.erpState ?? "NOT_SENT")}
                      </small>
                    </td>
                    <td>{label(r.data.origin)}</td>
                    <td>{amount(r.data.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-copy">
      <Inbox size={30} />
      <p>{text}</p>
    </div>
  );
}
function CustomerFields({
  context,
  clientId,
  centerId,
  date,
  onChange,
  disabled = false,
}: {
  context: OrderContext;
  clientId: string;
  centerId: string;
  date: string;
  onChange: (value: {
    clientId: string;
    centerId: string;
    deliveryDate: string;
  }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="row g-3">
      <div className="col-12 col-md-4">
        <label htmlFor="order-client">Cliente</label>
        <select
          id="order-client"
          disabled={disabled}
          value={clientId}
          onChange={(e) =>
            onChange({
              clientId: e.target.value,
              centerId: "",
              deliveryDate: date,
            })
          }
        >
          <option value="">Seleccionar…</option>
          {context.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.data.name)}
              {!c.data.active ? " · Inactivo" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="col-12 col-md-4">
        <label htmlFor="order-center">Centro</label>
        <select
          id="order-center"
          disabled={disabled}
          value={centerId}
          onChange={(e) =>
            onChange({ clientId, centerId: e.target.value, deliveryDate: date })
          }
        >
          <option value="">Seleccionar…</option>
          {context.centers
            .filter((c) => c.data.clientId === clientId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.data.name)}
              </option>
            ))}
        </select>
      </div>
      <div className="col-12 col-md-4">
        <label htmlFor="order-date">Fecha de entrega</label>
        <input
          id="order-date"
          type="date"
          disabled={disabled}
          value={date}
          onChange={(e) =>
            onChange({ clientId, centerId, deliveryDate: e.target.value })
          }
        />
      </div>
    </div>
  );
}
function NewOrder({
  companyId,
  context,
}: {
  companyId: string;
  context: OrderContext;
}) {
  const nav = useNavigate(),
    [form, setForm] = useState({
      clientId: "",
      centerId: "",
      deliveryDate: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Back companyId={companyId} />
      <section className="panel master-form">
        <h2>Nuevo pedido manual</h2>
        <p>
          Se creará un borrador. Después podrás añadir y revisar sus líneas.
        </p>
        <Problem error={error} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const d = await request<{ record: RecordRow }>(
                "/orders",
                companyId,
                "POST",
                form,
              );
              nav(orderPath("/orders/" + d.record.id, companyId));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <CustomerFields
            context={context}
            clientId={form.clientId}
            centerId={form.centerId}
            date={form.deliveryDate}
            onChange={setForm}
          />
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              Crear borrador
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
function Back({
  companyId,
  path = "/orders",
  text = "Volver a pedidos",
}: {
  companyId: string;
  path?: string;
  text?: string;
}) {
  return (
    <Link className="secondary order-back" to={orderPath(path, companyId)}>
      <ArrowLeft size={15} />
      {text}
    </Link>
  );
}
function MessageList({
  companyId,
  writable,
}: {
  companyId: string;
  writable: boolean;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [error, setError] = useState(""),
    [state, setState] = useState("");
  useEffect(() => {
    request<{ records: RecordRow[] }>("/order-inbox", companyId)
      .then((d) => setRows(d.records))
      .catch((e) => setError(e.message));
  }, [companyId]);
  return (
    <>
      <div className="section-heading">
        <h2>Bandeja de entrada</h2>
        {writable && (
          <Link
            className="primary"
            to={orderPath("/orders/inbox/new", companyId)}
          >
            <Plus size={16} />
            Añadir mensaje o documento
          </Link>
        )}
      </div>
      <Problem error={error} />
      <section className="panel list-panel">
        <div className="list-toolbar">
          <select
            aria-label="Estado del mensaje"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Todos los mensajes</option>
            {["NEW", "PROCESSED", "ERROR", "DISCARDED"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <span className="fine">
            Entradas locales de demostración. Sin conexión a email ni WhatsApp.
          </span>
        </div>
        {!rows.length ? (
          <Empty text="La bandeja está vacía. Puedes introducir texto, un PDF con texto o una imagen con transcripción." />
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Asunto</th>
                  <th>Canal</th>
                  <th>Remitente</th>
                  <th>Estado</th>
                  <th>Recibido</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => !state || r.data.state === state)
                  .sort((a, b) =>
                    String(b.data.receivedAt).localeCompare(
                      String(a.data.receivedAt),
                    ),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          className="record-link"
                          to={orderPath("/orders/inbox/" + r.id, companyId)}
                        >
                          {String(r.data.subject || "Sin asunto")}
                        </Link>
                      </td>
                      <td>{label(r.data.channel)}</td>
                      <td>{String(r.data.sender)}</td>
                      <td>
                        <Status value={r.data.state} />
                      </td>
                      <td>
                        {new Date(String(r.data.receivedAt)).toLocaleString(
                          "es-ES",
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function NewMessage({
  companyId,
  context,
}: {
  companyId: string;
  context: OrderContext;
}) {
  const nav = useNavigate(),
    [form, setForm] = useState({
      clientId: "",
      centerId: "",
      deliveryDate: "",
    }),
    [channel, setChannel] = useState("EMAIL"),
    [sender, setSender] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [attachment, setAttachment] = useState<{
      filename: string;
      mime: string;
      base64: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Back
        companyId={companyId}
        path="/orders/inbox"
        text="Volver a la bandeja"
      />
      <section className="panel master-form">
        <h2>Añadir entrada de pedido</h2>
        <p>
          Formato de simulación: una línea por producto, por ejemplo{" "}
          <code>NX-01-001 | 3 | KG</code> o <code>3 kg Basmati Rice</code>. Las
          propuestas siempre requieren revisión.
        </p>
        <Problem error={error} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const d = await request<{ record: RecordRow }>(
                "/order-inbox",
                companyId,
                "POST",
                {
                  channel,
                  sender,
                  subject,
                  body,
                  clientId: form.clientId || null,
                  centerId: form.centerId || null,
                  requestedDate: form.deliveryDate || null,
                  attachment,
                },
              );
              nav(orderPath("/orders/inbox/" + d.record.id, companyId));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="row g-3">
            <div className="col-md-4">
              <label htmlFor="message-channel">Canal de origen</label>
              <select
                id="message-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {["EMAIL", "WHATSAPP", "PDF", "MANUAL"].map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-8">
              <label htmlFor="message-sender">Remitente</label>
              <input
                id="message-sender"
                required
                maxLength={200}
                value={sender}
                onChange={(e) => setSender(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label htmlFor="message-subject">Asunto</label>
              <input
                id="message-subject"
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label htmlFor="message-body">
                Texto o transcripción del pedido
              </label>
              <textarea
                id="message-body"
                rows={8}
                maxLength={20000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="fine">
                Los PDF con texto se extraen localmente si este campo está
                vacío. Las fotos y los PDF escaneados necesitan una
                transcripción manual; no hay OCR conectado.
              </p>
            </div>
            <div className="col-12">
              <label htmlFor="message-file">
                Adjunto original (opcional, hasta 1,5 MB y 20 páginas)
              </label>
              <input
                id="message-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  setAttachment(null);
                  if (!file) return;
                  if (file.size > 1_500_000) {
                    setError("El adjunto no puede superar 1,5 MB.");
                    e.target.value = "";
                    return;
                  }
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  let binary = "";
                  for (const byte of bytes) binary += String.fromCharCode(byte);
                  setAttachment({
                    filename: file.name,
                    mime: file.type,
                    base64: btoa(binary),
                  });
                  setError("");
                }}
              />
              {attachment && <p className="fine">{attachment.filename}</p>}
            </div>
          </div>
          <CustomerFields
            context={context}
            clientId={form.clientId}
            centerId={form.centerId}
            date={form.deliveryDate}
            onChange={setForm}
          />
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              Guardar entrada
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
function Original({
  message,
  attachments,
}: {
  message: RecordRow | null;
  attachments: RecordRow[];
}) {
  const [url, setUrl] = useState("");
  const file = attachments[0];
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const binary = atob(String(file.data.base64)),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const u = URL.createObjectURL(
      new Blob([bytes], { type: String(file.data.mime) }),
    );
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <section className="panel order-original">
      <h2>Entrada original</h2>
      {message ? (
        <>
          <p>
            <strong>{String(message.data.subject || "Sin asunto")}</strong>
            <br />
            {String(message.data.sender)}
          </p>
          <pre>
            {String(
              (message.data.originalBody ?? message.data.body) ||
                "Sin texto; añade una transcripción para procesar.",
            )}
          </pre>
        </>
      ) : (
        <p>Pedido introducido manualmente.</p>
      )}
      {file && url && (
        <>
          <a
            className="secondary"
            href={url}
            download={String(file.data.filename)}
          >
            <Download size={15} />
            Descargar original
          </a>
          {file.data.mime === "application/pdf" ? (
            <iframe
              title="Documento original del pedido"
              src={url}
              sandbox=""
            />
          ) : (
            <img src={url} alt="Documento original del pedido" />
          )}
        </>
      )}
    </section>
  );
}
function MessageDetail({
  companyId,
  id,
  writable,
}: {
  companyId: string;
  id: string;
  writable: boolean;
}) {
  const nav = useNavigate(),
    [view, setView] = useState<{
      message: RecordRow;
      attachments: RecordRow[];
      order: RecordRow | null;
    } | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [discard, setDiscard] = useState(false);
  useEffect(() => {
    request<NonNullable<typeof view>>("/order-inbox/" + id, companyId)
      .then((d) => {
        setView(d);
        setText(String(d.message.data.body ?? ""));
      })
      .catch((e) => setError(e.message));
  }, [companyId, id, reload]);
  async function process() {
    if (!view) return;
    setBusy(true);
    setError("");
    try {
      const d = await request<{ record: RecordRow }>(
        "/order-inbox/" + id + "/process",
        companyId,
        "POST",
        { version: view.message.version },
      );
      nav(orderPath("/orders/" + d.record.id, companyId));
    } catch (e) {
      setError((e as Error).message);
      setReload((x) => x + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back
        companyId={companyId}
        path="/orders/inbox"
        text="Volver a la bandeja"
      />
      <Problem error={error} />
      {view ? (
        <>
          <div className="section-heading">
            <h2>{String(view.message.data.subject || "Entrada de pedido")}</h2>
            <Status value={view.message.data.state} />
          </div>
          <div className="order-review-grid">
            <Original message={view.message} attachments={view.attachments} />
            <section className="panel master-form">
              <h2>Propuesta de pedido</h2>
              <p>
                La extracción es una simulación local de coste cero. No se envía
                el documento a un proveedor de IA.
              </p>
              {view.message.data.error ? (
                <p className="alert">
                  {errorEs(String(view.message.data.error))}
                </p>
              ) : null}
              {view.order ? (
                <Link
                  className="primary"
                  to={orderPath("/orders/" + view.order.id, companyId)}
                >
                  Ver y revisar {String(view.order.data.number)}
                </Link>
              ) : ["NEW", "ERROR"].includes(String(view.message.data.state)) &&
                writable ? (
                <>
                  <label htmlFor="transcription">
                    Texto para la simulación
                  </label>
                  <textarea
                    id="transcription"
                    rows={10}
                    value={text}
                    maxLength={20000}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="actions mt">
                    <button
                      className="secondary"
                      disabled={
                        busy || text === view.message.data.body || !text.trim()
                      }
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await request(
                            "/order-inbox/" + id,
                            companyId,
                            "PUT",
                            { body: text, version: view.message.version },
                          );
                          setReload((x) => x + 1);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Guardar transcripción
                    </button>
                    <button
                      className="primary"
                      disabled={busy || text !== view.message.data.body}
                      onClick={process}
                    >
                      {busy ? "Procesando…" : "Generar propuesta mock"}
                    </button>
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => setDiscard(true)}
                    >
                      Descartar entrada
                    </button>
                  </div>
                  <GeminiIntake
                    companyId={companyId}
                    messageId={id}
                    version={view.message.version}
                    disabled={busy || text !== view.message.data.body}
                    onBusy={setBusy}
                    onOrder={(o) =>
                      nav(orderPath("/orders/" + o.id, companyId))
                    }
                  />
                  <p className="fine">
                    Guarda los cambios de la transcripción antes de procesar. Si
                    ya se procesó, se reutiliza su pedido sin crear duplicados.
                  </p>
                </>
              ) : (
                <p>
                  Esta entrada no se puede procesar con su estado o permisos
                  actuales.
                </p>
              )}
            </section>
          </div>
          {discard && (
            <Confirm
              title="¿Descartar esta entrada?"
              text="Se conservará en el historial y no se generará ningún pedido."
              busy={busy}
              onCancel={() => setDiscard(false)}
              onAccept={async () => {
                setBusy(true);
                try {
                  await request(
                    "/order-inbox/" + id + "/discard",
                    companyId,
                    "POST",
                    { version: view.message.version },
                  );
                  setDiscard(false);
                  setReload((x) => x + 1);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </>
      ) : !error ? (
        <p>Cargando entrada…</p>
      ) : null}
    </>
  );
}
function OrderDetail({
  permissions,
  companyId,
  id,
  context,
  writable,
}: {
  companyId: string;
  id: string;
  context: OrderContext;
  writable: boolean;
  permissions: OrderPermissions;
}) {
  const [view, setView] = useState<OrderView | null>(null),
    [catalog, setCatalog] = useState(context),
    [productSearch, setProductSearch] = useState<Record<string, string>>({}),
    [draft, setDraft] = useState<ReviewDraft | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [action, setAction] = useState<"confirm" | "cancel" | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      request<OrderView>("/orders/" + id, companyId),
      request<OrderContext>("/orders/catalog", companyId),
    ])
      .then(([d, c]) => {
        if (live) {
          setView(d);
          setCatalog(c);
          setDraft(reviewDraft(d));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, id, reload]);
  if (!view || !draft)
    return (
      <>
        <Back companyId={companyId} />
        <Problem error={error} />
        {!error && <p>Cargando pedido…</p>}
      </>
    );
  const editable =
    writable &&
    !view.order.data.erpDeliveryId &&
    ["DRAFT", "SUBMITTED", "IN_REVIEW"].includes(String(view.order.data.state));
  const dirty = JSON.stringify(draft) !== JSON.stringify(reviewDraft(view));
  function lineChange(
    index: number,
    patch: Partial<ReviewDraft["lines"][number]>,
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            lines: d.lines.map((line, i) =>
              i === index ? { ...line, ...patch } : line,
            ),
          }
        : d,
    );
    setNotice("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await request<OrderView>(
        "/orders/" + id,
        companyId,
        "PUT",
        reviewPayload(view!, draft!),
      );
      setView(d);
      setDraft(reviewDraft(d));
      setNotice(
        "Revisión guardada. La aprobación interna es una acción independiente.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        filename: string;
        mime: string;
        content: string;
      }>("/orders/" + id + "/export", companyId, "POST", {
        version: view!.order.version,
        format,
      });
      downloadOrder(result);
      setReload((x) => x + 1);
      setNotice("Exportación descargada y registrada en el historial.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back companyId={companyId} />
      <div className="page-heading">
        <div>
          <h2>{String(view.order.data.number)}</h2>
          <p>
            {label(view.order.data.origin)} ·{" "}
            {amount(view.order.data.totalCents)}
          </p>
        </div>
        <Status value={view.order.data.state} />
      </div>
      <Problem error={error} />
      {notice && (
        <p role="status" className="order-notice">
          {notice}
        </p>
      )}
      <div className="order-review-grid">
        <Original message={view.message} attachments={view.attachments} />
        <section className="panel master-form order-review">
          <h2>Revisión del pedido</h2>
          <p>
            Elige productos, corrige cantidades y marca cada línea como
            revisada. Guardar no confirma ni descuenta stock.
          </p>
          <form onSubmit={save}>
            <CustomerFields
              context={catalog}
              clientId={draft.clientId}
              centerId={draft.centerId}
              date={draft.deliveryDate}
              disabled={!editable || busy}
              onChange={(value) => {
                setDraft({ ...draft, ...value });
                setNotice("");
              }}
            />
            <div className="section-heading mt">
              <h2>Líneas del pedido</h2>
              {editable && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || draft.lines.length >= 200}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      lines: [
                        ...draft.lines,
                        {
                          key: crypto.randomUUID(),
                          productId: "",
                          quantity: "1",
                          unit: "UNKNOWN",
                          reviewAccepted: false,
                          originalText: "Manual line",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Añadir línea
                </button>
              )}
            </div>
            {!draft.lines.length && (
              <p>No hay líneas. Añade al menos una antes de aprobar.</p>
            )}
            {draft.lines.map((line, index) => {
              const product = catalog.products.find(
                  (p) => p.id === line.productId,
                ),
                saved = view.lines.find((l) => l.id === line.id);
              return (
                <article
                  key={line.key}
                  className={
                    "order-line " +
                    (saved && saved.data.state !== "MATCHED"
                      ? "line-warning"
                      : "")
                  }
                >
                  <div className="section-heading">
                    <strong>Línea {index + 1}</strong>
                    {saved && <Status value={saved.data.state} />}
                  </div>
                  <p className="original-line">Original: {line.originalText}</p>
                  {editable && (
                    <>
                      <label htmlFor={"search-" + line.key}>
                        Buscar producto o sustituto
                      </label>
                      <input
                        id={"search-" + line.key}
                        placeholder="Nombre o referencia del catálogo"
                        value={productSearch[line.key] ?? ""}
                        onChange={(e) =>
                          setProductSearch({
                            ...productSearch,
                            [line.key]: e.target.value,
                          })
                        }
                      />
                    </>
                  )}
                  <label htmlFor={"product-" + line.key}>Producto</label>
                  <select
                    id={"product-" + line.key}
                    value={line.productId}
                    disabled={!editable || busy}
                    onChange={(e) => {
                      const p = catalog.products.find(
                        (p) => p.id === e.target.value,
                      );
                      lineChange(index, {
                        productId: e.target.value,
                        unit: String(p?.data.unit ?? "UNKNOWN"),
                        reviewAccepted: false,
                      });
                    }}
                  >
                    <option value="">Sin producto asociado</option>
                    {catalog.products
                      .filter(
                        (p) =>
                          p.id === line.productId ||
                          (p.data.active &&
                            (!productSearch[line.key] ||
                              [p.data.sku, p.data.name]
                                .join(" ")
                                .toLowerCase()
                                .includes(
                                  productSearch[line.key].toLowerCase(),
                                ))),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.data.sku)} · {String(p.data.name)}
                        </option>
                      ))}
                  </select>
                  <div className="row g-3 mt-small">
                    <div className="col-6">
                      <label htmlFor={"quantity-" + line.key}>Cantidad</label>
                      <input
                        id={"quantity-" + line.key}
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.001"
                        required
                        value={line.quantity}
                        disabled={!editable || busy}
                        onChange={(e) =>
                          lineChange(index, {
                            quantity: e.target.value,
                            reviewAccepted: false,
                          })
                        }
                      />
                    </div>
                    <div className="col-6">
                      <label htmlFor={"unit-" + line.key}>Unidad</label>
                      <select
                        id={"unit-" + line.key}
                        value={line.unit}
                        disabled={!editable || busy}
                        onChange={(e) =>
                          lineChange(index, {
                            unit: e.target.value,
                            reviewAccepted: false,
                          })
                        }
                      >
                        {["UNKNOWN", "UNIT", "KG", "BOX", "L"].map((u) => (
                          <option key={u} value={u}>
                            {u === "UNKNOWN" ? "Sin determinar" : enumEs(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="fine">
                    Disponibilidad orientativa del catálogo:{" "}
                    {product?.data.stock === null ||
                    product?.data.stock === undefined
                      ? "Desconocido"
                      : String(product.data.stock)}{" "}
                    · Precio unitario guardado:{" "}
                    {saved
                      ? amount(saved.data.unitPriceCents)
                      : typeof product?.data.price === "number"
                        ? amount(Math.round(product.data.price * 100))
                        : "Pendiente de guardar"}
                    {saved
                      ? ` · Confianza de la propuesta: ${Math.round(Number(saved.data.confidence) * 100)} %`
                      : ""}
                  </p>
                  {saved && saved.data.substitutionForId ? (
                    <p className="fine">
                      Producto sustituido:{" "}
                      {rowName(catalog.products, saved.data.substitutionForId)}
                    </p>
                  ) : null}
                  <div className="section-heading">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={line.reviewAccepted}
                        disabled={!editable || busy || !line.productId}
                        onChange={(e) =>
                          lineChange(index, {
                            reviewAccepted: e.target.checked,
                          })
                        }
                      />
                      He revisado esta línea
                    </label>
                    {editable && (
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={"Quitar línea " + (index + 1)}
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <p className="fine">
              Los sustitutos se eligen manualmente del catálogo. Su
              compatibilidad alimentaria no se deduce de los datos mock: revisa
              sus fichas y alérgenos antes de sustituirlos.
            </p>
            {editable && (
              <div className="form-actions">
                <span className="fine">
                  {dirty ? "Hay cambios sin guardar." : "Revisión guardada."}
                </span>
                <button className="primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar revisión"}
                </button>
              </div>
            )}
          </form>
          {view.alerts.length > 0 && (
            <section className="mt">
              <h3>Alertas del pedido</h3>
              {view.alerts.map((a) => (
                <div className="order-alert" key={a.id}>
                  <Status value={a.data.state} />
                  <strong>{label(a.data.type)}</strong>
                  <p>
                    {alertDetail(String(a.data.detail))}
                    {a.data.productId
                      ? " · " + rowName(catalog.products, a.data.productId)
                      : ""}
                  </p>
                </div>
              ))}
            </section>
          )}
          <OrderWorkflow
            companyId={companyId}
            view={view}
            permissions={permissions}
            disabled={busy || dirty}
            onChanged={() => setReload((x) => x + 1)}
          />
          <div className="actions mt">
            {editable && (
              <button
                className="primary"
                disabled={
                  busy ||
                  dirty ||
                  !customerAccepted(view.order) ||
                  !draft.lines.length ||
                  draft.lines.some((l) => !l.reviewAccepted) ||
                  !draft.clientId ||
                  !draft.centerId ||
                  !draft.deliveryDate ||
                  view.lines.some((l) => l.data.state !== "MATCHED") ||
                  view.alerts.some((a) =>
                    [
                      "NO_MATCH",
                      "OUT_OF_STOCK",
                      "UNIT_MISMATCH",
                      "DELIVERY_DAY",
                      "CLOSED_CENTER",
                      "CLIENT_INACTIVE",
                      "UNKNOWN_PRICE",
                    ].includes(String(a.data.type)),
                  )
                }
                onClick={() => setAction("confirm")}
              >
                <CheckCircle2 size={17} />
                Aprobar internamente
              </button>
            )}
            {writable &&
              !view.order.data.erpDeliveryId &&
              [
                "DRAFT",
                "SUBMITTED",
                "IN_REVIEW",
                "AWAITING_CLIENT",
                "APPROVED",
                "REJECTED",
              ].includes(String(view.order.data.state)) && (
                <button
                  className="secondary danger"
                  disabled={busy || dirty}
                  onClick={() => setAction("cancel")}
                >
                  Cancelar pedido
                </button>
              )}
            {writable &&
              ["APPROVED"].includes(String(view.order.data.state)) && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => exportFile("csv")}
                  >
                    <Download size={16} />
                    Exportar CSV
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => exportFile("json")}
                  >
                    Exportar JSON
                  </button>
                </>
              )}
          </div>
          {view.run && (
            <details className="mt">
              <summary>
                Trazabilidad de la propuesta{" "}
                {view.run.data.provider === "MOCK" ? "simulada" : "de IA"}
              </summary>
              <p>
                Proveedor: {String(view.run.data.provider)} · Modelo:{" "}
                {String(view.run.data.model)} · Coste:{" "}
                {view.run.data.costCents == null
                  ? "No informado por el proveedor"
                  : amount(view.run.data.costCents)}{" "}
                · Duración: {String(view.run.data.durationMs)} ms
              </p>
              {view.run.data.provider === "GEMINI" && (
                <p>
                  Tokens de entrada:{" "}
                  {String(
                    (view.run.data.output as { inputTokens?: number })
                      ?.inputTokens ?? "No informado",
                  )}{" "}
                  · Tokens de salida:{" "}
                  {String(
                    (view.run.data.output as { outputTokens?: number })
                      ?.outputTokens ?? "No informado",
                  )}
                </p>
              )}
              <p>
                El documento original y las correcciones humanas quedan
                registrados.
              </p>
            </details>
          )}
        </section>
      </div>
      {action && (
        <Confirm
          title={
            action === "confirm"
              ? "¿Aprobar internamente este pedido?"
              : "¿Cancelar este pedido?"
          }
          text={
            action === "confirm"
              ? "Se validará la revisión aceptada por el cliente. El envío al ERP será una acción posterior; las existencias las gestionará el ERP."
              : "Se conservará el pedido como cancelado."
          }
          busy={busy}
          onCancel={() => setAction(null)}
          onAccept={async () => {
            setBusy(true);
            setError("");
            try {
              await request(
                "/orders/" +
                  id +
                  "/" +
                  (action === "confirm" ? "approve" : action),
                companyId,
                "POST",
                {
                  version: view.order.version,
                },
              );
              setAction(null);
              setReload((x) => x + 1);
              setNotice(
                action === "confirm"
                  ? "Pedido aprobado internamente. Pendiente de envío al ERP."
                  : "Pedido cancelado.",
              );
            } catch (e) {
              setError((e as Error).message);
              setAction(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
function Confirm({
  title,
  text,
  busy,
  onAccept,
  onCancel,
}: {
  title: string;
  text: string;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirm-title"
      >
        <h2 id="order-confirm-title">{title}</h2>
        <p>{text}</p>
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={onCancel}>
            Volver
          </button>
          <button className="primary" disabled={busy} onClick={onAccept}>
            {busy ? "Un momento…" : "Confirmar acción"}
          </button>
        </div>
      </section>
    </div>
  );
}
function alertDetail(detail: string) {
  return detail
    .replace(
      /^Requested (.*); available (.*)$/,
      "Cantidad solicitada: $1; disponible: $2",
    )
    .replace(
      /^Average (.*); requested (.*)$/,
      "Cantidad media: $1; solicitada: $2",
    )
    .replace("Product usually ordered", "Producto habitual ausente");
}
function Alerts({
  companyId,
  context,
  writable,
}: {
  companyId: string;
  context: OrderContext;
  writable: boolean;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [error, setError] = useState(""),
    [state, setState] = useState("OPEN"),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ records: RecordRow[] }>("/order-alerts", companyId)
      .then((d) => setRows(d.records))
      .catch((e) => setError(e.message));
  }, [companyId, reload]);
  return (
    <>
      <div className="section-heading">
        <h2>Alertas de pedidos</h2>
      </div>
      <p className="fine">
        Atender o descartar una alerta no evita las comprobaciones de aprobación
        del pedido.
      </p>
      <Problem error={error} />
      <section className="panel list-panel">
        <div className="list-toolbar">
          <select
            aria-label="Estado de alerta"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Todas las alertas</option>
            {["OPEN", "ATTENDED", "DISMISSED"].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>
        {!rows.filter((a) => !state || a.data.state === state).length ? (
          <Empty text="No hay alertas en esta vista." />
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th>Estado</th>
                  <th>Pedido</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((a) => !state || a.data.state === state)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>{label(a.data.type)}</td>
                      <td>
                        {alertDetail(String(a.data.detail))}
                        {a.data.productId ? (
                          <small className="block">
                            {rowName(context.products, a.data.productId)}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <Status value={a.data.state} />
                      </td>
                      <td>
                        <Link
                          to={orderPath("/orders/" + a.data.orderId, companyId)}
                        >
                          Ver pedido
                        </Link>
                      </td>
                      <td>
                        {writable && a.data.state === "OPEN" && (
                          <div className="actions">
                            {["ATTENDED", "DISMISSED"].map((s) => (
                              <button
                                className="secondary"
                                key={s}
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await request(
                                      "/order-alerts/" + a.id,
                                      companyId,
                                      "PUT",
                                      { state: s, version: a.version },
                                    );
                                    setReload((x) => x + 1);
                                  } catch (e) {
                                    setError((e as Error).message);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                {s === "ATTENDED" ? "Atender" : "Descartar"}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function Baskets({
  companyId,
  context,
  writable,
}: {
  companyId: string;
  context: OrderContext;
  writable: boolean;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ records: RecordRow[] }>("/usual-baskets", companyId)
      .then((d) => setRows(d.records))
      .catch((e) => setError(e.message));
  }, [companyId, reload]);
  return (
    <>
      <div className="section-heading">
        <h2>Cestas habituales</h2>
        {writable && (
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request("/usual-baskets/recompute", companyId, "POST");
                setReload((x) => x + 1);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={16} />
            Recalcular
          </button>
        )}
      </div>
      <p>
        Se calculan con pedidos aceptados por el ERP. Una aprobación interna o
        la descarga de un archivo no cuentan como compra realizada. Se
        actualizan tras la recepción y mediante una tarea diaria.
      </p>
      <Problem error={error} />
      <section className="panel table-responsive">
        {!rows.length ? (
          <Empty text="Aún no hay histórico aceptado por el ERP para calcular cestas. Los borradores mock no cuentan como compras realizadas." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente / centro</th>
                <th>Producto</th>
                <th>Cantidad media</th>
                <th>Frecuencia</th>
                <th>Pedidos</th>
                <th>Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {rowName(context.clients, r.data.clientId)}
                    <small className="block">
                      {rowName(context.centers, r.data.centerId)}
                    </small>
                  </td>
                  <td>{rowName(context.products, r.data.productId)}</td>
                  <td>{String(r.data.averageQuantity)}</td>
                  <td>
                    {Number(r.data.orderCount) > 1
                      ? String(r.data.frequencyDays) + " días"
                      : "Histórico insuficiente"}
                  </td>
                  <td>{String(r.data.orderCount)}</td>
                  <td>
                    {new Date(String(r.data.lastOrderedAt)).toLocaleString(
                      "es-ES",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
