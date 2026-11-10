import { resources, validate } from "../../src/schema.mjs";
import { orderResources } from "../../src/order-schema.mjs";
import { menuResources } from "../../src/menu-schema.mjs";
const defs = { ...resources, ...orderResources, ...menuResources };
export class MenuStore {
  constructor() {
    this.rows = Object.fromEntries(Object.keys(defs).map((k) => [k, []]));
    this.counter = 0;
    this.depth = 0;
    this.events = [];
  }
  async lock() {}
  async transaction(fn) {
    if (this.depth) return fn();
    const snapshot = structuredClone(this.rows);
    this.depth++;
    try {
      return await fn();
    } catch (e) {
      this.rows = snapshot;
      throw e;
    } finally {
      this.depth--;
    }
  }
  async list(t, r) {
    return structuredClone(this.rows[r].filter((x) => x.tenant === t));
  }
  async get(t, r, id) {
    return (await this.list(t, r)).find((r) => r.id === id) ?? null;
  }
  async log(...args) {
    this.events.push(args);
  }
  async create(t, r, data, actor) {
    const validated = validate(r, data, defs);
    for (const [k, f] of Object.entries(defs[r].fields)) {
      if (f.resource)
        for (const id of Array.isArray(validated[k])
          ? validated[k]
          : [validated[k]].filter(Boolean))
          if (!(await this.get(t, f.resource, id)))
            throw new Error("Invalid reference");
    }
    const row = {
      id: "id-" + ++this.counter,
      tenant: t,
      data: validated,
      version: 1,
      createdAt: "2026-11-10",
      updatedAt: "2026-11-10",
    };
    this.rows[r].push(row);
    return structuredClone(row);
  }
  async update(t, r, id, data, v, actor) {
    const row = this.rows[r].find((r) => r.tenant === t && r.id === id);
    if (!row) throw new Error("Record not found");
    if (row.version !== v)
      throw Object.assign(new Error("Record changed. Reload before saving."), {
        status: 409,
      });
    row.data = validate(r, data, defs);
    row.version++;
    return structuredClone(row);
  }
}
