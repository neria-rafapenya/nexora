import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { WasteService } from "./waste.mjs";
import { businessDate } from "./document-rules.mjs";
export async function seedWaste(store, t = "workspace") {
  const svc = new WasteService(store);
  return svc.write(t, async () => {
    const c = await svc.catalog(t),
      clients = c.clients.filter((c) => c.data.erpCode?.startsWith("DEMO-")),
      centers = c.centers.filter((s) =>
        clients.some((c) => c.id === s.data.clientId),
      ),
      diet = c.diets.find((d) => d.data.code === "DEMO_STANDARD"),
      products = c.products.filter(
        (p) => p.data.brand === "Nexora Sample" && p.data.active,
      );
    if (centers.length < 2 || !diet || products.length < 4)
      throw new Error("Load demo business masters first");
    const relative = (n) =>
      new Date(Date.parse(businessDate()) + n * 86400000)
        .toISOString()
        .slice(0, 10);
    let events = 0,
      actuals = 0,
      actions = 0;
    const existingEvents = await store.list(t, "wasteEvents"),
      existingActuals = await store.list(t, "serviceActuals");
    for (let i = 0; i < 6; i++) {
      const key = "DEMO_F5_EVENT_" + i;
      if (existingEvents.some((e) => e.data.createKey === key)) continue;
      const recipe =
        i >= 4
          ? c.recipeVersions.find(
              (v) =>
                !v.data.snapshot.clientId ||
                v.data.snapshot.clientId === centers[i % 2].data.clientId,
            )
          : null;
      if (i >= 4 && !recipe) continue;
      const product = products[i % products.length],
        reason = [
          "OVERPRODUCTION",
          "PREPARATION",
          "EXPIRY",
          "DETERIORATION",
          "OVERPRODUCTION",
          "PLATE_LEFTOVERS",
        ][i],
        destinationKind =
          i === 0 ? "DONATION_CANDIDATE" : i === 2 ? "RETURN" : "DISPOSAL";
      const d = await svc.saveMeasurement(
        t,
        "events",
        null,
        {
          createKey: key,
          centerId: centers[i % 2].id,
          date: relative(-i),
          service: "LUNCH",
          menuPlanId: null,
          dietId: diet.id,
          sourceReference:
            "MOCK DATA — fabricated measurement, not a real loss",
          notes: "Synthetic observation for F5 POC only.",
          isMock: true,
          sourceKind: recipe ? "RECIPE" : "PRODUCT",
          productId: recipe ? null : product.id,
          recipeVersionId: recipe?.id ?? null,
          reason,
          quantity: recipe ? 2.5 : 0.75 + i * 0.25,
          unit: recipe ? "PORTION" : product.data.unit,
          lot: "MOCK-BATCH-" + i,
          useBy: destinationKind === "DONATION_CANDIDATE" ? relative(2) : null,
          traceabilityReference: "MOCK DATA — fictional lot and destination",
          destinationKind,
          destinationTarget:
            destinationKind === "DONATION_CANDIDATE"
              ? "Demo donation organization"
              : destinationKind === "RETURN"
                ? "Demo supplier return desk"
                : "Demo disposal point",
        },
        null,
      );
      await store.update(
        t,
        "wasteEvents",
        d.id,
        {
          ...d.data,
          state: "RECORDED",
          recordedBy: "MOCK_SEED",
          recordedAt: new Date().toISOString(),
          destinationState:
            destinationKind === "DISPOSAL" ? "READY" : "PENDING_QUALITY",
        },
        d.version,
        null,
      );
      events++;
    }
    for (let centerIndex = 0; centerIndex < 2; centerIndex++)
      for (let i = 0; i < 3; i++) {
        const key = "DEMO_F5_ACTUAL_" + centerIndex + "_" + i,
          date = relative(-i);
        if (
          existingActuals.some(
            (a) =>
              a.data.createKey === key ||
              (a.data.state === "RECORDED" &&
                a.data.centerId === centers[centerIndex].id &&
                a.data.date === date &&
                a.data.service === "LUNCH" &&
                a.data.dietId === diet.id),
          )
        )
          continue;
        const d = await svc.saveMeasurement(
          t,
          "actuals",
          null,
          {
            createKey: key,
            centerId: centers[centerIndex].id,
            date,
            service: "LUNCH",
            menuPlanId: null,
            dietId: diet.id,
            sourceReference: "MOCK DATA — synthetic produced/served counts",
            notes: "Example telemetry, not an actual kitchen service.",
            isMock: true,
            produced: centerIndex === 0 ? 100 : 80,
            served: centerIndex === 0 ? 90 + i : 72 + i,
          },
          null,
        );
        await store.update(
          t,
          "serviceActuals",
          d.id,
          {
            ...d.data,
            state: "RECORDED",
            recordedBy: "MOCK_SEED",
            recordedAt: new Date().toISOString(),
          },
          d.version,
          null,
        );
        actuals++;
      }
    const key = "DEMO_F5_ACTION_0";
    if (
      !(await store.list(t, "wasteActions")).some(
        (a) => a.data.createKey === key,
      )
    ) {
      const links = (await store.list(t, "wasteEvents")).filter(
        (e) => e.data.centerId === centers[0].id && e.data.state === "RECORDED",
      );
      await svc.saveAction(
        t,
        null,
        {
          createKey: key,
          centerId: centers[0].id,
          title: "Demo portion planning review",
          reason: "OVERPRODUCTION",
          ownerName: "Demo Operations Team",
          dueDate: relative(7),
          targetReductionPercent: 10,
          linkedEventIds: links.slice(0, 2).map((l) => l.id),
          notes:
            "MOCK DATA — review production batches against observed demand. Target is fictional, not a measured outcome.",
          isMock: true,
        },
        null,
      );
      actions++;
    }
    return {
      events,
      actuals,
      actions,
      qualityApprovals: 0,
      completedDestinations: 0,
    };
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
        await seedWaste(s, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await s.close();
  }
}
