// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GeminiIntake } from "./GeminiIntake";
import { request } from "../infrastructure/api";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(request).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(available: boolean) {
  vi.mocked(request).mockResolvedValue({
    available,
    model: "gemini-2.5-flash-lite",
    usedToday: 0,
    maxDailyRequests: 5,
  });
  await act(async () =>
    root.render(
      <GeminiIntake
        companyId="t"
        messageId="m"
        version={3}
        disabled={false}
        onBusy={() => {}}
        onOrder={() => {}}
      />,
    ),
  );
}
it("keeps Gemini disabled while unconfigured", async () => {
  await render(false);
  expect(host.querySelector("button")?.disabled).toBe(true);
  expect(host.textContent).toContain("pendiente de configuración");
  expect(request).toHaveBeenCalledTimes(1);
});
it("requires explicit demo confirmation and submits the saved version once", async () => {
  await render(true);
  expect(host.querySelector("button")?.disabled).toBe(true);
  await act(async () => host.querySelector("input")?.click());
  vi.mocked(request).mockResolvedValue({ record: { id: "order" } });
  await act(async () => host.querySelector("button")?.click());
  expect(request).toHaveBeenLastCalledWith(
    "/order-inbox/m/process-ai",
    "t",
    "POST",
    { version: 3, demoConfirmed: true },
  );
  expect(request).toHaveBeenCalledTimes(2);
});
