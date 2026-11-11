import { interpretBuyerOrder, buyerAiError } from "./buyer-order-ai.mjs";
import { OrdersService } from "./orders.mjs";
import { randomBytes, createHash } from "node:crypto";
import { passwordMatches, hashToken } from "./store.mjs";
import { matchingStep } from "./totp.mjs";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const revision = (ids) =>
  createHash("sha256")
    .update(JSON.stringify([...ids].sort()))
    .digest("hex");
const keys = (v, allowed) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail(400, "Datos de acceso no válidos.");
};
export class BuyerAccess {
  constructor(store) {
    this.s = store;
    this.attempts = new Map();
  }
  async centers(user) {
    const memberships = (await this.s.user(user.id))?.companies ?? [];
    const result = [];
    for (const m of memberships) {
      const rows =
        m.role === "admin"
          ? await this.s.list(m.id, "centers")
          : (
              await this.s.query(
                `SELECT c.id,c.data,c.version FROM bo.centers c JOIN bo.center_access a ON a.tenant_id=c.tenant_id AND a.center_id=c.id JOIN bo.memberships m ON m.user_id=a.user_id AND m.tenant_id=a.tenant_id WHERE a.user_id=$1 AND a.tenant_id=$2`,
                [user.id, m.id],
              )
            ).rows;
      for (const r of rows)
        result.push({
          id: r.id,
          companyId: m.id,
          companyName: m.name,
          name: r.data.name,
          clientId: r.data.clientId,
        });
    }
    return result;
  }
  async session(token) {
    if (!token) return null;
    const row = (
      await this.s.query(
        "SELECT user_id FROM bo.buyer_sessions WHERE token_hash=$1 AND expires>$2",
        [hashToken(token), Date.now()],
      )
    ).rows[0];
    if (!row) return null;
    const u = await this.s.user(row.user_id);
    return u?.companies.length ? u : null;
  }
  async login(body, key) {
    keys(body, ["email", "password", "code"]);
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      typeof body.password !== "string" ||
      body.password.length > 128
    )
      fail(400, "Introduce tus datos de acceso.");
    const now = Date.now();
    let a = this.attempts.get(key);
    if (!a || a.until <= now) a = { count: 0, until: now + 900000 };
    if (a.count >= 5) fail(429, "Demasiados intentos. Espera 15 minutos.");
    if (this.attempts.size > 10000) this.attempts.clear();
    this.attempts.set(key, a);
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      const r = (
        await this.s.query("SELECT * FROM bo.users WHERE email=$1", [
          body.email.trim().toLowerCase(),
        ])
      ).rows[0];
      const matches = passwordMatches(
        body.password,
        r?.password_hash ??
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!r || !matches || r.password_ready === false) {
        a.count++;
        fail(401, "Correo o contraseña incorrectos.");
      }
      const user = await this.s.user(r.id);
      if (!user?.companies.length) {
        a.count++;
        fail(401, "Correo o contraseña incorrectos.");
      }
      if (r.mfa_secret) {
        const step = matchingStep(this.s.decrypt(r.mfa_secret), body.code);
        if (step === null || Number(r.mfa_last_step ?? 0) >= step) {
          a.count++;
          fail(401, "Introduce un código nuevo de tu autenticador.");
        }
        const changed = await this.s.query(
          "UPDATE bo.users SET mfa_last_step=$1 WHERE id=$2 AND (mfa_last_step IS NULL OR mfa_last_step<$1)",
          [step, r.id],
        );
        if (!changed.rowCount) {
          a.count++;
          fail(401, "Código de autenticación ya utilizado.");
        }
      }
      const centers = await this.centers(user);
      if (!centers.length)
        fail(
          403,
          "Tu cuenta no tiene centros asignados. Contacta con el administrador de tu empresa.",
        );
      const token = randomBytes(32).toString("hex");
      await this.s.query("DELETE FROM bo.buyer_sessions WHERE expires<=$1", [
        now,
      ]);
      await this.s.query(
        "INSERT INTO bo.buyer_sessions(token_hash,user_id,expires) VALUES($1,$2,$3)",
        [hashToken(token), r.id, now + 28800000],
      );
      this.attempts.delete(key);
      for (const companyId of new Set(centers.map((c) => c.companyId)))
        await this.s.log(companyId, r.id, "BUYER_LOGIN");
      return {
        token,
        user: { id: user.id, name: user.name, profileType: user.profileType },
        centers,
      };
    });
  }
  async admin(tenant, actor) {
    if (
      !(
        await this.s.query(
          "SELECT 1 FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2 AND role='admin'",
          [tenant, actor],
        )
      ).rowCount
    )
      fail(403, "Se requiere un administrador.");
  }
  async grants(tenant, id, actor) {
    await this.admin(tenant, actor);
    if (
      !(
        await this.s.query(
          "SELECT 1 FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2",
          [tenant, id],
        )
      ).rowCount
    )
      fail(404, "Usuario no disponible en esta empresa.");
    const centerIds = (
      await this.s.query(
        "SELECT center_id FROM bo.center_access WHERE tenant_id=$1 AND user_id=$2 ORDER BY center_id",
        [tenant, id],
      )
    ).rows.map((r) => r.center_id);
    return {
      centerIds,
      revision: revision(centerIds),
      centers: (await this.s.list(tenant, "centers")).map((r) => ({
        id: r.id,
        name: r.data.name,
      })),
      allCenters:
        (
          await this.s.query(
            "SELECT 1 FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2 AND role='admin'",
            [tenant, id],
          )
        ).rowCount > 0,
    };
  }
  async saveGrants(tenant, id, body, actor) {
    keys(body, ["centerIds", "revision"]);
    if (
      !Array.isArray(body.centerIds) ||
      body.centerIds.length > 1000 ||
      body.centerIds.some((x) => typeof x !== "string") ||
      new Set(body.centerIds).size !== body.centerIds.length ||
      typeof body.revision !== "string"
    )
      fail(400, "Asignación de centros no válida.");
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      const before = await this.grants(tenant, id, actor);
      if (before.revision !== body.revision)
        fail(
          409,
          "Los centros asignados han cambiado. Recarga antes de guardar.",
        );
      if (body.centerIds.some((x) => !before.centers.some((c) => c.id === x)))
        fail(403, "Uno de los centros no pertenece a esta empresa.");
      await this.s.query(
        "DELETE FROM bo.center_access WHERE user_id=$1 AND tenant_id=$2",
        [id, tenant],
      );
      for (const center of body.centerIds)
        await this.s.query(
          "INSERT INTO bo.center_access(user_id,tenant_id,center_id,created_by) VALUES($1,$2,$3,$4)",
          [id, tenant, center, actor],
        );
      await this.s.log(
        tenant,
        actor,
        "SET_CENTER_ACCESS",
        "users",
        id,
        { centerIds: before.centerIds },
        { centerIds: body.centerIds },
      );
      return this.grants(tenant, id, actor);
    });
  }
}
export async function handleBuyer({
  service,
  path,
  method,
  body,
  req,
  res,
  send,
  secure,
  clientKey,
}) {
  if (!path.startsWith("/api/client/")) return false;
  const token = (req.headers.cookie ?? "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("horekia_buyer_session="))
    ?.slice("horekia_buyer_session=".length);
  const cookie = (value) =>
    res.setHeader(
      "Set-Cookie",
      `horekia_buyer_session=${value}; HttpOnly; SameSite=Strict; Path=/api/client; Max-Age=${value ? "28800" : "0"}${secure ? "; Secure" : ""}`,
    );
  if (path === "/api/client/login" && method === "POST") {
    const data = await service.login(
      body,
      clientKey ?? req.socket.remoteAddress,
    );
    cookie(data.token);
    send(200, { user: data.user, centers: data.centers });
    return true;
  }
  if (path === "/api/client/logout" && method === "POST") {
    if (token)
      await service.s.query(
        "DELETE FROM bo.buyer_sessions WHERE token_hash=$1",
        [hashToken(token)],
      );
    cookie("");
    send(200, { ok: true });
    return true;
  }
  const user = await service.session(token);
  if (!user) fail(401, "Inicia sesión para acceder a tus centros.");
  if (path === "/api/client/session" && method === "GET") {
    send(200, {
      user: { id: user.id, name: user.name, profileType: user.profileType },
      centers: await service.centers(user),
    });
    return true;
  }
  if (path === "/api/client/catalog" && method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const center = (await service.centers(user)).find(
      (c) =>
        c.id === url.searchParams.get("center") &&
        c.companyId === url.searchParams.get("company"),
    );
    if (!center) fail(403, "No tienes acceso a este centro.");
    const families = await service.s.list(center.companyId, "families");
    const products = (await service.s.list(center.companyId, "products"))
      .filter((r) => r.data.active !== false)
      .map((r) => ({
        id: r.id,
        name: r.data.name,
        sku: r.data.sku,
        unit: r.data.unit,
        price: r.data.price ?? 0,
        family:
          families.find((f) => f.id === r.data.familyId)?.data.name ?? "Otros",
        allergenStatus: r.data.allergenStatus ?? "UNVERIFIED",
      }));
    send(200, { products });
    return true;
  }
  if (path === "/api/client/assistant/status" && method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const center = (await service.centers(user)).find(
      (c) =>
        c.id === url.searchParams.get("center") &&
        c.companyId === url.searchParams.get("company"),
    );
    if (!center) fail(403, "No tienes acceso a este centro.");
    send(200, await new OrdersService(service.s).aiStatus(center.companyId));
    return true;
  }
  if (path === "/api/client/assistant/interpret" && method === "POST") {
    try {
      send(200, await interpretBuyerOrder(service, user, body));
    } catch (e) {
      throw buyerAiError(e);
    }
    return true;
  }
  fail(404, "Ruta de cliente no encontrada.");
}
