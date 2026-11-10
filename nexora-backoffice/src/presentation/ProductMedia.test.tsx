// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProductMedia } from "./ProductMedia";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
let host: HTMLDivElement, root: Root, files: RecordRow[];
const row = (id: string, kind: string): RecordRow => ({
  id,
  version: 1,
  createdAt: "2026-11-10T10:00:00Z",
  updatedAt: "2026-11-10T10:00:00Z",
  data: {
    kind,
    filename: kind === "IMAGE" ? "photo.webp" : "manual.pdf",
    mime: kind === "IMAGE" ? "image/webp" : "application/pdf",
    size: 100,
  },
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  files = [];
  vi.mocked(request).mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:private-image"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.mocked(request).mockImplementation(
    async (path, _company, method = "GET", body) => {
      if (method === "POST") {
        const input = body as { kind: string };
        if (input.kind === "IMAGE") {
          const old = files.find((f) => f.data.kind === "IMAGE");
          files = files.filter((f) => f.data.kind !== "IMAGE");
          files.push({
            ...row("image", "IMAGE"),
            version: (old?.version ?? 0) + 1,
          });
        } else files.push(row("doc-" + files.length, "DOCUMENT"));
        return { record: files.at(-1) } as never;
      }
      if (method === "DELETE") {
        files = files.filter((f) => !path.endsWith("/" + f.id));
        return { ok: true } as never;
      }
      if (path === "/product-media/product")
        return { records: structuredClone(files) } as never;
      return {
        filename: "photo.webp",
        mime: "image/webp",
        base64: btoa("image"),
      } as never;
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  writable = true,
  productId: string | undefined = "product",
) {
  await act(async () =>
    root.render(
      <ProductMedia
        productId={productId}
        companyId="workspace"
        writable={writable}
      />,
    ),
  );
}
async function drop(label: string, selected: File[]) {
  await act(async () => {
    const e = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", { value: { files: selected } });
    host.querySelector(`[aria-label="${label}"]`)!.dispatchEvent(e);
    await new Promise((r) => setTimeout(r, 30));
  });
}
const posts = () =>
  vi.mocked(request).mock.calls.filter((c) => c[2] === "POST");
it("shows noimage.png when absent and rejects oversized images through a toast before sending", async () => {
  await render();
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/noimage.png");
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Ampliar imagen del producto"]',
    )?.disabled,
  ).toBe(true);
  await drop("Subir imagen del producto", [
    new File([new Uint8Array(1_000_001)], "big.png", { type: "image/png" }),
  ]);
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "La imagen supera el máximo de 1 MB",
  );
  expect(posts()).toHaveLength(0);
});
it("rejects DOCX and oversized PDF documents with specific toast messages", async () => {
  await render();
  await drop("Subir documentos del producto", [
    new File(["docx"], "file.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ]);
  expect(host.textContent).toContain(
    "El documento solo puede ser de tipo PDF o DOC",
  );
  await drop("Subir documentos del producto", [
    new File([new Uint8Array(1_000_001)], "big.pdf", {
      type: "application/pdf",
    }),
  ]);
  expect(host.textContent).toContain("El documento supera el máximo de 1 MB");
  expect(posts()).toHaveLength(0);
});
it("allows exactly one image and replaces it with version checking; clicking enlarges it", async () => {
  await render();
  const photo = new File(["image"], "photo.png", { type: "image/png" });
  await drop("Subir imagen del producto", [photo, photo]);
  expect(host.textContent).toContain(
    "Solo puedes subir una imagen por producto",
  );
  expect(posts()).toHaveLength(0);
  await drop("Subir imagen del producto", [photo]);
  expect(posts()).toHaveLength(1);
  expect(posts()[0][3]).toMatchObject({ kind: "IMAGE", version: null });
  expect(host.querySelector("img")?.getAttribute("src")).toBe(
    "blob:private-image",
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Ampliar imagen del producto"]',
      )!
      .click(),
  );
  expect(host.querySelector("dialog img")).toBeTruthy();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Cerrar imagen")!
      .click(),
  );
  expect(host.querySelector("dialog")).toBeNull();
  await drop("Subir imagen del producto", [photo]);
  expect(posts()[1][3]).toMatchObject({ kind: "IMAGE", version: 1 });
  expect(files.filter((f) => f.data.kind === "IMAGE")).toHaveLength(1);
});
it("uploads multiple PDF/DOC files separately, and removal restores the placeholder for an image", async () => {
  files = [row("image", "IMAGE")];
  await render();
  await drop("Subir documentos del producto", [
    new File(["%PDF-1.7"], "one.pdf", { type: "application/pdf" }),
    new File(["doc"], "two.doc", { type: "application/msword" }),
  ]);
  expect(posts()).toHaveLength(2);
  expect(
    posts().every((c) => (c[3] as { kind: string }).kind === "DOCUMENT"),
  ).toBe(true);
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Quitar imagen"))!
      .click(),
  );
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/noimage.png");
  expect(files.filter((f) => f.data.kind === "DOCUMENT")).toHaveLength(2);
});
it("readers can view an image and download files, but have no upload or remove controls", async () => {
  files = [row("image", "IMAGE"), row("doc", "DOCUMENT")];
  await render(false);
  expect(host.querySelector("input[type=file]")).toBeNull();
  expect(
    host.querySelector('[aria-label="Descargar manual.pdf"]'),
  ).toBeTruthy();
  expect(host.querySelector('[aria-label^="Eliminar"]')).toBeNull();
  expect(host.querySelector("img")?.getAttribute("src")).toBe(
    "blob:private-image",
  );
});
it("server upload errors are caught as toast messages and do not erase the existing image", async () => {
  files = [row("image", "IMAGE")];
  await render();
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation(async (...args) => {
    if (args[2] === "POST") throw Error("La imagen no es válida.");
    return original(...args);
  });
  await drop("Subir imagen del producto", [
    new File(["bad"], "photo.png", { type: "image/png" }),
  ]);
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "La imagen no es válida",
  );
  expect(files.filter((f) => f.data.kind === "IMAGE")).toHaveLength(1);
});
