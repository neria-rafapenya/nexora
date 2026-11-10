import { readImport } from "./imports.mjs";
import { snapshotHash } from "./workflow-rules.mjs";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const columns = [
  "date",
  "diet",
  "course",
  "recipe",
  "recipe_version",
  "center",
  "servings",
];
const courses = {
  FIRST: "FIRST",
  MAIN: "MAIN",
  SIDE: "SIDE",
  DESSERT: "DESSERT",
  DRINK: "DRINK",
  primero: "FIRST",
  principal: "MAIN",
  segundo: "MAIN",
  guarnición: "SIDE",
  postre: "DESSERT",
  bebida: "DRINK",
};
const same = (a, b) =>
  String(a ?? "")
    .trim()
    .toLocaleLowerCase() ===
  String(b ?? "")
    .trim()
    .toLocaleLowerCase();
function match(rows, value, keys = ["name"]) {
  const hits = rows.filter(
    (r) => r.id === value || keys.some((k) => same(r.data[k], value)),
  );
  return hits.length === 1 ? hits[0] : null;
}
export async function importMenu(service, t, id, input, actor) {
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "format",
          "content",
          "version",
          "commit",
          "mode",
          "sourceReference",
          "resolutions",
          "previewHash",
        ].includes(k),
    ) ||
    !["APPEND", "REPLACE"].includes(input.mode) ||
    typeof input.commit !== "boolean" ||
    typeof input.sourceReference !== "string" ||
    !input.sourceReference.trim() ||
    input.sourceReference.length > 4000
  )
    fail("Invalid menu import options");
  const raw = await readImport(input);
  return service.write(t, async () => {
    const p = await service.required(t, "menuPlans", id);
    if (p.version !== input.version)
      fail("Record changed. Reload before saving.", 409);
    if (["PUBLISHED", "ARCHIVED"].includes(p.data.state))
      fail("Published menus are immutable. Create a new revision.", 409);
    const c = await service.catalog(t);
    const resolutions = input.resolutions ?? [];
    if (
      !Array.isArray(resolutions) ||
      resolutions.length > 1000 ||
      new Set(resolutions.map((r) => r.row)).size !== resolutions.length ||
      resolutions.some(
        (r) =>
          !Number.isInteger(r.row) ||
          r.row < 2 ||
          r.row > raw.length + 1 ||
          Object.keys(r).some(
            (k) =>
              !["row", "recipeVersionId", "dietId", "centerId"].includes(k),
          ),
      )
    )
      fail("Invalid import resolutions");
    const rows = raw.map((r, i) => {
      const errors = [],
        row = i + 2,
        resolution = resolutions.find((x) => x.row === row);
      if (Object.keys(r).some((k) => !columns.includes(k)))
        errors.push("UNKNOWN_IMPORT_COLUMN");
      const diet = resolution?.dietId
        ? c.diets.find((d) => d.id === resolution.dietId)
        : match(c.diets, String(r.diet ?? ""), ["name", "code"]);
      if (!diet) errors.push("UNRESOLVED_DIET");
      const centerValue = resolution?.centerId ?? String(r.center ?? "").trim();
      const center = centerValue
        ? match(
            c.centers.filter((c) => p.data.centerIds.includes(c.id)),
            centerValue,
          )
        : null;
      if (centerValue && !center) errors.push("UNRESOLVED_CENTER");
      const eligible = c.recipeVersions.filter(
        (v) =>
          !v.data.snapshot.clientId ||
          v.data.snapshot.clientId === p.data.clientId,
      );
      let recipe;
      if (resolution?.recipeVersionId)
        recipe = eligible.find((v) => v.id === resolution.recipeVersionId);
      else {
        const recipeName = String(r.recipe ?? "").trim(),
          version =
            r.recipe_version == null || r.recipe_version === ""
              ? null
              : Number(r.recipe_version);
        const candidates = eligible.filter((v) => {
          const parent = c.recipes.find((p) => p.id === v.data.recipeId);
          return (
            parent?.data.active &&
            (v.id === recipeName ||
              v.data.recipeId === recipeName ||
              same(v.data.snapshot.name, recipeName)) &&
            (version === null
              ? v.data.revision === parent.data.revision
              : v.data.revision === version)
          );
        });
        if (candidates.length === 1) recipe = candidates[0];
      }
      if (!recipe) errors.push("UNRESOLVED_RECIPE");
      const course =
        courses[String(r.course ?? "").trim()] ??
        courses[
          String(r.course ?? "")
            .trim()
            .toLowerCase()
        ];
      if (!course) errors.push("INVALID_IMPORT_COURSE");
      const date = String(r.date ?? "").trim();
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < p.data.startDate ||
        date > p.data.endDate ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        errors.push("INVALID_IMPORT_DATE");
      const count =
        r.servings == null || r.servings === "" ? null : Number(r.servings);
      if (
        count !== null &&
        (!center || !Number.isInteger(count) || count < 0 || count > 1000000)
      )
        errors.push("INVALID_IMPORT_SERVINGS");
      return {
        row,
        original: r,
        errors,
        entry: errors.length
          ? null
          : {
              date,
              dietId: diet.id,
              course,
              recipeVersionId: recipe.id,
              centerId: center?.id ?? null,
            },
        override:
          count !== null && center && diet
            ? { centerId: center.id, date, dietId: diet.id, count }
            : null,
      };
    });
    const schedule = {
        entries: input.mode === "APPEND" ? [...p.data.schedule.entries] : [],
      },
      counts = structuredClone(p.data.counts),
      countSeen = new Map();
    for (const row of rows) {
      if (!row.entry) continue;
      const e = row.entry,
        k = [e.date, e.dietId, e.course, e.centerId ?? ""].join("|");
      if (
        schedule.entries.some(
          (x) => [x.date, x.dietId, x.course, x.centerId ?? ""].join("|") === k,
        )
      )
        row.errors.push("DUPLICATE_IMPORT_SLOT");
      else schedule.entries.push(e);
      if (row.override) {
        const o = row.override,
          key = [o.centerId, o.date, o.dietId].join("|");
        if (countSeen.has(key) && countSeen.get(key) !== o.count)
          row.errors.push("CONFLICTING_IMPORT_SERVINGS");
        countSeen.set(key, o.count);
        const index = counts.overrides.findIndex(
          (x) => [x.centerId, x.date, x.dietId].join("|") === key,
        );
        if (index < 0) counts.overrides.push(o);
        else counts.overrides[index] = o;
      }
    }
    const {
      revision,
      state,
      nutritionApproval,
      qualityApproval,
      publishedSnapshot,
      parentId,
      ...form
    } = p.data;
    const data = {
      ...form,
      schedule,
      counts,
      origin: "CLIENT_REFERENCE",
      sourceReference: input.sourceReference.trim(),
    };
    let validationError = null;
    if (rows.every((r) => !r.errors.length)) {
      try {
        await service.planData(t, data, revision + 1, parentId);
      } catch (e) {
        validationError = e.message;
      }
    }
    const previewHash = snapshotHash({
        planId: id,
        version: p.version,
        mode: input.mode,
        data,
        rows: rows.map((r) => ({ row: r.row, errors: r.errors })),
      }),
      canCommit = rows.every((r) => !r.errors.length) && !validationError;
    if (!input.commit) return { rows, canCommit, validationError, previewHash };
    if (!canCommit) fail("Resolve all menu import rows before saving");
    if (input.previewHash !== previewHash)
      fail("Menu import preview changed. Validate again.", 409);
    const record = await service.savePlan(
      t,
      id,
      { ...data, version: p.version },
      actor,
    );
    await service.store.log(t, actor, "IMPORT_MENU", "menuPlans", id, null, {
      mode: input.mode,
      rows: rows.length,
      sourceReference: input.sourceReference,
      previewHash,
    });
    return { record, rows, canCommit: true, previewHash };
  });
}
