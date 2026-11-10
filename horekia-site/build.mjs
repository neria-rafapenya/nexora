import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const sharp = createRequire(
  new URL("../nexora-api/package.json", import.meta.url),
)("sharp");
const root = fileURLToPath(new URL(".", import.meta.url));
const dist = root + "dist/";
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(root + "src/", dist, { recursive: true });
for (const name of [
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
])
  await cp(root + "../nexora-backoffice/public/" + name, dist + name);
const origin = "https://www.horekia.com";
const pages = {
  "aviso-legal": {
    title: "Aviso legal",
    description:
      "Identificación del titular de Horekia y condiciones de uso de su sitio web.",
    body: `<h2>Identificación del titular</h2><address>Rafael Peña<br>NIF: 43735032A<br>C/ Ramon Soldevila, 2<br>25003 Lleida, España<br>Correo electrónico: <a href="mailto:rafa@wad.cat">rafa@wad.cat</a></address><h2>Objeto de esta web</h2><p>Esta web presenta Horekia, una solución de gestión alimentaria B2B, y permite solicitar información o una demostración. La información comercial no constituye una contratación automática ni una oferta cerrada de implantación.</p><h2>Estado del servicio</h2><p>La versión actual es una prueba de concepto con datos ficticios e integraciones parcialmente simuladas. La app de clientes y el asistente conversacional general están previstos para etapas posteriores. El alcance, las condiciones económicas y las integraciones de un proyecto se acordarán expresamente antes de su contratación.</p><h2>Uso de la web</h2><p>Utiliza este sitio de forma lícita, sin interferir en su funcionamiento ni introducir datos de terceros sin autorización. El formulario está destinado a consultas profesionales sobre Horekia.</p><h2>Propiedad intelectual</h2><p>Los contenidos y elementos propios de esta web están protegidos por la normativa aplicable. Las marcas o referencias a terceros pertenecen a sus respectivos titulares. Para solicitar autorización de reutilización, contacta con el titular.</p><h2>Enlaces y disponibilidad</h2><p>Los enlaces a servicios externos o al backoffice conducen a entornos con sus propias condiciones de acceso. El sitio puede necesitar mantenimiento o actualizaciones; si detectas un problema, puedes comunicarlo a rafa@wad.cat.</p><h2>Datos personales y cookies</h2><p>Consulta la <a href="/privacidad/">política de privacidad</a> y la <a href="/cookies/">información sobre cookies</a>.</p>`,
  },
  privacidad: {
    title: "Política de privacidad",
    description:
      "Cómo se tratan los datos de las consultas y solicitudes de demostración enviadas a Horekia.",
    body: `<h2>Responsable del tratamiento</h2><p>Rafael Peña · NIF 43735032A.<br>C/ Ramon Soldevila, 2, 25003 Lleida, España.<br>Contacto: <a href="mailto:rafa@wad.cat">rafa@wad.cat</a>.</p><h2>Qué información se recoge</h2><p>El formulario recoge nombre, correo electrónico, empresa, teléfono opcional, tipo de empresa opcional y el mensaje que decidas enviar. Son necesarios el nombre, correo, empresa y mensaje para poder atender la solicitud. Evita incluir datos de salud, contraseñas o información personal de comensales.</p><h2>Finalidad y base jurídica</h2><p>Los datos se utilizan para responder a tu consulta, valorar el encaje de Horekia y preparar la demostración o las medidas precontractuales que solicites. La base es el interés legítimo en atender las consultas profesionales que nos diriges (artículo 6.1.f del RGPD). Cuando solicites medidas previas a un contrato del que vayas a ser parte, se aplicará el artículo 6.1.b del RGPD. El reconocimiento de lectura de esta política no supone una suscripción a comunicaciones comerciales.</p><h2>Dónde se guardan y quién puede acceder</h2><p>Las solicitudes se guardan en la base de datos del servicio y se consultan desde el backoffice mediante acceso administrativo autorizado. El formulario no envía su contenido a Gemini ni a otros modelos de inteligencia artificial. No se vende la información ni se utiliza para newsletters.</p><p>La infraestructura de alojamiento se presta mediante IONOS y la base de datos mediante Supabase. Estos proveedores intervienen para prestar el servicio técnico y están sujetos a sus condiciones y acuerdos de tratamiento aplicables. No se comparte el contenido con otros clientes de Horekia. Cualquier eventual transferencia internacional vinculada a la infraestructura deberá quedar amparada por las garantías previstas en el RGPD.</p><h2>Plazo de conservación</h2><p>Las solicitudes del formulario se conservan hasta 180 días desde su envío y después se eliminan de este registro mediante una tarea de mantenimiento. El acceso a las copias de seguridad queda restringido y su eliminación sigue el ciclo de retención de las copias. Si se inicia una relación contractual, la información necesaria para esa relación se gestionará con los plazos y obligaciones que correspondan.</p><h2>Derechos</h2><p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad, cuando procedan, escribiendo a <a href="mailto:rafa@wad.cat">rafa@wad.cat</a>. Facilita la información necesaria para identificar tu solicitud; solo se pedirá acreditación adicional si fuera necesaria. Puedes presentar una reclamación ante la <a href="https://www.aepd.es/" rel="noopener noreferrer">Agencia Española de Protección de Datos</a>.</p><h2>Seguridad y prevención de abuso</h2><p>La web utiliza HTTPS, validación de datos, una comprobación temporal del formulario y límites de solicitudes para reducir el envío automatizado. Los controles pueden utilizar temporalmente la dirección de conexión en memoria; esta no se añade a la ficha comercial. Los registros técnicos del alojamiento, si se habilitan, tienen fines de seguridad y mantenimiento.</p><h2>Decisiones automatizadas</h2><p>No se adoptan decisiones con efectos jurídicos ni se elaboran perfiles mediante inteligencia artificial a partir de este formulario.</p>`,
  },
  cookies: {
    title: "Información sobre cookies",
    description:
      "Información sobre cookies, almacenamiento local y servicios externos en la web pública de Horekia.",
    body: `<h2>Web pública</h2><p>Esta web no incorpora cookies de publicidad ni herramientas de analítica de terceros. No utiliza píxeles publicitarios, mapas incrustados, vídeos externos ni fuentes descargadas de otros proveedores. El formulario funciona sin iniciar sesión y sin guardar sus campos en el almacenamiento del navegador.</p><h2>Comprobación del formulario</h2><p>Al enviar una solicitud se obtiene un identificador temporal para la comprobación del envío. Se mantiene en memoria durante la operación y no se guarda como cookie ni en localStorage.</p><h2>Backoffice</h2><p>El enlace de acceso lleva a backoffice.horekia.com, un entorno privado independiente que utiliza una cookie de sesión para la autenticación y preferencias locales para algunas funciones de la interfaz. Su sesión no es necesaria para visitar esta web comercial.</p><h2>Configuración del navegador</h2><p>Puedes administrar las cookies y otros datos de los sitios desde las opciones de privacidad de tu navegador. Si en el futuro se incorporan tecnologías opcionales que requieran consentimiento, se informará antes de activarlas.</p><h2>Contacto</h2><p>Para consultas sobre privacidad, escribe a <a href="mailto:rafa@wad.cat">rafa@wad.cat</a>.</p>`,
  },
};
for (const [slug, page] of Object.entries(pages)) {
  await mkdir(dist + slug, { recursive: true });
  await writeFile(
    dist + slug + "/index.html",
    `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title} | Horekia</title><meta name="description" content="${page.description}"><meta name="robots" content="index, follow"><link rel="canonical" href="${origin}/${slug}/"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a><header class="site-header"><div class="container header-inner"><a class="wordmark" href="/">horekia<span aria-hidden="true">✳</span></a><a class="button button-small" href="/#contacto">Contactar ↗</a></div></header><main class="container legal-main" id="contenido"><a class="legal-back" href="/">← Volver a Horekia</a><h1>${page.title}</h1><p>Última actualización: 10 de noviembre de 2026.</p>${page.body}</main><footer class="site-footer"><div class="container footer-bottom"><span>© 2026 Horekia · Rafael Peña</span><div><a href="/aviso-legal/">Aviso legal</a><a href="/privacidad/">Privacidad</a><a href="/cookies/">Cookies</a></div></div></footer></body></html>`,
  );
}
await writeFile(
  dist + "robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
);
await writeFile(
  dist + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", ...Object.keys(pages).map((s) => s + "/")].map((path) => `<url><loc>${origin}/${path}</loc></url>`).join("")}</urlset>`,
);
await writeFile(
  dist + "404.html",
  `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada | Horekia</title><meta name="robots" content="noindex, follow"><link rel="stylesheet" href="/assets/site.css"><link rel="icon" href="/favicon.svg"></head><body><main class="container not-found"><a class="wordmark" href="/">horekia<span aria-hidden="true">✳</span></a><p>ERROR 404</p><h1>No encontramos esta página.</h1><p>La dirección puede haber cambiado. Vuelve al inicio para descubrir Horekia.</p><a class="button" href="/">Volver al inicio</a></main></body></html>`,
);
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f9f7f1"/><circle cx="1080" cy="320" r="270" fill="#e1e9d8"/><circle cx="1080" cy="320" r="210" fill="none" stroke="#bacdaf"/><text x="78" y="115" fill="#173f35" font-family="sans-serif" font-size="53" font-weight="700">horekia</text><text x="78" y="300" fill="#173f35" font-family="serif" font-size="91">IA que trabaja</text><text x="78" y="410" fill="#b95a38" font-family="serif" font-size="91" font-style="italic">con tu equipo.</text><text x="82" y="532" fill="#63736b" font-family="sans-serif" font-size="25">Inteligencia artificial aplicada a la gestión alimentaria B2B</text></svg>`;
await sharp(Buffer.from(og))
  .png()
  .toFile(dist + "og-horekia.png");
console.log(
  "Horekia public site built: index, legal pages, sitemap, robots, icons and social image.",
);

let index = await readFile(dist + "index.html", "utf8");
for (const extension of ["css", "js"]) {
  const content = await readFile(dist + "assets/site." + extension);
  const digest = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 12);
  const name = "site-" + digest + "." + extension;
  await writeFile(dist + "assets/" + name, content);
  index = index.replaceAll("/assets/site." + extension, "/assets/" + name);
  if (extension === "css")
    for (const slug of [...Object.keys(pages), ""]) {
      const path = slug ? dist + slug + "/index.html" : dist + "404.html";
      const page = await readFile(path, "utf8");
      await writeFile(
        path,
        page.replaceAll("/assets/site.css", "/assets/" + name),
      );
    }
  await rm(dist + "assets/site." + extension);
}
await writeFile(dist + "index.html", index);
