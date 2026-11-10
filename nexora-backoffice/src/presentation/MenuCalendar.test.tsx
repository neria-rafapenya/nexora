import { MemoryRouter } from "react-router-dom";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect } from "vitest";
import { copyMenuDay, MenuCalendar } from "./MenuCalendar";
import { planForm } from "../application/menuModel";
it("copying a center day keeps its specific recipes and preserves other centers and diner counts", () => {
  const f = planForm();
  f.schedule.entries = [
    {
      date: "2030-01-07",
      dietId: "d",
      course: "MAIN",
      recipeVersionId: "common",
      centerId: null,
    },
    {
      date: "2030-01-07",
      dietId: "d",
      course: "MAIN",
      recipeVersionId: "specific",
      centerId: "a",
    },
    {
      date: "2030-01-08",
      dietId: "d",
      course: "MAIN",
      recipeVersionId: "other",
      centerId: "b",
    },
  ];
  f.counts.overrides = [
    { centerId: "a", date: "2030-01-08", dietId: "d", count: 40 },
  ];
  const result = copyMenuDay(f, "2030-01-07", "2030-01-08", "a");
  expect(
    result.schedule.entries.find(
      (e) => e.date === "2030-01-08" && e.centerId === "a",
    )?.recipeVersionId,
  ).toBe("specific");
  expect(
    result.schedule.entries.find((e) => e.centerId === "b")?.recipeVersionId,
  ).toBe("other");
  expect(result.counts).toEqual(f.counts);
});
it("read-only calendar permits browsing diets while disabling recipe editing", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const host = document.createElement("div"),
    root = createRoot(host),
    f = planForm();
  f.startDate = f.endDate = "2030-01-07";
  const c = {
    diets: [
      {
        id: "d",
        version: 1,
        createdAt: "",
        updatedAt: "",
        data: { name: "Diet" },
      },
    ],
    recipeVersions: [],
    centers: [],
  };
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <MenuCalendar
            form={f}
            c={c}
            disabled
            onChange={() => {
              throw new Error("Read-only");
            }}
          />
        </MemoryRouter>,
      ),
    );
    const controls = [
      ...host.querySelectorAll<HTMLSelectElement>(
        'select:not([aria-label^="Filas por página"])',
      ),
    ];
    expect(controls[0].disabled).toBe(false);
    expect(controls.slice(2).every((s) => s.disabled)).toBe(true);
  } finally {
    await act(async () => root.unmount());
  }
});
