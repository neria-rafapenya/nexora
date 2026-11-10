import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { DocumentsService } from "../src/documents.mjs";
import { MenusService } from "../src/menus.mjs";
test(
  "PostgreSQL F4: private versions, Quality decisions, technical references and FKs; all fixtures roll back",
  { skip: !process.env.NEXORA_DOCUMENT_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback F4 fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const t = "workspace";
            await s.lock(t);
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
                [t],
              )
            ).rows[0]?.user_id;
            assert(
              actor,
              "Existing actor reference required; no accounts created",
            );
            const svc = new DocumentsService(s),
              links = await s.list(t, "productAllergens"),
              product = (await s.list(t, "products")).find(
                (p) =>
                  p.data.supplierId &&
                  p.data.active &&
                  !links.some((l) => l.data.productId === p.id),
              );
            assert(product);
            let doc = await svc.create(
              t,
              {
                title: "ROLLBACK document " + randomUUID(),
                supplierId: product.data.supplierId,
                kind: "TECHNICAL_SHEET",
                productIds: [product.id],
              },
              actor,
            );
            const input = {
              version: doc.version,
              attachment: {
                filename: "rollback.txt",
                mime: "text/plain",
                base64: Buffer.from(
                  "MOCK ROLLBACK DOCUMENT — NOT SUPPLIER DATA",
                ).toString("base64"),
              },
              effectiveFrom: "2020-01-01",
              expiresAt: "2035-01-01",
              sourceReference: "ROLLBACK ONLY",
              isMock: true,
              declarations: {
                ingredients: "Rollback composition",
                contains: [],
                traces: [],
                allergensComplete: true,
              },
            };
            const version = await svc.upload(t, doc.id, input, actor);
            let view = await svc.view(t, doc.id);
            assert.equal(view.status, "PENDING_REVIEW");
            assert(!view.files[0].data.base64);
            const event = (
              await s.query(
                "SELECT after_data FROM bo.audit WHERE resource='documentFiles' AND record_id=$1",
                [version.data.fileId],
              )
            ).rows[0];
            assert(event);
            assert(!event.after_data.base64);
            await svc.review(
              t,
              doc.id,
              version.id,
              {
                version: version.version,
                documentVersion: view.document.version,
                decision: "APPROVE",
                evidence: "ROLLBACK QUALITY DECISION",
                changeHash: version.data.changeHash,
                confirmed: true,
              },
              "quality",
              actor,
            );
            view = await svc.view(t, doc.id);
            assert.equal(view.status, "VALID");
            const file = await svc.download(t, doc.id, version.id, actor);
            assert.equal(
              Buffer.from(file.base64, "base64").toString(),
              "MOCK ROLLBACK DOCUMENT — NOT SUPPLIER DATA",
            );
            assert.equal(
              await s.get("other", "documentVersions", version.id),
              null,
            );
            const menus = new MenusService(s),
              p = await s.get(t, "products", product.id);
            const review = await menus.reviewTechnical(
              t,
              {
                productId: p.id,
                productVersion: p.version,
                ingredients: "Rollback composition",
                source: "ROLLBACK TEST",
                isMock: true,
                documentVersionId: version.id,
              },
              "quality",
              actor,
            );
            assert.equal(review.data.documentEvidence.versionId, version.id);
            await s.query("SAVEPOINT f4_fk");
            await assert.rejects(
              () =>
                s.query(
                  `UPDATE bo."documentVersions" SET data=jsonb_set(data,'{fileId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), version.id],
                ),
              (e) => e.code === "23503",
            );
            await s.query("ROLLBACK TO SAVEPOINT f4_fk");
            await s.query("SAVEPOINT f4_unique");
            await assert.rejects(
              () => s.create(t, "documentVersions", version.data, actor),
              (e) => e.code === "23505",
            );
            await s.query("ROLLBACK TO SAVEPOINT f4_unique");
            doc = await s.get(t, "supplierDocuments", doc.id);
            const next = await svc.upload(
              t,
              doc.id,
              {
                ...input,
                version: doc.version,
                declarations: { ingredients: "Changed rollback composition" },
              },
              actor,
            );
            assert.equal(next.data.number, 2);
            const current = await s.get(t, "products", p.id);
            await assert.rejects(
              () =>
                menus.reviewTechnical(
                  t,
                  {
                    productId: p.id,
                    productVersion: current.version,
                    ingredients: "Test",
                    source: "TEST",
                    isMock: true,
                    documentVersionId: version.id,
                  },
                  "quality",
                  actor,
                ),
              /current approved document/,
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
