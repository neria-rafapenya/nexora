import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import {
  allergenName,
  productAllergenRows,
  associationPayload,
} from "../application/productAllergens";
export function AllergenTags({
  productId,
  links,
  allergens,
  loading = false,
  error = false,
}: {
  productId: string;
  links: RecordRow[];
  allergens: RecordRow[];
  loading?: boolean;
  error?: boolean;
}) {
  if (loading) return <span className="fine">Cargando alérgenos…</span>;
  if (error)
    return <span className="allergen-unknown">Alérgenos no disponibles</span>;
  const rows = productAllergenRows(productId, links, allergens);
  if (!rows.length)
    return <span className="allergen-unknown">Sin información registrada</span>;
  return (
    <div className="allergen-tags">
      {rows.map(({ row, name, traces, validated }) => (
        <span
          key={row.id}
          className={"allergen-tag " + (traces ? "traces" : "contains")}
          title={
            validated
              ? "Validado por Calidad"
              : "Pendiente de validación por Calidad"
          }
        >
          {traces ? "Trazas: " : "Contiene: "}
          {name}
          {!validated && (
            <span aria-label="Pendiente de validación"> · Sin validar</span>
          )}
        </span>
      ))}
    </div>
  );
}
const blank = {
  allergenId: "",
  kind: "CONTAINS",
  source: "",
  validated: false,
};
export function ProductAllergens({
  productId,
  companyId,
  writable,
  canValidate,
  onChanged,
}: {
  productId: string;
  companyId: string;
  writable: boolean;
  canValidate: boolean;
  onChanged: () => void;
}) {
  const [links, setLinks] = useState<RecordRow[]>([]),
    [allergens, setAllergens] = useState<RecordRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState<RecordRow | null | undefined>(undefined),
    [form, setForm] = useState(blank),
    [deleting, setDeleting] = useState<RecordRow | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      request<{ records: RecordRow[] }>(
        `/masters/productAllergens?productId=${encodeURIComponent(productId)}`,
        companyId,
      ),
      request<{ records: RecordRow[] }>("/masters/allergens", companyId),
    ])
      .then(([l, a]) => {
        if (live) {
          setLinks(l.records.filter((r) => r.data.productId === productId));
          setAllergens(a.records);
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
  }, [productId, companyId, version]);
  function edit(row: RecordRow | null) {
    setEditing(row);
    setError("");
    setNotice("");
    setForm(
      row
        ? {
            allergenId: String(row.data.allergenId),
            kind: String(row.data.kind),
            source: String(row.data.source),
            validated: row.data.validated === true,
          }
        : blank,
    );
  }
  function changed() {
    setVersion((v) => v + 1);
    onChanged();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(
        "/masters/productAllergens" + (editing ? "/" + editing.id : ""),
        companyId,
        editing ? "PUT" : "POST",
        {
          data: associationPayload(productId, {
            ...form,
            validated: canValidate && form.validated,
          }),
          ...(editing ? { version: editing.version } : {}),
        },
      );
      setEditing(undefined);
      setNotice("Asociación de alérgeno guardada.");
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = productAllergenRows(productId, links, allergens);
  return (
    <section className="panel product-allergens">
      <div className="section-heading">
        <h2>Alérgenos del producto</h2>
        {writable && editing === undefined && (
          <button
            type="button"
            className="secondary"
            disabled={loading || !!error}
            onClick={() => edit(null)}
          >
            <Plus size={16} />
            Añadir alérgeno
          </button>
        )}
      </div>
      <p>
        Registra si contiene un alérgeno o puede contener trazas, su origen y la
        validación de Calidad. No tener asociaciones no significa que el
        producto esté libre de alérgenos.
      </p>
      <p className="fine">
        Los cambios de esta sección se guardan por separado de los datos
        generales del producto.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button
            type="button"
            className="secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            Reintentar
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Cargando alérgenos…</p>
      ) : (
        <>
          <AllergenTags
            productId={productId}
            links={links}
            allergens={allergens}
            error={!!error}
          />
          <div className="allergen-records">
            {rows.map(({ row, name, traces, validated }) => (
              <article key={row.id} className="allergen-record">
                <div>
                  <strong>{name}</strong>
                  <span className="pill">{traces ? "Trazas" : "Contiene"}</span>
                  <span className="fine">
                    {validated
                      ? "Validado por Calidad"
                      : "Pendiente de validación por Calidad"}
                  </span>
                  <p>Origen: {String(row.data.source)}</p>
                  {row.data.validatedAt ? (
                    <small>
                      Validado el{" "}
                      {new Date(String(row.data.validatedAt)).toLocaleString(
                        "es-ES",
                      )}
                    </small>
                  ) : null}
                </div>
                {writable && (!validated || canValidate) && (
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      aria-label={"Editar asociación de " + name}
                      onClick={() => edit(row)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      disabled={busy}
                      aria-label={"Eliminar asociación de " + name}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {editing !== undefined && (
        <form className="master-form allergen-editor" onSubmit={save}>
          <h3>{editing ? "Editar asociación" : "Añadir alérgeno"}</h3>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label htmlFor="product-allergen-id">Alérgeno</label>
              <select
                id="product-allergen-id"
                required
                value={form.allergenId}
                onChange={(e) =>
                  setForm({ ...form, allergenId: e.target.value })
                }
              >
                <option value="">Seleccionar…</option>
                {allergens
                  .filter(
                    (a) =>
                      a.id === editing?.data.allergenId ||
                      !links.some((l) => l.data.allergenId === a.id),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {allergenName(a)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="product-allergen-kind">Presencia</label>
              <select
                id="product-allergen-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="CONTAINS">Contiene</option>
                <option value="TRACES">Trazas</option>
              </select>
            </div>
            <div className="col-12">
              <label htmlFor="product-allergen-source">
                Documento o referencia de origen
              </label>
              <input
                id="product-allergen-source"
                required
                maxLength={4000}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
          </div>
          {canValidate ? (
            <label className="checkbox mt">
              <input
                type="checkbox"
                checked={form.validated}
                onChange={(e) =>
                  setForm({ ...form, validated: e.target.checked })
                }
              />
              <ShieldCheck size={16} />
              Confirmo la validación por Calidad
            </label>
          ) : (
            <p className="fine">
              La asociación quedará sin validar. Solo Calidad puede aprobarla.
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar alérgeno"}
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-allergen-title"
            className="panel dialog"
          >
            <h2 id="remove-allergen-title">¿Eliminar esta asociación?</h2>
            <p>
              Se eliminará únicamente el vínculo con este producto. El alérgeno
              seguirá en el catálogo de referencia.
            </p>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary danger-bg"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(
                      "/masters/productAllergens/" + deleting.id,
                      companyId,
                      "DELETE",
                      { version: deleting.version },
                    );
                    setDeleting(null);
                    setEditing(undefined);
                    setNotice("Asociación eliminada.");
                    changed();
                  } catch (e) {
                    setError((e as Error).message);
                    setDeleting(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Eliminar asociación
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
