import { describe, it, expect } from "vitest";
import { emptyForm, payload } from "./forms";
import type { Resource } from "../domain/core";
const def: Resource = {
  label: "Test",
  singular: "test",
  columns: [],
  fields: {
    stock: { label: "Stock", type: "number" },
    rules: { label: "Rules", type: "json" },
    closedDates: { label: "Dates", type: "dates" },
    active: { label: "Active", type: "checkbox" },
  },
};
describe("Master forms", () => {
  it("keeps optional numeric values empty instead of converting them to zero", () =>
    expect(payload(def, emptyForm(def)).stock).toBeNull());
  it("converts typed dates and JSON without losing zero", () =>
    expect(
      payload(def, {
        stock: "0",
        rules: '{"limit":2}',
        closedDates: "2026-12-01, 2026-12-02",
        active: true,
      }),
    ).toEqual({
      stock: 0,
      rules: { limit: 2 },
      closedDates: ["2026-12-01", "2026-12-02"],
      active: true,
    }));
  it("rejects malformed JSON before submitting", () =>
    expect(() => payload(def, { ...emptyForm(def), rules: "{" })).toThrow());
});
