const form = document.querySelector("#contact-form");
if (form) {
  const status = document.querySelector("#contact-status");
  const submit = document.querySelector("#contact-submit");
  submit.disabled = false;
  let busy = false;
  const notify = (message, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
    status.setAttribute("role", error ? "alert" : "status");
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    submit.disabled = true;
    submit.textContent = "Enviando…";
    notify("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const fields = new FormData(form);
      const tokenResponse = await fetch("/api/public/contact-token", {
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok)
        throw new Error(
          tokenData.error ||
            "No podemos preparar el formulario. Inténtalo de nuevo en unos minutos.",
        );
      const response = await fetch("/api/public/contact", {
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          email: fields.get("email"),
          company: fields.get("company"),
          phone: "",
          sector: "",
          centerCount: Number(fields.get("centerCount")),
          message: fields.get("message"),
          website: fields.get("website"),
          privacyAcknowledged: fields.get("privacyAcknowledged") === "on",
          token: tokenData.token,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "No se ha podido enviar tu solicitud. Inténtalo de nuevo.",
        );
      form.reset();
      notify(
        "Gracias. Tu solicitud se ha guardado correctamente. Te contactaremos por los datos que has facilitado.",
      );
    } catch (error) {
      notify(
        error.name === "AbortError"
          ? "La respuesta está tardando más de lo esperado. Puede que la solicitud se haya recibido; escríbenos a rafa@wad.cat si necesitas confirmarlo."
          : error instanceof TypeError
            ? "No hay conexión con el servicio. Revisa tu conexión o escríbenos a rafa@wad.cat."
            : error.message,
        true,
      );
    } finally {
      clearTimeout(timeout);
      busy = false;
      submit.disabled = false;
      submit.textContent = "Enviar mi solicitud ↗";
    }
  });
}
