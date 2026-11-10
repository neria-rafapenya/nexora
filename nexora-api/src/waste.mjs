import { snapshotHash } from "./workflow-rules.mjs";
import { validDate } from "./order-rules.mjs";
import { businessDate } from "./document-rules.mjs";
import { wasteReasons, services } from "./waste-schema.mjs";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const fields = (v, keys) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    fail("Unknown waste field");
};
const ref = (s) => typeof s === "string" && !!s.trim() && s.length <= 4000;
const amount = (n) =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  n >= 0 &&
  n <= 1000000 &&
  Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001;
const version = (r, v) => {
  if (r.version !== v) fail("Record changed. Reload before saving.", 409);
};
const emptyRecord = {
  recordedBy: null,
  recordedAt: null,
  voidReason: null,
  voidedBy: null,
  voidedAt: null,
};
const common = [
  "centerId",
  "date",
  "service",
  "menuPlanId",
  "dietId",
  "sourceReference",
  "notes",
  "isMock",
];
const eventFields = [
  ...common,
  "sourceKind",
  "productId",
  "recipeVersionId",
  "reason",
  "quantity",
  "unit",
  "lot",
  "useBy",
  "traceabilityReference",
  "destinationKind",
  "destinationTarget",
];
const actualFields = [...common, "produced", "served"];
const actionFields = [
  "centerId",
  "title",
  "reason",
  "ownerName",
  "dueDate",
  "targetReductionPercent",
  "linkedEventIds",
  "notes",
  "isMock",
];
export class WasteService {
  constructor(store) {
    this.store = store;
  }
  async required(t, r, id) {
    const row = await this.store.get(t, r, id);
    if (!row) fail("Record not found", 404);
    return row;
  }
  async write(t, fn) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      return fn();
    });
  }
  async catalog(t) {
    const keys = [
      "centers",
      "clients",
      "products",
      "menuIngredients",
      "ingredientProducts",
      "recipes",
      "recipeVersions",
      "diets",
      "centerDiners",
      "menuPlans",
    ];
    const c = {};
    for (const k of keys) c[k] = await this.store.list(t, k);
    return c;
  }
  async context(t, input) {
    if (!validDate(input.date) || input.date > businessDate())
      fail("Waste observations require a valid non-future date");
    if (
      !services.includes(input.service) ||
      !ref(input.sourceReference) ||
      typeof input.isMock !== "boolean"
    )
      fail("A service, source and data classification are required");
    const center = await this.required(t, "centers", input.centerId),
      client = await this.required(t, "clients", center.data.clientId),
      diet = input.dietId
        ? await this.required(t, "diets", input.dietId)
        : null;
    let plan = null,
      planSnapshot = null;
    if (input.menuPlanId) {
      plan = await this.required(t, "menuPlans", input.menuPlanId);
      planSnapshot = plan.data.publishedSnapshot;
      if (
        !["PUBLISHED", "ARCHIVED"].includes(plan.data.state) ||
        !planSnapshot.hash ||
        plan.data.clientId !== center.data.clientId ||
        !plan.data.centerIds.includes(center.id) ||
        plan.data.service !== input.service ||
        input.date < plan.data.startDate ||
        input.date > plan.data.endDate ||
        !diet
      )
        fail("Select a published menu matching center, service, date and diet");
      if (
        !planSnapshot.servings.some(
          (s) =>
            s.centerId === center.id &&
            s.date === input.date &&
            s.dietId === diet.id,
        )
      )
        fail("Diet has no slot in the selected published menu");
    }
    return { center, client, diet, plan, planSnapshot };
  }
  async eventData(t, input) {
    fields(input, eventFields);
    const context = await this.context(t, input),
      c = await this.catalog(t);
    if (
      !wasteReasons.includes(input.reason) ||
      !amount(input.quantity) ||
      input.quantity <= 0
    )
      fail("A cause and positive measured quantity are required");
    if (input.useBy && !validDate(input.useBy))
      fail("Invalid traceability date");
    if (
      !["DISPOSAL", "RETURN", "DONATION_CANDIDATE"].includes(
        input.destinationKind,
      )
    )
      fail("Invalid waste destination");
    let unitCostCents = null,
      source,
      referenceProducts = [],
      isMock =
        input.isMock ||
        !!context.planSnapshot?.isMock ||
        context.plan?.data.origin === "MOCK" ||
        !!context.diet?.data.rules?.demo;
    if (input.sourceKind === "PRODUCT") {
      if (!input.productId || input.recipeVersionId)
        fail("Select exactly one waste source");
      const p = await this.required(t, "products", input.productId);
      if (input.unit !== p.data.unit)
        fail("Product waste must use the catalog sales unit");
      const priced = context.planSnapshot
        ? context.planSnapshot.snapshot?.products?.find((v) => v.id === p.id)
        : p;
      if (context.planSnapshot && !priced)
        fail("Product is not in the selected menu context");
      unitCostCents =
        priced.data.unit === input.unit && typeof priced.data.price === "number"
          ? priced.data.price * 100
          : null;
      source = { product: priced };
      referenceProducts = [priced];
      isMock ||= p.data.brand === "Nexora Sample";
    } else if (input.sourceKind === "RECIPE") {
      if (!input.recipeVersionId || input.productId || input.unit !== "PORTION")
        fail("Recipe waste must use servings and one recipe version");
      const rv = await this.required(
          t,
          "recipeVersions",
          input.recipeVersionId,
        ),
        recipe = rv.data.snapshot;
      if (recipe.clientId && recipe.clientId !== context.center.data.clientId)
        fail("Recipe belongs to another client");
      if (
        context.planSnapshot &&
        !context.planSnapshot.servings.some(
          (s) =>
            s.centerId === input.centerId &&
            s.date === input.date &&
            s.dietId === input.dietId &&
            s.recipeVersionId === rv.id,
        )
      )
        fail("Recipe is not in the selected menu slot");
      const mappings =
          context.planSnapshot?.snapshot?.mappings ?? c.ingredientProducts,
        products = context.planSnapshot?.snapshot?.products ?? c.products;
      let total = 0,
        complete = true;
      const lines = [];
      for (const line of recipe.items.lines) {
        const mapping = mappings.find(
            (m) => m.data.ingredientId === line.ingredientId,
          ),
          p = products.find((p) => p.id === mapping?.data.productId);
        if (
          !mapping ||
          !p ||
          typeof p.data.price !== "number" ||
          !(
            typeof mapping.data.quantityPerSalesUnit === "number" &&
            Number.isFinite(mapping.data.quantityPerSalesUnit)
          ) ||
          mapping.data.quantityPerSalesUnit <= 0
        ) {
          complete = false;
          continue;
        }
        total +=
          (line.quantity / mapping.data.quantityPerSalesUnit) *
          p.data.price *
          100;
        referenceProducts.push(p);
        lines.push({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          mapping,
          product: p,
        });
        isMock ||= p.data.brand === "Nexora Sample";
      }
      unitCostCents = complete ? total / recipe.yieldServings : null;
      source = { recipeVersion: rv, costLines: lines };
    } else fail("Select a product or recipe waste source");
    if (
      input.destinationKind !== "DISPOSAL" &&
      (!ref(input.destinationTarget) ||
        !ref(input.traceabilityReference) ||
        !ref(input.lot))
    )
      fail("Return or donation needs destination, batch and traceability");
    if (input.destinationKind === "DONATION_CANDIDATE") {
      if (["EXPIRY", "DETERIORATION", "PLATE_LEFTOVERS"].includes(input.reason))
        fail("This waste cause cannot be proposed for donation");
      if (!input.useBy || input.useBy < input.date)
        fail("Donation candidates require a non-expired use-by date");
    }
    const estimatedCostCents =
      unitCostCents === null
        ? null
        : Math.round(unitCostCents * input.quantity);
    if (
      estimatedCostCents !== null &&
      !Number.isSafeInteger(estimatedCostCents)
    )
      fail("Waste cost exceeds supported limits");
    const data = {
      ...input,
      productId: input.productId || null,
      recipeVersionId: input.recipeVersionId || null,
      menuPlanId: input.menuPlanId || null,
      dietId: input.dietId || null,
      unitCostCents,
      estimatedCostCents,
      isMock,
      snapshot: {
        centerName: context.center.data.name,
        clientId: context.client.id,
        clientName: context.client.data.name,
        dietName: context.diet?.data.name ?? null,
        source,
        referenceProducts,
        menuHash: context.planSnapshot?.hash ?? null,
        costBasis: context.planSnapshot
          ? "PUBLISHED_MENU_INGREDIENT_COST"
          : "CURRENT_CATALOG_INGREDIENT_COST",
        capturedAt: new Date().toISOString(),
      },
    };
    return data;
  }
  async actualData(t, input) {
    fields(input, actualFields);
    const context = await this.context(t, input);
    if (
      !context.diet ||
      ![input.produced, input.served].every(
        (n) => amount(n) && Number.isInteger(n),
      ) ||
      input.served > input.produced
    )
      fail(
        "Served counts must be whole numbers and cannot exceed produced counts",
      );
    let planned = null;
    if (context.planSnapshot) {
      const counts = new Set(
        context.planSnapshot.servings
          .filter(
            (s) =>
              s.centerId === input.centerId &&
              s.date === input.date &&
              s.dietId === input.dietId,
          )
          .map((s) => s.count),
      );
      if (counts.size !== 1) fail("Menu serving counts are inconsistent");
      planned = [...counts][0];
    } else
      planned =
        (await this.store.list(t, "centerDiners")).find(
          (r) =>
            r.data.centerId === input.centerId &&
            r.data.dietId === input.dietId &&
            r.data.service === input.service,
        )?.data.count ?? null;
    return {
      ...input,
      menuPlanId: input.menuPlanId || null,
      planned,
      isMock:
        input.isMock ||
        !!context.planSnapshot?.isMock ||
        context.plan?.data.origin === "MOCK" ||
        !!context.diet.data.rules?.demo,
      snapshot: {
        centerName: context.center.data.name,
        clientId: context.client.id,
        dietName: context.diet.data.name,
        planned,
        plannedSource: context.planSnapshot
          ? "PUBLISHED_MENU"
          : "HABITUAL_DINERS",
        menuHash: context.planSnapshot?.hash ?? null,
        capturedAt: new Date().toISOString(),
      },
    };
  }
  async saveMeasurement(t, type, id, input, actor) {
    const table = type === "events" ? "wasteEvents" : "serviceActuals",
      allowed = type === "events" ? eventFields : actualFields;
    fields(input, [...allowed, "createKey", "version"]);
    return this.write(t, async () => {
      const old = id ? await this.required(t, table, id) : null;
      if (old) {
        version(old, input.version);
        if (old.data.state !== "DRAFT")
          fail(
            "Recorded observations are immutable. Void and replace the record",
            409,
          );
      } else {
        if (
          typeof input.createKey !== "string" ||
          !/^[a-zA-Z0-9_-]{8,100}$/.test(input.createKey)
        )
          fail("A creation request key is required");
        const existing = (await this.store.list(t, table)).find(
          (r) => r.data.createKey === input.createKey,
        );
        const { createKey, version, ...raw } = input;
        if (existing) {
          if (existing.data.creationHash !== snapshotHash(raw))
            fail("Creation key was used with different data", 409);
          return existing;
        }
      }
      const { createKey, version: inputVersion, ...raw } = input,
        data =
          type === "events"
            ? await this.eventData(t, raw)
            : await this.actualData(t, raw);
      const record = {
        ...data,
        ...emptyRecord,
        state: "DRAFT",
        createKey: old?.data.createKey ?? createKey,
        creationHash: old?.data.creationHash ?? snapshotHash(raw),
        ...(type === "events"
          ? {
              destinationState: "NOT_STARTED",
              qualityDecision: {},
              completion: {},
            }
          : {}),
      };
      return old
        ? this.store.update(t, table, id, record, old.version, actor)
        : this.store.create(t, table, record, actor);
    });
  }
  async measurementAction(t, type, id, input, action, role, actor) {
    fields(input, ["version", "reason", "evidence", "confirmed"]);
    if (!actor) fail("Access denied", 403);
    const table = type === "events" ? "wasteEvents" : "serviceActuals";
    return this.write(t, async () => {
      const old = await this.required(t, table, id);
      version(old, input.version);
      const d = old.data;
      if (action === "record") {
        if (d.state !== "DRAFT" || input.confirmed !== true)
          fail("Confirm a draft observation before recording");
        if (type === "actuals") {
          const duplicate = (await this.store.list(t, table)).some(
            (r) =>
              r.id !== id &&
              r.data.state === "RECORDED" &&
              ["centerId", "date", "service", "dietId"].every(
                (k) => r.data[k] === d[k],
              ),
          );
          if (duplicate)
            fail(
              "A service observation already exists. Void it before replacing",
              409,
            );
        }
        return this.store.update(
          t,
          table,
          id,
          {
            ...d,
            state: "RECORDED",
            recordedBy: actor,
            recordedAt: new Date().toISOString(),
            ...(type === "events"
              ? {
                  destinationState:
                    d.destinationKind === "DISPOSAL"
                      ? "READY"
                      : "PENDING_QUALITY",
                }
              : {}),
          },
          old.version,
          actor,
        );
      }
      if (action === "void") {
        if (
          d.state === "VOID" ||
          !ref(input.reason) ||
          input.confirmed !== true
        )
          fail("Confirm the void and provide its reason");
        return this.store.update(
          t,
          table,
          id,
          {
            ...d,
            state: "VOID",
            voidReason: input.reason.trim(),
            voidedBy: actor,
            voidedAt: new Date().toISOString(),
          },
          old.version,
          actor,
        );
      }
      if (type !== "events" || d.state !== "RECORDED")
        fail("Record the waste observation before processing its destination");
      if (action === "approve" || action === "reject") {
        if (role !== "quality")
          fail("Only Quality can review waste destinations", 403);
        if (
          d.destinationState !== "PENDING_QUALITY" ||
          !ref(input.evidence) ||
          input.confirmed !== true
        )
          fail("Confirm the pending destination review and provide evidence");
        if (
          action === "approve" &&
          d.destinationKind === "DONATION_CANDIDATE" &&
          (!d.useBy ||
            d.useBy < businessDate() ||
            ["EXPIRY", "DETERIORATION", "PLATE_LEFTOVERS"].includes(d.reason))
        )
          fail("The donation candidate is no longer eligible for review");
        return this.store.update(
          t,
          table,
          id,
          {
            ...d,
            destinationState: action === "approve" ? "APPROVED" : "REJECTED",
            qualityDecision: {
              ...d.qualityDecision,
              [action]: {
                actorId: actor,
                at: new Date().toISOString(),
                evidence: input.evidence.trim(),
              },
            },
          },
          old.version,
          actor,
        );
      }
      if (action === "discard") {
        if (
          d.destinationKind === "DISPOSAL" ||
          d.destinationState === "COMPLETED" ||
          !ref(input.reason) ||
          input.confirmed !== true
        )
          fail(
            "Only an unfinished non-disposal destination can be changed with a reason",
          );
        return this.store.update(
          t,
          table,
          id,
          {
            ...d,
            destinationKind: "DISPOSAL",
            destinationState: "READY",
            qualityDecision: {
              ...d.qualityDecision,
              rerouted: {
                actorId: actor,
                at: new Date().toISOString(),
                reason: input.reason.trim(),
                previousKind: d.destinationKind,
                previousTarget: d.destinationTarget,
              },
            },
            destinationTarget: "Disposal",
          },
          old.version,
          actor,
        );
      }
      if (action === "complete") {
        if (
          !["READY", "APPROVED"].includes(d.destinationState) ||
          !ref(input.evidence) ||
          input.confirmed !== true
        )
          fail("An authorized destination and execution evidence are required");
        if (
          d.destinationKind === "DONATION_CANDIDATE" &&
          d.useBy < businessDate()
        )
          fail("The donation candidate is no longer eligible for review");
        return this.store.update(
          t,
          table,
          id,
          {
            ...d,
            destinationState: "COMPLETED",
            completion: {
              actorId: actor,
              completedAt: new Date().toISOString(),
              evidence: input.evidence.trim(),
              target: d.destinationTarget || "Disposal",
              kind: d.destinationKind,
            },
          },
          old.version,
          actor,
        );
      }
      fail("Unknown waste action");
    });
  }
  async saveAction(t, id, input, actor) {
    fields(input, [...actionFields, "createKey", "version"]);
    return this.write(t, async () => {
      const old = id ? await this.required(t, "wasteActions", id) : null;
      if (old) {
        version(old, input.version);
        if (["COMPLETED", "CANCELLED"].includes(old.data.state))
          fail("Closed improvement actions cannot be edited", 409);
      }
      const { version: v, createKey, ...data } = input;
      const requestHash = snapshotHash(data);
      if (!old) {
        if (
          typeof createKey !== "string" ||
          !/^[a-zA-Z0-9_-]{8,100}$/.test(createKey)
        )
          fail("A creation request key is required");
        const match = (await this.store.list(t, "wasteActions")).find(
          (a) => a.data.createKey === createKey,
        );
        if (match) {
          if (match.data.creationHash !== requestHash)
            fail("Creation key was used with different data", 409);
          return match;
        }
      }
      await this.required(t, "centers", data.centerId);
      if (
        !wasteReasons.includes(data.reason) ||
        !validDate(data.dueDate) ||
        !ref(data.title) ||
        !ref(data.ownerName) ||
        !ref(data.notes) ||
        typeof data.isMock !== "boolean"
      )
        fail("Complete the improvement action details");
      if (
        !Array.isArray(data.linkedEventIds) ||
        data.linkedEventIds.length > 100 ||
        new Set(data.linkedEventIds).size !== data.linkedEventIds.length
      )
        fail("Invalid linked waste records");
      for (const eventId of data.linkedEventIds) {
        const e = await this.required(t, "wasteEvents", eventId);
        if (e.data.centerId !== data.centerId || e.data.state !== "RECORDED")
          fail("Link recorded waste from the same center");
        data.isMock ||= e.data.isMock;
      }
      return old
        ? this.store.update(
            t,
            "wasteActions",
            id,
            { ...old.data, ...data },
            old.version,
            actor,
          )
        : this.store.create(
            t,
            "wasteActions",
            {
              ...data,
              state: "OPEN",
              outcome: {},
              createKey,
              creationHash: requestHash,
            },
            actor,
          );
    });
  }
  async actionProgress(t, id, input, actor) {
    fields(input, ["version", "state", "evidence"]);
    return this.write(t, async () => {
      const a = await this.required(t, "wasteActions", id);
      version(a, input.version);
      if (
        !["OPEN", "IN_PROGRESS"].includes(a.data.state) ||
        !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(input.state) ||
        !ref(input.evidence)
      )
        fail("An open action and progress evidence are required");
      return this.store.update(
        t,
        "wasteActions",
        id,
        {
          ...a.data,
          state: input.state,
          outcome: {
            ...a.data.outcome,
            [input.state]: {
              actorId: actor,
              at: new Date().toISOString(),
              evidence: input.evidence.trim(),
            },
          },
        },
        a.version,
        actor,
      );
    });
  }
  async report(t, filters = {}) {
    fields(filters, ["start", "end", "centerId", "service", "reason"]);
    if (
      (filters.start && !validDate(filters.start)) ||
      (filters.end && !validDate(filters.end)) ||
      (filters.start && filters.end && filters.end < filters.start)
    )
      fail("Invalid waste report date range");
    if (
      (filters.service && !services.includes(filters.service)) ||
      (filters.reason && !wasteReasons.includes(filters.reason))
    )
      fail("Invalid waste report filters");
    if (filters.centerId) await this.required(t, "centers", filters.centerId);
    const matches = (d) =>
      (!filters.start || d.date >= filters.start) &&
      (!filters.end || d.date <= filters.end) &&
      (!filters.centerId || d.centerId === filters.centerId) &&
      (!filters.service || d.service === filters.service);
    const events = (await this.store.list(t, "wasteEvents")).filter(
        (r) =>
          r.data.state === "RECORDED" &&
          matches(r.data) &&
          (!filters.reason || r.data.reason === filters.reason),
      ),
      actuals = (await this.store.list(t, "serviceActuals")).filter(
        (r) => r.data.state === "RECORDED" && matches(r.data),
      ),
      actions = await this.store.list(t, "wasteActions");
    const quantities = new Map(),
      causes = new Map(),
      groups = new Map();
    let estimatedCostCents = 0,
      unvalued = 0;
    for (const e of events) {
      const d = e.data,
        key = [d.centerId, d.unit].join("|"),
        q = quantities.get(key) ?? {
          centerId: d.centerId,
          unit: d.unit,
          quantity: 0,
          discarded: 0,
          returned: 0,
          donated: 0,
          pending: 0,
        };
      q.quantity += d.quantity;
      if (d.destinationState === "COMPLETED")
        q[
          {
            DISPOSAL: "discarded",
            RETURN: "returned",
            DONATION_CANDIDATE: "donated",
          }[d.destinationKind]
        ] += d.quantity;
      else q.pending += d.quantity;
      quantities.set(key, q);
      const causeKey = d.reason + "|" + d.unit,
        cause = causes.get(causeKey) ?? {
          reason: d.reason,
          unit: d.unit,
          quantity: 0,
          records: 0,
        };
      cause.quantity += d.quantity;
      cause.records++;
      causes.set(causeKey, cause);
      if (d.estimatedCostCents === null) unvalued++;
      else estimatedCostCents += d.estimatedCostCents;
    }
    let produced = 0,
      served = 0;
    for (const a of actuals) {
      const d = a.data;
      produced += d.produced;
      served += d.served;
      const key = [d.centerId, d.service, d.dietId].join("|"),
        g = groups.get(key) ?? {
          centerId: d.centerId,
          service: d.service,
          dietId: d.dietId,
          observations: 0,
          produced: 0,
          served: 0,
        };
      g.observations++;
      g.produced += d.produced;
      g.served += d.served;
      groups.set(key, g);
    }
    return {
      events,
      actuals,
      totals: {
        records: events.length,
        estimatedCostCents,
        unvalued,
        produced,
        served,
        unserved: produced - served,
        unservedPercent: produced
          ? Math.round(((produced - served) / produced) * 10000) / 100
          : null,
      },
      quantities: [...quantities.values()].map((q) =>
        Object.fromEntries(
          Object.entries(q).map(([k, v]) => [
            k,
            typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
          ]),
        ),
      ),
      causes: [...causes.values()].map((c) => ({
        ...c,
        quantity: Math.round(c.quantity * 1000) / 1000,
      })),
      planningReferences: [...groups.values()].map((g) => ({
        ...g,
        meanServed:
          g.observations >= 3 ? Math.round(g.served / g.observations) : null,
        meanProduced:
          g.observations >= 3 ? Math.round(g.produced / g.observations) : null,
      })),
      actions: actions
        .filter(
          (a) =>
            (!filters.centerId || a.data.centerId === filters.centerId) &&
            (!filters.reason || a.data.reason === filters.reason),
        )
        .map((a) => ({
          ...a,
          overdue:
            ["OPEN", "IN_PROGRESS"].includes(a.data.state) &&
            a.data.dueDate < businessDate(),
        })),
      containsMock:
        events.some((e) => e.data.isMock) ||
        actuals.some((e) => e.data.isMock) ||
        actions.some(
          (a) =>
            a.data.isMock &&
            (!filters.centerId || a.data.centerId === filters.centerId) &&
            (!filters.reason || a.data.reason === filters.reason),
        ),
    };
  }
}
