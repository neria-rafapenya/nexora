import { useDataRefresh } from "../infrastructure/useDataRefresh";
import { MenuCalendar } from "./MenuCalendar";
import { MenuImport } from "./MenuImport";
import { MenuNutrition } from "./MenuNutrition";
import { SupplyEditor, AdvancedForecast } from "./MenuSupply";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import { amount } from "../application/orderModel";
import {
  ml,
  menuName,
  menuURL,
  planForm,
  recipeForm,
  type MenuCatalog,
  type MenuPermissions,
  type PlanForm,
  type Forecast,
} from "../application/menuModel";
export function Menus({
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
  permissions: MenuPermissions;
}) {
  const [c, setC] = useState<MenuCatalog | null>(null),
    [rows, setRows] = useState<RecordRow[]>([]),
    [record, setRecord] = useState<RecordRow | undefined>(),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true);
  const endpoint =
    section === "ingredients"
      ? "menu-ingredients"
      : section === "recipes"
        ? "recipes"
        : "menus";
  const refreshTick = useDataRefresh(
    companyId,
    permissions.read && !recordId && !isNew && section !== "nutrition",
  );
  const loadKey = JSON.stringify([
    companyId,
    recordId,
    isNew,
    endpoint,
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
      request<MenuCatalog>("/menus/catalog", companyId),
      request<{ records: RecordRow[] }>("/" + endpoint, companyId),
      recordId
        ? request<{ record: RecordRow }>(
            "/" + endpoint + "/" + recordId,
            companyId,
          )
        : Promise.resolve({ record: undefined }),
    ])
      .then(([catalog, list, item]) => {
        if (live) {
          setC(catalog);
          setRows(list.records);
          setRecord(item.record);
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
  }, [companyId, endpoint, recordId, reload, permissions.read, refreshTick]);
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
          <span className="eyebrow">OPERACIONES · F3</span>
          <h1>Planificación de menús</h1>
          <p>
            Del menú del cliente a las necesidades de cocina y propuestas de
            abastecimiento.
          </p>
        </div>
        <span className="pill">ENTORNO DE DEMOSTRACIÓN</span>
      </div>
      <nav className="order-tabs" aria-label="Secciones de menús">
        {[
          ["", "Planificaciones"],
          ["recipes", "Recetas"],
          ["ingredients", "Ingredientes y compras"],
          ["nutrition", "Nutrición y Calidad"],
        ].map(([s, name]) => (
          <Link
            className={section === s ? "active" : ""}
            key={s}
            to={menuURL(s, "", companyId)}
          >
            {name}
          </Link>
        ))}
      </nav>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">Cargando planificación…</p>
      ) : c && section === "nutrition" ? (
        <MenuNutrition
          key={reload}
          c={c}
          company={companyId}
          permissions={permissions}
          changed={() => setReload((x) => x + 1)}
        />
      ) : c && (isNew || recordId) ? (
        isNew && !permissions.write ? (
          <p>Acceso restringido</p>
        ) : (
          <div key={record?.id + ":" + record?.version + ":" + endpoint}>
            {section === "ingredients" ? (
              <IngredientEditor
                c={c}
                record={record}
                company={companyId}
                writable={permissions.write}
                changed={() => setReload((x) => x + 1)}
              />
            ) : section === "recipes" ? (
              <RecipeEditor
                c={c}
                record={record}
                company={companyId}
                writable={permissions.write}
                changed={() => setReload((x) => x + 1)}
              />
            ) : (
              <PlanEditor
                c={c}
                record={record}
                company={companyId}
                permissions={permissions}
                changed={() => setReload((x) => x + 1)}
              />
            )}
          </div>
        )
      ) : (
        c && (
          <>
            <div className="section-heading">
              <h2>
                {section === "ingredients"
                  ? "Ingredientes de cocina"
                  : section === "recipes"
                    ? "Recetas"
                    : "Planificaciones"}{" "}
                · {rows.length}
              </h2>
              {permissions.write && (
                <Link
                  className="primary"
                  to={menuURL(section, "new", companyId)}
                >
                  Crear{" "}
                  {section === "ingredients"
                    ? "ingrediente"
                    : section === "recipes"
                      ? "receta"
                      : "planificación"}
                </Link>
              )}
            </div>
            <section className="panel table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>
                      {section === "ingredients"
                        ? "Unidad"
                        : section === "recipes"
                          ? "Cliente / versión"
                          : "Cliente / fechas"}
                    </th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={menuURL(section, r.id, companyId)}>
                          {String(r.data.name)}
                        </Link>
                      </td>
                      <td>
                        {section === "ingredients"
                          ? ml(r.data.unit)
                          : section === "recipes"
                            ? `${r.data.clientId ? menuName(c, "clients", r.data.clientId) : "Receta compartida"} · v${r.data.revision}`
                            : `${menuName(c, "clients", r.data.clientId)} · ${r.data.startDate} / ${r.data.endDate}`}
                      </td>
                      <td>
                        {section
                          ? "active" in r.data
                            ? r.data.active
                              ? "Activo"
                              : "Inactivo"
                            : "—"
                          : ml(r.data.state)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="empty-copy">
                  Todavía no hay registros. Empieza por ingredientes y recetas.
                </p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
function Back({ section, company }: { section: string; company: string }) {
  return (
    <Link className="secondary order-back" to={menuURL(section, "", company)}>
      Volver al listado
    </Link>
  );
}
function IngredientEditor({
  c,
  record,
  company,
  writable,
  changed,
}: {
  c: MenuCatalog;
  record?: RecordRow;
  company: string;
  writable: boolean;
  changed: () => void;
}) {
  const nav = useNavigate(),
    [name, setName] = useState(String(record?.data.name ?? "")),
    [unit, setUnit] = useState(String(record?.data.unit ?? "KG")),
    [active, setActive] = useState(record?.data.active !== false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mapping = c.ingredientProducts.find(
      (r) => r.data.ingredientId === record?.id,
    ),
    [productId, setProduct] = useState(String(mapping?.data.productId ?? "")),
    [quantity, setQuantity] = useState(
      Number(mapping?.data.quantityPerSalesUnit ?? 1),
    ),
    [source, setSource] = useState(String(mapping?.data.source ?? ""));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await request<{ record: RecordRow }>(
        "/menu-ingredients" + (record ? "/" + record.id : ""),
        company,
        record ? "PUT" : "POST",
        { name, unit, active, ...(record ? { version: record.version } : {}) },
      );
      if (record) changed();
      else nav(menuURL("ingredients", d.record.id, company));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back section="ingredients" company={company} />
      <section className="panel master-form">
        <h2>{record ? "Ingrediente de cocina" : "Nuevo ingrediente"}</h2>
        <p>
          El ingrediente representa lo que necesita una receta. Su producto
          comercial se elige por separado.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={save}>
          <fieldset className="menu-fields" disabled={!writable || busy}>
            <label>
              Nombre
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Unidad de cocina
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["KG", "L", "UNIT"].map((u) => (
                  <option key={u} value={u}>
                    {ml(u)}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Activo
            </label>
            {writable && (
              <button className="primary">Guardar ingrediente</button>
            )}
          </fieldset>
        </form>
        {record && (
          <form
            className="mt"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request("/ingredient-products", company, "POST", {
                  ingredientId: record.id,
                  productId,
                  quantityPerSalesUnit: quantity,
                  source,
                  ...(mapping ? { version: mapping.version } : {}),
                });
                changed();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Equivalencia para compras</h3>
            <p>
              Indica cuánta cantidad de cocina contiene una unidad de venta.
              Ejemplo: un saco vendido por unidad que contiene 5 kg equivale a 5
              kg por unidad de venta.
            </p>
            <fieldset className="menu-fields" disabled={!writable || busy}>
              <label>
                Producto comercial
                <select
                  required
                  value={productId}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {c.products
                    .filter((p) => p.data.active || p.id === productId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {String(p.data.sku)} · {String(p.data.name)} · Venta en{" "}
                        {ml(p.data.unit)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cantidad en {ml(record.data.unit)} por unidad de venta
                <input
                  required
                  type="number"
                  min="0.000001"
                  max="1000000"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <label>
                Referencia del formato o ficha técnica
                <input
                  required
                  maxLength={4000}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>
              {writable && (
                <button className="primary">Guardar equivalencia</button>
              )}
            </fieldset>
          </form>
        )}
      </section>
    </>
  );
}
function RecipeEditor({
  c,
  record,
  company,
  writable,
  changed,
}: {
  c: MenuCatalog;
  record?: RecordRow;
  company: string;
  writable: boolean;
  changed: () => void;
}) {
  const nav = useNavigate(),
    [form, setForm] = useState(recipeForm(record)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Back section="recipes" company={company} />
      <section className="panel master-form">
        <h2>
          {record ? `Receta · versión ${record.data.revision}` : "Nueva receta"}
        </h2>
        <p>
          Cada guardado crea una versión. Los menús conservarán la versión
          elegida, aunque después se modifique esta receta.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const d = await request<{ record: RecordRow }>(
                "/recipes" + (record ? "/" + record.id : ""),
                company,
                record ? "PUT" : "POST",
                { ...form, ...(record ? { version: record.version } : {}) },
              );
              if (record) changed();
              else nav(menuURL("recipes", d.record.id, company));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="menu-fields" disabled={!writable || busy}>
            <div className="row g-3">
              <label className="col-md-6">
                Nombre
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="col-md-6">
                Cliente
                <select
                  value={form.clientId ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, clientId: e.target.value || null })
                  }
                >
                  <option value="">Receta compartida</option>
                  {c.clients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.data.name)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Raciones del lote de receta
              <input
                required
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={form.yieldServings}
                onChange={(e) =>
                  setForm({ ...form, yieldServings: Number(e.target.value) })
                }
              />
            </label>
            <h3>Ingredientes del lote completo</h3>
            {form.items.lines.map((l, i) => (
              <div className="row g-3 mt-small" key={i}>
                <label className="col-md-7">
                  Ingrediente
                  <select
                    required
                    value={l.ingredientId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        items: {
                          lines: form.items.lines.map((x, j) =>
                            i === j
                              ? { ...x, ingredientId: e.target.value }
                              : x,
                          ),
                        },
                      })
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {c.menuIngredients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.data.name)} · {ml(r.data.unit)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-md-3">
                  Cantidad
                  <input
                    required
                    type="number"
                    min="0.000001"
                    max="1000000"
                    step="any"
                    value={l.quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        items: {
                          lines: form.items.lines.map((x, j) =>
                            i === j
                              ? { ...x, quantity: Number(e.target.value) }
                              : x,
                          ),
                        },
                      })
                    }
                  />
                </label>
                <div className="col-md-2">
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() =>
                      setForm({
                        ...form,
                        items: {
                          lines: form.items.lines.filter((_, j) => i !== j),
                        },
                      })
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            {writable && (
              <button
                type="button"
                className="secondary mt"
                onClick={() =>
                  setForm({
                    ...form,
                    items: {
                      lines: [
                        ...form.items.lines,
                        { ingredientId: "", quantity: 1 },
                      ],
                    },
                  })
                }
              >
                Añadir ingrediente
              </button>
            )}
            <label className="mt">
              Elaboración
              <textarea
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Activa
            </label>
            {writable && (
              <button className="primary">Guardar nueva versión</button>
            )}
          </fieldset>
        </form>
        {record && (
          <details className="mt">
            <summary>Versiones guardadas</summary>
            <ul>
              {c.recipeVersions
                .filter((v) => v.data.recipeId === record.id)
                .map((v) => (
                  <li key={v.id}>
                    Versión {String(v.data.revision)} ·{" "}
                    {String((v.data.snapshot as { name: string }).name)} ·{" "}
                    {String(v.data.createdAt)}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
function PlanEditor({
  c,
  record,
  company,
  permissions,
  changed,
}: {
  c: MenuCatalog;
  record?: RecordRow;
  company: string;
  permissions: MenuPermissions;
  changed: () => void;
}) {
  const nav = useNavigate(),
    [form, setForm] = useState(planForm(record)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [forecast, setForecast] = useState<Forecast | null>(null),
    [evidence, setEvidence] = useState(""),
    [mockDiet, setMockDiet] = useState(c.diets[0]?.id ?? ""),
    [orderLinks, setOrderLinks] = useState<RecordRow[]>([]);
  const state = String(record?.data.state ?? "DRAFT"),
    immutable = ["PUBLISHED", "ARCHIVED"].includes(state),
    editable = permissions.write && !immutable,
    dirty = JSON.stringify(form) !== JSON.stringify(planForm(record));
  useEffect(() => {
    if (record)
      request<Forecast>("/menus/" + record.id + "/forecast", company)
        .then(setForecast)
        .catch((e) => setError(e.message));
  }, [company, record]);
  function patch(p: Partial<PlanForm>) {
    setForm((f) => ({ ...f, ...p }));
  }
  async function act(action: string, extra = {}) {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      const r = await request<{ record: RecordRow }>(
        "/menus/" + record.id + "/" + action,
        company,
        "POST",
        { version: record.version, ...extra },
      );
      if (action === "copy") nav(menuURL("", r.record.id, company));
      else changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const recipeOptions = c.recipeVersions.filter((v) => {
    const s = v.data.snapshot as { clientId?: string };
    return !s.clientId || s.clientId === form.clientId;
  });
  return (
    <>
      <Back section="" company={company} />
      <section className="panel master-form">
        <div className="section-heading">
          <h2>{record ? String(record.data.name) : "Nueva planificación"}</h2>
          <span className="pill">
            {ml(state)} · revisión {String(record?.data.revision ?? 1)}
          </span>
        </div>
        <p>
          Un menú del cliente puede aplicarse a varios centros. Las excepciones
          de un centro sustituyen la misma fecha, dieta y posición del menú
          común.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <MenuCalendar
          form={form}
          c={c}
          disabled={!editable || busy}
          onChange={patch}
        />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const d = await request<{ record: RecordRow }>(
                "/menus" + (record ? "/" + record.id : ""),
                company,
                record ? "PUT" : "POST",
                { ...form, ...(record ? { version: record.version } : {}) },
              );
              if (record) changed();
              else nav(menuURL("", d.record.id, company));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="menu-fields" disabled={!editable || busy}>
            <div className="row g-3">
              <label className="col-md-6">
                Nombre
                <input
                  required
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label className="col-md-6">
                Cliente
                <select
                  required
                  value={form.clientId}
                  onChange={(e) =>
                    patch({
                      clientId: e.target.value,
                      centerIds: [],
                      schedule: { entries: [] },
                      counts: { overrides: [] },
                    })
                  }
                >
                  <option value="">Seleccionar…</option>
                  {c.clients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.data.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-md-4">
                Desde
                <input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => patch({ startDate: e.target.value })}
                />
              </label>
              <label className="col-md-4">
                Hasta
                <input
                  required
                  type="date"
                  value={form.endDate}
                  onChange={(e) => patch({ endDate: e.target.value })}
                />
              </label>
              <label className="col-md-4">
                Servicio
                <select
                  value={form.service}
                  onChange={(e) => patch({ service: e.target.value })}
                >
                  {["BREAKFAST", "LUNCH", "SNACK", "DINNER"].map((v) => (
                    <option value={v} key={v}>
                      {ml(v)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h3 className="mt">Centros del cliente</h3>
            {c.centers
              .filter((r) => r.data.clientId === form.clientId)
              .map((r) => (
                <label className="checkbox" key={r.id}>
                  <input
                    type="checkbox"
                    checked={form.centerIds.includes(r.id)}
                    onChange={(e) =>
                      patch({
                        centerIds: e.target.checked
                          ? [...form.centerIds, r.id]
                          : form.centerIds.filter((id) => id !== r.id),
                      })
                    }
                  />
                  {String(r.data.name)}
                </label>
              ))}
            <div className="row g-3 mt">
              <label className="col-md-4">
                Origen
                <select
                  value={form.origin}
                  onChange={(e) => patch({ origin: e.target.value })}
                >
                  {["MANUAL", "CLIENT_REFERENCE", "MOCK"].map((v) => (
                    <option key={v} value={v}>
                      {ml(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-md-5">
                Referencia del menú aportado
                <input
                  required={form.origin === "CLIENT_REFERENCE"}
                  value={form.sourceReference}
                  onChange={(e) => patch({ sourceReference: e.target.value })}
                />
              </label>
              <label className="col-md-3">
                Margen de previsión (%)
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="any"
                  value={form.marginPercent}
                  onChange={(e) =>
                    patch({ marginPercent: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <SupplyEditor
              form={form}
              c={c}
              disabled={!editable || busy}
              onChange={(supply) => patch({ supply })}
            />
            <h3 className="mt">Recetas del menú</h3>
            <p className="fine">
              Puedes trasladar aquí un menú existente. Cada posición utiliza una
              versión concreta de receta. Las cantidades se ajustan con los
              comensales de cada dieta y servicio.
            </p>
            {form.schedule.entries.map((entry, i) => (
              <article className="order-line mt" key={i}>
                <div className="row g-3">
                  <label className="col-md-4">
                    Fecha
                    <input
                      required
                      type="date"
                      min={form.startDate}
                      max={form.endDate}
                      value={entry.date}
                      onChange={(e) =>
                        patch({
                          schedule: {
                            entries: form.schedule.entries.map((x, j) =>
                              i === j ? { ...x, date: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="col-md-4">
                    Dieta
                    <select
                      required
                      value={entry.dietId}
                      onChange={(e) =>
                        patch({
                          schedule: {
                            entries: form.schedule.entries.map((x, j) =>
                              i === j ? { ...x, dietId: e.target.value } : x,
                            ),
                          },
                        })
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
                  <label className="col-md-4">
                    Posición
                    <select
                      value={entry.course}
                      onChange={(e) =>
                        patch({
                          schedule: {
                            entries: form.schedule.entries.map((x, j) =>
                              i === j ? { ...x, course: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    >
                      {["FIRST", "MAIN", "SIDE", "DESSERT", "DRINK"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {ml(v)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="col-md-8">
                    Receta y versión
                    <select
                      required
                      value={entry.recipeVersionId}
                      onChange={(e) =>
                        patch({
                          schedule: {
                            entries: form.schedule.entries.map((x, j) =>
                              i === j
                                ? { ...x, recipeVersionId: e.target.value }
                                : x,
                            ),
                          },
                        })
                      }
                    >
                      <option value="">Seleccionar…</option>
                      {recipeOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {String((r.data.snapshot as { name: string }).name)} ·
                          v{String(r.data.revision)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-md-4">
                    Aplicación
                    <select
                      value={entry.centerId ?? ""}
                      onChange={(e) =>
                        patch({
                          schedule: {
                            entries: form.schedule.entries.map((x, j) =>
                              i === j
                                ? { ...x, centerId: e.target.value || null }
                                : x,
                            ),
                          },
                        })
                      }
                    >
                      <option value="">Todos los centros del plan</option>
                      {form.centerIds.map((id) => (
                        <option key={id} value={id}>
                          {menuName(c, "centers", id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {editable && (
                  <button
                    type="button"
                    className="secondary danger mt"
                    onClick={() =>
                      patch({
                        schedule: {
                          entries: form.schedule.entries.filter(
                            (_, j) => j !== i,
                          ),
                        },
                      })
                    }
                  >
                    Quitar posición
                  </button>
                )}
              </article>
            ))}
            {editable && (
              <button
                type="button"
                className="secondary mt"
                onClick={() =>
                  patch({
                    schedule: {
                      entries: [
                        ...form.schedule.entries,
                        {
                          date: form.startDate,
                          dietId: "",
                          course: "MAIN",
                          recipeVersionId: "",
                          centerId: null,
                        },
                      ],
                    },
                  })
                }
              >
                Añadir receta al menú
              </button>
            )}
            <details className="mt">
              <summary>
                Ajustes de comensales por fecha ({form.counts.overrides.length})
              </summary>
              <p>
                Se utilizan los recuentos habituales de Comensales por centro.
                Un ajuste los sustituye para esa fecha y dieta. Usa cero para un
                día sin servicio. Cada persona debe pertenecer a una única dieta
                de planificación por servicio.
              </p>
              {form.counts.overrides.map((o, i) => (
                <div className="row g-3 mt" key={i}>
                  <label className="col-md-3">
                    Centro
                    <select
                      required
                      value={o.centerId}
                      onChange={(e) =>
                        patch({
                          counts: {
                            overrides: form.counts.overrides.map((x, j) =>
                              i === j ? { ...x, centerId: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    >
                      <option value="">Seleccionar…</option>
                      {form.centerIds.map((id) => (
                        <option key={id} value={id}>
                          {menuName(c, "centers", id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-md-3">
                    Fecha
                    <input
                      type="date"
                      required
                      min={form.startDate}
                      max={form.endDate}
                      value={o.date}
                      onChange={(e) =>
                        patch({
                          counts: {
                            overrides: form.counts.overrides.map((x, j) =>
                              i === j ? { ...x, date: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="col-md-3">
                    Dieta
                    <select
                      required
                      value={o.dietId}
                      onChange={(e) =>
                        patch({
                          counts: {
                            overrides: form.counts.overrides.map((x, j) =>
                              i === j ? { ...x, dietId: e.target.value } : x,
                            ),
                          },
                        })
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
                  <label className="col-md-3">
                    Comensales
                    <input
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step="1"
                      value={o.count}
                      onChange={(e) =>
                        patch({
                          counts: {
                            overrides: form.counts.overrides.map((x, j) =>
                              i === j
                                ? { ...x, count: Number(e.target.value) }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  {editable && (
                    <button
                      className="secondary danger"
                      type="button"
                      onClick={() =>
                        patch({
                          counts: {
                            overrides: form.counts.overrides.filter(
                              (_, j) => i !== j,
                            ),
                          },
                        })
                      }
                    >
                      Quitar ajuste
                    </button>
                  )}
                </div>
              ))}
              {editable && (
                <button
                  className="secondary mt"
                  type="button"
                  onClick={() =>
                    patch({
                      counts: {
                        overrides: [
                          ...form.counts.overrides,
                          {
                            centerId: form.centerIds[0] ?? "",
                            date: form.startDate,
                            dietId: "",
                            count: 0,
                          },
                        ],
                      },
                    })
                  }
                >
                  Añadir ajuste de comensales
                </button>
              )}
            </details>
            {editable && (
              <div className="form-actions">
                <span>
                  {dirty ? "Cambios sin guardar." : "Datos guardados."}
                </span>
                <button className="primary" disabled={busy}>
                  Guardar planificación
                </button>
              </div>
            )}
          </fieldset>
        </form>
        {record && (
          <>
            {editable && (
              <MenuImport
                record={record}
                c={c}
                company={company}
                disabled={busy || dirty}
                onChanged={changed}
              />
            )}
            <div className="actions mt">
              {permissions.write && (
                <button
                  className="secondary"
                  disabled={busy || dirty}
                  onClick={() => act("copy")}
                >
                  Crear copia / nueva revisión
                </button>
              )}
              {editable && !immutable && (
                <button
                  className="secondary"
                  disabled={busy || dirty}
                  onClick={() => act("review")}
                >
                  Enviar a revisión
                </button>
              )}
              {permissions.write && state === "PUBLISHED" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => act("archive")}
                >
                  Archivar
                </button>
              )}
            </div>
            {editable && !form.schedule.entries.length && (
              <details className="mt">
                <summary>Generar propuesta simulada</summary>
                <p>
                  Distribuye recetas existentes como platos principales. No
                  realiza cálculos nutricionales ni garantiza compatibilidad con
                  dietas.
                </p>
                <label>
                  Dieta de la propuesta
                  <select
                    value={mockDiet}
                    onChange={(e) => setMockDiet(e.target.value)}
                  >
                    {c.diets.map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.data.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary"
                  disabled={busy || dirty || !mockDiet}
                  onClick={() => act("mock", { dietId: mockDiet })}
                >
                  Generar propuesta de demostración
                </button>
              </details>
            )}
            <h3 className="mt">Revisión profesional</h3>
            <p>
              Nutrición y Calidad aprueban por separado los datos guardados.
              Cualquier cambio posterior requiere nueva revisión. La publicación
              se destinará al futuro frontend del cliente.
            </p>
            {["nutritionApproval", "qualityApproval"].map((key) => {
              const a = record.data[key] as {
                hash?: string;
                evidence?: string;
                at?: string;
              };
              return (
                <p key={key}>
                  {key === "nutritionApproval" ? "Nutrición" : "Calidad"}:{" "}
                  {a.hash === forecast?.hash
                    ? "Revisión actual aprobada"
                    : a.hash
                      ? "Aprobación anterior; requiere nueva revisión"
                      : "Pendiente"}
                  {a.evidence ? " · " + a.evidence : ""}
                </p>
              );
            })}
            {!immutable && ["IN_REVIEW", "APPROVED"].includes(state) && (
              <>
                <label>
                  Referencia de la revisión profesional
                  <input
                    value={evidence}
                    maxLength={4000}
                    onChange={(e) => setEvidence(e.target.value)}
                  />
                </label>
                <div className="actions">
                  {permissions.nutrition && (
                    <button
                      className="secondary"
                      disabled={busy || dirty || !evidence.trim()}
                      onClick={() => act("nutrition", { evidence })}
                    >
                      Aprobar como Nutrición
                    </button>
                  )}
                  {permissions.quality && (
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        dirty ||
                        !evidence.trim() ||
                        !!forecast?.issues.length
                      }
                      onClick={() => act("quality", { evidence })}
                    >
                      Aprobar como Calidad
                    </button>
                  )}
                  {permissions.write && (
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        dirty ||
                        !!forecast?.issues.length ||
                        !forecast ||
                        (record.data.nutritionApproval as { hash?: string })
                          .hash !== forecast.hash ||
                        (record.data.qualityApproval as { hash?: string })
                          .hash !== forecast.hash
                      }
                      onClick={() => act("publish")}
                    >
                      Publicar menú aprobado
                    </button>
                  )}
                </div>
              </>
            )}
            {forecast && (
              <>
                <ForecastView forecast={forecast} c={c} />
                <AdvancedForecast f={forecast} c={c} />
              </>
            )}
            {state === "PUBLISHED" && permissions.supply && (
              <button
                className="primary mt"
                disabled={busy || dirty}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await request<{ orders: RecordRow[] }>(
                      "/menus/" + record.id + "/purchase-drafts",
                      company,
                      "POST",
                      { version: record.version },
                    );
                    setOrderLinks(result.orders);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Crear / consultar propuestas de pedido en F2
              </button>
            )}
            {c.menuPurchaseLinks
              ?.filter((l) => l.data.planId === record.id)
              .map((l) => (
                <p key={l.id}>
                  <Link
                    to={
                      "/orders/" +
                      l.data.orderId +
                      "?" +
                      new URLSearchParams({ company })
                    }
                  >
                    Consultar propuesta de pedido vinculada
                  </Link>
                </p>
              ))}
            {orderLinks.map((o) => (
              <p key={o.id}>
                <Link
                  to={
                    "/orders/" + o.id + "?" + new URLSearchParams({ company })
                  }
                >
                  Revisar propuesta {String(o.data.number)}
                </Link>{" "}
                · Requiere revisión y aceptación del cliente
              </p>
            ))}
          </>
        )}
      </section>
    </>
  );
}
function ForecastView({
  forecast: f,
  c,
}: {
  forecast: Forecast;
  c: MenuCatalog;
}) {
  return (
    <section className="mt">
      <h3>
        Previsión de necesidades{" "}
        {f.frozen ? "· versión publicada conservada" : ""}
      </h3>
      <p>
        Calculada con los datos guardados. Las tablas siguientes muestran
        necesidades brutas; el abastecimiento revisado incorpora las existencias
        declaradas. No se reserva stock ni se envían pedidos automáticamente.
        Las compras se redondean por centro y fecha: cajas y unidades completas;
        kg y litros a tres decimales.
      </p>
      {f.frozen && (f.currentSourcesChanged || !!f.currentIssues?.length) && (
        <div className="alert">
          La versión publicada conserva sus datos históricos, pero los datos
          actuales requieren revisión antes de generar nuevos pedidos.
          <ul>
            {f.currentIssues?.map((i) => (
              <li key={i}>{ml(i)}</li>
            ))}
          </ul>
        </div>
      )}
      {f.issues.length > 0 && (
        <div className="alert">
          <strong>Pendiente de resolver antes de publicar</strong>
          <ul>
            {f.issues.map((i) => (
              <li key={i}>{ml(i)}</li>
            ))}
          </ul>
        </div>
      )}
      {f.warnings.map((w) => (
        <p key={w} className="fine">
          {ml(w)}
        </p>
      ))}
      <p>
        Coste orientativo:{" "}
        {f.estimatedCostCents === null
          ? "Faltan precios"
          : amount(f.estimatedCostCents)}
      </p>
      <details>
        <summary>Raciones por centro, fecha y dieta</summary>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Centro / fecha</th>
                <th>Dieta</th>
                <th>Receta</th>
                <th>Raciones</th>
              </tr>
            </thead>
            <tbody>
              {f.servings.map((r, i) => (
                <tr key={i}>
                  <td>
                    {menuName(c, "centers", r.centerId)} · {r.date}
                  </td>
                  <td>{menuName(c, "diets", r.dietId)}</td>
                  <td>
                    {r.recipeName} · {ml(r.course)}
                  </td>
                  <td>
                    {r.count} ·{" "}
                    {r.source === "DATE_OVERRIDE"
                      ? "Ajuste por fecha"
                      : "Previsión habitual"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h4 className="mt">Ingredientes necesarios</h4>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Centro / fecha</th>
              <th>Ingrediente</th>
              <th>Base</th>
              <th>Con margen</th>
            </tr>
          </thead>
          <tbody>
            {f.needs.map((r, i) => (
              <tr key={i}>
                <td>
                  {menuName(c, "centers", r.centerId)} · {r.date}
                </td>
                <td>{r.name}</td>
                <td>
                  {r.baseQuantity} {ml(r.unit)}
                </td>
                <td>
                  {r.withMargin} {ml(r.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="mt">Propuesta de abastecimiento</h4>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Centro / fecha</th>
              <th>Producto</th>
              <th>Compra propuesta</th>
              <th>Excedente por formato</th>
              <th>Coste orientativo</th>
            </tr>
          </thead>
          <tbody>
            {f.procurement.map((r, i) => (
              <tr key={i}>
                <td>
                  {menuName(c, "centers", r.centerId)} · {r.date}
                </td>
                <td>
                  {r.sku} · {r.productName}
                </td>
                <td>
                  {r.salesQuantity} {ml(r.salesUnit)}
                </td>
                <td>
                  {r.surplus} {ml(r.unit)}
                </td>
                <td>
                  {r.estimatedCostCents === null
                    ? "Sin precio"
                    : amount(r.estimatedCostCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
