// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Orders } from "./Orders";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import type { OrderView } from "../application/orderModel";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const row = (
  id: string,
  data: Record<string, unknown>,
  version = 1,
): RecordRow => ({
  id,
  data,
  version,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});
let host: HTMLDivElement, root: Root, view: OrderView;
beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  view = {
    order: row(
      "order",
      {
        number: "NX-DEMO",
        state: "IN_REVIEW",
        clientId: "client",
        centerId: "center",
        deliveryDate: "2030-01-07",
        origin: "MOCK_MESSAGE",
        totalCents: 500,
      },
      3,
    ),
    lines: [
      row("line", {
        orderId: "order",
        productId: "product",
        quantity: 2,
        unit: "KG",
        originalText: "SKU-A | 2 | KG",
        confidence: 1,
        state: "MATCHED",
        reviewAccepted: false,
        unitPriceCents: 250,
        amountCents: 500,
      }),
    ],
    alerts: [],
    message: row("message", {
      sender: "demo@example.test",
      subject: "Demo source",
      body: "SKU-A | 2 | KG",
      state: "PROCESSED",
    }),
    attachments: [],
    run: null,
  };
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(
    async (path, _company, method = "GET", body) => {
      if (path === "/orders/catalog")
        return {
          products: [
            row("product", {
              name: "Demo rice",
              sku: "SKU-A",
              stock: 10,
              price: 2.5,
              unit: "KG",
              active: true,
            }),
            row("product-2", {
              name: "Demo pasta",
              sku: "SKU-B",
              stock: 12,
              price: 3,
              unit: "KG",
              active: true,
            }),
          ],
          clients: [row("client", { name: "Demo client", active: true })],
          centers: [row("center", { name: "Demo center", clientId: "client" })],
        } as never;
      if (path === "/orders/order" && method === "GET")
        return structuredClone(view) as never;
      if (path === "/orders/order" && method === "PUT") {
        const input = body as { lines: Array<{ reviewAccepted: boolean }> };
        view = {
          ...view,
          order: { ...view.order, version: 4 },
          lines: [
            {
              ...view.lines[0],
              version: 2,
              data: {
                ...view.lines[0].data,
                reviewAccepted: input.lines[0].reviewAccepted,
              },
            },
          ],
        };
        return structuredClone(view) as never;
      }
      if (path === "/orders/order/confirm") {
        view = {
          ...view,
          order: {
            ...view.order,
            version: 5,
            data: { ...view.order.data, state: "CONFIRMED" },
          },
        };
        return { record: view.order } as never;
      }
      if (path === "/order-inbox")
        return {
          records: [
            row("message", {
              channel: "EMAIL",
              sender: "demo@example.test",
              subject: "Demo source",
              state: "NEW",
              receivedAt: "2026-01-01",
            }),
          ],
        } as never;
      throw new Error("Unexpected request " + path);
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(
  write = true,
  section = "list",
  recordId: string | null = "order",
  isNew = false,
) {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Orders
          companyId="workspace"
          section={section}
          recordId={recordId ?? undefined}
          isNew={isNew}
          permissions={{ read: true, write }}
        />
      </MemoryRouter>,
    ),
  );
}
function button(text: string) {
  const element = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  expect(element, text).toBeTruthy();
  return element!;
}
it("requires saving reviewed lines and a separate human confirmation", async () => {
  await render();
  expect(host.textContent).toContain("Entrada original");
  expect(button("Confirmar pedido").disabled).toBe(true);
  await act(async () =>
    host.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
  );
  expect(button("Confirmar pedido").disabled).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/orders/order",
    "workspace",
    "PUT",
    expect.objectContaining({
      version: 3,
      lines: [
        expect.objectContaining({
          id: "line",
          reviewAccepted: true,
          quantity: 2,
        }),
      ],
    }),
  );
  expect(button("Confirmar pedido").disabled).toBe(false);
  await act(async () => button("Confirmar pedido").click());
  expect(host.querySelector("[role=dialog]")).toBeTruthy();
  expect(request).not.toHaveBeenCalledWith(
    "/orders/order/confirm",
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
  await act(async () => button("Confirmar acción").click());
  expect(request).toHaveBeenCalledWith(
    "/orders/order/confirm",
    "workspace",
    "POST",
    { version: 4 },
  );
  expect(host.textContent).toContain("Pedido confirmado");
});
it("read-only users can consult the source and lines but cannot confirm or edit", async () => {
  await render(false);
  expect(host.textContent).toContain("Demo source");
  expect(
    host.querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled,
  ).toBe(true);
  expect(host.textContent).not.toContain("Confirmar pedido");
  expect(host.textContent).not.toContain("Guardar revisión");
});
it("direct create routes remain restricted without write permissions", async () => {
  await render(false, "list", null, true);
  expect(host.textContent).toContain("No tienes permisos para crear pedidos");
  expect(host.querySelector("form")).toBeNull();
});
it("inbox records have deep links and clearly identify simulated channels", async () => {
  await render(true, "inbox", null);
  expect(host.textContent).toContain("IA SIMULADA");
  const link = [...host.querySelectorAll("a")].find(
    (a) => a.textContent === "Demo source",
  );
  expect(link?.getAttribute("href")).toBe(
    "/orders/inbox/message?company=workspace",
  );
});

it("the product search filters candidates without dropping the current selection", async () => {
  await render();
  const select = host.querySelector<HTMLSelectElement>("#product-line")!;
  const before = select.options.length;
  const input = host.querySelector<HTMLInputElement>("#search-line")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "no-such-product");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(select.options.length).toBeLessThan(before);
  expect(select.value).toBe("product");
});
