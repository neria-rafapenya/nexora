import { useDataRefresh } from "../infrastructure/useDataRefresh";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import { amount, downloadOrder } from "../application/orderModel";
import {
  wl,
  wasteName,
  wasteURL,
  wasteForm,
  wastePayload,
  wasteToday,
  type WasteCatalog,
  type WastePermissions,
  type WasteReport,
  type WasteForm,
} from "../application/wasteModel";
const reasons = [
    "EXPIRY",
    "DETERIORATION",
    "PREPARATION",
    "OVERPRODUCTION",
    "PLATE_LEFTOVERS",
    "OTHER",
  ],
  services = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];
export function FoodWaste({
  companyId,
  section = "",
  recordId,
  isNew,
  permissions,
}: {
  companyId: string;
  section?: string;
  recordId?: string;
  isNew: boolean;
  permissions: WastePermissions;
}) {
  const [c, setC] = useState<WasteCatalog | null>(null),
    [rows, setRows] = useState<RecordRow[]>([]),
    [record, setRecord] = useState<RecordRow | undefined>(),
    [events, setEvents] = useState<RecordRow[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const type = ["events", "actuals", "actions"].includes(section)
    ? section
    : "events";
  const refreshTick = useDataRefresh(
    companyId,
    permissions.read && !recordId && !isNew,
  );
  const loadKey = JSON.stringify([
    companyId,
    recordId,
    isNew,
    type,
    reload,
    permissions.read,
  ]);
  const previousLoadKey = useRef(loadKey);
  const previousTick = useRef(refreshTick);
  useEffect(() => {
    if (!permissions.read) return;
    let live = true;
    const background =
      previousTick.current !== refreshTick &&
      previousLoadKey.current === loadKey;
    previousTick.current = refreshTick;
    previousLoadKey.current = loadKey;
    if (!background) {
      setLoading(true);
      setC(null);
      setRecord(undefined);
    }
    setError("");
    Promise.all([
      request<WasteCatalog>("/food-waste/catalog", companyId),
      request<{ records: RecordRow[] }>("/food-waste/" + type, companyId),
      recordId
        ? request<{ record: RecordRow }>(
            "/food-waste/" + type + "/" + recordId,
            companyId,
          )
        : Promise.resolve({ record: undefined }),
      request<{ records: RecordRow[] }>("/food-waste/events", companyId),
    ])
      .then(([catalog, list, item, eventList]) => {
        if (live) {
          setC(catalog);
          setRows(list.records);
          setRecord(item.record);
          setEvents(eventList.records);
        }
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
  }, [companyId, type, recordId, reload, permissions.read, refreshTick]);
  if (!permissions.read)
    return (
      <section className="panel">
        <h1>Acceso restringido</h1>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIONES · F5</span>
          <h1>Desperdicio alimentario</h1>
          <p>
            Observa mermas, contrasta raciones y registra acciones para reducir
            pérdidas.
          </p>
        </div>
      </div>
      <nav className="order-tabs" aria-label="Secciones de desperdicio">
        {[
          ["", "Indicadores"],
          ["events", "Mermas"],
          ["actuals", "Raciones reales"],
          ["actions", "Planes de mejora"],
        ].map(([s, label]) => (
          <Link
            className={section === s ? "active" : ""}
            key={s}
            to={wasteURL(s, "", companyId)}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="fine">
        Los registros no descuentan stock ni envían movimientos al ERP. Las
        raciones no servidas y la merma medida son indicadores distintos.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">Cargando desperdicio alimentario…</p>
      ) : c && !section && !recordId && !isNew ? (
        <WasteDashboard company={companyId} c={c} />
      ) : c && (recordId || isNew) ? (
        isNew && !permissions.write ? (
          <p>Acceso restringido</p>
        ) : (
          <WasteEditor
            key={type + ":" + record?.id + ":" + record?.version}
            type={type}
            company={companyId}
            c={c}
            record={record}
            events={events}
            permissions={permissions}
            changed={() => setReload((x) => x + 1)}
          />
        )
      ) : (
        c && (
          <>
            <div className="section-heading">
              <h2>
                {type === "events"
                  ? "Mermas"
                  : type === "actuals"
                    ? "Raciones reales"
                    : "Planes de mejora"}{" "}
                · {rows.length}
              </h2>
              {permissions.write && (
                <Link className="primary" to={wasteURL(type, "new", companyId)}>
                  Crear{" "}
                  {type === "events"
                    ? "registro de merma"
                    : type === "actuals"
                      ? "observación de raciones"
                      : "acción de mejora"}
                </Link>
              )}
            </div>
            <section className="panel table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Centro / fecha</th>
                    <th>{type === "actions" ? "Acción" : "Observación"}</th>
                    <th>Estado</th>
                    <th>
                      {type === "events"
                        ? "Destino"
                        : type === "actuals"
                          ? "Comparación"
                          : "Responsable / plazo"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={wasteURL(type, r.id, companyId)}>
                          {wasteName(c, "centers", r.data.centerId)} ·{" "}
                          {String(r.data.date ?? r.data.dueDate)}
                        </Link>
                      </td>
                      <td>
                        {type === "events"
                          ? `${wl(r.data.reason)} · ${r.data.quantity} ${wl(r.data.unit)}`
                          : type === "actuals"
                            ? `${r.data.produced} producidas / ${r.data.served} servidas`
                            : String(r.data.title)}
                        {r.data.isMock ? (
                          <small className="block">DATOS FICTICIOS</small>
                        ) : null}
                      </td>
                      <td>{wl(r.data.state)}</td>
                      <td>
                        {type === "events"
                          ? `${wl(r.data.destinationKind)} · ${wl(r.data.destinationState)}`
                          : type === "actuals"
                            ? `Previsión: ${r.data.planned ?? "sin datos"}`
                            : `${r.data.ownerName} · ${r.data.dueDate}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="empty-copy">
                  Todavía no hay registros en esta sección.
                </p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
function WasteEditor({
  type,
  company,
  c,
  record,
  events,
  permissions,
  changed,
}: {
  type: string;
  company: string;
  c: WasteCatalog;
  record?: RecordRow;
  events: RecordRow[];
  permissions: WastePermissions;
  changed: () => void;
}) {
  const nav = useNavigate(),
    [form, setForm] = useState(wasteForm(record)),
    [createKey] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [evidence, setEvidence] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const state = String(
      record?.data.state ?? (type === "actions" ? "OPEN" : "DRAFT"),
    ),
    editable =
      permissions.write &&
      (type === "actions"
        ? ["OPEN", "IN_PROGRESS"].includes(state)
        : state === "DRAFT"),
    dirty =
      JSON.stringify(wastePayload(type, form)) !==
      JSON.stringify(wastePayload(type, wasteForm(record))),
    center = c.centers.find((r) => r.id === form.centerId);
  const preserved = record?.data.snapshot as
    | {
        centerName?: string;
        capturedAt?: string;
        source?: { product?: RecordRow; recipeVersion?: RecordRow };
      }
    | undefined;
  const preservedSource =
    preserved?.source?.product?.data.name ??
    (
      preserved?.source?.recipeVersion?.data.snapshot as
        { name?: string } | undefined
    )?.name;
  const patch = (p: Partial<WasteForm>) => setForm((f) => ({ ...f, ...p }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await request<{ record: RecordRow }>(
        "/food-waste/" + type + (record ? "/" + record.id : ""),
        company,
        record ? "PUT" : "POST",
        {
          ...wastePayload(type, form),
          ...(record ? { version: record.version } : { createKey }),
        },
      );
      if (record) changed();
      else nav(wasteURL(type, r.record.id, company));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, extra = {}) {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "/food-waste/" + type + "/" + record.id + "/" + action,
        company,
        "POST",
        { version: record.version, ...extra },
      );
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const menuOptions = c.menuPlans.filter(
    (p) =>
      ["PUBLISHED", "ARCHIVED"].includes(String(p.data.state)) &&
      (p.data.centerIds as string[]).includes(form.centerId) &&
      p.data.service === form.service &&
      String(p.data.startDate) <= form.date &&
      String(p.data.endDate) >= form.date,
  );
  return (
    <>
      <Link className="secondary order-back" to={wasteURL(type, "", company)}>
        Volver al listado
      </Link>
      <section className="panel master-form">
        <div className="section-heading">
          <h2>
            {type === "events"
              ? "Registro de merma"
              : type === "actuals"
                ? "Raciones producidas y servidas"
                : "Acción de mejora"}
          </h2>
          <span className="pill">{wl(state)}</span>
        </div>
        {record?.data.isMock ? (
          <p className="pill">DATOS FICTICIOS · DEMOSTRACIÓN</p>
        ) : null}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={save}>
          <fieldset className="menu-fields" disabled={!editable || busy}>
            <label>
              Centro
              <select
                required
                value={form.centerId}
                onChange={(e) =>
                  patch({
                    centerId: e.target.value,
                    menuPlanId: null,
                    recipeVersionId: null,
                    linkedEventIds: [],
                  })
                }
              >
                <option value="">Seleccionar…</option>
                {c.centers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {String(r.data.name)} ·{" "}
                    {wasteName(c, "clients", r.data.clientId)}
                  </option>
                ))}
              </select>
            </label>
            {type !== "actions" ? (
              <>
                <div className="row g-3">
                  <label className="col-md-4">
                    Fecha de observación
                    <input
                      required
                      type="date"
                      max={wasteToday()}
                      value={form.date}
                      onChange={(e) =>
                        patch({ date: e.target.value, menuPlanId: null })
                      }
                    />
                  </label>
                  <label className="col-md-4">
                    Servicio
                    <select
                      value={form.service}
                      onChange={(e) =>
                        patch({ service: e.target.value, menuPlanId: null })
                      }
                    >
                      {services.map((s) => (
                        <option key={s} value={s}>
                          {wl(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-md-4">
                    Dieta {type === "actuals" ? "*" : "(opcional)"}
                    <select
                      required={type === "actuals" || !!form.menuPlanId}
                      value={form.dietId ?? ""}
                      onChange={(e) =>
                        patch({ dietId: e.target.value || null })
                      }
                    >
                      <option value="">Seleccionar…</option>
                      {c.diets.map((r) => (
                        <option key={r.id} value={r.id}>
                          {String(r.data.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Menú publicado de referencia (opcional)
                  <select
                    value={form.menuPlanId ?? ""}
                    onChange={(e) =>
                      patch({ menuPlanId: e.target.value || null })
                    }
                  >
                    <option value="">Sin menú vinculado</option>
                    {menuOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {String(p.data.name)} · revisión{" "}
                        {String(p.data.revision)}
                      </option>
                    ))}
                  </select>
                </label>
                {type === "events" ? (
                  <>
                    <div className="row g-3">
                      <label className="col-md-4">
                        Origen
                        <select
                          value={form.sourceKind}
                          onChange={(e) =>
                            patch({
                              sourceKind: e.target.value,
                              productId: null,
                              recipeVersionId: null,
                              unit:
                                e.target.value === "RECIPE" ? "PORTION" : "KG",
                            })
                          }
                        >
                          <option value="PRODUCT">Producto</option>
                          <option value="RECIPE">Receta</option>
                        </select>
                      </label>
                      <label className="col-md-8">
                        {form.sourceKind === "PRODUCT"
                          ? "Producto"
                          : "Receta y versión"}
                        <select
                          required
                          value={
                            (form.sourceKind === "PRODUCT"
                              ? form.productId
                              : form.recipeVersionId) ?? ""
                          }
                          onChange={(e) =>
                            patch(
                              form.sourceKind === "PRODUCT"
                                ? {
                                    productId: e.target.value || null,
                                    unit: String(
                                      c.products.find(
                                        (p) => p.id === e.target.value,
                                      )?.data.unit ?? "KG",
                                    ),
                                  }
                                : { recipeVersionId: e.target.value || null },
                            )
                          }
                        >
                          <option value="">Seleccionar…</option>
                          {(form.sourceKind === "PRODUCT"
                            ? c.products
                            : c.recipeVersions.filter(
                                (v) =>
                                  !(v.data.snapshot as { clientId?: string })
                                    .clientId ||
                                  (v.data.snapshot as { clientId?: string })
                                    .clientId === center?.data.clientId,
                              )
                          ).map((r) => (
                            <option key={r.id} value={r.id}>
                              {form.sourceKind === "PRODUCT"
                                ? `${r.data.sku} · ${r.data.name}`
                                : `${(r.data.snapshot as { name: string }).name} · v${r.data.revision}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="row g-3">
                      <label className="col-md-4">
                        Cantidad medida
                        <input
                          required
                          type="number"
                          min="0.001"
                          max="1000000"
                          step="0.001"
                          value={form.quantity}
                          onChange={(e) =>
                            patch({ quantity: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="col-md-4">
                        Unidad
                        <input readOnly value={wl(form.unit)} />
                      </label>
                      <label className="col-md-4">
                        Causa
                        <select
                          value={form.reason}
                          onChange={(e) => patch({ reason: e.target.value })}
                        >
                          {reasons.map((s) => (
                            <option key={s} value={s}>
                              {wl(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="fine">
                      Los productos usan su unidad de venta. Las recetas usan
                      raciones equivalentes. No se suman cantidades de unidades
                      diferentes ni se deduce merma a partir de raciones no
                      servidas.
                    </p>
                    <h3 className="mt">Trazabilidad y destino previsto</h3>
                    <div className="row g-3">
                      <label className="col-md-6">
                        Lote o partida de elaboración
                        <input
                          maxLength={4000}
                          value={form.lot}
                          onChange={(e) => patch({ lot: e.target.value })}
                        />
                      </label>
                      <label className="col-md-6">
                        Fecha límite de uso declarada
                        <input
                          type="date"
                          value={form.useBy ?? ""}
                          onChange={(e) =>
                            patch({ useBy: e.target.value || null })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Referencia de trazabilidad
                      <input
                        maxLength={4000}
                        value={form.traceabilityReference}
                        onChange={(e) =>
                          patch({ traceabilityReference: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Destino
                      <select
                        value={form.destinationKind}
                        onChange={(e) =>
                          patch({ destinationKind: e.target.value })
                        }
                      >
                        {["DISPOSAL", "RETURN", "DONATION_CANDIDATE"].map(
                          (s) => (
                            <option key={s} value={s}>
                              {wl(s)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Entidad receptora o destino
                      <input
                        maxLength={4000}
                        value={form.destinationTarget}
                        onChange={(e) =>
                          patch({ destinationTarget: e.target.value })
                        }
                      />
                    </label>
                    <p className="fine">
                      Devoluciones y posibles donaciones requieren lote,
                      trazabilidad, destinatario y revisión de Calidad. Las
                      causas caducidad, deterioro y restos de platos no admiten
                      propuesta de donación en este flujo.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="row g-3">
                      <label className="col-md-6">
                        Raciones producidas
                        <input
                          required
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          value={form.produced}
                          onChange={(e) =>
                            patch({ produced: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="col-md-6">
                        Raciones realmente servidas
                        <input
                          required
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          value={form.served}
                          onChange={(e) =>
                            patch({ served: Number(e.target.value) })
                          }
                        />
                      </label>
                    </div>
                    <p>
                      Raciones no servidas: {form.produced - form.served}. Este
                      valor no implica que se hayan desechado alimentos.
                    </p>
                  </>
                )}
                <label>
                  Referencia de la observación
                  <input
                    required
                    maxLength={4000}
                    value={form.sourceReference}
                    onChange={(e) => patch({ sourceReference: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Título de la acción
                  <input
                    required
                    maxLength={4000}
                    value={form.title}
                    onChange={(e) => patch({ title: e.target.value })}
                  />
                </label>
                <label>
                  Causa que se quiere reducir
                  <select
                    value={form.reason}
                    onChange={(e) => patch({ reason: e.target.value })}
                  >
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {wl(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Persona responsable
                  <input
                    required
                    maxLength={4000}
                    value={form.ownerName}
                    onChange={(e) => patch({ ownerName: e.target.value })}
                  />
                </label>
                <div className="row g-3">
                  <label className="col-md-6">
                    Plazo
                    <input
                      required
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => patch({ dueDate: e.target.value })}
                    />
                  </label>
                  <label className="col-md-6">
                    Objetivo de reducción (%) (opcional)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={form.targetReductionPercent ?? ""}
                      onChange={(e) =>
                        patch({
                          targetReductionPercent:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Mermas que motivan esta acción
                  <select
                    multiple
                    value={form.linkedEventIds}
                    onChange={(e) =>
                      patch({
                        linkedEventIds: [...e.target.selectedOptions].map(
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {events
                      .filter(
                        (e) =>
                          e.data.centerId === form.centerId &&
                          (e.data.state === "RECORDED" ||
                            form.linkedEventIds.includes(e.id)),
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {String(e.data.date)} · {wl(e.data.reason)} ·{" "}
                          {String(e.data.quantity)} {wl(e.data.unit)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <label className="mt">
              {type === "actions" ? "Plan de actuación" : "Notas"}
              <textarea
                required={type === "actions"}
                maxLength={4000}
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isMock}
                onChange={(e) => patch({ isMock: e.target.checked })}
              />
              Datos ficticios para demostración
            </label>
            {editable && (
              <div className="form-actions">
                <span>
                  {dirty ? "Cambios sin guardar." : "Datos guardados."}
                </span>
                <button className="primary" disabled={busy}>
                  Guardar {type === "actions" ? "acción" : "borrador"}
                </button>
              </div>
            )}
          </fieldset>
        </form>
        {record && (
          <section className="mt">
            {type === "events" && (
              <>
                <h3>Medición y destino</h3>
                {preservedSource && (
                  <p>
                    Origen conservado: {String(preservedSource)} ·{" "}
                    {preserved?.centerName}
                  </p>
                )}
                <p>
                  Valoración orientativa conservada:{" "}
                  {record.data.estimatedCostCents == null
                    ? "Sin valorar; faltan precios o conversiones"
                    : amount(record.data.estimatedCostCents)}
                  . Se mantiene aunque cambie el catálogo.
                </p>
                <p>
                  Destino: {wl(record.data.destinationKind)} ·{" "}
                  {wl(record.data.destinationState)}
                </p>
              </>
            )}
            {type === "actuals" && (
              <p>
                Previsión conservada:{" "}
                {record.data.planned == null
                  ? "Sin datos"
                  : String(record.data.planned)}{" "}
                raciones · Producidas: {String(record.data.produced)} ·
                Servidas: {String(record.data.served)}. La comparación no
                modifica los comensales habituales ni los menús.
              </p>
            )}
            {state === "VOID" && (
              <p>Motivo de anulación: {String(record.data.voidReason)}</p>
            )}
            {permissions.write &&
              state !== "VOID" &&
              !(
                type === "actions" && ["COMPLETED", "CANCELLED"].includes(state)
              ) && (
                <>
                  <label>
                    {type === "actions"
                      ? "Evidencia de progreso o resultado"
                      : "Referencia, motivo o evidencia de la acción"}
                    <textarea
                      maxLength={4000}
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                    />
                  </label>
                  {type !== "actions" && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      Confirmo la medición o la actuación indicada. Registrar el
                      destino no implica un movimiento en almacén o ERP.
                    </label>
                  )}
                  <div className="actions">
                    {type !== "actions" && state === "DRAFT" && (
                      <button
                        className="primary"
                        disabled={busy || dirty || !confirmed}
                        onClick={() => act("record", { confirmed })}
                      >
                        Confirmar registro de observación
                      </button>
                    )}
                    {type === "events" &&
                      state === "RECORDED" &&
                      record.data.destinationState === "PENDING_QUALITY" &&
                      permissions.quality && (
                        <>
                          <button
                            className="primary"
                            disabled={
                              busy || dirty || !confirmed || !evidence.trim()
                            }
                            onClick={() =>
                              act("approve", { confirmed, evidence })
                            }
                          >
                            Aprobar destino como Calidad
                          </button>
                          <button
                            className="secondary danger"
                            disabled={
                              busy || dirty || !confirmed || !evidence.trim()
                            }
                            onClick={() =>
                              act("reject", { confirmed, evidence })
                            }
                          >
                            Rechazar destino como Calidad
                          </button>
                        </>
                      )}
                    {type === "events" &&
                      state === "RECORDED" &&
                      ["READY", "APPROVED"].includes(
                        String(record.data.destinationState),
                      ) && (
                        <button
                          className="primary"
                          disabled={
                            busy || dirty || !confirmed || !evidence.trim()
                          }
                          onClick={() =>
                            act("complete", { confirmed, evidence })
                          }
                        >
                          Registrar ejecución del destino
                        </button>
                      )}
                    {type === "events" &&
                      state === "RECORDED" &&
                      record.data.destinationKind !== "DISPOSAL" &&
                      record.data.destinationState !== "COMPLETED" && (
                        <button
                          className="secondary danger"
                          disabled={
                            busy || dirty || !confirmed || !evidence.trim()
                          }
                          onClick={() =>
                            act("discard", { confirmed, reason: evidence })
                          }
                        >
                          Cambiar destino pendiente a desecho
                        </button>
                      )}
                    {type === "actions" ? (
                      ["IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                        <button
                          key={s}
                          className={
                            s === "COMPLETED" ? "primary" : "secondary"
                          }
                          disabled={
                            busy || dirty || !evidence.trim() || s === state
                          }
                          onClick={() =>
                            act("progress", { state: s, evidence })
                          }
                        >
                          {s === "IN_PROGRESS"
                            ? "Marcar en curso"
                            : s === "COMPLETED"
                              ? "Cerrar acción con evidencia"
                              : "Cancelar acción"}
                        </button>
                      ))
                    ) : (
                      <button
                        className="secondary danger"
                        disabled={
                          busy || dirty || !confirmed || !evidence.trim()
                        }
                        onClick={() =>
                          act("void", { confirmed, reason: evidence })
                        }
                      >
                        Anular registro conservando historial
                      </button>
                    )}
                  </div>
                </>
              )}
            {type === "events" && (
              <>
                <details className="mt">
                  <summary>Revisión y trazabilidad del destino</summary>
                  {Object.entries(
                    (record.data.qualityDecision ?? {}) as Record<
                      string,
                      { at?: string; evidence?: string; reason?: string }
                    >,
                  ).map(([k, d]) => (
                    <p key={k}>
                      {(
                        {
                          approve: "Aprobación de Calidad",
                          reject: "Rechazo de Calidad",
                          rerouted: "Cambio a desecho",
                        } as Record<string, string>
                      )[k] ?? k}{" "}
                      · {d.at} · {d.evidence ?? d.reason}
                    </p>
                  ))}
                  {(record.data.completion as { evidence?: string })
                    ?.evidence && (
                    <p>
                      Ejecución registrada:{" "}
                      {String(
                        (record.data.completion as { completedAt: string })
                          .completedAt,
                      )}{" "}
                      ·{" "}
                      {String(
                        (record.data.completion as { evidence: string })
                          .evidence,
                      )}
                    </p>
                  )}
                </details>
                <p className="fine">
                  Anular corrige el registro estadístico y conserva las
                  decisiones y evidencias; no revierte una entrega ni una
                  actuación ya realizada. Para repartir cantidades entre
                  destinos, registra mediciones separadas.
                </p>
              </>
            )}
            {type === "actions" && (
              <details className="mt">
                <summary>Historial de progreso</summary>
                {Object.entries(
                  (record.data.outcome ?? {}) as Record<
                    string,
                    { at: string; evidence: string }
                  >,
                ).map(([s, o]) => (
                  <p key={s}>
                    {wl(s)} · {o.at} · {o.evidence}
                  </p>
                ))}
              </details>
            )}
          </section>
        )}
      </section>
    </>
  );
}
function WasteDashboard({ company, c }: { company: string; c: WasteCatalog }) {
  const [start, setStart] = useState(() =>
      new Date(Date.parse(wasteToday()) - 29 * 86400000)
        .toISOString()
        .slice(0, 10),
    ),
    [end, setEnd] = useState(wasteToday()),
    [center, setCenter] = useState(""),
    [service, setService] = useState(""),
    [reason, setReason] = useState(""),
    [data, setData] = useState<WasteReport | null>(null),
    [error, setError] = useState("");
  const refreshTick = useDataRefresh(company);
  useEffect(() => {
    let live = true;
    setError("");
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries({
          start,
          end,
          centerId: center,
          service,
          reason,
        }).filter(([, v]) => v),
      ),
    );
    request<WasteReport>("/food-waste/report?" + params, company)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [company, start, end, center, service, reason, refreshTick]);
  return (
    <>
      <section className="panel master-form">
        <h2>Indicadores del período</h2>
        <div className="row g-3">
          <label className="col-md-2">
            Desde
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="col-md-2">
            Hasta
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="col-md-3">
            Centro
            <select value={center} onChange={(e) => setCenter(e.target.value)}>
              <option value="">Todos los centros</option>
              {c.centers.map((r) => (
                <option key={r.id} value={r.id}>
                  {String(r.data.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-md-2">
            Servicio
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Todos</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {wl(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-md-3">
            Causa de merma
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Todas</option>
              {reasons.map((s) => (
                <option key={s} value={s}>
                  {wl(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {data ? (
        <>
          {data.containsMock && (
            <p className="pill mt">EL PERÍODO CONTIENE DATOS FICTICIOS</p>
          )}
          <div className="row g-3 mt">
            <div className="col-md-3">
              <section className="panel">
                <strong>{data.totals.records}</strong>
                <p>Mediciones registradas</p>
              </section>
            </div>
            <div className="col-md-3">
              <section className="panel">
                <strong>{amount(data.totals.estimatedCostCents)}</strong>
                <p>Valoración de pérdidas conocida</p>
                <small>{data.totals.unvalued} registros sin valorar</small>
              </section>
            </div>
            <div className="col-md-3">
              <section className="panel">
                <strong>
                  {data.totals.served} / {data.totals.produced}
                </strong>
                <p>Raciones servidas / producidas</p>
              </section>
            </div>
            <div className="col-md-3">
              <section className="panel">
                <strong>
                  {data.totals.unservedPercent == null
                    ? data.actuals.length
                      ? "Sin producción registrada"
                      : "Sin observaciones"
                    : data.totals.unservedPercent + " %"}
                </strong>
                <p>Raciones no servidas · {data.totals.unserved}</p>
              </section>
            </div>
          </div>
          <section className="panel mt">
            <h3>Cantidades por centro y unidad</h3>
            <p className="fine">
              Las cantidades medidas incluyen todos los destinos. Desechos,
              devoluciones y donaciones solo cuentan como ejecutados cuando
              tienen evidencia. Borradores y anulados quedan excluidos.
            </p>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Centro / unidad</th>
                    <th>Merma medida</th>
                    <th>Desecho ejecutado</th>
                    <th>Devuelto</th>
                    <th>Donado</th>
                    <th>Pendiente de destino</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quantities.map((q, i) => (
                    <tr key={i}>
                      <td>
                        {wasteName(c, "centers", q.centerId)} · {wl(q.unit)}
                      </td>
                      <td>{q.quantity}</td>
                      <td>{q.discarded}</td>
                      <td>{q.returned}</td>
                      <td>{q.donated}</td>
                      <td>{q.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt">Causas observadas</h3>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Causa</th>
                    <th>Unidad</th>
                    <th>Cantidad</th>
                    <th>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {data.causes.map((q, i) => (
                    <tr key={i}>
                      <td>{wl(q.reason)}</td>
                      <td>{wl(q.unit)}</td>
                      <td>{q.quantity}</td>
                      <td>{q.records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="secondary mt"
              onClick={() => {
                const cell = (s: unknown) =>
                  '"' +
                  String(s ?? "")
                    .replace(/^[=+@-]/, "'$&")
                    .replaceAll('"', '""') +
                  '"';
                const rows = [
                  [
                    "date",
                    "center_id",
                    "service",
                    "reason",
                    "quantity",
                    "unit",
                    "destination",
                    "destination_state",
                    "estimated_cost_eur",
                    "mock",
                  ],
                  ...data.events.map((e) => [
                    e.data.date,
                    e.data.centerId,
                    e.data.service,
                    e.data.reason,
                    e.data.quantity,
                    e.data.unit,
                    e.data.destinationKind,
                    e.data.destinationState,
                    e.data.estimatedCostCents == null
                      ? ""
                      : Number(e.data.estimatedCostCents) / 100,
                    e.data.isMock,
                  ]),
                ];
                downloadOrder({
                  filename: "food-waste.csv",
                  mime: "text/csv;charset=utf-8",
                  content:
                    "\uFEFF" +
                    rows.map((r) => r.map(cell).join(",")).join("\r\n"),
                });
              }}
            >
              Descargar registros del período CSV
            </button>
          </section>
          <section className="panel mt">
            <h3>Previsión frente al servicio real</h3>
            <p className="fine">
              El filtro de causa afecta a las mermas; las raciones se comparan
              por centro, fecha y servicio. Estos datos no cambian la
              planificación automáticamente.
            </p>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Centro / fecha / dieta</th>
                    <th>Previstas</th>
                    <th>Producidas</th>
                    <th>Servidas</th>
                    <th>No servidas</th>
                    <th>Diferencia servidas / previsión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actuals.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={wasteURL("actuals", r.id, company)}>
                          {wasteName(c, "centers", r.data.centerId)} ·{" "}
                          {String(r.data.date)} ·{" "}
                          {wasteName(c, "diets", r.data.dietId)}
                        </Link>
                      </td>
                      <td>
                        {r.data.planned == null
                          ? "Sin datos"
                          : String(r.data.planned)}
                      </td>
                      <td>{String(r.data.produced)}</td>
                      <td>{String(r.data.served)}</td>
                      <td>{Number(r.data.produced) - Number(r.data.served)}</td>
                      <td>
                        {r.data.planned == null
                          ? "Sin datos"
                          : Number(r.data.served) - Number(r.data.planned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt">
              Referencias para revisar próximas previsiones
            </h3>
            <p>
              Se muestran medias de raciones servidas cuando hay al menos tres
              observaciones confirmadas. Son referencias descriptivas, no
              sugerencias de IA ni cambios automáticos.
            </p>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Centro / servicio / dieta</th>
                    <th>Observaciones</th>
                    <th>Media producida</th>
                    <th>Media servida</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planningReferences.map((g, i) => (
                    <tr key={i}>
                      <td>
                        {wasteName(c, "centers", g.centerId)} · {wl(g.service)}{" "}
                        · {wasteName(c, "diets", g.dietId)}
                      </td>
                      <td>{g.observations}</td>
                      <td>{g.meanProduced ?? "Histórico insuficiente"}</td>
                      <td>{g.meanServed ?? "Histórico insuficiente"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel mt">
            <h3>Seguimiento de acciones de mejora</h3>
            <p className="fine">
              Los filtros de centro y causa se aplican a las acciones; sus
              plazos no se limitan al período de observaciones.
            </p>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Responsable</th>
                    <th>Plazo</th>
                    <th>Estado</th>
                    <th>Objetivo declarado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actions.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={wasteURL("actions", a.id, company)}>
                          {String(a.data.title)}
                        </Link>
                      </td>
                      <td>{String(a.data.ownerName)}</td>
                      <td>
                        {String(a.data.dueDate)}
                        {a.overdue ? " · Vencida" : ""}
                      </td>
                      <td>{wl(a.data.state)}</td>
                      <td>
                        {a.data.targetReductionPercent == null
                          ? "Sin porcentaje"
                          : String(a.data.targetReductionPercent) + " %"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : !error ? (
        <p>Cargando indicadores…</p>
      ) : null}
    </>
  );
}
