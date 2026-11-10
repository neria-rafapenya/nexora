import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { DocumentsService } from "./documents.mjs";
import { businessDate } from "./document-rules.mjs";
export async function seedDocuments(store, t = "workspace") {
  const service = new DocumentsService(store);
  return service.write(t, async () => {
    const catalog = await service.catalog(t),
      existing = await store.list(t, "supplierDocuments"),
      suppliers = catalog.suppliers.filter(
        (s) => s.data.name.startsWith("Demo ") && s.data.active,
      );
    if (suppliers.length < 3) throw new Error("Load demo suppliers first");
    let documents = 0,
      versions = 0;
    const relative = (n) =>
      new Date(Date.parse(businessDate()) + n * 86400000)
        .toISOString()
        .slice(0, 10);
    const examples = [
      {
        title: "Demo Product Technical Sheet",
        kind: "TECHNICAL_SHEET",
        supplier: suppliers[0],
        expiry: relative(365),
        count: 2,
      },
      {
        title: "Demo Supplier Certificate Expired",
        kind: "CERTIFICATE",
        supplier: suppliers[1],
        expiry: relative(-5),
        count: 1,
      },
      {
        title: "Demo Supplier Certificate Expiring",
        kind: "CERTIFICATE",
        supplier: suppliers[2],
        expiry: relative(15),
        count: 1,
      },
    ];
    for (const e of examples) {
      if (
        existing.some(
          (d) =>
            d.data.title === e.title && d.data.supplierId === e.supplier.id,
        )
      )
        continue;
      const product = catalog.products.find(
        (p) =>
          p.data.supplierId === e.supplier.id &&
          p.data.brand === "Nexora Sample",
      );
      if (e.kind === "TECHNICAL_SHEET" && !product)
        throw new Error("Demo product supplier mapping missing");
      let doc = await service.create(
        t,
        {
          title: e.title,
          supplierId: e.supplier.id,
          kind: e.kind,
          productIds: e.kind === "TECHNICAL_SHEET" ? [product.id] : [],
        },
        null,
      );
      documents++;
      for (let n = 1; n <= e.count; n++) {
        const text = `MOCK DOCUMENT — NOT A SUPPLIER DECLARATION\n${e.title}\nVersion ${n}\nFictional content for workflow demonstration only. Not valid for purchasing, food safety or certification.\n${n === 2 ? "Changed synthetic composition and allergen information." : ""}`;
        await service.upload(
          t,
          doc.id,
          {
            version: doc.version,
            attachment: {
              filename: "demo-document-v" + n + ".txt",
              mime: "text/plain",
              base64: Buffer.from(text).toString("base64"),
            },
            effectiveFrom: relative(-30),
            expiresAt: e.expiry,
            sourceReference:
              "MOCK DATA — fabricated document; Quality review pending",
            isMock: true,
            declarations:
              e.kind === "TECHNICAL_SHEET"
                ? {
                    ingredients:
                      n === 1
                        ? "Fictional first composition"
                        : "Fictional revised composition",
                    contains: n === 2 ? [catalog.allergens[0].id] : [],
                    traces: [],
                    allergensComplete: false,
                  }
                : {},
          },
          null,
        );
        versions++;
        doc = await store.get(t, "supplierDocuments", doc.id);
      }
    }
    return { documents, versions, approved: 0 };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const s = new Store(process.env.DATABASE_URL);
  try {
    await s.migrate();
    console.log(
      JSON.stringify(
        await seedDocuments(s, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await s.close();
  }
}
