# Nexora · F0

Backoffice local para distribución HORECA y colectividades. Aplicación: `nexora-backoffice`.

## Arranque

Requiere Node.js 22.12 o superior y npm.

```sh
cd nexora-backoffice
npm ci
npm run dev
```

Abrir http://127.0.0.1:5173. Elegir un perfil de demostración y pulsar **Entrar en la demo**. La empresa se cambia desde el selector superior. El botón inferior de la barra lateral cierra la sesión.

```sh
npm test
npm run build
npm run preview
```

## Decisiones aplicadas

React, Vite, TypeScript, SCSS y Bootstrap exclusivamente para la cuadrícula. Diseño minimalista, multiempresa desde el inicio y funcionamiento local. La referencia funcional es el documento POC Backoffice IA Pedial. La interfaz privada se construye exclusivamente con React + Vite; las elecciones de infraestructura del documento original no se consideran decisiones aprobadas para Nexora. El servicio de API, la base de datos y las tareas de IA quedan pendientes de definir y conectar.

## Arquitectura hexagonal

- `src/domain`: empresas, perfiles, permisos y puertos de autenticación y actividad.
- `src/application`: selección autorizada de empresa y registro de navegación.
- `src/infrastructure`: adaptadores de demostración y almacenamiento local.
- `src/presentation`: interfaz React y estilos SCSS.

El dominio no depende de React ni del navegador. Para añadir identidad corporativa o Cognito se sustituirá `AuthPort`; para una API se incorporarán adaptadores de datos. No se incluyen secretos ni variables con credenciales.

## Alcance F0 entregado

- Acceso explícito de demostración, cierre de sesión y cuatro perfiles.
- Resumen, navegación de módulos, selector de dos empresas demo.
- Restricción de configuración a administración, también en el caso de uso.
- Actividad de navegación por empresa en localStorage, limitada a 250 entradas globales.
- Estructura de los módulos de pedidos, menús, proveedores y desperdicio; sin flujos operativos todavía.
- CI con pruebas y compilación en cada push/PR; se ejecutará cuando el código se publique en GitHub.

## Límites y siguientes fases

El acceso demo no autentica identidades y los permisos del navegador no constituyen seguridad de servidor. La actividad local es manipulable, no una auditoría de seguridad. Ambos adaptadores deben sustituirse antes de usar datos reales. No hay backend, llamadas de IA, importaciones ni datos comerciales. Los perfiles salvo administración comparten navegación en F0; los permisos finos se implementarán con cada flujo.

La sesión vive en memoria y se pierde al recargar. La actividad persiste solo en este navegador; puede eliminarse borrando `nexora.audit.v1` del almacenamiento local. No se usan servicios externos en ejecución.

F1: maestros e importación; F2: pedidos; F3: menús; F4: proveedores; F5: desperdicio. La IA propone y una persona aprueba. No se calculan ni validan alérgenos en esta fase.

Infraestructura remota, Terraform, Supabase, Docker, 2FA y despliegue se difieren por la decisión de comenzar con frontend local. El código está publicado en GitHub; no hay despliegue remoto de la aplicación.

## Verificación

Cuatro pruebas de dominio/aplicación superadas y compilación de producción correcta. Dependencias actualizadas tras revisión: 0 vulnerabilidades reportadas por npm en la instalación final.

Demo de esta sesión: http://127.0.0.1:5180 (servidor local). Se ha verificado en navegador el acceso demo, la navegación de pedidos, el registro de actividad y el cambio de empresa.
