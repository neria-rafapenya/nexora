import { can } from "./schema.mjs";
import { ProductMedia } from "./product-media.mjs";
export async function handleProductMedia({
  store,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
}) {
  if (!path.startsWith("/api/product-media/")) return false;
  if (!can(role, "products", method !== "GET"))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  const m = path.match(
    /^\/api\/product-media\/([a-zA-Z0-9-]+)(?:\/([a-zA-Z0-9-]+))?$/,
  );
  if (!m) throw Object.assign(new Error("Endpoint not found"), { status: 404 });
  const [, id, fileId] = m,
    s = new ProductMedia(store);
  if (method === "GET" && !fileId) {
    send(200, { records: await s.list(tenant, id) });
    return true;
  }
  if (method === "POST" && !fileId) {
    send(201, { record: await s.upload(tenant, id, body, user.id) });
    return true;
  }
  if (method === "GET" && fileId) {
    send(200, await s.download(tenant, id, fileId, user.id));
    return true;
  }
  if (method === "DELETE" && fileId) {
    send(200, await s.remove(tenant, id, fileId, body.version, user.id));
    return true;
  }
  throw Object.assign(new Error("Endpoint not found"), { status: 404 });
}
