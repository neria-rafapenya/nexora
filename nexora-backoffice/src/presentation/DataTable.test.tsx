// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { DataTable, compareCells } from "./DataTable";
let host: HTMLDivElement, root: Root;
function Location() {
  const l = useLocation(),
    nav = useNavigate();
  return (
    <>
      <output data-testid="url">{l.pathname + l.search}</output>
      <button type="button" onClick={() => nav(-1)}>
        Atrás navegador
      </button>
    </>
  );
}
const records = Array.from({ length: 1000 }, (_, i) => ({
  id: "r" + i,
  name: "Registro " + String(i).padStart(4, "0"),
  price: i + 0.5,
  date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
}));
function Grid({
  id = "products",
  primary = true,
}: {
  id?: string;
  primary?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  return (
    <>
      <input
        aria-label={"Buscar " + id}
        value={q}
        onChange={(e) =>
          setParams(
            (old) => {
              const next = new URLSearchParams(old);
              next.set("q", e.target.value);
              next.set("page", "1");
              return next;
            },
            { replace: true },
          )
        }
      />
      <DataTable id={id} primary={primary} filterKey={q}>
        <thead>
          <tr>
            <th data-column-id="name">Nombre</th>
            <th data-column-id="price">Precio</th>
            <th data-column-id="created">Creación</th>
            <th>Seleccionar</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {records
            .filter((r) => r.name.includes(q))
            .map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.price}</td>
                <td>
                  <time dateTime={r.date}>
                    {new Date(r.date).toLocaleDateString("es-ES")}
                  </time>
                </td>
                <td>
                  <input aria-label={"Seleccionar " + r.id} type="checkbox" />
                </td>
                <td>
                  <button type="button" onClick={() => {}}>
                    Editar {r.id}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </DataTable>
    </>
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
async function render(url = "/products", two = false) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Location />
        {two ? (
          <>
            <Grid id="one" primary={false} />
            <Grid id="two" primary={false} />
          </>
        ) : (
          <Grid />
        )}
      </MemoryRouter>,
    ),
  );
}
function url() {
  return host.querySelector("[data-testid=url]")!.textContent!;
}
async function click(label: string) {
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click(),
  );
}
async function input(label: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("paginates all rows, restores page/sort from URL and follows browser back", async () => {
  await render("/products?company=c&page=35&sort=name&dir=asc");
  expect(host.querySelector("tbody tr")!.textContent).toContain(
    "Registro 0850",
  );
  expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
  await click("Página siguiente de products");
  expect(url()).toContain("page=36");
  expect(url()).toContain("sort=name");
  expect(url()).toContain("company=c");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Atrás navegador")!
      .click(),
  );
  expect(url()).toContain("page=35");
  expect(host.querySelector("tbody tr")!.textContent).toContain(
    "Registro 0850",
  );
});
it("sorts globally before pagination and compares numeric values and dates correctly", async () => {
  await render("/products?page=35");
  await click("Ordenar por Precio");
  expect(url()).toContain("sort=price");
  expect(url()).toContain("page=1");
  await click("Ordenar por Precio");
  expect(url()).toContain("dir=desc");
  expect(host.querySelector("tbody tr")!.textContent).toContain(
    "Registro 0999",
  );
  await click("Ordenar por Creación");
  expect(host.querySelector("tbody tr")!.textContent).toContain(
    "Registro 0000",
  );
  expect(compareCells("2,50 €", "10,00 €")).toBeLessThan(0);
  expect(compareCells("2.5", "10")).toBeLessThan(0);
  expect(compareCells("1.234,50 €", "200,00 €")).toBeGreaterThan(0);
  expect(compareCells("31/12/2025", "1/1/2026")).toBeLessThan(0);
});
it("finds a record outside the current page, resets to page one and preserves the active sort", async () => {
  await render("/products?page=35&sort=price&dir=desc");
  await input("Buscar products", "Registro 0999");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.querySelector("tbody")!.textContent).toContain("Registro 0999");
  expect(url()).toContain("page=1");
  expect(url()).toContain("sort=price");
  expect(url()).toContain("dir=desc");
  expect(host.textContent).toContain("1–1 de 1");
});
it("resizes columns with mouse/keyboard and restores widths; action and checkbox columns have no controls", async () => {
  await render();
  const headers = [...host.querySelectorAll("thead th")];
  expect(headers[3].querySelector("[role=separator]")).toBeNull();
  expect(headers[4].querySelector("[role=separator]")).toBeNull();
  expect(headers[3].querySelector("button")).toBeNull();
  expect(headers[4].querySelector("button")).toBeNull();
  const handle = host.querySelector<HTMLElement>(
    '[aria-label="Ajustar ancho de Nombre"]',
  )!;
  await act(async () =>
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(handle.getAttribute("aria-valuenow")).toBe("206");
  await act(async () => {
    handle.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 100, bubbles: true }),
    );
  });
  await act(async () => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 160, bubbles: true }),
    );
  });
  await act(async () => {
    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 160, bubbles: true }),
    );
  });
  const width = Number(handle.getAttribute("aria-valuenow"));
  expect(width).toBeGreaterThan(206);
  expect(
    JSON.parse(window.localStorage.getItem("horekia-table-widths:products")!)
      .name,
  ).toBe(width);
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(
    host
      .querySelector('[aria-label="Ajustar ancho de Nombre"]')!
      .getAttribute("aria-valuenow"),
  ).toBe(String(width));
});
it("keeps multiple report tables independent in the same URL and preserves other parameters", async () => {
  await render("/report?company=c", true);
  await click("Página siguiente de one");
  await click("Página siguiente de two");
  expect(url()).toContain("one.page=2");
  expect(url()).toContain("two.page=2");
  expect(url()).toContain("company=c");
});
it("handles invalid browser preferences and out-of-range pages without losing sorting", async () => {
  window.localStorage.setItem("horekia-table-widths:products", "not-json");
  await render("/products?page=9999&sort=name&dir=desc");
  expect(url()).toContain("page=40");
  expect(url()).toContain("sort=name");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
});
it("page size persists in the URL and resets the page without changing the sort", async () => {
  await render("/products?page=3&sort=name&dir=asc");
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Filas por página de products"]',
  )!;
  await act(async () => {
    select.value = "100";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(url()).toContain("pageSize=100");
  expect(url()).toContain("page=1");
  expect(url()).toContain("sort=name");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(100);
});
