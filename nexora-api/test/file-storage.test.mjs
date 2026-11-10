import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFiles, downloadFile } from "../src/file-storage.mjs";
test("private storage writes binary bytes, scopes tenants, verifies integrity and hides keys in downloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "horekia-files-")),
    files = new LocalFiles(dir);
  try {
    const base64 = Buffer.from("Private document contents").toString("base64");
    const meta = await files.put("tenant-a", "documentFiles", {
      filename: "safe.txt",
      mime: "text/plain",
      base64,
    });
    assert(!("base64" in meta));
    assert.equal(
      (
        await readFile(files.path("tenant-a", "documentFiles", meta.storageKey))
      ).toString(),
      "Private document contents",
    );
    assert.equal(
      (await stat(files.path("tenant-a", "documentFiles", meta.storageKey)))
        .mode & 0o777,
      0o600,
    );
    assert.deepEqual(
      await files.put("tenant-a", "documentFiles", {
        filename: "safe.txt",
        mime: "text/plain",
        base64,
      }),
      meta,
    );
    const response = await downloadFile(
      { files },
      "tenant-a",
      "documentFiles",
      meta,
    );
    assert.equal(response.base64, base64);
    assert(!("storageKey" in response));
    await assert.rejects(
      () => files.read("tenant-b", "documentFiles", meta),
      /INVALID_REFERENCE/,
    );
    await assert.rejects(
      () => files.read("tenant-a", "orderAttachments", meta),
      /INVALID_REFERENCE/,
    );
    assert.throws(
      () => files.path("tenant-a", "documentFiles", "../../etc/passwd"),
      /INVALID_REFERENCE/,
    );
    await writeFile(
      files.path("tenant-a", "documentFiles", meta.storageKey),
      "tampered",
    );
    await assert.rejects(
      () => files.read("tenant-a", "documentFiles", meta),
      /CHECKSUM_MISMATCH/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("missing, symbolic-link and invalid files fail closed without writing database metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "horekia-files-")),
    files = new LocalFiles(dir);
  try {
    await assert.rejects(
      () => files.put("t", "documentFiles", { base64: "not base64!" }),
      /INVALID_CONTENT/,
    );
    await assert.rejects(
      () =>
        files.put("t", "documentFiles", {
          base64: Buffer.from("file").toString("base64"),
          checksum: "wrong",
        }),
      /CHECKSUM_MISMATCH/,
    );
    const meta = await files.put("t", "orderAttachments", {
      filename: "file.png",
      mime: "image/png",
      base64: Buffer.from("bytes").toString("base64"),
    });
    const path = files.path("t", "orderAttachments", meta.storageKey);
    await rm(path);
    await assert.rejects(
      () => files.read("t", "orderAttachments", meta),
      /READ_FAILED/,
    );
    const external = join(dir, "outside");
    await writeFile(external, "bytes");
    await symlink(external, path);
    await assert.rejects(
      () => files.read("t", "orderAttachments", meta),
      /READ_FAILED/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
