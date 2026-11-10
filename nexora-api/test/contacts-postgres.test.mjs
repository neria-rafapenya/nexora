import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { Contacts } from "../src/contacts.mjs";
test(
  "PostgreSQL public contact: private inbox, tenant/role gates, idempotency, state versions, erasure and 180-day retention; fixtures roll back",
  { skip: !process.env.NEXORA_CONTACTS_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback contact fixtures");
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
            const t = "contacts-" + randomUUID(),
              other = "contacts-" + randomUUID();
            for (const id of [t, other])
              await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [
                id,
              ]);
            await s.query(
              "INSERT INTO bo.memberships(user_id,tenant_id,role) VALUES($1,$2,'admin')",
              [actor, t],
            );
            const service = new Contacts(s, {
              enabled: true,
              tenant: t,
              origin: "https://www.horekia.com",
            });
            const input = {
              name: "Contact fixture",
              email: "fixture@example.invalid",
              company: "Fictitious catering",
              phone: "",
              sector: "CATERING",
              message: "Fictitious request for a demonstration.",
              website: "",
              privacyAcknowledged: true,
              token: service.issue("test-ip").token,
            };
            const result = await service.submit(
              input,
              "test-ip",
              "https://www.horekia.com",
            );
            assert.deepEqual(
              await service.submit(input, "test-ip", "https://www.horekia.com"),
              result,
            );
            let records = (await service.list(t, "admin", actor)).records;
            assert.equal(records.length, 1);
            assert.equal(records[0].data.email, input.email);
            assert.equal(records[0].version, 1);
            assert.equal(records[0].data.privacyVersion, "2026-11-10");
            await assert.rejects(
              () => service.list(other, "admin", actor),
              (e) => e.status === 403,
            );
            await assert.rejects(
              () => service.list(t, "read_only", actor),
              (e) => e.status === 403,
            );
            await assert.rejects(
              () =>
                service.mutate(t, "admin", actor, result.reference, {
                  state: "CONTACTED",
                  version: 2,
                }),
              (e) => e.status === 409,
            );
            await service.mutate(t, "admin", actor, result.reference, {
              state: "CONTACTED",
              version: 1,
            });
            records = (await service.list(t, "admin", actor)).records;
            assert.equal(records[0].version, 2);
            assert.equal(records[0].state, "CONTACTED");
            assert(records[0].createdAt);
            assert(records[0].updatedAt);
            await service.mutate(
              t,
              "admin",
              actor,
              result.reference,
              { version: 2 },
              true,
            );
            assert.equal(
              (await service.list(t, "admin", actor)).records.length,
              0,
            );
            const second = await service.submit(
              { ...input, token: service.issue("test-ip").token },
              "test-ip",
              "https://www.horekia.com",
            );
            await s.query(
              "UPDATE bo.contact_leads SET created_at=now()-interval '181 days' WHERE id=$1",
              [second.reference],
            );
            assert.equal((await service.prune()).removed, 1);
            const audit = JSON.stringify(
              (
                await s.query(
                  "SELECT before_data,after_data FROM bo.audit WHERE tenant_id=$1 AND resource='contactLeads'",
                  [t],
                )
              ).rows,
            );
            assert(!audit.includes(input.email));
            assert(!audit.includes(input.message));
            assert(!audit.includes(input.token));
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM pg_class WHERE relnamespace='bo'::regnamespace AND relname='contact_leads' AND relrowsecurity",
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
    }
  },
);
