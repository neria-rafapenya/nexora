import { DataTable } from "./DataTable";
import { useState } from "react";
import type { MenuCatalog, MenuPermissions } from "../application/menuModel";
import { nutrientLabels, ml } from "../application/menuModel";
import { request } from "../infrastructure/api";
export function MenuNutrition({
  c,
  company,
  permissions,
  changed,
}: {
  c: MenuCatalog;
  company: string;
  permissions: MenuPermissions;
  changed: () => void;
}) {
  const [tab, setTab] = useState("profile"),
    [selected, setSelected] = useState("");
  return (
    <section className="panel master-form">
      <h2>Nutrición, dietas y fichas técnicas</h2>
      <p>
        Valores documentados y reglas por ración y servicio. No se aplican
        objetivos clínicos por defecto. Nutrición valida perfiles y reglas;
        Calidad valida composición y alérgenos.
      </p>
      <div className="actions">
        {[
          ["profile", "Perfiles nutricionales"],
          ["rule", "Reglas de dieta"],
          ["technical", "Revisión técnica"],
        ].map(([v, l]) => (
          <button
            className={tab === v ? "primary" : "secondary"}
            key={v}
            onClick={() => {
              setTab(v);
              setSelected("");
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <label className="mt">
        {tab === "rule" ? "Dieta" : "Producto"}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Seleccionar…</option>
          {(tab === "rule" ? c.diets : c.products).map((r) => (
            <option key={r.id} value={r.id}>
              {String(r.data.name)}
            </option>
          ))}
        </select>
      </label>
      {selected &&
        (tab === "technical" ? (
          <Technical
            key={selected}
            c={c}
            id={selected}
            company={company}
            can={permissions.quality}
            changed={changed}
          />
        ) : (
          <NutritionForm
            key={tab + selected}
            c={c}
            id={selected}
            kind={tab}
            company={company}
            permissions={permissions}
            changed={changed}
          />
        ))}
    </section>
  );
}
function NutritionForm({
  c,
  id,
  kind,
  company,
  permissions,
  changed,
}: {
  c: MenuCatalog;
  id: string;
  kind: string;
  company: string;
  permissions: MenuPermissions;
  changed: () => void;
}) {
  const [service, setService] = useState("LUNCH");
  return (
    <>
      {kind === "rule" && (
        <label>
          Servicio
          <select value={service} onChange={(e) => setService(e.target.value)}>
            {["BREAKFAST", "LUNCH", "SNACK", "DINNER"].map((s) => (
              <option key={s} value={s}>
                {ml(s)}
              </option>
            ))}
          </select>
        </label>
      )}
      <NutritionValues
        key={service}
        c={c}
        id={id}
        kind={kind}
        service={service}
        company={company}
        permissions={permissions}
        changed={changed}
      />
    </>
  );
}
function NutritionValues({
  c,
  id,
  kind,
  service,
  company,
  permissions,
  changed,
}: {
  c: MenuCatalog;
  id: string;
  kind: string;
  service: string;
  company: string;
  permissions: MenuPermissions;
  changed: () => void;
}) {
  const row = (
      kind === "profile" ? c.nutritionProfiles : c.dietMenuRules
    )?.find((r) =>
      kind === "profile"
        ? r.data.productId === id
        : r.data.dietId === id && r.data.service === service,
    ),
    d = row?.data;
  const [values, setValues] = useState<Record<string, string>>(
      Object.fromEntries(
        Object.keys(nutrientLabels).map((n) => [
          n,
          String((d?.values as Record<string, number>)?.[n] ?? ""),
        ]),
      ),
    ),
    [limits, setLimits] = useState<
      Record<string, { min: string; max: string }>
    >(
      Object.fromEntries(
        Object.keys(nutrientLabels).map((n) => [
          n,
          {
            min: String(
              (d?.limits as Record<string, { min?: number }>)?.[n]?.min ?? "",
            ),
            max: String(
              (d?.limits as Record<string, { max?: number }>)?.[n]?.max ?? "",
            ),
          },
        ]),
      ),
    ),
    [foodGroups, setFoodGroups] = useState((d?.foodGroups ?? []) as string[]),
    [classified, setClassified] = useState(d?.classificationComplete === true),
    [source, setSource] = useState(String(d?.source ?? "")),
    [mock, setMock] = useState(
      d?.isMock === true ||
        c.products.find((p) => p.id === id)?.data.brand === "Nexora Sample",
    ),
    [basis, setBasis] = useState(String(d?.basis ?? "PER_100_G")),
    [excluded, setExcluded] = useState(
      (d?.excludedIngredientIds ?? []) as string[],
    ),
    [claims, setClaims] = useState((d?.requiredClaims ?? []) as string[]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const can = permissions.write;
  async function save(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const input = {
        source,
        isMock: mock,
        approve,
        ...(row ? { version: row.version } : {}),
        ...(kind === "profile"
          ? {
              productId: id,
              foodGroups,
              classificationComplete: classified,
              basis,
              values: Object.fromEntries(
                Object.entries(values).map(([k, v]) => [
                  k,
                  v === "" ? null : Number(v),
                ]),
              ),
            }
          : {
              dietId: id,
              service,
              limits: Object.fromEntries(
                Object.entries(limits)
                  .filter(([, v]) => v.min !== "" || v.max !== "")
                  .map(([k, v]) => [
                    k,
                    {
                      ...(v.min !== "" ? { min: Number(v.min) } : {}),
                      ...(v.max !== "" ? { max: Number(v.max) } : {}),
                    },
                  ]),
              ),
              excludedIngredientIds: excluded,
              requiredClaims: claims,
            }),
      };
      await request("/menus/nutrition", company, "POST", { kind, input });
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt">
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <p>
        {(d?.review as { hash?: string })?.hash
          ? "Datos revisados por Nutrición. Una modificación requerirá validarlos de nuevo."
          : "Validación de Nutrición pendiente."}
      </p>
      <fieldset className="menu-fields" disabled={!can || busy}>
        {kind === "profile" && (
          <label>
            Base de la ficha
            <select value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="PER_100_G">Por 100 g</option>
              <option value="PER_100_ML">Por 100 ml</option>
              <option value="PER_UNIT">
                Por unidad de cocina (pieza), no por caja
              </option>
            </select>
          </label>
        )}
        <div className="table-responsive">
          <DataTable id="menu-nutrients">
            <thead>
              <tr>
                <th>Nutriente</th>
                {kind === "profile" ? (
                  <th>Valor documentado</th>
                ) : (
                  <>
                    <th>Mínimo por ración</th>
                    <th>Máximo por ración</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(nutrientLabels).map(([n, label]) => (
                <tr key={n}>
                  <td>{label}</td>
                  {kind === "profile" ? (
                    <td>
                      <input
                        aria-label={label}
                        type="number"
                        min="0"
                        max="1000000"
                        step="any"
                        value={values[n]}
                        onChange={(e) =>
                          setValues({ ...values, [n]: e.target.value })
                        }
                      />
                    </td>
                  ) : (
                    ["min", "max"].map((bound) => (
                      <td key={bound}>
                        <input
                          aria-label={label + " " + bound}
                          type="number"
                          min="0"
                          max="1000000"
                          step="any"
                          value={limits[n][bound as "min" | "max"]}
                          onChange={(e) =>
                            setLimits({
                              ...limits,
                              [n]: { ...limits[n], [bound]: e.target.value },
                            })
                          }
                        />
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        {kind === "rule" && (
          <>
            <p>
              Los límites vacíos no se evalúan. La aprobación de Nutrición
              registra que esta configuración se ha revisado para el servicio
              indicado.
            </p>
            <label>
              Ingredientes excluidos
              <select
                multiple
                value={excluded}
                onChange={(e) =>
                  setExcluded([...e.target.selectedOptions].map((o) => o.value))
                }
              >
                {c.menuIngredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {String(i.data.name)}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["glutenFree", "Requiere declaración sin gluten"],
              [
                "pureedSuitable",
                "Requiere aptitud declarada para dieta triturada",
              ],
            ].map(([k, l]) => (
              <label className="checkbox" key={k}>
                <input
                  type="checkbox"
                  checked={claims.includes(k)}
                  onChange={(e) =>
                    setClaims(
                      e.target.checked
                        ? [...claims, k]
                        : claims.filter((c) => c !== k),
                    )
                  }
                />
                {l}
              </label>
            ))}
          </>
        )}
        {kind === "profile" && (
          <>
            <h4>Clasificación alimentaria documentada</h4>
            {[
              ["MEAT", "Contiene carne"],
              ["FISH", "Contiene pescado"],
              ["DAIRY", "Contiene lácteos"],
              ["EGG", "Contiene huevo"],
            ].map(([k, l]) => (
              <label className="checkbox" key={k}>
                <input
                  type="checkbox"
                  checked={foodGroups.includes(k)}
                  onChange={(e) =>
                    setFoodGroups(
                      e.target.checked
                        ? [...foodGroups, k]
                        : foodGroups.filter((x) => x !== k),
                    )
                  }
                />
                {l}
              </label>
            ))}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={classified}
                onChange={(e) => setClassified(e.target.checked)}
              />
              Clasificación completa según la documentación (incluida ausencia
              de estos grupos)
            </label>
          </>
        )}
        <label>
          Fuente / referencia documental
          <input
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
          Datos ficticios para demostración
        </label>
      </fieldset>
      <div className="actions">
        {can && (
          <button
            className="secondary"
            disabled={busy || !source.trim()}
            onClick={() => save(false)}
          >
            Guardar sin validar
          </button>
        )}
        {permissions.nutrition && (
          <button
            className="primary"
            disabled={busy || !source.trim()}
            onClick={() => save(true)}
          >
            Guardar y validar como Nutrición
          </button>
        )}
      </div>
    </div>
  );
}
function Technical({
  c,
  id,
  company,
  can,
  changed,
}: {
  c: MenuCatalog;
  id: string;
  company: string;
  can: boolean;
  changed: () => void;
}) {
  const p = c.products.find((p) => p.id === id)!,
    [documentVersionId, setDocumentVersion] = useState(""),
    [ingredients, setIngredients] = useState(String(p.data.ingredients ?? "")),
    [source, setSource] = useState(""),
    [mock, setMock] = useState(p.data.brand === "Nexora Sample"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const links = c.productAllergens.filter((a) => a.data.productId === id),
    pending = links.some((a) => !a.data.validated);
  return (
    <div className="mt">
      <p>
        Revisa composición, declaraciones y asociaciones de alérgenos. Un
        producto sin asociaciones no demuestra ausencia: la referencia
        documental debe respaldar la revisión.
      </p>
      <a href={"/products/" + id + "?" + new URLSearchParams({ company })}>
        Abrir ficha y alérgenos del producto
      </a>
      {pending && (
        <p className="alert">
          Primero valida las asociaciones de alérgenos desde su ficha.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <fieldset className="menu-fields" disabled={!can || busy}>
        <label>
          Documento aprobado vinculado (opcional)
          <select
            value={documentVersionId}
            onChange={(e) => {
              setDocumentVersion(e.target.value);
              const version = c.documentVersions?.find(
                (v) => v.id === e.target.value,
              );
              if (version) {
                const declarations = version.data.declarations as {
                  ingredients?: string;
                };
                if (declarations.ingredients)
                  setIngredients(declarations.ingredients);
                setSource(String(version.data.sourceReference ?? ""));
                if (version.data.isMock) setMock(true);
              }
            }}
          >
            <option value="">Referencia manual sin archivo vinculado</option>
            {(c.documentVersions ?? [])
              .filter(
                (v) =>
                  v.data.state === "APPROVED" &&
                  (c.supplierDocuments ?? []).some(
                    (d) =>
                      d.id === v.data.documentId &&
                      d.data.currentVersionId === v.id &&
                      (d.data.productIds as string[]).includes(id),
                  ),
              )
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {String(
                    (c.supplierDocuments ?? []).find(
                      (d) => d.id === v.data.documentId,
                    )?.data.title,
                  )}{" "}
                  · v{String(v.data.number)} · caducidad{" "}
                  {String(v.data.expiresAt ?? "no declarada")}
                </option>
              ))}
          </select>
        </label>
        <label>
          Composición documentada
          <textarea
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
        </label>
        <label>
          Fuente y referencia de la revisión de Calidad
          <input
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
          Datos ficticios para demostración
        </label>
      </fieldset>
      {can && (
        <button
          className="primary"
          disabled={busy || pending || !source.trim() || !ingredients.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await request("/menus/technical-review", company, "POST", {
                productId: id,
                productVersion: p.version,
                ...(documentVersionId ? { documentVersionId } : {}),
                ingredients,
                source,
                isMock: mock,
              });
              changed();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Registrar revisión de Calidad
        </button>
      )}
      <details className="mt">
        <summary>Historial técnico</summary>
        <ul>
          {c.productTechnicalReviews
            ?.filter((r) => r.data.productId === id)
            .map((r) => (
              <li key={r.id}>
                {String(r.data.reviewedAt)} · {String(r.data.source)}
                {r.data.isMock ? " · DEMOSTRACIÓN" : ""}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
