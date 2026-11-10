import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { request } from "./api";
import {
  queryClient,
  bindSessionCache,
  clearSessionCache,
  refreshCompany,
  cacheableRead,
} from "./query-cache";
const user = {
  id: "u1",
  companies: [
    { id: "a", role: "admin" },
    { id: "b", role: "read_only" },
  ],
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const fetchMock = vi.fn();
beforeEach(() => {
  clearSessionCache(false);
  bindSessionCache(user);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  clearSessionCache(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("deduplicates simultaneous reads, canonicalizes filters, reuses fresh data and keeps companies separate", async () => {
  fetchMock.mockImplementation(async () =>
    response({ records: [{ id: "first" }] }),
  );
  const [one, two] = await Promise.all([
    request("/masters/products?temperature=FROZEN&familyId=f", "a"),
    request("/masters/products?familyId=f&temperature=FROZEN", "a"),
  ]);
  expect(one).toEqual(two);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await request("/masters/products?familyId=f&temperature=FROZEN", "a");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await request("/masters/products?familyId=f&temperature=FROZEN", "b");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await request("/masters/products?q=", "a");
  await request("/masters/products", "a");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("expires reads after 30 seconds and manual refresh forces a fresh read immediately", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(async () =>
    response({ value: fetchMock.mock.calls.length }),
  );
  await request("/orders", "a");
  await request("/orders", "a");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_001);
  await request("/orders", "a");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  refreshCompany("a");
  await request("/orders", "a");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("writes invalidate related reads in that company but do not invalidate another company or retry the action", async () => {
  fetchMock.mockImplementation(async () => response({ records: [] }));
  await request("/masters/products", "a");
  await request("/menus/catalog", "a");
  await request("/masters/products", "b");
  await request("/masters/products/p", "a", "PUT", {
    data: { name: "Updated" },
    version: 1,
  });
  await request("/masters/products", "a");
  await request("/menus/catalog", "a");
  await request("/masters/products", "b");
  expect(fetchMock).toHaveBeenCalledTimes(6);
  expect(
    fetchMock.mock.calls.filter(([, o]) => o.method === "PUT"),
  ).toHaveLength(1);
});
it("does not cache private downloads, file-containing details, sessions, MFA or explicit AI/search actions", async () => {
  fetchMock.mockImplementation(async () =>
    response({ record: {}, base64: "private" }),
  );
  for (const path of [
    "/orders/order-id",
    "/order-inbox/message-id",
    "/supplier-documents/d/versions/v/download",
    "/mfa",
  ]) {
    expect(cacheableRead(path)).toBe(false);
    await request(path, "a");
    await request(path, "a");
  }
  expect(fetchMock).toHaveBeenCalledTimes(8);
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  fetchMock.mockResolvedValue(response({ error: "GEMINI_RATE_LIMITED" }, 429));
  await expect(
    request("/order-inbox/m/process-ai", "a", "POST", {
      version: 1,
      demoConfirmed: true,
    }),
  ).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(9);
});
it("clears cached data for logout, user changes, permission changes and expired sessions", async () => {
  fetchMock.mockImplementation(async () =>
    response({ records: [{ secret: "user-one" }] }),
  );
  await request("/orders", "a");
  expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  bindSessionCache({ ...user, id: "u2" });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  await request("/orders", "a");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  bindSessionCache({
    ...user,
    id: "u2",
    companies: [{ id: "a", role: "read_only" }],
  });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  await request("/orders", "a");
  fetchMock.mockResolvedValueOnce(response({ ok: true }));
  await request("/logout", "", "POST");
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  bindSessionCache(user);
  await request("/orders", "a");
  fetchMock.mockResolvedValueOnce(response({ error: "Sign in required" }, 401));
  await expect(request("/masters/products", "a")).rejects.toMatchObject({
    status: 401,
  });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
it("forbidden and failed requests never return an older cached success or loop automatically", async () => {
  fetchMock.mockImplementation(async () =>
    response({ records: [{ id: "old" }] }),
  );
  await request("/orders", "a");
  refreshCompany("a");
  fetchMock.mockImplementation(async () =>
    response({ error: "Access denied" }, 403),
  );
  await expect(request("/orders", "a")).rejects.toMatchObject({ status: 403 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  fetchMock.mockImplementation(async () =>
    response({ error: "temporarily unavailable" }, 503),
  );
  await expect(request("/orders", "a")).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("a read started before a write cannot overwrite the post-write cache", async () => {
  let resolveRead!: (v: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveRead = resolve;
      }),
  );
  const oldRead = request<{ version: number }>("/orders", "a");
  fetchMock.mockImplementation(async (_url, options) =>
    response(options.method === "GET" ? { version: 2 } : { ok: true }),
  );
  await request("/orders/o", "a", "PUT", { version: 1 });
  resolveRead(response({ version: 1 }));
  expect(await oldRead).toEqual({ version: 2 });
  expect(await request("/orders", "a")).toEqual({ version: 2 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("a late session response cannot restore a logged-out identity", async () => {
  let resolveRead!: (v: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveRead = resolve;
      }),
  );
  const pending = request("/session");
  clearSessionCache(false);
  resolveRead(response({ user }));
  await expect(pending).rejects.toThrow("La sesión ha cambiado");
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
it("import previews and semantic queries remain explicit and do not evict otherwise valid data", async () => {
  fetchMock.mockImplementation(async () =>
    response({ records: [], valid: true }),
  );
  await request("/masters/products", "a");
  await request("/imports/products", "a", "POST", { commit: false });
  await request("/product-search", "a", "POST", {
    q: "rice",
    demoConfirmed: true,
  });
  await request("/masters/products", "a");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("broadcasts changes without cached payloads and clears a tab when another tab logs out or changes identity", async () => {
  let instance!: FakeChannel;
  class FakeChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    messages: unknown[] = [];
    constructor() {
      instance = this;
    }
    postMessage(data: unknown) {
      this.messages.push(data);
    }
  }
  vi.stubGlobal("window", {
    BroadcastChannel: FakeChannel,
    dispatchEvent: vi.fn(),
  });
  bindSessionCache({ ...user, id: "browser-user" });
  fetchMock.mockImplementation(async () =>
    response({ records: [{ secret: "private-payload" }] }),
  );
  await request("/orders", "a");
  refreshCompany("a");
  expect(JSON.stringify(instance.messages)).not.toContain("private-payload");
  await request("/orders", "a");
  expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  instance.onmessage!({
    data: { type: "identity", identity: "another-session" },
  });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  bindSessionCache(user);
  await request("/orders", "a");
  instance.onmessage!({ data: { type: "logout" } });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
