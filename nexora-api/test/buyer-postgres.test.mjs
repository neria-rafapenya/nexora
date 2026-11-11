import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store, passwordHash, hashToken } from "../src/store.mjs";
import { totp } from "../src/totp.mjs";
import { BuyerAccess, handleBuyer } from "../src/buyer.mjs";
test(
  "buyer access: tenant/center isolation, no implicit access, revocation, sessions and stale writes; all fixtures roll back",
  { skip: !process.env.NEXORA_BUYER_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL);
    const rollback = new Error("rollback buyer fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            await s.migrate();
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0].user_id;
            const a = "buyer-a-" + randomUUID(),
              b = "buyer-b-" + randomUUID(),
              buyer = randomUUID(),
              stranger = randomUUID(),
              email = randomUUID() + "@example.invalid";
            for (const t of [a, b]) {
              await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [
                t,
              ]);
              await s.query(
                "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'admin')",
                [actor, t],
              );
            }
            for (const [id, mail] of [
              [buyer, email],
              [stranger, randomUUID() + "@example.invalid"],
            ]) {
              await s.query(
                "INSERT INTO bo.users(id,email,name,password_hash,profile_type) VALUES($1,$2,'Buyer fixture',$3,'CENTER_BUYER')",
                [id, mail, passwordHash("Fixture password 1234")],
              );
              await s.query(
                "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'center_buyer')",
                [id, a],
              );
            }
            await s.query(
              "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'center_buyer')",
              [buyer, b],
            );
            const clientTemplate = (await s.list("workspace", "clients"))[0]
                .data,
              centerTemplate = (await s.list("workspace", "centers"))[0].data;
            const centers = [];
            for (const t of [a, a, b]) {
              const c = await s.create(
                t,
                "clients",
                {
                  ...clientTemplate,
                  name: "Demo " + randomUUID(),
                  erpCode: "TEST-" + randomUUID(),
                },
                actor,
              );
              centers.push({
                tenant: t,
                row: await s.create(
                  t,
                  "centers",
                  {
                    ...centerTemplate,
                    name: "Demo " + randomUUID(),
                    clientId: c.id,
                  },
                  actor,
                ),
              });
            }
            const service = new BuyerAccess(s);
            assert.deepEqual(await service.centers({ id: buyer }), []);
            await assert.rejects(
              () =>
                service.login(
                  { email, password: "Fixture password 1234" },
                  "no-centers",
                ),
              (e) => e.status === 403,
            );
            const initial = await service.grants(a, buyer, actor);
            await assert.rejects(
              () => service.grants(a, buyer, stranger),
              (e) => e.status === 403,
            );
            await assert.rejects(
              () =>
                service.saveGrants(
                  a,
                  buyer,
                  {
                    revision: initial.revision,
                    centerIds: [centers[2].row.id],
                  },
                  actor,
                ),
              (e) => e.status === 403,
            );
            const grant = await service.saveGrants(
              a,
              buyer,
              { revision: initial.revision, centerIds: [centers[0].row.id] },
              actor,
            );
            await assert.rejects(
              () =>
                service.saveGrants(
                  a,
                  buyer,
                  { revision: initial.revision, centerIds: [] },
                  actor,
                ),
              (e) => e.status === 409,
            );
            const login = await service.login(
              { email, password: "Fixture password 1234" },
              "allowed",
            );
            assert.deepEqual(
              login.centers.map((c) => c.id),
              [centers[0].row.id],
            );
            assert.equal((await service.session(login.token)).id, buyer);
            assert.equal(await service.session("invalid"), null);
            let sent, cookie;
            const send = (status, body) => {
              sent = { status, body };
            };
            const args = {
              service,
              method: "GET",
              body: {},
              secure: true,
              send,
              res: {
                setHeader: (k, v) => {
                  cookie = v;
                },
              },
              req: {
                headers: { cookie: "horekia_buyer_session=" + login.token },
                socket: { remoteAddress: "fixture" },
                url: "/api/client/session",
              },
            };
            let loginCookie;
            await handleBuyer({
              ...args,
              path: "/api/client/login",
              method: "POST",
              body: { email, password: "Fixture password 1234" },
              res: {
                setHeader: (k, v) => {
                  loginCookie = v;
                },
              },
            });
            assert(loginCookie.includes("HttpOnly"));
            assert(loginCookie.includes("SameSite=Strict"));
            assert(loginCookie.includes("Secure"));
            assert(loginCookie.includes("Path=/api/client"));
            await assert.rejects(
              () =>
                handleBuyer({
                  ...args,
                  path: "/api/client/session",
                  req: {
                    ...args.req,
                    headers: { cookie: "nexora_session=" + login.token },
                  },
                }),
              (e) => e.status === 401,
            );
            await handleBuyer({ ...args, path: "/api/client/session" });
            assert.equal(sent.status, 200);
            assert.equal(sent.body.centers.length, 1);
            assert(!JSON.stringify(sent).includes(login.token));
            await assert.rejects(
              () =>
                handleBuyer({
                  ...args,
                  path: "/api/client/catalog",
                  req: {
                    ...args.req,
                    url:
                      "/api/client/catalog?center=" +
                      centers[1].row.id +
                      "&company=" +
                      a,
                  },
                }),
              (e) => e.status === 403,
            );
            await assert.rejects(
              () =>
                handleBuyer({
                  ...args,
                  path: "/api/client/catalog",
                  req: {
                    ...args.req,
                    url:
                      "/api/client/catalog?center=" +
                      centers[2].row.id +
                      "&company=" +
                      b,
                  },
                }),
              (e) => e.status === 403,
            );
            await handleBuyer({
              ...args,
              path: "/api/client/catalog",
              req: {
                ...args.req,
                url:
                  "/api/client/catalog?center=" +
                  centers[0].row.id +
                  "&company=" +
                  a,
              },
            });
            assert.equal(sent.status, 200);
            await service.saveGrants(
              a,
              buyer,
              { revision: grant.revision, centerIds: [] },
              actor,
            );
            assert.deepEqual(await service.centers({ id: buyer }), []);
            await assert.rejects(
              () =>
                handleBuyer({
                  ...args,
                  path: "/api/client/catalog",
                  req: {
                    ...args.req,
                    url:
                      "/api/client/catalog?center=" +
                      centers[0].row.id +
                      "&company=" +
                      a,
                  },
                }),
              (e) => e.status === 403,
            );
            await handleBuyer({
              ...args,
              path: "/api/client/logout",
              method: "POST",
            });
            assert(cookie.includes("Max-Age=0"));
            assert.equal(await service.session(login.token), null);
            assert.equal(
              (
                await s.query(
                  "SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='bo'::regnamespace AND relname IN ('buyer_sessions','center_access') AND relrowsecurity",
                )
              ).rows[0].n,
              2,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.buyer_sessions WHERE token_hash=$1",
                  [hashToken(login.token)],
                )
              ).rowCount,
              0,
            );
            const current = await service.grants(a, buyer, actor);
            await service.saveGrants(
              a,
              buyer,
              { revision: current.revision, centerIds: [centers[0].row.id] },
              actor,
            );
            const secret = "JBSWY3DPEHPK3PXP";
            await s.query("UPDATE bo.users SET mfa_secret=$1 WHERE id=$2", [
              s.encrypt(secret),
              buyer,
            ]);
            await assert.rejects(
              () =>
                service.login(
                  { email, password: "Fixture password 1234", code: "invalid" },
                  "mfa",
                ),
              (e) => e.status === 401,
            );
            const code = totp(secret);
            await service.login(
              { email, password: "Fixture password 1234", code },
              "mfa",
            );
            await assert.rejects(
              () =>
                service.login(
                  { email, password: "Fixture password 1234", code },
                  "mfa",
                ),
              (e) => e.status === 401,
            );
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await s.close();
    }
  },
);
