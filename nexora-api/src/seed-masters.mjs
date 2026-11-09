import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { seedAllergens, allergenReference } from "./seed-allergens.mjs";
export const supplierNames = [
  "Demo Harvest Grain Supply",
  "Demo Artisan Pasta Supply",
  "Demo Garden Canning Supply",
  "Demo Pantry Oils and Spices",
  "Demo Meadow Dairy Supply",
  "Demo Fresh Protein Supply",
  "Demo Frost Garden Supply",
  "Demo Ocean Seafood Supply",
  "Demo Sunrise Bakery Supply",
  "Demo Clear Spring Beverages",
];
export const clientDefinitions = [
  ["Northfield School", "SCHOOL"],
  ["Silverwood Care", "CARE_HOME"],
  ["Riverside Hospital", "HOSPITAL"],
  ["Pinecrest Hotel", "HOTEL"],
  ["Maple Table Restaurant", "RESTAURANT"],
  ["Greenway Workplace Catering", "WORKPLACE"],
  ["Meadow Event Catering", "CATERING"],
  ["Community Food Services", "OTHER"],
];
export const dietDefinitions = [
  ["STANDARD", "Standard diet", []],
  ["GLUTEN_FREE", "Gluten-free diet", ["EU01"]],
  ["DAIRY_FREE", "Dairy-free diet", ["EU07"]],
  ["NUT_FREE", "Peanut and tree-nut exclusion diet", ["EU05", "EU08"]],
  ["VEGETARIAN", "Vegetarian diet", []],
  ["PUREED", "Pureed diet", []],
];
export async function seedMasters(
  store,
  tenantId = "workspace",
  onProgress = () => {},
) {
  // Reuse reference data without approving or overwriting existing allergen links.
  return store.transaction(async () => {
    await store.lock(tenantId);
    const allergenResult = await seedAllergens(store, tenantId);
    const counters = {
      suppliers: 0,
      clients: 0,
      centers: 0,
      diets: 0,
      centerDiners: 0,
      linkedProducts: 0,
    };
    const cache = {};
    for (const r of [
      "suppliers",
      "clients",
      "centers",
      "diets",
      "centerDiners",
      "allergens",
      "products",
    ])
      cache[r] = await store.list(tenantId, r);
    async function ensure(resource, predicate, data) {
      let row = cache[resource].find(predicate);
      if (!row) {
        row = await store.create(tenantId, resource, data, null);
        cache[resource].push(row);
        counters[resource]++;
      }
      return row;
    }
    const suppliers = [];
    for (const [i, name] of supplierNames.entries())
      suppliers.push(
        await ensure("suppliers", (r) => r.data.name === name, {
          name,
          taxId: `DEMO-SUP-${String(i + 1).padStart(3, "0")}`,
          qualityEmail: `quality.supplier${i + 1}@nexora-demo.test`,
          phone: null,
          approvedUntil: null,
          active: true,
        }),
      );
    onProgress("Suppliers prepared");
    for (const p of cache.products) {
      const match = p.data.sku?.match(/^NX-(\d{2})-\d{3}$/);
      const index = match ? Number(match[1]) - 1 : -1;
      if (
        p.data.brand !== "Nexora Sample" ||
        index < 0 ||
        index >= suppliers.length ||
        p.data.supplierId
      )
        continue;
      await store.update(
        tenantId,
        "products",
        p.id,
        { ...p.data, supplierId: suppliers[index].id },
        p.version,
        null,
      );
      counters.linkedProducts++;
      if (counters.linkedProducts % 25 === 0)
        onProgress(`Product links prepared: ${counters.linkedProducts}`);
    }
    onProgress("Product supplier links prepared");
    const diets = [];
    for (const [code, name, excluded] of dietDefinitions) {
      const ids = excluded.map((c) => {
        const official = allergenReference.find((a) => a[0] === c);
        const allergen = cache.allergens.find(
          (a) => a.data.code === c || a.data.name === official?.[1],
        );
        if (!allergen) throw new Error(`Missing allergen ${c}`);
        return allergen.id;
      });
      diets.push(
        await ensure("diets", (r) => r.data.code === `DEMO_${code}`, {
          code: `DEMO_${code}`,
          name: `Demo ${name}`,
          excludedAllergens: ids,
          rules: {
            demo: true,
            requiresQualityReview: true,
            ...(code === "VEGETARIAN"
              ? { excludeMeat: true, excludeFish: true }
              : {}),
            ...(code === "PUREED" ? { texture: "PUREED" } : {}),
          },
        }),
      );
    }
    onProgress("Diets prepared");
    for (const [i, [name, segment]] of clientDefinitions.entries()) {
      const erpCode = `DEMO-CLI-${String(i + 1).padStart(3, "0")}`;
      const client = await ensure(
        "clients",
        (r) => r.data.erpCode === erpCode,
        {
          name: `Demo ${name}`,
          erpCode,
          taxId: `DEMO-CLIENT-${String(i + 1).padStart(3, "0")}`,
          segment,
          orderEmail: `orders.client${i + 1}@nexora-demo.test`,
          whatsapp: null,
          active: true,
        },
      );
      for (let branch = 1; branch <= 2; branch++) {
        const centerName = `Demo ${name} - Site ${branch}`;
        const center = await ensure(
          "centers",
          (r) => r.data.clientId === client.id && r.data.name === centerName,
          {
            name: centerName,
            clientId: client.id,
            address: `Demo Campus ${i + 1}${branch}, Example District`,
            deliveryWindow: branch === 1 ? "07:00-09:00" : "09:00-11:00",
            deliveryDays:
              segment === "SCHOOL" || segment === "WORKPLACE"
                ? ["MON", "WED", "FRI"]
                : ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
            route: `DEMO-ROUTE-${String((i % 4) + 1).padStart(2, "0")}`,
            closedDates: [],
          },
        );
        for (const service of ["LUNCH", "DINNER"])
          for (const [di, diet] of diets.entries()) {
            const base = 80 + i * 10 + branch * 5;
            const special = [0, 3, 4, 2, 8, 6];
            const count =
              di === 0
                ? base - special.slice(1).reduce((a, b) => a + b, 0)
                : special[di];
            await ensure(
              "centerDiners",
              (r) =>
                r.data.centerId === center.id &&
                r.data.dietId === diet.id &&
                r.data.service === service,
              { centerId: center.id, dietId: diet.id, service, count },
            );
          }
      }
    }
    onProgress("Clients, centers and diner counts prepared");
    return { ...counters, allergens: allergenResult };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = new Store(process.env.DATABASE_URL);
  try {
    console.log(
      JSON.stringify(
        await seedMasters(
          store,
          process.env.SEED_TENANT_ID ?? "workspace",
          (message) => console.log(message),
        ),
      ),
    );
  } finally {
    await store.close();
  }
}
