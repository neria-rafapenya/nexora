import { matchRoutes } from "react-router-dom";
export const masterPaths: Record<string, string> = {
  mainCategories: "/categories",
  families: "/families",
  products: "/products",
  allergens: "/allergens",
  suppliers: "/suppliers",
  clients: "/clients",
  centers: "/centers",
  diets: "/diets",
  centerDiners: "/center-diners",
  productAllergens: "/product-allergens",
};
export const pagePaths: Record<string, string> = {
  dashboard: "/",
  ...masterPaths,
  orders: "/orders",
  menus: "/menus",
  documents: "/supplier-documents",
  waste: "/food-waste",
  audit: "/audit",
  users: "/users",
  settings: "/settings",
  assistant: "/assistant",
};
export interface AppRoute {
  page: string;
  recordId?: string;
  isNew: boolean;
  section?: string;
}
const routes: Array<{
  path: string;
  handle: { page: string; isNew: boolean; section?: string };
}> = Object.entries(pagePaths).flatMap(([page, path]) => [
  { path, handle: { page, isNew: false } },
  ...(masterPaths[page]
    ? [
        { path: path + "/new", handle: { page, isNew: true } },
        { path: path + "/:id", handle: { page, isNew: false } },
      ]
    : []),
]);
routes.push(
  ...["events", "actuals", "actions"].flatMap((section) => {
    const path = "/food-waste/" + section;
    return [
      { path, handle: { page: "waste", isNew: false, section } },
      { path: path + "/new", handle: { page: "waste", isNew: true, section } },
      { path: path + "/:id", handle: { page: "waste", isNew: false, section } },
    ];
  }),
  {
    path: "/supplier-documents/new",
    handle: { page: "documents", isNew: true },
  },
  {
    path: "/supplier-documents/:id",
    handle: { page: "documents", isNew: false },
  },
  {
    path: "/menus/nutrition",
    handle: { page: "menus", isNew: false, section: "nutrition" },
  },
  ...["", "recipes", "ingredients"].flatMap((section) => {
    const path = "/menus" + (section ? "/" + section : "");
    return [
      { path, handle: { page: "menus", isNew: false, section } },
      { path: path + "/new", handle: { page: "menus", isNew: true, section } },
      { path: path + "/:id", handle: { page: "menus", isNew: false, section } },
    ];
  }),
  { path: "/orders/new", handle: { page: "orders", isNew: true } },
  {
    path: "/orders/inbox",
    handle: { page: "orders", isNew: false, section: "inbox" },
  },
  {
    path: "/orders/inbox/new",
    handle: { page: "orders", isNew: true, section: "inbox" },
  },
  {
    path: "/orders/inbox/:id",
    handle: { page: "orders", isNew: false, section: "inbox" },
  },
  {
    path: "/orders/review",
    handle: { page: "orders", isNew: false, section: "review" },
  },
  {
    path: "/orders/alerts",
    handle: { page: "orders", isNew: false, section: "alerts" },
  },
  {
    path: "/orders/baskets",
    handle: { page: "orders", isNew: false, section: "baskets" },
  },
  { path: "/orders/:id", handle: { page: "orders", isNew: false } },
);
export function resolveRoute(pathname: string): AppRoute {
  const result = matchRoutes(routes, pathname)?.at(-1);
  if (!result) return { page: "notFound", isNew: false };
  return { ...result.route.handle, recordId: result.params.id };
}
export function routeURL(
  page: string,
  recordId?: string,
  companyId?: string,
): string {
  const path = pagePaths[page] ?? "/";
  const record = recordId ? "/" + encodeURIComponent(recordId) : "";
  return (
    path +
    record +
    (companyId ? "?" + new URLSearchParams({ company: companyId }) : "")
  );
}
export function companyFromSearch(
  search: string,
  companies: Array<{ id: string }>,
): string {
  const requested = new URLSearchParams(search).get("company");
  return (
    companies.find((c) => c.id === requested)?.id ?? companies[0]?.id ?? ""
  );
}

function tableScope(path: string) {
  const segments = path.split("/").filter(Boolean);
  const group = segments[0] ?? "";
  if (
    ["orders", "menus", "food-waste"].includes(group) &&
    [
      "inbox",
      "review",
      "alerts",
      "baskets",
      "recipes",
      "ingredients",
      "nutrition",
      "events",
      "actuals",
      "actions",
    ].includes(segments[1])
  )
    return group + "/" + segments[1];
  return group;
}
export function preserveTableURL(target: string, current?: string) {
  const source =
    current ??
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "");
  if (!source) return target;
  const from = new URL(source, "http://table.local"),
    to = new URL(target, "http://table.local");
  if (tableScope(from.pathname) !== tableScope(to.pathname)) return target;
  if (
    from.searchParams.has("company") &&
    to.searchParams.has("company") &&
    from.searchParams.get("company") !== to.searchParams.get("company")
  )
    return target;
  for (const [key, value] of from.searchParams)
    if (
      [
        "page",
        "pageSize",
        "sort",
        "dir",
        "q",
        "familyId",
        "temperature",
      ].includes(key) ||
      /\.(page|pageSize|sort|dir)$/.test(key)
    )
      to.searchParams.set(key, value);
  return (
    to.pathname + (to.searchParams.size ? "?" + to.searchParams : "") + to.hash
  );
}
