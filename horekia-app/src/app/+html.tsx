import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#173f35" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Horekia · Mi centro</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
