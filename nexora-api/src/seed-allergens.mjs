import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
// EU 1169/2011 Annex II categories. These are reference entries, not product claims.
// https://food.ec.europa.eu/food-safety/campaign-2026/allergies_en
export const allergenReference = [
  ["EU01", "Cereals containing gluten"],
  ["EU02", "Crustaceans"],
  ["EU03", "Eggs"],
  ["EU04", "Fish"],
  ["EU05", "Peanuts"],
  ["EU06", "Soybeans"],
  ["EU07", "Milk"],
  ["EU08", "Tree nuts"],
  ["EU09", "Celery"],
  ["EU10", "Mustard"],
  ["EU11", "Sesame seeds"],
  ["EU12", "Sulphur dioxide and sulphites"],
  ["EU13", "Lupin"],
  ["EU14", "Molluscs"],
];
// Explicit synthetic examples for the fictional Nexora catalog only.
// These declarations are NOT inferred from live products or supplier documents.
export const mockContains = {
  EU01: [
    "Couscous",
    "Bulgur Wheat",
    "Pearl Barley",
    "Rolled Oats",
    "Spelt Grain",
    "Semolina",
    "Spaghetti",
    "Penne",
    "Fusilli",
    "Rigatoni",
    "Farfalle",
    "Linguine",
    "Tagliatelle",
    "Macaroni",
    "Lasagne Sheets",
    "Orzo",
    "Conchiglie",
    "Orecchiette",
    "Bucatini",
    "Vermicelli",
    "Egg Noodles",
    "Udon Noodles",
    "Soba Noodles",
    "Whole Wheat Penne",
    "Tricolour Fusilli",
    "Seitan Strips",
    "Sliced White Bread",
    "Sliced Wholemeal Bread",
    "Mini Bread Rolls",
    "Burger Buns",
    "Hot Dog Rolls",
    "Pita Bread",
    "Tortilla Wraps",
    "Plain Crackers",
    "Breadsticks",
    "Rusks",
    "Bran Flakes",
    "Granola",
    "Plain Biscuits",
    "Digestive Biscuits",
    "Breakfast Muffins",
    "Sponge Cake",
  ],
  EU02: ["Peeled Prawns", "Whole Prawns", "Seafood Mix"],
  EU03: [
    "Egg Noodles",
    "Fresh Eggs",
    "Liquid Egg White",
    "Liquid Whole Egg",
    "Breakfast Muffins",
    "Sponge Cake",
  ],
  EU04: [
    "Hake Fillets",
    "Cod Fillets",
    "Salmon Portions",
    "Pollock Fillets",
    "Haddock Fillets",
    "Sea Bass Fillets",
    "Sea Bream Fillets",
    "Tuna Steaks",
    "Swordfish Steaks",
    "Sardine Fillets",
    "Mackerel Fillets",
    "Plaice Fillets",
    "Sole Fillets",
    "Trout Portions",
    "Seafood Mix",
  ],
  EU06: [
    "Soy Sauce",
    "Soy Drink",
    "Firm Tofu",
    "Smoked Tofu",
    "Tempeh",
    "Edamame Beans",
  ],
  EU07: [
    "Whole Milk",
    "Semi Skimmed Milk",
    "Skimmed Milk",
    "Plain Yogurt",
    "Greek Yogurt",
    "Strawberry Yogurt",
    "Vanilla Yogurt",
    "Unsalted Butter",
    "Salted Butter",
    "Cooking Cream",
    "Whipping Cream",
    "Cream Cheese",
    "Cheddar Cheese",
    "Mozzarella Cheese",
    "Gouda Cheese",
    "Cottage Cheese",
    "Breakfast Muffins",
    "Sponge Cake",
  ],
  EU08: ["Almond Drink"],
  EU10: ["Dijon Mustard"],
  EU11: ["Sesame Oil"],
  EU14: ["Squid Rings", "Cuttlefish Strips", "Mussel Meat", "Seafood Mix"],
};
export const mockTraces = {
  EU05: ["Granola", "Plain Biscuits"],
  EU08: ["Granola", "Chocolate Cereal"],
};
export const mockSource =
  "MOCK DATA: synthetic demonstration formulation; no supplier document; requires Quality review.";
export async function seedAllergens(store, tenantId = "workspace") {
  return store.transaction(async () => {
    await store.lock(tenantId);
    const ids = new Map();
    let createdAllergens = 0,
      createdLinks = 0,
      updatedProducts = 0;
    const existing = await store.list(tenantId, "allergens");
    for (const [code, name] of allergenReference) {
      let row = existing.find((a) => a.data.code === code);
      if (row && row.data.name !== name)
        throw new Error(
          `Allergen code ${code} already has a different name; no data has been changed.`,
        );
      row ??= existing.find(
        (a) => a.data.name.toLowerCase() === name.toLowerCase(),
      );
      if (!row) {
        row = await store.create(tenantId, "allergens", { code, name }, null);
        createdAllergens++;
      }
      ids.set(code, row.id);
    }
    const products = (await store.list(tenantId, "products")).filter(
      (p) =>
        p.data.brand === "Nexora Sample" && /^NX-\d{2}-\d{3}$/.test(p.data.sku),
    );
    const links = await store.list(tenantId, "productAllergens");
    const linked = new Set();
    for (const [kind, mapping] of [
      ["CONTAINS", mockContains],
      ["TRACES", mockTraces],
    ]) {
      for (const [code, names] of Object.entries(mapping))
        for (const name of names) {
          const product = products.find((p) => p.data.name === name);
          if (!product) continue;
          linked.add(product.id);
          if (
            links.some(
              (l) =>
                l.data.productId === product.id &&
                l.data.allergenId === ids.get(code),
            )
          )
            continue;
          const link = await store.create(
            tenantId,
            "productAllergens",
            {
              productId: product.id,
              allergenId: ids.get(code),
              kind,
              source: mockSource,
              validated: false,
            },
            null,
          );
          links.push(link);
          createdLinks++;
        }
    }
    for (const product of products)
      if (
        linked.has(product.id) &&
        product.data.allergenStatus === "UNVERIFIED"
      ) {
        await store.update(
          tenantId,
          "products",
          product.id,
          { ...product.data, allergenStatus: "PENDING_REVIEW" },
          product.version,
          null,
        );
        updatedProducts++;
      }
    return { createdAllergens, createdLinks, updatedProducts };
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
        await seedAllergens(store, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await store.close();
  }
}
