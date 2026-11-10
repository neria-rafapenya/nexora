import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeOptions } from "../src/runtime.mjs";
import { createServer } from "../src/server.mjs";
test("runtime config supports public HTTPS origin and keeps listener local", () => {
  assert.equal(runtimeOptions({}).port, 3000);
  const o = runtimeOptions({
    PORT: "3000",
    COOKIE_SECURE: "true",
    ALLOWED_ORIGINS: "https://backoffice.horekia.com",
  });
  assert.deepEqual(o, {
    port: 3000,
    secure: true,
    allowedOrigins: ["https://backoffice.horekia.com"],
  });
  for (const e of [
    { PORT: "0" },
    { PORT: "abc" },
    { ALLOWED_ORIGINS: "*" },
    { ALLOWED_ORIGINS: "https://backoffice.horekia.com/path" },
  ])
    assert.throws(() => runtimeOptions(e));
});
test("public-origin requests work behind loopback proxy while foreign origins and unauthenticated data remain blocked", async () => {
  const s = createServer(
    { ready: async () => true },
    runtimeOptions({
      COOKIE_SECURE: "true",
      ALLOWED_ORIGINS: "https://backoffice.horekia.com",
    }),
  );
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + s.address().port;
  try {
    assert.equal((await fetch(url + "/api/health")).status, 200);
    assert.equal((await fetch(url + "/api/masters/products")).status, 401);
    assert.equal(
      (
        await fetch(url + "/api/setup", {
          method: "POST",
          headers: {
            Origin: "https://backoffice.horekia.com",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(url + "/api/setup", {
          method: "POST",
          headers: {
            Origin: "https://other.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await new Promise((r) => s.close(r));
  }
});
