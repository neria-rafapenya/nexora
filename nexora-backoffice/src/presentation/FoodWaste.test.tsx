// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { FoodWaste } from "./FoodWaste";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const row = (id: string, data: Record<string, unknown>): RecordRow => ({
  id,
  data,
  version: 1,
  createdAt: "2026-11-10",
  updatedAt: "2026-11-10",
});
let host: HTMLDivElement, root: Root, event: RecordRow;
beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  event = row("event", {
    centerId: "center",
    date: "2020-01-01",
    service: "LUNCH",
    menuPlanId: null,
    dietId: "diet",
    sourceReference: "TEST measurement",
    notes: "TEST",
    isMock: true,
    sourceKind: "PRODUCT",
    productId: "product",
    recipeVersionId: null,
    reason: "OVERPRODUCTION",
    quantity: 2,
    unit: "KG",
    lot: "TEST-LOT",
    useBy: "2099-01-01",
    traceabilityReference: "TEST batch",
    destinationKind: "DONATION_CANDIDATE",
    destinationTarget: "Test recipient",
    state: "RECORDED",
    destinationState: "PENDING_QUALITY",
    estimatedCostCents: 500,
    qualityDecision: {},
    completion: {},
  });
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/food-waste/catalog")
      return {
        centers: [row("center", { name: "Center", clientId: "client" })],
        clients: [row("client", { name: "Client" })],
        products: [row("product", { name: "Rice", sku: "P1", unit: "KG" })],
        menuIngredients: [],
        ingredientProducts: [],
        recipes: [],
        recipeVersions: [],
        diets: [row("diet", { name: "Standard" })],
        centerDiners: [],
        menuPlans: [],
      } as never;
    if (path === "/food-waste/events/event")
      return { record: structuredClone(event) } as never;
    if (path.startsWith("/food-waste/report"))
      return {
        events: [],
        actuals: [],
        totals: {
          records: 0,
          estimatedCostCents: 0,
          unvalued: 0,
          produced: 0,
          served: 0,
          unserved: 0,
          unservedPercent: null,
        },
        quantities: [],
        causes: [],
        planningReferences: [],
        actions: [],
        containsMock: false,
      } as never;
    return { records: [] } as never;
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(
  write = true,
  quality = false,
  section = "events",
  id: string | null = "event",
  isNew = false,
) {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FoodWaste
          companyId="workspace"
          section={section}
          recordId={id ?? undefined}
          isNew={isNew}
          permissions={{ read: true, write, quality }}
        />
      </MemoryRouter>,
    ),
  );
}
it("read-only users see preserved measurements and no mutation controls", async () => {
  await render(false);
  expect(host.textContent).toContain("Valoración orientativa conservada");
  expect(host.textContent).not.toContain("Aprobar destino como Calidad");
  expect(host.textContent).not.toContain(
    "Anular registro conservando historial",
  );
  expect(host.querySelector("fieldset")?.disabled).toBe(true);
});
it("administrators cannot impersonate Quality or execute a pending donation", async () => {
  await render();
  expect(host.textContent).not.toContain("Aprobar destino como Calidad");
  expect(host.textContent).not.toContain("Registrar ejecución del destino");
  expect(host.textContent).toContain("Pendiente de Calidad");
});
it("Quality destination review requires confirmation and explicit evidence", async () => {
  await render(true, true);
  const approve = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Aprobar destino como Calidad",
  )!;
  expect(approve.disabled).toBe(true);
  const evidence = [...host.querySelectorAll("label")]
    .find((l) =>
      l.textContent?.includes("Referencia, motivo o evidencia de la acción"),
    )!
    .querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(evidence, "TEST review");
    evidence.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const checkbox = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("Confirmo la medición"))!
    .querySelector<HTMLInputElement>("input")!;
  await act(async () => checkbox.click());
  expect(approve.disabled).toBe(false);
  await act(async () => approve.click());
  expect(request).toHaveBeenCalledWith(
    "/food-waste/events/event/approve",
    "workspace",
    "POST",
    { version: 1, confirmed: true, evidence: "TEST review" },
  );
});
it("drafts are saved separately from confirmed observations and use English payload fields", async () => {
  event = {
    ...event,
    data: { ...event.data, state: "DRAFT", destinationState: "NOT_STARTED" },
  };
  await render();
  const confirm = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Confirmar registro de observación",
  )!;
  expect(confirm.disabled).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/food-waste/events/event",
    "workspace",
    "PUT",
    expect.objectContaining({
      version: 1,
      quantity: 2,
      unit: "KG",
      destinationKind: "DONATION_CANDIDATE",
      sourceKind: "PRODUCT",
    }),
  );
  expect(request).not.toHaveBeenCalledWith(
    "/food-waste/events/event/record",
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
});
it("dashboard distinguishes empty history and measured waste from unserved servings", async () => {
  await render(false, false, "", null);
  expect(host.textContent).toContain("Sin observaciones");
  expect(host.textContent).toContain("Raciones no servidas");
  expect(host.textContent).toContain("no sugerencias de IA");
});
it("missing waste records do not become create forms", async () => {
  vi.mocked(request).mockRejectedValue(
    new Error("No se ha encontrado el registro."),
  );
  await render();
  expect(host.textContent).toContain("No se ha encontrado");
  expect(host.querySelector("form")).toBeNull();
});
