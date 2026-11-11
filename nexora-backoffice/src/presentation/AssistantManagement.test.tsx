// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AssistantManagement,
  type AssistantOverview,
} from "./AssistantManagement";
import { request } from "../infrastructure/api";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
const refresh = vi.hoisted(() => ({ value: 0 }));
vi.mock("../infrastructure/useDataRefresh", () => ({
  useDataRefresh: () => refresh.value,
}));
let host: HTMLDivElement, root: Root, data: AssistantOverview;
const now = "2026-11-10T12:00:00Z";
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  refresh.value = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  data = {
    config: {
      id: "workspace",
      version: 0,
      createdAt: null,
      updatedAt: null,
      data: {
        name: "Asistente Cuinora",
        state: "DRAFT",
        instructions: "Responde en español",
        fallback: "Falta información",
        sourceIds: ["catalog"],
        maxDailyRequests: 10,
        maxContextRecords: 20,
      },
    },
    knowledge: [],
    sources: [
      {
        id: "catalog",
        label: "Catálogo",
        description: "Descripción",
        status: "SEMANTIC_PRODUCTS",
      },
    ],
    policy: {
      readOnly: true,
      enforceUserPermissions: true,
      enforceCustomerScope: true,
      requireSources: true,
      allergenQualityWorkflow: true,
    },
    provider: {
      provider: "GEMINI",
      available: true,
      keyConfigured: true,
      model: "poc",
    },
    runtime: { available: false, reason: "Sin conexión al frontend" },
    activity: [],
  };
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(
    async (path, _company, method = "GET", body) => {
      if (method === "GET") return structuredClone(data) as never;
      if (path === "/assistant/config") {
        const b = body as { data: typeof data.config.data; version: number };
        data.config = {
          ...data.config,
          data: b.data,
          version: b.version + 1,
          createdAt: now,
          updatedAt: now,
        };
        return structuredClone(data.config) as never;
      }
      if (method === "DELETE") {
        data.knowledge = [];
        return { ok: true } as never;
      }
      const b = body as {
        data: AssistantOverview["knowledge"][number]["data"];
        version: number;
      };
      const record = {
        id: "article",
        data: b.data,
        version: b.version + 1,
        createdAt: now,
        updatedAt: now,
      };
      data.knowledge = [record];
      return record as never;
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
        <AssistantManagement companyId="workspace" />
      </MemoryRouter>,
    ),
  );
}
async function edit(label: string, value: string) {
  const node = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input,textarea,select",
    )!;
  await act(async () => {
    const proto =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : node instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function click(text: string) {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === text)!
      .click(),
  );
}
async function submit(label: string) {
  await act(async () =>
    host
      .querySelector(`form[aria-label="${label}"]`)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("shows management only, does not call Gemini or a chat API, and persists configuration with its version", async () => {
  await render();
  expect(host.textContent).toContain("Chat pendiente de conectar");
  expect(host.querySelector('[aria-label="Enviar mensaje"]')).toBeNull();
  await edit("Nombre del asistente", "Ayuda Cuinora");
  await submit("Configuración del asistente");
  expect(request).toHaveBeenCalledWith(
    "/assistant/config",
    "workspace",
    "PUT",
    expect.objectContaining({
      version: 0,
      data: expect.objectContaining({ name: "Ayuda Cuinora" }),
    }),
  );
  expect(host.textContent).toContain("Configuración del asistente guardada");
  expect(
    vi.mocked(request).mock.calls.every((c) => c[0].startsWith("/assistant")),
  ).toBe(true);
});
it("preserves unsaved drafts on background refresh and exposes conflicts as toasts", async () => {
  await render();
  await edit("Nombre del asistente", "Sin guardar");
  data.config.data.name = "Cambio remoto";
  refresh.value++;
  await render();
  expect(host.querySelector<HTMLInputElement>("form input")!.value).toBe(
    "Sin guardar",
  );
  vi.mocked(request).mockRejectedValueOnce(
    Object.assign(
      new Error("La configuración ha cambiado. Recarga antes de guardar."),
      { status: 409 },
    ),
  );
  await submit("Configuración del asistente");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "ha cambiado",
  );
  expect(host.querySelector<HTMLInputElement>("form input")!.value).toBe(
    "Sin guardar",
  );
  await click("Descartar cambios");
  expect(host.querySelector<HTMLInputElement>("form input")!.value).toBe(
    "Cambio remoto",
  );
});
it("creates, edits, publishes and explicitly confirms deletion of curated knowledge", async () => {
  await render();
  await click("Añadir contenido");
  await edit("Título", "Cómo consultar un pedido");
  await edit("Contenido", "Revisa el estado y la referencia.");
  await submit("Editar contenido de ayuda");
  expect(data.knowledge[0].data.state).toBe("DRAFT");
  expect(host.textContent).toContain("Cómo consultar un pedido");
  await click("Editar");
  await edit("Estado del contenido", "PUBLISHED");
  await submit("Editar contenido de ayuda");
  expect(data.knowledge[0].version).toBe(2);
  expect(host.textContent).toContain("Publicado");
  await click("Eliminar");
  expect(
    vi.mocked(request).mock.calls.filter((c) => c[2] === "DELETE"),
  ).toHaveLength(0);
  await click("Confirmar eliminación");
  expect(data.knowledge).toHaveLength(0);
  expect(request).toHaveBeenCalledWith(
    "/assistant/knowledge/article",
    "workspace",
    "DELETE",
    { version: 2 },
  );
});
