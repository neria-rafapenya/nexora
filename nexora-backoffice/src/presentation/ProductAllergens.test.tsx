// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ProductAllergens, AllergenTags } from "./ProductAllergens";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const record = (id: string, data: Record<string, unknown>): RecordRow => ({
  id,
  version: 1,
  data,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});
const allergens = [
  record("milk", { code: "EU07", name: "Milk" }),
  record("soy", { code: "EU06", name: "Soybeans" }),
];
let host: HTMLDivElement, root: Root, links: RecordRow[];
beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  links = [
    record("link", {
      productId: "p1",
      allergenId: "milk",
      kind: "CONTAINS",
      source: "MOCK source",
      validated: false,
    }),
    record("other", {
      productId: "p2",
      allergenId: "soy",
      kind: "TRACES",
      source: "Other product",
      validated: false,
    }),
  ];
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(
    async (path, _company, method = "GET", body) => {
      if (path === "/masters/allergens") return { records: allergens } as never;
      if (method === "GET") return { records: links } as never;
      const data = (body as { data?: Record<string, unknown> })?.data;
      if (method === "POST") {
        const row = record("new-link", data!);
        links.push(row);
        return { record: row } as never;
      }
      if (method === "PUT") {
        links = links.map((r) => (r.id === "link" ? record(r.id, data!) : r));
        return { ok: true } as never;
      }
      if (method === "DELETE") {
        links = links.filter((r) => r.id !== "link");
        return { ok: true } as never;
      }
      throw new Error("Unexpected call");
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(props = { writable: true, canValidate: false }) {
  await act(async () =>
    root.render(
      <ProductAllergens
        productId="p1"
        companyId="company"
        {...props}
        onChanged={() => {}}
      />,
    ),
  );
}
function button(label: string) {
  const b = [...host.querySelectorAll("button")].find(
    (x) => x.textContent === label || x.getAttribute("aria-label") === label,
  );
  expect(b, label).toBeTruthy();
  return b!;
}
function inputValue(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  )!;
  const prototype =
    input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(
    new Event(input instanceof HTMLSelectElement ? "change" : "input", {
      bubbles: true,
    }),
  );
}
describe("Product allergen management", () => {
  it("shows only this product, translates names and supports read-only consultation", async () => {
    await render({ writable: false, canValidate: false });
    expect(host.textContent).toContain("Leche");
    expect(host.textContent).not.toContain("Other product");
    expect(host.textContent).not.toContain("Añadir alérgeno");
    expect(host.textContent).toContain("Pendiente de validación");
  });
  it("adds unvalidated associations for the current product and keeps API values English", async () => {
    await render();
    await act(async () => button("Añadir alérgeno").click());
    await act(async () => {
      inputValue("#product-allergen-id", "soy");
      inputValue("#product-allergen-kind", "TRACES");
      inputValue("#product-allergen-source", "  Demo reference  ");
    });
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(request).toHaveBeenCalledWith(
      "/masters/productAllergens",
      "company",
      "POST",
      {
        data: {
          productId: "p1",
          allergenId: "soy",
          kind: "TRACES",
          source: "Demo reference",
          validated: false,
        },
      },
    );
    expect(host.textContent).toContain("Trazas: Soja");
  });
  it("allows Quality to validate an existing association and preserves its version", async () => {
    await render({ writable: true, canValidate: true });
    await act(async () => button("Editar asociación de Leche").click());
    await act(async () =>
      host.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(request).toHaveBeenCalledWith(
      "/masters/productAllergens/link",
      "company",
      "PUT",
      {
        version: 1,
        data: {
          productId: "p1",
          allergenId: "milk",
          kind: "CONTAINS",
          source: "MOCK source",
          validated: true,
        },
      },
    );
  });
  it("asks before deleting only the association", async () => {
    await render();
    await act(async () => button("Eliminar asociación de Leche").click());
    expect(request).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "DELETE",
      expect.anything(),
    );
    await act(async () => button("Eliminar asociación").click());
    expect(request).toHaveBeenCalledWith(
      "/masters/productAllergens/link",
      "company",
      "DELETE",
      { version: 1 },
    );
    expect(host.textContent).toContain("Sin información registrada");
  });
  it("never interprets missing or failed information as allergen-free", async () => {
    await act(async () =>
      root.render(
        <AllergenTags
          productId="unknown"
          links={links}
          allergens={allergens}
        />,
      ),
    );
    expect(host.textContent).toBe("Sin información registrada");
    await act(async () =>
      root.render(
        <AllergenTags productId="p1" links={[]} allergens={[]} error />,
      ),
    );
    expect(host.textContent).toBe("Alérgenos no disponibles");
  });
});
