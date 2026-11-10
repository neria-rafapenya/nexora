import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { Store, passwordMatches, passwordHash } from "../src/store.mjs";
import { Accounts } from "../src/accounts.mjs";
import { LocalFiles } from "../src/file-storage.mjs";
import { totp } from "../src/totp.mjs";
test(
  "PostgreSQL accounts: invitations, shared-account permissions, profile/avatar CRUD, passwords/MFA, revocation and audit; fixtures roll back",
  { skip: !process.env.NEXORA_ACCOUNTS_DB_TEST },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "horekia-accounts-")),
      s = new Store(process.env.DATABASE_URL, { files: new LocalFiles(dir) }),
      rollback = new Error("Rollback account fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            await s.migrate();
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0]?.user_id;
            assert(actor);
            const a = "accounts-a-" + randomUUID(),
              b = "accounts-b-" + randomUUID(),
              c = "accounts-c-" + randomUUID();
            for (const t of [a, b, c])
              await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [
                t,
              ]);
            await s.query(
              "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'admin')",
              [actor, a],
            );
            await s.query(
              "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'admin')",
              [actor, b],
            );
            const service = new Accounts(s),
              input = {
                profile: {
                  name: "Test person",
                  email: randomUUID() + "@example.invalid",
                  phone: "12345",
                  jobTitle: "Operator",
                  profileType: "CENTER_BUYER",
                },
                role: "read_only",
              };
            await assert.rejects(
              () => service.create(c, input, actor),
              (e) => e.status === 403,
            );
            const created = await service.create(a, input, actor),
              id = created.user.id,
              token = created.activationPath.split("token=")[1];
            assert(token);
            assert.equal(created.user.pendingActivation, true);
            assert.equal(created.user.profileType, "CENTER_BUYER");
            const initial = (
              await s.query("SELECT * FROM bo.users WHERE id=$1", [id])
            ).rows[0];
            assert.equal(initial.password_ready, false);
            assert(
              !JSON.stringify(await service.list(a, actor)).includes(token),
            );
            await assert.rejects(
              () => service.activate({ token, password: "short" }, "test"),
              (e) => e.status === 400,
            );
            const nextInvite = await service.reissue(
              a,
              id,
              { accessVersion: 1 },
              actor,
            );
            await assert.rejects(
              () =>
                service.activate(
                  { token, password: "Initial test password" },
                  "test",
                ),
              (e) => e.status === 400,
            );
            const nextToken = nextInvite.activationPath.split("token=")[1];
            await service.activate(
              { token: nextToken, password: "Initial test password" },
              "test",
            );
            await assert.rejects(
              () =>
                service.activate(
                  { token: nextToken, password: "Another test password" },
                  "test",
                ),
              (e) => e.status === 400,
            );
            await assert.rejects(
              () => service.reissue(a, id, { accessVersion: 1 }, actor),
              (e) => e.status === 409,
            );
            let u = (await service.list(a, actor)).users.find(
              (u) => u.id === id,
            );
            assert.equal(u.pendingActivation, false);
            assert(u.createdAt);
            assert(u.updatedAt);
            assert.equal(u.profileVersion, 2);
            assert.equal(u.profileType, "CENTER_BUYER");
            await assert.rejects(
              () =>
                service.update(
                  a,
                  id,
                  { role: "quality", accessVersion: 1, password: "FORBIDDEN" },
                  actor,
                ),
              (e) => e.status === 400,
            );
            const image = await sharp({
                create: {
                  width: 20,
                  height: 20,
                  channels: 3,
                  background: "#204e40",
                },
              })
                .png()
                .toBuffer(),
              avatar = {
                filename: "avatar.png",
                mime: "image/png",
                base64: image.toString("base64"),
              };
            u = (
              await service.update(
                a,
                id,
                {
                  role: "quality",
                  accessVersion: u.accessVersion,
                  profile: {
                    version: u.profileVersion,
                    data: { ...input.profile, name: "Updated person", avatar },
                  },
                },
                actor,
              )
            ).user;
            assert.equal(u.role, "quality");
            assert.equal(u.profileVersion, 3);
            assert(u.avatarUrl.includes("company=" + a));
            const metadata = (
              await s.query("SELECT avatar FROM bo.users WHERE id=$1", [id])
            ).rows[0].avatar;
            assert(!("base64" in metadata));
            const bytes = await service.avatar(a, id, actor);
            assert.equal((await sharp(bytes).metadata()).width, 256);
            await assert.rejects(
              () => service.avatar(b, id, actor),
              (e) => e.status === 404,
            );
            await assert.rejects(
              () =>
                service.update(
                  a,
                  id,
                  { role: "commercial", accessVersion: 1 },
                  actor,
                ),
              (e) => e.status === 409,
            );
            await assert.rejects(
              () =>
                service.saveSelf(id, {
                  version: 2,
                  data: { name: "Stale", phone: "", jobTitle: "" },
                }),
              (e) => e.status === 409,
            );
            let self = (
              await service.saveSelf(id, {
                version: 3,
                data: {
                  name: "Own name",
                  phone: "999",
                  jobTitle: "Chef",
                  avatar: null,
                },
              })
            ).user;
            assert.equal(self.name, "Own name");
            assert.equal(self.avatarUrl, null);
            await assert.rejects(
              () => service.avatar(a, id, actor),
              (e) => e.status === 404,
            );
            await s.query(
              "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'read_only')",
              [id, c],
            );
            u = (await service.list(a, actor)).users.find((u) => u.id === id);
            assert.equal(u.canEditProfile, false);
            await assert.rejects(
              () =>
                service.update(
                  a,
                  id,
                  {
                    role: "read_only",
                    accessVersion: u.accessVersion,
                    profile: {
                      version: self.profileVersion,
                      data: input.profile,
                    },
                  },
                  actor,
                ),
              (e) => e.status === 403,
            );
            await service.update(
              a,
              id,
              { role: "read_only", accessVersion: u.accessVersion },
              actor,
            );
            await assert.rejects(
              () => service.remove(a, actor, { accessVersion: 1 }, actor),
              (e) => e.status === 409,
            );
            await s.query(
              "INSERT INTO bo.sessions(token_hash,user_id,expires) VALUES($1,$2,$3),($4,$2,$3)",
              ["keep", id, Date.now() + 60000, "revoke"],
            );
            await assert.rejects(
              () =>
                service.password(
                  id,
                  {
                    currentPassword: "wrong",
                    newPassword: "New test password",
                  },
                  "keep",
                ),
              (e) => e.status === 400,
            );
            const secret = "JBSWY3DPEHPK3PXP";
            await s.query("UPDATE bo.users SET mfa_secret=$1 WHERE id=$2", [
              s.encrypt(secret),
              id,
            ]);
            await assert.rejects(
              () =>
                service.password(
                  id,
                  {
                    currentPassword: "Initial test password",
                    newPassword: "New test password",
                  },
                  "keep",
                ),
              (e) => e.status === 400,
            );
            const usedCode = totp(secret);
            await service.password(
              id,
              {
                currentPassword: "Initial test password",
                newPassword: "New test password",
                code: usedCode,
              },
              "keep",
            );
            const account = (
              await s.query("SELECT * FROM bo.users WHERE id=$1", [id])
            ).rows[0];
            assert(passwordMatches("New test password", account.password_hash));
            assert(
              !passwordMatches("Initial test password", account.password_hash),
            );
            assert.equal(
              (
                await s.query(
                  "SELECT token_hash FROM bo.sessions WHERE user_id=$1",
                  [id],
                )
              ).rows[0].token_hash,
              "keep",
            );
            await assert.rejects(
              () =>
                service.password(
                  id,
                  {
                    currentPassword: "New test password",
                    newPassword: "Third test password",
                    code: usedCode,
                  },
                  "keep",
                ),
              (e) => e.status === 400,
            );
            u = (await service.list(a, actor)).users.find((u) => u.id === id);
            await service.remove(
              a,
              id,
              { accessVersion: u.accessVersion },
              actor,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.memberships WHERE user_id=$1 AND tenant_id=$2",
                  [id, c],
                )
              ).rowCount,
              1,
            );
            assert.equal(
              (
                await s.query("SELECT 1 FROM bo.sessions WHERE user_id=$1", [
                  id,
                ])
              ).rowCount,
              1,
            );
            assert.equal(
              (await s.query("SELECT 1 FROM bo.users WHERE id=$1", [id]))
                .rowCount,
              1,
            );
            const other = await service.create(
              a,
              {
                ...input,
                profile: {
                  ...input.profile,
                  email: randomUUID() + "@example.invalid",
                },
              },
              actor,
            );
            await s.query(
              "INSERT INTO bo.sessions(token_hash,user_id,expires) VALUES($1,$2,$3)",
              ["orphan-test", other.user.id, Date.now() + 60000],
            );
            await service.remove(a, other.user.id, { accessVersion: 1 }, actor);
            assert.equal(
              (
                await s.query("SELECT 1 FROM bo.sessions WHERE user_id=$1", [
                  other.user.id,
                ])
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.account_invitations WHERE user_id=$1",
                  [other.user.id],
                )
              ).rowCount,
              0,
            );
            const audits = (
              await s.query(
                "SELECT before_data,after_data FROM bo.audit WHERE tenant_id=$1 AND resource='users'",
                [a],
              )
            ).rows;
            const auditText = JSON.stringify(audits);
            assert(!auditText.includes("base64"));
            assert(!auditText.includes("storageKey"));
            assert(!auditText.includes("password_hash"));
            assert(!auditText.includes(nextToken));
            assert(!auditText.includes("Initial test password"));
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM pg_class WHERE relnamespace='bo'::regnamespace AND relname='account_invitations' AND relrowsecurity",
                )
              ).rowCount,
              1,
            );
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await s.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
