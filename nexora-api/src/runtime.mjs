export function runtimeOptions(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const allowedOrigins = (
    env.ALLOWED_ORIGINS ??
    "http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5181"
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    !allowedOrigins.length ||
    allowedOrigins.some((x) => {
      try {
        const u = new URL(x);
        return !["https:", "http:"].includes(u.protocol) || u.origin !== x;
      } catch {
        return true;
      }
    })
  )
    throw new Error("Invalid ALLOWED_ORIGINS");
  return { port, secure: env.COOKIE_SECURE === "true", allowedOrigins };
}
