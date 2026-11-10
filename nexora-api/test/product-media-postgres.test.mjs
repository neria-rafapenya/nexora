import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../src/store.mjs";
import { LocalFiles } from "../src/file-storage.mjs";
import { ProductMedia } from "../src/product-media.mjs";
test(
  "PostgreSQL product files: one replaceable image, private disk-only bytes, multiple documents, versions, tenant/product isolation and deletion; fixtures roll back",
  { skip: !process.env.NEXORA_PRODUCT_MEDIA_DB_TEST },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "horekia-product-media-")),
      s = new Store(process.env.DATABASE_URL, { files: new LocalFiles(dir) }),
      rollback = new Error("Rollback product media fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0]?.user_id;
            assert(actor);
            const t = "media-" + randomUUID();
            await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [t]);
            const category = await s.create(
                t,
                "mainCategories",
                { name: "Media tests", active: true },
                actor,
              ),
              family = await s.create(
                t,
                "families",
                {
                  name: "Media tests",
                  temperature: "AMBIENT",
                  mainCategoryId: category.id,
                },
                actor,
              );
            const product = await s.create(
              t,
              "products",
              {
                sku: "MEDIA",
                name: "Product media fixture",
                familyId: family.id,
                unit: "KG",
                temperature: "AMBIENT",
                active: true,
                allergenStatus: "UNVERIFIED",
              },
              actor,
            );
            const service = new ProductMedia(s),
              png = await sharp({
                create: {
                  width: 20,
                  height: 12,
                  channels: 3,
                  background: "green",
                },
              })
                .png()
                .toBuffer();
            const input = {
              kind: "IMAGE",
              version: null,
              file: {
                filename: "photo.png",
                mime: "image/png",
                base64: png.toString("base64"),
              },
            };
            let image = await service.upload(t, product.id, input, actor);
            assert.equal(image.data.mime, "image/webp");
            assert(!("base64" in image.data));
            assert(!("storageKey" in image.data));
            const stored = await s.get(t, "productFiles", image.id);
            assert(stored.data.storageKey);
            assert(!("base64" in stored.data));
            await s.files.read(t, "productFiles", stored.data);
            image = await service.upload(
              t,
              product.id,
              { ...input, version: image.version },
              actor,
            );
            assert.equal(image.id, stored.id);
            assert.equal((await service.list(t, product.id)).length, 1);
            await assert.rejects(
              () => service.upload(t, product.id, input, actor),
              /PRODUCT_IMAGE_CHANGED/,
            );
            await s.query("SAVEPOINT image_unique");
            await assert.rejects(
              () => s.create(t, "productFiles", stored.data, actor),
              (e) => e.code === "23505",
            );
            await s.query("ROLLBACK TO SAVEPOINT image_unique");
            for (const name of ["one.pdf", "two.pdf"])
              await service.upload(
                t,
                product.id,
                {
                  kind: "DOCUMENT",
                  file: {
                    filename: name,
                    mime: "application/pdf",
                    base64: Buffer.from("%PDF-1.7\n%%EOF").toString("base64"),
                  },
                },
                actor,
              );
            const all = await service.list(t, product.id);
            assert.equal(
              all.filter((f) => f.data.kind === "DOCUMENT").length,
              2,
            );
            const download = await service.download(
              t,
              product.id,
              image.id,
              actor,
            );
            assert.equal(download.mime, "image/webp");
            assert(!("storageKey" in download));
            await assert.rejects(
              () =>
                service.download("another-tenant", product.id, image.id, actor),
              /Record not found/,
            );
            const other = await s.create(
              t,
              "products",
              { ...product.data, sku: "OTHER" },
              actor,
            );
            await assert.rejects(
              () => service.download(t, other.id, image.id, actor),
              /Record not found/,
            );
            await assert.rejects(
              () => service.remove(t, product.id, image.id, 1, actor),
              /Record changed/,
            );
            await service.remove(t, product.id, image.id, image.version, actor);
            assert.equal(
              (await service.list(t, product.id)).filter(
                (f) => f.data.kind === "IMAGE",
              ).length,
              0,
            );
            const doc = all.find((f) => f.data.kind === "DOCUMENT");
            await service.remove(t, product.id, doc.id, doc.version, actor);
            assert.equal((await service.list(t, product.id)).length, 1);
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.audit WHERE tenant_id=$1 AND resource='productFiles' AND (before_data ? 'base64' OR after_data ? 'base64')",
                  [t],
                )
              ).rowCount,
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
