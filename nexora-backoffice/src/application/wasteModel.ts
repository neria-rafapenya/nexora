import type { RecordRow } from "../domain/core";
export interface WastePermissions {
  read: boolean;
  write: boolean;
  quality: boolean;
}
export type WasteCatalog = Record<string, RecordRow[]>;
export type WasteForm = {
  centerId: string;
  date: string;
  service: string;
  menuPlanId: string | null;
  dietId: string | null;
  sourceReference: string;
  notes: string;
  isMock: boolean;
  sourceKind: string;
  productId: string | null;
  recipeVersionId: string | null;
  reason: string;
  quantity: number;
  unit: string;
  lot: string;
  useBy: string | null;
  traceabilityReference: string;
  destinationKind: string;
  destinationTarget: string;
  produced: number;
  served: number;
  title: string;
  ownerName: string;
  dueDate: string;
  targetReductionPercent: number | null;
  linkedEventIds: string[];
};
export interface WasteReport {
  events: RecordRow[];
  actuals: RecordRow[];
  totals: {
    records: number;
    estimatedCostCents: number;
    unvalued: number;
    produced: number;
    served: number;
    unserved: number;
    unservedPercent: number | null;
  };
  quantities: Array<{
    centerId: string;
    unit: string;
    quantity: number;
    discarded: number;
    returned: number;
    donated: number;
    pending: number;
  }>;
  causes: Array<{
    reason: string;
    unit: string;
    quantity: number;
    records: number;
  }>;
  planningReferences: Array<{
    centerId: string;
    service: string;
    dietId: string;
    observations: number;
    meanServed: number | null;
    meanProduced: number | null;
  }>;
  actions: Array<RecordRow & { overdue: boolean }>;
  containsMock: boolean;
}
export const wasteLabels: Record<string, string> = {
  EXPIRY: "Caducidad",
  DETERIORATION: "Deterioro",
  PREPARATION: "Preparación",
  OVERPRODUCTION: "Sobreproducción",
  PLATE_LEFTOVERS: "Restos de platos",
  OTHER: "Otro motivo",
  PRODUCT: "Producto",
  RECIPE: "Receta",
  DISPOSAL: "Desecho",
  RETURN: "Devolución",
  DONATION_CANDIDATE: "Posible donación",
  DRAFT: "Borrador",
  RECORDED: "Registrado",
  VOID: "Anulado",
  NOT_STARTED: "Sin tramitar",
  PENDING_QUALITY: "Pendiente de Calidad",
  APPROVED: "Destino aprobado",
  REJECTED: "Destino rechazado",
  READY: "Pendiente de ejecución",
  COMPLETED: "Completado",
  OPEN: "Abierta",
  IN_PROGRESS: "En curso",
  CANCELLED: "Cancelada",
  KG: "kg",
  L: "litros",
  UNIT: "unidades",
  BOX: "cajas",
  PORTION: "raciones equivalentes",
  BREAKFAST: "Desayuno",
  LUNCH: "Comida",
  SNACK: "Merienda",
  DINNER: "Cena",
};
export const wl = (v: unknown) => wasteLabels[String(v)] ?? String(v ?? "—");
export const wasteName = (c: WasteCatalog, resource: string, id: unknown) =>
  String(c[resource]?.find((r) => r.id === id)?.data.name ?? "Sin asignar");
export const wasteToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const wasteURL = (section = "", id = "", company = "") =>
  "/food-waste" +
  (section ? "/" + section : "") +
  (id ? "/" + id : "") +
  "?" +
  new URLSearchParams({ company });
export function wasteForm(row?: RecordRow): WasteForm {
  const d = row?.data ?? {};
  return {
    centerId: String(d.centerId ?? ""),
    date: String(d.date ?? wasteToday()),
    service: String(d.service ?? "LUNCH"),
    menuPlanId: d.menuPlanId ? String(d.menuPlanId) : null,
    dietId: d.dietId ? String(d.dietId) : null,
    sourceReference: String(d.sourceReference ?? ""),
    notes: String(d.notes ?? ""),
    isMock: d.isMock === true,
    sourceKind: String(d.sourceKind ?? "PRODUCT"),
    productId: d.productId ? String(d.productId) : null,
    recipeVersionId: d.recipeVersionId ? String(d.recipeVersionId) : null,
    reason: String(d.reason ?? "OVERPRODUCTION"),
    quantity: Number(d.quantity ?? 1),
    unit: String(d.unit ?? "KG"),
    lot: String(d.lot ?? ""),
    useBy: d.useBy ? String(d.useBy) : null,
    traceabilityReference: String(d.traceabilityReference ?? ""),
    destinationKind: String(d.destinationKind ?? "DISPOSAL"),
    destinationTarget: String(d.destinationTarget ?? ""),
    produced: Number(d.produced ?? 0),
    served: Number(d.served ?? 0),
    title: String(d.title ?? ""),
    ownerName: String(d.ownerName ?? ""),
    dueDate: String(d.dueDate ?? wasteToday()),
    targetReductionPercent:
      d.targetReductionPercent == null
        ? null
        : Number(d.targetReductionPercent),
    linkedEventIds: (d.linkedEventIds ?? []) as string[],
  };
}
export function wastePayload(type: string, f: WasteForm) {
  const common = {
    centerId: f.centerId,
    date: f.date,
    service: f.service,
    menuPlanId: f.menuPlanId,
    dietId: f.dietId,
    sourceReference: f.sourceReference,
    notes: f.notes,
    isMock: f.isMock,
  };
  if (type === "actuals")
    return { ...common, produced: f.produced, served: f.served };
  if (type === "actions")
    return {
      centerId: f.centerId,
      title: f.title,
      reason: f.reason,
      ownerName: f.ownerName,
      dueDate: f.dueDate,
      targetReductionPercent: f.targetReductionPercent,
      linkedEventIds: f.linkedEventIds,
      notes: f.notes,
      isMock: f.isMock,
    };
  return {
    ...common,
    sourceKind: f.sourceKind,
    productId: f.productId,
    recipeVersionId: f.recipeVersionId,
    reason: f.reason,
    quantity: f.quantity,
    unit: f.unit,
    lot: f.lot,
    useBy: f.useBy,
    traceabilityReference: f.traceabilityReference,
    destinationKind: f.destinationKind,
    destinationTarget: f.destinationTarget,
  };
}
