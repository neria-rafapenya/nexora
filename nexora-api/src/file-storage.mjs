import { mkdir, writeFile, readFile, lstat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const fileResources = [
  "documentFiles",
  "orderAttachments",
  "productFiles",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code, status = 500) => {
  throw Object.assign(new Error(code), { code, status });
};
export class LocalFiles {
  constructor(
    root = process.env.UPLOADS_DIR ??
      fileURLToPath(new URL("../var/uploads", import.meta.url)),
  ) {
    this.root = resolve(root);
  }
  scope(t, r) {
    if (
      ![...fileResources, "userAvatars"].includes(r) ||
      typeof t !== "string" ||
      !t
    )
      fail("FILE_STORAGE_INVALID_REFERENCE");
    return hash(t) + "/" + r + "/";
  }
  path(t, r, key) {
    const prefix = this.scope(t, r);
    if (
      typeof key !== "string" ||
      !key.startsWith(prefix) ||
      !new RegExp("^" + prefix + "[a-f0-9]{64}\\.blob$").test(key)
    )
      fail("FILE_STORAGE_INVALID_REFERENCE");
    return resolve(this.root, key);
  }
  async put(t, r, data) {
    if (
      typeof data.base64 !== "string" ||
      !data.base64.length ||
      data.base64.length > 2200000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)
    )
      fail("FILE_STORAGE_INVALID_CONTENT", 400);
    const bytes = Buffer.from(data.base64, "base64");
    if (
      !bytes.length ||
      bytes.length > 1500000 ||
      bytes.toString("base64") !== data.base64
    )
      fail("FILE_STORAGE_INVALID_CONTENT", 400);
    const checksum = hash(bytes);
    if (
      (data.checksum && data.checksum !== checksum) ||
      (data.size && data.size !== bytes.length)
    )
      fail("FILE_STORAGE_CHECKSUM_MISMATCH");
    const storageKey = this.scope(t, r) + checksum + ".blob",
      path = this.path(t, r, storageKey);
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if (e.code !== "EEXIST") fail("FILE_STORAGE_WRITE_FAILED", 503);
    }
    const { base64, ...meta } = data;
    const result = { ...meta, storageKey, checksum, size: bytes.length };
    // Verify existing content-addressed files too; never overwrite a corrupted object.
    await this.read(t, r, result);
    return result;
  }
  async read(t, r, data) {
    const path = this.path(t, r, data.storageKey);
    let bytes;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1500000)
        fail("FILE_STORAGE_READ_FAILED", 503);
      bytes = await readFile(path);
    } catch {
      fail("FILE_STORAGE_READ_FAILED", 503);
    }
    if (hash(bytes) !== data.checksum || bytes.length !== data.size)
      fail("FILE_STORAGE_CHECKSUM_MISMATCH", 503);
    return bytes;
  }
}
export async function downloadFile(store, t, r, data) {
  const { storageKey, base64, ...meta } = data;
  if (storageKey) {
    const bytes = await store.files.read(t, r, data);
    return { ...meta, base64: bytes.toString("base64") };
  }
  // Compatibility for in-memory unit stores and pre-migration records only.
  if (typeof base64 === "string") return { ...meta, base64 };
  fail("FILE_STORAGE_READ_FAILED", 503);
}
