import { randomBytes, randomUUID, createHash } from "node:crypto";
import { isIP } from "node:net";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const hash = (v) => createHash("sha256").update(v).digest("hex");
const states = ["NEW", "CONTACTED", "ARCHIVED"];
export function contactConfigFromEnv(env = process.env) {
  return {
    enabled: env.CONTACT_FORM_ENABLED === "true",
    tenant: env.CONTACT_TENANT_ID ?? "workspace",
    origin: env.CONTACT_SITE_ORIGIN ?? "https://www.horekia.com",
  };
}
export function contactClientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress,
  ) && isIP(forwarded)
    ? forwarded
    : (req.socket.remoteAddress ?? "unknown");
}
function keys(v, allowed) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail(400, "Revisa los datos del formulario.");
}
function text(v, max, required = false) {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(400, "Revisa los campos obligatorios y su longitud.");
  return v.trim();
}
export function contactData(input) {
  keys(input, [
    "name",
    "email",
    "company",
    "phone",
    "sector",
    "message",
    "website",
    "privacyAcknowledged",
    "token",
  ]);
  const data = {
    name: text(input.name, 120, true),
    email: text(input.email, 254, true).toLowerCase(),
    company: text(input.company, 160, true),
    phone: text(input.phone, 40),
    sector: text(input.sector, 40),
    message: text(input.message, 3000, true),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    fail(400, "Introduce un correo electrónico válido.");
  if (data.message.length < 10)
    fail(
      400,
      "Cuéntanos un poco más: el mensaje debe tener al menos 10 caracteres.",
    );
  if (
    !["", "CATERING", "PREPARED_FOOD", "SUPPLIER", "CENTER", "OTHER"].includes(
      data.sector,
    )
  )
    fail(400, "Selecciona un tipo de empresa válido.");
  if (input.privacyAcknowledged !== true)
    fail(400, "Debes leer y confirmar la información de privacidad.");
  if (typeof input.website !== "string" || input.website.trim())
    fail(400, "No se ha podido validar el formulario.");
  return { ...data, privacyVersion: "2026-11-10", privacyAcknowledged: true };
}
function decode(r) {
  return {
    id: r.id,
    data: r.data,
    state: r.state,
    version: r.version,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
export class Contacts {
  constructor(
    store,
    config = contactConfigFromEnv(),
    clock = () => Date.now(),
  ) {
    this.s = store;
    this.config = config;
    this.clock = clock;
    this.tokens = new Map();
    this.rates = new Map();
  }
  requireEnabled() {
    if (!this.config.enabled)
      fail(
        503,
        "El formulario no está disponible temporalmente. Puedes escribir a rafa@wad.cat.",
      );
  }
  origin(origin, required = false) {
    if ((required || origin) && origin !== this.config.origin)
      fail(403, "Origen del formulario no permitido.");
  }
  rate(key, max, period = 3600000) {
    const now = this.clock();
    for (const [k, v] of this.rates) if (v.until <= now) this.rates.delete(k);
    const r = this.rates.get(key) ?? { count: 0, until: now + period };
    if (r.count >= max || this.rates.size > 10000)
      fail(
        429,
        "Has realizado demasiados intentos. Espera un poco o escribe a rafa@wad.cat.",
      );
    r.count++;
    this.rates.set(key, r);
  }
  issue(key, origin) {
    this.requireEnabled();
    this.origin(origin);
    this.rate("token:" + key, 20, 900000);
    const now = this.clock();
    for (const [k, v] of this.tokens)
      if (v.expires <= now) this.tokens.delete(k);
    if (this.tokens.size >= 10000)
      fail(
        503,
        "El formulario está ocupado. Inténtalo de nuevo en unos minutos.",
      );
    const token = randomBytes(32).toString("hex");
    this.tokens.set(token, { key, expires: now + 600000 });
    return { token };
  }
  async submit(input, key, origin) {
    this.requireEnabled();
    this.origin(origin, true);
    const data = contactData(input),
      token = this.tokens.get(input.token);
    if (!token || token.key !== key || token.expires <= this.clock())
      fail(
        400,
        "La comprobación del formulario ha caducado. Vuelve a enviar tu solicitud.",
      );
    const submission = hash(input.token),
      digest = hash(JSON.stringify(data));
    return this.s.transaction(async () => {
      await this.s.lock("public-contact:" + submission);
      const existing = (
        await this.s.query(
          "SELECT id,payload_hash FROM bo.contact_leads WHERE submission_hash=$1",
          [submission],
        )
      ).rows[0];
      if (existing) {
        if (existing.payload_hash !== digest)
          fail(409, "El formulario ya se ha enviado con otros datos.");
        return { ok: true, reference: existing.id };
      }
      this.rate("submit:" + key, 3);
      this.rate("submit-global", 100);
      const id = randomUUID();
      await this.s.query(
        "INSERT INTO bo.contact_leads(id,tenant_id,data,submission_hash,payload_hash) VALUES($1,$2,$3,$4,$5)",
        [id, this.config.tenant, data, submission, digest],
      );
      await this.s.log(
        this.config.tenant,
        null,
        "CREATE_CONTACT",
        "contactLeads",
        id,
        null,
        { state: "NEW" },
      );
      return { ok: true, reference: id };
    });
  }
  async authorize(tenant, role, actor) {
    if (role !== "admin" || tenant !== this.config.tenant)
      fail(403, "Administrator access required");
    if (
      !(
        await this.s.query(
          "SELECT 1 FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2 AND role='admin'",
          [tenant, actor],
        )
      ).rowCount
    )
      fail(403, "Administrator access required");
  }
  async list(t, role, actor) {
    await this.authorize(t, role, actor);
    return {
      records: (
        await this.s.query(
          "SELECT * FROM bo.contact_leads WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC",
          [t],
        )
      ).rows.map(decode),
    };
  }
  async mutate(t, role, actor, id, input, remove = false) {
    keys(input, remove ? ["version"] : ["version", "state"]);
    if (!Number.isSafeInteger(input.version) || input.version < 1)
      fail(400, "Versión de solicitud no válida.");
    if (!remove && !states.includes(input.state))
      fail(400, "Estado de solicitud no válido.");
    return this.s.transaction(async () => {
      await this.s.lock("contact-inbox:" + t);
      await this.authorize(t, role, actor);
      const before = (
        await this.s.query(
          "SELECT * FROM bo.contact_leads WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [t, id],
        )
      ).rows[0];
      if (!before) fail(404, "Solicitud no encontrada.");
      if (before.version !== input.version)
        fail(409, "La solicitud ha cambiado. Recarga antes de continuar.");
      if (remove)
        await this.s.query(
          "DELETE FROM bo.contact_leads WHERE tenant_id=$1 AND id=$2",
          [t, id],
        );
      else
        await this.s.query(
          "UPDATE bo.contact_leads SET state=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3",
          [input.state, t, id],
        );
      await this.s.log(
        t,
        actor,
        remove ? "DELETE_CONTACT" : "UPDATE_CONTACT",
        "contactLeads",
        id,
        { state: before.state },
        remove ? null : { state: input.state },
      );
      return { ok: true };
    });
  }
  async prune() {
    const result = await this.s.query(
      "DELETE FROM bo.contact_leads WHERE created_at < now()-interval '180 days' RETURNING id",
    );
    return { removed: result.rowCount };
  }
}
export async function handleContacts({
  service,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
  origin,
  clientKey,
}) {
  if (path === "/api/public/contact-token" && method === "GET") {
    send(200, service.issue(clientKey, origin));
    return true;
  }
  if (path === "/api/public/contact" && method === "POST") {
    send(201, await service.submit(body, clientKey, origin));
    return true;
  }
  if (path.startsWith("/api/public/contact")) fail(404, "Route not found");
  if (path !== "/api/contacts" && !path.startsWith("/api/contacts/"))
    return false;
  if (!user) fail(401, "Sign in required");
  if (path === "/api/contacts" && method === "GET") {
    send(200, await service.list(tenant, role, user.id));
    return true;
  }
  const match = path.match(/^\/api\/contacts\/([a-zA-Z0-9-]{1,80})$/);
  if (match && ["PUT", "DELETE"].includes(method)) {
    send(
      200,
      await service.mutate(
        tenant,
        role,
        user.id,
        match[1],
        body,
        method === "DELETE",
      ),
    );
    return true;
  }
  fail(404, "Route not found");
}
export function startContactMaintenance(service) {
  const run = () =>
    service
      .prune()
      .catch(() => console.error("Contact retention maintenance failed"));
  void run();
  const timer = setInterval(run, 86400000);
  timer.unref();
  return () => clearInterval(timer);
}
