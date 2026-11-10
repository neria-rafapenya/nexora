import { usableDocument, documentStatus } from "./document-rules.mjs";
import { validate } from "./schema.mjs";
import { menuResources } from "./menu-schema.mjs";
import { snapshotHash } from "./workflow-rules.mjs";
import { deliveryProblems, validDate } from "./order-rules.mjs";
import { OrdersService } from "./orders.mjs";
export const nutrients = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "sugarsG",
  "fatG",
  "saturatedFatG",
  "fiberG",
  "saltG",
];
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (input, keys) => {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    fail("Unknown menu field");
};
const numeric = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000000;
const rounded = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const reference = (s) => typeof s === "string" && s.trim() && s.length <= 4000;
export function nutritionHash(d) {
  const { review, ...rest } = d;
  return snapshotHash(rest);
}
export function technicalSnapshot(product, links) {
  return {
    productId: product.id,
    ingredients: product.data.ingredients,
    glutenFree: product.data.glutenFree,
    pureedSuitable: product.data.pureedSuitable,
    allergens: links
      .filter((a) => a.data.productId === product.id)
      .map((a) => ({ id: a.id, ...a.data }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export async function validateSupply(service, t, input, plan) {
  const d = input ?? { overrides: [], deliveries: [], inventory: [] };
  clean(d, ["overrides", "deliveries", "inventory"]);
  for (const key of ["overrides", "deliveries", "inventory"])
    if (!Array.isArray(d[key]) || d[key].length > 1000)
      fail("Invalid procurement settings");
  const seen = new Set();
  for (const o of d.overrides) {
    clean(o, ["ingredientId", "productId", "quantityPerSalesUnit", "source"]);
    await service.required(t, "menuIngredients", o.ingredientId);
    const p = await service.required(t, "products", o.productId);
    if (
      !p.data.active ||
      !numeric(o.quantityPerSalesUnit) ||
      o.quantityPerSalesUnit <= 0 ||
      !reference(o.source) ||
      seen.has(o.ingredientId)
    )
      fail("Invalid procurement conversion");
    seen.add(o.ingredientId);
  }
  seen.clear();
  for (const o of d.deliveries) {
    clean(o, ["centerId", "consumptionDate", "deliveryDate"]);
    if (
      !plan.centerIds.includes(o.centerId) ||
      !validDate(o.consumptionDate) ||
      o.consumptionDate < plan.startDate ||
      o.consumptionDate > plan.endDate ||
      !validDate(o.deliveryDate) ||
      o.deliveryDate > o.consumptionDate ||
      Date.parse(o.consumptionDate) - Date.parse(o.deliveryDate) > 31 * 86400000
    )
      fail("Invalid delivery allocation");
    const k = o.centerId + "|" + o.consumptionDate;
    if (seen.has(k)) fail("Duplicate delivery allocation");
    seen.add(k);
  }
  seen.clear();
  for (const o of d.inventory) {
    clean(o, ["centerId", "ingredientId", "quantity", "source"]);
    await service.required(t, "menuIngredients", o.ingredientId);
    const k = o.centerId + "|" + o.ingredientId;
    if (
      !plan.centerIds.includes(o.centerId) ||
      !numeric(o.quantity) ||
      !reference(o.source) ||
      seen.has(k)
    )
      fail("Invalid declared inventory");
    seen.add(k);
  }
  return d;
}
export function enrichForecast(f, plan, c) {
  const issues = [...f.issues],
    rows = new Map(),
    profileRows = new Map(),
    ruleRows = new Map(),
    techRows = new Map(),
    documentEvidenceRows = new Map(),
    d = plan.data,
    supply = d.supply ?? { overrides: [], deliveries: [], inventory: [] };
  let mock = d.origin === "MOCK";
  const mapping = (id) =>
    f.snapshot.mappings.find((m) => m.data.ingredientId === id);
  for (const p of f.snapshot.products) {
    const h = snapshotHash(technicalSnapshot(p, c.productAllergens)),
      review = (c.productTechnicalReviews ?? [])
        .filter((r) => r.data.productId === p.id && r.data.hash === h)
        .at(-1);
    if (!review) issues.push("MISSING_TECHNICAL_REVIEW");
    else {
      techRows.set(review.id, review);
      if (review.data.documentEvidence?.versionId) {
        const doc = (c.supplierDocuments ?? []).find(
            (d) => d.id === review.data.documentEvidence.documentId,
          ),
          v = (c.documentVersions ?? []).find(
            (v) => v.id === review.data.documentEvidence.versionId,
          );
        if (
          !usableDocument(doc, v, c.documentVersions ?? [], p.id) ||
          p.data.supplierId !== doc?.data.supplierId
        )
          issues.push("SUPPLIER_DOCUMENT_NOT_CURRENT");
        mock ||= !!v?.data.isMock;
        if (doc)
          documentEvidenceRows.set(doc.id, {
            document: doc,
            version: v,
            status: documentStatus(doc, c.documentVersions ?? []),
          });
      }

      mock ||= review.data.isMock;
    }
  }
  for (const s of f.servings) {
    if (s.count === 0) continue;
    const key = [s.centerId, s.date, s.dietId].join("|");
    const row = rows.get(key) ?? {
      centerId: s.centerId,
      date: s.date,
      dietId: s.dietId,
      service: d.service,
      count: s.count,
      perServing: Object.fromEntries(nutrients.map((n) => [n, 0])),
      complete: true,
      checks: [],
    };
    const rv = f.snapshot.recipes.find((r) => r.id === s.recipeVersionId)?.data
      .snapshot;
    for (const line of rv?.items.lines ?? []) {
      const ingredient = f.snapshot.ingredients.find(
          (i) => i.id === line.ingredientId,
        ),
        m = mapping(line.ingredientId),
        profile = (c.nutritionProfiles ?? []).find(
          (p) => p.data.productId === m?.data.productId,
        ),
        basis = { KG: "PER_100_G", L: "PER_100_ML", UNIT: "PER_UNIT" }[
          ingredient?.data.unit
        ];
      if (
        !profile ||
        profile.data.basis !== basis ||
        profile.data.review.hash !== nutritionHash(profile.data)
      ) {
        row.complete = false;
        issues.push(
          !profile
            ? "MISSING_NUTRITION_PROFILE"
            : profile.data.basis !== basis
              ? "NUTRITION_BASIS_MISMATCH"
              : "UNREVIEWED_NUTRITION_PROFILE",
        );
        continue;
      }
      profileRows.set(profile.id, profile);
      mock ||= profile.data.isMock;
      const factor =
        (line.quantity / rv.yieldServings) * (basis === "PER_UNIT" ? 1 : 10);
      for (const n of nutrients)
        row.perServing[n] += profile.data.values[n] * factor;
    }
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    for (const n of nutrients) row.perServing[n] = rounded(row.perServing[n]);
    const rule = (c.dietMenuRules ?? []).find(
      (r) => r.data.dietId === row.dietId && r.data.service === d.service,
    );
    if (!rule || rule.data.review.hash !== nutritionHash(rule.data)) {
      issues.push(!rule ? "MISSING_DIET_RULES" : "UNREVIEWED_DIET_RULES");
      continue;
    }
    ruleRows.set(rule.id, rule);
    mock ||= rule.data.isMock;
    for (const [n, range] of Object.entries(rule.data.limits)) {
      const v = row.perServing[n],
        passed =
          row.complete &&
          (range.min == null || v >= range.min) &&
          (range.max == null || v <= range.max);
      row.checks.push({ nutrient: n, value: v, ...range, passed });
      if (row.complete && !passed) issues.push("NUTRIENT_LIMIT_VIOLATION");
    }
    const entries = f.servings.filter(
      (s) =>
        s.centerId === row.centerId &&
        s.date === row.date &&
        s.dietId === row.dietId &&
        s.count > 0,
    );
    for (const s of entries) {
      const recipe = f.snapshot.recipes.find((r) => r.id === s.recipeVersionId)
        ?.data.snapshot;
      for (const l of recipe?.items.lines ?? []) {
        if (rule.data.excludedIngredientIds.includes(l.ingredientId))
          issues.push("EXCLUDED_DIET_INGREDIENT");
        const m = mapping(l.ingredientId),
          p = f.snapshot.products.find((p) => p.id === m?.data.productId);
        const diet = c.diets.find((d) => d.id === row.dietId),
          legacy = diet?.data.rules ?? {};
        const profile = (c.nutritionProfiles ?? []).find(
          (n) => n.data.productId === p?.id,
        );
        const excluded = [
          ...(legacy.excludeMeat ? ["MEAT"] : []),
          ...(legacy.excludeFish ? ["FISH"] : []),
        ];
        if (excluded.length && !profile?.data.classificationComplete)
          issues.push("MISSING_FOOD_CLASSIFICATION");
        if (
          profile &&
          excluded.some((g) => profile.data.foodGroups.includes(g))
        )
          issues.push("EXCLUDED_FOOD_GROUP");
        const required = [
          ...rule.data.requiredClaims,
          ...(legacy.texture === "PUREED" ? ["pureedSuitable"] : []),
        ];
        if (p && required.some((claim) => p.data[claim] !== true))
          issues.push("MISSING_REQUIRED_DIET_CLAIM");
      }
    }
  }
  const allocation = new Map(),
    inventory = new Map(
      supply.inventory.map((i) => [
        i.centerId + "|" + i.ingredientId,
        i.quantity,
      ]),
    );
  for (const need of [...f.procurement].sort((a, b) =>
    a.date.localeCompare(b.date),
  )) {
    const deliveryDate =
      supply.deliveries.find(
        (a) => a.centerId === need.centerId && a.consumptionDate === need.date,
      )?.deliveryDate ?? need.date;
    const key = [need.centerId, deliveryDate, need.ingredientId].join("|");
    const item = allocation.get(key) ?? {
      ...need,
      deliveryDate,
      consumptionDates: [],
      grossQuantity: 0,
      declaredStockUsed: 0,
    };
    item.grossQuantity += need.withMargin;
    item.consumptionDates = [...new Set([...item.consumptionDates, need.date])];
    allocation.set(key, item);
  }
  const purchases = [];
  for (const item of [...allocation.values()].sort((a, b) =>
    a.deliveryDate.localeCompare(b.deliveryDate),
  )) {
    const k = item.centerId + "|" + item.ingredientId,
      available = inventory.get(k) ?? 0;
    item.grossQuantity = rounded(item.grossQuantity);
    item.declaredStockUsed = Math.min(item.grossQuantity, available);
    inventory.set(k, rounded(available - item.declaredStockUsed));
    item.netQuantity = rounded(item.grossQuantity - item.declaredStockUsed);
    const raw = item.netQuantity / item.quantityPerSalesUnit;
    item.salesQuantity = ["BOX", "UNIT"].includes(item.salesUnit)
      ? Math.ceil(raw)
      : Math.ceil(raw * 1000 - 1e-9) / 1000;
    item.surplus = rounded(
      item.salesQuantity * item.quantityPerSalesUnit - item.netQuantity,
    );
    const p = f.snapshot.products.find((p) => p.id === item.productId);
    item.estimatedCostCents =
      typeof p?.data.price === "number"
        ? Math.round(item.salesQuantity * p.data.price * 100)
        : null;
    const center = c.centers.find((c) => c.id === item.centerId);
    if (
      item.salesQuantity > 0 &&
      center &&
      deliveryProblems(center, item.deliveryDate).length
    )
      issues.push("INVALID_PURCHASE_DELIVERY");
    if (
      !Number.isFinite(item.salesQuantity) ||
      (item.estimatedCostCents !== null &&
        !Number.isSafeInteger(item.estimatedCostCents))
    )
      issues.push("PURCHASE_AMOUNT_LIMIT");
    purchases.push(item);
  }
  const snapshot = {
    ...f.snapshot,
    nutritionProfiles: [...profileRows.values()],
    dietRules: [...ruleRows.values()],
    technicalReviews: [...techRows.values()],
    supplierDocumentEvidence: [...documentEvidenceRows.values()],
    nutrition: [...rows.values()],
    purchases,
  };
  return {
    ...f,
    schemaVersion: 2,
    hash: snapshotHash(snapshot),
    snapshot,
    nutrition: [...rows.values()],
    purchases,
    issues: [...new Set(issues)],
    isMock: mock,
    estimatedPurchaseCostCents:
      issues.some((i) =>
        [
          "MISSING_PRODUCT_MAPPING",
          "MISSING_DIET_MENU",
          "MISSING_DINER_COUNT",
          "AMBIGUOUS_PRODUCT_MAPPING",
          "PURCHASE_AMOUNT_LIMIT",
        ].includes(i),
      ) || purchases.some((p) => p.estimatedCostCents === null)
        ? null
        : purchases.reduce((n, p) => n + p.estimatedCostCents, 0),
  };
}
export function attachMenuDetails(Type) {
  const calculate = Type.prototype.calculate;
  Type.prototype.calculate = function (plan, c) {
    const overrides = plan.data.supply?.overrides ?? [];
    const merged = {
      ...c,
      ingredientProducts: [
        ...c.ingredientProducts.filter(
          (m) => !overrides.some((o) => o.ingredientId === m.data.ingredientId),
        ),
        ...overrides.map((o) => ({
          id: "plan-" + o.ingredientId,
          version: plan.data.revision,
          data: o,
        })),
      ],
    };
    return enrichForecast(calculate.call(this, plan, merged), plan, c);
  };
  Object.assign(Type.prototype, {
    async saveNutrition(t, kind, input, role, actor) {
      if (!["profile", "rule"].includes(kind))
        fail("Invalid nutrition record type");
      clean(
        input,
        kind === "profile"
          ? [
              "productId",
              "basis",
              "values",
              "foodGroups",
              "classificationComplete",
              "source",
              "isMock",
              "version",
              "approve",
            ]
          : [
              "dietId",
              "service",
              "limits",
              "excludedIngredientIds",
              "requiredClaims",
              "source",
              "isMock",
              "version",
              "approve",
            ],
      );
      if (!["admin", "nutrition_menus"].includes(role) || !actor)
        fail("Access denied", 403);
      if (input.approve && role !== "nutrition_menus")
        fail("Only Nutrition can validate nutrition data", 403);
      return this.write(t, async () => {
        const { version, approve, ...data } = input;
        if (!reference(data.source) || typeof data.isMock !== "boolean")
          fail("A nutrition source and data classification are required");
        let table, key;
        if (kind === "profile") {
          table = "nutritionProfiles";
          const product = await this.required(t, "products", data.productId);
          if (product.data.brand === "Nexora Sample") data.isMock = true;
          clean(data.values, nutrients);
          if (nutrients.some((n) => !numeric(data.values[n])))
            fail("Provide all nutrient values, including explicit zeros");
          if (!["PER_100_G", "PER_100_ML", "PER_UNIT"].includes(data.basis))
            fail("Invalid nutrient basis");
          if (
            data.values.sugarsG > data.values.carbohydrateG ||
            data.values.saturatedFatG > data.values.fatG
          )
            fail("Inconsistent nutrient values");
          key = (r) => r.data.productId === data.productId;
        } else {
          table = "dietMenuRules";
          const diet = await this.required(t, "diets", data.dietId);
          if (diet.data.rules?.demo) data.isMock = true;
          clean(data.limits, nutrients);
          for (const range of Object.values(data.limits)) {
            clean(range, ["min", "max"]);
            if (
              !Object.keys(range).length ||
              Object.values(range).some((v) => !numeric(v)) ||
              (range.min != null && range.max != null && range.min > range.max)
            )
              fail("Invalid nutrient limits");
          }
          key = (r) =>
            r.data.dietId === data.dietId && r.data.service === data.service;
        }
        const old = (await this.store.list(t, table)).find(key);
        if ((old && old.version !== version) || (!old && version != null))
          fail("Record changed. Reload before saving.", 409);
        const normalized = validate(
          table,
          { ...data, review: {} },
          menuResources,
        );
        normalized.review = approve
          ? {
              hash: nutritionHash(normalized),
              actorId: actor,
              at: new Date().toISOString(),
            }
          : {};
        return old
          ? this.store.update(t, table, old.id, normalized, old.version, actor)
          : this.store.create(t, table, normalized, actor);
      });
    },
    async reviewTechnical(t, input, role, actor) {
      clean(input, [
        "productId",
        "productVersion",
        "documentVersionId",
        "ingredients",
        "source",
        "isMock",
      ]);
      if (role !== "quality" || !actor)
        fail("Only Quality can validate technical information", 403);
      if (
        !reference(input.ingredients) ||
        !reference(input.source) ||
        typeof input.isMock !== "boolean"
      )
        fail("Technical composition, source and classification are required");
      return this.write(t, async () => {
        const p = await this.required(t, "products", input.productId);
        if (p.version !== input.productVersion)
          fail("Record changed. Reload before saving.", 409);
        const links = (await this.store.list(t, "productAllergens")).filter(
          (a) => a.data.productId === p.id,
        );
        if (links.some((a) => !a.data.validated))
          fail("Validate product allergen associations first");
        let documentEvidence = {},
          documentIsMock = false;
        if (input.documentVersionId) {
          const v = await this.required(
              t,
              "documentVersions",
              input.documentVersionId,
            ),
            d = await this.required(t, "supplierDocuments", v.data.documentId),
            versions = await this.store.list(t, "documentVersions");
          if (
            !usableDocument(d, v, versions, p.id) ||
            p.data.supplierId !== d.data.supplierId
          )
            fail("Select a current approved document linked to this product");
          const declared = v.data.declarations ?? {};
          const normalize = (s) => s.trim().replace(/\s+/g, " ");
          if (
            declared.ingredients &&
            normalize(declared.ingredients) !== normalize(input.ingredients)
          )
            fail(
              "Technical composition must match the selected document declaration",
            );
          if (declared.allergensComplete) {
            const expected = {
                contains: [...declared.contains].sort(),
                traces: [...declared.traces].sort(),
              },
              actual = {
                contains: links
                  .filter((a) => a.data.kind === "CONTAINS")
                  .map((a) => a.data.allergenId)
                  .sort(),
                traces: links
                  .filter((a) => a.data.kind === "TRACES")
                  .map((a) => a.data.allergenId)
                  .sort(),
              };
            if (snapshotHash(expected) !== snapshotHash(actual))
              fail(
                "Product allergen associations differ from the selected document",
              );
          }
          for (const claim of ["glutenFree", "pureedSuitable"])
            if (
              declared[claim] !== undefined &&
              p.data[claim] !== declared[claim]
            )
              fail("Product claims differ from the selected document");
          documentIsMock = v.data.isMock;
          documentEvidence = {
            documentId: d.id,
            versionId: v.id,
            changeHash: v.data.changeHash,
          };
        }
        const updated = await this.store.update(
            t,
            "products",
            p.id,
            { ...p.data, ingredients: input.ingredients.trim() },
            p.version,
            actor,
          ),
          snapshot = technicalSnapshot(updated, links);
        return this.store.create(
          t,
          "productTechnicalReviews",
          {
            productId: p.id,
            snapshot,
            documentEvidence,
            hash: snapshotHash(snapshot),
            source: input.source,
            isMock:
              input.isMock ||
              p.data.brand === "Nexora Sample" ||
              documentIsMock,
            actorId: actor,
            reviewedAt: new Date().toISOString(),
          },
          actor,
        );
      });
    },
    async createPurchaseDrafts(t, id, input, actor) {
      clean(input, ["version"]);
      if (!actor) fail("Access denied", 403);
      return this.write(t, async () => {
        const p = await this.required(t, "menuPlans", id);
        if (p.version !== input.version)
          fail("Record changed. Reload before saving.", 409);
        const f = p.data.publishedSnapshot;
        if (
          p.data.state !== "PUBLISHED" ||
          f.schemaVersion !== 2 ||
          f.issues.length
        )
          fail("Publish a fully reviewed current menu before creating orders");
        const live = this.calculate(p, await this.catalog(t));
        if (live.hash !== f.hash || live.issues.length)
          fail(
            "Published source data changed. Create and approve a new menu revision",
          );
        const groups = new Map();
        for (const line of f.purchases) {
          if (line.salesQuantity <= 0) continue;
          const k = line.centerId + "|" + line.deliveryDate;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(line);
        }
        const links = await this.store.list(t, "menuPurchaseLinks"),
          orders = [],
          service = new OrdersService(this.store);
        for (const [key, lines] of groups) {
          const existing = links.find(
            (l) =>
              l.data.planId === id &&
              l.data.planHash === f.hash &&
              l.data.groupKey === key,
          );
          if (existing) {
            orders.push(
              await this.required(t, "orders", existing.data.orderId),
            );
            continue;
          }
          const [centerId, deliveryDate] = key.split("|");
          const order = await service.createOrder(
              t,
              { clientId: p.data.clientId, centerId, deliveryDate },
              actor,
            ),
            quantities = new Map();
          for (const l of lines)
            quantities.set(
              l.productId,
              (quantities.get(l.productId) ?? 0) + l.salesQuantity,
            );
          const view = await service.saveReview(
            t,
            order.id,
            {
              version: order.version,
              clientId: p.data.clientId,
              centerId,
              deliveryDate,
              lines: [...quantities].map(([productId, quantity]) => ({
                productId,
                quantity,
                unit: lines.find((l) => l.productId === productId).salesUnit,
                reviewAccepted: false,
                originalText:
                  "MENU PROCUREMENT PROPOSAL — " +
                  p.data.name +
                  (f.isMock ? " — MOCK DATA" : ""),
              })),
            },
            actor,
          );
          await this.store.create(
            t,
            "menuPurchaseLinks",
            {
              planId: id,
              orderId: order.id,
              planHash: f.hash,
              groupKey: key,
              createdAt: new Date().toISOString(),
            },
            actor,
          );
          orders.push(view.order);
        }
        return orders;
      });
    },
  });
}
