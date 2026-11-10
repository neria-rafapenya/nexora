import type { Contract } from "../domain/core";
const messages: Record<string, string> = {
  "Main categories": "Categorías principales",
  "Main category": "Categoría principal",
  "main category": "categorías principales",
  Description: "Descripción",
  Families: "Familias",
  Products: "Productos",
  Allergens: "Alérgenos",
  Suppliers: "Proveedores",
  Clients: "Clientes",
  Centers: "Centros",
  Diets: "Dietas",
  "Center diners": "Comensales por centro",
  "Product allergens": "Alérgenos de productos",
  "Connecting to Nexora…": "Conectando con Horekia…",
  Overview: "Resumen",
  "MASTER DATA": "MAESTROS",
  OPERATIONS: "OPERACIONES",
  SYSTEM: "SISTEMA",
  "Users and roles": "Usuarios y roles",
  "Audit history": "Historial de cambios",
  Settings: "Configuración",
  "Sign out": "Cerrar sesión",
  Workspace: "Espacio de trabajo",
  "Active company": "Empresa activa",
  "Local API · Supabase": "Entorno local · Supabase",
  "Loading workspace…": "Cargando espacio de trabajo…",
  "· PLANNED": "· PREVISTO",
  "Ready for the next phase.": "Preparado para la siguiente fase.",
  "Operational workflows and AI proposals are not available yet. Build your master data first.":
    "Los flujos operativos y las propuestas de IA estarán disponibles en las próximas fases. Empieza por los maestros.",
  "Open products": "Ver productos",
  "Private workspace · PostgreSQL on Supabase · AI workflows pending":
    "Espacio privado · PostgreSQL en Supabase · Flujos de IA pendientes",
  "YOUR OPERATIONS, CONNECTED": "TUS OPERACIONES, CONECTADAS",
  "More clarity.": "Más claridad.",
  "Better decisions.": "Mejores decisiones.",
  "Your team, your data and your operations.":
    "Tu equipo, tus datos y tus operaciones.",
  "One private workspace to work better.":
    "Un espacio privado para trabajar mejor.",
  "AI proposes. Your team decides.": "La IA propone. Tu equipo decide.",
  "PRIVATE BACKOFFICE · HORECA & COLLECTIVE CATERING":
    "BACKOFFICE PRIVADO · HORECA Y COLECTIVIDADES",
  "LOCAL WORKSPACE · SUPABASE": "ENTORNO LOCAL · SUPABASE",
  "Set up your workspace": "Configura tu espacio de trabajo",
  "Welcome to Nexora": "Bienvenido a Horekia",
  "Create the first administrator. No demo accounts are created.":
    "Crea la primera cuenta de administración. No hay usuarios de ejemplo.",
  "Sign in with your workspace account.": "Accede con tu cuenta de trabajo.",
  "Retry connection": "Reintentar conexión",
  "Full name": "Nombre completo",
  "Company name": "Nombre de la empresa",
  Email: "Correo electrónico",
  Password: "Contraseña",
  "Use at least 12 characters. This account controls the private workspace.":
    "Usa al menos 12 caracteres. Esta cuenta administrará el espacio privado.",
  "Authenticator code (if enabled)":
    "Código de autenticación (si está activado)",
  "Please wait…": "Un momento…",
  "Create workspace": "Crear espacio de trabajo",
  "Sign in": "Entrar",
  "The catalog contains 10 fictional families and 200 fictional products. All other business masters start empty.":
    "El catálogo contiene 10 familias y 200 productos ficticios. El resto de maestros empieza vacío.",
  "Authenticated sessions are managed by the local API.":
    "El acceso se gestiona mediante el servicio local.",
  "YOUR OPERATIONS, IN PERSPECTIVE": "TU OPERATIVA, EN PERSPECTIVA",
  "Everything starts here.": "Todo empieza aquí.",
  "FOUNDATIONS & MASTER DATA": "CIMIENTOS Y MAESTROS",
  "A solid foundation.": "Una base sólida.",
  "Real data, connected.": "Tus datos, conectados.",
  "Manage your catalog and business records in one private space.":
    "Gestiona tu catálogo y tus datos de negocio en un espacio privado.",
  "Changes are saved in PostgreSQL and recorded in audit history.":
    "Los cambios se guardan en la base de datos y quedan registrados en el historial.",
  "Explore the catalog": "Explorar catálogo",
  "Master data": "Maestros",
  "Your active company": "Tu empresa activa",
  "Manage records": "Gestionar registros",
  "Upcoming operations": "Próximas operaciones",
  "Human approval at every critical step":
    "Aprobación humana en cada paso crítico",
  "· Planned": "· Previsto",
  "View module": "Ver módulo",
  "Linked record": "Registro relacionado",
  Yes: "Sí",
  "en-IE": "es-ES",
  "en-GB": "es-ES",
  "Changes are validated and saved to the active company.":
    "Los cambios se validarán y guardarán en la empresa activa.",
  "Back to list": "Volver al listado",
  "Select…": "Seleccionar…",
  "Sample ingredients and allergen information are unverified. Validation is managed separately by the Quality role.":
    "Los ingredientes y los alérgenos de los productos de ejemplo no están validados. Su validación corresponde al rol de Calidad.",
  Cancel: "Cancelar",
  "Saving…": "Guardando…",
  "Save record": "Guardar registro",
  "loading…": "cargando…",
  records: "registros",
  "Manage your company records.": "Gestiona los registros de tu empresa.",
  "Read-only access.": "Acceso de solo lectura.",
  Import: "Importar",
  Add: "Añadir",
  Search: "Buscar",
  "Filter by family": "Filtrar por familia",
  "All families": "Todas las familias",
  "Filter by temperature": "Filtrar por temperatura",
  "All temperatures": "Todas las temperaturas",
  "Refresh records": "Actualizar registros",
  "Loading records…": "Cargando registros…",
  Actions: "Acciones",
  Edit: "Editar",
  View: "Ver",
  "No matching records": "No hay coincidencias",
  "No records yet": "Todavía no hay registros",
  "Try a different search or filter.": "Prueba con otra búsqueda o filtro.",
  "This master is intentionally empty. Add your own records when ready.":
    "Este maestro está vacío. Añade tus propios registros cuando lo necesites.",
  "Delete this": "¿Eliminar este registro de",
  "This removes the record. Records used elsewhere cannot be deleted.":
    "Se eliminará el registro. Los registros utilizados por otros datos no se pueden eliminar.",
  "Delete record": "Eliminar registro",
  "CSV or XLSX · up to 1,000 rows · validate before saving. Use field keys as column headers. Relationships use record IDs.":
    "CSV o XLSX · hasta 1.000 filas · valida antes de guardar. Usa las claves de los campos como cabeceras y los identificadores para las relaciones.",
  "Fields:": "Campos:",
  "Import file": "Archivo de importación",
  "Maximum file size is 2 MB": "El archivo no puede superar los 2 MB",
  "CSV headers": "Cabeceras CSV",
  "Validate file": "Validar archivo",
  "Confirm import": "Confirmar importación",
  "Latest 200 events for the active company. Changes are recorded by the API.":
    "Últimos 200 eventos de la empresa activa. Los cambios quedan registrados por el servicio.",
  Action: "Acción",
  Resource: "Recurso",
  Actor: "Usuario",
  Time: "Fecha",
  Changes: "Cambios",
  "Catalog initialization": "Carga inicial del catálogo",
  Details: "Detalles",
  "Create real accounts with access to this company.":
    "Crea cuentas con acceso a esta empresa.",
  Name: "Nombre",
  Role: "Rol",
  "Role for ": "Rol de ",
  "Add user": "Añadir usuario",
  "Initial password": "Contraseña inicial",
  "Create user": "Crear usuario",
  "Workspace settings": "Configuración del espacio",
  "Company configuration and future AI limits.":
    "Configuración de la empresa y límites para los futuros servicios de IA.",
  "AI parameters": "Parámetros de IA",
  "Stored for future workflows. No AI service is connected yet.":
    "Se guardarán para los próximos flujos. Todavía no hay servicios de IA conectados.",
  "Settings saved.": "Configuración guardada.",
  "Review confidence threshold": "Umbral de confianza para revisión",
  "Daily AI budget (€)": "Presupuesto diario de IA (€)",
  "Save settings": "Guardar configuración",
  "Add company": "Añadir empresa",
  "New companies start with empty master data.":
    "Las nuevas empresas empiezan con los maestros vacíos.",
  "Company created. Select it in the workspace menu.":
    "Empresa creada. Selecciónala en el menú de empresas.",
  "Create company": "Crear empresa",
  "Two-factor authentication": "Autenticación de dos factores",
  "Enabled for your account. A current authenticator code is required at sign-in.":
    "Activada para tu cuenta. Necesitarás un código de tu aplicación de autenticación para entrar.",
  "Protect your account with a time-based authenticator code.":
    "Protege tu cuenta con códigos de una aplicación de autenticación.",
  "Set up authenticator": "Configurar autenticador",
  "Add a time-based account in your authenticator using this secret:":
    "Añade una cuenta basada en tiempo en tu aplicación de autenticación con esta clave:",
  "SHA-1 · 6 digits · 30-second interval. Keep this secret private.":
    "SHA-1 · 6 dígitos · intervalo de 30 segundos. Mantén esta clave en privado.",
  "Two-factor authentication enabled.":
    "Autenticación de dos factores activada.",
  "Current authenticator code": "Código actual del autenticador",
  "Verify and enable": "Verificar y activar",
  "Multichannel orders": "Pedidos multicanal",
  "Menu planning": "Planificación de menús",
  "Supplier documents": "Documentación de proveedores",
  "Food waste": "Desperdicio alimentario",
  "Review incoming orders and approve proposed product matches.":
    "Revisa pedidos entrantes y aprueba las asociaciones de productos propuestas.",
  "Plan weekly menus by center, diet and service.":
    "Planifica menús semanales por centro, dieta y servicio.",
  "Review technical sheets, changes and expiry dates.":
    "Revisa fichas técnicas, cambios y caducidades.",
  "Track losses, donations and prevention plans.":
    "Gestiona mermas, donaciones y planes de prevención.",
  family: "familias",
  product: "productos",
  allergen: "alérgenos",
  supplier: "proveedores",
  client: "clientes",
  center: "centros",
  diet: "dietas",
  "diner count": "comensales",
  "product allergen": "alérgenos de productos",
  Temperature: "Temperatura",
  Brand: "Marca",
  Family: "Familia",
  Supplier: "Proveedor",
  "Pack format": "Formato",
  "Sales unit": "Unidad de venta",
  "Net weight (g)": "Peso neto (g)",
  "Portions per unit": "Raciones por unidad",
  "List price (€)": "Precio de tarifa (€)",
  "Available stock": "Stock disponible",
  "Shelf life (days)": "Vida útil (días)",
  Ingredients: "Ingredientes",
  "Own brand": "Marca propia",
  "Gluten-free claim": "Declarado sin gluten",
  "Suitable for pureed diets": "Apto para dietas trituradas",
  Active: "Activo",
  "Allergen validation": "Validación de alérgenos",
  Code: "Código",
  "Tax ID": "NIF",
  "Quality email": "Correo de calidad",
  Phone: "Teléfono",
  "Approved until": "Homologado hasta",
  "ERP code": "Código ERP",
  Segment: "Segmento",
  "Order email": "Correo de pedidos",
  "WhatsApp number": "Número de WhatsApp",
  Client: "Cliente",
  Address: "Dirección",
  "Delivery window": "Franja de entrega",
  "Delivery days": "Días de reparto",
  Route: "Ruta",
  "Closure dates (YYYY-MM-DD, comma separated)":
    "Fechas de cierre (AAAA-MM-DD, separadas por comas)",
  "Excluded allergens": "Alérgenos excluidos",
  "Rules (JSON object)": "Reglas (objeto JSON)",
  Center: "Centro",
  Diet: "Dieta",
  Service: "Servicio",
  "Number of diners": "Número de comensales",
  Product: "Producto",
  Allergen: "Alérgeno",
  Presence: "Presencia",
  "Source document reference": "Referencia del documento de origen",
  "Validated by quality": "Validado por Calidad",
  Administrator: "Administración",
  "Order operations": "Operaciones de pedidos",
  Quality: "Calidad",
  Sales: "Comercial",
  "Read only": "Solo lectura",
};
export function textEs(value: string): string {
  return messages[value] ?? value;
}
export function localizeContract(contract: Contract): Contract {
  return {
    ...contract,
    roles: Object.fromEntries(
      Object.entries(contract.roles).map(([key, value]) => [
        key,
        textEs(value),
      ]),
    ),
    resources: Object.fromEntries(
      Object.entries(contract.resources).map(([key, r]) => [
        key,
        {
          ...r,
          label: textEs(r.label),
          singular: textEs(r.singular),
          fields: Object.fromEntries(
            Object.entries(r.fields).map(([field, f]) => [
              field,
              { ...f, label: textEs(f.label) },
            ]),
          ),
        },
      ]),
    ),
  };
}
export const enumLabels: Record<string, string> = {
  AMBIENT: "Ambiente",
  CHILLED: "Refrigerado",
  FROZEN: "Congelado",
  UNIT: "Unidad",
  KG: "kg",
  BOX: "Caja",
  L: "L",
  UNVERIFIED: "Sin validar",
  PENDING_REVIEW: "Pendiente de revisión",
  SCHOOL: "Colegio",
  CARE_HOME: "Residencia",
  HOSPITAL: "Hospital",
  HOTEL: "Hotel",
  RESTAURANT: "Restaurante",
  WORKPLACE: "Comedor de empresa",
  CATERING: "Catering",
  OTHER: "Otro",
  MON: "Lunes",
  TUE: "Martes",
  WED: "Miércoles",
  THU: "Jueves",
  FRI: "Viernes",
  SAT: "Sábado",
  SUN: "Domingo",
  BREAKFAST: "Desayuno",
  LUNCH: "Comida",
  SNACK: "Merienda",
  DINNER: "Cena",
  CONTAINS: "Contiene",
  TRACES: "Trazas",
  CREATE: "Alta",
  UPDATE: "Modificación",
  DELETE: "Eliminación",
  LOGIN: "Inicio de sesión",
  SETUP: "Configuración inicial",
  CREATE_COMPANY: "Alta de empresa",
  CREATE_USER: "Alta de usuario",
  UPDATE_SETTINGS: "Cambio de configuración",
  ENABLE_MFA: "Activación del segundo factor",
  CHANGE_ROLE: "Cambio de rol",
  REMOVE_USER_ACCESS: "Retirada de acceso",
};
export function enumEs(value: string) {
  return enumLabels[value] ?? value;
}

