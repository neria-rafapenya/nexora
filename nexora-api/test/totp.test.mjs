import { test } from "node:test";
import assert from "node:assert/strict";
import { totp, verifyTotp, newSecret } from "../src/totp.mjs";
test("TOTP matches RFC 6238 SHA-1 vectors", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  for (const [time, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])
    assert.equal(totp(secret, time * 1000, 8), expected);
});
test("TOTP accepts adjacent time windows and rejects invalid codes", () => {
  const secret = newSecret(),
    time = 1234567890000;
  assert(verifyTotp(secret, totp(secret, time), time));
  assert(verifyTotp(secret, totp(secret, time - 30000), time));
  assert(!verifyTotp(secret, totp(secret, time - 90000), time));
  assert(!verifyTotp(secret, "not-a-code", time));
});
