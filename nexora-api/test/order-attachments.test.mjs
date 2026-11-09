import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareAttachment } from "../src/order-attachments.mjs";
function pdfWithText(text) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  objects.push(
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  );
  let out = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out).toString("base64");
}
test("extracts text from a digital PDF without an AI provider", async () => {
  const file = {
    filename: "order.pdf",
    mime: "application/pdf",
    base64: pdfWithText("SKU-A | 2 | KG"),
  };
  const result = await prepareAttachment(file);
  assert.equal(result.text, "SKU-A | 2 | KG");
  assert.equal(result.attachment.filename, "order.pdf");
});
test("attachment type, signature, unknown fields and size are checked", async () => {
  await assert.rejects(
    () =>
      prepareAttachment({
        filename: "bad.pdf",
        mime: "application/pdf",
        base64: Buffer.from("not a pdf").toString("base64"),
      }),
    /Invalid PDF/,
  );
  await assert.rejects(
    () =>
      prepareAttachment({ filename: "x", mime: "text/html", base64: "AAAA" }),
    /Only PDF/,
  );
  await assert.rejects(
    () =>
      prepareAttachment({
        filename: "x",
        mime: "image/png",
        base64: "AAAA",
        messageId: "other",
      }),
    /Invalid attachment/,
  );
  await assert.rejects(
    () =>
      prepareAttachment({
        filename: "x",
        mime: "image/png",
        base64: "A".repeat(2000004),
      }),
    /Invalid attachment/,
  );
});
