import { createRequire } from "node:module";
import { dirname } from "node:path";
export async function prepareAttachment(input) {
  if (!input) return { attachment: null, text: "" };
  if (
    typeof input !== "object" ||
    Object.keys(input).some(
      (k) => !["filename", "mime", "base64"].includes(k),
    ) ||
    typeof input.filename !== "string" ||
    !input.filename.trim() ||
    input.filename.length > 200 ||
    typeof input.base64 !== "string" ||
    input.base64.length > 2_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
  )
    throw new Error("Invalid attachment");
  if (!["application/pdf", "image/png", "image/jpeg"].includes(input.mime))
    throw new Error("Only PDF, PNG and JPEG attachments are supported");
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > 1_500_000)
    throw new Error("Attachment maximum size is 1.5 MB");
  if (
    input.mime === "application/pdf" &&
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw new Error("Invalid PDF file");
  if (
    input.mime === "image/png" &&
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new Error("Invalid PNG file");
  if (
    input.mime === "image/jpeg" &&
    bytes.subarray(0, 3).toString("hex") !== "ffd8ff"
  )
    throw new Error("Invalid JPEG file");
  let text = "";
  if (input.mime === "application/pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      standardFontDataUrl:
        dirname(
          createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
        ) + "/standard_fonts/",
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 20) throw new Error("Maximum 20 PDF pages");
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          content = await page.getTextContent();
        let line = "";
        for (const item of content.items)
          if ("str" in item) {
            line += item.str + " ";
            if (item.hasEOL) {
              text += line.trim() + "\n";
              line = "";
            }
          }
        if (line.trim()) text += line.trim() + "\n";
        if (text.length > 20000)
          throw new Error("PDF text exceeds 20000 characters");
      }
    } finally {
      await task.destroy();
    }
  }
  return {
    attachment: {
      filename: input.filename.trim(),
      mime: input.mime,
      base64: bytes.toString("base64"),
    },
    text: text.trim(),
  };
}
