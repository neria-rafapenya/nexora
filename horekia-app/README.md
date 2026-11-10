# Horekia · aplicación del comprador

Expo SDK 58 + React Native + Expo Router. Desarrollo orientado primero a web; componentes compartidos con futuras apps móviles. Node 22.13+ (usar 22 LTS).

## Arranque

`npm ci` dentro de esta carpeta. Desde la raíz: `npm run dev:app`.
Web local: http://localhost:5183. `npm run build:app` exporta la web; `npm run typecheck` y `npm run lint` comprueban la app.

## Primera entrega

Rutas: `/`, `/catalog`, `/catalog/:id`, `/orders/new`, `/orders`, `/orders/:id`, `/assistant`, `/profile`.
Catálogo con filtros y búsqueda, ficha, cesta con cantidades, validación de fecha y registro de pedidos de demostración. El asistente muestra un escenario fijo identificado como tal; no llama a Gemini. Datos y precios ficticios. La cesta y los pedidos permanecen en memoria y se pierden al recargar, deliberadamente; nunca se presentan como pedidos reales.

## Conexión pendiente

Destino: app.horekia.com. No se ha publicado ni habilitado acceso de clientes todavía. La POC se prueba en localhost; las futuras llamadas deben usar la API remota, nunca una conexión directa desde Expo a Supabase o Gemini. `.env.example` documenta únicamente la URL pública prevista y no es una conexión activa.

Antes de conectar datos reales: autenticación de comprador, asociación administrada a cliente y centros, comprobaciones de alcance en servidor para cada lectura/escritura, API específica de comprador, catálogo autorizado, persistencia de pedidos y encaje con aprobación interna/ERP. No reutilizar el permiso amplio del backoffice ni sus rutas de maestros desde la app.

El campo `profileType` del usuario (`INTERNAL_TEAM`, `CENTER_BUYER`) es metadato de experiencia, administrado por un administrador. No concede permisos ni sustituye las asociaciones de acceso. Los usuarios existentes conservan `INTERNAL_TEAM`.
