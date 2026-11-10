import { useDataRefresh } from "../infrastructure/useDataRefresh";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RecordRow } from "../domain/core";
import { request } from "../infrastructure/api";
import { nutrientLabels } from "../application/menuModel";
import {
  dl,
  documentURL,
  downloadDocument,
  type DocumentCatalog,
  type DocumentPermissions,
  type DocumentView,
  type DocumentListRow,
} from "../application/documentModel";
export function SupplierDocuments({
  companyId,
  recordId,
  isNew,
  permissions,
}: {
  companyId: string;
  recordId?: string;
  isNew: boolean;
  permissions: DocumentPermissions;
}) {
  const [c, setC] = useState<DocumentCatalog | null>(null),
    [rows, setRows] = useState<DocumentListRow[]>([]),
    [view, setView] = useState<DocumentView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const refreshTick = useDataRefresh(
    companyId,
    permissions.read && !recordId && !isNew,
  );
  const loadKey = JSON.stringify([
    companyId,
    recordId,
    isNew,
    "documents",
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
      setView(null);
      setC(null);
    }
    setError("");
    Promise.all([
      request<DocumentCatalog>("/supplier-documents/catalog", companyId),
      recordId
        ? request<DocumentView>("/supplier-documents/" + recordId, companyId)
        : request<{ records: DocumentListRow[] }>(
            "/supplier-documents",
            companyId,
          ),
    ])
      .then(([catalog, result]) => {
        if (!live) return;
        setC(catalog);
        if ("records" in result) setRows(result.records);
        else setView(result);
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
  }, [companyId, recordId, reload, permissions.read, refreshTick]);
  if (!permissions.read)
    return (
      <section className="panel">
        <h1>Acceso restringido</h1>
      </section>
    );
  const filtered = rows.filter(
    (r) =>
      (!status || status === "EXPIRY"
        ? status !== "EXPIRY" ||
          ["EXPIRING", "EXPIRED", "NOT_EFFECTIVE"].includes(r.status) ||
          ["EXPIRING", "EXPIRED", "NOT_EFFECTIVE"].includes(r.expiryState ?? "")
        : r.status === status) &&
      (!search ||
        [
          r.data.title,
          c?.suppliers.find((s) => s.id === r.data.supplierId)?.data.name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIONES · F4</span>
          <h1>Documentación de proveedores</h1>
          <p>
            Archivos privados, versiones y vigencia documental con revisión de
            Calidad.
          </p>
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">Cargando documentos…</p>
      ) : c && isNew ? (
        permissions.write ? (
          <NewDocument c={c} company={companyId} />
        ) : (
          <p>Acceso restringido</p>
        )
      ) : c && view ? (
        <DocumentDetail
          key={view.document.id + ":" + view.document.version}
          c={c}
          view={view}
          company={companyId}
          permissions={permissions}
          changed={() => setReload((x) => x + 1)}
        />
      ) : c && !recordId ? (
        <>
          <div className="section-heading">
            <h2>Documentos · {filtered.length}</h2>
            {permissions.write && (
              <Link className="primary" to={documentURL("new", companyId)}>
                Crear documento
              </Link>
            )}
          </div>
          <section className="panel list-panel">
            <div className="list-toolbar">
              <input
                aria-label="Buscar documentación"
                placeholder="Buscar título o proveedor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Estado documental"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="PENDING_REVIEW">Pendientes de Calidad</option>
                <option value="EXPIRY">Vigencias y caducidades</option>
                {["VALID", "EXPIRED", "REJECTED", "WITHDRAWN", "ARCHIVED"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {dl(s)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Proveedor / tipo</th>
                    <th>Estado</th>
                    <th>Versión vigente / última</th>
                    <th>Caducidad</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={documentURL(r.id, companyId)}>
                          {String(r.data.title)}
                        </Link>
                        {r.latest?.data.isMock ? (
                          <small className="block">DOCUMENTO FICTICIO</small>
                        ) : null}
                      </td>
                      <td>
                        {String(
                          c.suppliers.find((s) => s.id === r.data.supplierId)
                            ?.data.name,
                        )}
                        <small className="block">{dl(r.data.kind)}</small>
                      </td>
                      <td>
                        <span className="pill">{dl(r.status)}</span>
                        {r.expiryState &&
                          ["EXPIRED", "EXPIRING", "NOT_EFFECTIVE"].includes(
                            r.expiryState,
                          ) &&
                          r.expiryState !== r.status && (
                            <small className="block">{dl(r.expiryState)}</small>
                          )}
                      </td>
                      <td>
                        {String(r.current?.data.number ?? "—")} /{" "}
                        {String(r.latest?.data.number ?? "—")}
                      </td>
                      <td>
                        {String(
                          r.current?.data.expiresAt ??
                            r.latest?.data.expiresAt ??
                            "Sin fecha declarada",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <p className="empty-copy">No hay documentos en esta vista.</p>
              )}
            </div>
          </section>
          <p className="fine">
            Las alertas se calculan al consultar la documentación. Todavía no se
            envían correos ni notificaciones externas.
          </p>
        </>
      ) : null}
    </>
  );
}
function NewDocument({ c, company }: { c: DocumentCatalog; company: string }) {
  const nav = useNavigate(),
    [title, setTitle] = useState(""),
    [supplier, setSupplier] = useState(""),
    [kind, setKind] = useState("TECHNICAL_SHEET"),
    [products, setProducts] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Link className="secondary order-back" to={documentURL("", company)}>
        Volver al listado
      </Link>
      <section className="panel master-form">
        <h2>Nuevo documento</h2>
        <p>
          El proveedor, tipo y productos se conservan como identidad del
          documento. Cada actualización del archivo crea una versión
          independiente.
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
              const r = await request<{ record: RecordRow }>(
                "/supplier-documents",
                company,
                "POST",
                { title, supplierId: supplier, kind, productIds: products },
              );
              nav(documentURL(r.record.id, company));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="menu-fields" disabled={busy}>
            <label>
              Título
              <input
                required
                maxLength={4000}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Proveedor
              <select
                required
                value={supplier}
                onChange={(e) => {
                  setSupplier(e.target.value);
                  setProducts([]);
                }}
              >
                <option value="">Seleccionar…</option>
                {c.suppliers
                  .filter((s) => s.data.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.data.name)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tipo de documento
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {[
                  "TECHNICAL_SHEET",
                  "ALLERGEN_DECLARATION",
                  "CERTIFICATE",
                  "OTHER",
                ].map((k) => (
                  <option key={k} value={k}>
                    {dl(k)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Productos vinculados
              <select
                multiple
                value={products}
                onChange={(e) =>
                  setProducts([...e.target.selectedOptions].map((o) => o.value))
                }
              >
                {c.products
                  .filter((p) => p.data.supplierId === supplier)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.data.sku)} · {String(p.data.name)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary">Crear y añadir primera versión</button>
          </fieldset>
        </form>
      </section>
    </>
  );
}
function DocumentDetail({
  c,
  view,
  company,
  permissions,
  changed,
}: {
  c: DocumentCatalog;
  view: DocumentView;
  company: string;
  permissions: DocumentPermissions;
  changed: () => void;
}) {
  const doc = view.document,
    versions = [...view.versions].sort(
      (a, b) => Number(b.data.number) - Number(a.data.number),
    ),
    [selected, setSelected] = useState(versions[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [evidence, setEvidence] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reason, setReason] = useState("");
  const v = versions.find((v) => v.id === selected),
    previous = v
      ? versions.find(
          (x) => Number(x.data.number) === Number(v.data.number) - 1,
        )
      : null,
    file = view.files.find((f) => f.id === v?.data.fileId);
  async function decision(decision: string) {
    if (!v) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "/supplier-documents/" + doc.id + "/versions/" + v.id + "/review",
        company,
        "POST",
        {
          version: v.version,
          documentVersion: doc.version,
          decision,
          evidence,
          confirmed,
          changeHash: v.data.changeHash,
        },
      );
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="secondary order-back" to={documentURL("", company)}>
        Volver al listado
      </Link>
      <section className="panel master-form">
        <div className="section-heading">
          <h2>{String(doc.data.title)}</h2>
          <span className="pill">{dl(view.status)}</span>
        </div>
        <p>
          {String(
            c.suppliers.find((s) => s.id === doc.data.supplierId)?.data.name,
          )}{" "}
          · {dl(doc.data.kind)}
        </p>
        <p>
          Productos:{" "}
          {(doc.data.productIds as string[])
            .map((id) => String(c.products.find((p) => p.id === id)?.data.name))
            .join(", ") || "Documento general del proveedor"}
        </p>
        <p className="fine">
          La aprobación documental no modifica automáticamente la composición,
          los nutrientes ni los alérgenos de los productos. Las revisiones
          técnicas pueden referenciar una versión vigente desde F3.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {v ? (
          <>
            <label>
              Historial de versiones
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setConfirmed(false);
                  setEvidence("");
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Versión {String(v.data.number)} · {dl(v.data.state)}
                    {v.id === doc.data.currentVersionId
                      ? " · Seleccionada como vigente"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {v.validityState &&
              ["EXPIRED", "EXPIRING", "NOT_EFFECTIVE"].includes(
                v.validityState,
              ) && (
                <p className="alert">
                  Vigencia de esta versión: {dl(v.validityState)}
                </p>
              )}
            {v.data.isMock ? (
              <p className="pill">DOCUMENTO FICTICIO · SOLO DEMOSTRACIÓN</p>
            ) : null}
            <p>
              Archivo: {String(file?.data.filename ?? "—")} ·{" "}
              {String(file?.data.size ?? 0)} bytes
            </p>
            <p className="fine">
              SHA-256: {String(file?.data.checksum ?? "—")}
            </p>
            <p>
              Vigencia: {String(v.data.effectiveFrom ?? "Sin inicio declarado")}{" "}
              / {String(v.data.expiresAt ?? "Sin caducidad declarada")}
            </p>
            <p>Referencia: {String(v.data.sourceReference)}</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const f = await request<{
                    base64: string;
                    mime: string;
                    filename: string;
                  }>(
                    "/supplier-documents/" +
                      doc.id +
                      "/versions/" +
                      v.id +
                      "/download",
                    company,
                  );
                  downloadDocument(f);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Descargar original de esta versión
            </button>
            <h3 className="mt">Cambios respecto a la versión anterior</h3>
            <p>{(v.data.changes as string[]).map(dl).join(" · ")}</p>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Dato declarado</th>
                    <th>Versión anterior</th>
                    <th>Esta versión</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    "ingredients",
                    "contains",
                    "traces",
                    "allergensComplete",
                    "nutrition",
                    "nutritionBasis",
                    "glutenFree",
                    "pureedSuitable",
                  ].map((k) => (
                    <tr key={k}>
                      <td>
                        {
                          (
                            {
                              ingredients: "Composición",
                              contains: "Contiene",
                              traces: "Trazas",
                              allergensComplete:
                                "Declaración de alérgenos completa",
                              nutrition: "Información nutricional",
                              nutritionBasis: "Base nutricional",
                              glutenFree: "Declaración sin gluten",
                              pureedSuitable: "Aptitud para triturados",
                            } as Record<string, string>
                          )[k]
                        }
                      </td>
                      <td>
                        {declarationText(
                          (
                            previous?.data.declarations as Record<
                              string,
                              unknown
                            >
                          )?.[k],
                          k,
                          c,
                        )}
                      </td>
                      <td>
                        {declarationText(
                          (v.data.declarations as Record<string, unknown>)?.[k],
                          k,
                          c,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt">
              <summary>Texto extraído del documento</summary>
              <p className="document-extracted">
                {String(
                  v.data.extractedText ??
                    "Sin texto extraíble. Consulta el archivo original; no se ha aplicado OCR ni IA.",
                )}
              </p>
            </details>
            <details className="mt">
              <summary>Decisiones de Calidad</summary>
              {Object.entries(
                v.data.review as Record<
                  string,
                  { actorId: string; at: string; evidence: string }
                >,
              ).map(([k, r]) => (
                <p key={k}>
                  {
                    (
                      {
                        APPROVE: "Aprobación",
                        REJECT: "Rechazo",
                        WITHDRAW: "Retirada",
                      } as Record<string, string>
                    )[k]
                  }{" "}
                  · {r.at} · {r.evidence}
                </p>
              ))}
            </details>
            {permissions.quality &&
              !doc.data.archived &&
              ((v.id === doc.data.latestVersionId &&
                v.data.state === "PENDING_REVIEW") ||
                v.data.state === "APPROVED") && (
                <section className="mt">
                  <h3>Revisión de Calidad</h3>
                  <label>
                    Referencia y motivo de la decisión
                    <input
                      maxLength={4000}
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    He revisado el archivo, la vigencia y los cambios declarados
                    de esta versión.
                  </label>
                  <div className="actions">
                    {v.data.state === "PENDING_REVIEW" ? (
                      <>
                        <button
                          className="primary"
                          disabled={busy || !confirmed || !evidence.trim()}
                          onClick={() => decision("APPROVE")}
                        >
                          Aprobar esta versión
                        </button>
                        <button
                          className="secondary danger"
                          disabled={busy || !confirmed || !evidence.trim()}
                          onClick={() => decision("REJECT")}
                        >
                          Rechazar esta versión
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary danger"
                        disabled={busy || !confirmed || !evidence.trim()}
                        onClick={() => decision("WITHDRAW")}
                      >
                        Retirar aprobación de esta versión
                      </button>
                    )}
                  </div>
                </section>
              )}
          </>
        ) : (
          <p>
            No hay versiones. Añade el archivo original para iniciar la
            revisión.
          </p>
        )}
        {permissions.write && !doc.data.archived && (
          <UploadVersion
            key={doc.version}
            document={doc}
            c={c}
            company={company}
            changed={changed}
          />
        )}{" "}
        {permissions.write &&
          !doc.data.archived &&
          (!doc.data.currentVersionId || permissions.quality) && (
            <details className="mt">
              <summary>Archivar documento</summary>
              <p>
                Se conservarán sus archivos e historial. Dejará de ser
                utilizable como documentación vigente.
              </p>
              <label>
                Motivo
                <input
                  maxLength={4000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="secondary danger"
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(
                      "/supplier-documents/" + doc.id + "/archive",
                      company,
                      "POST",
                      { version: doc.version, reason },
                    );
                    changed();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Archivar conservando historial
              </button>
            </details>
          )}
      </section>
    </>
  );
}
function declarationText(
  value: unknown,
  key: string,
  c: DocumentCatalog,
): string {
  if (value === undefined || value === null) return "No declarado";
  if (Array.isArray(value))
    return value.length
      ? value
          .map((id) =>
            String(c.allergens.find((a) => a.id === id)?.data.name ?? id),
          )
          .join(", ")
      : "Sin categorías declaradas";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => (nutrientLabels[k] ?? k) + ": " + v)
      .join(" · ");
  if (key === "nutritionBasis")
    return (
      (
        {
          PER_100_G: "Por 100 g",
          PER_100_ML: "Por 100 ml",
          PER_UNIT: "Por unidad",
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  return String(value);
}
function UploadVersion({
  document: doc,
  c,
  company,
  changed,
}: {
  document: RecordRow;
  c: DocumentCatalog;
  company: string;
  changed: () => void;
}) {
  const [attachment, setAttachment] = useState<{
      filename: string;
      mime: string;
      base64: string;
    } | null>(null),
    [effectiveFrom, setEffective] = useState(""),
    [expiresAt, setExpiry] = useState(""),
    [source, setSource] = useState(""),
    [mock, setMock] = useState(
      String(
        c.suppliers.find((s) => s.id === doc.data.supplierId)?.data.name ?? "",
      ).startsWith("Demo "),
    ),
    [ingredients, setIngredients] = useState(""),
    [contains, setContains] = useState<string[]>([]),
    [traces, setTraces] = useState<string[]>([]),
    [complete, setComplete] = useState(false),
    [claims, setClaims] = useState<Record<string, string>>({
      glutenFree: "",
      pureedSuitable: "",
    }),
    [nutrition, setNutrition] = useState<Record<string, string>>({}),
    [basis, setBasis] = useState("PER_100_G"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const nutrientValues = Object.fromEntries(
      Object.entries(nutrition)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, Number(v)]),
    );
    try {
      await request(
        "/supplier-documents/" + doc.id + "/versions",
        company,
        "POST",
        {
          version: doc.version,
          attachment,
          effectiveFrom: effectiveFrom || null,
          expiresAt: expiresAt || null,
          sourceReference: source,
          isMock: mock,
          declarations: {
            ...(ingredients ? { ingredients } : {}),
            ...(complete || contains.length || traces.length
              ? { contains, traces, allergensComplete: complete }
              : {}),
            ...(Object.keys(nutrientValues).length
              ? { nutrition: nutrientValues, nutritionBasis: basis }
              : {}),
            ...Object.fromEntries(
              Object.entries(claims)
                .filter(([, v]) => v !== "")
                .map(([k, v]) => [k, v === "true"]),
            ),
          },
        },
      );
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt" open={!doc.data.latestVersionId}>
      <summary>Añadir nueva versión</summary>
      <p>
        El archivo se conserva sin sobrescribir los anteriores. Una
        actualización queda pendiente de Calidad y bloquea el uso técnico de la
        documentación vinculada hasta que se revise.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset className="menu-fields" disabled={busy}>
          <label>
            Archivo original · PDF, PNG, JPEG o TXT (máximo 1,5 MB)
            <input
              required
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setAttachment(null);
                setError("");
                if (!f) return;
                if (f.size > 1500000) {
                  setError("El archivo supera 1,5 MB.");
                  return;
                }
                let raw = "";
                for (const b of new Uint8Array(await f.arrayBuffer()))
                  raw += String.fromCharCode(b);
                setAttachment({
                  filename: f.name,
                  mime:
                    f.type ||
                    (f.name.toLowerCase().endsWith(".txt") ? "text/plain" : ""),
                  base64: btoa(raw),
                });
              }}
            />
          </label>
          <div className="row g-3">
            <label className="col-md-6">
              Válido desde
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffective(e.target.value)}
              />
            </label>
            <label className="col-md-6">
              Caducidad
              <input
                type="date"
                required={doc.data.kind === "CERTIFICATE"}
                value={expiresAt}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          </div>
          <label>
            Referencia del proveedor / documento
            <input
              required
              maxLength={4000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mock}
              onChange={(e) => setMock(e.target.checked)}
            />
            Documento ficticio para demostración
          </label>
          <details className="mt">
            <summary>Transcribir información declarada (opcional)</summary>
            <p>
              Los campos vacíos significan información no declarada. La
              transcripción no equivale a aprobación ni modifica la ficha de
              producto.
            </p>
            <label>
              Composición declarada
              <textarea
                maxLength={4000}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
              />
            </label>
            {[
              ["contains", "Contiene"],
              ["traces", "Trazas"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  multiple
                  value={key === "contains" ? contains : traces}
                  onChange={(e) =>
                    (key === "contains" ? setContains : setTraces)(
                      [...e.target.selectedOptions].map((o) => o.value),
                    )
                  }
                >
                  {c.allergens.map((a) => (
                    <option key={a.id} value={a.id}>
                      {String(a.data.name)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              El documento incluye una declaración completa de alérgenos y
              trazas.
            </label>
            {[
              ["glutenFree", "Declaración sin gluten"],
              ["pureedSuitable", "Aptitud declarada para triturados"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={claims[key]}
                  onChange={(e) =>
                    setClaims({ ...claims, [key]: e.target.value })
                  }
                >
                  <option value="">No declarado</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
            ))}
            <label>
              Base nutricional
              <select value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="PER_100_G">Por 100 g</option>
                <option value="PER_100_ML">Por 100 ml</option>
                <option value="PER_UNIT">Por unidad</option>
              </select>
            </label>
            <div className="row g-3">
              {Object.entries(nutrientLabels).map(([key, label]) => (
                <label className="col-md-3" key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="any"
                    value={nutrition[key] ?? ""}
                    onChange={(e) =>
                      setNutrition({ ...nutrition, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <button className="primary mt" disabled={!attachment}>
            Guardar versión pendiente de Calidad
          </button>
        </fieldset>
      </form>
    </details>
  );
}
