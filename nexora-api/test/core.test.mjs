import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, can, resources } from "../src/schema.mjs";
import { parseCsv, convertRows, readImport } from "../src/imports.mjs";
import { demoFamilies, seedCatalog } from "../src/seed.mjs";
import { passwordHash, passwordMatches } from "../src/store.mjs";
test("catalog has exactly 10 families, 20 English products per family and unique SKUs", async () => {
  const rows = { families: [], products: [] };
  const store = {
    list: async (t, r) => rows[r],
    create: async (t, r, data) => {
      const row = { id: String(rows[r].length + 1), data: validate(r, data) };
      rows[r].push(row);
      return row;
    },
  };
  await seedCatalog(store, "t", null);
  await seedCatalog(store, "t", null);
  assert.equal(rows.families.length, 10);
  assert.equal(rows.products.length, 200);
  assert.equal(new Set(rows.products.map((x) => x.data.sku)).size, 200);
  for (const f of rows.families)
    assert.equal(
      rows.products.filter((x) => x.data.familyId === f.id).length,
      20,
    );
  assert.equal(demoFamilies.length, 10);
  assert(
    rows.products.every(
      (x) =>
        x.data.allergenStatus === "UNVERIFIED" && x.data.supplierId === null,
    ),
  );
});
test("product validation rejects negative stock, unknown fields and invalid enum values", () => {
  const p = {
    sku: "T",
    name: "Test",
    familyId: "f",
    unit: "KG",
    temperature: "AMBIENT",
    allergenStatus: "UNVERIFIED",
    stock: 0,
  };
  assert.equal(validate("products", p).stock, 0);
  for (const extra of [
    { stock: -1 },
    { temperature: "COLD" },
    { allergenStatus: "VALIDATED" },
    { unsafe: "x" },
  ])
    assert.throws(() => validate("products", { ...p, ...extra }));
});
test("center/diet structures reject invalid JSON, dates, missing relations and fractional counts", () => {
  assert.throws(() =>
    validate("centers", {
      name: "Center",
      clientId: "x",
      closedDates: ["2026-02-30"],
    }),
  );
  assert.throws(() =>
    validate("diets", { code: "D", name: "Diet", rules: [] }),
  );
  assert.throws(() =>
    validate("centerDiners", {
      centerId: "c",
      dietId: "d",
      service: "LUNCH",
      count: 1.5,
    }),
  );
  assert.throws(() => validate("centers", { name: "Center" }));
});
test("roles restrict masters and reserve allergen validation workflow for quality", () => {
  assert(can("admin", "families", true));
  assert(!can("read_only", "products", true));
  assert(!can("operations_orders", "products", true));
  assert(can("quality", "productAllergens", true));
  assert(!can("commercial", "suppliers"));
  assert(!can("nutrition_menus", "clients", true));
});
test("CSV handles quoted commas, escaped quotes, BOM and CRLF", () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFname,temperature\r\n"Rice, long grain",AMBIENT\r\n"A ""quoted"" name",CHILLED\r\n',
    ),
    [
      { name: "Rice, long grain", temperature: "AMBIENT" },
      { name: 'A "quoted" name', temperature: "CHILLED" },
    ],
  );
  assert.throws(() => parseCsv("name,name\na,b"));
  assert.throws(() => parseCsv("name,temp\na"));
  assert.throws(() => parseCsv('name\n"open'));
});
test("CSV conversion does not silently accept malformed boolean values", () => {
  assert.throws(() =>
    convertRows("suppliers", [{ name: "Supplier", active: "perhaps" }]),
  );
  assert.equal(
    convertRows("suppliers", [{ name: "Supplier", active: "false" }])[0].active,
    false,
  );
  assert.throws(() => convertRows("suppliers", [{ notAField: "value" }]));
});
test("passwords are salted and verified without plaintext persistence", () => {
  const a = passwordHash("Long test password!"),
    b = passwordHash("Long test password!");
  assert.notEqual(a, b);
  assert(passwordMatches("Long test password!", a));
  assert(!passwordMatches("Wrong password", a));
});
test("all master structures are defined without seed data outside products/families", () => {
  assert.deepEqual(Object.keys(resources), [
    "families",
    "products",
    "allergens",
    "suppliers",
    "clients",
    "centers",
    "diets",
    "centerDiners",
    "productAllergens",
  ]);
});
test("Excel imports read plain values and reject formula cells", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("Families");
  s.addRow(["name", "temperature"]);
  s.addRow(["Test Family", "AMBIENT"]);
  const buffer = await w.xlsx.writeBuffer();
  assert.deepEqual(
    await readImport({
      format: "xlsx",
      content: Buffer.from(buffer).toString("base64"),
    }),
    [{ name: "Test Family", temperature: "AMBIENT" }],
  );
  s.getCell("A2").value = { formula: "1+1", result: 2 };
  const formulaBuffer = await w.xlsx.writeBuffer();
  await assert.rejects(() =>
    readImport({
      format: "xlsx",
      content: Buffer.from(formulaBuffer).toString("base64"),
    }),
  );
});
