import { describe, it, expect } from "vitest";
import {
  resolveRoute,
  routeURL,
  companyFromSearch,
  masterPaths,
} from "./routes";
describe("Backoffice URL routes", () => {
  it("resolves the private website enquiries inbox", () => {
    expect(resolveRoute("/contacts").page).toBe("contacts");
  });
  it("resolves own-profile and account activation routes", () => {
    expect(resolveRoute("/profile").page).toBe("profile");
    expect(resolveRoute("/activate").page).toBe("activate");
    expect(resolveRoute("/profile/other").page).toBe("notFound");
  });
  it("resolves assistant management without exposing a chat route", () => {
    expect(resolveRoute("/assistant").page).toBe("assistant");
    expect(routeURL("assistant", undefined, "company")).toBe(
      "/assistant?company=company",
    );
    expect(resolveRoute("/assistant/chat").page).toBe("notFound");
  });
  it("resolves category and product list, creation and detail URLs", () => {
    expect(resolveRoute("/categories").page).toBe("mainCategories");
    expect(resolveRoute("/categories/new")).toMatchObject({
      page: "mainCategories",
      isNew: true,
    });
    expect(resolveRoute("/categories/category-id")).toMatchObject({
      page: "mainCategories",
      recordId: "category-id",
      isNew: false,
    });
    expect(resolveRoute("/products/product-id").recordId).toBe("product-id");
  });
  it("has list and detail routes for every master", () => {
    for (const [page, path] of Object.entries(masterPaths)) {
      expect(resolveRoute(path).page).toBe(page);
      expect(resolveRoute(path + "/record-id")).toMatchObject({
        page,
        recordId: "record-id",
      });
      expect(routeURL(page, "record-id")).toBe(path + "/record-id");
    }
  });
  it("rejects unknown paths and excessive nesting", () => {
    expect(resolveRoute("/unknown").page).toBe("notFound");
    expect(resolveRoute("/categories/record/other").page).toBe("notFound");
    expect(resolveRoute("/users/someone").page).toBe("notFound");
  });
  it("keeps company scope in shared links and checks membership on reload", () => {
    expect(routeURL("products", "record", "company-b")).toBe(
      "/products/record?company=company-b",
    );
    expect(
      companyFromSearch("?company=company-b", [
        { id: "company-a" },
        { id: "company-b" },
      ]),
    ).toBe("company-b");
    expect(companyFromSearch("?company=forbidden", [{ id: "company-a" }])).toBe(
      "company-a",
    );
  });
  it("supports trailing slashes and URL-escaped identifiers", () => {
    expect(resolveRoute("/categories/").page).toBe("mainCategories");
    expect(routeURL("mainCategories", "a b")).toBe("/categories/a%20b");
    expect(resolveRoute("/categories/a%20b").recordId).toBe("a b");
  });
});

it("resolves order inbox, review and record routes without treating sections as IDs", () => {
  expect(resolveRoute("/orders/new")).toMatchObject({
    page: "orders",
    isNew: true,
  });
  expect(resolveRoute("/orders/inbox/new")).toMatchObject({
    page: "orders",
    section: "inbox",
    isNew: true,
  });
  expect(resolveRoute("/orders/inbox/msg-id")).toMatchObject({
    page: "orders",
    section: "inbox",
    recordId: "msg-id",
  });
  expect(resolveRoute("/orders/review")).toMatchObject({
    page: "orders",
    section: "review",
    recordId: undefined,
  });
  expect(resolveRoute("/orders/order-id")).toMatchObject({
    page: "orders",
    recordId: "order-id",
  });
});

it("resolves F3 ingredient, recipe and planning deep links", () => {
  for (const section of ["ingredients", "recipes"]) {
    expect(resolveRoute("/menus/" + section + "/new")).toMatchObject({
      page: "menus",
      section,
      isNew: true,
    });
    expect(resolveRoute("/menus/" + section + "/record")).toMatchObject({
      page: "menus",
      section,
      recordId: "record",
    });
  }
  expect(resolveRoute("/menus/plan")).toMatchObject({
    page: "menus",
    recordId: "plan",
  });
});

it("resolves supplier document list, creation and detail URLs", () => {
  expect(resolveRoute("/supplier-documents")).toMatchObject({
    page: "documents",
    isNew: false,
  });
  expect(resolveRoute("/supplier-documents/new")).toMatchObject({
    page: "documents",
    isNew: true,
  });
  expect(resolveRoute("/supplier-documents/doc-id")).toMatchObject({
    page: "documents",
    recordId: "doc-id",
    isNew: false,
  });
});

it("resolves F5 report, measurement, actual count and improvement action deep links", () => {
  expect(resolveRoute("/food-waste")).toMatchObject({
    page: "waste",
    isNew: false,
  });
  for (const section of ["events", "actuals", "actions"]) {
    expect(resolveRoute("/food-waste/" + section + "/new")).toMatchObject({
      page: "waste",
      section,
      isNew: true,
    });
    expect(resolveRoute("/food-waste/" + section + "/record")).toMatchObject({
      page: "waste",
      section,
      recordId: "record",
    });
  }
});

it("keeps table state and master filters when opening a record or returning to its list", async () => {
  const { preserveTableURL } = await import("./routes");
  expect(
    preserveTableURL(
      "/products/p?company=c",
      "/products?company=c&page=35&sort=price&dir=desc&pageSize=25&q=rice",
    ),
  ).toBe(
    "/products/p?company=c&page=35&sort=price&dir=desc&pageSize=25&q=rice",
  );
  expect(
    preserveTableURL("/products", "/products/p?page=35&sort=name&dir=asc"),
  ).toBe("/products?page=35&sort=name&dir=asc");
  expect(preserveTableURL("/suppliers", "/products?page=35&sort=name")).toBe(
    "/suppliers",
  );
  expect(
    preserveTableURL("/products?company=b", "/products?company=a&page=35"),
  ).toBe("/products?company=b");
});
