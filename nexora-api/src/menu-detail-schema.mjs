const text = (label, required = false) => ({ label, type: "text", required });
const ref = (label, resource) => ({
  label,
  type: "relation",
  resource,
  required: true,
});
const json = (label) => ({ label, type: "json" });
const bool = (label) => ({ label, type: "checkbox" });
export const menuDetailResources = {
  nutritionProfiles: {
    label: "Product nutrition profiles",
    fields: {
      productId: ref("Product", "products"),
      basis: {
        label: "Basis",
        type: "select",
        options: ["PER_100_G", "PER_100_ML", "PER_UNIT"],
        required: true,
      },
      values: json("Nutrient values"),
      foodGroups: {
        label: "Food groups",
        type: "multi",
        options: ["MEAT", "FISH", "DAIRY", "EGG"],
      },
      classificationComplete: bool("Food classification reviewed"),
      source: text("Source", true),
      isMock: bool("Mock data"),
      review: json("Nutrition review"),
    },
    columns: [],
  },
  dietMenuRules: {
    label: "Diet menu rules",
    fields: {
      dietId: ref("Diet", "diets"),
      service: {
        label: "Service",
        type: "select",
        options: ["BREAKFAST", "LUNCH", "SNACK", "DINNER"],
        required: true,
      },
      limits: json("Per serving limits"),
      excludedIngredientIds: {
        label: "Excluded ingredients",
        type: "relations",
        resource: "menuIngredients",
      },
      requiredClaims: {
        label: "Required claims",
        type: "multi",
        options: ["glutenFree", "pureedSuitable"],
      },
      source: text("Source", true),
      isMock: bool("Mock data"),
      review: json("Nutrition review"),
    },
    columns: [],
  },
  productTechnicalReviews: {
    label: "Product technical reviews",
    fields: {
      productId: ref("Product", "products"),
      hash: text("Technical hash", true),
      snapshot: json("Technical snapshot"),
      documentEvidence: json("Supplier document evidence"),
      source: text("Source", true),
      isMock: bool("Mock data"),
      actorId: text("Quality reviewer", true),
      reviewedAt: text("Reviewed at", true),
    },
    columns: [],
  },
  menuPurchaseLinks: {
    label: "Menu order proposals",
    fields: {
      planId: ref("Menu", "menuPlans"),
      orderId: ref("Order", "orders"),
      planHash: text("Plan hash", true),
      groupKey: text("Delivery group", true),
      createdAt: text("Created at", true),
    },
    columns: [],
  },
};
