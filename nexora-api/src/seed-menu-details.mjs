import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
export async function seedMenuDetails(store, t = "workspace") {
  return store.transaction(async () => {
    await store.lock(t);
    const ingredients = await store.list(t, "menuIngredients"),
      mappings = await store.list(t, "ingredientProducts"),
      products = await store.list(t, "products"),
      profiles = await store.list(t, "nutritionProfiles"),
      rules = await store.list(t, "dietMenuRules");
    let nutritionDrafts = 0,
      dietRuleDrafts = 0;
    for (const mapping of mappings) {
      const ingredient = ingredients.find(
          (i) => i.id === mapping.data.ingredientId,
        ),
        p = products.find((p) => p.id === mapping.data.productId);
      if (
        !ingredient?.data.name.startsWith("Demo ") ||
        p?.data.brand !== "Nexora Sample" ||
        profiles.some((n) => n.data.productId === p.id)
      )
        continue;
      await store.create(
        t,
        "nutritionProfiles",
        {
          productId: p.id,
          basis:
            ingredient.data.unit === "KG"
              ? "PER_100_G"
              : ingredient.data.unit === "L"
                ? "PER_100_ML"
                : "PER_UNIT",
          values: {
            energyKcal: 120,
            proteinG: 4,
            carbohydrateG: 20,
            sugarsG: 2,
            fatG: 3,
            saturatedFatG: 0.5,
            fiberG: 2,
            saltG: 0.1,
          },
          foodGroups: [],
          classificationComplete: false,
          source:
            "MOCK DATA — synthetic POC values, not supplier composition; professional validation pending",
          isMock: true,
          review: {},
        },
        null,
      );
      nutritionDrafts++;
    }
    for (const diet of await store.list(t, "diets")) {
      if (
        !diet.data.rules?.demo ||
        rules.some(
          (r) => r.data.dietId === diet.id && r.data.service === "LUNCH",
        )
      )
        continue;
      await store.create(
        t,
        "dietMenuRules",
        {
          dietId: diet.id,
          service: "LUNCH",
          limits: {},
          excludedIngredientIds: [],
          requiredClaims:
            diet.data.rules.texture === "PUREED" ? ["pureedSuitable"] : [],
          source:
            "MOCK DATA — no clinical targets configured; professional definition and validation pending",
          isMock: true,
          review: {},
        },
        null,
      );
      dietRuleDrafts++;
    }
    return { nutritionDrafts, dietRuleDrafts, approved: 0 };
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
        await seedMenuDetails(s, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await s.close();
  }
}
