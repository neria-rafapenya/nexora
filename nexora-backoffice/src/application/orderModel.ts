import type { RecordRow } from "../domain/core";
export interface OrderContext {
  products: RecordRow[];
  clients: RecordRow[];
  centers: RecordRow[];
}
export interface OrderView {
  order: RecordRow;
  lines: RecordRow[];
  alerts: RecordRow[];
  message: RecordRow | null;
  attachments: RecordRow[];
  run: RecordRow | null;
}
export const orderLabels: Record<string, string> = {
  NEW: "Nuevo",
  PROCESSED: "Procesado",
  DISCARDED: "Descartado",
  ERROR: "Error",
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CONFIRMED: "Confirmado",
  EXPORTED: "Exportado",
  CANCELLED: "Cancelado",
  MATCHED: "Asociado",
  DOUBTFUL: "Dudoso",
  NO_MATCH: "Sin producto",
  OUT_OF_STOCK: "Sin stock suficiente",
  UNIT_MISMATCH: "Unidad incompatible",
  OPEN: "Abierta",
  ATTENDED: "Atendida",
  DISMISSED: "Descartada",
  EMAIL: "Correo electrónico",
  WHATSAPP: "WhatsApp",
  PDF: "PDF",
  MANUAL: "Manual",
  MOCK_MESSAGE: "Propuesta mock",
  LOW_CONFIDENCE: "Baja confianza",
  DELIVERY_DAY: "Día fuera de reparto",
  CLOSED_CENTER: "Centro cerrado",
  CLIENT_INACTIVE: "Cliente inactivo",
  MISSING_USUAL: "Falta un producto habitual",
  UNUSUAL_QUANTITY: "Cantidad atípica",
  UNKNOWN_PRICE: "Precio desconocido",
};
export const label = (value: unknown) =>
  orderLabels[String(value)] ?? String(value ?? "—");
export const amount = (cents: unknown) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    Number(cents ?? 0) / 100,
  );
export const rowName = (rows: RecordRow[], id: unknown) =>
  String(rows.find((r) => r.id === id)?.data.name ?? "Sin asignar");
export const orderPath = (path: string, company: string) =>
  path + "?" + new URLSearchParams({ company });
export interface LineDraft {
  id?: string;
  version?: number;
  productId: string;
  quantity: string;
  unit: string;
  reviewAccepted: boolean;
  originalText: string;
  key: string;
}
export interface ReviewDraft {
  clientId: string;
  centerId: string;
  deliveryDate: string;
  lines: LineDraft[];
}
export function reviewDraft(view: OrderView): ReviewDraft {
  return {
    clientId: String(view.order.data.clientId ?? ""),
    centerId: String(view.order.data.centerId ?? ""),
    deliveryDate: String(view.order.data.deliveryDate ?? ""),
    lines: view.lines.map((l) => ({
      id: l.id,
      key: l.id,
      version: l.version,
      productId: String(l.data.productId ?? ""),
      quantity: String(l.data.quantity),
      unit: String(l.data.unit),
      reviewAccepted: l.data.reviewAccepted === true,
      originalText: String(l.data.originalText),
    })),
  };
}
export function reviewPayload(view: OrderView, draft: ReviewDraft) {
  return {
    version: view.order.version,
    clientId: draft.clientId || null,
    centerId: draft.centerId || null,
    deliveryDate: draft.deliveryDate || null,
    lines: draft.lines.map((l) => ({
      ...(l.id ? { id: l.id, version: l.version } : {}),
      productId: l.productId || null,
      quantity: Number(l.quantity),
      unit: l.unit,
      reviewAccepted: l.reviewAccepted,
      originalText: l.originalText,
    })),
  };
}
export function downloadOrder(result: {
  content: string;
  mime: string;
  filename: string;
}) {
  const url = URL.createObjectURL(
    new Blob([result.content], { type: result.mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
