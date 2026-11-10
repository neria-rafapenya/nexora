import { preserveTableURL } from "./routes";
import type { RecordRow } from "../domain/core";
export interface DocumentPermissions {
  read: boolean;
  write: boolean;
  quality: boolean;
}
export interface DocumentCatalog {
  suppliers: RecordRow[];
  products: RecordRow[];
  allergens: RecordRow[];
}
export interface DocumentListRow extends RecordRow {
  status: string;
  expiryState?: string;
  latest: RecordRow | null;
  current: RecordRow | null;
}
export interface DocumentView {
  document: RecordRow;
  status: string;
  versions: Array<RecordRow & { validityState?: string }>;
  files: RecordRow[];
}
export const documentLabels: Record<string, string> = {
  NO_DATE: "Sin fecha de caducidad",
  DRAFT: "Sin archivo",
  PENDING_REVIEW: "Pendiente de Calidad",
  VALID: "Vigente",
  EXPIRING: "Caduca en 30 días o menos",
  EXPIRED: "Caducado",
  NOT_EFFECTIVE: "Todavía no vigente",
  REJECTED: "Rechazado",
  WITHDRAWN: "Retirado",
  ARCHIVED: "Archivado",
  APPROVED: "Aprobado por Calidad",
  TECHNICAL_SHEET: "Ficha técnica",
  ALLERGEN_DECLARATION: "Declaración de alérgenos",
  CERTIFICATE: "Certificado",
  OTHER: "Otro documento",
  INITIAL: "Primera versión",
  FILE: "Archivo",
  VALIDITY: "Vigencia",
  COMPOSITION: "Composición",
  ALLERGENS: "Alérgenos y trazas",
  NUTRITION: "Información nutricional",
  CLAIMS: "Declaraciones del producto",
};
export const dl = (value: unknown) =>
  documentLabels[String(value)] ?? String(value ?? "—");
export const documentURL = (id = "", company = "") =>
  preserveTableURL(
    "/supplier-documents" +
      (id ? "/" + id : "") +
      "?" +
      new URLSearchParams({ company }),
  );
export function downloadDocument(f: {
  base64: string;
  mime: string;
  filename: string;
}) {
  const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
