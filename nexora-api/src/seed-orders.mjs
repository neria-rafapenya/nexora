import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { OrdersService } from "./orders.mjs";
function nextDelivery(center) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  for (let n = 1; n <= 30; n++) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    const date = d.toISOString().slice(0, 10),
      day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getUTCDay()];
    if (
      (!center.data.deliveryDays?.length ||
        center.data.deliveryDays.includes(day)) &&
      !center.data.closedDates?.includes(date)
    )
      return date;
  }
  throw new Error("No demo delivery date available");
}
export async function seedOrders(store, tenantId = "workspace") {
  const service = new OrdersService(store);
  return store.transaction(async () => {
    await store.lock(tenantId);
    const clients = (await store.list(tenantId, "clients")).filter(
        (c) => c.data.erpCode?.startsWith("DEMO-") && c.data.active,
      ),
      centers = await store.list(tenantId, "centers"),
      products = (await store.list(tenantId, "products")).filter(
        (p) => p.data.brand === "Nexora Sample" && p.data.active,
      ),
      existing = await store.list(tenantId, "inboxMessages");
    if (clients.length < 3 || products.length < 3)
      throw new Error("Load the business master demo data first");
    let messages = 0,
      proposals = 0;
    for (let i = 0; i < 6; i++) {
      const subject = `Demo F2 order ${String(i + 1).padStart(3, "0")}`;
      if (
        existing.some(
          (m) =>
            m.data.subject === subject &&
            m.data.sender.endsWith("@nexora-demo.test"),
        )
      )
        continue;
      const client = clients[i % clients.length],
        center = centers.find((c) => c.data.clientId === client.id);
      if (!center) throw new Error("Demo center is missing");
      const p = products[i],
        other = products[(i + 20) % products.length];
      const body =
        i === 1
          ? `${p.data.sku} | ${Number(p.data.stock ?? 0) + 50} | ${p.data.unit}`
          : i === 2
            ? `${p.data.sku} | 2 | ${p.data.unit}\n1 UNIT Unknown demo ingredient`
            : i === 4
              ? `${p.data.sku} | 2 | ${p.data.unit === "BOX" ? "KG" : "BOX"}`
              : i === 3
                ? `2 ${p.data.unit} ${p.data.name}`
                : `${p.data.sku} | 2 | ${p.data.unit}\n${other.data.sku} | 1 | ${other.data.unit}`;
      const message = await service.createMessage(
        tenantId,
        {
          channel: ["EMAIL", "WHATSAPP", "PDF", "MANUAL", "EMAIL", "WHATSAPP"][
            i
          ],
          sender: client.data.orderEmail,
          subject,
          body,
          clientId: client.id,
          centerId: center.id,
          requestedDate: nextDelivery(center),
        },
        null,
      );
      messages++;
      if (i < 3) {
        await service.processMessage(
          tenantId,
          message.id,
          message.version,
          null,
        );
        proposals++;
      }
    }
    return { messages, proposals, confirmed: 0 };
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
        await seedOrders(store, process.env.SEED_TENANT_ID ?? "workspace"),
      ),
    );
  } finally {
    await store.close();
  }
}
