import type { RecordRow } from "../domain/core";
export interface MenuPermissions {
  read: boolean;
  write: boolean;
  nutrition: boolean;
  quality: boolean;
  supply?: boolean;
}
export type MenuCatalog = Record<string, RecordRow[]>;
export interface IngredientLine {
  ingredientId: string;
  quantity: number;
}
export interface RecipeForm {
  name: string;
  clientId: string | null;
  yieldServings: number;
  method: string;
  items: { lines: IngredientLine[] };
  active: boolean;
}
export interface MenuEntry {
  date: string;
  dietId: string;
  course: string;
  recipeVersionId: string;
  centerId: string | null;
}
export interface DinerOverride {
  centerId: string;
  date: string;
  dietId: string;
  count: number;
}
export interface PlanForm {
  name: string;
  clientId: string;
  centerIds: string[];
  startDate: string;
  endDate: string;
  service: string;
  origin: string;
  sourceReference: string;
  marginPercent: number;
  schedule: { entries: MenuEntry[] };
  counts: { overrides: DinerOverride[] };
  supply: SupplySettings;
}
export interface Forecast {
  schemaVersion?: number;
  isMock?: boolean;
  nutrition?: Array<{
    centerId: string;
    date: string;
    dietId: string;
    count: number;
    complete: boolean;
    perServing: Record<string, number>;
    checks: Array<{
      nutrient: string;
      value: number;
      min?: number;
      max?: number;
      passed: boolean;
    }>;
  }>;
  purchases?: Array<{
    centerId: string;
    deliveryDate: string;
    productId: string;
    productName: string;
    sku: string;
    salesQuantity: number;
    salesUnit: string;
    grossQuantity: number;
    declaredStockUsed: number;
    netQuantity: number;
    unit: string;
    surplus: number;
    estimatedCostCents: number | null;
  }>;
  estimatedPurchaseCostCents?: number | null;
  frozen: boolean;
  hash: string;
  issues: string[];
  warnings: string[];
  estimatedCostCents: number | null;
  servings: Array<{
    centerId: string;
    date: string;
    dietId: string;
    course: string;
    recipeName: string;
    count: number;
    source: string;
  }>;
  needs: Array<{
    centerId: string;
    date: string;
    name: string;
    unit: string;
    baseQuantity: number;
    withMargin: number;
  }>;
  procurement: Array<{
    centerId: string;
    date: string;
    name: string;
    unit: string;
    sku: string;
    productName: string;
    baseQuantity: number;
    withMargin: number;
    salesQuantity: number;
    salesUnit: string;
    surplus: number;
    estimatedCostCents: number | null;
  }>;
}
export const menuLabels: Record<string, string> = {
  MISSING_FOOD_CLASSIFICATION:
    "Falta la clasificación alimentaria documentada para comprobar las exclusiones de la dieta.",
  EXCLUDED_FOOD_GROUP:
    "Algún producto contiene carne o pescado excluidos por las reglas de la dieta.",
  MISSING_TECHNICAL_REVIEW:
    "Calidad debe revisar la composición y las declaraciones actuales de los productos.",
  MISSING_NUTRITION_PROFILE: "Faltan valores nutricionales documentados.",
  NUTRITION_BASIS_MISMATCH:
    "La base nutricional no coincide con la unidad de cocina. Revisa kg, litros o unidades.",
  UNREVIEWED_NUTRITION_PROFILE:
    "Nutrición debe validar los perfiles nutricionales actuales.",
  MISSING_DIET_RULES: "Faltan reglas revisadas para alguna dieta y servicio.",
  UNREVIEWED_DIET_RULES: "Nutrición debe validar las reglas de dieta actuales.",
  NUTRIENT_LIMIT_VIOLATION:
    "El menú queda fuera de los límites por ración configurados para esa dieta y servicio.",
  EXCLUDED_DIET_INGREDIENT:
    "El menú incluye un ingrediente excluido por la dieta.",
  MISSING_REQUIRED_DIET_CLAIM:
    "Falta una declaración de producto requerida por la dieta.",
  INVALID_PURCHASE_DELIVERY:
    "Alguna entrega no coincide con el calendario del centro o cae en un día cerrado.",
  PURCHASE_AMOUNT_LIMIT:
    "Alguna cantidad o importe supera los límites de cálculo.",
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
  MANUAL: "Creado manualmente",
  CLIENT_REFERENCE: "Menú aportado por el cliente",
  MOCK: "Propuesta simulada",
  BREAKFAST: "Desayuno",
  LUNCH: "Comida",
  SNACK: "Merienda",
  DINNER: "Cena",
  FIRST: "Primero",
  MAIN: "Principal",
  SIDE: "Guarnición",
  DESSERT: "Postre",
  DRINK: "Bebida",
  KG: "kg",
  L: "litros",
  UNIT: "unidades",
  BOX: "cajas",
  EMPTY_MENU: "El menú no tiene recetas.",
  MISSING_REFERENCE: "Falta una referencia del menú.",
  MISSING_DINER_COUNT: "Falta el número de comensales para alguna dieta.",
  MISSING_DIET_MENU:
    "Hay comensales con una dieta sin menú asignado en alguna fecha.",
  INACTIVE_INGREDIENT: "Hay ingredientes inactivos.",
  MISSING_PRODUCT_MAPPING:
    "Falta elegir el producto comercial o su conversión de compra.",
  INACTIVE_PRODUCT: "Hay productos comerciales inactivos.",
  MISSING_TECHNICAL_INFORMATION:
    "Falta la composición de algún producto. Completa su ficha antes de la revisión de Calidad.",
  UNVALIDATED_ALLERGENS:
    "Hay asociaciones de alérgenos pendientes de validar por Calidad.",
  DIET_ALLERGEN_CONFLICT:
    "Algún producto declara alérgenos o trazas excluidos por una dieta.",
  NO_DECLARED_ALLERGEN_LINKS:
    "Hay productos sin asociaciones de alérgenos. Esto no demuestra ausencia: Calidad debe revisar la documentación.",
  INVALID_PACK_CONVERSION: "Hay una conversión de compra no válida.",
  AMBIGUOUS_PRODUCT_MAPPING:
    "Varios ingredientes usan el mismo producto en una entrega. Revisa sus equivalencias antes de aprobar.",
};
export const ml = (v: unknown) => menuLabels[String(v)] ?? String(v ?? "—");
export const menuName = (c: MenuCatalog, table: string, id: unknown) =>
  String(c[table]?.find((r) => r.id === id)?.data.name ?? "Sin asignar");
