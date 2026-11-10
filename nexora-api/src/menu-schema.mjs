import { menuDetailResources } from "./menu-detail-schema.mjs";
const text = (label, required = false) => ({ label, type: "text", required });
const num = (label, required = false, extra = {}) => ({
  label,
  type: "number",
  min: 0,
  required,
  ...extra,
});
const ref = (label, resource, required = true) => ({
  label,
  type: "relation",
  resource,
  required,
});
const json = (label) => ({ label, type: "json" });
const bool = (label) => ({ label, type: "checkbox" });
const choice = (label, options) => ({
  label,
  type: "select",
  options,
  required: true,
});
export const menuResources = {
  ...menuDetailResources,
  menuIngredients: {
    label: "Kitchen ingredients",
    fields: {
      name: text("Name", true),
      unit: choice("Kitchen unit", ["KG", "L", "UNIT"]),
      active: bool("Active"),
    },
    columns: [],
  },
  ingredientProducts: {
    label: "Ingredient procurement mappings",
    fields: {
      ingredientId: ref("Ingredient", "menuIngredients"),
      productId: ref("Product", "products"),
      quantityPerSalesUnit: num("Kitchen quantity per sales unit", true),
      source: text("Conversion reference", true),
    },
    columns: [],
  },
  recipes: {
    label: "Recipes",
    fields: {
      name: text("Name", true),
      clientId: ref("Client", "clients", false),
      yieldServings: num("Batch servings", true, { integer: true }),
      method: text("Preparation"),
      items: json("Ingredient lines"),
      revision: num("Revision", true, { integer: true }),
      active: bool("Active"),
    },
    columns: [],
  },
  recipeVersions: {
    label: "Recipe versions",
    fields: {
      recipeId: ref("Recipe", "recipes"),
      revision: num("Revision", true, { integer: true }),
      snapshot: json("Recipe snapshot"),
      createdAt: text("Created at", true),
    },
    columns: [],
  },
  menuPlans: {
    label: "Menu plans",
    fields: {
      name: text("Name", true),
      clientId: ref("Client", "clients"),
      centerIds: {
        label: "Centers",
        type: "relations",
        resource: "centers",
        required: true,
      },
      startDate: { label: "Start date", type: "date", required: true },
      endDate: { label: "End date", type: "date", required: true },
      service: choice("Service", ["BREAKFAST", "LUNCH", "SNACK", "DINNER"]),
      origin: choice("Origin", ["MANUAL", "CLIENT_REFERENCE", "MOCK"]),
      sourceReference: text("Source reference"),
      marginPercent: num("Planning margin", true, { max: 100 }),
      schedule: json("Menu schedule"),
      counts: json("Date diner overrides"),
      supply: json("Procurement settings"),
      revision: num("Revision", true, { integer: true }),
      state: choice("State", [
        "DRAFT",
        "IN_REVIEW",
        "APPROVED",
        "PUBLISHED",
        "ARCHIVED",
      ]),
      nutritionApproval: json("Nutrition approval"),
      qualityApproval: json("Quality approval"),
      publishedSnapshot: json("Published snapshot"),
      parentId: ref("Previous plan", "menuPlans", false),
    },
    columns: [],
  },
};
export function menuPermissions(role) {
  return {
    read: [
      "admin",
      "nutrition_menus",
      "quality",
      "operations_orders",
      "commercial",
      "read_only",
    ].includes(role),
    write: ["admin", "nutrition_menus"].includes(role),
    nutrition: role === "nutrition_menus",
    quality: role === "quality",
    supply: ["admin", "operations_orders"].includes(role),
  };
}
