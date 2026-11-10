// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContactInbox, type ContactLead } from "./ContactInbox";
import { request } from "../infrastructure/api";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
vi.mock("../infrastructure/useDataRefresh", () => ({
  useDataRefresh: () => 0,
}));
let host: HTMLDivElement, root: Root, records: ContactLead[];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  records = [
    {
      id: "lead",
      version: 1,
      state: "NEW",
      createdAt: "2026-11-10T12:00:00Z",
      updatedAt: "2026-11-10T12:00:00Z",
      data: {
        name: "Example person",
        email: "test@example.invalid",
        company: "Example catering",
        phone: "",
        sector: "CATERING",
        message: "Please arrange a demo. <script>unsafe()</script>",
        privacyVersion: "2026-11-10",
        privacyAcknowledged: true,
      },
    },
  ];
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(
    async (_path, _company, method = "GET", body) => {
      if (method === "GET")
        return { records: structuredClone(records) } as never;
      if (method === "DELETE") records = [];
      else
        records[0] = {
          ...records[0],
          state: (body as { state: string }).state,
          version: 2,
        };
      return { ok: true } as never;
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ContactInbox companyId="workspace" />
      </MemoryRouter>,
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find(
        (b) =>
          b.textContent === label || b.getAttribute("aria-label") === label,
      )!
      .click(),
  );
}
it("shows the submitted content as safe text and updates state with optimistic version", async () => {
  await render();
  await click("Ver solicitud de Example catering");
  expect(host.textContent).toContain("<script>unsafe()</script>");
  expect(host.querySelector("script")).toBeNull();
  const select = host.querySelector<HTMLSelectElement>("form select")!;
  await act(async () => {
    select.value = "CONTACTED";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await click("Guardar estado");
  expect(request).toHaveBeenCalledWith("/contacts/lead", "workspace", "PUT", {
    version: 1,
    state: "CONTACTED",
  });
  expect(host.textContent).toContain("Contactada");
});
it("keeps stale details on conflicts and requires explicit confirmation before erasure", async () => {
  await render();
  await click("Ver solicitud de Example catering");
  const select = host.querySelector<HTMLSelectElement>("form select")!;
  await act(async () => {
    select.value = "ARCHIVED";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  vi.mocked(request).mockRejectedValueOnce(
    new Error("La solicitud ha cambiado."),
  );
  await click("Guardar estado");
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "ha cambiado",
  );
  expect(
    host.querySelector('[aria-label="Detalle de solicitud"]'),
  ).not.toBeNull();
  await click("Cerrar detalle");
  await click("Eliminar solicitud de Example catering");
  expect(vi.mocked(request).mock.calls.some((c) => c[2] === "DELETE")).toBe(
    false,
  );
  await click("Confirmar eliminación");
  expect(request).toHaveBeenCalledWith(
    "/contacts/lead",
    "workspace",
    "DELETE",
    { version: 1 },
  );
  expect(host.textContent).toContain("No hay solicitudes");
});
