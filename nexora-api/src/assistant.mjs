import { randomUUID } from "node:crypto";
import { geminiConfigFromEnv, geminiPublicConfig } from "./gemini.mjs";
export const assistantSources = [
  {
    id: "catalog",
    label: "Catálogo y alérgenos",
    resources: [
      "mainCategories",
      "families",
      "products",
      "allergens",
      "productAllergens",
    ],
    status: "SEMANTIC_PRODUCTS",
    description:
      "La búsqueda semántica de productos existe; falta conectarla al asistente. Los alérgenos se consultarán en sus registros y validaciones.",
  },
  {
    id: "suppliers",
    label: "Proveedores",
    resources: ["suppliers"],
    status: "PLANNED",
    description: "Consultas de proveedores y sus productos.",
  },
  {
    id: "customers",
    label: "Clientes, centros y dietas",
    resources: ["clients", "centers", "diets", "centerDiners"],
    status: "PLANNED",
    description:
      "Consultas limitadas a los clientes y centros autorizados para cada usuario.",
  },
  {
    id: "orders",
    label: "Pedidos",
    resources: ["orders"],
    status: "PLANNED",
    description:
      "Estados, líneas y totales mediante consultas exactas. Sin enviar pedidos ni modificar aprobaciones.",
  },
  {
    id: "menus",
    label: "Menús y recetas",
    resources: ["menuPlans", "recipes", "menuIngredients"],
    status: "PLANNED",
    description:
      "Planificación, composición y necesidades mediante consultas controladas.",
  },
  {
    id: "documents",
    label: "Documentación de proveedores",
    resources: ["supplierDocuments"],
    status: "PLANNED",
    description:
      "Pendiente la extracción e indexación del contenido de los archivos para RAG.",
  },
  {
    id: "waste",
    label: "Desperdicio alimentario",
    resources: ["wasteEvents", "serviceActuals", "wasteActions"],
    status: "PLANNED",
    description: "Mediciones y agregados calculados en la base de datos.",
  },
  {
    id: "knowledge",
    label: "Contenidos de ayuda",
    resources: [],
    status: "CURATED",
    description:
      "Contenidos revisados en este apartado. Su recuperación por el asistente está pendiente.",
  },
];
export const assistantPolicy = Object.freeze({
  readOnly: true,
  enforceUserPermissions: true,
  enforceCustomerScope: true,
  requireSources: true,
  liveStructuredQueries: true,
  noArbitrarySql: true,
  allergenQualityWorkflow: true,
  excludeCredentialsAndSessions: true,
});
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function keys(v, allowed) {
  if (!object(v) || Object.keys(v).some((k) => !allowed.includes(k)))
    fail(400, "Datos del asistente no válidos");
}
function text(v, max, required = false) {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(400, "Revisa el texto y su longitud máxima");
  return v.trim();
}
function integer(v, min, max) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail(400, `El valor debe estar entre ${min} y ${max}`);
  return v;
}
export function defaultAssistantConfig() {
  return {
    state: "DRAFT",
    name: "Asistente Cuinora",
    instructions:
      "Responde en español con claridad. Si falta información, indícalo y solicita una aclaración.",
    fallback:
      "No dispongo de información suficiente y verificada para responder a esta consulta.",
    sourceIds: ["catalog", "knowledge"],
    maxDailyRequests: 10,
    maxContextRecords: 20,
  };
}
export function validateAssistantConfig(v) {
  keys(v, [
    "state",
    "name",
    "instructions",
    "fallback",
    "sourceIds",
    "maxDailyRequests",
    "maxContextRecords",
  ]);
  if (!["DRAFT", "READY"].includes(v.state))
    fail(400, "Estado de configuración no válido");
  if (
    !Array.isArray(v.sourceIds) ||
    v.sourceIds.length > assistantSources.length ||
    new Set(v.sourceIds).size !== v.sourceIds.length ||
    v.sourceIds.some((id) => !assistantSources.some((s) => s.id === id))
  )
    fail(400, "Fuentes del asistente no válidas");
  if (v.state === "READY" && !v.sourceIds.length)
    fail(400, "Selecciona al menos una fuente");
  return {
    state: v.state,
    name: text(v.name, 80, true),
    instructions: text(v.instructions, 4000),
    fallback: text(v.fallback, 500, true),
    sourceIds: [...v.sourceIds],
    maxDailyRequests: integer(v.maxDailyRequests, 1, 100),
    maxContextRecords: integer(v.maxContextRecords, 1, 50),
  };
}
export function validateKnowledge(v) {
  keys(v, ["title", "content", "state"]);
  if (!["DRAFT", "PUBLISHED"].includes(v.state))
    fail(400, "Estado del contenido no válido");
  return {
    title: text(v.title, 160, true),
    content: text(v.content, 8000, true),
    state: v.state,
  };
}
function version(v) {
  return integer(v, 0, 2147483647);
}
function row(r) {
  return r
    ? {
        id: r.id,
        data: r.data,
        version: r.version,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }
    : null;
}
export async function migrateAssistant(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=13")).rowCount)
    return;
  await s.query(`CREATE TABLE bo.assistant_config(tenant_id TEXT PRIMARY KEY REFERENCES bo.tenants(id),data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),version INTEGER NOT NULL CHECK(version>0),created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE bo.assistant_knowledge(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),version INTEGER NOT NULL CHECK(version>0),created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL);
  CREATE INDEX assistant_knowledge_tenant ON bo.assistant_knowledge(tenant_id);
  ALTER TABLE bo.assistant_config ENABLE ROW LEVEL SECURITY;
  ALTER TABLE bo.assistant_knowledge ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON bo.assistant_config,bo.assistant_knowledge FROM PUBLIC,anon,authenticated;
  INSERT INTO bo.migrations(version) VALUES(13)`);
}
export class AssistantAdmin {
  constructor(store) {
    this.s = store;
  }
  async config(tenant) {
    const r = (
      await this.s.query(
        "SELECT *,tenant_id AS id FROM bo.assistant_config WHERE tenant_id=$1",
        [tenant],
      )
    ).rows[0];
    return (
      row(r) ?? {
        id: tenant,
        data: defaultAssistantConfig(),
        version: 0,
        createdAt: null,
        updatedAt: null,
      }
    );
  }
  async overview(tenant) {
    const config = await this.config(tenant);
    const knowledge = await this.s.query(
      "SELECT * FROM bo.assistant_knowledge WHERE tenant_id=$1 ORDER BY updated_at DESC,id",
      [tenant],
    );
    const activity = await this.s.query(
      "SELECT id,action,resource,record_id,at FROM bo.audit WHERE tenant_id=$1 AND resource IN ('assistantConfig','assistantKnowledge') ORDER BY at DESC,id DESC LIMIT 200",
      [tenant],
    );
    return {
      config,
      knowledge: knowledge.rows.map(row),
      activity: activity.rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        recordId: r.record_id,
        at: new Date(r.at).toISOString(),
      })),
      sources: assistantSources,
      policy: assistantPolicy,
      provider: geminiPublicConfig(geminiConfigFromEnv()),
      runtime: {
        available: false,
        reason:
          "El chatbot se conectará en el futuro frontend del cliente. Esta sección solo administra su configuración; no ejecuta consultas ni consume Gemini.",
      },
    };
  }
  async saveConfig(tenant, input, actor) {
    keys(input, ["data", "version"]);
    const data = validateAssistantConfig(input.data),
      expected = version(input.version);
    return this.s.transaction(async () => {
      await this.s.lock("assistant-config:" + tenant);
      const before = await this.config(tenant);
      if (before.version !== expected)
        fail(409, "La configuración ha cambiado. Recarga antes de guardar.");
      await this.s.query(
        `INSERT INTO bo.assistant_config(tenant_id,data,version,created_at,updated_at) VALUES($1,$2,1,now(),now()) ON CONFLICT(tenant_id) DO UPDATE SET data=$2,version=bo.assistant_config.version+1,updated_at=now()`,
        [tenant, data],
      );
      await this.s.log(
        tenant,
        actor,
        before.version ? "UPDATE" : "CREATE",
        "assistantConfig",
        tenant,
        before.version ? before.data : null,
        data,
      );
      return this.config(tenant);
    });
  }
  async saveKnowledge(tenant, id, input, actor, remove = false) {
    keys(input, remove ? ["version"] : ["data", "version"]);
    const data = remove ? null : validateKnowledge(input.data),
      expected = version(input.version);
    return this.s.transaction(async () => {
      await this.s.lock("assistant-knowledge:" + tenant);
      const before = id
        ? row(
            (
              await this.s.query(
                "SELECT * FROM bo.assistant_knowledge WHERE tenant_id=$1 AND id=$2",
                [tenant, id],
              )
            ).rows[0],
          )
        : null;
      if (id && !before) fail(404, "Contenido no encontrado");
      if ((before?.version ?? 0) !== expected)
        fail(409, "El contenido ha cambiado. Recarga antes de guardar.");
      const recordId = id ?? randomUUID();
      if (remove)
        await this.s.query(
          "DELETE FROM bo.assistant_knowledge WHERE tenant_id=$1 AND id=$2",
          [tenant, recordId],
        );
      else if (before)
        await this.s.query(
          "UPDATE bo.assistant_knowledge SET data=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3",
          [data, tenant, recordId],
        );
      else
        await this.s.query(
          "INSERT INTO bo.assistant_knowledge(id,tenant_id,data,version,created_at,updated_at) VALUES($1,$2,$3,1,now(),now())",
          [recordId, tenant, data],
        );
      await this.s.log(
        tenant,
        actor,
        remove ? "DELETE" : before ? "UPDATE" : "CREATE",
        "assistantKnowledge",
        recordId,
        before?.data ?? null,
        data,
      );
      return remove
        ? { ok: true }
        : row(
            (
              await this.s.query(
                "SELECT * FROM bo.assistant_knowledge WHERE tenant_id=$1 AND id=$2",
                [tenant, recordId],
              )
            ).rows[0],
          );
    });
  }
}
export async function handleAssistant({
  store,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
}) {
  if (path !== "/api/assistant" && !path.startsWith("/api/assistant/"))
    return false;
  if (role !== "admin") fail(403, "Administrator access required");
  const service = new AssistantAdmin(store);
  if (path === "/api/assistant" && method === "GET") {
    send(200, await service.overview(tenant));
    return true;
  }
  if (path === "/api/assistant/config" && method === "PUT") {
    send(200, await service.saveConfig(tenant, body, user.id));
    return true;
  }
  if (path === "/api/assistant/knowledge" && method === "POST") {
    send(201, await service.saveKnowledge(tenant, null, body, user.id));
    return true;
  }
  const match = path.match(
    /^\/api\/assistant\/knowledge\/([a-zA-Z0-9-]{1,80})$/,
  );
  if (match && ["PUT", "DELETE"].includes(method)) {
    send(
      200,
      await service.saveKnowledge(
        tenant,
        match[1],
        body,
        user.id,
        method === "DELETE",
      ),
    );
    return true;
  }
  fail(404, "Route not found");
}
