import { downloadFile } from "./file-storage.mjs";
import { createHash } from "node:crypto";
import { snapshotHash } from "./workflow-rules.mjs";
import { prepareAttachment } from "./order-attachments.mjs";
import { validDate } from "./order-rules.mjs";
import {
  businessDate,
  documentStatus,
  documentValidity,
} from "./document-rules.mjs";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const keys = (input, list) => {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !list.includes(k))
  )
    fail("Unknown document field");
};
const reference = (v) => typeof v === "string" && v.trim() && v.length <= 4000;
const sameVersion = (v, version) => {
  if (v.version !== version) fail("Record changed. Reload before saving.", 409);
};
export class DocumentsService {
  constructor(store) {
    this.store = store;
  }
  async required(t, r, id) {
    const row = await this.store.get(t, r, id);
    if (!row) fail("Record not found", 404);
    return row;
  }
  async write(t, fn) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      return fn();
    });
  }
  async catalog(t) {
    return {
      suppliers: await this.store.list(t, "suppliers"),
      products: await this.store.list(t, "products"),
      allergens: await this.store.list(t, "allergens"),
    };
  }
  async list(t) {
    const versions = await this.store.list(t, "documentVersions");
    return (await this.store.list(t, "supplierDocuments")).map((doc) => ({
      ...doc,
      status: documentStatus(doc, versions),
      expiryState: documentValidity(
        versions.find((v) => v.id === doc.data.currentVersionId) ??
          versions.find((v) => v.id === doc.data.latestVersionId),
      ),
      latest: versions.find((v) => v.id === doc.data.latestVersionId) ?? null,
      current: versions.find((v) => v.id === doc.data.currentVersionId) ?? null,
    }));
  }
  async view(t, id) {
    const document = await this.required(t, "supplierDocuments", id),
      versions = (await this.store.list(t, "documentVersions")).filter(
        (v) => v.data.documentId === id,
      );
    const files = (await this.store.list(t, "documentFiles"))
      .filter((f) => f.data.documentId === id)
      .map((f) => {
        const { base64, storageKey, ...data } = f.data;
        return { ...f, data };
      });
    return {
      document,
      status: documentStatus(document, versions),
      versions: versions.map((v) => ({
        ...v,
        validityState: documentValidity(v),
      })),
      files,
    };
  }
  async create(t, input, actor) {
    keys(input, ["title", "supplierId", "productIds", "kind"]);
    return this.write(t, async () => {
      const supplier = await this.required(t, "suppliers", input.supplierId);
      if (!supplier.data.active) fail("Select an active supplier");
      if (
        !Array.isArray(input.productIds) ||
        input.productIds.length > 500 ||
        new Set(input.productIds).size !== input.productIds.length
      )
        fail("Invalid document products");
      if (
        ["TECHNICAL_SHEET", "ALLERGEN_DECLARATION"].includes(input.kind) &&
        !input.productIds.length
      )
        fail("Technical documents need at least one product");
      for (const id of input.productIds) {
        const p = await this.required(t, "products", id);
        if (p.data.supplierId !== supplier.id)
          fail("Document products must belong to its supplier");
      }
      return this.store.create(
        t,
        "supplierDocuments",
        {
          ...input,
          latestVersionId: null,
          currentVersionId: null,
          reviewedLatestVersionId: null,
          archived: false,
          createdAt: new Date().toISOString(),
        },
        actor,
      );
    });
  }
  async declarations(t, input) {
    keys(input, [
      "ingredients",
      "contains",
      "traces",
      "allergensComplete",
      "nutrition",
      "nutritionBasis",
      "glutenFree",
      "pureedSuitable",
    ]);
    const d = { ...input };
    if (
      d.ingredients != null &&
      (typeof d.ingredients !== "string" || d.ingredients.length > 4000)
    )
      fail("Invalid declared composition");
    for (const key of ["contains", "traces"]) {
      if (d[key] === undefined) continue;
      if (
        !Array.isArray(d[key]) ||
        d[key].length > 100 ||
        new Set(d[key]).size !== d[key].length
      )
        fail("Invalid declared allergens");
      for (const id of d[key]) await this.required(t, "allergens", id);
    }
    if (d.contains?.some((a) => d.traces?.includes(a)))
      fail("An allergen cannot be both contains and traces");
    for (const key of ["allergensComplete", "glutenFree", "pureedSuitable"])
      if (d[key] !== undefined && typeof d[key] !== "boolean")
        fail("Invalid document declaration");
    if (d.allergensComplete && (!d.contains || !d.traces))
      fail("Complete allergen declarations require both lists");
    if (
      d.nutrition !== undefined &&
      !["PER_100_G", "PER_100_ML", "PER_UNIT"].includes(d.nutritionBasis)
    )
      fail("Document nutrition needs an explicit basis");
    if (d.nutrition !== undefined) {
      keys(d.nutrition, [
        "energyKcal",
        "proteinG",
        "carbohydrateG",
        "sugarsG",
        "fatG",
        "saturatedFatG",
        "fiberG",
        "saltG",
      ]);
      if (
        Object.values(d.nutrition).some(
          (n) =>
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            n < 0 ||
            n > 1000000,
        )
      )
        fail("Invalid document nutrients");
    }
    return d;
  }
  async upload(t, id, input, actor) {
    keys(input, [
      "version",
      "attachment",
      "effectiveFrom",
      "expiresAt",
      "sourceReference",
      "isMock",
      "declarations",
    ]);
    if (!reference(input.sourceReference) || typeof input.isMock !== "boolean")
      fail("Document source and classification are required");
    for (const key of ["effectiveFrom", "expiresAt"])
      if (input[key] && !validDate(input[key]))
        fail("Invalid document validity dates");
    if (
      input.effectiveFrom &&
      input.expiresAt &&
      input.effectiveFrom > input.expiresAt
    )
      fail("Invalid document validity dates");
    const file = await this.prepareFile(input.attachment);
    return this.write(t, async () => {
      const doc = await this.required(t, "supplierDocuments", id);
      sameVersion(doc, input.version);
      if (doc.data.archived)
        fail("Archived documents cannot receive versions", 409);
      if (doc.data.kind === "CERTIFICATE" && !input.expiresAt)
        fail("Certificates require an expiry date");
      const declarations = await this.declarations(t, input.declarations ?? {}),
        versions = (await this.store.list(t, "documentVersions")).filter(
          (v) => v.data.documentId === id,
        ),
        latest = versions.find((v) => v.id === doc.data.latestVersionId),
        previousFile = latest
          ? await this.required(t, "documentFiles", latest.data.fileId)
          : null;
      const normalized = {
        effectiveFrom: input.effectiveFrom || null,
        expiresAt: input.expiresAt || null,
        declarations,
      };
      if (
        latest &&
        previousFile.data.checksum === file.checksum &&
        snapshotHash(normalized) ===
          snapshotHash({
            effectiveFrom: latest.data.effectiveFrom,
            expiresAt: latest.data.expiresAt,
            declarations: latest.data.declarations,
          })
      )
        fail("This document version is already uploaded", 409);
      const changes = [];
      if (!latest) changes.push("INITIAL");
      else {
        if (previousFile.data.checksum !== file.checksum) changes.push("FILE");
        if (
          latest.data.effectiveFrom !== normalized.effectiveFrom ||
          latest.data.expiresAt !== normalized.expiresAt
        )
          changes.push("VALIDITY");
        for (const [label, fields] of [
          ["COMPOSITION", ["ingredients"]],
          ["ALLERGENS", ["contains", "traces", "allergensComplete"]],
          ["NUTRITION", ["nutrition", "nutritionBasis"]],
          ["CLAIMS", ["glutenFree", "pureedSuitable"]],
        ])
          if (
            snapshotHash(
              Object.fromEntries(
                fields.map((k) => [k, latest.data.declarations[k]]),
              ),
            ) !==
            snapshotHash(
              Object.fromEntries(fields.map((k) => [k, declarations[k]])),
            )
          )
            changes.push(label);
      }
      const stored = await this.store.create(
        t,
        "documentFiles",
        {
          documentId: id,
          ...file.attachment,
          checksum: file.checksum,
          size: file.size,
        },
        actor,
      );
      const supplier = await this.required(t, "suppliers", doc.data.supplierId),
        isMock = input.isMock || supplier.data.name.startsWith("Demo ");
      const number = Math.max(0, ...versions.map((v) => v.data.number)) + 1,
        changeHash = snapshotHash({
          documentId: id,
          number,
          fileHash: file.checksum,
          ...normalized,
          changes,
        });
      const version = await this.store.create(
        t,
        "documentVersions",
        {
          documentId: id,
          fileId: stored.id,
          number,
          state: "PENDING_REVIEW",
          ...normalized,
          sourceReference: input.sourceReference.trim(),
          isMock,
          extractedText: file.text || null,
          changes,
          changeHash,
          review: {},
          createdAt: new Date().toISOString(),
        },
        actor,
      );
      await this.store.update(
        t,
        "supplierDocuments",
        id,
        { ...doc.data, latestVersionId: version.id },
        doc.version,
        actor,
      );
      return version;
    });
  }
  async prepareFile(input) {
    if (
      typeof input?.filename === "string" &&
      /[\u0000-\u001f]/.test(input.filename)
    )
      fail("Invalid document attachment");
    if (input?.mime === "text/plain") {
      keys(input, ["filename", "mime", "base64"]);
      if (
        typeof input.filename !== "string" ||
        !input.filename.trim() ||
        input.filename.length > 200 ||
        /[\/\\\r\n]/.test(input.filename) ||
        typeof input.base64 !== "string" ||
        input.base64.length > 2000000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
      )
        fail("Invalid document attachment");
      const bytes = Buffer.from(input.base64, "base64");
      if (!bytes.length || bytes.length > 1500000)
        fail("Attachment maximum size is 1.5 MB");
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        fail("Text documents must be UTF-8");
      }
      if (text.includes("\0") || text.length > 20000)
        fail("Text document exceeds 20000 characters");
      return {
        attachment: {
          filename: input.filename.trim(),
          mime: "text/plain",
          base64: bytes.toString("base64"),
        },
        text,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
      };
    }
    if (input?.filename && /[\/\\\r\n]/.test(input.filename))
      fail("Invalid document attachment");
    const parsed = await prepareAttachment(input);
    if (!parsed.attachment) fail("A document file is required");
    const bytes = Buffer.from(parsed.attachment.base64, "base64");
    return {
      ...parsed,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    };
  }
  async review(t, docId, versionId, input, role, actor) {
    keys(input, [
      "version",
      "documentVersion",
      "decision",
      "evidence",
      "changeHash",
      "confirmed",
    ]);
    if (role !== "quality" || !actor)
      fail("Only Quality can review supplier documents", 403);
    if (
      !reference(input.evidence) ||
      input.confirmed !== true ||
      !["APPROVE", "REJECT", "WITHDRAW"].includes(input.decision)
    )
      fail("Confirm the document changes and provide review evidence");
    return this.write(t, async () => {
      const doc = await this.required(t, "supplierDocuments", docId),
        v = await this.required(t, "documentVersions", versionId);
      sameVersion(doc, input.documentVersion);
      sameVersion(v, input.version);
      if (v.data.documentId !== docId)
        fail("Document version does not belong to this document");
      if (doc.data.archived) fail("Archived documents cannot be reviewed");
      if (input.changeHash !== v.data.changeHash)
        fail("Document changes have changed. Reload before reviewing.", 409);
      let current = doc.data.currentVersionId,
        reviewed = doc.data.reviewedLatestVersionId;
      if (input.decision === "WITHDRAW") {
        if (v.data.state !== "APPROVED")
          fail("Only approved document versions can be withdrawn");
        if (current === v.id) current = null;
      } else {
        if (
          doc.data.latestVersionId !== v.id ||
          v.data.state !== "PENDING_REVIEW"
        )
          fail("Only the pending latest version can be reviewed");
        if (input.decision === "APPROVE") {
          if (v.data.expiresAt && v.data.expiresAt < businessDate())
            fail("Expired document versions cannot be approved");
          for (const pid of doc.data.productIds) {
            const p = await this.required(t, "products", pid);
            if (p.data.supplierId !== doc.data.supplierId)
              fail("Document products must belong to its supplier");
          }
          current = v.id;
        }
        reviewed = v.id;
      }
      const updated = await this.store.update(
        t,
        "documentVersions",
        v.id,
        {
          ...v.data,
          state: {
            APPROVE: "APPROVED",
            REJECT: "REJECTED",
            WITHDRAW: "WITHDRAWN",
          }[input.decision],
          review: {
            ...(v.data.review ?? {}),
            [input.decision]: {
              actorId: actor,
              at: new Date().toISOString(),
              evidence: input.evidence.trim(),
              changeHash: v.data.changeHash,
            },
          },
        },
        v.version,
        actor,
      );
      await this.store.update(
        t,
        "supplierDocuments",
        docId,
        {
          ...doc.data,
          currentVersionId: current,
          reviewedLatestVersionId: reviewed,
        },
        doc.version,
        actor,
      );
      return updated;
    });
  }
  async archive(t, id, input, role, actor) {
    keys(input, ["version", "reason"]);
    if (!reference(input.reason)) fail("An archive reason is required");
    return this.write(t, async () => {
      const d = await this.required(t, "supplierDocuments", id);
      sameVersion(d, input.version);
      if (d.data.archived) fail("Document is already archived");
      if (d.data.currentVersionId && role !== "quality")
        fail("Only Quality can archive approved documentation", 403);
      await this.store.log(
        t,
        actor,
        "ARCHIVE_DOCUMENT",
        "supplierDocuments",
        id,
        null,
        { reason: input.reason },
      );
      return this.store.update(
        t,
        "supplierDocuments",
        id,
        { ...d.data, archived: true },
        d.version,
        actor,
      );
    });
  }
  async download(t, docId, versionId, actor) {
    const d = await this.required(t, "supplierDocuments", docId),
      v = await this.required(t, "documentVersions", versionId);
    if (v.data.documentId !== d.id)
      fail("Document version does not belong to this document");
    const file = await this.required(t, "documentFiles", v.data.fileId);
    const content = await downloadFile(
      this.store,
      t,
      "documentFiles",
      file.data,
    );
    await this.store.log(
      t,
      actor,
      "DOWNLOAD_DOCUMENT",
      "supplierDocuments",
      docId,
      null,
      { versionId, checksum: file.data.checksum },
    );
    return content;
  }
}
