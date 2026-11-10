// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { request } from "./api";
import { useDataRefresh } from "./useDataRefresh";
import {
  bindSessionCache,
  clearSessionCache,
  refreshCompany,
} from "./query-cache";
let host: HTMLDivElement, root: Root;
const fetchMock = vi.fn();
function Page({ editing = false }: { editing?: boolean }) {
  const tick = useDataRefresh("a", !editing);
  const [data, setData] = useState("");
  const [draft, setDraft] = useState("Unsaved draft");
  useEffect(() => {
    let live = true;
    request<{ name: string }>("/masters/products", "a").then((r) => {
      if (live) setData(r.name);
    });
    return () => {
      live = false;
    };
  }, [tick]);
  return (
    <>
      <span>{data}</span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
    </>
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  clearSessionCache(false);
  bindSessionCache({ id: "u", companies: [{ id: "a", role: "admin" }] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ name: "Server " + fetchMock.mock.calls.length }),
        { status: 200 },
      ),
  );
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearSessionCache(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("refreshes visible lists on timer/focus/reconnection and preserves the current rows during a pending refresh", async () => {
  await act(async () => root.render(<Page />));
  expect(host.textContent).toBe("Server 1");
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(host.textContent).toBe("Server 2");
  await act(async () => vi.advanceTimersByTimeAsync(1001));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toBe("Server 3");
  let finish!: (v: Response) => void;
  fetchMock.mockImplementationOnce(
    () => new Promise<Response>((r) => (finish = r)),
  );
  await act(async () => refreshCompany("a"));
  expect(host.textContent).toBe("Server 3");
  await act(async () =>
    finish(new Response(JSON.stringify({ name: "Fresh server" }))),
  );
  expect(host.textContent).toBe("Fresh server");
  await act(async () => vi.advanceTimersByTimeAsync(1001));
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fetchMock).toHaveBeenCalledTimes(5);
});
it("pauses automatic reads while editing and never overwrites an unsaved form", async () => {
  await act(async () => root.render(<Page editing />));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "My unsaved change");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(90_000));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    refreshCompany("a");
  });
  expect(input.value).toBe("My unsaved change");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not poll hidden tabs and checks again when the tab becomes visible", async () => {
  await act(async () => root.render(<Page />));
  Object.defineProperty(document, "visibilityState", {
    value: "hidden",
    configurable: true,
  });
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("coalesces refresh triggers from two visible consumers instead of issuing duplicate network reads", async () => {
  await act(async () =>
    root.render(
      <>
        <Page />
        <Page />
      </>,
    ),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
