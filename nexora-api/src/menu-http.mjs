import { MenusService, menuFail } from "./menus.mjs";
import { menuPermissions } from "./menu-schema.mjs";
export async function handleMenus({
  store,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
}) {
  if (
    !path.startsWith("/api/menus") &&
    !path.startsWith("/api/recipes") &&
    !path.startsWith("/api/menu-ingredients") &&
    !path.startsWith("/api/ingredient-products")
  )
    return false;
  const p = menuPermissions(role),
    s = new MenusService(store);
  if (!p.read) menuFail("Access denied", 403);
  const mutation = method !== "GET";
  const m = path.match(
    /^\/api\/(menus|recipes|menu-ingredients)(?:\/([a-zA-Z0-9-]+))?(?:\/(forecast|copy|mock|review|nutrition|quality|publish|archive))?$/,
  );
  if (path === "/api/menus/catalog" && method === "GET") {
    send(200, await s.catalog(tenant));
    return true;
  }
  if (path === "/api/ingredient-products" && method === "POST") {
    if (!p.write) menuFail("Access denied", 403);
    send(200, { record: await s.saveMapping(tenant, body, user.id) });
    return true;
  }
  if (!m) menuFail("Endpoint not found", 404);
  const [, type, id, action] = m;
  if (mutation) {
    const allowed =
      action === "nutrition"
        ? p.nutrition
        : action === "quality"
          ? p.quality
          : p.write;
    if (!allowed) menuFail("Access denied", 403);
  }
  const table = {
    menus: "menuPlans",
    recipes: "recipes",
    "menu-ingredients": "menuIngredients",
  }[type];
  if (method === "GET" && !id) {
    send(200, { records: await store.list(tenant, table) });
    return true;
  }
  if (method === "GET" && id && !action) {
    send(200, { record: await s.required(tenant, table, id) });
    return true;
  }
  if (method === "GET" && type === "menus" && action === "forecast") {
    send(200, await s.forecast(tenant, id));
    return true;
  }
  if (((method === "POST" && !id) || (method === "PUT" && id)) && !action) {
    const save = {
      menus: "savePlan",
      recipes: "saveRecipe",
      "menu-ingredients": "saveIngredient",
    }[type];
    send(id ? 200 : 201, { record: await s[save](tenant, id, body, user.id) });
    return true;
  }
  if (type === "menus" && id && method === "POST") {
    let record;
    if (action === "copy")
      record = await s.copyPlan(tenant, id, body.version, user.id);
    else if (action === "mock")
      record = await s.mockProposal(
        tenant,
        id,
        body.version,
        body.dietId,
        user.id,
      );
    else if (
      ["review", "nutrition", "quality", "publish", "archive"].includes(action)
    )
      record = await s.transition(tenant, id, body, role, user.id, action);
    else menuFail("Endpoint not found", 404);
    send(200, { record });
    return true;
  }
  menuFail("Endpoint not found", 404);
}
