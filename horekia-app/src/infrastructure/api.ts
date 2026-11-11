import { Platform } from "react-native";
const origin = () =>
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" && typeof window !== "undefined"
    ? ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? `http://${window.location.hostname}:5184/api`
      : "/api"
    : "https://app.cuinora.com/api");
export async function clientRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(origin() + "/client" + path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(
      path.startsWith("/assistant/interpret") ? 60000 : 20000,
    ),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(data.error ?? "No se ha podido completar la solicitud."),
      { status: r.status },
    );
  return data;
}
