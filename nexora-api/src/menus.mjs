import { menuResources } from "./menu-schema.mjs";
import { validate } from "./schema.mjs";
import { snapshotHash } from "./workflow-rules.mjs";
import { validDate } from "./order-rules.mjs";
export const menuFail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const fail = menuFail;
const positive = (v) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1000000;
const nonnegative = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000000;
const round = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const fields = (input, keys) => {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    fail("Unknown menu field");
};
const stale = (row, v) => {
  if (row.version !== v) fail("Record changed. Reload before saving.", 409);
};
export function planDates(start, end) {
  if (!validDate(start) || !validDate(end) || end < start)
    fail("Invalid menu date range");
  const n = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (n > 30) fail("Menu plans support up to 31 days");
  return Array.from({ length: n + 1 }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}
export class MenusService {
  constructor(store) {
    this.store = store;
  }
  async required(t, r, id) {
    const row = await this.store.get(t, r, id);
    if (!row) fail("Record not found", 404);
    return row;
  }
  async catalog(t) {
    const keys = [
      "menuIngredients",
      "ingredientProducts",
      "recipes",
      "recipeVersions",
      "products",
      "clients",
      "centers",
      "diets",
      "centerDiners",
      "productAllergens",
      "allergens",
    ];
    // A transaction uses one PostgreSQL connection; do not queue parallel queries on it.
    const result = {};
    for (const key of keys) result[key] = await this.store.list(t, key);
    return result;
  }
  async write(t, fn) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      return fn();
    });
  }
  async saveIngredient(t, id, input, actor) {
    fields(input, ["name", "unit", "active", "version"]);
    return this.write(t, async () => {
      const data = validate(
        "menuIngredients",
        { name: input.name, unit: input.unit, active: input.active },
        menuResources,
      );
      const old = id ? await this.required(t, "menuIngredients", id) : null;
      if (old) {
        stale(old, input.version);
        if (
          old.data.unit !== data.unit &&
          ((await this.store.list(t, "ingredientProducts")).some(
            (m) => m.data.ingredientId === id,
          ) ||
            (await this.store.list(t, "recipeVersions")).some((r) =>
              r.data.snapshot.items.lines.some((l) => l.ingredientId === id),
            ))
        )
          fail("Referenced ingredient units cannot be changed");
      }
      return old
        ? this.store.update(t, "menuIngredients", id, data, old.version, actor)
        : this.store.create(t, "menuIngredients", data, actor);
    });
  }
  async saveMapping(t, input, actor) {
    fields(input, [
      "ingredientId",
      "productId",
      "quantityPerSalesUnit",
      "source",
      "version",
    ]);
    return this.write(t, async () => {
      const ingredient = await this.required(
          t,
          "menuIngredients",
          input.ingredientId,
        ),
        p = await this.required(t, "products", input.productId);
      if (!ingredient.data.active || !p.data.active)
        fail("Select active ingredients and products");
      if (!positive(input.quantityPerSalesUnit))
        fail("A positive pack conversion is required");
      const old = (await this.store.list(t, "ingredientProducts")).find(
        (m) => m.data.ingredientId === input.ingredientId,
      );
      const { version, ...data } = input;
      if (old) {
        stale(old, version);
        return this.store.update(
          t,
          "ingredientProducts",
          old.id,
          data,
          old.version,
          actor,
        );
      }
      if (version != null) fail("Record changed. Reload before saving.", 409);
      return this.store.create(t, "ingredientProducts", data, actor);
    });
  }
  async recipeData(t, input, revision) {
    fields(input, [
      "name",
      "clientId",
      "yieldServings",
      "method",
      "items",
      "active",
      "version",
    ]);
    if (
      !Number.isInteger(input.yieldServings) ||
      !positive(input.yieldServings)
    )
      fail("Recipe servings must be a positive integer");
    fields(input.items, ["lines"]);
    if (
      !Array.isArray(input.items.lines) ||
      !input.items.lines.length ||
      input.items.lines.length > 100
    )
      fail("Recipes require 1 to 100 ingredients");
    const seen = new Set();
    for (const line of input.items.lines) {
      fields(line, ["ingredientId", "quantity"]);
      const ingredient = await this.required(
        t,
        "menuIngredients",
        line.ingredientId,
      );
      if (
        !ingredient.data.active ||
        !positive(line.quantity) ||
        seen.has(line.ingredientId)
      )
        fail("Invalid or duplicate recipe ingredient");
      seen.add(line.ingredientId);
    }
    if (input.clientId) await this.required(t, "clients", input.clientId);
    const { version, ...data } = input;
    return validate("recipes", { ...data, revision }, menuResources);
  }
  async saveRecipe(t, id, input, actor) {
    return this.write(t, async () => {
      const old = id ? await this.required(t, "recipes", id) : null;
      if (old) stale(old, input.version);
      const data = await this.recipeData(
        t,
        input,
        (old?.data.revision ?? 0) + 1,
      );
      const row = old
        ? await this.store.update(t, "recipes", id, data, old.version, actor)
        : await this.store.create(t, "recipes", data, actor);
      await this.store.create(
        t,
        "recipeVersions",
        {
          recipeId: row.id,
          revision: data.revision,
          snapshot: data,
          createdAt: new Date().toISOString(),
        },
        actor,
      );
      return row;
    });
  }
  async planData(t, input, revision, parentId = null) {
    fields(input, [
      "name",
      "clientId",
      "centerIds",
      "startDate",
      "endDate",
      "service",
      "origin",
      "sourceReference",
      "marginPercent",
      "schedule",
      "counts",
      "version",
    ]);
    planDates(input.startDate, input.endDate);
    const client = await this.required(t, "clients", input.clientId);
    if (!client.data.active) fail("Select an active client");
    if (
      !Array.isArray(input.centerIds) ||
      !input.centerIds.length ||
      input.centerIds.length > 100 ||
      new Set(input.centerIds).size !== input.centerIds.length
    )
      fail("Select unique centers for the menu");
    for (const id of input.centerIds) {
      const c = await this.required(t, "centers", id);
      if (c.data.clientId !== client.id)
        fail("Center does not belong to the selected client");
    }
    fields(input.schedule, ["entries"]);
    if (
      !Array.isArray(input.schedule.entries) ||
      input.schedule.entries.length > 1000
    )
      fail("Maximum 1000 menu entries");
    const seen = new Set();
    for (const e of input.schedule.entries) {
      fields(e, ["date", "dietId", "course", "recipeVersionId", "centerId"]);
      if (
        !validDate(e.date) ||
        e.date < input.startDate ||
        e.date > input.endDate ||
        !["FIRST", "MAIN", "SIDE", "DESSERT", "DRINK"].includes(e.course) ||
        (e.centerId && !input.centerIds.includes(e.centerId))
      )
        fail("Invalid menu entry");
      await this.required(t, "diets", e.dietId);
      const r = await this.required(t, "recipeVersions", e.recipeVersionId);
      if (r.data.snapshot.clientId && r.data.snapshot.clientId !== client.id)
        fail("Recipe belongs to another client");
      const key = [e.date, e.dietId, e.course, e.centerId ?? ""].join("|");
      if (seen.has(key)) fail("Duplicate menu slot");
      seen.add(key);
    }
    fields(input.counts, ["overrides"]);
    if (
      !Array.isArray(input.counts.overrides) ||
      input.counts.overrides.length > 5000
    )
      fail("Invalid diner overrides");
    const counts = new Set();
    for (const c of input.counts.overrides) {
      fields(c, ["centerId", "date", "dietId", "count"]);
      if (
        !input.centerIds.includes(c.centerId) ||
        !validDate(c.date) ||
        c.date < input.startDate ||
        c.date > input.endDate ||
        !Number.isInteger(c.count) ||
        !nonnegative(c.count)
      )
        fail("Invalid diner overrides");
      await this.required(t, "diets", c.dietId);
      const key = [c.centerId, c.date, c.dietId].join("|");
      if (counts.has(key)) fail("Duplicate diner override");
      counts.add(key);
    }
    if (
      input.origin === "CLIENT_REFERENCE" &&
      (!input.sourceReference || !input.sourceReference.trim())
    )
      fail("Client menus require a source reference");
    const { version, ...data } = input;
    return validate(
      "menuPlans",
      {
        ...data,
        revision,
        parentId,
        state: "DRAFT",
        nutritionApproval: {},
        qualityApproval: {},
        publishedSnapshot: {},
      },
      menuResources,
    );
  }
  async savePlan(t, id, input, actor) {
    return this.write(t, async () => {
      const old = id ? await this.required(t, "menuPlans", id) : null;
      if (old) {
        stale(old, input.version);
        if (["PUBLISHED", "ARCHIVED"].includes(old.data.state))
          fail("Published menus are immutable. Create a new revision.", 409);
      }
      const data = await this.planData(
        t,
        input,
        (old?.data.revision ?? 0) + 1,
        old?.data.parentId ?? null,
      );
      return old
        ? this.store.update(t, "menuPlans", id, data, old.version, actor)
        : this.store.create(t, "menuPlans", data, actor);
    });
  }
  async copyPlan(t, id, version, actor) {
    return this.write(t, async () => {
      const old = await this.required(t, "menuPlans", id);
      stale(old, version);
      const d = old.data;
      return this.store.create(
        t,
        "menuPlans",
        {
          ...d,
          parentId: old.id,
          revision: d.revision + 1,
          state: "DRAFT",
          nutritionApproval: {},
          qualityApproval: {},
          publishedSnapshot: {},
        },
        actor,
      );
    });
  }
  async mockProposal(t, id, version, dietId, actor) {
    return this.write(t, async () => {
      const old = await this.required(t, "menuPlans", id);
      stale(old, version);
      if (["PUBLISHED", "ARCHIVED"].includes(old.data.state))
        fail("Published menus are immutable. Create a new revision.", 409);
      if (old.data.schedule.entries.length)
        fail("Mock generation requires an empty menu");
      await this.required(t, "diets", dietId);
      const c = await this.catalog(t),
        available = c.recipes
          .filter(
            (r) =>
              r.data.active &&
              (!r.data.clientId || r.data.clientId === old.data.clientId),
          )
          .map((r) =>
            c.recipeVersions.find(
              (v) =>
                v.data.recipeId === r.id && v.data.revision === r.data.revision,
            ),
          )
          .filter(Boolean);
      if (!available.length)
        fail("Create at least one recipe before generating a proposal");
      const entries = planDates(old.data.startDate, old.data.endDate).map(
        (date, i) => ({
          date,
          dietId,
          course: "MAIN",
          recipeVersionId: available[i % available.length].id,
          centerId: null,
        }),
      );
      return this.store.update(
        t,
        "menuPlans",
        id,
        {
          ...old.data,
          schedule: { entries },
          origin: "MOCK",
          sourceReference:
            "MOCK WEEKLY PROPOSAL — no nutrition or safety validation",
          revision: old.data.revision + 1,
          state: "DRAFT",
          nutritionApproval: {},
          qualityApproval: {},
        },
        old.version,
        actor,
      );
    });
  }
  async forecast(t, id, { live = false } = {}) {
    return this.write(t, async () => {
      const plan = await this.required(t, "menuPlans", id);
      if (
        !live &&
        ["PUBLISHED", "ARCHIVED"].includes(plan.data.state) &&
        plan.data.publishedSnapshot.hash
      )
        return { ...plan.data.publishedSnapshot, frozen: true };
      return this.calculate(plan, await this.catalog(t));
    });
  }
  calculate(plan, c) {
    const d = plan.data,
      issues = [],
      warnings = [],
      needs = new Map(),
      servings = [];
    const find = (key, id) => c[key].find((r) => r.id === id);
    const relevantProducts = new Map(),
      relevantMappings = new Map(),
      relevantDiets = new Map(),
      recipeSnapshots = new Map(),
      ingredientSnapshots = new Map();
    if (!d.schedule.entries.length) issues.push("EMPTY_MENU");
    for (const centerId of d.centerIds)
      for (const date of planDates(d.startDate, d.endDate)) {
        const diets = new Set([
          ...c.centerDiners
            .filter(
              (r) =>
                r.data.centerId === centerId && r.data.service === d.service,
            )
            .map((r) => r.data.dietId),
          ...d.counts.overrides
            .filter((o) => o.centerId === centerId && o.date === date)
            .map((o) => o.dietId),
        ]);
        for (const dietId of diets) {
          const count =
            d.counts.overrides.find(
              (o) =>
                o.centerId === centerId &&
                o.date === date &&
                o.dietId === dietId,
            )?.count ??
            c.centerDiners.find(
              (r) =>
                r.data.centerId === centerId &&
                r.data.dietId === dietId &&
                r.data.service === d.service,
            )?.data.count ??
            0;
          if (
            count > 0 &&
            !d.schedule.entries.some(
              (e) =>
                e.date === date &&
                e.dietId === dietId &&
                (!e.centerId || e.centerId === centerId),
            )
          )
            issues.push("MISSING_DIET_MENU");
        }
      }
    const slots = new Set(
      d.schedule.entries.map((e) => [e.date, e.dietId, e.course].join("|")),
    );
    for (const centerId of d.centerIds)
      for (const slot of slots) {
        const entries = d.schedule.entries.filter(
            (e) => [e.date, e.dietId, e.course].join("|") === slot,
          ),
          entry =
            entries.find((e) => e.centerId === centerId) ??
            entries.find((e) => !e.centerId);
        if (!entry) continue;
        const diet = find("diets", entry.dietId),
          rv = find("recipeVersions", entry.recipeVersionId);
        if (!diet || !rv) {
          issues.push("MISSING_REFERENCE");
          continue;
        }
        relevantDiets.set(diet.id, diet);
        recipeSnapshots.set(rv.id, rv);
        const override = d.counts.overrides.find(
            (o) =>
              o.centerId === centerId &&
              o.date === entry.date &&
              o.dietId === entry.dietId,
          ),
          base = c.centerDiners.find(
            (r) =>
              r.data.centerId === centerId &&
              r.data.dietId === entry.dietId &&
              r.data.service === d.service,
          );
        const count = override?.count ?? base?.data.count;
        if (count === undefined) {
          issues.push("MISSING_DINER_COUNT");
          continue;
        }
        servings.push({
          centerId,
          date: entry.date,
          dietId: diet.id,
          course: entry.course,
          recipeVersionId: rv.id,
          recipeName: rv.data.snapshot.name,
          count,
          source: override ? "DATE_OVERRIDE" : "BASE_COUNT",
        });
        if (count === 0) continue;
        for (const line of rv.data.snapshot.items.lines) {
          const ingredient = find("menuIngredients", line.ingredientId);
          if (!ingredient || !ingredient.data.active) {
            issues.push("INACTIVE_INGREDIENT");
            continue;
          }
          ingredientSnapshots.set(ingredient.id, ingredient);
          const key = [centerId, entry.date, ingredient.id].join("|");
          const need = needs.get(key) ?? {
            centerId,
            date: entry.date,
            ingredientId: ingredient.id,
            name: ingredient.data.name,
            unit: ingredient.data.unit,
            baseQuantity: 0,
            dietIds: [],
          };
          need.baseQuantity +=
            (line.quantity / rv.data.snapshot.yieldServings) * count;
          need.dietIds = [...new Set([...need.dietIds, diet.id])];
          needs.set(key, need);
        }
      }
    const procurement = [];
    for (const need of needs.values()) {
      need.baseQuantity = round(need.baseQuantity);
      need.withMargin = round(need.baseQuantity * (1 + d.marginPercent / 100));
      const mapping = c.ingredientProducts.find(
          (m) => m.data.ingredientId === need.ingredientId,
        ),
        product = mapping ? find("products", mapping.data.productId) : null;
      if (!mapping || !product) {
        if (need.withMargin > 0) issues.push("MISSING_PRODUCT_MAPPING");
        continue;
      }
      relevantProducts.set(product.id, product);
      relevantMappings.set(mapping.id, mapping);
      const links = c.productAllergens.filter(
        (a) => a.data.productId === product.id,
      );
      if (need.withMargin > 0) {
        if (!product.data.active) issues.push("INACTIVE_PRODUCT");
        if (!product.data.ingredients?.trim())
          issues.push("MISSING_TECHNICAL_INFORMATION");
        if (links.some((a) => !a.data.validated))
          issues.push("UNVALIDATED_ALLERGENS");
        if (!links.length) warnings.push("NO_DECLARED_ALLERGEN_LINKS");
        for (const dietId of need.dietIds) {
          const diet = find("diets", dietId);
          if (
            links.some((a) =>
              (diet.data.excludedAllergens ?? []).includes(a.data.allergenId),
            )
          )
            issues.push("DIET_ALLERGEN_CONFLICT");
        }
      }
      if (!positive(mapping.data.quantityPerSalesUnit)) {
        issues.push("INVALID_PACK_CONVERSION");
        continue;
      }
      const salesQuantity = ["BOX", "UNIT"].includes(product.data.unit)
        ? Math.ceil(need.withMargin / mapping.data.quantityPerSalesUnit)
        : Math.ceil(
            (need.withMargin / mapping.data.quantityPerSalesUnit) * 1000,
          ) / 1000;
      procurement.push({
        ...need,
        productId: product.id,
        sku: product.data.sku,
        productName: product.data.name,
        salesUnit: product.data.unit,
        quantityPerSalesUnit: mapping.data.quantityPerSalesUnit,
        salesQuantity,
        purchasedKitchenQuantity: round(
          salesQuantity * mapping.data.quantityPerSalesUnit,
        ),
        surplus: round(
          salesQuantity * mapping.data.quantityPerSalesUnit - need.withMargin,
        ),
        estimatedCostCents:
          typeof product.data.price === "number"
            ? Math.round(salesQuantity * product.data.price * 100)
            : null,
        indicativeStock: product.data.stock ?? null,
      });
    }
    // Different ingredients using one product must not silently double its pack rounding.
    const duplicateProducts = new Set();
    for (const row of procurement) {
      const key = [row.centerId, row.date, row.productId].join("|");
      if (duplicateProducts.has(key)) issues.push("AMBIGUOUS_PRODUCT_MAPPING");
      duplicateProducts.add(key);
    }
    const snapshot = {
      plan: {
        ...d,
        nutritionApproval: undefined,
        qualityApproval: undefined,
        publishedSnapshot: undefined,
        state: undefined,
      },
      client: find("clients", d.clientId),
      centers: d.centerIds.map((id) => find("centers", id)),
      recipes: [...recipeSnapshots.values()],
      ingredients: [...ingredientSnapshots.values()],
      mappings: [...relevantMappings.values()],
      products: [...relevantProducts.values()],
      diets: [...relevantDiets.values()],
      allergens: c.productAllergens.filter((a) =>
        relevantProducts.has(a.data.productId),
      ),
      servings,
      needs: [...needs.values()],
      procurement,
    };
    return {
      hash: snapshotHash(snapshot),
      snapshot,
      servings,
      needs: [...needs.values()],
      procurement,
      issues: [...new Set(issues)],
      warnings: [...new Set(warnings)],
      estimatedCostCents:
        !issues.some((i) =>
          [
            "MISSING_PRODUCT_MAPPING",
            "INVALID_PACK_CONVERSION",
            "AMBIGUOUS_PRODUCT_MAPPING",
          ].includes(i),
        ) && procurement.every((r) => r.estimatedCostCents !== null)
          ? procurement.reduce((n, r) => n + r.estimatedCostCents, 0)
          : null,
      frozen: false,
    };
  }
  async transition(t, id, input, role, actor, action) {
    fields(input, ["version", "evidence"]);
    if (!actor) fail("Access denied", 403);
    return this.write(t, async () => {
      const o = await this.required(t, "menuPlans", id);
      stale(o, input.version);
      const d = o.data;
      if (action === "archive") {
        if (d.state !== "PUBLISHED")
          fail("Only published menus can be archived");
        return this.store.update(
          t,
          "menuPlans",
          id,
          { ...d, state: "ARCHIVED" },
          o.version,
          actor,
        );
      }
      if (["PUBLISHED", "ARCHIVED"].includes(d.state))
        fail("Published menus are immutable. Create a new revision.", 409);
      const f = this.calculate(o, await this.catalog(t));
      if (action === "review") {
        if (!d.schedule.entries.length)
          fail("Add recipes to the menu before review");
        return this.store.update(
          t,
          "menuPlans",
          id,
          {
            ...d,
            state: "IN_REVIEW",
            nutritionApproval: {},
            qualityApproval: {},
          },
          o.version,
          actor,
        );
      }
      if (!["IN_REVIEW", "APPROVED"].includes(d.state))
        fail("Submit the menu for review first");
      if (action === "publish") {
        if (
          d.nutritionApproval.hash !== f.hash ||
          d.qualityApproval.hash !== f.hash ||
          f.issues.length
        )
          fail("Current nutrition and quality approvals are required");
        return this.store.update(
          t,
          "menuPlans",
          id,
          {
            ...d,
            state: "PUBLISHED",
            publishedSnapshot: {
              ...f,
              publishedAt: new Date().toISOString(),
              publishedBy: actor,
            },
          },
          o.version,
          actor,
        );
      }
      if (
        (action === "nutrition" && role !== "nutrition_menus") ||
        (action === "quality" && role !== "quality")
      )
        fail("Only the assigned specialist can approve this menu", 403);
      if (
        typeof input.evidence !== "string" ||
        !input.evidence.trim() ||
        input.evidence.length > 4000
      )
        fail("An approval reference is required");
      if (action === "quality" && f.issues.length)
        fail("Resolve menu technical issues before quality approval");
      if (
        f.issues.some((i) =>
          [
            "EMPTY_MENU",
            "MISSING_REFERENCE",
            "MISSING_DINER_COUNT",
            "INACTIVE_INGREDIENT",
            "MISSING_DIET_MENU",
          ].includes(i),
        )
      )
        fail("Resolve menu planning issues before approval");
      const key =
          action === "nutrition" ? "nutritionApproval" : "qualityApproval",
        data = {
          ...d,
          [key]: {
            hash: f.hash,
            revision: d.revision,
            actorId: actor,
            at: new Date().toISOString(),
            evidence: input.evidence.trim(),
          },
        };
      data.state =
        data.nutritionApproval.hash === f.hash &&
        data.qualityApproval.hash === f.hash
          ? "APPROVED"
          : "IN_REVIEW";
      return this.store.update(t, "menuPlans", id, data, o.version, actor);
    });
  }
}
