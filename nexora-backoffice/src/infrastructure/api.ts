import { errorEs } from "../application/locale";
export async function request<T>(
  path: string,
  companyId = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(companyId ? { "X-Company-Id": companyId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      "No se puede conectar con el servicio. Comprueba que el servidor local está iniciado.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "No se puede conectar con el servicio. Inicia el servidor local y vuelve a intentarlo.",
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
  return data as T;
}
