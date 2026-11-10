const text = (label, required = false) => ({ label, type: "text", required });
const ref = (label, resource, required = false) => ({
  label,
  type: "relation",
  resource,
  required,
});
const num = (label, required = false, integer = false, max = 1000000) => ({
  label,
  type: "number",
  required,
  min: 0,
  max,
  integer,
});
const json = (label) => ({ label, type: "json" });
const date = (label, required = false) => ({ label, type: "date", required });
const choice = (label, options) => ({
  label,
  type: "select",
  options,
  required: true,
});
export const wasteReasons = [
  "EXPIRY",
  "DETERIORATION",
  "PREPARATION",
  "OVERPRODUCTION",
  "PLATE_LEFTOVERS",
  "OTHER",
];
export const services = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];
const measuredFields = {
  centerId: ref("Center", "centers", true),
  date: date("Occurrence date", true),
  service: choice("Service", services),
  menuPlanId: ref("Menu", "menuPlans"),
  dietId: ref("Diet", "diets"),
  sourceReference: text("Source reference", true),
  notes: text("Notes"),
  isMock: { label: "Mock data", type: "checkbox" },
  createKey: text("Creation request", true),
  creationHash: text("Creation hash", true),
  state: choice("Record state", ["DRAFT", "RECORDED", "VOID"]),
  snapshot: json("Measurement context"),
  recordedBy: text("Recorded by"),
  recordedAt: text("Recorded at"),
  voidReason: text("Void reason"),
  voidedBy: text("Voided by"),
  voidedAt: text("Voided at"),
};
export const wasteResources = {
  wasteEvents: {
    label: "Food waste records",
    fields: {
      ...measuredFields,
      sourceKind: choice("Source kind", ["PRODUCT", "RECIPE"]),
      productId: ref("Product", "products"),
      recipeVersionId: ref("Recipe version", "recipeVersions"),
      reason: choice("Waste reason", wasteReasons),
      quantity: num("Measured quantity", true),
      unit: choice("Measured unit", ["KG", "L", "UNIT", "BOX", "PORTION"]),
      lot: text("Lot or production batch"),
      useBy: date("Use by"),
      traceabilityReference: text("Traceability reference"),
      destinationKind: choice("Destination", [
        "DISPOSAL",
        "RETURN",
        "DONATION_CANDIDATE",
      ]),
      destinationTarget: text("Destination target"),
      destinationState: choice("Destination state", [
        "NOT_STARTED",
        "PENDING_QUALITY",
        "APPROVED",
        "REJECTED",
        "READY",
        "COMPLETED",
      ]),
      qualityDecision: json("Quality decision history"),
      completion: json("Destination completion"),
      unitCostCents: num(
        "Indicative unit cost",
        false,
        false,
        Number.MAX_SAFE_INTEGER,
      ),
      estimatedCostCents: num(
        "Estimated loss cost",
        false,
        true,
        Number.MAX_SAFE_INTEGER,
      ),
    },
    columns: [],
  },
  serviceActuals: {
    label: "Actual service volumes",
    fields: {
      ...measuredFields,
      dietId: ref("Diet", "diets", true),
      produced: num("Produced servings", true, true),
      served: num("Served servings", true, true),
      planned: num("Planned servings", false, true),
    },
    columns: [],
  },
  wasteActions: {
    label: "Waste improvement actions",
    fields: {
      centerId: ref("Center", "centers", true),
      title: text("Title", true),
      reason: choice("Cause", wasteReasons),
      ownerName: text("Responsible person", true),
      dueDate: date("Due date", true),
      targetReductionPercent: num("Target reduction (%)", false, false, 100),
      linkedEventIds: {
        label: "Linked waste records",
        type: "relations",
        resource: "wasteEvents",
      },
      notes: text("Action plan", true),
      state: choice("Progress", [
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ]),
      outcome: json("Outcome"),
      isMock: { label: "Mock action", type: "checkbox" },
      createKey: text("Creation request", true),
      creationHash: text("Creation hash", true),
    },
    columns: [],
  },
};
export function wastePermissions(role) {
  return {
    read: [
      "admin",
      "operations_orders",
      "nutrition_menus",
      "quality",
      "commercial",
      "read_only",
    ].includes(role),
    write: [
      "admin",
      "operations_orders",
      "nutrition_menus",
      "quality",
    ].includes(role),
    quality: role === "quality",
  };
}
