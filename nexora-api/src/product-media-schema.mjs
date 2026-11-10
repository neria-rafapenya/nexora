export const productMediaResources = {
  productFiles: {
    label: "Product files",
    fields: {
      productId: {
        label: "Product",
        type: "relation",
        resource: "products",
        required: true,
      },
      kind: {
        label: "Kind",
        type: "select",
        options: ["IMAGE", "DOCUMENT"],
        required: true,
      },
      filename: {
        label: "Filename",
        type: "text",
        required: true,
        maxLength: 200,
      },
      mime: {
        label: "MIME type",
        type: "select",
        options: ["image/webp", "application/pdf", "application/msword"],
        required: true,
      },
      base64: { label: "Upload content", type: "text", maxLength: 1400000 },
      storageKey: {
        label: "Private storage reference",
        type: "text",
        maxLength: 200,
      },
      checksum: { label: "SHA-256", type: "text", required: true },
      size: {
        label: "Bytes",
        type: "number",
        integer: true,
        min: 1,
        required: true,
      },
    },
    columns: [],
  },
};
export async function migrateProductMedia(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=12")).rowCount)
    return;
  await s.query(`ALTER TABLE bo."productFiles" ADD COLUMN product_id TEXT GENERATED ALWAYS AS (data->>'productId') STORED;
 ALTER TABLE bo."productFiles" ADD CONSTRAINT product_files_product_fk FOREIGN KEY(tenant_id,product_id) REFERENCES bo.products(tenant_id,id) ON DELETE RESTRICT;
 CREATE UNIQUE INDEX product_one_image ON bo."productFiles"(tenant_id,product_id) WHERE data->>'kind'='IMAGE';
 ALTER TABLE bo."productFiles" ADD CONSTRAINT product_files_metadata CHECK(NOT(data ? 'base64') AND data->>'storageKey' IS NOT NULL AND (data->>'size')::int BETWEEN 1 AND 1000000 AND ((data->>'kind'='IMAGE' AND data->>'mime'='image/webp') OR (data->>'kind'='DOCUMENT' AND data->>'mime' IN ('application/pdf','application/msword'))));
 INSERT INTO bo.migrations(version) VALUES(12)`);
}
