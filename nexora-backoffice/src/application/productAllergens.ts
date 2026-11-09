import type { RecordRow } from "../domain/core";
const allergenNames: Record<string, string> = {
  EU01: "Cereales con gluten",
  EU02: "Crustáceos",
  EU03: "Huevos",
  EU04: "Pescado",
  EU05: "Cacahuetes",
  EU06: "Soja",
  EU07: "Leche",
  EU08: "Frutos de cáscara",
  EU09: "Apio",
  EU10: "Mostaza",
  EU11: "Sésamo",
  EU12: "Dióxido de azufre y sulfitos",
  EU13: "Altramuces",
  EU14: "Moluscos",
};
export function allergenName(row: RecordRow | undefined) {
  return row
    ? (allergenNames[String(row.data.code)] ?? String(row.data.name))
    : "Alérgeno no disponible";
}
export function productAllergenRows(
  productId: string,
  links: RecordRow[],
  allergens: RecordRow[],
) {
  const byId = new Map(allergens.map((a) => [a.id, a]));
  return links
    .filter((r) => r.data.productId === productId)
    .map((row) => ({
      row,
      name: allergenName(byId.get(String(row.data.allergenId))),
      traces: row.data.kind === "TRACES",
      validated: row.data.validated === true,
    }))
    .sort(
      (a, b) =>
        Number(a.traces) - Number(b.traces) ||
        a.name.localeCompare(b.name, "es"),
    );
}
export function associationPayload(
  productId: string,
  form: {
    allergenId: string;
    kind: string;
    source: string;
    validated: boolean;
  },
) {
  return {
    productId,
    allergenId: form.allergenId,
    kind: form.kind,
    source: form.source.trim(),
    validated: form.validated,
  };
}
