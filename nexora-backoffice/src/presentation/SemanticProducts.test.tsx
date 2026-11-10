// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SemanticProducts } from "./SemanticProducts";
import { request } from "../infrastructure/api";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const status = {
  available: true,
  model: "gemini-embedding-001",
  total: 200,
  indexed: 200,
  pending: 0,
  usedToday: 10,
  maxDailyRequests: 50,
};
let host: HTMLDivElement, root: Root;
const results = vi.fn(),
  loading = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(request).mockReset();
  results.mockReset();
  loading.mockReset();
  vi.mocked(request).mockImplementation(async (path) =>
    path === "/product-search/status"
      ? status
      : { records: [{ id: "rice" }], pending: 0, cached: false },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(canIndex = true, familyId = "f", temperature = "FROZEN") {
  await act(async () =>
    root.render(
      <SemanticProducts
        companyId="t"
        familyId={familyId}
        temperature={temperature}
        canIndex={canIndex}
        onResults={results}
        onLoading={loading}
      />,
    ),
  );
}
async function query() {
  const input = host.querySelector(
    'input[aria-label="Descripción del producto"]',
  ) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "pescado congelado");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("uses explicit submission and consent, preserves filters and never calls provider while typing", async () => {
  await render();
  await query();
  expect(request).toHaveBeenCalledTimes(1);
  expect(host.querySelector("button")?.disabled).toBe(true);
  await act(async () =>
    host.querySelector<HTMLInputElement>("input[type=checkbox]")?.click(),
  );
  await act(async () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith("/product-search", "t", "POST", {
    q: "pescado congelado",
    familyId: "f",
    temperature: "FROZEN",
    demoConfirmed: true,
  });
  expect(results).toHaveBeenLastCalledWith([{ id: "rice" }]);
});
it("shows index maintenance only to administrators and disables unconfigured search", async () => {
  vi.mocked(request).mockResolvedValue({
    ...status,
    available: false,
    indexed: 0,
    pending: 200,
  });
  await render(false);
  expect(host.textContent).not.toContain("Actualizar índice");
  expect(host.querySelector("button")?.disabled).toBe(true);
  expect(host.textContent).toContain("pendiente de configuración");
});
it("discards old results and confirmation when filters change", async () => {
  await render();
  await act(async () =>
    host.querySelector<HTMLInputElement>("input[type=checkbox]")?.click(),
  );
  await render(true, "other", "AMBIENT");
  expect(
    host.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked,
  ).toBe(false);
  expect(results).toHaveBeenLastCalledWith([]);
});
it("shows provider limits without retrying or falling back to lexical results", async () => {
  await render();
  await query();
  await act(async () =>
    host.querySelector<HTMLInputElement>("input[type=checkbox]")?.click(),
  );
  vi.mocked(request).mockRejectedValue(new Error("Cuota agotada"));
  await act(async () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector("[role=alert]")?.textContent).toBe("Cuota agotada");
  expect(request).toHaveBeenCalledTimes(2);
  expect(results).toHaveBeenLastCalledWith([]);
});
