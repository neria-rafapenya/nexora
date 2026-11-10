// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Menus } from "./Menus";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import type { MenuPermissions } from "../application/menuModel";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const row = (id: string, data: Record<string, unknown>): RecordRow => ({
  id,
  data,
  version: 1,
  createdAt: "2026-11-10",
  updatedAt: "2026-11-10",
});
let host: HTMLDivElement, root: Root;
const plan = row("plan", {
  name: "Demo plan",
  clientId: "client",
  centerIds: ["center"],
  startDate: "2030-01-07",
  endDate: "2030-01-07",
  service: "LUNCH",
  origin: "MOCK",
  sourceReference: "Demo",
  marginPercent: 5,
  schedule: { entries: [] },
  counts: { overrides: [] },
  state: "IN_REVIEW",
  revision: 1,
  nutritionApproval: {},
  qualityApproval: {},
});
beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/menus/catalog")
      return {
        menuIngredients: [],
        ingredientProducts: [],
        recipes: [],
        recipeVersions: [],
        products: [],
        clients: [row("client", { name: "Client" })],
        centers: [row("center", { name: "Center", clientId: "client" })],
        diets: [],
      } as never;
    if (path === "/menus/plan")
      return { record: structuredClone(plan) } as never;
    if (path === "/menus/plan/forecast")
      return {
        hash: "current",
        issues: ["MISSING_TECHNICAL_INFORMATION"],
        warnings: [],
        estimatedCostCents: 0,
        needs: [],
        procurement: [],
        servings: [],
        frozen: false,
      } as never;
    return { records: [] } as never;
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(
  section = "",
  id: string | undefined = "plan",
  permissions: MenuPermissions = {
    read: true,
    write: true,
    nutrition: false,
    quality: false,
  },
  isNew = false,
) {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Menus
          companyId="workspace"
          section={section}
          recordId={id}
          isNew={isNew}
          permissions={permissions}
        />
      </MemoryRouter>,
    ),
  );
}
it("read-only consultation shows forecast and no write or approval controls", async () => {
  await render("", "plan", {
    read: true,
    write: false,
    nutrition: false,
    quality: false,
  });
  expect(host.textContent).toContain("Falta la composición");
  expect(host.textContent).not.toContain("Guardar planificación");
  expect(host.textContent).not.toContain("Aprobar como Calidad");
  expect(host.querySelector("fieldset")?.disabled).toBe(true);
});
it("administrator cannot impersonate Quality or Nutrition; publication stays blocked", async () => {
  await render();
  expect(host.textContent).not.toContain("Aprobar como Calidad");
  expect(host.textContent).not.toContain("Aprobar como Nutrición");
  const publish = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Publicar menú aprobado",
  );
  expect(publish?.disabled).toBe(true);
});
it("missing records show an error and never fall back to a create form", async () => {
  vi.mocked(request).mockRejectedValue(
    new Error("No se ha encontrado el registro."),
  );
  await render();
  expect(host.textContent).toContain("No se ha encontrado");
  expect(host.querySelector("form")).toBeNull();
});
it("ingredient forms use Spanish labels and send English database field keys", async () => {
  await render("ingredients", undefined, undefined, true);
  const input = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Rice");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.mocked(request).mockResolvedValue({
    record: row("ingredient", { name: "Rice" }),
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/menu-ingredients",
    "workspace",
    "POST",
    { name: "Rice", unit: "KG", active: true },
  );
});

it("menu import is explicit and stays disabled until a file and document reference exist", async () => {
  await render();
  expect(host.textContent).toContain("Importar menú del cliente");
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Validar y ver asociaciones",
  );
  expect(b?.disabled).toBe(true);
  expect(request).not.toHaveBeenCalledWith(
    expect.stringContaining("/import"),
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
});
it("the nutrition workspace is available without exposing specialist actions to administrators", async () => {
  await render("nutrition", undefined);
  expect(host.textContent).toContain("Perfiles nutricionales");
  expect(host.textContent).toContain("Reglas de dieta");
  expect(host.textContent).toContain("Revisión técnica");
  expect(host.textContent).not.toContain("Guardar y validar como Nutrición");
});

it("background data updates do not reload a menu editor or overwrite its unsaved name", async () => {
  const { refreshCompany } = await import("../infrastructure/query-cache");
  await render();
  const input = host.querySelector<HTMLInputElement>(
    'input[value="Demo plan"]',
  )!;
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Unsaved menu name");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const calls = vi.mocked(request).mock.calls.length;
  await act(async () => {
    refreshCompany("workspace");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  expect(input.value).toBe("Unsaved menu name");
  expect(vi.mocked(request).mock.calls).toHaveLength(calls);
});
