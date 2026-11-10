import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { MenusService, planDates } from "./menus.mjs";
export async function seedMenus(store, tenant = "workspace") {
  const s = new MenusService(store);
  return s.write(tenant, async () => {
    const catalog = await s.catalog(tenant),
      client = catalog.clients.find(
        (c) => c.data.erpCode?.startsWith("DEMO-") && c.data.active,
      ),
      centers = catalog.centers.filter((c) => c.data.clientId === client?.id),
      diets = catalog.diets;
    if (!client || !centers.length || !diets.length)
      throw new Error("Load demo business masters first");
    const ids = {};
    let ingredients = 0,
      recipes = 0,
      plans = 0;
    for (const name of [
      "Basmati Rice",
      "Chopped Tomatoes",
      "Chickpeas",
      "Brown Lentils",
    ]) {
      const product = catalog.products.find(
        (p) =>
          p.data.name === name &&
          p.data.brand === "Nexora Sample" &&
          p.data.unit === "KG" &&
          p.data.active,
      );
      if (!product) throw new Error("Demo product is missing");
      let ingredient = catalog.menuIngredients.find(
        (i) => i.data.name === "Demo " + name,
      );
      if (!ingredient) {
        ingredient = await s.saveIngredient(
          tenant,
          null,
          { name: "Demo " + name, unit: "KG", active: true },
          null,
        );
        ingredients++;
        await s.saveMapping(
          tenant,
          {
            ingredientId: ingredient.id,
            productId: product.id,
            quantityPerSalesUnit: 1,
            source:
              "MOCK DATA — demo product sold per kg; supplier review pending",
          },
          null,
        );
      }
      ids[name] = ingredient.id;
    }
    const specs = [
      [
        "Demo Rice with Tomato",
        [
          ["Basmati Rice", 0.8],
          ["Chopped Tomatoes", 0.4],
        ],
      ],
      [
        "Demo Chickpea Stew",
        [
          ["Chickpeas", 1.2],
          ["Chopped Tomatoes", 0.5],
        ],
      ],
      [
        "Demo Lentils with Rice",
        [
          ["Brown Lentils", 0.9],
          ["Basmati Rice", 0.3],
        ],
      ],
    ];
    const versions = [];
    for (const [name, lines] of specs) {
      let recipe = catalog.recipes.find((r) => r.data.name === name);
      if (!recipe) {
        recipe = await s.saveRecipe(
          tenant,
          null,
          {
            name,
            clientId: client.id,
            yieldServings: 10,
            method:
              "MOCK DATA — fictional batch quantities; preparation and nutritional suitability require professional review.",
            items: {
              lines: lines.map(([n, quantity]) => ({
                ingredientId: ids[n],
                quantity,
              })),
            },
            active: true,
          },
          null,
        );
        recipes++;
      }
      const version = (await store.list(tenant, "recipeVersions")).find(
        (v) =>
          v.data.recipeId === recipe.id &&
          v.data.revision === recipe.data.revision,
      );
      versions.push(version.id);
    }
    if (
      !(await store.list(tenant, "menuPlans")).some(
        (p) => p.data.name === "Demo Client Weekly Menu",
      )
    ) {
      const d = new Date();
      const offset = (8 - d.getUTCDay()) % 7 || 7;
      d.setUTCDate(d.getUTCDate() + offset);
      const startDate = d.toISOString().slice(0, 10);
      d.setUTCDate(d.getUTCDate() + 4);
      const endDate = d.toISOString().slice(0, 10);
      const entries = planDates(startDate, endDate).flatMap((date, i) =>
        diets.map((diet) => ({
          date,
          dietId: diet.id,
          course: "MAIN",
          recipeVersionId: versions[i % versions.length],
          centerId: null,
        })),
      );
      await s.savePlan(
        tenant,
        null,
        {
          name: "Demo Client Weekly Menu",
          clientId: client.id,
          centerIds: centers.map((c) => c.id),
          startDate,
          endDate,
          service: "LUNCH",
          origin: "MOCK",
          sourceReference:
            "MOCK DATA — workflow demonstration only; not an approved or nutritionally complete menu",
          marginPercent: 5,
          schedule: { entries },
          counts: { overrides: [] },
        },
        null,
      );
      plans++;
    }
    return { ingredients, recipes, plans, published: 0, approved: 0 };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = new Store(process.env.DATABASE_URL);
  try {
    await store.migrate();
    console.log(
      JSON.stringify(
        await seedMenus(store, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await store.close();
  }
}
