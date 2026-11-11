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

## Selector real de centros de la demo

`npm run dev:app` desde la raíz arranca Expo (5183) y un puente de lectura local (5184), enlazado exclusivamente a 127.0.0.1. Este último lee los centros ficticios de `workspace` en Supabase utilizando el `.env` privado de `nexora-api`, acepta únicamente los orígenes de Expo locales y no expone credenciales ni escrituras. No desplegar este puente en Internet: el acceso remoto de compradores sigue requiriendo autenticación y autorizaciones por centro.

El selector carga los mismos registros que el backoffice al abrir/recargar la app. Las cestas se mantienen separadas por ID de centro; cada pedido de prueba conserva su centro y los listados/detalles respetan la selección activa. Los pedidos siguen siendo de demostración en memoria.

La demo conserva tres centros existentes (Northfield School, Silverwood Care y Riverside Hospital, Site 1). La reducción se aplica explícitamente con `reduce-demo-centers.mjs`, nunca durante el arranque, y exige copia privada de recuperación antes de borrar. No ejecutar el seed amplio de maestros para esta demo, porque volvería a crear centros adicionales.

## Acceso real (segundo bloque)

En la cabecera, **Iniciar sesión** usa la cuenta existente y el autenticador cuando corresponde. Una cuenta con rol de administrador ve todos los centros de su empresa; el resto solo los asignados desde el backoffice. El catálogo autenticado se consulta en el servicio remoto; la app no usa credenciales de Supabase ni claves de Gemini. La sesión usa una cookie HttpOnly, no localStorage.

La demo y el modo autenticado están distinguidos. En ambos, la creación de pedidos sigue siendo una prueba en memoria; el asistente sigue siendo un ejemplo preparado. El dominio `app.horekia.com` todavía no se publica; se mantiene la revisión en localhost.
