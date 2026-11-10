const text = (label, required = false, maxLength = 4000) => ({
  label,
  type: "text",
  required,
  maxLength,
});
const ref = (label, resource, required = true) => ({
  label,
  type: "relation",
  resource,
  required,
});
const json = (label) => ({ label, type: "json" });
const date = (label) => ({ label, type: "date" });
const choice = (label, options) => ({
  label,
  type: "select",
  options,
  required: true,
});
export const documentResources = {
  supplierDocuments: {
    label: "Supplier documents",
    fields: {
      title: text("Title", true),
      supplierId: ref("Supplier", "suppliers"),
      productIds: {
        label: "Products",
        type: "relations",
        resource: "products",
      },
      kind: choice("Document type", [
        "TECHNICAL_SHEET",
        "ALLERGEN_DECLARATION",
        "CERTIFICATE",
        "OTHER",
      ]),
      latestVersionId: text("Latest version"),
      currentVersionId: text("Current approved version"),
      reviewedLatestVersionId: text("Latest reviewed version"),
      archived: { label: "Archived", type: "checkbox" },
      createdAt: text("Created at", true),
    },
    columns: [],
  },
  documentFiles: {
    label: "Private document files",
    fields: {
      documentId: ref("Document", "supplierDocuments"),
      filename: text("Filename", true, 200),
      mime: choice("File type", [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "text/plain",
      ]),
      base64: text("Private file content", true, 2000000),
      checksum: text("SHA-256", true),
      size: {
        label: "Bytes",
        type: "number",
        integer: true,
        min: 1,
        required: true,
      },
    },
    columns: [],
  },
  documentVersions: {
    label: "Supplier document versions",
    fields: {
      documentId: ref("Document", "supplierDocuments"),
      fileId: ref("File", "documentFiles"),
      number: {
        label: "Version",
        type: "number",
        min: 1,
        integer: true,
        required: true,
      },
      state: choice("Review state", [
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
      ]),
      effectiveFrom: date("Effective from"),
      expiresAt: date("Expires at"),
      sourceReference: text("Source reference", true),
      isMock: { label: "Mock document", type: "checkbox" },
      declarations: json("Declared technical information"),
      extractedText: text("Extracted document text", false, 20000),
      changeHash: text("Change review hash", true),
      changes: {
        label: "Changed sections",
        type: "multi",
        options: [
          "INITIAL",
          "FILE",
          "VALIDITY",
          "COMPOSITION",
          "ALLERGENS",
          "NUTRITION",
          "CLAIMS",
        ],
      },
      review: json("Quality decision"),
      createdAt: text("Created at", true),
    },
    columns: [],
  },
};
export function documentPermissions(role) {
  return {
    read: [
      "admin",
      "quality",
      "nutrition_menus",
      "operations_orders",
      "commercial",
      "read_only",
    ].includes(role),
    write: ["admin", "quality"].includes(role),
    quality: role === "quality",
  };
}
