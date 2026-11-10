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
