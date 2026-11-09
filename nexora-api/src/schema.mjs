// Shared declarative contract. The API validates it; React renders it.
const text = (label, required = false, extra = {}) => ({
  label,
  type: "text",
  required,
  ...extra,
});
const number = (label, extra = {}) => ({
  label,
  type: "number",
  min: 0,
  ...extra,
});
const choice = (label, options, required = true) => ({
  label,
  type: "select",
  options,
  required,
});
const link = (label, resource, required = false) => ({
  label,
  type: "relation",
  resource,
  required,
});
const boolean = (label) => ({ label, type: "checkbox" });
export const resources = {
  families: {
    label: "Families",
    singular: "family",
    fields: {
      name: text("Name", true),
      temperature: choice("Temperature", ["AMBIENT", "CHILLED", "FROZEN"]),
      parentId: link("Parent family", "families"),
    },
    columns: ["name", "temperature"],
  },
  products: {
    label: "Products",
    singular: "product",
    fields: {
      sku: text("SKU", true),
      ean: text("EAN", false, { pattern: "^([0-9]{8}|[0-9]{13}|[0-9]{14})$" }),
      name: text("Name", true),
      brand: text("Brand"),
      familyId: link("Family", "families", true),
      supplierId: link("Supplier", "suppliers"),
      format: text("Pack format"),
      unit: choice("Sales unit", ["UNIT", "KG", "BOX", "L"]),
      netWeightGrams: number("Net weight (g)"),
      portions: number("Portions per unit"),
      price: number("List price (€)"),
      stock: number("Available stock"),
      shelfLifeDays: number("Shelf life (days)", { integer: true }),
      temperature: choice("Temperature", ["AMBIENT", "CHILLED", "FROZEN"]),
      ingredients: text("Ingredients"),
      ownBrand: boolean("Own brand"),
      glutenFree: boolean("Gluten-free claim"),
      pureedSuitable: boolean("Suitable for pureed diets"),
      active: boolean("Active"),
      allergenStatus: choice(
        "Allergen validation",
        ["UNVERIFIED", "PENDING_REVIEW"],
        true,
      ),
    },
    columns: ["sku", "name", "familyId", "price", "stock", "allergenStatus"],
  },
  allergens: {
    label: "Allergens",
    singular: "allergen",
    fields: { code: text("Code", true), name: text("Name", true) },
    columns: ["code", "name"],
  },
  suppliers: {
    label: "Suppliers",
    singular: "supplier",
    fields: {
      name: text("Name", true),
      taxId: text("Tax ID"),
      qualityEmail: text("Quality email", false, { format: "email" }),
      phone: text("Phone"),
      approvedUntil: { label: "Approved until", type: "date" },
      active: boolean("Active"),
    },
    columns: ["name", "taxId", "qualityEmail", "active"],
  },
  clients: {
    label: "Clients",
    singular: "client",
    fields: {
      name: text("Name", true),
      erpCode: text("ERP code"),
      taxId: text("Tax ID"),
      segment: choice("Segment", [
        "SCHOOL",
        "CARE_HOME",
        "HOSPITAL",
        "HOTEL",
        "RESTAURANT",
        "WORKPLACE",
        "CATERING",
        "OTHER",
      ]),
      orderEmail: text("Order email", false, { format: "email" }),
      whatsapp: text("WhatsApp number"),
      active: boolean("Active"),
    },
    columns: ["name", "erpCode", "segment", "orderEmail"],
  },
  centers: {
    label: "Centers",
    singular: "center",
    fields: {
      name: text("Name", true),
      clientId: link("Client", "clients", true),
      address: text("Address"),
      deliveryWindow: text("Delivery window"),
      deliveryDays: {
        label: "Delivery days",
        type: "multi",
        options: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      },
      route: text("Route"),
      closedDates: {
        label: "Closure dates (YYYY-MM-DD, comma separated)",
        type: "dates",
      },
    },
    columns: ["name", "clientId", "address", "route"],
  },
  diets: {
    label: "Diets",
    singular: "diet",
    fields: {
      code: text("Code", true),
      name: text("Name", true),
      excludedAllergens: {
        label: "Excluded allergens",
        type: "relations",
        resource: "allergens",
      },
      rules: { label: "Rules (JSON object)", type: "json" },
    },
    columns: ["code", "name"],
  },
  centerDiners: {
    label: "Center diners",
    singular: "diner count",
    fields: {
      centerId: link("Center", "centers", true),
      dietId: link("Diet", "diets", true),
      service: choice("Service", ["BREAKFAST", "LUNCH", "SNACK", "DINNER"]),
      count: number("Number of diners", { integer: true, required: true }),
    },
    columns: ["centerId", "dietId", "service", "count"],
  },
  productAllergens: {
    label: "Product allergens",
    singular: "product allergen",
    fields: {
      productId: link("Product", "products", true),
      allergenId: link("Allergen", "allergens", true),
      kind: choice("Presence", ["CONTAINS", "TRACES"]),
      source: text("Source document reference", true),
      validated: boolean("Validated by quality"),
    },
    columns: ["productId", "allergenId", "kind", "source", "validated"],
  },
};
export const roleLabels = {
  admin: "Administrator",
  operations_orders: "Order operations",
  nutrition_menus: "Menu planning",
  quality: "Quality",
  commercial: "Sales",
  read_only: "Read only",
};
export function can(role, resource, write = false) {
  if (role === "admin") return true;
  if (!write) {
    if (role === "read_only") return true;
    if (role === "operations_orders")
      return [
        "products",
        "families",
        "clients",
        "centers",
        "allergens",
      ].includes(resource);
    if (role === "nutrition_menus")
      return [
        "products",
        "families",
        "allergens",
        "productAllergens",
        "diets",
        "centers",
        "centerDiners",
      ].includes(resource);
    if (role === "quality")
      return [
        "products",
        "families",
        "allergens",
        "productAllergens",
        "suppliers",
        "diets",
        "centers",
        "centerDiners",
      ].includes(resource);
    if (role === "commercial") return ["clients", "centers"].includes(resource);
  }
  return (
    write &&
    ((role === "quality" &&
      ["suppliers", "productAllergens"].includes(resource)) ||
      (role === "nutrition_menus" &&
        ["diets", "centerDiners"].includes(resource)) ||
      (role === "commercial" && ["clients", "centers"].includes(resource)))
  );
}
export function validate(resource, input) {
  const def = resources[resource];
  if (!def) throw new Error("Unknown resource");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected an object");
  const out = {};
  for (const key of Object.keys(input))
    if (!def.fields[key]) throw new Error(`Unknown field: ${key}`);
  for (const [key, f] of Object.entries(def.fields)) {
    let v = input[key];
    if (v === undefined || v === null || v === "") {
      if (f.required) throw new Error(`${f.label} is required`);
      out[key] =
        f.type === "checkbox"
          ? false
          : ["multi", "relations", "dates"].includes(f.type)
            ? []
            : f.type === "json"
              ? {}
              : null;
      continue;
    }
    if (f.type === "number") {
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < (f.min ?? 0) ||
        (f.integer && !Number.isInteger(v))
      )
        throw new Error(
          `${f.label} must be a valid non-negative ${f.integer ? "integer" : "number"}`,
        );
    } else if (f.type === "checkbox") {
      if (typeof v !== "boolean")
        throw new Error(`${f.label} must be true or false`);
    } else if (f.type === "json") {
      if (typeof v !== "object" || Array.isArray(v))
        throw new Error(`${f.label} must be an object`);
    } else if (["multi", "relations", "dates"].includes(f.type)) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
        throw new Error(`${f.label} must be a list`);
      v = [...new Set(v)];
      if (f.options && v.some((x) => !f.options.includes(x)))
        throw new Error(`Invalid ${f.label}`);
      if (f.type === "dates" && v.some((x) => !validDate(x)))
        throw new Error("Invalid closure date");
    } else {
      if (typeof v !== "string" || v.length > 4000)
        throw new Error(`Invalid ${f.label}`);
      v = v.trim();
      if (f.required && !v) throw new Error(`${f.label} is required`);
      if (f.options && !f.options.includes(v))
        throw new Error(`Invalid ${f.label}`);
      if (f.pattern && !new RegExp(f.pattern).test(v))
        throw new Error(`Invalid ${f.label}`);
      if (f.type === "date" && !validDate(v))
        throw new Error(`Invalid ${f.label}`);
      if (f.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        throw new Error("Invalid email");
    }
    out[key] = v;
  }
  return out;
}
function validDate(v) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
