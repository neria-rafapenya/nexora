import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import { passwordHash, passwordMatches, hashToken } from "./store.mjs";
import { roleLabels } from "./schema.mjs";
import { prepareProductFile } from "./product-media.mjs";
import { matchingStep } from "./totp.mjs";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const keys = (v, allowed) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail(400, "Datos de usuario no válidos");
};
const text = (v, max, required = false) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(400, "Revisa los datos del usuario y su longitud");
  return v.trim();
};
const version = (v) => {
  if (!Number.isSafeInteger(v) || v < 1)
    fail(400, "Versión de usuario no válida");
  return v;
};
export function profileData(v, email = false) {
  keys(v, [
    "name",
    "phone",
    "jobTitle",
    "avatar",
    ...(email ? ["email", "profileType"] : []),
  ]);
  const result = {
    name: text(v.name, 120, true),
    phone: text(v.phone, 40),
    jobTitle: text(v.jobTitle, 120),
  };
  if (email) {
    if (v.profileType !== undefined) {
      if (!["INTERNAL_TEAM", "CENTER_BUYER"].includes(v.profileType))
        fail(400, "Tipo de perfil no válido");
      result.profileType = v.profileType;
    }
    result.email = text(v.email, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
      fail(400, "Introduce un correo electrónico válido");
  }
  if (Object.hasOwn(v, "avatar")) result.avatar = v.avatar;
  return result;
}
const roleValue = (v) => {
  if (!Object.hasOwn(roleLabels, v)) fail(400, "Invalid role");
  return v;
};
function passwordValue(v) {
  if (typeof v !== "string" || v.length < 12 || v.length > 128)
    fail(400, "La contraseña debe tener entre 12 y 128 caracteres");
  return v;
}
function dates(r) {
  return {
    createdAt: r.created_at?.toISOString?.() ?? r.created_at ?? null,
    updatedAt:
      [r.updated_at, r.access_updated_at]
        .filter(Boolean)
        .map((v) => new Date(v).toISOString())
        .sort()
        .at(-1) ?? null,
  };
}
export class Accounts {
  constructor(store) {
    this.s = store;
    this.attempts = new Map();
  }
  throttle(key) {
    const old = this.attempts.get(key),
      now = Date.now();
    if (old?.until > now && old.count >= 5)
      fail(429, "Demasiados intentos. Espera 15 minutos.");
    if (!old || old.until <= now) {
      if (this.attempts.size > 10000) this.attempts.clear();
      this.attempts.set(key, { count: 0, until: now + 900000 });
    }
  }
  wrong(key, message) {
    const r = this.attempts.get(key);
    if (r) r.count++;
    fail(400, message);
  }
  async admin(t, actor) {
    if (
      !(
        await this.s.query(
          "SELECT 1 FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2 AND role='admin'",
          [t, actor],
        )
      ).rowCount
    )
      fail(403, "Administrator access required");
  }
  async member(t, id) {
    const r = (
      await this.s.query(
        "SELECT u.*,m.role,m.version AS access_version,m.created_at AS access_created_at,m.updated_at AS access_updated_at FROM bo.users u JOIN bo.memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND u.id=$2",
        [t, id],
      )
    ).rows[0];
    if (!r) fail(404, "User not found");
    return r;
  }
  async canEdit(actor, target) {
    if (actor === target) return false;
    return !(
      await this.s.query(
        "SELECT 1 FROM bo.memberships target WHERE target.user_id=$1 AND NOT EXISTS(SELECT 1 FROM bo.memberships manager WHERE manager.tenant_id=target.tenant_id AND manager.user_id=$2 AND manager.role='admin') LIMIT 1",
        [target, actor],
      )
    ).rowCount;
  }
  publicUser(r, canEditProfile, tenant) {
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      jobTitle: r.job_title,
      profileType: r.profile_type ?? "INTERNAL_TEAM",
      role: r.role,
      profileVersion: r.profile_version,
      accessVersion: r.access_version,
      pendingActivation: !r.password_ready,
      canEditProfile,
      avatarUrl: r.avatar
        ? `/api/users/${r.id}/avatar?company=${encodeURIComponent(tenant)}&v=${r.profile_version}`
        : null,
      ...dates(r),
    };
  }
  async list(t, actor) {
    await this.admin(t, actor);
    const rows = (
      await this.s.query(
        "SELECT u.*,m.role,m.version AS access_version,m.updated_at AS access_updated_at FROM bo.users u JOIN bo.memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 ORDER BY u.name,u.id",
        [t],
      )
    ).rows;
    const users = [];
    for (const r of rows)
      users.push(this.publicUser(r, await this.canEdit(actor, r.id), t));
    return { users };
  }
  async avatarMeta(id, input, old) {
    if (input === undefined) return old;
    if (input === null) return null;
    const prepared = await prepareProductFile("IMAGE", input);
    const bytes = await sharp(Buffer.from(prepared.base64, "base64"))
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    return this.s.files.put(id, "userAvatars", {
      filename: "avatar.webp",
      mime: "image/webp",
      base64: bytes.toString("base64"),
    });
  }
  async invitation(t, id) {
    const token = randomBytes(32).toString("hex"),
      expiresAt = new Date(Date.now() + 86400000).toISOString();
    await this.s.query(
      "INSERT INTO bo.account_invitations(token_hash,user_id,tenant_id,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET token_hash=$1,tenant_id=$3,expires_at=$4",
      [hashToken(token), id, t, expiresAt],
    );
    return { activationPath: "/activate#token=" + token, expiresAt };
  }
  async create(t, input, actor) {
    keys(input, ["profile", "role"]);
    const data = profileData(input.profile, true),
      role = roleValue(input.role),
      id = randomUUID();
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      await this.admin(t, actor);
      if (
        (
          await this.s.query("SELECT 1 FROM bo.users WHERE email=$1", [
            data.email,
          ])
        ).rowCount
      )
        fail(409, "Email already exists; use a different account");
      const avatar = await this.avatarMeta(id, data.avatar, null);
      await this.s.query(
        "INSERT INTO bo.users(id,email,name,password_hash,phone,job_title,avatar,profile_type,password_ready) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)",
        [
          id,
          data.email,
          data.name,
          passwordHash(randomBytes(48).toString("hex")),
          data.phone,
          data.jobTitle,
          avatar,
          data.profileType ?? "INTERNAL_TEAM",
        ],
      );
      await this.s.query(
        "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,$3)",
        [id, t, role],
      );
      const invitation = await this.invitation(t, id);
      await this.s.log(t, actor, "CREATE_USER", "users", id, null, {
        name: data.name,
        email: data.email,
        role,
        profileType: data.profileType ?? "INTERNAL_TEAM",
        pendingActivation: true,
      });
      return {
        user: this.publicUser(await this.member(t, id), true, t),
        ...invitation,
      };
    });
  }
  async update(t, id, input, actor) {
    keys(input, ["role", "accessVersion", "profile"]);
    const role = roleValue(input.role),
      expected = version(input.accessVersion);
    if (input.profile) {
      keys(input.profile, ["version", "data"]);
      version(input.profile.version);
      profileData(input.profile.data, true);
    }
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      await this.admin(t, actor);
      const before = await this.member(t, id);
      if (id === actor)
        fail(
          409,
          "Usa Mi perfil para editar tus datos. No puedes cambiar tu propio acceso.",
        );
      if (before.access_version !== expected)
        fail(409, "El acceso ha cambiado. Recarga antes de guardar.");
      const canEdit = await this.canEdit(actor, id);
      let after = before;
      if (input.profile) {
        if (!canEdit)
          fail(
            403,
            "El perfil está compartido con empresas que no administras. Debe editarlo el propio usuario.",
          );
        if (before.profile_version !== input.profile.version)
          fail(409, "El perfil ha cambiado. Recarga antes de guardar.");
        const data = profileData(input.profile.data, true);
        if (
          (
            await this.s.query(
              "SELECT 1 FROM bo.users WHERE email=$1 AND id<>$2",
              [data.email, id],
            )
          ).rowCount
        )
          fail(409, "Ese correo electrónico ya pertenece a otra cuenta.");
        const avatar = await this.avatarMeta(id, data.avatar, before.avatar);
        await this.s.query(
          "UPDATE bo.users SET name=$1,email=$2,phone=$3,job_title=$4,avatar=$5,profile_type=COALESCE($7,profile_type),profile_version=profile_version+1,updated_at=now() WHERE id=$6",
          [
            data.name,
            data.email,
            data.phone,
            data.jobTitle,
            avatar,
            id,
            data.profileType ?? null,
          ],
        );
        after = await this.member(t, id);
      }
      await this.s.query(
        "UPDATE bo.memberships SET role=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND user_id=$3",
        [role, t, id],
      );
      const audit = (r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        jobTitle: r.job_title,
        profileType: r.profile_type ?? "INTERNAL_TEAM",
        hasAvatar: !!r.avatar,
        role: r.role,
      });
      if (input.profile) {
        const memberships = (
          await this.s.query(
            "SELECT tenant_id FROM bo.memberships WHERE user_id=$1",
            [id],
          )
        ).rows;
        for (const m of memberships) {
          const previousRole =
            m.tenant_id === t
              ? before.role
              : (await this.member(m.tenant_id, id)).role;
          await this.s.log(
            m.tenant_id,
            actor,
            "UPDATE_USER_PROFILE",
            "users",
            id,
            { ...audit(before), role: previousRole },
            { ...audit(after), role: m.tenant_id === t ? role : previousRole },
          );
        }
      } else
        await this.s.log(
          t,
          actor,
          "CHANGE_ROLE",
          "users",
          id,
          { role: before.role },
          { role },
        );
      return { user: this.publicUser(await this.member(t, id), canEdit, t) };
    });
  }
  async remove(t, id, input, actor) {
    keys(input, ["accessVersion"]);
    const expected = version(input.accessVersion);
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      await this.admin(t, actor);
      const before = await this.member(t, id);
      if (id === actor) fail(409, "You cannot change your own access");
      if (before.access_version !== expected)
        fail(409, "El acceso ha cambiado. Recarga antes de eliminar.");
      await this.s.query(
        "DELETE FROM bo.memberships WHERE tenant_id=$1 AND user_id=$2",
        [t, id],
      );
      await this.s.query(
        "DELETE FROM bo.account_invitations WHERE tenant_id=$1 AND user_id=$2",
        [t, id],
      );
      if (
        !(
          await this.s.query("SELECT 1 FROM bo.memberships WHERE user_id=$1", [
            id,
          ])
        ).rowCount
      )
        await this.s.query("DELETE FROM bo.sessions WHERE user_id=$1", [id]);
      await this.s.log(
        t,
        actor,
        "REMOVE_USER_ACCESS",
        "users",
        id,
        { name: before.name, email: before.email, role: before.role },
        null,
      );
      return { ok: true };
    });
  }
  async reissue(t, id, input, actor) {
    keys(input, ["accessVersion"]);
    const expected = version(input.accessVersion);
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      await this.admin(t, actor);
      const before = await this.member(t, id);
      if (before.access_version !== expected)
        fail(409, "El acceso ha cambiado. Recarga antes de continuar.");
      if (before.password_ready)
        fail(
          409,
          "La cuenta ya está activada. Solo el usuario puede cambiar su contraseña.",
        );
      const invitation = await this.invitation(t, id);
      await this.s.log(t, actor, "REISSUE_USER_INVITATION", "users", id);
      return invitation;
    });
  }
  async activate(input, key) {
    keys(input, ["token", "password"]);
    passwordValue(input.password);
    this.throttle("activate:" + key);
    if (typeof input.token !== "string" || !/^[a-f0-9]{64}$/.test(input.token))
      this.wrong(
        "activate:" + key,
        "El enlace de activación no es válido o ha caducado.",
      );
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      const r = (
        await this.s.query(
          "SELECT i.*,u.password_ready FROM bo.account_invitations i JOIN bo.users u ON u.id=i.user_id JOIN bo.memberships m ON m.user_id=i.user_id AND m.tenant_id=i.tenant_id WHERE token_hash=$1 AND expires_at>now()",
          [hashToken(input.token)],
        )
      ).rows[0];
      if (!r || r.password_ready)
        this.wrong(
          "activate:" + key,
          "El enlace de activación no es válido o ha caducado.",
        );
      await this.s.query(
        "UPDATE bo.users SET password_hash=$1,password_ready=true,profile_version=profile_version+1,updated_at=now() WHERE id=$2",
        [passwordHash(input.password), r.user_id],
      );
      await this.s.query(
        "DELETE FROM bo.account_invitations WHERE user_id=$1",
        [r.user_id],
      );
      await this.s.log(
        r.tenant_id,
        r.user_id,
        "ACTIVATE_USER",
        "users",
        r.user_id,
      );
      this.attempts.delete("activate:" + key);
      return { ok: true };
    });
  }
  async self(id) {
    const u = await this.s.user(id);
    if (!u) fail(404, "User not found");
    return { user: u };
  }
  async saveSelf(id, input) {
    keys(input, ["version", "data"]);
    const expected = version(input.version),
      data = profileData(input.data);
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      const before = (
        await this.s.query("SELECT * FROM bo.users WHERE id=$1", [id])
      ).rows[0];
      if (!before) fail(404, "User not found");
      if (before.profile_version !== expected)
        fail(409, "El perfil ha cambiado. Recarga antes de guardar.");
      const avatar = await this.avatarMeta(id, data.avatar, before.avatar);
      await this.s.query(
        "UPDATE bo.users SET name=$1,phone=$2,job_title=$3,avatar=$4,profile_version=profile_version+1,updated_at=now() WHERE id=$5",
        [data.name, data.phone, data.jobTitle, avatar, id],
      );
      const memberships = (
        await this.s.query(
          "SELECT tenant_id FROM bo.memberships WHERE user_id=$1",
          [id],
        )
      ).rows;
      for (const m of memberships)
        await this.s.log(
          m.tenant_id,
          id,
          "UPDATE_USER_PROFILE",
          "users",
          id,
          {
            name: before.name,
            phone: before.phone,
            jobTitle: before.job_title,
            hasAvatar: !!before.avatar,
          },
          {
            name: data.name,
            phone: data.phone,
            jobTitle: data.jobTitle,
            hasAvatar: !!avatar,
          },
        );
      return this.self(id);
    });
  }
  async password(id, input, currentHash) {
    keys(input, ["currentPassword", "newPassword", "code"]);
    const next = passwordValue(input.newPassword);
    if (
      typeof input.currentPassword !== "string" ||
      input.currentPassword.length > 128
    )
      fail(400, "Introduce tu contraseña actual");
    const key = "password:" + id;
    this.throttle(key);
    return this.s.transaction(async () => {
      await this.s.lock("user-administration");
      const u = (await this.s.query("SELECT * FROM bo.users WHERE id=$1", [id]))
        .rows[0];
      if (!u || !passwordMatches(input.currentPassword, u.password_hash))
        this.wrong(key, "La contraseña actual no es correcta.");
      if (passwordMatches(next, u.password_hash))
        fail(400, "La nueva contraseña debe ser distinta de la actual.");
      let step = null;
      if (u.mfa_secret) {
        step = matchingStep(this.s.decrypt(u.mfa_secret), input.code);
        if (step === null || Number(u.mfa_last_step ?? 0) >= step)
          this.wrong(
            key,
            "Introduce un código válido y nuevo de tu autenticador.",
          );
      }
      await this.s.query(
        "UPDATE bo.users SET password_hash=$1,mfa_last_step=COALESCE($2,mfa_last_step),profile_version=profile_version+1,updated_at=now() WHERE id=$3",
        [passwordHash(next), step, id],
      );
      await this.s.query(
        "DELETE FROM bo.sessions WHERE user_id=$1 AND token_hash<>$2",
        [id, currentHash],
      );
      for (const m of (
        await this.s.query(
          "SELECT tenant_id FROM bo.memberships WHERE user_id=$1",
          [id],
        )
      ).rows)
        await this.s.log(m.tenant_id, id, "CHANGE_PASSWORD", "users", id);
      this.attempts.delete(key);
      return { ok: true, ...(await this.self(id)) };
    });
  }
  async avatar(t, id, actor, own = false) {
    if (!own) {
      await this.admin(t, actor);
      await this.member(t, id);
    }
    const r = (
      await this.s.query("SELECT avatar FROM bo.users WHERE id=$1", [id])
    ).rows[0];
    if (!r?.avatar) fail(404, "Avatar no disponible");
    return this.s.files.read(id, "userAvatars", r.avatar);
  }
}
export async function handleAccounts({
  service,
  path,
  method,
  body,
  tenant,
  role,
  user,
  tokenHash,
  rateKey,
  send,
  sendBytes,
}) {
  if (path === "/api/account/activate" && method === "POST") {
    send(200, await service.activate(body, rateKey));
    return true;
  }
  if (path.startsWith("/api/profile")) {
    if (!user) fail(401, "Sign in required");
    if (path === "/api/profile" && method === "GET")
      send(200, await service.self(user.id));
    else if (path === "/api/profile" && method === "PUT")
      send(200, await service.saveSelf(user.id, body));
    else if (path === "/api/profile/password" && method === "PUT")
      send(200, await service.password(user.id, body, tokenHash));
    else if (path === "/api/profile/avatar" && method === "GET")
      sendBytes(await service.avatar(null, user.id, user.id, true));
    else fail(404, "Route not found");
    return true;
  }
  if (path !== "/api/users" && !path.startsWith("/api/users/")) return false;
  if (!user) fail(401, "Sign in required");
  if (role !== "admin") fail(403, "Administrator access required");
  if (path === "/api/users" && method === "GET") {
    send(200, await service.list(tenant, user.id));
    return true;
  }
  if (path === "/api/users" && method === "POST") {
    send(201, await service.create(tenant, body, user.id));
    return true;
  }
  const match = path.match(
    /^\/api\/users\/([a-zA-Z0-9-]{1,80})(?:\/(avatar|invitation))?$/,
  );
  if (match) {
    const [, id, section] = match;
    if (section === "avatar" && method === "GET")
      sendBytes(await service.avatar(tenant, id, user.id));
    else if (section === "invitation" && method === "POST")
      send(200, await service.reissue(tenant, id, body, user.id));
    else if (!section && method === "PUT")
      send(200, await service.update(tenant, id, body, user.id));
    else if (!section && method === "DELETE")
      send(200, await service.remove(tenant, id, body, user.id));
    else fail(404, "Route not found");
    return true;
  }
  fail(404, "Route not found");
}
