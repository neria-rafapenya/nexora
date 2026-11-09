import type { Resource } from "../domain/core";
export function emptyForm(def: Resource) {
  return Object.fromEntries(
    Object.entries(def.fields).map(([key, f]) => [
      key,
      f.type === "checkbox"
        ? key === "active"
        : f.type === "json"
          ? "{}"
          : ["relations", "multi"].includes(f.type)
            ? []
            : f.type === "select"
              ? (f.options?.[0] ?? "")
              : "",
    ]),
  );
}
export function payload(def: Resource, form: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(def.fields).map(([key, f]) => {
      let v = form[key];
      if (f.type === "number") v = v === "" || v === null ? null : Number(v);
      if (f.type === "json")
        v = typeof v === "string" ? JSON.parse(v || "{}") : v;
      if (f.type === "dates")
        v =
          typeof v === "string"
            ? v
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : v;
      return [key, v];
    }),
  );
}
