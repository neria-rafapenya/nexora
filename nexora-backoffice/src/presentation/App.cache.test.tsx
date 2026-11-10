// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { App } from "./App";
import {
  clearSessionCache,
  refreshCompany,
} from "../infrastructure/query-cache";
let host: HTMLDivElement, root: Root, name: string, version: number;
const fetchMock = vi.fn();
const user = {
  id: "user",
  name: "Operator",
  email: "operator@example.test",
  companies: [{ id: "workspace", name: "Example", role: "admin" }],
};
function record() {
  return {
    id: "cat",
    data: { name, description: "Example", active: true },
    version,
    createdAt: "2026-11-10T10:00:00Z",
    updatedAt: "2026-11-10T11:00:00Z",
  };
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  clearSessionCache(false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  name = "Original category";
  version = 1;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  fetchMock.mockImplementation(async (url, options) => {
    const path = String(url).split("?")[0];
    if (path === "/api/setup") return response({ required: false });
    if (path === "/api/session") return response({ user });
    if (path === "/api/schema")
      return response({
        resources: {
          mainCategories: {
            label: "Main categories",
            singular: "main category",
            fields: {
              name: { label: "Name", type: "text", required: true },
              description: { label: "Description", type: "text" },
              active: { label: "Active", type: "checkbox" },
            },
            columns: ["name", "description", "active"],
          },
        },
        permissions: { mainCategories: { read: true, write: true } },
        roles: { admin: "Administrator" },
      });
    if (path === "/api/masters/mainCategories")
      return response({ records: [record()] });
    if (path === "/api/masters/mainCategories/cat") {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        if (body.version !== version)
          return response(
            { error: "Record changed. Reload before saving." },
            409,
          );
        name = body.data.name;
        version++;
      }
      return response({ record: record() });
    }
    throw Error("Unexpected endpoint " + path);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearSessionCache(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/categories"]}>
        <App />
      </MemoryRouter>,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1));
}
async function edit() {
  const button = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Editar Original category"]',
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
  const input = host.querySelector<HTMLInputElement>("#name")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Unsaved category");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
it("refreshes the actual master list after another user changes a category", async () => {
  await render();
  expect(host.textContent).toContain("Original category");
  name = "Changed by colleague";
  version++;
  await act(async () => vi.advanceTimersByTimeAsync(30_001));
  expect(host.textContent).toContain("Changed by colleague");
  expect(host.textContent).not.toContain("Original category");
  expect(
    fetchMock.mock.calls.filter(([, o]) => o.method !== "GET"),
  ).toHaveLength(0);
});
it("keeps a real master draft through focus/polling and shows an edit conflict instead of overwriting it", async () => {
  await render();
  const input = await edit();
  name = "Changed by colleague";
  version++;
  await act(async () => {
    refreshCompany("workspace");
    window.dispatchEvent(new Event("focus"));
  });
  await act(async () => vi.advanceTimersByTimeAsync(30_001));
  expect(input.value).toBe("Unsaved category");
  await act(async () =>
    host
      .querySelector("form.master-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector<HTMLInputElement>("#name")!.value).toBe(
    "Unsaved category",
  );
  expect(host.querySelector("[role=alert]")).toBeTruthy();
  expect(name).toBe("Changed by colleague");
});
it("saving a master immediately reloads its list with the committed values", async () => {
  await render();
  await edit();
  await act(async () =>
    host
      .querySelector("form.master-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(name).toBe("Unsaved category");
  expect(host.textContent).toContain("Unsaved category");
  expect(host.querySelector("form.master-form")).toBeNull();
});
