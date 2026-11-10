import { test } from "node:test";
import assert from "node:assert/strict";
import { Accounts, profileData, handleAccounts } from "../src/accounts.mjs";
test("profile validation rejects passwords, permission fields and arbitrary avatar URLs", () => {
  const p = {
    name: " Name ",
    email: " USER@example.com ",
    phone: "123",
    jobTitle: "Manager",
  };
  assert.equal(profileData(p, true).email, "user@example.com");
  assert.equal(profileData(p, true).name, "Name");
  for (const patch of [
    { password: "secret" },
    { role: "admin" },
    { name: "" },
    { phone: "x".repeat(41) },
    { email: "invalid" },
  ])
    assert.throws(
      () => profileData({ ...p, ...patch }, true),
      (e) => e.status === 400,
    );
  assert.throws(
    () => profileData(p),
    (e) => e.status === 400,
  );
});
test("management handlers reject non-admins and never dispatch password edits for another user", async () => {
  for (const role of [
    "read_only",
    "quality",
    "commercial",
    "operations_orders",
    "nutrition_menus",
  ])
    for (const [path, method] of [
      ["/api/users", "GET"],
      ["/api/users", "POST"],
      ["/api/users/other", "PUT"],
      ["/api/users/other", "DELETE"],
      ["/api/users/other/avatar", "GET"],
    ])
      await assert.rejects(
        () => handleAccounts({ path, method, user: { id: "actor" }, role }),
        (e) => e.status === 403,
      );
  await assert.rejects(
    () =>
      handleAccounts({
        path: "/api/users/other/password",
        method: "PUT",
        user: { id: "admin" },
        role: "admin",
      }),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => handleAccounts({ path: "/api/profile", method: "GET" }),
    (e) => e.status === 401,
  );
  let received;
  await handleAccounts({
    path: "/api/profile/password",
    method: "PUT",
    user: { id: "self" },
    body: { currentPassword: "old", newPassword: "new", id: "other" },
    tokenHash: "session",
    service: {
      password: async (...args) => {
        received = args;
        return { ok: true };
      },
    },
    send: () => {},
  });
  assert.equal(received[0], "self");
  assert.equal(received[2], "session");
  const s = new Accounts({});
  await assert.rejects(
    () =>
      s.password(
        "self",
        {
          currentPassword: "old",
          newPassword: "valid-new-password",
          id: "other",
        },
        "session",
      ),
    (e) => e.status === 400,
  );
  assert.equal(
    await handleAccounts({ path: "/api/users-not-a-route", method: "GET" }),
    false,
  );
});
test("sensitive request throttling blocks after five invalid attempts and public DTO excludes hashes, secrets and disk keys", () => {
  const s = new Accounts({});
  for (let i = 0; i < 5; i++) {
    s.throttle("test");
    assert.throws(
      () => s.wrong("test", "Invalid"),
      (e) => e.status === 400,
    );
  }
  assert.throws(
    () => s.throttle("test"),
    (e) => e.status === 429,
  );
  const dto = s.publicUser(
    {
      id: "x",
      name: "Name",
      email: "a@b.com",
      phone: "",
      job_title: "",
      role: "admin",
      profile_version: 3,
      access_version: 2,
      password_ready: true,
      password_hash: "SECRET",
      mfa_secret: "SECRET",
      avatar: { storageKey: "SECRET" },
      created_at: null,
      updated_at: null,
    },
    true,
    "company",
  );
  assert(!JSON.stringify(dto).includes("SECRET"));
  assert(dto.avatarUrl.includes("company=company"));
  assert.equal(dto.profileVersion, 3);
});
