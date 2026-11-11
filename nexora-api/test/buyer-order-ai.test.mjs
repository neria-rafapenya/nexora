import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretBuyerOrder } from "../src/buyer-order-ai.mjs";
import { MenuStore } from "./helpers/menu-store.mjs";
const config = {
  enabled: true,
  apiKey: "test-only",
  freeTierConfirmed: true,
  model: "gemini-3.5-flash-lite",
  maxDailyRequests: 2,
};
async function fixture() {
  const s = new MenuStore();
  const cat = await s.create("t", "mainCategories", {
    name: "Demo",
    active: true,
  });
  const family = await s.create("t", "families", {
    name: "Rice",
    temperature: "AMBIENT",
    mainCategoryId: cat.id,
  });
  const product = await s.create("t", "products", {
    sku: "TEST-RICE",
    name: "Test Rice",
    familyId: family.id,
    temperature: "AMBIENT",
    unit: "KG",
    stock: 10,
    price: 2.5,
    brand: "Nexora Sample",
    active: true,
    allergenStatus: "UNVERIFIED",
  });
  const client = await s.create("t", "clients", {
    name: "Demo Client",
    erpCode: "DEMO",
    segment: "SCHOOL",
    active: true,
  });
  const center = await s.create("t", "centers", {
    name: "Demo School",
    clientId: client.id,
    deliveryDays: [],
    closedDates: [],
  });
  const access = {
    s,
    centers: async () => [
      { id: center.id, companyId: "t", clientId: client.id },
    ],
  };
  return {
    access,
    s,
    product,
    body: {
      companyId: "t",
      centerId: center.id,
      text: "2 KG Test Rice",
      demoConfirmed: true,
    },
  };
}
test("buyer text becomes a proposal awaiting review, preserves scope, reuses retries and does not reserve stock", async () => {
  const f = await fixture();
  let calls = 0;
  const options = {
    gemini: config,
    geminiAdapter: {
      extract: async ({ text }) => {
        calls++;
        return {
          output: {
            deliveryDate: null,
            lines: [
              {
                originalText: text,
                sku: "TEST-RICE",
                quantity: 2,
                unit: "KG",
                confidence: 1,
              },
            ],
          },
        };
      },
    },
  };
  const result = await interpretBuyerOrder(
    f.access,
    { id: "buyer" },
    f.body,
    options,
  );
  assert.equal(result.lines[0].productId, f.product.id);
  assert.equal(result.lines[0].quantity, 2);
  assert.equal(result.usedToday, 1);
  assert.equal(
    (await f.s.get("t", "orders", result.orderId)).data.state,
    "IN_REVIEW",
  );
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  assert.equal((await f.s.list("t", "erpDeliveries")).length, 0);
  const repeat = await interpretBuyerOrder(
    f.access,
    { id: "buyer" },
    f.body,
    options,
  );
  assert.equal(repeat.orderId, result.orderId);
  assert.equal(repeat.usedToday, 1);
  assert.equal(calls, 1);
});
test("forged centers, missing confirmation and oversized input cannot reach Gemini or create a message", async () => {
  const f = await fixture();
  let calls = 0;
  const options = {
    gemini: config,
    geminiAdapter: {
      extract: async () => {
        calls++;
        throw Error("Must not call");
      },
    },
  };
  for (const patch of [
    { centerId: "another-center" },
    { companyId: "another-company" },
    { demoConfirmed: false },
    { text: "x".repeat(12001) },
    { centerIds: ["foreign"] },
  ])
    await assert.rejects(
      () =>
        interpretBuyerOrder(
          f.access,
          { id: "buyer" },
          { ...f.body, ...patch },
          options,
        ),
      (e) => [400, 403].includes(e.status),
    );
  assert.equal(calls, 0);
  assert.equal((await f.s.list("t", "inboxMessages")).length, 0);
});
