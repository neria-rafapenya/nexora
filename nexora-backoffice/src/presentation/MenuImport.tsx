import { useState } from "react";
import type { RecordRow } from "../domain/core";
import { request } from "../infrastructure/api";
import { downloadOrder } from "../application/orderModel";
import type { MenuCatalog } from "../application/menuModel";
interface Preview {
  rows: Array<{
    row: number;
    original: Record<string, string>;
    errors: string[];
    entry?: {
      recipeVersionId: string;
      dietId: string;
      centerId: string | null;
    };
  }>;
  canCommit: boolean;
  previewHash: string;
  validationError?: string;
}
const messages: Record<string, string> = {
  UNKNOWN_IMPORT_COLUMN: "Columna no reconocida",
  UNRESOLVED_DIET: "Selecciona la dieta",
  UNRESOLVED_CENTER: "Selecciona el centro",
  UNRESOLVED_RECIPE: "Selecciona receta y versión",
  INVALID_IMPORT_COURSE: "Posición no válida",
  INVALID_IMPORT_DATE: "Fecha no válida o fuera del plan",
  INVALID_IMPORT_SERVINGS:
    "Las raciones requieren un centro y un número entero",
  DUPLICATE_IMPORT_SLOT: "Posición duplicada",
  CONFLICTING_IMPORT_SERVINGS:
    "Recuentos contradictorios para la misma dieta y fecha",
};
export function MenuImport({
  record,
  c,
  company,
  disabled,
  onChanged,
}: {
  record: RecordRow;
  c: MenuCatalog;
  company: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [file, setFile] = useState<{ format: string; content: string } | null>(
      null,
    ),
    [mode, setMode] = useState("APPEND"),
    [source, setSource] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [resolutions, setResolutions] = useState<
      Array<{
        row: number;
        recipeVersionId?: string;
        dietId?: string;
        centerId?: string;
      }>
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function patch(row: number, field: string, value: string) {
    setResolutions((rs) => {
      const item = { ...rs.find((r) => r.row === row), row, [field]: value };
      if (!value) delete (item as Record<string, unknown>)[field];
      return [...rs.filter((r) => r.row !== row), item];
    });
    setPreview((p) => (p ? { ...p, canCommit: false } : p));
  }
  async function run(commit = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const p = await request<Preview>(
        "/menus/" + record.id + "/import",
        company,
        "POST",
        {
          ...file,
          version: record.version,
          mode,
          sourceReference: source,
          resolutions,
          commit,
          ...(commit ? { previewHash: preview?.previewHash } : {}),
        },
      );
      if (commit) {
        setPreview(null);
        onChanged();
      } else setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt">
      <summary>Importar menú del cliente · CSV / Excel</summary>
      <p>
        Fechas como texto AAAA-MM-DD. Dieta, receta y centro admiten nombre o
        identificador. Centro vacío aplica el menú común; las raciones solo se
        importan para un centro concreto. Revisa la asociación antes de guardar.
      </p>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          downloadOrder({
            filename: "menu-template.csv",
            mime: "text/csv;charset=utf-8",
            content: "date,diet,course,recipe,recipe_version,center,servings\n",
          })
        }
      >
        Descargar plantilla CSV
      </button>
      <label>
        Archivo
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={disabled || busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setPreview(null);
            setResolutions([]);
            if (!f) return;
            if (f.size > 2000000) {
              setError("El archivo supera 2 MB.");
              return;
            }
            if (f.name.toLowerCase().endsWith(".xlsx")) {
              const bytes = new Uint8Array(await f.arrayBuffer());
              let b = "";
              for (const x of bytes) b += String.fromCharCode(x);
              setFile({ format: "xlsx", content: btoa(b) });
            } else setFile({ format: "csv", content: await f.text() });
          }}
        />
      </label>
      <label>
        Referencia del documento
        <input
          disabled={disabled || busy}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
        />
      </label>
      <label>
        Modo
        <select
          disabled={disabled || busy}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setPreview(null);
          }}
        >
          <option value="APPEND">Añadir posiciones</option>
          <option value="REPLACE">Sustituir todos los platos del plan</option>
        </select>
      </label>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="secondary"
        disabled={disabled || busy || !file || !source.trim()}
        onClick={() => run()}
      >
        Validar y ver asociaciones
      </button>
      {preview && (
        <>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Datos originales</th>
                  <th>Asociaciones</th>
                  <th>Validación</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>
                      {r.original.date} · {r.original.diet} ·{" "}
                      {r.original.recipe}
                    </td>
                    <td>
                      {r.entry && (
                        <p>
                          Asociado:{" "}
                          {String(
                            (
                              c.recipeVersions.find(
                                (v) => v.id === r.entry?.recipeVersionId,
                              )?.data.snapshot as { name?: string }
                            )?.name ?? "—",
                          )}{" "}
                          · v
                          {String(
                            c.recipeVersions.find(
                              (v) => v.id === r.entry?.recipeVersionId,
                            )?.data.revision ?? "—",
                          )}{" "}
                          ·{" "}
                          {String(
                            c.diets.find((d) => d.id === r.entry?.dietId)?.data
                              .name ?? "—",
                          )}
                        </p>
                      )}
                      <label>
                        Receta
                        <select
                          value={
                            resolutions.find((x) => x.row === r.row)
                              ?.recipeVersionId ?? ""
                          }
                          onChange={(e) =>
                            patch(r.row, "recipeVersionId", e.target.value)
                          }
                        >
                          <option value="">Asociación automática</option>
                          {c.recipeVersions
                            .filter(
                              (v) =>
                                !(v.data.snapshot as { clientId?: string })
                                  .clientId ||
                                (v.data.snapshot as { clientId?: string })
                                  .clientId === record.data.clientId,
                            )
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {String(
                                  (v.data.snapshot as { name: string }).name,
                                )}{" "}
                                · v{String(v.data.revision)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Dieta
                        <select
                          value={
                            resolutions.find((x) => x.row === r.row)?.dietId ??
                            ""
                          }
                          onChange={(e) =>
                            patch(r.row, "dietId", e.target.value)
                          }
                        >
                          <option value="">Asociación automática</option>
                          {c.diets.map((d) => (
                            <option key={d.id} value={d.id}>
                              {String(d.data.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Centro
                        <select
                          value={
                            resolutions.find((x) => x.row === r.row)
                              ?.centerId ?? ""
                          }
                          onChange={(e) =>
                            patch(r.row, "centerId", e.target.value)
                          }
                        >
                          <option value="">Según archivo / común</option>
                          {c.centers
                            .filter((c) =>
                              (record.data.centerIds as string[]).includes(
                                c.id,
                              ),
                            )
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {String(d.data.name)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      {r.errors.length
                        ? r.errors.map((x) => messages[x] ?? x).join(" · ")
                        : "Validado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.validationError && (
            <p role="alert">{preview.validationError}</p>
          )}
          <button
            type="button"
            className="primary mt"
            disabled={disabled || busy || !preview.canCommit}
            onClick={() => run(true)}
          >
            {mode === "REPLACE"
              ? "Confirmar sustitución de platos"
              : "Confirmar importación"}
          </button>
        </>
      )}
    </details>
  );
}
