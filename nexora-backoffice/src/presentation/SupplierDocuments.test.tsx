// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SupplierDocuments } from "./SupplierDocuments";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const row = (
  id: string,
  data: Record<string, unknown>,
  version = 1,
): RecordRow => ({
  id,
  data,
  version,
  createdAt: "2026-11-10",
  updatedAt: "2026-11-10",
});
let host: HTMLDivElement, root: Root;
const doc = row("doc", {
  title: "Demo Technical Sheet",
  supplierId: "supplier",
  productIds: ["product"],
  kind: "TECHNICAL_SHEET",
  latestVersionId: "v1",
  currentVersionId: null,
  archived: false,
});
const version = row("v1", {
  documentId: "doc",
  number: 1,
  fileId: "file",
  state: "PENDING_REVIEW",
  isMock: true,
  effectiveFrom: "2020-01-01",
  expiresAt: "2035-01-01",
  sourceReference: "MOCK SOURCE",
  changes: ["INITIAL"],
  changeHash: "hash",
  declarations: { ingredients: "Fictional composition" },
  review: {},
  extractedText: "MOCK document",
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
    if (path === "/supplier-documents/catalog")
      return {
        suppliers: [row("supplier", { name: "Demo Supplier", active: true })],
        products: [
          row("product", {
            name: "Demo Product",
            supplierId: "supplier",
            sku: "P1",
          }),
        ],
        allergens: [],
      } as never;
    if (path === "/supplier-documents/doc")
      return {
        document: doc,
        status: "PENDING_REVIEW",
        versions: [version],
        files: [
          row("file", {
            filename: "sample.txt",
            size: 100,
            checksum: "sha256",
          }),
        ],
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
  id: string | undefined = "doc",
  isNew = false,
) {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <SupplierDocuments
          companyId="workspace"
          recordId={id}
          isNew={isNew}
          permissions={{ read: true, write, quality }}
        />
      </MemoryRouter>,
    ),
  );
}
it("read-only users see versions and original download, without uploads or Quality decisions", async () => {
  await render(false);
  expect(host.textContent).toContain("DOCUMENTO FICTICIO");
  expect(host.textContent).toContain("Descargar original de esta versión");
  expect(host.textContent).not.toContain("Aprobar esta versión");
  expect(host.querySelector("input[type=file]")).toBeNull();
});
it("administrators can upload but cannot approve documentation", async () => {
  await render();
  expect(host.querySelector("input[type=file]")).toBeTruthy();
  expect(host.textContent).not.toContain("Aprobar esta versión");
});
it("Quality must confirm the exact changes and provide evidence before sending a review", async () => {
  await render(true, true);
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Aprobar esta versión",
  )!;
  expect(button.disabled).toBe(true);
  const source = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("Referencia y motivo de la decisión"))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(source, "TEST REVIEW");
    source.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const confirm = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("He revisado el archivo"))!
    .querySelector<HTMLInputElement>("input")!;
  await act(async () => confirm.click());
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(request).toHaveBeenCalledWith(
    "/supplier-documents/doc/versions/v1/review",
    "workspace",
    "POST",
    {
      version: 1,
      documentVersion: 1,
      decision: "APPROVE",
      changeHash: "hash",
      confirmed: true,
      evidence: "TEST REVIEW",
    },
  );
});
it("missing records never fall back to a create form", async () => {
  vi.mocked(request).mockRejectedValue(
    new Error("No se ha encontrado el registro."),
  );
  await render();
  expect(host.textContent).toContain("No se ha encontrado");
  expect(host.querySelector("form")).toBeNull();
});
it("creation uses English fields while labels remain Spanish", async () => {
  await render(true, false, undefined, true);
  const inputs = host.querySelectorAll("input"),
    selects = host.querySelectorAll("select");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(inputs[0], "Test document");
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    selects[0].value = "supplier";
    selects[0].dispatchEvent(new Event("change", { bubbles: true }));
  });
  const products = host.querySelector<HTMLSelectElement>("select[multiple]")!;
  await act(async () => {
    products.options[0].selected = true;
    products.dispatchEvent(new Event("change", { bubbles: true }));
  });
  vi.mocked(request).mockResolvedValue({ record: doc });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/supplier-documents",
    "workspace",
    "POST",
    {
      title: "Test document",
      supplierId: "supplier",
      kind: "TECHNICAL_SHEET",
      productIds: ["product"],
    },
  );
});

it("background updates preserve an unfinished Quality decision without reloading the document", async () => {
  const { refreshCompany } = await import("../infrastructure/query-cache");
  await render(true, true);
  const input = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("Referencia y motivo de la decisión"))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Unsaved quality evidence");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const calls = vi.mocked(request).mock.calls.length;
  await act(async () => {
    refreshCompany("workspace");
    window.dispatchEvent(new Event("focus"));
  });
  expect(input.value).toBe("Unsaved quality evidence");
  expect(vi.mocked(request).mock.calls).toHaveLength(calls);
});
