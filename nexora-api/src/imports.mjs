import { resources } from "./schema.mjs";
export function parseCsv(text) {
  if (text.length > 2_000_000) throw new Error("File too large");
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else throw new Error("Invalid CSV quotes");
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2)
    throw new Error("File must have a header and at least one record");
  if (rows.length > 1001) throw new Error("Maximum 1,000 records per import");
  const headers = rows.shift().map((x) => x.trim().replace(/^\uFEFF/, ""));
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate headers");
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`Row ${i + 2}: wrong column count`);
    return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
  });
}
export function convertRows(resource, rows) {
  const fields = resources[resource]?.fields;
  if (!fields) throw new Error("Invalid resource");
  return rows.map((row, index) => {
    try {
      const data = {};
      for (const [key, value] of Object.entries(row)) {
        const f = fields[key];
        if (!f) throw new Error(`Unknown column: ${key}`);
        if (value === null || value === "") {
          data[key] = null;
          continue;
        }
        if (f.type === "number")
          data[key] = typeof value === "number" ? value : Number(value);
        else if (f.type === "checkbox") {
          if (![true, false, "true", "false", "1", "0", 1, 0].includes(value))
            throw new Error(`Invalid boolean: ${key}`);
          data[key] = [true, "true", "1", 1].includes(value);
        } else if (["multi", "relations", "dates", "json"].includes(f.type))
          data[key] =
            typeof value === "object" ? value : JSON.parse(String(value));
        else data[key] = String(value);
      }
      return data;
    } catch (e) {
      throw new Error(`Row ${index + 2}: ${e.message}`);
    }
  });
}
export async function readImport(body) {
  if (body.format === "xlsx") {
    if (typeof body.content !== "string" || body.content.length > 2_800_000)
      throw new Error("Invalid workbook");
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(body.content, "base64"));
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 50)
      throw new Error("Invalid workbook size");
    const headers = sheet.getRow(1).values.slice(1).map(String);
    if (new Set(headers).size !== headers.length)
      throw new Error("Duplicate headers");
    const rows = [];
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      const data = {};
      headers.forEach((h, i) => {
        const value = r.getCell(i + 1).value;
        if (value && typeof value === "object")
          throw new Error(
            "Use plain values; formulas and rich cells are not supported",
          );
        data[h] = value ?? "";
      });
      rows.push(data);
    });
    if (!rows.length) throw new Error("Workbook is empty");
    return rows;
  }
  if (body.format !== "csv" || typeof body.content !== "string")
    throw new Error("Expected CSV or XLSX");
  return parseCsv(body.content);
}
