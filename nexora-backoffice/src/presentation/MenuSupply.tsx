import { DataTable } from "./DataTable";
import type {
  MenuCatalog,
  PlanForm,
  SupplySettings,
  Forecast,
} from "../application/menuModel";
import { menuName, ml, nutrientLabels } from "../application/menuModel";
import { amount, downloadOrder } from "../application/orderModel";
export function SupplyEditor({
  form,
  c,
  disabled,
  onChange,
}: {
  form: PlanForm;
  c: MenuCatalog;
  disabled: boolean;
  onChange: (s: SupplySettings) => void;
}) {
  const s = form.supply;
  function patch(p: Partial<SupplySettings>) {
    onChange({ ...s, ...p });
  }
  return (
    <details className="mt">
      <summary>Productos, entregas y existencias declaradas</summary>
      <p>
        Estos datos forman parte de la revisión del menú. Cambiar productos o
        formatos obliga a revisarlo de nuevo. Las existencias declaradas se
        descuentan de la previsión una sola vez, sin alterar ningún almacén.
      </p>
      <fieldset className="menu-fields" disabled={disabled}>
        <h4>Productos elegidos para este plan</h4>
        {s.overrides.map((o, i) => (
          <article className="order-line" key={i}>
            <label>
              Ingrediente
              <select
                value={o.ingredientId}
                onChange={(e) =>
                  patch({
                    overrides: s.overrides.map((x, j) =>
                      i === j ? { ...x, ingredientId: e.target.value } : x,
                    ),
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
            <label>
              Producto
              <select
                value={o.productId}
                onChange={(e) =>
                  patch({
                    overrides: s.overrides.map((x, j) =>
                      i === j ? { ...x, productId: e.target.value } : x,
                    ),
                  })
                }
              >
                <option value="">Seleccionar…</option>
                {c.products
                  .filter((p) => p.data.active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.data.name)} · venta en {ml(r.data.unit)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Cantidad de cocina por unidad de venta
              <input
                type="number"
                min="0.000001"
                step="any"
                value={o.quantityPerSalesUnit}
                onChange={(e) =>
                  patch({
                    overrides: s.overrides.map((x, j) =>
                      i === j
                        ? { ...x, quantityPerSalesUnit: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              Referencia del formato
              <input
                value={o.source}
                onChange={(e) =>
                  patch({
                    overrides: s.overrides.map((x, j) =>
                      i === j ? { ...x, source: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="secondary danger"
              onClick={() =>
                patch({ overrides: s.overrides.filter((_, j) => i !== j) })
              }
            >
              Quitar elección
            </button>
          </article>
        ))}
        <button
          type="button"
          className="secondary mt"
          onClick={() =>
            patch({
              overrides: [
                ...s.overrides,
                {
                  ingredientId: "",
                  productId: "",
                  quantityPerSalesUnit: 1,
                  source: "",
                },
              ],
            })
          }
        >
          Elegir otro producto para el plan
        </button>
        <h4 className="mt">Agrupar consumo por fecha de entrega</h4>
        {s.deliveries.map((o, i) => (
          <div className="row g-3" key={i}>
            <label className="col-md-4">
              Centro
              <select
                value={o.centerId}
                onChange={(e) =>
                  patch({
                    deliveries: s.deliveries.map((x, j) =>
                      i === j ? { ...x, centerId: e.target.value } : x,
                    ),
                  })
                }
              >
                {form.centerIds.map((id) => (
                  <option key={id} value={id}>
                    {menuName(c, "centers", id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-md-3">
              Fecha de consumo
              <input
                type="date"
                min={form.startDate}
                max={form.endDate}
                value={o.consumptionDate}
                onChange={(e) =>
                  patch({
                    deliveries: s.deliveries.map((x, j) =>
                      i === j ? { ...x, consumptionDate: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label className="col-md-3">
              Entrega prevista
              <input
                type="date"
                max={o.consumptionDate}
                value={o.deliveryDate}
                onChange={(e) =>
                  patch({
                    deliveries: s.deliveries.map((x, j) =>
                      i === j ? { ...x, deliveryDate: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <div className="col-md-2">
              <button
                type="button"
                className="secondary danger"
                onClick={() =>
                  patch({ deliveries: s.deliveries.filter((_, j) => i !== j) })
                }
              >
                Quitar entrega
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="secondary mt"
          onClick={() =>
            patch({
              deliveries: [
                ...s.deliveries,
                {
                  centerId: form.centerIds[0] ?? "",
                  consumptionDate: form.startDate,
                  deliveryDate: form.startDate,
                },
              ],
            })
          }
        >
          Ajustar fecha de entrega
        </button>
        <h4 className="mt">Existencias disponibles al inicio del plan</h4>
        {s.inventory.map((o, i) => (
          <article className="order-line" key={i}>
            <label>
              Centro
              <select
                value={o.centerId}
                onChange={(e) =>
                  patch({
                    inventory: s.inventory.map((x, j) =>
                      i === j ? { ...x, centerId: e.target.value } : x,
                    ),
                  })
                }
              >
                {form.centerIds.map((id) => (
                  <option key={id} value={id}>
                    {menuName(c, "centers", id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ingrediente
              <select
                value={o.ingredientId}
                onChange={(e) =>
                  patch({
                    inventory: s.inventory.map((x, j) =>
                      i === j ? { ...x, ingredientId: e.target.value } : x,
                    ),
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
            <label>
              Cantidad de cocina disponible
              <input
                type="number"
                min="0"
                step="any"
                value={o.quantity}
                onChange={(e) =>
                  patch({
                    inventory: s.inventory.map((x, j) =>
                      i === j ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              Referencia del recuento
              <input
                value={o.source}
                onChange={(e) =>
                  patch({
                    inventory: s.inventory.map((x, j) =>
                      i === j ? { ...x, source: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="secondary danger"
              onClick={() =>
                patch({ inventory: s.inventory.filter((_, j) => i !== j) })
              }
            >
              Quitar existencia
            </button>
          </article>
        ))}
        <button
          type="button"
          className="secondary mt"
          onClick={() =>
            patch({
              inventory: [
                ...s.inventory,
                {
                  centerId: form.centerIds[0] ?? "",
                  ingredientId: "",
                  quantity: 0,
                  source: "",
                },
              ],
            })
          }
        >
          Declarar existencias
        </button>
      </fieldset>
    </details>
  );
}
export function AdvancedForecast({ f, c }: { f: Forecast; c: MenuCatalog }) {
  return (
    <section className="mt">
      {f.isMock && (
        <p className="pill">DEMOSTRACIÓN · CONTIENE DATOS FICTICIOS</p>
      )}
      <h3>Nutrición por ración y servicio</h3>
      <p>
        Se suman los platos de cada fecha y dieta. Los límites proceden de la
        configuración revisada por Nutrición; la herramienta no determina por sí
        sola la idoneidad clínica ni las condiciones de elaboración.
      </p>
      <div className="table-responsive">
        <DataTable id="menu-nutrition-checks">
          <thead>
            <tr>
              <th>Centro / fecha / dieta</th>
              {Object.values(nutrientLabels).map((l) => (
                <th key={l}>{l}</th>
              ))}
              <th>Reglas</th>
            </tr>
          </thead>
          <tbody>
            {f.nutrition?.map((r, i) => (
              <tr key={i}>
                <td>
                  {menuName(c, "centers", r.centerId)} · {r.date} ·{" "}
                  {menuName(c, "diets", r.dietId)}
                </td>
                {Object.keys(nutrientLabels).map((n) => (
                  <td key={n}>
                    {r.complete ? r.perServing[n] : "Datos incompletos"}
                  </td>
                ))}
                <td>
                  {r.checks.map((k) => (
                    <p key={k.nutrient}>
                      {nutrientLabels[k.nutrient]}: {k.min ?? "—"} /{" "}
                      {k.max ?? "—"} · {k.passed ? "Cumple" : "Revisar"}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <h3 className="mt">Abastecimiento revisado por entrega</h3>
      <p>
        La propuesta incorpora el margen, las existencias declaradas y el
        redondeo de formatos. Su conversión a pedidos internos requiere una
        acción expresa de Operaciones.
      </p>
      <p>
        Coste de compra previsto:{" "}
        {f.estimatedPurchaseCostCents == null
          ? "Datos incompletos"
          : amount(f.estimatedPurchaseCostCents)}
      </p>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const cell = (v: unknown) =>
            '"' +
            String(v ?? "")
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"';
          const rows = [
            [
              "center_id",
              "delivery_date",
              "sku",
              "product",
              "gross_kitchen_quantity",
              "declared_stock_used",
              "net_kitchen_quantity",
              "kitchen_unit",
              "sales_quantity",
              "sales_unit",
            ],
            ...(f.purchases ?? []).map((r) => [
              r.centerId,
              r.deliveryDate,
              r.sku,
              r.productName,
              r.grossQuantity,
              r.declaredStockUsed,
              r.netQuantity,
              r.unit,
              r.salesQuantity,
              r.salesUnit,
            ]),
          ];
          downloadOrder({
            filename: "menu-procurement.csv",
            mime: "text/csv;charset=utf-8",
            content:
              "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
          });
        }}
      >
        Descargar previsión CSV
      </button>
      <div className="table-responsive">
        <DataTable id="menu-purchases">
          <thead>
            <tr>
              <th>Centro / entrega</th>
              <th>Producto</th>
              <th>Necesidad con margen</th>
              <th>Existencias usadas</th>
              <th>Necesidad neta</th>
              <th>Compra</th>
            </tr>
          </thead>
          <tbody>
            {f.purchases?.map((r, i) => (
              <tr key={i}>
                <td>
                  {menuName(c, "centers", r.centerId)} · {r.deliveryDate}
                </td>
                <td>
                  {r.sku} · {r.productName}
                </td>
                <td>
                  {r.grossQuantity} {ml(r.unit)}
                </td>
                <td>
                  {r.declaredStockUsed} {ml(r.unit)}
                </td>
                <td>
                  {r.netQuantity} {ml(r.unit)}
                </td>
                <td>
                  {r.salesQuantity} {ml(r.salesUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}
