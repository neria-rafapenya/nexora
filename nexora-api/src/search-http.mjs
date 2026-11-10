import { can } from "./schema.mjs";
import { ProductSearch } from "./product-search.mjs";
export async function handleSearch({
  store,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
}) {
  if (!path.startsWith("/api/product-search")) return false;
  if (!can(role, "products"))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  const service = new ProductSearch(store);
  if (path === "/api/product-search/status" && method === "GET") {
    send(200, await service.status(tenant));
    return true;
  }
  if (path === "/api/product-search/index" && method === "POST") {
    if (role !== "admin")
      throw Object.assign(new Error("Administrator access required"), {
        status: 403,
      });
    send(200, await service.index(tenant, user.id, body.demoConfirmed));
    return true;
  }
  if (path === "/api/product-search" && method === "POST") {
    send(200, await service.search(tenant, body, user.id));
    return true;
  }
  throw Object.assign(new Error("Route not found"), { status: 404 });
}
