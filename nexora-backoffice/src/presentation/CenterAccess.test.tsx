// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import { CenterAccess } from "./CenterAccess";
import { request } from "../infrastructure/api";
import type { ManagedUser } from "./UserProfiles";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
it("submits explicit center grants and preserves the selection on a conflict", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const user = {
    id: "buyer",
    name: "Buyer",
    email: "buyer@example.invalid",
  } as ManagedUser;
  vi.mocked(request).mockImplementation(async (_p, _c, method) => {
    if (method === "PUT") throw Error("Los centros asignados han cambiado.");
    return {
      centerIds: ["a"],
      centers: [
        { id: "a", name: "School" },
        { id: "b", name: "Hospital" },
      ],
      revision: "revision",
      allCenters: false,
    } as never;
  });
  try {
    await act(async () =>
      root.render(<CenterAccess users={[user]} companyId="company" />),
    );
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "buyer";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelectorAll("input:checked")).toHaveLength(1);
    await act(async () => {
      (host.querySelectorAll("input")[1] as HTMLInputElement).click();
    });
    await act(async () => {
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(request).toHaveBeenLastCalledWith(
      "/center-access/buyer",
      "company",
      "PUT",
      { centerIds: ["a", "b"], revision: "revision" },
    );
    expect(host.querySelectorAll("input:checked")).toHaveLength(2);
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "han cambiado",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
