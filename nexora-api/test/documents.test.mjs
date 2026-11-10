import { test } from "node:test";
import assert from "node:assert/strict";
import { MenuStore } from "./helpers/menu-store.mjs";
import { DocumentsService } from "../src/documents.mjs";
import { documentStatus, usableDocument } from "../src/document-rules.mjs";
import { MenusService } from "../src/menus.mjs";
async function fixture() {
  const s = new MenuStore(),
    svc = new DocumentsService(s),
    t = "t",
    add = (r, d) => s.create(t, r, d, null),
    supplier = await add("suppliers", { name: "Demo Supplier", active: true }),
    cat = await add("mainCategories", { name: "Food", active: true }),
    family = await add("families", {
      name: "Test",
      temperature: "AMBIENT",
      mainCategoryId: cat.id,
    }),
    product = await add("products", {
      sku: "P1",
      name: "Test Product",
      supplierId: supplier.id,
      familyId: family.id,
      unit: "KG",
      temperature: "AMBIENT",
      active: true,
      allergenStatus: "UNVERIFIED",
      ingredients: "Test composition",
    }),
    doc = await svc.create(
      t,
      {
        title: "Test technical sheet",
        supplierId: supplier.id,
        kind: "TECHNICAL_SHEET",
        productIds: [product.id],
      },
      "actor",
    );
  return { s, svc, t, supplier, product, doc };
}
const payload = (version, extra = {}) => ({
  version,
  attachment: {
    filename: "sample.txt",
    mime: "text/plain",
    base64: Buffer.from("MOCK DOCUMENT — not supplier data").toString("base64"),
  },
  effectiveFrom: "2020-01-01",
  expiresAt: "2035-01-01",
  sourceReference: "TEST DOCUMENT",
  isMock: true,
  declarations: {
    ingredients: "Test composition",
    contains: [],
    traces: [],
    allergensComplete: true,
  },
  ...extra,
});
async function uploaded(f, extra = {}) {
  return f.svc.upload("t", f.doc.id, payload(f.doc.version, extra), "actor");
}
async function approve(f, v, decision = "APPROVE") {
  const d = await f.s.get("t", "supplierDocuments", f.doc.id);
  return f.svc.review(
    "t",
    d.id,
    v.id,
    {
      version: v.version,
      documentVersion: d.version,
      decision,
      evidence: "TEST Quality review",
      changeHash: v.data.changeHash,
      confirmed: true,
    },
    "quality",
    "actor",
  );
}
test("uploads preserve immutable originals and metadata responses never expose file content", async () => {
  const f = await fixture(),
    v = await uploaded(f),
    view = await f.svc.view("t", f.doc.id);
  assert.equal(v.data.state, "PENDING_REVIEW");
  assert.equal(view.status, "PENDING_REVIEW");
  assert(!("base64" in view.files[0].data));
  assert.equal((await f.svc.list("t"))[0].data.title, "Test technical sheet");
  const original = await f.svc.download("t", f.doc.id, v.id, "actor");
  assert.equal(
    Buffer.from(original.base64, "base64").toString(),
    "MOCK DOCUMENT — not supplier data",
  );
  const d = await f.s.get("t", "supplierDocuments", f.doc.id);
  await assert.rejects(
    () => f.svc.upload("t", d.id, payload(d.version), "actor"),
    /already uploaded/,
  );
  assert.equal((await f.s.list("t", "documentFiles")).length, 1);
});
test("only Quality can approve, with current versions, change hash and explicit review evidence", async () => {
  const f = await fixture(),
    v = await uploaded(f),
    d = await f.s.get("t", "supplierDocuments", f.doc.id),
    input = {
      version: v.version,
      documentVersion: d.version,
      decision: "APPROVE",
      evidence: "TEST",
      changeHash: v.data.changeHash,
      confirmed: true,
    };
  await assert.rejects(
    () => f.svc.review("t", d.id, v.id, input, "admin", "actor"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      f.svc.review(
        "t",
        d.id,
        v.id,
        { ...input, confirmed: false },
        "quality",
        "actor",
      ),
    /Confirm/,
  );
  await assert.rejects(
    () =>
      f.svc.review(
        "t",
        d.id,
        v.id,
        { ...input, changeHash: "stale" },
        "quality",
        "actor",
      ),
    (e) => e.status === 409,
  );
  await approve(f, v);
  assert.equal((await f.svc.view("t", d.id)).status, "VALID");
  assert.equal(
    (await f.s.get("t", "products", f.product.id)).data.ingredients,
    "Test composition",
  );
  assert.equal((await f.s.list("t", "productAllergens")).length, 0);
});
test("new pending version suspends technical use, detects allergen changes and leaves original available", async () => {
  const f = await fixture(),
    one = await uploaded(f);
  await approve(f, one);
  let d = await f.s.get("t", "supplierDocuments", f.doc.id),
    versions = await f.s.list("t", "documentVersions");
  assert(usableDocument(d, versions[0], versions, f.product.id));
  const allergen = await f.s.create(
    "t",
    "allergens",
    { name: "Test allergen", code: "TEST" },
    null,
  );
  const two = await f.svc.upload(
    "t",
    d.id,
    payload(d.version, {
      attachment: {
        filename: "v2.txt",
        mime: "text/plain",
        base64: Buffer.from("MOCK second file").toString("base64"),
      },
      declarations: {
        ingredients: "Different composition",
        contains: [allergen.id],
        traces: [],
        allergensComplete: true,
      },
    }),
    "actor",
  );
  assert(two.data.changes.includes("FILE"));
  assert(two.data.changes.includes("ALLERGENS"));
  assert(two.data.changes.includes("COMPOSITION"));
  d = await f.s.get("t", "supplierDocuments", d.id);
  versions = await f.s.list("t", "documentVersions");
  assert(
    !usableDocument(
      d,
      versions.find((v) => v.id === one.id),
      versions,
      f.product.id,
    ),
  );
  await approve(f, two, "REJECT");
  d = await f.s.get("t", "supplierDocuments", d.id);
  versions = await f.s.list("t", "documentVersions");
  assert(
    usableDocument(
      d,
      versions.find((v) => v.id === one.id),
      versions,
      f.product.id,
    ),
  );
  assert.equal(
    Buffer.from(
      (await f.svc.download("t", d.id, one.id, "actor")).base64,
      "base64",
    ).toString(),
    "MOCK DOCUMENT — not supplier data",
  );
});
test("expiry, upcoming validity, withdrawal and archive prevent document use", async () => {
  const f = await fixture(),
    v = await uploaded(f);
  let approved = await approve(f, v),
    d = await f.s.get("t", "supplierDocuments", f.doc.id);
  assert.equal(documentStatus(d, [approved], "2034-12-20"), "EXPIRING");
  assert.equal(documentStatus(d, [approved], "2035-01-02"), "EXPIRED");
  assert.equal(documentStatus(d, [approved], "2019-12-31"), "NOT_EFFECTIVE");
  await assert.rejects(
    () =>
      f.svc.archive(
        "t",
        d.id,
        { version: d.version, reason: "Test" },
        "admin",
        "actor",
      ),
    (e) => e.status === 403,
  );
  approved = await approve(f, approved, "WITHDRAW");
  d = await f.s.get("t", "supplierDocuments", d.id);
  assert.equal(documentStatus(d, [approved]), "WITHDRAWN");
  await f.svc.archive(
    "t",
    d.id,
    { version: d.version, reason: "Test archive" },
    "quality",
    "actor",
  );
  assert.equal((await f.svc.view("t", d.id)).status, "ARCHIVED");
});
test("mismatched supplier products, tenant references, invalid files and expired approvals are rejected", async () => {
  const f = await fixture(),
    other = await f.s.create(
      "t",
      "suppliers",
      { name: "Other", active: true },
      null,
    );
  await assert.rejects(
    () =>
      f.svc.create(
        "t",
        {
          title: "Wrong supplier",
          supplierId: other.id,
          kind: "TECHNICAL_SHEET",
          productIds: [f.product.id],
        },
        "actor",
      ),
    /belong/,
  );
  await assert.rejects(
    () => f.svc.view("other", f.doc.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () =>
      uploaded(f, {
        attachment: {
          filename: "x.html",
          mime: "text/html",
          base64: Buffer.from("<script>x</script>").toString("base64"),
        },
      }),
    /supported/,
  );
  await assert.rejects(
    () =>
      uploaded(f, {
        attachment: {
          filename: "../x.txt",
          mime: "text/plain",
          base64: "eA==",
        },
      }),
    /Invalid document/,
  );
  const v = await uploaded(f, { expiresAt: "2021-01-01" });
  await assert.rejects(() => approve(f, v), /Expired/);
});
test("technical reviews bind an approved document and re-evaluation catches a new pending version", async () => {
  const f = await fixture(),
    v = await uploaded(f);
  await approve(f, v);
  const menus = new MenusService(f.s),
    p = await f.s.get("t", "products", f.product.id);
  const review = await menus.reviewTechnical(
    "t",
    {
      productId: p.id,
      productVersion: p.version,
      ingredients: "Test composition",
      source: "TEST DOCUMENT",
      isMock: true,
      documentVersionId: v.id,
    },
    "quality",
    "actor",
  );
  assert.equal(review.data.documentEvidence.versionId, v.id);
  const d = await f.s.get("t", "supplierDocuments", f.doc.id);
  await f.svc.upload(
    "t",
    d.id,
    payload(d.version, { declarations: { ingredients: "Changed" } }),
    "actor",
  );
  const current = await f.s.get("t", "products", p.id);
  await assert.rejects(
    () =>
      menus.reviewTechnical(
        "t",
        {
          productId: p.id,
          productVersion: current.version,
          ingredients: "Test",
          source: "Test",
          isMock: true,
          documentVersionId: v.id,
        },
        "quality",
        "actor",
      ),
    /current approved document/,
  );
});
test("HTTP document endpoints require authentication and company access; generic master CRUD cannot bypass review", async () => {
  const { createServer } = await import("../src/server.mjs"),
    { hashToken } = await import("../src/store.mjs"),
    f = await fixture();
  let role = "read_only";
  const token = "document-test";
  f.s.db = {
    prepare: () => ({
      get: async (hash) =>
        hash === hashToken(token) ? { user_id: "actor" } : null,
    }),
  };
  f.s.user = async () => ({
    id: "actor",
    name: "Test",
    companies: [{ id: "t", name: "Test", role }],
  });
  f.s.ready = async () => true;
  const server = createServer(f.s);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const api = async (
    path,
    method = "GET",
    body,
    tenant = "t",
    authenticated = true,
  ) => {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api" + path,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:5180",
          "Content-Type": "application/json",
          "X-Company-Id": tenant,
          ...(authenticated ? { Cookie: "nexora_session=" + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal(
      (await api("/supplier-documents", "GET", null, "t", false)).status,
      401,
    );
    assert.equal(
      (await api("/supplier-documents", "GET", null, "other")).status,
      403,
    );
    assert.equal((await api("/supplier-documents")).status, 200);
    assert.equal((await api("/supplier-documents", "POST", {})).status, 403);
    assert.equal((await api("/masters/supplierDocuments")).status, 404);
    role = "admin";
    const v = await uploaded(f),
      d = await f.s.get("t", "supplierDocuments", f.doc.id);
    assert.equal(
      (
        await api(
          "/supplier-documents/" + d.id + "/versions/" + v.id + "/review",
          "POST",
          {
            version: v.version,
            documentVersion: d.version,
            decision: "APPROVE",
            changeHash: v.data.changeHash,
            confirmed: true,
            evidence: "forged",
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          "/supplier-documents/" + d.id + "/versions/" + v.id + "/download",
        )
      ).status,
      200,
    );
    role = "quality";
    assert.equal((await api("/schema")).data.documentPermissions.quality, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("linked technical evidence cannot contradict declared composition or allergens, and mock provenance persists", async () => {
  const f = await fixture(),
    v = await uploaded(f);
  await approve(f, v);
  const menus = new MenusService(f.s),
    p = await f.s.get("t", "products", f.product.id);
  await assert.rejects(
    () =>
      menus.reviewTechnical(
        "t",
        {
          productId: p.id,
          productVersion: p.version,
          ingredients: "Contradictory text",
          source: "Test",
          isMock: false,
          documentVersionId: v.id,
        },
        "quality",
        "actor",
      ),
    /composition must match/,
  );
  const review = await menus.reviewTechnical(
    "t",
    {
      productId: p.id,
      productVersion: p.version,
      ingredients: "Test composition",
      source: "Test",
      isMock: false,
      documentVersionId: v.id,
    },
    "quality",
    "actor",
  );
  assert(review.data.isMock);
  const allergen = await f.s.create(
      "t",
      "allergens",
      { name: "Declared allergen", code: "DECLARED" },
      null,
    ),
    doc = await f.s.get("t", "supplierDocuments", f.doc.id);
  const next = await f.svc.upload(
    "t",
    doc.id,
    payload(doc.version, {
      declarations: {
        ingredients: "Test composition",
        contains: [allergen.id],
        traces: [],
        allergensComplete: true,
      },
    }),
    "actor",
  );
  await approve(f, next);
  const current = await f.s.get("t", "products", p.id);
  await assert.rejects(
    () =>
      menus.reviewTechnical(
        "t",
        {
          productId: p.id,
          productVersion: current.version,
          ingredients: "Test composition",
          source: "Test",
          isMock: true,
          documentVersionId: next.id,
        },
        "quality",
        "actor",
      ),
    /associations differ/,
  );
  assert.equal((await f.s.list("t", "productAllergens")).length, 0);
});
