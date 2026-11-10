export const aiResources = {
  aiOrderRequests: {
    label: "Order AI requests",
    fields: {
      messageId: {
        label: "Message",
        type: "relation",
        resource: "inboxMessages",
        required: true,
      },
      messageVersion: {
        label: "Source version",
        type: "number",
        integer: true,
        min: 1,
        required: true,
      },
      provider: {
        label: "Provider",
        type: "select",
        options: ["GEMINI"],
        required: true,
      },
      model: { label: "Model", type: "text", required: true },
      state: {
        label: "Request state",
        type: "select",
        options: ["PROCESSING", "SUCCEEDED", "FAILED"],
        required: true,
      },
      day: { label: "Quota day", type: "date", required: true },
      inputHash: { label: "Input hash", type: "text", required: true },
      catalogHash: { label: "Catalog hash", type: "text", required: true },
      startedAt: { label: "Started at", type: "text", required: true },
      leaseUntil: { label: "Lease until", type: "text", required: true },
      finishedAt: { label: "Finished at", type: "text" },
      errorCode: { label: "Error code", type: "text" },
      orderId: {
        label: "Proposed order",
        type: "relation",
        resource: "orders",
      },
      usage: { label: "Token usage", type: "json" },
    },
    columns: [],
  },
};
