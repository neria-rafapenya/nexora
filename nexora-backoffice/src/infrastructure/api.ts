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
      "The API is unavailable. Check that the local server is running.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The API is unavailable. Start the API server and try again.",
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.error ??
          data.errors
            ?.map(
              (e: { row: number; error: string }) => `Row ${e.row}: ${e.error}`,
            )
            .join("\n") ??
          "Request failed",
      ),
      { status: response.status },
    );
  return data as T;
}