const errorMessages: Record<string, string> = {
  FILE_STORAGE_WRITE_FAILED:
    "No se ha podido guardar el archivo. Inténtalo de nuevo.",
  FILE_STORAGE_READ_FAILED:
    "No se puede recuperar el archivo. Contacta con administración.",
  FILE_STORAGE_CHECKSUM_MISMATCH:
    "No se ha podido verificar la integridad del archivo.",
  FILE_STORAGE_INVALID_CONTENT: "El contenido del archivo no es válido.",
  EMBEDDINGS_NOT_CONFIGURED: "La búsqueda semántica no está configurada.",
  EMBEDDINGS_DEMO_CONFIRMATION_REQUIRED:
    "Confirma que solo se usarán datos ficticios de la POC.",
  EMBEDDINGS_IN_PROGRESS:
    "Ya hay una solicitud en curso. Espera a que termine.",
  EMBEDDINGS_DAILY_LIMIT:
    "Se ha alcanzado el límite diario de solicitudes de búsqueda semántica.",
  EMBEDDINGS_RATE_LIMITED:
    "Google ha limitado las solicitudes. No se reintentará automáticamente.",
  EMBEDDINGS_UNAVAILABLE: "El servicio de embeddings no está disponible.",
  EMBEDDINGS_AUTH_FAILED:
    "La clave no permite acceder al servicio de embeddings.",
  EMBEDDINGS_MODEL_UNAVAILABLE: "El modelo de embeddings no está disponible.",
  EMBEDDINGS_TIMEOUT: "El servicio de embeddings ha tardado demasiado.",
  EMBEDDINGS_INVALID_OUTPUT: "El servicio ha devuelto un vector no válido.",
  EMBEDDINGS_PROCESSING_FAILED:
    "No se ha podido completar la solicitud de búsqueda semántica.",
  EMBEDDINGS_QUERY_REQUIRED:
    "Introduce una descripción de entre 2 y 300 caracteres.",
  EMBEDDINGS_INVALID_INPUT: "Revisa los datos de la consulta.",
  EMBEDDINGS_REQUEST_SUPERSEDED:
    "La solicitud ha caducado. Actualiza antes de continuar.",
  EMBEDDINGS_CATALOG_LIMIT:
    "El catálogo supera el máximo de 250 productos para esta POC.",
  EMBEDDINGS_DOCUMENT_TOO_LARGE:
    "La descripción de un producto es demasiado larga para indexarla.",
  GEMINI_DISABLED:
    "La conexión con Gemini está desactivada. Puedes usar la propuesta simulada.",
  GEMINI_KEY_MISSING: "Falta configurar la clave de Gemini en el servidor.",
  GEMINI_FREE_TIER_NOT_CONFIRMED:
    "El responsable debe confirmar que el proyecto de Gemini está en nivel gratuito.",
  GEMINI_MODEL_NOT_ALLOWED:
    "El modelo configurado no está habilitado para esta POC.",
  GEMINI_MODEL_UNAVAILABLE:
    "El modelo no está disponible para este proyecto. Revisa la configuración; no se cambiará a otro automáticamente.",
  GEMINI_DEMO_CONFIRMATION_REQUIRED:
    "Confirma que el texto contiene únicamente datos ficticios de la POC.",
  GEMINI_MESSAGE_NOT_READY:
    "Guarda una transcripción válida antes de interpretar el pedido.",
  GEMINI_DEMO_CATALOG_REQUIRED:
    "Esta integración requiere entre 1 y 250 productos activos del catálogo ficticio.",
  GEMINI_REQUEST_IN_PROGRESS:
    "Ya hay una interpretación en curso para esta entrada.",
  GEMINI_DAILY_LIMIT:
    "Se ha alcanzado el límite diario de solicitudes de esta empresa.",
  GEMINI_INPUT_TOO_LARGE:
    "El texto o catálogo supera el tamaño admitido para esta POC.",
  GEMINI_RATE_LIMITED:
    "Gemini ha agotado su cuota o límite de solicitudes. No se reintentará ni se activará pago automáticamente.",
  GEMINI_TIMEOUT:
    "Gemini no respondió a tiempo. La solicitud puede haber consumido cuota; compruébalo antes de reintentar.",
  GEMINI_UNAVAILABLE:
    "No se ha podido contactar con Gemini. La entrada se conserva para reintentar manualmente.",
  GEMINI_AUTH_FAILED:
    "Gemini no acepta la clave o permisos del proyecto configurado.",
  GEMINI_INVALID_OUTPUT:
    "La respuesta de Gemini no cumple las validaciones. No se ha creado el pedido.",
  GEMINI_INPUT_CHANGED:
    "La transcripción cambió durante la interpretación. Revísala y vuelve a solicitar la propuesta.",
  GEMINI_CATALOG_CHANGED:
    "El catálogo cambió durante la interpretación. Revisa los datos antes de reintentar.",
  GEMINI_REQUEST_SUPERSEDED:
    "Otra operación ha sustituido esta interpretación. Recarga la entrada.",
  GEMINI_PROCESSING_FAILED:
    "No se pudo guardar la interpretación. La entrada se conserva y no se aprobará ningún pedido.",

  "Waste observations require a valid non-future date":
    "La observación requiere una fecha válida que no sea futura.",
  "A service, source and data classification are required":
    "Indica servicio, referencia y si los datos son ficticios.",
  "Select a published menu matching center, service, date and diet":
    "Selecciona un menú publicado que corresponda a ese centro, fecha, servicio y dieta.",
  "Diet has no slot in the selected published menu":
    "La dieta no tiene una posición en ese menú publicado.",
  "A cause and positive measured quantity are required":
    "Indica una causa y una cantidad mayor que cero, con un máximo de tres decimales.",
  "Select exactly one waste source":
    "Selecciona un único producto o una única receta como origen.",
  "Product waste must use the catalog sales unit":
    "La cantidad del producto debe utilizar su unidad de venta del catálogo.",
  "Product is not in the selected menu context":
    "El producto no aparece en el contexto del menú publicado seleccionado.",
  "Recipe waste must use servings and one recipe version":
    "La merma de receta debe indicar una versión y medirse en raciones equivalentes.",
  "Recipe is not in the selected menu slot":
    "La receta no corresponde a la fecha, dieta y centro del menú seleccionado.",
  "Return or donation needs destination, batch and traceability":
    "Indica destinatario, lote y referencia de trazabilidad para devolución o posible donación.",
  "This waste cause cannot be proposed for donation":
    "Este flujo no admite propuestas de donación por caducidad, deterioro o restos de platos.",
  "Donation candidates require a non-expired use-by date":
    "Una posible donación requiere una fecha límite de uso no anterior a la observación.",
  "Served counts must be whole numbers and cannot exceed produced counts":
    "Las raciones deben ser enteras; las servidas no pueden superar las producidas.",
  "Menu serving counts are inconsistent":
    "Las raciones previstas en el menú no son coherentes.",
  "Recorded observations are immutable. Void and replace the record":
    "Una observación confirmada no se edita. Anúlala con un motivo y registra la corrección.",
  "Creation key was used with different data":
    "La solicitud de creación ya se utilizó con otros datos. Recarga el formulario.",
  "Confirm a draft observation before recording":
    "Confirma expresamente el borrador antes de registrar la observación.",
  "A service observation already exists. Void it before replacing":
    "Ya hay una observación confirmada para ese centro, fecha, servicio y dieta. Anúlala antes de sustituirla.",
  "Confirm the void and provide its reason":
    "Confirma la anulación e indica su motivo.",
  "Record the waste observation before processing its destination":
    "Registra primero la observación de merma antes de tramitar su destino.",
  "Only Quality can review waste destinations":
    "Solo Calidad puede revisar las devoluciones y posibles donaciones.",
  "Confirm the pending destination review and provide evidence":
    "Confirma la revisión del destino pendiente y aporta una referencia.",
  "The donation candidate is no longer eligible for review":
    "La posible donación ya no cumple las condiciones de fecha o causa de este flujo.",
  "Only an unfinished non-disposal destination can be changed with a reason":
    "Solo se puede cambiar a desecho un destino todavía no ejecutado, indicando el motivo.",
  "An authorized destination and execution evidence are required":
    "El destino debe estar autorizado y debe aportarse evidencia de su ejecución.",
  "Closed improvement actions cannot be edited":
    "Las acciones cerradas o canceladas conservan sus datos sin edición.",
  "Complete the improvement action details":
    "Completa título, centro, responsable, plazo, causa y plan de actuación.",
  "Link recorded waste from the same center":
    "Vincula únicamente mermas confirmadas del mismo centro.",
  "An open action and progress evidence are required":
    "Selecciona una acción abierta y aporta evidencia del progreso o cierre.",
  "Invalid waste report date range": "Revisa el período del informe.",
  "Invalid waste report filters": "Los filtros del informe no son válidos.",

  "Technical composition must match the selected document declaration":
    "La composición debe coincidir con la declaración del documento seleccionado.",
  "Product allergen associations differ from the selected document":
    "Los alérgenos del producto no coinciden con el documento seleccionado. Revisa su ficha sin sobrescribirla automáticamente.",
  "Product claims differ from the selected document":
    "Las declaraciones del producto no coinciden con el documento seleccionado. Revisa su ficha.",
  "Unknown document field": "El documento contiene un campo no reconocido.",
  "Select an active supplier": "Selecciona un proveedor activo.",
  "Technical documents need at least one product":
    "Vincula al menos un producto a la ficha técnica o declaración de alérgenos.",
  "Document products must belong to its supplier":
    "Los productos vinculados deben pertenecer al proveedor del documento.",
  "Document source and classification are required":
    "Indica la referencia y si el documento es ficticio.",
  "Invalid document validity dates":
    "Revisa las fechas de vigencia y caducidad.",
  "Archived documents cannot receive versions":
    "Un documento archivado no admite versiones nuevas.",
  "Certificates require an expiry date":
    "Los certificados requieren una fecha de caducidad.",
  "An allergen cannot be both contains and traces":
    "Un alérgeno no puede figurar a la vez como contenido y traza.",
  "Complete allergen declarations require both lists":
    "Completa las listas de contenidos y trazas, aunque alguna esté vacía.",
  "Document nutrition needs an explicit basis":
    "Indica si la información nutricional es por 100 g, 100 ml o unidad.",
  "This document version is already uploaded":
    "Ya existe esta versión con el mismo archivo y datos declarados.",
  "Text documents must be UTF-8":
    "Los documentos de texto deben utilizar UTF-8.",
  "Text document exceeds 20000 characters":
    "El documento de texto supera los 20.000 caracteres o contiene caracteres no válidos.",
  "A document file is required":
    "Selecciona un archivo original para la versión.",
  "Only Quality can review supplier documents":
    "Solo Calidad puede aprobar, rechazar o retirar documentación.",
  "Confirm the document changes and provide review evidence":
    "Confirma la revisión e indica la referencia y el motivo de la decisión.",
  "Document version does not belong to this document":
    "La versión no pertenece a este documento.",
  "Archived documents cannot be reviewed":
    "No se puede revisar un documento archivado.",
  "Document changes have changed. Reload before reviewing.":
    "Los cambios han variado. Recarga antes de revisar.",
  "Only approved document versions can be withdrawn":
    "Solo se puede retirar una versión aprobada.",
  "Only the pending latest version can be reviewed":
    "Solo se puede decidir sobre la última versión pendiente.",
  "Expired document versions cannot be approved":
    "No se puede aprobar una versión caducada.",
  "An archive reason is required": "Indica el motivo del archivo.",
  "Document is already archived": "El documento ya está archivado.",
  "Only Quality can archive approved documentation":
    "Solo Calidad puede archivar documentación con una versión aprobada.",
  "Select a current approved document linked to this product":
    "Selecciona una versión vigente, aprobada y vinculada a este producto y su proveedor actual.",

  "Only Nutrition can validate nutrition data":
    "Solo Nutrición puede validar los perfiles y reglas nutricionales.",
  "A nutrition source and data classification are required":
    "Indica la fuente y si los datos son ficticios.",
  "Provide all nutrient values, including explicit zeros":
    "Completa todos los valores nutricionales. Usa cero únicamente cuando esté documentado.",
  "Inconsistent nutrient values":
    "Los azúcares no pueden superar los hidratos ni las saturadas superar las grasas.",
  "Only Quality can validate technical information":
    "Solo Calidad puede registrar esta revisión técnica.",
  "Technical composition, source and classification are required":
    "Indica composición, referencia documental y si los datos son ficticios.",
  "Validate product allergen associations first":
    "Primero valida las asociaciones de alérgenos desde la ficha del producto.",
  "Resolve all menu import rows before saving":
    "Resuelve todas las filas antes de confirmar la importación.",
  "Menu import preview changed. Validate again.":
    "La vista previa ha cambiado. Vuelve a validar el archivo antes de guardar.",
  "Publish a fully reviewed current menu before creating orders":
    "Publica primero un menú con la revisión nutricional y técnica actual completa.",
  "Published source data changed. Create and approve a new menu revision":
    "Han cambiado los datos utilizados por el menú publicado. Crea y aprueba una nueva revisión antes de generar pedidos.",
  "Invalid procurement settings":
    "Revisa las elecciones de productos, entregas y existencias.",
  "Invalid procurement conversion":
    "Revisa producto, cantidad, referencia y duplicados de las equivalencias de compra.",
  "Invalid delivery allocation":
    "Revisa las fechas de consumo y entrega. La entrega debe ser anterior o igual al consumo.",
  "Duplicate delivery allocation":
    "Hay dos entregas configuradas para el mismo centro y fecha de consumo.",
  "Invalid declared inventory":
    "Revisa cantidades, centros, ingredientes, referencias y duplicados de las existencias declaradas.",
  "Invalid nutrient limits":
    "Revisa los mínimos y máximos por ración: deben ser positivos o cero y no contradecirse.",

  "Referenced ingredient units cannot be changed":
    "No puedes cambiar la unidad de un ingrediente que ya tiene recetas o equivalencias. Crea otro ingrediente.",
  "A positive pack conversion is required":
    "La equivalencia de compra debe ser mayor que cero.",
  "Select active ingredients and products":
    "Selecciona ingredientes y productos activos.",
  "Recipe servings must be a positive integer":
    "Indica un número entero de raciones mayor que cero.",
  "Recipes require 1 to 100 ingredients":
    "Añade entre 1 y 100 ingredientes a la receta.",
  "Invalid or duplicate recipe ingredient":
    "Revisa los ingredientes: deben estar activos, no repetirse y tener cantidades positivas.",
  "Invalid menu date range": "Revisa las fechas de inicio y fin del menú.",
  "Menu plans support up to 31 days":
    "Cada planificación admite un máximo de 31 días.",
  "Select an active client": "Selecciona un cliente activo.",
  "Select unique centers for the menu":
    "Selecciona al menos un centro, sin repetirlo.",
  "Recipe belongs to another client": "La receta pertenece a otro cliente.",
  "Duplicate menu slot":
    "Hay dos recetas para la misma fecha, dieta, posición y centro.",
  "Invalid diner overrides": "Revisa los ajustes de comensales por fecha.",
  "Duplicate diner override":
    "Hay dos ajustes para la misma fecha, centro y dieta.",
  "Client menus require a source reference":
    "Indica la referencia del menú aportado por el cliente.",
  "Published menus are immutable. Create a new revision.":
    "El menú publicado se conserva sin cambios. Crea una nueva revisión.",
  "Mock generation requires an empty menu":
    "La propuesta simulada requiere un menú vacío.",
  "Create at least one recipe before generating a proposal":
    "Crea al menos una receta antes de generar una propuesta.",
  "Only published menus can be archived":
    "Solo se pueden archivar menús publicados.",
  "Add recipes to the menu before review":
    "Añade recetas al menú antes de enviarlo a revisión.",
  "Submit the menu for review first": "Envía primero el menú a revisión.",
  "Current nutrition and quality approvals are required":
    "Nutrición y Calidad deben aprobar los datos actuales y resolver sus incidencias.",
  "Only the assigned specialist can approve this menu":
    "Solo el rol profesional correspondiente puede realizar esta aprobación.",
  "An approval reference is required":
    "Indica una referencia de la revisión profesional.",
  "Resolve menu technical issues before quality approval":
    "Resuelve las incidencias técnicas antes de la aprobación de Calidad.",
  "Resolve menu planning issues before approval":
    "Resuelve las incidencias de planificación antes de aprobar.",

  "Customer acceptance is required for the current revision":
    "El cliente debe aceptar la revisión actual antes de aprobarla.",
  "ERP delivery already exists. Commercial changes must be handled through the ERP.":
    "El pedido ya tiene un envío al ERP. Los cambios deben tramitarse con el ERP.",
  "Original submission has already been recorded; later changes require client acceptance":
    "La solicitud original ya está registrada. Los cambios posteriores requieren aceptación del cliente.",
  "The client decision belongs to an obsolete revision":
    "La respuesta corresponde a una revisión anterior. Recarga el pedido.",
  "Mock client decisions are disabled":
    "La simulación del cliente está desactivada.",
  "Order is not ready for internal approval":
    "El estado actual no permite aprobar internamente el pedido.",
  "Commercial terms changed. Save the review again":
    "Las condiciones comerciales han cambiado. Guarda de nuevo la revisión.",
  "Client acceptance cannot be requested in this state":
    "El estado actual no permite solicitar aceptación al cliente.",
  "ERP connector is not configured":
    "El conector ERP todavía no está configurado.",
  "An ERP attempt is already in progress":
    "Ya hay un envío en curso. Espera a que termine o reintenta tras dos minutos si quedó interrumpido.",
  "Only the approved and accepted revision can be queued for ERP":
    "Solo puede enviarse al ERP la revisión aprobada y aceptada por el cliente.",
  "Only approved orders can be exported":
    "Solo pueden exportarse pedidos aprobados internamente.",
  "A reason is required": "Indica el motivo para continuar.",
  "A source reference is required to record the client submission":
    "Indica una referencia de la solicitud original del cliente.",
  "A decision and its reference are required":
    "Indica la decisión y su referencia.",

  "Order amount exceeds supported limits":
    "El importe supera los límites admitidos. Revisa cantidades y precios.",
  "Center does not belong to the selected client":
    "El centro no pertenece al cliente seleccionado.",
  "Invalid message": "La entrada de pedido no es válida.",
  "Unknown message field": "La entrada contiene campos no admitidos.",
  "Message text or an attachment is required":
    "Introduce el texto del pedido o adjunta un documento.",
  "This message has already been received":
    "Esta entrada ya existe. Consulta la bandeja para evitar duplicados.",
  "Processed messages cannot be discarded":
    "Los mensajes procesados no se pueden descartar.",
  "Unknown order field": "El pedido contiene campos no admitidos.",
  "This message cannot be processed":
    "Esta entrada no se puede procesar en su estado actual.",
  "Provide a text transcription before mock processing":
    "Añade y guarda una transcripción antes de generar la propuesta simulada.",
  "Provide between 1 and 200 order lines":
    "Introduce entre 1 y 200 líneas de pedido.",
  "Only draft or review orders can be edited":
    "Solo se pueden editar pedidos en borrador o en revisión.",
  "Maximum 200 order lines": "Un pedido admite como máximo 200 líneas.",
  "Invalid order line": "Una línea del pedido no es válida.",
  "Quantity must be a non-negative number with at most three decimals":
    "La cantidad debe ser un número igual o mayor que cero, con hasta tres decimales.",
  "Invalid sales unit": "La unidad de venta no es válida.",
  "Line does not belong to this order": "La línea no pertenece a este pedido.",
  "Duplicate order line": "El pedido contiene una línea duplicada.",
  "Product does not belong to this company":
    "El producto no pertenece a esta empresa.",
  "Human review is required":
    "La acción requiere una revisión humana autenticada.",
  "Order cannot be confirmed in its current state":
    "El pedido no se puede confirmar en su estado actual.",
  "Select a client and center before confirming":
    "Selecciona un cliente y un centro antes de confirmar.",
  "Inactive clients cannot place confirmed orders":
    "No se pueden confirmar pedidos de clientes inactivos.",
  "A valid delivery date is required": "Indica una fecha de entrega válida.",
  "Delivery date cannot be in the past":
    "La fecha de entrega no puede ser anterior a hoy.",
  "Delivery date does not match the center schedule":
    "La fecha de entrega está fuera del calendario de reparto o coincide con un cierre del centro.",
  "At least one order line is required":
    "El pedido necesita al menos una línea.",
  "Review every line and resolve product, quantity, unit and stock issues":
    "Revisa todas las líneas y resuelve los problemas de producto, cantidad, unidad o stock antes de confirmar.",
  "A product price is missing": "Falta el precio de uno de los productos.",
  "Catalog prices changed. Save the review again":
    "Han cambiado los precios del catálogo. Guarda de nuevo la revisión antes de confirmar.",
  "Insufficient stock across duplicate product lines":
    "La suma de las líneas del mismo producto supera el stock disponible.",
  "Order cannot be cancelled in its current state":
    "El pedido no se puede cancelar en su estado actual.",
  "Only confirmed orders can be exported":
    "Solo se pueden exportar pedidos confirmados o ya exportados.",
  "Invalid export format": "El formato de exportación no es válido.",
  "Invalid alert state": "El estado de la alerta no es válido.",
  "Only unprocessed messages can be edited":
    "Solo se puede modificar la transcripción de entradas sin procesar.",
  "Message text is required": "Introduce el texto del pedido.",
  "Invalid attachment": "El adjunto no es válido.",
  "Only PDF, PNG and JPEG attachments are supported":
    "Solo se admiten adjuntos PDF, PNG y JPEG.",
  "Attachment maximum size is 1.5 MB": "El adjunto no puede superar 1,5 MB.",
  "Invalid PDF file": "El archivo no es un PDF válido.",
  "Invalid PNG file": "El archivo no es una imagen PNG válida.",
  "Invalid JPEG file": "El archivo no es una imagen JPEG válida.",
  "Maximum 20 PDF pages": "El PDF no puede superar las 20 páginas.",
  "PDF text exceeds 20000 characters":
    "El texto del PDF supera los 20.000 caracteres.",
  "Invalid price": "El precio no es válido.",
  "A valid email is required": "Introduce un correo electrónico válido.",
  "Name is required": "El nombre es obligatorio.",
  "Password must have 12–128 characters":
    "La contraseña debe tener entre 12 y 128 caracteres.",
  "Invalid host": "El servidor no está autorizado.",
  "Not found": "No se ha encontrado el recurso.",
  "Invalid request origin": "El origen de la solicitud no está autorizado.",
  "Request too large": "La solicitud supera el tamaño permitido.",
  "Invalid JSON": "El contenido JSON no es válido.",
  "Expected a JSON object": "Se esperaba un objeto JSON.",
  "Setup is already complete": "La configuración inicial ya está completada.",
  "Invalid company name": "El nombre de la empresa no es válido.",
  "Too many attempts. Try again in 15 minutes":
    "Demasiados intentos. Vuelve a intentarlo en 15 minutos.",
  "Invalid credentials": "Los datos de acceso no son válidos.",
  "Invalid email or password": "El correo o la contraseña no son correctos.",
  "A valid authenticator code is required":
    "Introduce un código válido del autenticador.",
  "Authenticator code was already used":
    "Este código de autenticación ya se ha utilizado.",
  "Sign in required": "Inicia sesión para continuar.",
  "Two-factor authentication is already enabled":
    "La autenticación de dos factores ya está activada.",
  "Invalid authenticator code": "El código del autenticador no es válido.",
  "Administrator access required": "Se requieren permisos de administración.",
  "Company name is required": "El nombre de la empresa es obligatorio.",
  "Company access denied": "No tienes acceso a esta empresa.",
  "Invalid role": "El rol no es válido.",
  "Email already exists; use a different account":
    "El correo ya existe. Usa otra cuenta.",
  "User not found": "No se ha encontrado el usuario.",
  "You cannot change your own access": "No puedes modificar tu propio acceso.",
  "Invalid settings": "La configuración no es válida.",
  "Write access denied": "No tienes permisos para modificar estos datos.",
  "Only the quality role can validate allergens":
    "Solo el rol de Calidad puede validar alérgenos.",
  "Unknown resource": "El recurso no existe.",
  "Access denied": "No tienes permisos para esta acción.",
  "Record not found": "No se ha encontrado el registro.",
  "Endpoint not found": "La operación solicitada no existe.",
  "Database operation failed":
    "No se ha podido completar la operación en la base de datos.",
  "A unique value already exists": "Ya existe un registro con ese valor único.",
  "A record cannot reference itself":
    "Un registro no puede relacionarse consigo mismo.",
  "Allergen already linked to this product":
    "El alérgeno ya está asociado a este producto.",
  "Family hierarchy cannot contain a cycle":
    "La jerarquía de familias no puede contener ciclos.",
  "Record changed. Reload before saving.":
    "El registro ha cambiado. Recárgalo antes de guardar.",
  "Record changed. Reload before deleting.":
    "El registro ha cambiado. Recárgalo antes de eliminarlo.",
  "File too large": "El archivo supera el tamaño permitido.",
  "Invalid CSV quotes": "Las comillas del CSV no son válidas.",
  "Unclosed CSV quote": "Hay comillas sin cerrar en el CSV.",
  "File must have a header and at least one record":
    "El archivo debe tener cabeceras y al menos un registro.",
  "Maximum 1,000 records per import":
    "Se permiten como máximo 1.000 registros por importación.",
  "Duplicate headers": "El archivo contiene cabeceras duplicadas.",
  "Invalid resource": "El recurso no es válido.",
  "Invalid workbook": "El archivo Excel no es válido.",
  "Invalid workbook size": "El tamaño del archivo Excel no es válido.",
  "Workbook is empty": "El archivo Excel está vacío.",
  "Expected CSV or XLSX": "Selecciona un archivo CSV o XLSX.",
  "Use plain values; formulas and rich cells are not supported":
    "Usa valores simples; no se admiten fórmulas ni celdas enriquecidas.",
  "Duplicate unique value": "Hay valores únicos duplicados.",
  "Invalid closure date": "Una fecha de cierre no es válida.",
  "Invalid email": "El correo electrónico no es válido.",
  "Diner count already exists for this center, diet and service":
    "Ya existe un recuento para este centro, dieta y servicio.",
};
export function errorEs(message: string): string {
  if (errorMessages[message]) return errorMessages[message];
  const row = message.match(/^Row (\d+): (.*)$/);
  if (row) return `Fila ${row[1]}: ${errorEs(row[2])}`;
  const required = message.match(/^(.*) is required$/);
  if (required) return `${textEs(required[1])}: campo obligatorio.`;
  const numeric = message.match(
    /^(.*) must be a valid non-negative (integer|number)$/,
  );
  if (numeric)
    return `${textEs(numeric[1])}: introduce un número ${numeric[2] === "integer" ? "entero " : ""}igual o mayor que cero.`;
  const typed = message.match(
    /^(.*) must be (true or false|an object|a list)$/,
  );
  if (typed)
    return `${textEs(typed[1])}: el valor debe ser ${typed[2] === "true or false" ? "sí o no" : typed[2] === "an object" ? "un objeto" : "una lista"}.`;
  const invalid = message.match(/^Invalid (.*)$/);
  if (invalid) return `${textEs(invalid[1])}: valor no válido.`;
  const duplicate = message.match(/^(.*) already exists$/);
  if (duplicate)
    return `Ya existe un registro con ese valor de ${textEs(duplicate[1])}.`;
  const used = message.match(/^Cannot delete: referenced by (.*)$/i);
  if (used)
    return `No se puede eliminar: hay registros relacionados en ${textEs(used[1].charAt(0).toUpperCase() + used[1].slice(1)).toLowerCase()}.`;
  const ref = message.match(
    /^Invalid (.*): record does not exist in this company$/,
  );
  if (ref) return `${textEs(ref[1])}: el registro no existe en esta empresa.`;
  const unknown = message.match(
    /^(Unknown field|Unknown column|Invalid boolean): (.*)$/,
  );
  if (unknown)
    return `${unknown[1] === "Invalid boolean" ? "Valor booleano no válido" : "Campo no reconocido"}: ${unknown[2]}.`;
  if (message === "wrong column count")
    return "El número de columnas no coincide con las cabeceras.";
  return "No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.";
}
