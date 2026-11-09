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
  "Connecting to Nexora…": "Conectando con Nexora…",
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
  "Welcome to Nexora": "Bienvenido a Nexora",
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
