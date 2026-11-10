import { aiResources } from "./ai-schema.mjs";
import { workflowOrderFields, workflowResources } from "./workflow-schema.mjs";
const text = (label, required = false, maxLength = 4000) => ({
  label,
  type: "text",
  required,
  maxLength,
});
const num = (label, required = false, integer = false) => ({
  label,
  type: "number",
  required,
  min: 0,
  integer,
});
const select = (label, options) => ({
  label,
  type: "select",
  options,
  required: true,
});
const ref = (label, resource, required = false) => ({
  label,
  type: "relation",
  resource,
  required,
});
const bool = (label) => ({ label, type: "checkbox" });
export const orderResources = {
  ...aiResources,
  ...workflowResources,
  inboxMessages: {
    label: "Inbox messages",
    fields: {
      channel: select("Channel", ["EMAIL", "WHATSAPP", "PDF", "MANUAL"]),
      sender: text("Sender", true),
      subject: text("Subject"),
      body: text("Body", false, 20000),
      originalBody: text("Original body", false, 20000),
      clientId: ref("Client", "clients"),
      centerId: ref("Center", "centers"),
      requestedDate: { label: "Requested date", type: "date" },
      state: select("State", ["NEW", "PROCESSED", "DISCARDED", "ERROR"]),
      dedupe: text("Deduplication hash", true),
      error: text("Error"),
      receivedAt: text("Received at", true),
    },
    columns: [],
  },
  orderAttachments: {
    label: "Order attachments",
    fields: {
      messageId: ref("Message", "inboxMessages", true),
      filename: text("Filename", true),
      mime: select("MIME type", ["application/pdf", "image/png", "image/jpeg"]),
      base64: text("Legacy file content", false, 2200000),
      storageKey: text("Private storage reference", false, 200),
      checksum: text("SHA-256"),
      size: num("Bytes", false, true),
    },
    columns: [],
  },
  orders: {
    label: "Orders",
    fields: {
      ...workflowOrderFields,
      number: text("Number", true),
      clientId: ref("Client", "clients"),
      centerId: ref("Center", "centers"),
      messageId: ref("Message", "inboxMessages"),
      deliveryDate: { label: "Delivery date", type: "date" },
      origin: select("Origin", ["MANUAL", "MOCK_MESSAGE", "AI_MESSAGE"]),
      state: select("State", [
        "DRAFT",
        "SUBMITTED",
        "IN_REVIEW",
        "AWAITING_CLIENT",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
      ]),
      totalCents: num("Total in cents", true, true),
      confidence: num("Confidence"),
      reviewedBy: text("Reviewed by"),
      confirmedAt: text("Confirmed at"),
      exportedAt: text("Exported at"),
      createdAt: text("Created at", true),
    },
    columns: [],
  },
  orderLines: {
    label: "Order lines",
    fields: {
      orderId: ref("Order", "orders", true),
      productId: ref("Product", "products"),
      originalText: text("Original text", true),
      quantity: num("Quantity", true),
      unit: select("Unit", ["UNIT", "KG", "BOX", "L", "UNKNOWN"]),
      unitPriceCents: num("Unit price in cents", true, true),
      amountCents: num("Line total in cents", true, true),
      confidence: num("Confidence", true),
      state: select("State", [
        "MATCHED",
        "DOUBTFUL",
        "NO_MATCH",
        "OUT_OF_STOCK",
        "UNIT_MISMATCH",
      ]),
      reviewAccepted: bool("Reviewed"),
      substitutionForId: ref("Original product", "products"),
    },
    columns: [],
  },
  orderAlerts: {
    label: "Order alerts",
    fields: {
      orderId: ref("Order", "orders", true),
      clientId: ref("Client", "clients"),
      productId: ref("Product", "products"),
      type: select("Alert type", [
        "NO_MATCH",
        "LOW_CONFIDENCE",
        "OUT_OF_STOCK",
        "UNIT_MISMATCH",
        "DELIVERY_DAY",
        "CLOSED_CENTER",
        "CLIENT_INACTIVE",
        "MISSING_USUAL",
        "UNUSUAL_QUANTITY",
        "UNKNOWN_PRICE",
      ]),
      detail: text("Detail", true),
      state: select("State", ["OPEN", "ATTENDED", "DISMISSED"]),
    },
    columns: [],
  },
  usualBaskets: {
    label: "Usual baskets",
    fields: {
      clientId: ref("Client", "clients", true),
      centerId: ref("Center", "centers", true),
      productId: ref("Product", "products", true),
      averageQuantity: num("Average quantity", true),
      stddevQuantity: num("Quantity deviation", true),
      frequencyDays: num("Frequency in days", true),
      orderCount: num("Order count", true, true),
      lastOrderedAt: text("Last order", true),
      computedAt: text("Computed at", true),
    },
    columns: [],
  },
  aiOrderRuns: {
    label: "Order extraction runs",
    fields: {
      messageId: ref("Message", "inboxMessages", true),
      orderId: ref("Order", "orders", true),
      provider: select("Provider", ["MOCK", "GEMINI"]),
      model: text("Model", true),
      output: { label: "Output", type: "json" },
      costCents: num("Cost", false, true),
      durationMs: num("Duration", true, true),
      createdAt: text("Created at", true),
    },
    columns: [],
  },
};
export function canOrders(role, write = false) {
  return write
    ? ["admin", "operations_orders"].includes(role)
    : ["admin", "operations_orders", "commercial", "read_only"].includes(role);
}
