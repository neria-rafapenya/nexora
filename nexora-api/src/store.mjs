import { migrateBuyerAccess } from "./buyer-schema.mjs";
import { migrateContacts } from "./contact-schema.mjs";
import { migrateAccounts, migrateProfileTypes } from "./account-schema.mjs";
import { migrateAssistant } from "./assistant.mjs";
import {
  productMediaResources,
  migrateProductMedia,
} from "./product-media-schema.mjs";
import { LocalFiles, fileResources } from "./file-storage.mjs";
import { migrateSearch } from "./migrate-search.mjs";
import { migrateAi } from "./migrate-ai.mjs";
import { wasteResources } from "./waste-schema.mjs";
import { migrateWaste } from "./migrate-waste.mjs";
import { documentResources } from "./document-schema.mjs";
import { migrateDocuments } from "./migrate-documents.mjs";
import { migrateMenuDetails } from "./migrate-menu-details.mjs";
import pg from "pg";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { resources, validate } from "./schema.mjs";
import { orderResources } from "./order-schema.mjs";
import { migrateWorkflow } from "./migrate-workflow.mjs";
import { migrateOrders } from "./migrate-orders.mjs";
import { menuResources } from "./menu-schema.mjs";
import { migrateMenus } from "./migrate-menus.mjs";
const allResources = {
  ...productMediaResources,
  ...resources,
  ...orderResources,
  ...menuResources,
  ...documentResources,
  ...wasteResources,
};
import { migrateMainCategories } from "./migrate-main-categories.mjs";
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password, encoded) {
  try {
    const [salt, hash] = encoded.split(":");
    return timingSafeEqual(
      Buffer.from(hash, "hex"),
      scryptSync(password, salt, 64),
    );
  } catch {
    return false;
  }
}
const tables = [
  "migrations",
  "tenants",
  "users",
  "memberships",
  "sessions",
  "audit",
  "settings",
  ...Object.keys(allResources),
];
export class Store {
  constructor(connectionString, { files = new LocalFiles() } = {}) {
    this.files = files;
    this.pool = new pg.Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL("../certs/supabase-ca.crt", import.meta.url),
          "utf8",
        ),
      },
      max: 3,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    this.pool.on("error", (error) => {
      console.error(
        "Database connection interrupted:",
        error.code ?? "CONNECTION_ERROR",
      );
    });
    this.context = new AsyncLocalStorage();
    this.db = {
      prepare: (sql) => {
        let i = 0;
        sql = sql.replace(/\?/g, () => `$${++i}`);
        for (const name of tables)
          sql = sql.replace(
            new RegExp(`(?<![.\\w])${name}(?![\\w])`, "g"),
            `bo."${name}"`,
          );
        return {
          get: async (...args) => (await this.query(sql, args)).rows[0],
          all: async (...args) => (await this.query(sql, args)).rows,
          run: async (...args) => this.query(sql, args),
        };
      },
    };
  }
  query(sql, args = []) {
    return (this.context.getStore() ?? this.pool).query(sql, args);
  }
  async migrate() {
    await this.transaction(async () => {
      await this.query("SELECT pg_advisory_xact_lock(72819241)");
      await this
        .query(`CREATE SCHEMA IF NOT EXISTS bo; REVOKE ALL ON SCHEMA bo FROM PUBLIC;
 CREATE TABLE IF NOT EXISTS bo.migrations(version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS bo.tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bo.users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bo.memberships(user_id TEXT REFERENCES bo.users(id),tenant_id TEXT REFERENCES bo.tenants(id),role TEXT NOT NULL CHECK(role IN ('admin','operations_orders','nutrition_menus','quality','commercial','read_only')),PRIMARY KEY(user_id,tenant_id));
 CREATE TABLE IF NOT EXISTS bo.sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES bo.users(id),expires BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS bo.audit(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),actor_id TEXT REFERENCES bo.users(id),action TEXT NOT NULL,resource TEXT,record_id TEXT,before_data JSONB,after_data JSONB,at TIMESTAMPTZ NOT NULL);
 CREATE INDEX IF NOT EXISTS audit_scope ON bo.audit(tenant_id,at);
 CREATE TABLE IF NOT EXISTS bo.settings(tenant_id TEXT PRIMARY KEY REFERENCES bo.tenants(id),data JSONB NOT NULL);`);
      for (const resource of Object.keys(allResources)) {
        await this.query(
          `CREATE TABLE IF NOT EXISTS bo."${resource}"(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL,created_by TEXT REFERENCES bo.users(id)); CREATE INDEX IF NOT EXISTS "${resource}_tenant" ON bo."${resource}"(tenant_id); ALTER TABLE bo."${resource}" ENABLE ROW LEVEL SECURITY;`,
        );
        const keys =
          resource === "products"
            ? ["sku", "ean"]
            : ["allergens", "diets"].includes(resource)
              ? ["code"]
              : ["families", "mainCategories"].includes(resource)
                ? ["name"]
                : [];
        for (const key of keys)
          await this.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "${resource}_${key}_unique" ON bo."${resource}"(tenant_id,lower(data->>'${key}')) WHERE data->>'${key}' IS NOT NULL;`,
          );
      }
      for (const table of [
        "tenants",
        "users",
        "memberships",
        "sessions",
        "audit",
        "settings",
      ])
        await this.query(`ALTER TABLE bo."${table}" ENABLE ROW LEVEL SECURITY`);
      await this.query(
        "ALTER TABLE bo.users ADD COLUMN IF NOT EXISTS mfa_secret TEXT; ALTER TABLE bo.users ADD COLUMN IF NOT EXISTS mfa_pending TEXT; ALTER TABLE bo.users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT; INSERT INTO bo.migrations(version) VALUES(1),(2) ON CONFLICT DO NOTHING",
      );
      await migrateMainCategories(this);
      await migrateOrders(this);
      await migrateWorkflow(this);
      await migrateMenus(this);
      await migrateMenuDetails(this);
      await migrateDocuments(this);
      await migrateWaste(this);
      await migrateAi(this);
      await migrateSearch(this);
      await migrateProductMedia(this);
      await migrateAssistant(this);
      await migrateAccounts(this);
      await migrateContacts(this);
      await migrateProfileTypes(this);
      await migrateBuyerAccess(this);
    });
  }
  async transaction(fn) {
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.context.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  encrypt(value) {
    const key = Buffer.from(process.env.MFA_KEY ?? "", "hex");
    if (key.length !== 32)
      throw new Error("MFA_KEY must contain 32 random bytes in hex");
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const content = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      iv.toString("hex"),
      cipher.getAuthTag().toString("hex"),
      content.toString("hex"),
    ].join(":");
  }
  decrypt(value) {
    const [iv, tag, data] = value.split(":");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.MFA_KEY ?? "", "hex"),
      Buffer.from(iv, "hex"),
    );
    cipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "hex")),
      cipher.final(),
    ]).toString("utf8");
  }
  async lock(tenant) {
    await this.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenant]);
  }
  async ready() {
    return !!(await this.db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }
  async user(id) {
    const u = await this.db
      .prepare(
        `SELECT id,email,name,phone,job_title AS "jobTitle",profile_type AS "profileType",profile_version AS "profileVersion",created_at AS "createdAt",updated_at AS "updatedAt",(avatar IS NOT NULL) AS "hasAvatar" FROM users WHERE id=?`,
      )
      .get(id);
    if (!u) return null;
    return {
      ...u,
      avatarUrl: u.hasAvatar
        ? `/api/profile/avatar?v=${u.profileVersion}`
        : null,
      companies: await this.db
        .prepare(
          "SELECT t.id,t.name,m.role FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? ORDER BY t.name",
        )
        .all(id),
    };
  }
  async log(
    tenant,
    actor,
    action,
    resource = null,
    id = null,
    before = null,
    after = null,
  ) {
    if (fileResources.includes(resource)) {
      const withoutFile = (value) =>
        value
          ? Object.fromEntries(
              Object.entries(value).filter(([key]) => key !== "base64"),
            )
          : null;
      before = withoutFile(before);
      after = withoutFile(after);
    }
    await this.db
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        tenant,
        actor,
        action,
        resource,
        id,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        new Date().toISOString(),
      );
  }
  async list(tenant, resource) {
    this.known(resource);
    return (
      await this.query(
        `SELECT * FROM bo."${resource}" WHERE tenant_id=$1 ORDER BY created_at,id`,
        [tenant],
      )
    ).rows.map((row) => this.decode(row));
  }
  known(r) {
    if (!allResources[r]) throw new Error("Unknown resource");
  }
  decode(row) {
    return row
      ? {
          id: row.id,
          version: row.version,
          data: row.data,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }
  async get(tenant, resource, id) {
    this.known(resource);
    return this.decode(
      (
        await this.query(
          `SELECT * FROM bo."${resource}" WHERE tenant_id=$1 AND id=$2`,
          [tenant, id],
        )
      ).rows[0],
    );
  }
  async check(tenant, resource, input, id = null) {
    const data = validate(resource, input, allResources);
    if (fileResources.includes(resource)) {
      if (!data.storageKey || data.base64)
        throw new Error("FILE_STORAGE_REFERENCE_REQUIRED");
      this.files.path(tenant, resource, data.storageKey);
      delete data.base64;
    }
    for (const [key, f] of Object.entries(allResources[resource].fields)) {
      const values =
        f.type === "relation"
          ? [data[key]]
          : f.type === "relations"
            ? data[key]
            : [];
      for (const value of values.filter(Boolean)) {
        if (value === id && resource === f.resource)
          throw new Error("A record cannot reference itself");
        if (!(await this.get(tenant, f.resource, value)))
          throw new Error(
            `Invalid ${f.label}: record does not exist in this company`,
          );
      }
    }
    for (const row of await this.list(tenant, resource)) {
      if (row.id === id) continue;
      if (
        resource === "centerDiners" &&
        ["centerId", "dietId", "service"].every((k) => row.data[k] === data[k])
      )
        throw new Error(
          "Diner count already exists for this center, diet and service",
        );
      if (
        resource === "productAllergens" &&
        ["productId", "allergenId"].every((k) => row.data[k] === data[k])
      )
        throw new Error("Allergen already linked to this product");
    }
    return data;
  }
  async create(tenant, resource, input, actor) {
    return this.transaction(async () => {
      await this.lock(tenant);
      if (fileResources.includes(resource) && input.base64)
        input = await this.files.put(tenant, resource, input);
      const data = await this.check(tenant, resource, input);
      const id = randomUUID(),
        now = new Date().toISOString();
      if (resource === "productAllergens" && data.validated) {
        data.validatedBy = actor;
        data.validatedAt = now;
      }
      await this.query(
        `INSERT INTO bo."${resource}"(id,tenant_id,data,version,created_at,updated_at,created_by) VALUES($1,$2,$3,1,$4,$4,$5)`,
        [id, tenant, JSON.stringify(data), now, actor],
      );
      await this.log(tenant, actor, "CREATE", resource, id, null, data);
      return this.get(tenant, resource, id);
    });
  }
  async update(tenant, resource, id, input, version, actor) {
    return this.transaction(async () => {
      await this.lock(tenant);
      const before = await this.get(tenant, resource, id);
      if (!before)
        throw Object.assign(new Error("Record not found"), { status: 404 });
      if (before.version !== version)
        throw Object.assign(
          new Error("Record changed. Reload before saving."),
          { status: 409 },
        );
      if (fileResources.includes(resource) && input.base64)
        input = await this.files.put(tenant, resource, input);
      const data = await this.check(tenant, resource, input, id);
      if (resource === "productAllergens" && data.validated) {
        data.validatedBy = actor;
        data.validatedAt = new Date().toISOString();
      }
      await this.query(
        `UPDATE bo."${resource}" SET data=$1,version=version+1,updated_at=$2 WHERE id=$3 AND tenant_id=$4`,
        [JSON.stringify(data), new Date().toISOString(), id, tenant],
      );
      await this.log(tenant, actor, "UPDATE", resource, id, before.data, data);
      return this.get(tenant, resource, id);
    });
  }
  async remove(tenant, resource, id, version, actor) {
    return this.transaction(async () => {
      await this.lock(tenant);
      const before = await this.get(tenant, resource, id);
      if (!before)
        throw Object.assign(new Error("Record not found"), { status: 404 });
      if (before.version !== version)
        throw Object.assign(
          new Error("Record changed. Reload before deleting."),
          { status: 409 },
        );
      for (const [other, def] of Object.entries(allResources))
        for (const [key, f] of Object.entries(def.fields))
          if (
            f.resource === resource &&
            (await this.list(tenant, other)).some(
              (r) =>
                r.data[key] === id ||
                (Array.isArray(r.data[key]) && r.data[key].includes(id)),
            )
          )
            throw Object.assign(
              new Error(
                `Cannot delete: referenced by ${def.label.toLowerCase()}`,
              ),
              { status: 409 },
            );
      await this.query(
        `DELETE FROM bo."${resource}" WHERE id=$1 AND tenant_id=$2`,
        [id, tenant],
      );
      await this.log(tenant, actor, "DELETE", resource, id, before.data, null);
    });
  }
  async close() {
    await this.pool.end();
  }
}
