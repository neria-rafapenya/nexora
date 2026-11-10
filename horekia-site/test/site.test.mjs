import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "../../nexora-backoffice/node_modules/jsdom/lib/api.js";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
test("public content is server-readable and has one descriptive H1, canonical metadata, valid JSON-LD and honest product scope", async () => {
  const html = await readFile(root + "index.html", "utf8"),
    d = new JSDOM(html).window.document;
  assert.equal(d.documentElement.lang, "es");
  assert.equal(d.querySelectorAll("h1").length, 1);
  assert(
    d.querySelector("title").textContent.includes("Gestión alimentaria B2B"),
  );
  assert(d.querySelector("meta[name=description]").content.length > 100);
  assert.equal(
    d.querySelector("link[rel=canonical]").href,
    "https://www.horekia.com/",
  );
  const schema = JSON.parse(
    d.querySelector('script[type="application/ld+json"]').textContent,
  );
  assert(
    schema["@graph"].every((n) =>
      n["@id"].startsWith("https://www.horekia.com/"),
    ),
  );
  assert(!html.includes("AggregateRating"));
  assert(d.querySelectorAll("details").length >= 8);
  assert(d.body.textContent.includes("integraciones parcialmente simuladas"));
  assert(d.querySelectorAll("form").length === 1);
  assert(d.querySelector("#contact-privacy").required);
  assert(d.querySelector("#contact-email").required);
  assert(!html.includes("GEMINI_API_KEY"));
});
test("every internal link/asset exists, IDs are unique, legal pages have canonical URLs, and sitemap contains only real pages", async () => {
  for (const page of [
    "index.html",
    "aviso-legal/index.html",
    "privacidad/index.html",
    "cookies/index.html",
  ]) {
    const d = new JSDOM(await readFile(root + page, "utf8")).window.document;
    const ids = [...d.querySelectorAll("[id]")].map((n) => n.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(d.querySelectorAll("h1").length, 1);
    assert(d.querySelector("link[rel=canonical]"));
    for (const node of d.querySelectorAll("[href],[src]")) {
      const value = node.getAttribute("href") ?? node.getAttribute("src");
      if (!value || /^(https?:|mailto:|data:)/.test(value)) continue;
      if (value.startsWith("#")) {
        assert(d.getElementById(value.slice(1)), value);
        continue;
      }
      const path = value.split("#")[0];
      if (!path || path.startsWith("/api/")) continue;
      const target =
        path === "/"
          ? "index.html"
          : path.endsWith("/")
            ? path.slice(1) + "index.html"
            : path.slice(1);
      assert((await stat(root + target)).isFile(), target);
    }
  }
  const sitemap = await readFile(root + "sitemap.xml", "utf8");
  assert(sitemap.includes("https://www.horekia.com/"));
  assert(!sitemap.includes("localhost"));
  assert.equal((sitemap.match(/<loc>/g) ?? []).length, 4);
  const robots = await readFile(root + "robots.txt", "utf8");
  assert(robots.includes("Allow: /"));
  assert(robots.includes("Sitemap: https://www.horekia.com/sitemap.xml"));
  assert((await readFile(root + "404.html", "utf8")).includes("noindex"));
});
test("contact form handles success, failures and duplicate clicks without clearing a failed message or using browser storage", async () => {
  const html = await readFile(root + "index.html", "utf8"),
    script = await readFile(
      root +
        new JSDOM(html).window.document
          .querySelector("script[src]")
          .getAttribute("src")
          .slice(1),
      "utf8",
    );
  const dom = new JSDOM(html, {
      url: "https://www.horekia.com/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  let resolveSubmit;
  const calls = [];
  w.fetch = async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("contact-token"))
      return { ok: true, json: async () => ({ token: "temporary-token" }) };
    return new Promise((resolve) => (resolveSubmit = resolve));
  };
  w.eval(script);
  for (const [id, value] of [
    ["contact-name", "Person"],
    ["contact-email", "test@example.invalid"],
    ["contact-company", "Example"],
    ["contact-message", "Please arrange a demo."],
  ])
    w.document.getElementById(id).value = value;
  w.document.getElementById("contact-privacy").checked = true;
  const form = w.document.querySelector("form");
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((r) => setTimeout(r, 0));
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(calls.length, 2);
  assert(w.document.querySelector("button[type=submit]").disabled);
  resolveSubmit({ ok: false, json: async () => ({ error: "Temporal error" }) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    w.document.getElementById("contact-message").value,
    "Please arrange a demo.",
  );
  assert.equal(
    w.document.querySelector("[role=alert]").textContent,
    "Temporal error",
  );
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((r) => setTimeout(r, 0));
  resolveSubmit({ ok: true, json: async () => ({ ok: true }) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.document.getElementById("contact-message").value, "");
  assert(
    w.document
      .querySelector("#contact-status")
      .textContent.includes("guardado correctamente"),
  );
  assert(!script.includes("localStorage"));
  assert(!script.includes("sessionStorage"));
  dom.window.close();
});