export const menuURL = (section = "", id = "", company = "") =>
  "/menus" +
  (section ? "/" + section : "") +
  (id ? "/" + id : "") +
  "?" +
  new URLSearchParams({ company });
export function planForm(r?: RecordRow): PlanForm {
  const d = r?.data;
  return {
    name: String(d?.name ?? ""),
    clientId: String(d?.clientId ?? ""),
    centerIds: (d?.centerIds ?? []) as string[],
    startDate: String(d?.startDate ?? new Date().toISOString().slice(0, 10)),
    endDate: String(d?.endDate ?? new Date().toISOString().slice(0, 10)),
    service: String(d?.service ?? "LUNCH"),
    origin: String(d?.origin ?? "MANUAL"),
    sourceReference: String(d?.sourceReference ?? ""),
    marginPercent: Number(d?.marginPercent ?? 0),
    schedule: (d?.schedule ?? { entries: [] }) as PlanForm["schedule"],
    counts: (d?.counts ?? { overrides: [] }) as PlanForm["counts"],
    supply: (d?.supply ?? {
      overrides: [],
      deliveries: [],
      inventory: [],
    }) as SupplySettings,
  };
}
export function recipeForm(r?: RecordRow): RecipeForm {
  const d = r?.data;
  return {
    name: String(d?.name ?? ""),
    clientId: d?.clientId ? String(d.clientId) : null,
    yieldServings: Number(d?.yieldServings ?? 10),
    method: String(d?.method ?? ""),
    items: (d?.items ?? { lines: [] }) as RecipeForm["items"],
    active: d?.active !== false,
  };
}

export interface SupplySettings {
  overrides: Array<{
    ingredientId: string;
    productId: string;
    quantityPerSalesUnit: number;
    source: string;
  }>;
  deliveries: Array<{
    centerId: string;
    consumptionDate: string;
    deliveryDate: string;
  }>;
  inventory: Array<{
    centerId: string;
    ingredientId: string;
    quantity: number;
    source: string;
  }>;
}
export const nutrientLabels: Record<string, string> = {
  energyKcal: "Energía (kcal)",
  proteinG: "Proteínas (g)",
  carbohydrateG: "Hidratos (g)",
  sugarsG: "Azúcares (g)",
  fatG: "Grasas (g)",
  saturatedFatG: "Saturadas (g)",
  fiberG: "Fibra (g)",
  saltG: "Sal (g)",
};
