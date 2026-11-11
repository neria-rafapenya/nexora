import { OrdersService } from "./orders.mjs";
import {
  geminiConfigFromEnv,
  requireGeminiConfig,
  demoCatalog,
} from "./gemini.mjs";
import { businessDate } from "./document-rules.mjs";
import { optionsFromEnv } from "./workflow-rules.mjs";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export async function interpretBuyerOrder(access, user, body, options = {}) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) => !["companyId", "centerId", "text", "demoConfirmed"].includes(k),
    ) ||
    typeof body.text !== "string" ||
    body.text.trim().length < 3 ||
    body.text.length > 12000
  )
    fail(400, "Escribe un pedido entre 3 y 12000 caracteres.");
  if (body.demoConfirmed !== true)
    fail(400, "Confirma que utilizas un pedido ficticio sin datos personales.");
  const center = (await access.centers(user)).find(
    (c) => c.id === body.centerId && c.companyId === body.companyId,
  );
  if (!center) fail(403, "No tienes acceso a este centro.");
  const config = options.gemini ?? geminiConfigFromEnv();
  requireGeminiConfig(config);
  demoCatalog(await access.s.list(center.companyId, "products"));
  const service = new OrdersService(access.s, {
    ...optionsFromEnv(),
    ...options,
    gemini: config,
  });
  const input = {
    channel: "MANUAL",
    sender: "APP:" + user.id,
    subject: "Solicitud app " + businessDate(),
    body: body.text.trim(),
    clientId: center.clientId,
    centerId: center.id,
  };
  let message;
  const candidates = await access.s.list(center.companyId, "inboxMessages");
  message = candidates.find(
    (m) =>
      m.data.sender === input.sender &&
      m.data.subject === input.subject &&
      m.data.body === input.body &&
      m.data.centerId === center.id,
  );
  if (!message) {
    const status = await service.aiStatus(center.companyId);
    if (status.usedToday >= status.maxDailyRequests)
      fail(429, "Se ha alcanzado el límite diario de interpretación con IA.");
    try {
      message = await service.createMessage(center.companyId, input, user.id);
    } catch (e) {
      if (!e.existingId) throw e;
      message = await access.s.get(
        center.companyId,
        "inboxMessages",
        e.existingId,
      );
    }
  }
  if (
    !message ||
    message.data.sender !== input.sender ||
    message.data.centerId !== center.id ||
    message.data.clientId !== center.clientId ||
    message.data.body !== input.body
  )
    fail(409, "La solicitud ha cambiado. Vuelve a intentarlo.");
  const order = await service.processGemini(
    center.companyId,
    message.id,
    { version: message.version, demoConfirmed: true },
    user.id,
  );
  if (
    !(await access.centers(user)).some(
      (c) => c.id === center.id && c.companyId === center.companyId,
    )
  )
    fail(403, "El acceso a este centro ha cambiado.");
  if (
    order.data.centerId !== center.id ||
    order.data.clientId !== center.clientId
  )
    fail(403, "La propuesta no corresponde a este centro.");
  if (!["DRAFT", "IN_REVIEW"].includes(order.data.state))
    fail(
      409,
      "Esta solicitud ya tiene un pedido en tramitación. No se puede tratar como un nuevo borrador.",
    );
  const status = await service.aiStatus(center.companyId);
  const products = await access.s.list(center.companyId, "products");
  const rows = (await access.s.list(center.companyId, "orderLines")).filter(
    (l) => l.data.orderId === order.id,
  );
  return {
    orderId: order.id,
    number: order.data.number,
    centerId: center.id,
    companyId: center.companyId,
    deliveryDate: order.data.deliveryDate,
    usedToday: status.usedToday,
    maxDailyRequests: status.maxDailyRequests,
    lines: rows.map((l) => {
      const p = products.find((p) => p.id === l.data.productId);
      return {
        id: l.id,
        productId: p?.id ?? null,
        sku: p?.data.sku ?? null,
        name: p?.data.name ?? l.data.originalText,
        originalText: l.data.originalText,
        quantity: l.data.quantity,
        unit: l.data.unit,
        state: l.data.state,
      };
    }),
  };
}
export function buyerAiError(error) {
  const messages = {
    GEMINI_DISABLED: "La interpretación con IA no está activada.",
    GEMINI_KEY_MISSING: "La interpretación con IA no está configurada.",
    GEMINI_FREE_TIER_NOT_CONFIRMED:
      "La integración de IA no está preparada para esta POC.",
    GEMINI_MODEL_NOT_ALLOWED:
      "El modelo de IA configurado no está disponible para esta POC.",
    GEMINI_DEMO_CATALOG_REQUIRED:
      "Esta POC solo interpreta pedidos con el catálogo ficticio.",
    GEMINI_DAILY_LIMIT:
      "Se ha alcanzado el límite diario de interpretación con IA.",
    GEMINI_REQUEST_IN_PROGRESS:
      "Este pedido ya se está interpretando. Espera antes de reintentarlo.",
    GEMINI_RATE_LIMITED:
      "El proveedor de IA ha alcanzado su límite temporal. Inténtalo más tarde.",
    GEMINI_TIMEOUT:
      "La IA ha tardado demasiado. Puedes reintentar la misma solicitud.",
    GEMINI_UNAVAILABLE: "La IA no está disponible en este momento.",
    GEMINI_AUTH_FAILED: "El servicio de IA no ha podido autenticarse.",
    GEMINI_MODEL_UNAVAILABLE: "El modelo de IA no está disponible.",
    GEMINI_INVALID_OUTPUT:
      "No se ha podido obtener una propuesta válida. Revisa el texto y reinténtalo.",
  };
  return Object.assign(new Error(messages[error.code] ?? error.message), {
    status: error.status ?? 500,
  });
}
