import { describe, it, expect } from "vitest";
import {
  resolveRoute,
  routeURL,
  companyFromSearch,
  masterPaths,
} from "./routes";
describe("Backoffice URL routes", () => {
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
