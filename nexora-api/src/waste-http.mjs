import { WasteService } from "./waste.mjs";
import { wastePermissions } from "./waste-schema.mjs";
export async function handleWaste({
  store,
  path,
  method,
  body,
  url,
  tenant,
  role,
  user,
  send,
}) {
  if (!path.startsWith("/api/food-waste")) return false;
  const p = wastePermissions(role),
    s = new WasteService(store);
  const deny = () => {
    throw Object.assign(new Error("Access denied"), { status: 403 });
  };
  if (!p.read || (method !== "GET" && !p.write)) deny();
  if (path === "/api/food-waste/catalog" && method === "GET") {
    send(200, await s.catalog(tenant));
    return true;
  }
  if (path === "/api/food-waste/report" && method === "GET") {
    send(200, await s.report(tenant, Object.fromEntries(url.searchParams)));
    return true;
  }
  const m = path.match(
    /^\/api\/food-waste\/(events|actuals|actions)(?:\/([a-zA-Z0-9-]+))?(?:\/(record|void|approve|reject|discard|complete|progress))?$/,
  );
  if (m) {
    const [, type, id, action] = m,
      table = {
        events: "wasteEvents",
        actuals: "serviceActuals",
        actions: "wasteActions",
      }[type];
    if (method === "GET" && !action) {
      send(
        200,
        id
          ? { record: await s.required(tenant, table, id) }
          : { records: await store.list(tenant, table) },
      );
      return true;
    }
    if (((method === "POST" && !id) || (method === "PUT" && id)) && !action) {
      send(id ? 200 : 201, {
        record:
          type === "actions"
            ? await s.saveAction(tenant, id, body, user.id)
            : await s.saveMeasurement(tenant, type, id, body, user.id),
      });
      return true;
    }
    if (method === "POST" && id && action) {
      if (type === "actions" && action === "progress") {
        send(200, {
          record: await s.actionProgress(tenant, id, body, user.id),
        });
        return true;
      }
      if (type !== "actions" && action !== "progress") {
        send(200, {
          record: await s.measurementAction(
            tenant,
            type,
            id,
            body,
            action,
            role,
            user.id,
          ),
        });
        return true;
      }
    }
  }
  throw Object.assign(new Error("Endpoint not found"), { status: 404 });
}
