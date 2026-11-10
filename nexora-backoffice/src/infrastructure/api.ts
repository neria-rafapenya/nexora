import {
  cachedRead,
  bindSessionCache,
  clearSessionCache,
  sessionExpired,
  invalidateCompany,
  cacheSessionEpoch,
  permissionDenied,
} from "./query-cache";
import { errorEs } from "../application/locale";
export async function request<T>(
  path: string,
  companyId = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  const execute = () => transport<T>(path, companyId, method, body);
  try {
    if (method === "GET")
      return await cachedRead(path, companyId, (signal) =>
        transport<T>(path, companyId, method, body, signal),
      );
    const result = await execute();
    if (["/login", "/setup"].includes(path))
      bindSessionCache(
        (
          result as {
            user: {
              id: string;
              companies: Array<{ id: string; role: string }>;
            };
          }
        ).user,
      );
    else if (path === "/logout") clearSessionCache();
    else if (path === "/profile" || path === "/profile/password") {
      const updated = (
        result as { user: Parameters<typeof bindSessionCache>[0] }
      ).user;
      if (updated) {
        bindSessionCache(updated);
        for (const c of updated.companies ?? []) invalidateCompany(c.id);
      }
    } else if (
      companyId &&
      path !== "/product-search" &&
      !(
        path.startsWith("/imports/") && !(body as { commit?: boolean })?.commit
      ) &&
      !(path.endsWith("/import") && !(body as { commit?: boolean })?.commit)
    )
      invalidateCompany(companyId);
    return result;
  } catch (e) {
    if ((e as { status?: number }).status === 401 && path !== "/login")
      sessionExpired();
    if ((e as { status?: number }).status === 403 && companyId)
      permissionDenied(companyId);
    throw e;
  }
}
async function transport<T>(
  path: string,
  companyId: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const startedEpoch = cacheSessionEpoch();
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(companyId ? { "X-Company-Id": companyId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(
      "No se puede conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "El servicio no ha devuelto una respuesta válida. Inténtalo de nuevo.",
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        (data.error ? errorEs(data.error) : undefined) ??
          data.errors
            ?.map(
              (e: { row: number; error: string }) =>
                `Fila ${e.row}: ${errorEs(e.error)}`,
            )
            .join("\n") ??
          "No se ha podido completar la solicitud",
      ),
      { status: response.status },
    );
  if (startedEpoch !== cacheSessionEpoch())
    throw new Error("La sesión ha cambiado. Vuelve a cargar la pantalla.");
  if (path === "/session" && method === "GET") bindSessionCache(data.user);
  return data as T;
}
