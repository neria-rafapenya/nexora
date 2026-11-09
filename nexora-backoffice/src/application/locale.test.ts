import { describe, it, expect } from "vitest";
import { localizeContract, enumEs, errorEs } from "./locale";
import type { Contract } from "../domain/core";
describe("Spanish presentation with English storage", () => {
  it("localizes labels without changing field keys or enum payloads", () => {
    const source: Contract = {
      roles: { admin: "Administrator" },
      permissions: { products: { read: true, write: true } },
      resources: {
        products: {
          label: "Products",
          singular: "product",
          columns: ["temperature"],
          fields: {
            temperature: {
              label: "Temperature",
              type: "select",
              options: ["AMBIENT", "FROZEN"],
            },
          },
        },
      },
    };
    const result = localizeContract(source);
    expect(result.resources.products.label).toBe("Productos");
    expect(result.resources.products.fields.temperature.label).toBe(
      "Temperatura",
    );
    expect(result.resources.products.fields.temperature.options).toEqual([
      "AMBIENT",
      "FROZEN",
    ]);
    expect(source.resources.products.label).toBe("Products");
    expect(enumEs("FROZEN")).toBe("Congelado");
  });
  it("shows validation and import errors in Spanish", () => {
    expect(errorEs("Name is required")).toBe("El nombre es obligatorio.");
    expect(errorEs("Row 3: Invalid closure date")).toBe(
      "Fila 3: Una fecha de cierre no es válida.",
    );
  });
});
