import sharp from "sharp";
import { downloadFile } from "./file-storage.mjs";
export const maxProductFileBytes = 1_000_000;
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { code, status });
};
export async function prepareProductFile(kind, file) {
  if (
    !["IMAGE", "DOCUMENT"].includes(kind) ||
    !file ||
    typeof file !== "object" ||
    Array.isArray(file) ||
    Object.keys(file).some(
      (k) => !["filename", "mime", "base64"].includes(k),
    ) ||
    typeof file.filename !== "string" ||
    !file.filename.trim() ||
    file.filename.length > 200 ||
    /[\/\\\u0000-\u001f]/.test(file.filename) ||
    typeof file.mime !== "string"
  )
    fail("PRODUCT_FILE_INVALID");
  const tooLarge =
    kind === "IMAGE" ? "PRODUCT_IMAGE_TOO_LARGE" : "PRODUCT_DOCUMENT_TOO_LARGE";
  if (typeof file.base64 !== "string") fail("PRODUCT_FILE_INVALID");
  if (file.base64.length > Math.ceil(maxProductFileBytes / 3) * 4)
    fail(tooLarge);
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.toString("base64") !== file.base64)
    fail("PRODUCT_FILE_INVALID");
  if (bytes.length > maxProductFileBytes) fail(tooLarge);
  const ext = file.filename.trim().split(".").at(-1)?.toLowerCase();
  if (kind === "IMAGE") {
    const types = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" };
    if (!types[ext]) fail("PRODUCT_IMAGE_TYPE");
    let image;
    try {
      const input = sharp(bytes, {
          limitInputPixels: 20_000_000,
          failOn: "warning",
        }),
        meta = await input.metadata();
      if (
        meta.format !== types[ext] ||
        ![
          "image/" + meta.format,
          meta.format === "jpeg" ? "image/jpg" : "image/" + meta.format,
          "",
        ].includes(file.mime) ||
        (meta.pages ?? 1) > 1
      )
        fail("PRODUCT_IMAGE_INVALID");
      image = await input.rotate().webp({ quality: 85 }).toBuffer();
    } catch {
      fail("PRODUCT_IMAGE_INVALID");
    }
    if (image.length > maxProductFileBytes)
      fail("PRODUCT_IMAGE_PROCESSED_TOO_LARGE");
    return {
      filename: file.filename.trim().replace(/\.[^.]+$/, ".webp"),
      mime: "image/webp",
      base64: image.toString("base64"),
    };
  }
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "doc"
        ? "application/msword"
        : null;
  if (!mime || ![mime, "", "application/octet-stream"].includes(file.mime))
    fail("PRODUCT_DOCUMENT_TYPE");
  if (ext === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    fail("PRODUCT_DOCUMENT_INVALID");
  if (
    ext === "doc" &&
    (bytes.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1" ||
      !bytes.includes(Buffer.from("WordDocument", "utf16le")))
  )
    fail("PRODUCT_DOCUMENT_INVALID");
  return { filename: file.filename.trim(), mime, base64: file.base64 };
}
export class ProductMedia {
  constructor(store) {
    this.store = store;
  }
  async product(t, id) {
    const p = await this.store.get(t, "products", id);
    if (!p) fail("Record not found", 404);
    return p;
  }
  public(row) {
    const { base64, storageKey, ...data } = row.data;
    return { ...row, data };
  }
  async list(t, id) {
    await this.product(t, id);
    return (await this.store.list(t, "productFiles"))
      .filter((f) => f.data.productId === id)
      .map((r) => this.public(r));
  }
  async upload(t, id, input, actor) {
    if (
      !input ||
      Object.keys(input).some((k) => !["kind", "file", "version"].includes(k))
    )
      fail("PRODUCT_FILE_INVALID");
    await this.product(t, id);
    const file = await prepareProductFile(input.kind, input.file);
    return this.store.transaction(async () => {
      await this.store.lock(t);
      await this.product(t, id);
      const image =
        input.kind === "IMAGE"
          ? (await this.store.list(t, "productFiles")).find(
              (r) => r.data.productId === id && r.data.kind === "IMAGE",
            )
          : null;
      if (
        input.kind === "IMAGE" &&
        (input.version ?? null) !== (image?.version ?? null)
      )
        fail("PRODUCT_IMAGE_CHANGED", 409);
      const data = { productId: id, kind: input.kind, ...file };
      const row = image
        ? await this.store.update(
            t,
            "productFiles",
            image.id,
            data,
            image.version,
            actor,
          )
        : await this.store.create(t, "productFiles", data, actor);
      return this.public(row);
    });
  }
  async get(t, id, fileId) {
    await this.product(t, id);
    const row = await this.store.get(t, "productFiles", fileId);
    if (!row || row.data.productId !== id) fail("Record not found", 404);
    return row;
  }
  async download(t, id, fileId, actor) {
    const row = await this.get(t, id, fileId);
    const file = await downloadFile(this.store, t, "productFiles", row.data);
    await this.store.log(
      t,
      actor,
      "DOWNLOAD_PRODUCT_FILE",
      "productFiles",
      fileId,
      null,
      { productId: id, checksum: row.data.checksum },
    );
    return file;
  }
  async remove(t, id, fileId, version, actor) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const row = await this.get(t, id, fileId);
      await this.store.remove(t, "productFiles", row.id, version, actor);
      return { ok: true };
    });
  }
}
