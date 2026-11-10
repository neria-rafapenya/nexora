import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.mjs";
import { LocalFiles } from "../src/file-storage.mjs";
import { migrateFiles } from "../src/migrate-files.mjs";
import { DocumentsService } from "../src/documents.mjs";
import { OrdersService } from "../src/orders.mjs";
test(
  "PostgreSQL files: new uploads persist references only; legacy migration preserves bytes/version links and scrubs audit; fixtures roll back",
  { skip: !process.env.NEXORA_FILES_DB_TEST },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "horekia-db-files-")),
      s = new Store(process.env.DATABASE_URL, {
        files: new LocalFiles(join(dir, "uploads")),
      }),
      rollback = new Error("Rollback file fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const t = "file-test-" + randomUUID();
            await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [t]);
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0]?.user_id;
            assert(actor);
            const supplier = await s.create(
              t,
              "suppliers",
              { name: "Demo file test", active: true },
              actor,
            );
            const docs = new DocumentsService(s),
              doc = await docs.create(
                t,
                {
                  title: "Storage fixture",
                  supplierId: supplier.id,
                  kind: "CERTIFICATE",
                  productIds: [],
                },
                actor,
              );
            const content = "MOCK private storage fixture";
            const version = await docs.upload(
              t,
              doc.id,
              {
                version: doc.version,
                attachment: {
                  filename: "fixture.txt",
                  mime: "text/plain",
                  base64: Buffer.from(content).toString("base64"),
                },
                effectiveFrom: "2020-01-01",
                expiresAt: "2035-01-01",
                sourceReference: "FILE TEST",
                isMock: true,
                declarations: {},
              },
              actor,
            );
            const file = await s.get(t, "documentFiles", version.data.fileId);
            assert(!("base64" in file.data));
            assert(file.data.storageKey);
            assert.equal(
              (await s.files.read(t, "documentFiles", file.data)).toString(),
              content,
            );
            const view = await docs.view(t, doc.id);
            assert(!("storageKey" in view.files[0].data));
            assert.equal(
              Buffer.from(
                (await docs.download(t, doc.id, version.id, actor)).base64,
                "base64",
              ).toString(),
              content,
            );
            await assert.rejects(
              () => docs.download("another-tenant", doc.id, version.id, actor),
              /Record not found/,
            );
            const orders = new OrdersService(s);
            const png = Buffer.from("89504e470d0a1a0a", "hex").toString(
              "base64",
            );
            const message = await orders.createMessage(
              t,
              {
                channel: "MANUAL",
                sender: "storage@example.test",
                body: "Mock attached entry",
                attachment: {
                  filename: "fixture.png",
                  mime: "image/png",
                  base64: png,
                },
              },
              actor,
            );
            const attached = (await s.list(t, "orderAttachments"))[0];
            assert(!("base64" in attached.data));
            assert(attached.data.storageKey);
            assert.equal(
              (await orders.message(t, message.id)).attachments[0].data.base64,
              png,
            );
            assert(
              !(
                "storageKey" in
                (await orders.message(t, message.id)).attachments[0].data
              ),
            );
            // Emulate old database rows and old audit snapshots to exercise migration in this isolated tenant.
            const legacy = {
              ...file.data,
              base64: Buffer.from(content).toString("base64"),
            };
            delete legacy.storageKey;
            await s.query('UPDATE bo."documentFiles" SET data=$2 WHERE id=$1', [
              file.id,
              JSON.stringify(legacy),
            ]);
            await s.query(
              "UPDATE bo.audit SET after_data=$2 WHERE resource=$3 AND record_id=$1",
              [file.id, JSON.stringify(legacy), "documentFiles"],
            );
            const result = await migrateFiles(s, {
              tenantId: t,
              backupDir: join(dir, "backups"),
            });
            assert.equal(result.migrated, 1);
            assert.equal(result.verified, 2);
            assert(
              (await readFile(result.backup, "utf8")).includes(legacy.base64),
            );
            assert.equal(
              (await s.get(t, "documentFiles", file.id)).data.storageKey,
              file.data.storageKey,
            );
            assert.equal(
              Buffer.from(
                (await docs.download(t, doc.id, version.id, actor)).base64,
                "base64",
              ).toString(),
              content,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.audit WHERE tenant_id=$1 AND (before_data ? 'base64' OR after_data ? 'base64')",
                  [t],
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await migrateFiles(s, {
                  tenantId: t,
                  backupDir: join(dir, "backups"),
                })
              ).migrated,
              0,
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
