import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  prepareProductFile,
  maxProductFileBytes,
} from "../src/product-media.mjs";
import { handleProductMedia } from "../src/product-media-http.mjs";
const file = (filename, mime, bytes) => ({
  filename,
  mime,
  base64: bytes.toString("base64"),
});
test("product images are decoded and normalized; unsupported, corrupt and oversized images are rejected", async () => {
  const bytes = await sharp({
    create: { width: 20, height: 12, channels: 3, background: "#3b7858" },
  })
    .png()
    .toBuffer();
  const result = await prepareProductFile(
    "IMAGE",
    file("photo.png", "image/png", bytes),
  );
  assert.equal(result.mime, "image/webp");
  assert.equal(result.filename, "photo.webp");
  assert.equal(
    (await sharp(Buffer.from(result.base64, "base64")).metadata()).format,
    "webp",
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "IMAGE",
        file("image.png", "image/png", Buffer.alloc(maxProductFileBytes + 1)),
      ),
    /PRODUCT_IMAGE_TOO_LARGE/,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "IMAGE",
        file("image.svg", "image/svg+xml", Buffer.from("<svg/>")),
      ),
    /PRODUCT_IMAGE_TYPE/,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "IMAGE",
        file("image.png", "image/png", Buffer.from("not a png")),
      ),
    /PRODUCT_IMAGE_INVALID/,
  );
  await assert.rejects(
    () => prepareProductFile("IMAGE", file("image.jpg", "image/jpeg", bytes)),
    /PRODUCT_IMAGE_INVALID/,
  );
  const huge = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  assert(huge.length < maxProductFileBytes);
  await assert.rejects(
    () => prepareProductFile("IMAGE", file("large.png", "image/png", huge)),
    /PRODUCT_IMAGE_INVALID/,
  );
});
test("PDF and legacy DOC enforce a 1 MB per-file limit, extension/MIME/signature and safe filenames", async () => {
  const exact = Buffer.alloc(maxProductFileBytes, 32);
  exact.write("%PDF-1.7\n");
  assert.equal(
    Buffer.from(
      (
        await prepareProductFile(
          "DOCUMENT",
          file("manual.pdf", "application/pdf", exact),
        )
      ).base64,
      "base64",
    ).length,
    maxProductFileBytes,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "DOCUMENT",
        file(
          "manual.pdf",
          "application/pdf",
          Buffer.alloc(maxProductFileBytes + 1),
        ),
      ),
    /PRODUCT_DOCUMENT_TOO_LARGE/,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "DOCUMENT",
        file(
          "manual.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          Buffer.from("PK00"),
        ),
      ),
    /PRODUCT_DOCUMENT_TYPE/,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "DOCUMENT",
        file("manual.pdf", "application/pdf", Buffer.from("bad content")),
      ),
    /PRODUCT_DOCUMENT_INVALID/,
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "DOCUMENT",
        file("../manual.pdf", "application/pdf", Buffer.from("%PDF-1.7")),
      ),
    /PRODUCT_FILE_INVALID/,
  );
  const doc = Buffer.concat([
    Buffer.from("d0cf11e0a1b11ae1", "hex"),
    Buffer.alloc(100),
    Buffer.from("WordDocument", "utf16le"),
  ]);
  assert.equal(
    (
      await prepareProductFile(
        "DOCUMENT",
        file("legacy.doc", "application/msword", doc),
      )
    ).mime,
    "application/msword",
  );
  await assert.rejects(
    () =>
      prepareProductFile(
        "DOCUMENT",
        file(
          "not-word.doc",
          "application/msword",
          Buffer.concat([
            Buffer.from("d0cf11e0a1b11ae1", "hex"),
            Buffer.from("Workbook", "utf16le"),
          ]),
        ),
      ),
    /PRODUCT_DOCUMENT_INVALID/,
  );
});
test("only product writers can upload/delete and users without product access cannot read media", async () => {
  const base = {
    store: {},
    path: "/api/product-media/p",
    method: "POST",
    body: {},
    tenant: "t",
    user: { id: "u" },
    send: () => assert.fail(),
  };
  for (const role of [
    "read_only",
    "quality",
    "nutrition_menus",
    "operations_orders",
    "commercial",
  ])
    await assert.rejects(
      () => handleProductMedia({ ...base, role }),
      (e) => e.status === 403,
    );
  await assert.rejects(
    () => handleProductMedia({ ...base, method: "GET", role: "commercial" }),
    (e) => e.status === 403,
  );
  assert.equal(
    await handleProductMedia({ ...base, path: "/api/other", role: "admin" }),
    false,
  );
});
