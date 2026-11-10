import { QueryClient, isCancelledError } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: false,
      networkMode: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
export const CACHE_EVENT = "horekia-data-changed",
  AUTH_EVENT = "horekia-session-changed",
  ACCESS_EVENT = "horekia-access-changed";
let identity = "",
  epoch = 0,
  channel: BroadcastChannel | undefined;
const generations = new Map<string, number>(),
  lastRefresh = new Map<string, number>();
function emit(type: string, detail?: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(type, { detail }));
}
function connectChannel() {
  if (
    !channel &&
    typeof window !== "undefined" &&
    typeof window.BroadcastChannel === "function"
  ) {
    try {
      channel = new window.BroadcastChannel("horekia-cache");
    } catch {
      return;
    }
    channel.onmessage = ({ data }) => {
      if (
        data?.type === "logout" ||
        (data?.type === "identity" &&
          typeof data.identity === "string" &&
          data.identity !== identity)
      ) {
        clearSessionCache(false);
        emit(AUTH_EVENT);
      } else if (data?.type === "data" && typeof data.company === "string")
        invalidateCompany(data.company, false);
    };
  }
}
export function bindSessionCache(user: {
  id: string;
  companies?: Array<{ id: string; role: string }>;
}) {
  const next = JSON.stringify([
    user.id,
    ...(user.companies ?? []).map((c) => [c.id, c.role]).sort(),
  ]);
  const changed = next !== identity;
  if (changed) {
    queryClient.clear();
    identity = next;
    epoch++;
    generations.clear();
    lastRefresh.clear();
  }
  connectChannel();
  if (changed) channel?.postMessage({ type: "identity", identity: next });
}
export function clearSessionCache(broadcast = true) {
  identity = "";
  epoch++;
  generations.clear();
  lastRefresh.clear();
  queryClient.clear();
  if (broadcast) channel?.postMessage({ type: "logout" });
}
export function sessionExpired() {
  clearSessionCache();
  emit(AUTH_EVENT);
}
export function invalidateCompany(
  company: string,
  broadcast = true,
  notify = true,
) {
  generations.set(company, (generations.get(company) ?? 0) + 1);
  queryClient.removeQueries({
    predicate: (q) => q.queryKey[0] === "api" && q.queryKey[2] === company,
  });
  if (notify) emit(CACHE_EVENT, company);
  if (broadcast) channel?.postMessage({ type: "data", company });
}
export function permissionDenied(company: string) {
  invalidateCompany(company, false, false);
  emit(ACCESS_EVENT);
}
export function refreshCompany(company: string, force = true) {
  const now = Date.now();
  if (
    !force &&
    lastRefresh.has(company) &&
    now - lastRefresh.get(company)! < 1000
  )
    return;
  lastRefresh.set(company, now);
  invalidateCompany(company, false);
}
export function canonicalPath(path: string) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  if (params.get("q") === "") params.delete("q");
  params.sort();
  const query = params.toString();
  return pathname + (query ? "?" + query : "");
}
export function cacheableRead(path: string) {
  const p = path.split("?")[0];
  return (
    /^\/masters\/[a-zA-Z]+$/.test(p) ||
    [
      "/schema",
      "/dashboard",
      "/orders",
      "/orders/catalog",
      "/order-inbox",
      "/order-alerts",
      "/usual-baskets",
      "/menus",
      "/menus/catalog",
      "/recipes",
      "/menu-ingredients",
      "/supplier-documents",
      "/supplier-documents/catalog",
      "/food-waste/catalog",
      "/food-waste/events",
      "/food-waste/actuals",
      "/food-waste/actions",
      "/food-waste/report",
      "/audit",
      "/users",
    ].includes(p)
  );
}
export async function cachedRead<T>(
  path: string,
  company: string,
  read: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!identity || !company || !cacheableRead(path)) return read();
  const startedIdentity = identity,
    startedEpoch = epoch;
  const execute = () =>
    queryClient.fetchQuery({
      queryKey: [
        "api",
        identity,
        company,
        generations.get(company) ?? 0,
        canonicalPath(path),
      ],
      queryFn: ({ signal }) => read(signal),
    });
  try {
    return await execute();
  } catch (e) {
    if (
      isCancelledError(e) &&
      identity === startedIdentity &&
      epoch === startedEpoch
    )
      return execute();
    throw e;
  }
}
export function cacheSessionEpoch() {
  return epoch;
}
