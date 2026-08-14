/**
 * Bot de WhatsApp para presupuestos de eventos/catering de alta gama.
 *
 * Libreria: whatsapp-web.js
 *
 * Instalacion sugerida:
 *   npm init -y
 *   npm install whatsapp-web.js qrcode-terminal
 *
 * Ejecucion:
 *   node whatsapp-catering-bot.js
 *
 * Al iniciar, escanee el QR en la terminal con WhatsApp.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const {
  buildAttendanceShiftsFromBiometricEvents,
  createZktecoService,
  ensureZktecoSchema,
  handleBiometricSyncRequest,
  loadZktecoConfig,
} = require("./lib/zkteco-adms");
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  console.warn("SQLite no disponible. Las compras seguiran usando JSON.");
}
let XLSX = null;
try {
  XLSX = require("xlsx");
} catch (error) {
  console.warn("Modulo xlsx no instalado. La exportacion Excel queda deshabilitada.");
}
const { recognize } = require("tesseract.js");

console.log("Iniciando bot de WhatsApp...");

patchWhatsappClientInjection();

const BOT_CONFIG = loadBotConfig();
const DEFAULT_CONFIG_LISTS = {
  purchaseFundsSources: ["Gustavo", "Eugenia"],
};
const BOT_MESSAGES = loadBotMessages();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Coordenadas del salón Guaymallén — usadas para geofencing de stock/inventario
const SALON_LAT = -32.925679;
const SALON_LNG = -68.802341;
const SALON_RADIUS_METERS = 300; // radio permitido en metros
const DATA_DIR = path.resolve(process.env.DATA_DIR || BOT_CONFIG.dataDir || __dirname);
const CONFIG_FILE = path.resolve(process.env.BOT_CONFIG_FILE || path.join(__dirname, "config-bot.json"));
const STATE_FILE = dataPath("bot-state.json");
const CUSTOMERS_FILE = dataPath("clientes-bot.json");
const RECIPES_FILE = dataPath("recetas-bot.json");
const PENDING_RECIPE_EDITS_FILE = dataPath("recetas-pendientes-revision.json");
const PRODUCT_PRICES_FILE = dataPath("precios-productos-bot.json");
const COST_SETTINGS_FILE = dataPath("costos-bot.json");
const ERP_EVENTS_FILE = dataPath("eventos-erp.json");
const ERP_QUOTES_FILE = dataPath("presupuestos-erp.json");
const ERP_PURCHASES_FILE = dataPath("compras-erp.json");
const ERP_PURCHASE_ORDERS_FILE = dataPath("ordenes-compra-erp.json");
const ERP_PURCHASE_RECEIPTS_FILE = dataPath("recepciones-compra-erp.json");
const ERP_INVENTORY_FILE = dataPath("inventario-erp.json");
const ERP_OPERATIONAL_INVENTORY_FILE = dataPath("inventario-operativo-erp.json");
const ERP_PROVIDERS_FILE = dataPath("proveedores-erp.json");
const ERP_VENUES_FILE = dataPath("lugares-erp.json");
const ERP_HR_STAFF_FILE = dataPath("personal-erp.json");
const ERP_HR_SHIFTS_FILE = dataPath("asistencias-personal-erp.json");
const ERP_PAYROLL_FILE = dataPath("sueldos-erp.json");
const ERP_SANITATION_FILE = dataPath("bromatologia-erp.json");
const ERP_PAYMENT_ORDERS_FILE = dataPath("ordenes-pago-erp.json");
const ERP_USERS_FILE = dataPath("usuarios-erp.json");
const ERP_AUDIT_FILE = dataPath("historial-erp.json");
const ERP_ROLES_FILE = dataPath("roles-erp.json");
const ERP_INVENTARIO_SESION_FILE = dataPath("inventario-sesion.json");
const ERP_CONFORMITIES_DIR = dataPath("conformidades-eventos");
const CATERING_DB_FILE = dataPath(process.env.CATERING_DB_FILE || BOT_CONFIG.cateringDbFile || "catering.db");
const ZKTECO_CONFIG = loadZktecoConfig(process.env, {
  botConfig: BOT_CONFIG,
  dataDir: DATA_DIR,
  dbFileName: process.env.CATERING_DB_FILE || BOT_CONFIG.cateringDbFile || "catering.db",
  baseDir: __dirname,
});
const CATERING_BACKUP_DIR = path.resolve(
  process.env.CATERING_BACKUP_DIR ||
  BOT_CONFIG.cateringBackupDir ||
  path.join(DATA_DIR, "backups")
);
const CATERING_DB_BACKUP_INTERVAL_MS = Number(
  process.env.CATERING_DB_BACKUP_INTERVAL_MS ||
  BOT_CONFIG.cateringDbBackupIntervalMs ||
  6 * 60 * 60 * 1000
);
const PANEL_AUTH_USER = process.env.PANEL_AUTH_USER || BOT_CONFIG.panelAuthUser || "admin";
const PANEL_AUTH_PASSWORD = process.env.PANEL_AUTH_PASSWORD || BOT_CONFIG.panelAuthPassword || "";
const PURCHASE_SYNC_TOKEN = process.env.PURCHASE_SYNC_TOKEN || BOT_CONFIG.purchaseSyncToken || "";
const COMANDAS_SYNC_TOKEN = process.env.COMANDAS_SYNC_TOKEN || BOT_CONFIG.comandasSyncToken || "";
const ACCOUNTANT_PAYMENTS_WEBHOOK_URL =
  process.env.ACCOUNTANT_PAYMENTS_WEBHOOK_URL || BOT_CONFIG.accountantPaymentsWebhookUrl || "";
const ACCOUNTANT_PAYMENTS_TOKEN =
  process.env.ACCOUNTANT_PAYMENTS_TOKEN || BOT_CONFIG.accountantPaymentsToken || PURCHASE_SYNC_TOKEN || "";
const PURCHASE_SHEETS_SYNC_ENABLED = parseBooleanLike(
  process.env.PURCHASE_SHEETS_SYNC_ENABLED ?? BOT_CONFIG.purchaseSheetsSyncEnabled ?? false
);
const ACCOUNTANT_SHEETS_SYNC_ENABLED = parseBooleanLike(
  process.env.ACCOUNTANT_SHEETS_SYNC_ENABLED ?? BOT_CONFIG.accountantSheetsSyncEnabled ?? false
);
const PURCHASE_BIDIRECTIONAL_SYNC_ENABLED =
  String(process.env.PURCHASE_BIDIRECTIONAL_SYNC_ENABLED || BOT_CONFIG.purchaseBidirectionalSyncEnabled || "").toLowerCase() === "true";
const PANEL_SESSION_SECRET =
  process.env.PANEL_SESSION_SECRET ||
  BOT_CONFIG.panelSessionSecret ||
  crypto.createHash("sha256").update(`${PANEL_AUTH_USER}:${PANEL_AUTH_PASSWORD || "local"}`).digest("hex");
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || BOT_CONFIG.maxJsonBodyBytes || 60 * 1024 * 1024);
const SERVER_STARTED_AT = new Date();
const SERVER_REQUEST_METRICS = {
  total: 0,
  byStatus: {},
  byRoute: {},
  recent: [],
};
const LOGIN_ATTEMPTS = new Map();
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_MAX = 8;
const DEFAULT_CHROME_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEFAULT_CHROME_VERSION = "148.0.7778.217";
const WHATSAPP_WEB_VERSION =
  process.env.WHATSAPP_WEB_VERSION ||
  BOT_CONFIG.whatsappWebVersion ||
  getLatestCachedWhatsAppWebVersion();
const WHATSAPP_CLIENT_ID =
  process.env.WHATSAPP_CLIENT_ID || BOT_CONFIG.whatsappClientId || "catering-luxury-bot";
const WHATSAPP_AUTH_DIR = path.join(__dirname, ".wwebjs_auth", `session-${WHATSAPP_CLIENT_ID}`);
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE ||
  BOT_CONFIG.chromeExecutablePath ||
  findChromeExecutable();
const CHROME_USER_AGENT =
  process.env.WHATSAPP_CHROME_USER_AGENT ||
  BOT_CONFIG.whatsappChromeUserAgent ||
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${DEFAULT_CHROME_VERSION} Safari/537.36`;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: WHATSAPP_CLIENT_ID,
  }),
  webVersion: WHATSAPP_WEB_VERSION,
  webVersionCache: {
    type: "local",
    path: path.join(__dirname, ".wwebjs_cache"),
  },
  userAgent: CHROME_USER_AGENT,
  authTimeoutMs: Number(process.env.WHATSAPP_AUTH_TIMEOUT_MS || 90000),
  takeoverOnConflict: true,
  takeoverTimeoutMs: 5000,
  puppeteer: {
    headless: true,
    executablePath: CHROME_EXECUTABLE,
    protocolTimeout: Number(process.env.WHATSAPP_PROTOCOL_TIMEOUT_MS || 180000),
    timeout: Number(process.env.WHATSAPP_BROWSER_TIMEOUT_MS || 120000),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter",
      "--remote-debugging-port=0",
    ],
  },
});

/**
 * Estado temporal por numero de telefono.
 *
 * Estructura:
 * sessions[phone] = {
 *   step: 0,
 *   data: {
 *     fullName: "",
 *     eventType: "",
 *     eventDate: "",
 *     guestCount: 0,
 *     venue: "",
 *     serviceType: "",
 *     dietaryRestrictions: ""
 *   }
 * }
 */
const sessions = {};
const pendingReplies = {};
const chatRecords = {};
const customerRecords = {};
let recipeRecords = [];
let pendingRecipeEdits = [];
const productPriceRecords = {};
let costSettings = {};
let erpEvents = [];
let erpQuotes = [];
let erpPurchases = [];

/* ---- cache de corto plazo para computos caros (TTL 12s) ---- */
const _erpCache = new Map();
function _fromCache(key, ttlMs, compute) {
  const hit = _erpCache.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  const val = compute();
  _erpCache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}
function _bustCache(...keys) {
  if (!keys.length) { _erpCache.clear(); return; }
  keys.forEach((k) => _erpCache.delete(k));
}
const CACHE_TTL = 12000;
let erpPurchaseOrders = [];
let erpPurchaseReceipts = [];
let erpInventoryMovements = [];
let erpOperationalInventory = { categories: [], items: [] };
let erpProviders = [];
let erpVenues = [];
let erpStaff = [];
let erpStaffShifts = [];
let erpPayrollRecords = [];
let erpSanitationRecords = [];
let erpPaymentOrders = [];
let erpUsers = [];
let auditRecords = [];
let panelRoleDefinitions = {};
const panelSessions = new Map();
const inventoryInternalCodeReservations = new Map();
const DEFAULT_ROLE_DEFINITIONS = {
  admin: {
    label: "Administracion general",
    permissions: ["*", "sensitive:security", "sensitive:delete", "sensitive:payments"],
    tabs: ["erp", "commercial", "events", "purchases", "buyer_purchases", "finance", "production", "logistics_event", "recipes", "stock", "providers", "customers", "hr", "sanitation", "security", "reports", "payment_orders", "comandas"],
  },
  comercial: {
    label: "Comercial",
    permissions: ["view", "events:write", "quotes:write", "customers:write", "venues:read"],
    tabs: ["commercial", "events", "customers"],
  },
  compras: {
    label: "Compras",
    permissions: ["view", "purchases:write", "stock:read", "stock:write", "providers:write", "venues:read", "events:read"],
    tabs: ["purchases", "stock", "providers"],
  },
  compras_calle: {
    label: "Compras Calle",
    permissions: ["view", "purchase_orders:read", "purchase_orders:check"],
    tabs: ["buyer_purchases"],
  },
  cocina: {
    label: "Cocinero",
    permissions: ["view", "production:read", "recipes:read", "recipes:write", "stock:kitchen:read", "stock:kitchen:write", "stock:kitchen_equipment:read", "stock:kitchen_equipment:write"],
    tabs: ["production", "recipes", "stock"],
  },
  operacion: {
    label: "Operacion",
    permissions: ["view", "events:read", "events:write", "venues:write", "recipes:read", "logistics:read", "logistics:write"],
    tabs: ["logistics_event"],
  },
  logistica_evento: {
    label: "Logistica Evento",
    permissions: ["view", "logistics:read", "logistics:write", "stock:operations:read", "stock:operations:write", "staff:timesheets:read", "staff:timesheets:write", "staff:timesheets:export"],
    tabs: ["logistics_event", "stock", "hr"],
  },
  finanzas: {
    label: "Finanzas",
    permissions: ["view", "finance:read", "finance:write", "payment_orders:read", "payment_orders:write", "reports:read"],
    tabs: ["finance", "reports", "payment_orders", "comandas"],
  },
  rrhh: {
    label: "Personal/RRHH",
    permissions: ["view", "hr:read", "hr:write", "payroll:read", "payroll:write"],
    tabs: ["hr"],
  },
  bromatologia: {
    label: "Bromatologia",
    permissions: ["view", "sanitation:read", "sanitation:write", "sanitation:approve"],
    tabs: ["sanitation"],
  },
  mantenimiento: {
    label: "Mantenimiento",
    permissions: ["view", "maintenance:read"],
    tabs: [],
  },
};
const TAB_DEFINITIONS = [
  { id: "erp", label: "ERP", requiredAny: ["view"] },
  { id: "commercial", label: "Comercial", requiredAny: ["events:read", "events:write", "quotes:write", "customers:write"] },
  { id: "events", label: "Eventos", requiredAny: ["events:read", "events:write"] },
  { id: "purchases", label: "Compras", requiredAny: ["purchases:write"] },
  { id: "buyer_purchases", label: "Compras Calle", requiredAny: ["purchase_orders:read", "purchase_orders:check"] },
  { id: "finance", label: "Finanzas", requiredAny: ["finance:read", "finance:write"] },
  { id: "production", label: "Produccion/Cocina", requiredAny: ["production:read", "recipes:read", "recipes:write"] },
  { id: "logistics_event", label: "Logistica Evento", requiredAny: ["logistics:read", "logistics:write"] },
  { id: "recipes", label: "Recetas", requiredAny: ["recipes:read", "recipes:write"] },
  { id: "stock", label: "Stock", requiredAny: ["stock:read", "stock:write", "stock:kitchen:read", "stock:kitchen_equipment:read", "stock:operations:read", "purchases:write"] },
  { id: "providers", label: "Proveedores", requiredAny: ["providers:write"] },
  { id: "customers", label: "Clientes", requiredAny: ["customers:write"] },
  { id: "hr", label: "Personal/RRHH", requiredAny: ["hr:read", "hr:write", "payroll:read", "payroll:write", "staff:timesheets:read", "staff:timesheets:write", "staff:timesheets:export"] },
  { id: "sanitation", label: "Bromatologia", requiredAny: ["sanitation:read", "sanitation:write", "sanitation:approve"] },
  { id: "payment_orders", label: "Ordenes de pago", requiredAny: ["payment_orders:read", "payment_orders:write", "payment_orders:approve"] },
  { id: "security", label: "Seguridad", requiredAny: ["users:write"] },
  { id: "equipo", label: "Equipo", requiredAny: ["users:write"] },
  { id: "reports", label: "Reportes", requiredAny: ["reports:read"] },
  { id: "comandas", label: "Comandas", requiredAny: ["reports:read"] },
  { id: "menu_costs", label: "Costos de menu", requiredAny: ["view"] },
];
const PERMISSION_DEFINITIONS = [
  { id: "users:write", label: "Usuarios, roles e historial", group: "Seguridad" },
  { id: "sensitive:security", label: "Cambios sensibles de seguridad", group: "Acciones sensibles" },
  { id: "sensitive:delete", label: "Eliminar registros criticos", group: "Acciones sensibles" },
  { id: "sensitive:payments", label: "Pagos y movimientos de fondos", group: "Acciones sensibles" },
  { id: "reports:read", label: "Ver reportes", group: "Reportes" },
  { id: "finance:read", label: "Ver pagos y deudas", group: "Finanzas" },
  { id: "finance:write", label: "Registrar pagos de proveedores", group: "Finanzas" },
  { id: "stock:read", label: "Ver stock e inventario", group: "Stock" },
  { id: "stock:write", label: "Modificar stock e inventario", group: "Stock" },
  { id: "stock:kitchen:read", label: "Inventario Cocina - Ver", group: "Stock" },
  { id: "stock:kitchen:write", label: "Inventario Cocina - Modificar", group: "Stock" },
  { id: "stock:kitchen_equipment:read", label: "Equipamiento Cocina - Ver", group: "Stock" },
  { id: "stock:kitchen_equipment:write", label: "Equipamiento Cocina - Modificar", group: "Stock" },
  { id: "stock:operations:read", label: "Inventario Operativo Eventos - Ver", group: "Stock" },
  { id: "stock:operations:write", label: "Inventario Operativo Eventos - Modificar", group: "Stock" },
  { id: "payment_orders:read", label: "Ver ordenes de pago", group: "Finanzas" },
  { id: "payment_orders:write", label: "Crear ordenes de pago", group: "Finanzas" },
  { id: "payment_orders:approve", label: "Aprobar ordenes de pago", group: "Finanzas" },
  { id: "hr:read", label: "Ver personal/RRHH", group: "RRHH" },
  { id: "hr:write", label: "Crear y editar personal/RRHH", group: "RRHH" },
  { id: "staff:timesheets:read", label: "Ver carga de horas operativas", group: "RRHH" },
  { id: "staff:timesheets:write", label: "Cargar horas operativas", group: "RRHH" },
  { id: "staff:timesheets:export", label: "Exportar horas operativas", group: "RRHH" },
  { id: "payroll:read", label: "Ver sueldos y horas", group: "RRHH" },
  { id: "payroll:write", label: "Liquidar sueldos y horas", group: "RRHH" },
  { id: "sanitation:read", label: "Ver bromatologia", group: "Bromatologia" },
  { id: "sanitation:write", label: "Crear registros bromatologicos", group: "Bromatologia" },
  { id: "sanitation:approve", label: "Aprobar decomisos y controles", group: "Bromatologia" },
  { id: "production:read", label: "Ver Produccion/Cocina", group: "Produccion/Cocina" },
  { id: "maintenance:read", label: "Ver y reportar estado de articulos", group: "Mantenimiento" },
  { id: "logistics:read", label: "Ver Logistica Evento", group: "Logistica" },
  { id: "logistics:write", label: "Editar ficha logistica", group: "Logistica" },
  { id: "events:write", label: "Crear y editar eventos", group: "Eventos" },
  { id: "quotes:write", label: "Crear y editar presupuestos", group: "Presupuestos" },
  { id: "customers:write", label: "Crear y editar clientes", group: "Clientes" },
  { id: "purchases:write", label: "Compras, pagos y deudas", group: "Compras" },
  { id: "purchase_orders:read", label: "Ver ordenes de compra en calle", group: "Compras" },
  { id: "purchase_orders:check", label: "Tildar ordenes y comentar items", group: "Compras" },
  { id: "providers:write", label: "Crear y editar proveedores", group: "Proveedores" },
  { id: "recipes:write", label: "Crear y editar recetas", group: "Recetas" },
  { id: "venues:write", label: "Crear y editar lugares", group: "Lugares" },
  { id: "events:read", label: "Ver eventos", group: "Lectura" },
  { id: "recipes:read", label: "Ver recetas", group: "Lectura" },
  { id: "venues:read", label: "Ver lugares", group: "Lectura" },
];
const OPERATIONAL_SHEET_CATEGORIES = [
  ["alimentos", "Alimentos"],
  ["vajilla", "Vajilla"],
  ["utensilios", "Utensilios"],
  ["bebidas", "Bebidas"],
  ["manteleria", "Manteleria"],
  ["mobiliario", "Mobiliario"],
  ["personal", "Personal"],
  ["transporte", "Transporte"],
  ["montaje", "Montaje"],
  ["desmontaje", "Desmontaje"],
  ["documentacion", "Documentacion"],
  ["extras", "Extras / varios"],
];
const OPERATIONAL_PROCEDURE_CATEGORY_IDS = new Set(["personal", "transporte", "montaje", "desmontaje", "documentacion", "extras"]);
let cateringDb = null;
let lastCateringDbBackupAt = 0;
const approvedCustomers = new Set();
const processedMessageIds = new Set();
const WHATSAPP_INIT_MAX_ATTEMPTS = Number(process.env.WHATSAPP_INIT_MAX_ATTEMPTS || 3);
const WHATSAPP_INIT_RETRY_MS = Number(process.env.WHATSAPP_INIT_RETRY_MS || 15000);

function findChromeExecutable() {
  const candidates = [
    DEFAULT_CHROME_EXECUTABLE,
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || DEFAULT_CHROME_EXECUTABLE;
}

function cleanupWhatsappChromeLocks() {
  const lockNames = [
    "lockfile",
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "DevToolsActivePort",
    "CrashpadMetrics-active.pma",
  ];

  for (const name of lockNames) {
    const target = path.join(WHATSAPP_AUTH_DIR, name);
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    } catch (error) {
      console.warn(`No se pudo limpiar bloqueo de Chrome: ${name}`);
    }
  }
}

// IMPORTANTE: configure aqui el numero que va a autorizar las respuestas.
// Use formato internacional, sin +, sin espacios. Ejemplo Argentina: 5491123456789
const ADMIN_PHONE_NUMBER =
  process.env.ADMIN_PHONE_NUMBER || BOT_CONFIG.adminPhoneNumber || "5492616637057";
const ADMIN_CHAT_ID = formatWhatsappChatId(ADMIN_PHONE_NUMBER);
const ADMIN_INCOMING_IDS = new Set([
  ADMIN_CHAT_ID,
  "132856290508966@lid",
]);
const INTERNAL_TEAM_PHONE_NUMBERS = new Set([
  ADMIN_PHONE_NUMBER,
  ...(BOT_CONFIG.internalTeamPhoneNumbers || []),
].map(normalizePhoneDigits).filter(Boolean));
const INTERNAL_TEAM_CHAT_IDS = new Set([
  ...Array.from(INTERNAL_TEAM_PHONE_NUMBERS).map(formatWhatsappChatId),
  ...(BOT_CONFIG.internalTeamChatIds || []),
].filter(Boolean));
const TEST_PHONE_NUMBERS = new Set(
  (BOT_CONFIG.testPhoneNumbers || []).map(normalizePhoneDigits).filter(Boolean)
);
const TEST_CHAT_IDS = new Set([
  ...Array.from(TEST_PHONE_NUMBERS).map(formatWhatsappChatId),
  ...(BOT_CONFIG.testChatIds || []),
].filter(Boolean));

const STEPS = {
  CONTACT_REASON: -1,
  FULL_NAME: 0,
  EVENT_TYPE: 1,
  EVENT_DATE: 2,
  GUEST_COUNT: 3,
  VENUE: 4,
  SERVICE_TYPE: 5,
  EVENT_MOMENTS: 6,
  DRINKS_DETAIL: 7,
  OPERATIONAL_NEEDS: 8,
  LOGISTICS: 9,
  DIETARY_RESTRICTIONS: 10,
  COMPLETED: 11,
};

const STATUS_LABELS = {
  new: "Nuevo",
  pending_approval: "Pendiente de aprobacion",
  approved_waiting_reason: "Esperando motivo",
  in_progress: "En relevamiento",
  missing_info: "Faltan datos",
  ready_to_quote: "Listo para presupuestar",
  proposal_sent: "Propuesta enviada",
  follow_up: "En seguimiento",
  confirmed: "Confirmado",
  lost: "Perdido",
  referred: "Derivado",
  test: "Prueba",
  ignored: "Ignorado",
};

const ALLOWED_STATUSES = new Set(Object.keys(STATUS_LABELS));

const STATUS_MIGRATION = {
  budget_ready: "ready_to_quote",
};

const INVENTORY_AREAS = ["kitchen", "operations", "general_warehouse", "maintenance_technology"];
const FUNCTIONAL_FAMILIES = [
  "food", "beverages", "disposables", "tableware", "glassware", "linen_textiles", "utensils",
  "tools", "kitchen_equipment", "event_equipment", "technology_communication",
  "furniture_structures", "cleaning", "packaging_containers", "other",
];
const INVENTORY_CONTROL_TYPES = ["consumable", "reusable", "event_returnable", "asset_equipment", "perishable", "box_bundle", "loose_unit"];

const QUESTIONS = {
  [STEPS.FULL_NAME]: BOT_MESSAGES.preguntas.nombre,
  [STEPS.EVENT_TYPE]: BOT_MESSAGES.preguntas.tipoEvento,
  [STEPS.EVENT_DATE]: BOT_MESSAGES.preguntas.fechaEvento,
  [STEPS.GUEST_COUNT]: BOT_MESSAGES.preguntas.cantidadInvitados,
  [STEPS.VENUE]: BOT_MESSAGES.preguntas.lugar,
  [STEPS.SERVICE_TYPE]: BOT_MESSAGES.preguntas.tipoServicio,
  [STEPS.EVENT_MOMENTS]: BOT_MESSAGES.preguntas.momentosEvento,
  [STEPS.DRINKS_DETAIL]: BOT_MESSAGES.preguntas.bebidas,
  [STEPS.OPERATIONAL_NEEDS]: BOT_MESSAGES.preguntas.operacionServicio,
  [STEPS.LOGISTICS]: BOT_MESSAGES.preguntas.logistica,
  [STEPS.DIETARY_RESTRICTIONS]: BOT_MESSAGES.preguntas.restricciones,
};

let pendingReplyCounter = loadPersistentState();
loadBusinessData();

console.log(`Version de WhatsApp Web configurada: ${WHATSAPP_WEB_VERSION || "actual"}`);

client.on("qr", (qr) => {
  console.log("Escanee este QR con WhatsApp para iniciar sesion:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado correctamente.");
});

client.on("auth_failure", (message) => {
  console.error("Fallo la autenticacion de WhatsApp:", message);
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp se desconecto:", reason);
});

client.on("loading_screen", (percent, message) => {
  console.log(`Cargando WhatsApp: ${percent}% - ${message}`);
});

client.on("ready", async () => {
  console.log("Bot corriendo. WhatsApp conectado correctamente.");
  await processUnreadMessagesOnStartup();
});

client.on("message", async (message) => {
  try {
    await processIncomingMessage(message);
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
});

if (!process.env.BOT_SKIP_WHATSAPP) {
  startWhatsappClient();
}

if (!process.env.BOT_SKIP_PANEL) {
  startApprovalPanelServer();
}

process.on("unhandledRejection", (error) => {
  if (isTransientWhatsappStartupError(error)) {
    console.warn(
      "WhatsApp Web reinicio su pagina durante una operacion interna. El bot seguira intentando mantenerse activo."
    );
    console.warn(formatErrorMessage(error));
    return;
  }

  console.error("Error no controlado:", error);
});

process.on("uncaughtException", (error) => {
  if (isTransientWhatsappStartupError(error)) {
    console.warn(
      "WhatsApp Web cerro una tarea interna del navegador. Si el bot no conecta, cierre esta ventana y vuelva a iniciar."
    );
    console.warn(formatErrorMessage(error));
    return;
  }

  console.error("Error critico:", error);
  process.exit(1);
});

async function startWhatsappClient(attempt = 1) {
  try {
    cleanupWhatsappChromeLocks();
    console.log(`Conectando WhatsApp (intento ${attempt}/${WHATSAPP_INIT_MAX_ATTEMPTS})...`);
    console.log(`Chrome configurado: ${CHROME_EXECUTABLE}`);
    await client.initialize();
  } catch (error) {
    if (isTransientWhatsappStartupError(error) && attempt < WHATSAPP_INIT_MAX_ATTEMPTS) {
      console.warn("WhatsApp Web cambio de pagina durante el arranque.");
      console.warn(`Reintentando en ${Math.round(WHATSAPP_INIT_RETRY_MS / 1000)} segundos...`);
      await closeWhatsappClientQuietly();
      await wait(WHATSAPP_INIT_RETRY_MS);
      return startWhatsappClient(attempt + 1);
    }

    console.error("No se pudo iniciar WhatsApp.");
    console.error(formatErrorMessage(error));
    console.error(
      "Sugerencia: cierre otras ventanas de WhatsApp Web, verifique Chrome y vuelva a ejecutar iniciar-bot.bat."
    );
    process.exit(1);
  }
}

function isTransientWhatsappStartupError(error) {
  const message = formatErrorMessage(error).toLowerCase();

  return (
    message.includes("execution context was destroyed") ||
    message.includes("target closed") ||
    message.includes("session closed") ||
    message.includes("cannot find context with specified id") ||
    message.includes("quedo esperando demasiado tiempo") ||
    message.includes("failed to launch the browser process") ||
    message.includes("page.navigate timed out") ||
    message.includes("navigation timeout") ||
    message.includes("protocolerror")
  );
}

function formatErrorMessage(error) {
  if (!error) {
    return "";
  }

  return error.stack || error.message || String(error);
}

async function closeWhatsappClientQuietly() {
  try {
    await client.destroy();
  } catch (error) {
    console.warn("No se pudo cerrar el navegador anterior antes de reintentar.");
    console.warn(formatErrorMessage(error));
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataPath(fileName) {
  const dataDir = path.resolve(process.env.DATA_DIR || BOT_CONFIG?.dataDir || __dirname);
  return path.join(dataDir, fileName);
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function patchWhatsappClientInjection() {
  if (Client.prototype.__cateringInjectionPatched) {
    return;
  }

  const originalInject = Client.prototype.inject;

  Client.prototype.inject = async function resilientInject() {
    const maxAttempts = Number(process.env.WHATSAPP_INJECT_MAX_ATTEMPTS || 8);
    const attemptTimeoutMs = Number(process.env.WHATSAPP_INJECT_TIMEOUT_MS || 45000);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await withTimeout(
          originalInject.call(this),
          attemptTimeoutMs,
          "La carga interna de WhatsApp Web quedo esperando demasiado tiempo."
        );
      } catch (error) {
        if (!isTransientWhatsappStartupError(error) || attempt >= maxAttempts) {
          throw error;
        }

        console.warn(
          `WhatsApp Web navego durante la carga interna (${attempt}/${maxAttempts}). Esperando y reintentando...`
        );
        await waitForWhatsappPageToSettle(this.pupPage);
      }
    }
  };

  Client.prototype.__cateringInjectionPatched = true;
}

async function waitForWhatsappPageToSettle(page) {
  if (!page) {
    await wait(3000);
    return;
  }

  try {
    await page.waitForNavigation({
      waitUntil: "load",
      timeout: 15000,
    });
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      console.warn("No se pudo esperar la navegacion interna de WhatsApp Web.");
      console.warn(formatErrorMessage(error));
    }
  }

  await wait(3000);
}

function isTimeoutLikeError(error) {
  return formatErrorMessage(error).toLowerCase().includes("timeout");
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function getLatestCachedWhatsAppWebVersion() {
  const cacheDir = path.join(__dirname, ".wwebjs_cache");

  try {
    if (!fs.existsSync(cacheDir)) {
      return undefined;
    }

    const versions = fs
      .readdirSync(cacheDir)
      .filter((fileName) => /^\d+\.\d+\.\d+\.html$/.test(fileName))
      .map((fileName) => fileName.replace(/\.html$/, ""))
      .sort(compareWhatsAppWebVersions);

    return versions[versions.length - 1];
  } catch (error) {
    console.warn("No se pudo revisar la cache local de WhatsApp Web.");
    console.warn(formatErrorMessage(error));
    return undefined;
  }
}

function compareWhatsAppWebVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function loadBotConfig() {
  const configPath = path.resolve(process.env.BOT_CONFIG_FILE || path.join(__dirname, "config-bot.json"));

  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error("No se pudo cargar config-bot.json:", error.message);
    console.error("Revise que el archivo exista y que no tenga comas mal ubicadas.");
    process.exit(1);
  }
}

function saveBotConfig() {
  writeJsonFile(CONFIG_FILE, BOT_CONFIG);
}

function getConfigList(key) {
  const configured = Array.isArray(BOT_CONFIG[key])
    ? BOT_CONFIG[key].filter(Boolean).map(String)
    : [];
  const defaults = DEFAULT_CONFIG_LISTS[key] || [];
  const seen = new Set();
  return [...configured, ...defaults]
    .filter((item) => {
      const clean = normalizeSearchKey(item);
      if (!clean || seen.has(clean)) return false;
      seen.add(clean);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

function addPurchaseOption(type, value) {
  const allowedTypes = {
    provider: "purchaseProviders",
    product: "purchaseProducts",
    event: "purchaseEvents",
    paymentMethod: "purchasePaymentMethods",
    fundsSource: "purchaseFundsSources",
  };
  const key = allowedTypes[type];
  const cleanValue = normalizeText(value || "");

  if (!key) {
    throw new Error("Tipo de dato no permitido.");
  }

  if (!cleanValue) {
    throw new Error("Ingrese un valor para guardar.");
  }

  if (!Array.isArray(BOT_CONFIG[key])) {
    BOT_CONFIG[key] = [];
  }

  const exists = BOT_CONFIG[key].some(
    (item) => normalizeText(item).toLowerCase() === cleanValue.toLowerCase()
  );

  if (!exists) {
    BOT_CONFIG[key].push(cleanValue);
    saveBotConfig();
  }

  if (type === "provider") {
    syncProvidersFromPurchasesAndConfig();
    if (!erpProviders.some((provider) => normalizeSearchKey(provider.name) === normalizeSearchKey(cleanValue))) {
      erpProviders.push(normalizeProviderRecord({ name: cleanValue }));
      saveErpProviders();
    }
  }

  return {
    type,
    value: cleanValue,
    items: getConfigList(key),
  };
}

// ── Rastreo de ubicación de empleados (en memoria, sin persistencia) ──────────
const _locationStore = new Map();
// { userId → { name, lat, lng, precision, updatedAt } }
const LOCATION_TTL_MS = 15 * 60 * 1000; // 15 min sin actualizar = inactivo

function startApprovalPanelServer() {
  validateRuntimeConfig();
  const panelPort = Number(process.env.PORT || process.env.PANEL_PORT || BOT_CONFIG.panelPort || 3080);
  const panelHost =
    process.env.PANEL_HOST ||
    BOT_CONFIG.panelHost ||
    (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");

  const server = http.createServer(async (request, response) => {
    const requestStartedAt = Date.now();
    response.on("finish", () => recordServerRequestMetric(request, response, requestStartedAt));

    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`);
      applySecurityHeaders(response);

      if (request.method === "GET" && requestUrl.pathname === "/health") {
        return sendJson(response, {
          ok: true,
          service: "catering-erp",
          status: "healthy",
          environment: process.env.NODE_ENV || "development",
          dataDir: DATA_DIR,
          timestamp: new Date().toISOString(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/") {
        return servePanelHtml(response);
      }

      if (request.method === "GET" && requestUrl.pathname === "/asistencias") {
        return serveAttendancePortalHtml(response);
      }

      if (request.method === "GET" && requestUrl.pathname.startsWith("/assets/")) {
        return serveStaticAsset(response, requestUrl.pathname);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/me") {
        const user = getPanelSessionUser(request);
        return sendJson(response, {
          ok: true,
          authenticated: Boolean(user),
          user: getPublicUser(user),
          roles: getPanelRoleList(),
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/me/location") {
        const user = getPanelSessionUser(request);
        if (!user) return sendJson(response, { ok: false, error: "Sesión expirada." }, 401);
        const body = await readJsonBody(request);
        if (!updateUserGpsLocation(user, body.gps || body)) {
          return sendJson(response, { ok: false, error: "No se pudo registrar la ubicación." }, 400);
        }
        return sendJson(response, { ok: true, user: getPublicUser(user), atSalon: isUserAtSalon(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/ubicacion") {
        const user = getPanelSessionUser(request);
        if (!user) return sendJson(response, { ok: false }, 401);
        const body = await readJsonBody(request);
        if (body.lat && body.lng) {
          _locationStore.set(String(user.id || user.username), {
            name:      user.name || user.username,
            username:  user.username,
            lat:       Number(body.lat),
            lng:       Number(body.lng),
            precision: Number(body.precision || 0),
            updatedAt: Date.now(),
          });
        }
        return sendJson(response, { ok: true });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/ubicaciones") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        const now = Date.now();
        const activos = [];
        _locationStore.forEach((loc, uid) => {
          activos.push({
            uid,
            name:      loc.name,
            username:  loc.username,
            lat:       loc.lat,
            lng:       loc.lng,
            precision: loc.precision,
            updatedAt: loc.updatedAt,
            inactivo:  (now - loc.updatedAt) > LOCATION_TTL_MS,
          });
        });
        return sendJson(response, { ok: true, ubicaciones: activos });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/login") {
        const body = await readJsonBody(request);
        const attemptKey = getLoginAttemptKey(request, body.username);
        try {
          assertLoginAllowed(attemptKey);
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 429);
        }
        let user;
        try {
          user = authenticatePanelUser(body.username, body.password, request, body.gps || null);
          clearLoginFailures(attemptKey);
        } catch (error) {
          recordLoginFailure(attemptKey);
          return sendJson(response, { ok: false, error: error.message }, 401);
        }
        const token = createPanelSession(user);
        response.setHeader("Set-Cookie", buildSessionCookie(token));
        recordAudit(user, "login", "session", user.id, "Inicio de sesion");
        return sendJson(response, { ok: true, user: getPublicUser(user), roles: getPanelRoleList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/logout") {
        const user = getPanelSessionUser(request);
        clearPanelSession(request);
        response.setHeader("Set-Cookie", buildSessionCookie("", 0));
        recordAudit(user, "logout", "session", user?.id || "", "Cierre de sesion");
        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/biometric-sync/events") {
        return handleBiometricSyncRequest(request, response, {
          service: getZktecoService(),
          config: ZKTECO_CONFIG,
          logger: console,
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-sync") {
        const body = await readJsonBody(request);
        validatePurchaseSyncToken(body);
        const result = applyPurchaseSync(body);
        recordAudit(null, body.action || "sync", "purchase", body.purchase?.id || body.id || "", "Sincronizacion desde Sheets", null, result);
        return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/comandas-sync/ventas") {
        const body = await readJsonBody(request);
        validateComandasSyncToken(body);
        const result = applyComandasVentasSync(body);
        recordAudit(null, "sync", "comandas_venta", result.instalacionId || "", "Sincronizacion desde sistema de comandas", null, result);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "GET" && requestUrl.pathname === "/inventario") {
        const html = fs.readFileSync(path.join(__dirname, "inventario-movil.html"), "utf8");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return response.end(html);
      }

      if (request.method === "GET" && requestUrl.pathname === "/estado-inventario") {
        const html = fs.readFileSync(path.join(__dirname, "estado-inventario-movil.html"), "utf8");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return response.end(html);
      }

      if (request.method === "GET" && requestUrl.pathname.startsWith("/images/condition/")) {
        const filename = path.basename(requestUrl.pathname);
        const filepath = dataPath(path.join("images", "condition", filename));
        try {
          const buf = fs.readFileSync(filepath);
          response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000" });
          return response.end(buf);
        } catch {
          response.writeHead(404);
          return response.end("Not found");
        }
      }

      if (!isAuthorizedPanelRequest(request)) {
        return requestPanelAuth(response);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/comandas-stats") {
        if (!requirePanelPermission(request, response, "view")) return;
        const requestedUrl = new URL(request.url, "http://localhost");
        const stats = getComandasStats({
          desde: requestedUrl.searchParams.get("desde"),
          hasta: requestedUrl.searchParams.get("hasta"),
        });
        return sendJson(response, { ok: true, stats });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/state") {
        if (!requirePanelPermission(request, response, "view")) return;
        if (cleanupStalePendingRecords()) {
          savePersistentState();
        }

        return sendJson(response, {
          ok: true,
          pending: getPendingApprovalList(),
          chats: getChatDashboardList(),
          metrics: getDashboardMetrics(),
          approvedCount: approvedCustomers.size,
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/purchase-options") {
        if (!requireAnyPanelPermission(request, response, ["purchases:write", "finance:read", "finance:write"])) return;
        return sendJson(response, {
          ok: true,
          providers: getConfigList("purchaseProviders"),
          products: getConfigList("purchaseProducts"),
          events: getConfigList("purchaseEvents"),
          paymentMethods: getConfigList("purchasePaymentMethods"),
          fundsSources: getConfigList("purchaseFundsSources"),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/customers") {
        if (!requireAnyPanelPermission(request, response, ["customers:write", "events:read", "events:write", "quotes:write"])) return;
        return sendJson(response, {
          ok: true,
          customers: getCustomerInsights(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/providers") {
        if (!requireAnyPanelPermission(request, response, ["providers:write", "purchases:write", "finance:read", "finance:write"])) return;
        return sendJson(response, {
          ok: true,
          providers: getProviderList(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/venues") {
        if (!requireAnyPanelPermission(request, response, ["venues:read", "venues:write", "events:read", "events:write", "quotes:write"])) return;
        return sendJson(response, {
          ok: true,
          venues: getVenueList(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/map-search") {
        if (!requirePanelPermission(request, response, "view")) return;
        const results = await searchMapPlaces(requestUrl.searchParams.get("q") || "");
        return sendJson(response, { ok: true, results });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/recipes") {
        const sessionUser = requireAnyPanelPermission(request, response, ["recipes:read", "recipes:write", "production:read"]);
        if (!sessionUser) return;
        return sendJson(response, {
          ok: true,
          recipes: getRecipeListForUser(sessionUser),
          products: getRecipeProductOptionsForUser(sessionUser),
          settings: getCostSettingsForUser(sessionUser),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/product-master") {
        const sessionUser = requireAnyPanelPermission(request, response, ["purchases:write", "stock:read", "recipes:read", "recipes:write", "production:read"]);
        if (!sessionUser) return;
        return sendJson(response, {
          ok: true,
          products: getProductMasterListForUser(sessionUser),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/erp") {
        const sessionUser = getPanelSessionUser(request);
        const _t0 = Date.now();
        const publicUser = getPublicUser(sessionUser);
        const canSeeEverything = hasPanelPermission(sessionUser, "*");
        const canSeeCommercial = canSeeEverything || hasPanelPermission(sessionUser, "events:read") || hasPanelPermission(sessionUser, "events:write") || hasPanelPermission(sessionUser, "quotes:write") || hasPanelPermission(sessionUser, "customers:write");
        const canSeePurchases = canSeeEverything || hasPanelPermission(sessionUser, "purchases:write");
        const canSeeFinance = canSeeEverything || hasPanelPermission(sessionUser, "finance:read") || hasPanelPermission(sessionUser, "finance:write");
        const canSeeHr = canSeeEverything || hasPanelPermission(sessionUser, "hr:read") || hasPanelPermission(sessionUser, "hr:write") || hasPanelPermission(sessionUser, "payroll:read") || hasPanelPermission(sessionUser, "payroll:write") || hasPanelPermission(sessionUser, "staff:timesheets:read") || hasPanelPermission(sessionUser, "staff:timesheets:write") || hasPanelPermission(sessionUser, "staff:timesheets:export");
        const canSeeSanitation = canSeeEverything || hasPanelPermission(sessionUser, "sanitation:read") || hasPanelPermission(sessionUser, "sanitation:write") || hasPanelPermission(sessionUser, "sanitation:approve");
        const canSeePaymentOrders = canSeeEverything || hasPanelPermission(sessionUser, "payment_orders:read") || hasPanelPermission(sessionUser, "payment_orders:write") || hasPanelPermission(sessionUser, "payment_orders:approve");
        const canSeeProviders = canSeeEverything || hasPanelPermission(sessionUser, "providers:write") || canSeePurchases || canSeeFinance;
        const canSeeRecipes = canSeeEverything || hasPanelPermission(sessionUser, "recipes:read") || hasPanelPermission(sessionUser, "recipes:write");
        const canSeeProduction = canSeeEverything || hasPanelPermission(sessionUser, "production:read");
        const canSeeStock = canSeeEverything || hasAnyInventoryAreaPermission(sessionUser, "read") || canSeePurchases;
        const canSeeReports = canSeeEverything || hasPanelPermission(sessionUser, "reports:read");
        const canSeeCustomers = canSeeEverything || hasPanelPermission(sessionUser, "customers:write");
        const canSeeVenues = canSeeEverything || hasPanelPermission(sessionUser, "venues:read") || hasPanelPermission(sessionUser, "venues:write");

        // ?view= param: only compute fields needed for the requested module
        const _view = requestUrl.searchParams.get("view") || "full";
        const _VIEW_FIELDS = {
          erp:            new Set(["dashboard","pipeline","events","confirmedEvents","quotes"]),
          commercial:     new Set(["dashboard","pipeline","events","confirmedEvents","quotes","customers","venues"]),
          events:         new Set(["events","confirmedEvents","quotes","dashboard","venues","customers"]),
          purchases:      new Set(["purchases","purchaseOrders","purchaseReceipts","inventory","inventoryMovements","operationalInventory","productMaster","providers","productAlerts"]),
          stock:          new Set(["inventory","inventoryMovements","operationalInventory","productMaster","productAlerts"]),
          finance:        new Set(["financeDashboard","purchases","paymentOrdersDashboard","providers"]),
          production:     new Set(["events","confirmedEvents","recipes","productMaster"]),
          recipes:        new Set(["recipes","productMaster"]),
          providers:      new Set(["providers"]),
          customers:      new Set(["customers","venues"]),
          reports:        new Set(["dashboard","pipeline","events","confirmedEvents","quotes","purchases"]),
          hr:             new Set(["hrDashboard"]),
          sanitation:     new Set(["sanitationDashboard"]),
          payment_orders: new Set(["paymentOrdersDashboard","purchases","providers"]),
        };
        const _needFields = _VIEW_FIELDS[_view] || null;
        const _has = (field) => !_needFields || _needFields.has(field);
        const _partial = !!_needFields;

        if (publicUser?.role === "logistica_evento") {
          console.log(`[/api/erp] ${publicUser?.username || "?"} role=logistica_evento view=${_view} total=${Date.now() - _t0}ms`);
          return sendJson(response, {
            ok: true,
            me: publicUser,
            roles: getPanelRoleList(),
            _view,
            _partial,
            dashboard: _has("dashboard") ? {} : undefined,
            pipeline: _has("pipeline") ? { columns: [] } : undefined,
            events: _has("events") ? [] : undefined,
            confirmedEvents: _has("confirmedEvents") ? [] : undefined,
            quotes: _has("quotes") ? [] : undefined,
            purchases: _has("purchases") ? [] : undefined,
            purchaseOrders: _has("purchaseOrders") ? [] : undefined,
            purchaseReceipts: _has("purchaseReceipts") ? [] : undefined,
            inventory: _has("inventory") ? [] : undefined,
            inventoryMovements: _has("inventoryMovements") ? [] : undefined,
            operationalInventory: _has("operationalInventory") && hasAnyInventoryAreaPermission(sessionUser, "read") ? getOperationalInventoryAdminView(sessionUser) : undefined,
            productMaster: _has("productMaster") ? [] : undefined,
            providers: _has("providers") ? [] : undefined,
            recipes: _has("recipes") ? [] : undefined,
            customers: _has("customers") ? [] : undefined,
            venues: _has("venues") ? [] : undefined,
            productAlerts: _has("productAlerts") ? [] : undefined,
            hrDashboard: _has("hrDashboard") && canSeeHr ? getHrDashboardForUser(sessionUser) : undefined,
            sanitationDashboard: _has("sanitationDashboard") ? undefined : undefined,
            paymentOrdersDashboard: _has("paymentOrdersDashboard") ? undefined : undefined,
          });
        }
        if (publicUser?.role === "finanzas") {
          const needsFinanceDashboard = _has("financeDashboard") || _has("dashboard") || _has("events");
          const financeDashboard = needsFinanceDashboard ? getFinanceDashboard() : null;
          console.log(`[/api/erp] ${publicUser?.username || "?"} role=finanzas view=${_view} total=${Date.now() - _t0}ms`);
          return sendJson(response, {
            ok: true,
            me: publicUser,
            roles: getPanelRoleList(),
            _view,
            _partial,
            dashboard: _has("dashboard") ? (financeDashboard?.summary || {}) : undefined,
            financeDashboard: _has("financeDashboard") ? financeDashboard : undefined,
            pipeline: _has("pipeline") ? { columns: [] } : undefined,
            events: _has("events") ? (financeDashboard?.events || []) : undefined,
            confirmedEvents: _has("confirmedEvents") ? [] : undefined,
            quotes: _has("quotes") ? [] : undefined,
            purchases: _has("purchases") ? getErpPurchaseList() : undefined,
            purchaseOrders: _has("purchaseOrders") ? [] : undefined,
            purchaseReceipts: _has("purchaseReceipts") ? [] : undefined,
            inventory: _has("inventory") ? [] : undefined,
            inventoryMovements: _has("inventoryMovements") ? [] : undefined,
            operationalInventory: _has("operationalInventory") ? undefined : undefined,
            productMaster: _has("productMaster") ? [] : undefined,
            providers: _has("providers") ? getProviderList() : undefined,
            recipes: _has("recipes") ? [] : undefined,
            customers: _has("customers") ? [] : undefined,
            venues: _has("venues") ? [] : undefined,
            productAlerts: _has("productAlerts") ? [] : undefined,
            hrDashboard: _has("hrDashboard") ? undefined : undefined,
            sanitationDashboard: _has("sanitationDashboard") ? undefined : undefined,
            paymentOrdersDashboard: _has("paymentOrdersDashboard") ? getPaymentOrdersDashboard() : undefined,
          });
        }
        const _erpPayload = {
          ok: true,
          me: publicUser,
          roles: getPanelRoleList(),
          _view,
          _partial,
          dashboard: _has("dashboard") ? (canSeeEverything || canSeeReports ? getErpDashboard() : {}) : undefined,
          pipeline: _has("pipeline") ? (canSeeCommercial ? getPipelineBoard() : { columns: [] }) : undefined,
          events: _has("events") ? (canSeeCommercial ? getErpEventList() : canSeeProduction ? getProductionEventList() : []) : undefined,
          confirmedEvents: _has("confirmedEvents") ? (canSeeCommercial ? getConfirmedEventList() : canSeeProduction ? getProductionEventList().filter((e) => ["confirmed", "production", "done"].includes(e.status)) : []) : undefined,
          quotes: _has("quotes") ? (canSeeCommercial ? getErpQuoteList() : []) : undefined,
          purchases: _has("purchases") ? (canSeePurchases || canSeeFinance ? getErpPurchaseList() : []) : undefined,
          purchaseOrders: _has("purchaseOrders") ? (canSeePurchases || canSeeStock ? getPurchaseOrderList() : []) : undefined,
          purchaseReceipts: _has("purchaseReceipts") ? (canSeePurchases || canSeeStock ? getPurchaseReceiptList() : []) : undefined,
          inventory: _has("inventory") ? (canSeePurchases || canSeeStock ? getInventoryBalanceList() : []) : undefined,
          inventoryMovements: _has("inventoryMovements") ? (canSeePurchases || canSeeStock ? getInventoryMovementList() : []) : undefined,
          operationalInventory: _has("operationalInventory") ? (canSeePurchases || canSeeStock || canSeeEverything ? getOperationalInventoryAdminView(sessionUser) : undefined) : undefined,
          productMaster: _has("productMaster") ? (canSeePurchases || canSeeStock || canSeeRecipes || canSeeProduction || canSeeEverything ? getProductMasterListForUser(sessionUser) : []) : undefined,
          providers: _has("providers") ? (canSeeProviders ? getProviderList() : canSeeCommercial ? getRentalProviderOptionList() : []) : undefined,
          recipes: _has("recipes") ? (canSeeRecipes ? getRecipeListForUser(sessionUser) : []) : undefined,
          customers: _has("customers") ? (canSeeCustomers || canSeeCommercial ? getCustomerInsights() : []) : undefined,
          venues: _has("venues") ? (canSeeVenues || canSeeCommercial ? getVenueList() : []) : undefined,
          productAlerts: _has("productAlerts") ? (canSeePurchases || canSeeStock || canSeeRecipes || canSeeEverything ? getProductPriceAlerts() : []) : undefined,
          financeDashboard: _has("financeDashboard") ? (canSeeFinance ? getFinanceDashboard() : undefined) : undefined,
          hrDashboard: _has("hrDashboard") ? (canSeeHr ? getHrDashboardForUser(sessionUser) : undefined) : undefined,
          sanitationDashboard: _has("sanitationDashboard") ? (canSeeSanitation ? getSanitationDashboard() : undefined) : undefined,
          paymentOrdersDashboard: _has("paymentOrdersDashboard") ? (canSeePaymentOrders ? getPaymentOrdersDashboard() : undefined) : undefined,
        };
        console.log(`[/api/erp] ${publicUser?.username || "?"} role=${publicUser?.role || "?"} view=${_view} total=${Date.now() - _t0}ms`);
        return sendJson(response, _erpPayload);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/logistics-events") {
        const user = requirePanelPermission(request, response, "logistics:read");
        if (!user) return;
        return sendJson(response, { ok: true, events: getLogisticsEventList() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/logistics-event") {
        const user = requirePanelPermission(request, response, "logistics:read");
        if (!user) return;
        const event = getLogisticsEventDetail(requestUrl.searchParams.get("id"));
        if (!event) return sendJson(response, { ok: false, error: "No encontre ese evento." }, 404);
        return sendJson(response, { ok: true, event, categories: getOperationalSheetCategoryList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/logistics-event-checklist") {
        const user = requirePanelPermission(request, response, "logistics:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const event = updateLogisticsEventChecklist(body, user);
        return sendJson(response, { ok: true, event, categories: getOperationalSheetCategoryList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/logistics-event-close") {
        const user = requirePanelPermission(request, response, "logistics:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const event = closeLogisticsEvent(body, user);
        return sendJson(response, { ok: true, event, categories: getOperationalSheetCategoryList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/approve-logistics-event-close") {
        const user = requirePanelPermission(request, response, "events:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const event = approveLogisticsEventClose(body, user);
        return sendJson(response, { ok: true, event });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/event-conformity") {
        const user = requirePanelPermission(request, response, "events:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const event = saveEventConformity(body, user);
        return sendJson(response, { ok: true, event, dashboard: getErpDashboard() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/event-conformity") {
        const user = requireAnyPanelPermission(request, response, ["events:read", "events:write"]);
        if (!user) return;
        return sendEventConformityPdf(response, requestUrl.searchParams.get("id"));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/audit-log") {
        const user = requirePanelPermission(request, response, "view");
        if (!user) return;
        return sendJson(response, { ok: true, audit: getAuditLog(requestUrl.searchParams.get("limit") || 120) });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/server-stats") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        return sendJson(response, { ok: true, stats: getServerStats() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/users") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        return sendJson(response, { ok: true, users: getPanelUserList(), roles: getPanelRoleList() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/roles") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        return sendJson(response, {
          ok: true,
          roles: getPanelRoleList(),
          permissions: PERMISSION_DEFINITIONS,
          tabs: TAB_DEFINITIONS,
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/user") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:security", "modificar usuarios")) return;
        const body = await readJsonBody(request);
        const saved = savePanelUserRecord(body);
        recordAudit(user, body.id ? "update" : "create", "user", saved.id, saved.displayName || saved.username, null, getPublicUser(saved));
        return sendJson(response, { ok: true, user: getPublicUser(saved), users: getPanelUserList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/location-required") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        if (user.role !== "admin") return sendJson(response, { ok: false, error: "Solo el admin puede cambiar esta configuración." }, 403);
        const body = await readJsonBody(request);
        BOT_CONFIG.locationRequired = body.enabled !== false;
        saveBotConfig();
        return sendJson(response, { ok: true, locationRequired: BOT_CONFIG.locationRequired });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/location-required") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        return sendJson(response, { ok: true, locationRequired: isLocationRequired() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/roles") {
        const user = requirePanelPermission(request, response, "users:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:security", "modificar roles y permisos")) return;
        const body = await readJsonBody(request);
        const before = getPanelRoleList();
        panelRoleDefinitions = saveRolePermissionConfig(body.roles || []);
        recordAudit(user, "update", "role", "roles", "Permisos por rol", before, getPanelRoleList());
        return sendJson(response, {
          ok: true,
          roles: getPanelRoleList(),
          permissions: PERMISSION_DEFINITIONS,
          tabs: TAB_DEFINITIONS,
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/proposal.txt") {
        if (!requireAnyPanelPermission(request, response, ["quotes:write", "events:read", "events:write"])) return;
        return sendProposalText(response, requestUrl.searchParams.get("quoteId"));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/sheets") {
        if (!requirePanelPermission(request, response, "reports:read")) return;
        return sendJson(response, {
          ok: true,
          sheets: buildGoogleSheetsModel(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/export.xlsx") {
        if (!requirePanelPermission(request, response, "reports:read")) return;
        return sendXlsxExport(response);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/providers.xlsx") {
        if (!requireAnyPanelPermission(request, response, ["providers:write", "purchases:write", "finance:read", "finance:write"])) return;
        return sendProvidersXlsxExport(response);
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/approve") {
        if (!requirePanelPermission(request, response, "view")) return;
        const body = await readJsonBody(request);
        const pending = await approvePendingConversation(body.id);

        if (!pending) {
          return sendJson(
            response,
            {
              ok: false,
              error: "La solicitud ya no existe. Actualice el panel y vuelva a intentar.",
            },
            409
          );
        }

        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/reject") {
        if (!requirePanelPermission(request, response, "view")) return;
        const body = await readJsonBody(request);
        const pending = rejectPendingConversation(body.id);

        if (!pending) {
          return sendJson(
            response,
            {
              ok: false,
              error: "La solicitud ya no existe. Actualice el panel y vuelva a intentar.",
            },
            409
          );
        }

        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/status") {
        requirePanelPermission(request, response, "purchases:write");
        const body = await readJsonBody(request);
        updateChatManualStatus(body.phone, body.status);
        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/manual-budget") {
        requirePanelPermission(request, response, "purchases:write");
        const body = await readJsonBody(request);
        const record = createManualBudgetRecord(body);
        return sendJson(response, { ok: true, record });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/update-budget") {
        requirePanelPermission(request, response, "purchases:write");
        const body = await readJsonBody(request);
        const record = updateBudgetRecord(body.phone, body);
        return sendJson(response, { ok: true, record });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-budget") {
        requirePanelPermission(request, response, "purchases:write");
        const body = await readJsonBody(request);
        deleteBudgetRecord(body.phone);
        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = body.id ? erpPurchases.find((purchase) => purchase.id === body.id) : null;
        const result = await submitPurchaseRecord(body);
        recordAudit(user, body.id ? "update" : "create", "purchase", result.purchase?.id, result.purchase?.provider, before, result.purchase, {
          imputationType: result.purchase?.imputationType || "",
          previousImputationType: before?.imputationType || "",
          previousEventName: before?.eventName || before?.evento || "",
          nextEventName: result.purchase?.eventName || result.purchase?.evento || "",
          previousInternalArea: before?.internalArea || "",
          nextInternalArea: result.purchase?.internalArea || "",
          imputationNotes: result.purchase?.imputationNotes || "",
        });
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-purchase") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar compras")) return;
        const body = await readJsonBody(request);
        const before = erpPurchases.find((purchase) => purchase.id === body.id);
        const result = await deletePurchaseRecord(body.id, { syncSheets: true });
        recordAudit(user, "delete", "purchase", body.id, before?.provider || body.id, before, null);
        return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/provider-payment") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "finance:write"]);
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:payments", "registrar pagos de proveedores")) return;
        const body = await readJsonBody(request);
        try {
          const result = await applyProviderPayment(body);
          recordAudit(user, "payment", "provider", body.provider, body.provider, null, result);
          return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/payer-reimbursement") {
        const user = requirePanelPermission(request, response, "finance:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:payments", "registrar reintegros")) return;
        const body = await readJsonBody(request);
        try {
          const result = applyPayerReimbursement(body);
          recordAudit(user, "payment", "reimbursement", body.payer, `Reintegro - ${body.payer}`, null, result);
          return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList(), financeDashboard: getFinanceDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/hr") {
        const user = requireAnyPanelPermission(request, response, ["hr:read", "hr:write", "payroll:read", "payroll:write", "staff:timesheets:read", "staff:timesheets:write", "staff:timesheets:export"]);
        if (!user) return;
        return sendJson(response, { ok: true, hrDashboard: getHrDashboardForUser(user) });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/asistencias/me") {
        const user = getPanelSessionUser(request);
        if (!user) return sendJson(response, { ok: false, error: "Necesita iniciar sesion.", authRequired: true }, 401);
        return sendJson(response, { ok: true, portal: getEmployeeAttendancePortal(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/asistencias/me") {
        const user = getPanelSessionUser(request);
        if (!user) return sendJson(response, { ok: false, error: "Necesita iniciar sesion.", authRequired: true }, 401);
        const body = await readJsonBody(request);
        try {
          const result = saveEmployeeAttendanceFromPortal(user, body);
          recordAudit(user, "create", "staff_shift", result.shift.id, `${result.shift.staffName} - ${result.shift.date}`, null, result.shift, { source: "employee_portal" });
          return sendJson(response, { ok: true, result, portal: getEmployeeAttendancePortal(user) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/hr-timesheet-export.xlsx") {
        const user = requireAnyPanelPermission(request, response, ["staff:timesheets:export", "hr:read", "hr:write"]);
        if (!user) return;
        return sendHrTimesheetXlsxExport(response, requestUrl.searchParams);
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/hr-staff") {
        const user = requirePanelPermission(request, response, "hr:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpStaff.find((item) => item.id === body.id);
          const staff = saveStaffRecord(body);
          recordAudit(user, body.id ? "update" : "create", "staff", staff.id, staff.fullName, before, staff);
          return sendJson(response, { ok: true, staff, hrDashboard: getHrDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/hr-shift") {
        const user = requireAnyPanelPermission(request, response, ["hr:write", "staff:timesheets:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const canManageHr = hasPanelPermission(user, "hr:write");
          const shiftInput = canManageHr ? body : getOperationalShiftInput(body, user);
          const before = erpStaffShifts.find((item) => item.id === shiftInput.id);
          if (!canManageHr && before && ["approved", "exported", "liquidated", "voided"].includes(getHrShiftExportStatus(before))) {
            throw new Error("Ese horario ya fue aprobado, exportado, liquidado o anulado. Debe corregirlo RRHH.");
          }
          const shift = saveStaffShiftRecord(shiftInput);
          recordAudit(user, body.id ? "update" : "create", "staff_shift", shift.id, `${shift.staffName} - ${shift.eventName || shift.date}`, before, shift);
          return sendJson(response, {
            ok: true,
            shift: canManageHr ? shift : getHrTimesheetShiftView(shift),
            hrDashboard: getHrDashboardForUser(user),
          });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/hr-shift/delete") {
        const user = requirePanelPermission(request, response, "hr:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar horarios de personal")) return;
        const body = await readJsonBody(request);
        try {
          const before = erpStaffShifts.find((item) => item.id === body.id);
          const result = deleteStaffShiftRecord(body, user);
          recordAudit(user, "delete", "staff_shift", result.shift.id, `${result.shift.staffName} - ${result.shift.date}`, before, result.shift, { softDelete: true, reason: result.shift.deletedReason });
          return sendJson(response, { ok: true, result, hrDashboard: getHrDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/hr-timesheet") {
        const user = requireAnyPanelPermission(request, response, ["hr:write", "staff:timesheets:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const result = saveStaffTimesheet(body, user);
          recordAudit(user, "update", "staff_timesheet", result.staffId || body.staffId, `${result.staffName || "Personal"} - ${result.period}`, null, result);
          return sendJson(response, { ok: true, result, hrDashboard: getHrDashboardForUser(user) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/biometric/status") {
        const user = requireAnyPanelPermission(request, response, ["hr:read", "hr:write"]);
        if (!user) return;
        try {
          return sendJson(response, { ok: true, biometric: getBiometricDashboard(requestUrl.searchParams) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 500);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/biometric/events") {
        const user = requireAnyPanelPermission(request, response, ["hr:read", "hr:write"]);
        if (!user) return;
        try {
          const biometric = getBiometricDashboard(requestUrl.searchParams);
          return sendJson(response, { ok: true, biometric, events: biometric.events });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 500);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/biometric/link") {
        const user = requirePanelPermission(request, response, "hr:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const link = getZktecoService().upsertStaffLink(body, erpStaff);
          recordAudit(user, "upsert", "biometric_staff_link", link.id, `${link.deviceSerial} / PIN ${link.deviceEmployeeId}`, null, link);
          return sendJson(response, { ok: true, link, biometric: getBiometricDashboard(new URLSearchParams()) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/biometric/link/deactivate") {
        const user = requirePanelPermission(request, response, "hr:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const link = getZktecoService().deactivateStaffLink(body);
          recordAudit(user, "deactivate", "biometric_staff_link", link.id, `${link.deviceSerial} / PIN ${link.deviceEmployeeId}`, link, null);
          return sendJson(response, { ok: true, link, biometric: getBiometricDashboard(new URLSearchParams()) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/biometric/reprocess") {
        const user = requirePanelPermission(request, response, "hr:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const result = reprocessBiometricEvents(body, user);
          return sendJson(response, { ok: true, result, hrDashboard: getHrDashboard(), biometric: getBiometricDashboard(new URLSearchParams()) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/payroll") {
        const user = requirePanelPermission(request, response, "payroll:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpPayrollRecords.find((item) => item.id === body.id);
          const payroll = savePayrollRecord(body);
          recordAudit(user, body.id ? "update" : "create", "payroll", payroll.id, `${payroll.staffName} - ${payroll.period}`, before, payroll);
          return sendJson(response, { ok: true, payroll, hrDashboard: getHrDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/sanitation") {
        const user = requireAnyPanelPermission(request, response, ["sanitation:read", "sanitation:write", "sanitation:approve"]);
        if (!user) return;
        return sendJson(response, { ok: true, sanitationDashboard: getSanitationDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/sanitation-record") {
        const user = requirePanelPermission(request, response, "sanitation:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpSanitationRecords.find((item) => item.id === body.id);
          const record = saveSanitationRecord(body, user);
          recordAudit(user, body.id ? "update" : "create", "sanitation", record.id, record.title || record.productName || record.eventName, before, record);
          return sendJson(response, { ok: true, record, sanitationDashboard: getSanitationDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/sanitation-approval") {
        const user = requirePanelPermission(request, response, "sanitation:approve");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpSanitationRecords.find((item) => item.id === body.id);
          const record = approveSanitationRecord(body, user);
          recordAudit(user, "approve", "sanitation", record.id, record.title || record.productName || record.eventName, before, record);
          return sendJson(response, { ok: true, record, sanitationDashboard: getSanitationDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/payment-orders") {
        const user = requireAnyPanelPermission(request, response, ["payment_orders:read", "payment_orders:write", "payment_orders:approve"]);
        if (!user) return;
        return sendJson(response, { ok: true, paymentOrdersDashboard: getPaymentOrdersDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/payment-order") {
        const user = requirePanelPermission(request, response, "payment_orders:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpPaymentOrders.find((item) => item.id === body.id);
          const order = savePaymentOrder(body, user);
          recordAudit(user, body.id ? "update" : "create", "payment_order", order.id, `${order.beneficiary} - ${order.concept}`, before, order);
          return sendJson(response, { ok: true, order, paymentOrdersDashboard: getPaymentOrdersDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/payment-order-status") {
        const user = requirePanelPermission(request, response, "payment_orders:approve");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:payments", "aprobar ordenes de pago")) return;
        const body = await readJsonBody(request);
        try {
          const before = erpPaymentOrders.find((item) => item.id === body.id);
          const order = updatePaymentOrderStatus(body, user);
          recordAudit(user, "approve", "payment_order", order.id, `${order.statusLabel} - ${order.beneficiary}`, before, order);
          return sendJson(response, { ok: true, order, paymentOrdersDashboard: getPaymentOrdersDashboard() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/import-purchases-from-sheets") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        const result = await importPurchasesFromSheets();
        recordAudit(user, "import", "purchase", "sheets", "Importar compras desde Sheets", null, result);
        return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/purchase-orders") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        return sendJson(response, { ok: true, orders: getPurchaseOrderList() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/buyer-orders") {
        const user = requireAnyPanelPermission(request, response, ["purchase_orders:read", "purchase_orders:check", "purchases:write"]);
        if (!user) return;
        return sendJson(response, { ok: true, orders: getBuyerPurchaseOrderList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/buyer-order-item") {
        const user = requireAnyPanelPermission(request, response, ["purchase_orders:check", "purchases:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        const result = updateBuyerPurchaseOrderItem(body, user);
        recordAudit(user, "update", "purchase_order_item", body.itemId || body.orderId || "", "Compras en calle", null, result);
        return sendJson(response, { ok: true, order: result, orders: getBuyerPurchaseOrderList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-order") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpPurchaseOrders.find((order) => order.id === body.id);
        const order = savePurchaseOrderRecord(body, user);
        recordAudit(user, body.id ? "update" : "create", "purchase_order", order.id, order.title, before, order);
        return sendJson(response, { ok: true, order, orders: getPurchaseOrderList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-purchase-order") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar ordenes de compra")) return;
        const body = await readJsonBody(request);
        const before = erpPurchaseOrders.find((order) => order.id === body.id);
        deletePurchaseOrderRecord(body.id);
        recordAudit(user, "delete", "purchase_order", body.id, before?.title || body.id, before, null);
        return sendJson(response, { ok: true, orders: getPurchaseOrderList() });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/purchase-order-receipts") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        return sendJson(response, { ok: true, receipts: getPurchaseReceiptList(requestUrl.searchParams.get("orderId") || "") });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-order-receipt") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpPurchaseReceipts.find((receipt) => receipt.id === body.id);
        const receipt = savePurchaseReceiptRecord(body, user);
        recordAudit(user, body.id ? "update" : "create", "purchase_receipt", receipt.id, `Recepcion - ${receipt.orderTitle}`, before, receipt);
        return sendJson(response, {
          ok: true,
          receipt,
          receipts: getPurchaseReceiptList(),
          orders: getPurchaseOrderList(),
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/convert-purchase-receipt") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const before = erpPurchaseReceipts.find((receipt) => receipt.id === (body.id || body.receiptId));
          const result = convertPurchaseReceiptToPurchase(body, user);
          recordAudit(user, "convert", "purchase_receipt", result.receipt.id, `Compra real - ${result.receipt.orderTitle}`, before, result);
          return sendJson(response, {
            ok: true,
            result,
            receipts: getPurchaseReceiptList(),
            orders: getPurchaseOrderList(),
            purchases: getErpPurchaseList(),
            inventory: getInventoryBalanceList(),
            inventoryMovements: getInventoryMovementList(),
            dashboard: getErpDashboard(),
          });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/inventory") {
        const user = requirePanelPermission(request, response, "purchases:write");
        if (!user) return;
        return sendJson(response, {
          ok: true,
          inventory: getInventoryBalanceList(),
          movements: getInventoryMovementList(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/operational-inventory") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:read", "stock:write", "stock:kitchen:read", "stock:kitchen_equipment:read", "stock:operations:read", "events:write", "logistics:read"]);
        if (!user) return;
        return sendJson(response, { ok: true, operationalInventory: getOperationalInventoryAdminView(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "events:write", "logistics:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const item = normalizeOperationalInventoryItem(body.item || body);
          const categoryArea = inferInventoryDomainFromCategory(item.categoryId);
          if (item.inventoryDomain && categoryArea && item.inventoryDomain !== categoryArea) {
            return sendJson(response, { ok: false, error: "El area no coincide con la categoria seleccionada." }, 400);
          }
          const existing = item.id ? findOperationalInventoryItem(item.id) : null;
          if (existing && !canWriteInventoryItem(user, existing)) return sendJson(response, { ok: false, error: "Su usuario no puede modificar esta area de inventario." }, 403);
          if (!canWriteInventoryItem(user, item)) return sendJson(response, { ok: false, error: "Su usuario no puede modificar esta area de inventario." }, 403);
          const operationalInventory = saveOperationalInventoryRecord(body, user);
          return sendJson(response, { ok: true, operationalInventory });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "PATCH" && /^\/api\/operational-inventory\/[^/]+$/.test(requestUrl.pathname)) {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "editar articulo de inventario")) return;
        const itemId = decodeURIComponent(requestUrl.pathname.split("/").pop() || "");
        const body = await readJsonBody(request);
        try {
          const item = patchOperationalInventoryItem(itemId, body.fields, body.expectedUpdatedAt, user);
          return sendJson(response, { ok: true, item });
        } catch (error) {
          const status = error.code === "INVENTORY_CONFLICT" ? 409
            : error.code === "INVENTORY_FORBIDDEN" ? 403
              : 400;
          return sendJson(response, { ok: false, error: error.message }, status);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory/internal-code") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "events:write", "logistics:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const existing = body.itemId ? findOperationalInventoryItem(body.itemId) : null;
          if (body.itemId && !existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
          const permissionItem = existing || normalizeOperationalInventoryItem({
            inventoryArea: body.inventoryArea,
            inventoryDomain: body.inventoryDomain,
            functionalFamily: body.functionalFamily,
            categoryId: body.categoryId,
          });
          if (!canWriteInventoryItem(user, permissionItem)) {
            return sendJson(response, { ok: false, error: "Su usuario no puede generar codigos para esta area de inventario." }, 403);
          }
          const internalCode = generateInventoryInternalCode();
          return sendJson(response, { ok: true, internalCode });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory/barcode") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "events:write", "logistics:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        try {
          const existing = findOperationalInventoryItem(body.itemId);
          if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
          if (!canWriteInventoryItem(user, existing)) {
            return sendJson(response, { ok: false, error: "Su usuario no puede asociar codigos a esta area de inventario." }, 403);
          }
          const item = associateOperationalInventoryBarcode(body, user);
          return sendJson(response, { ok: true, item, operationalInventory: getOperationalInventoryAdminView(user) });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory-categories") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        const operationalInventory = saveOperationalInventoryCategories(body, user);
        return sendJson(response, { ok: true, operationalInventory });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-operational-inventory") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar inventario operativo")) return;
        const body = await readJsonBody(request);
        const item = findOperationalInventoryItem(body.id);
        if (!item) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        if (!canWriteInventoryItem(user, item)) return sendJson(response, { ok: false, error: "Su usuario no puede eliminar esta area de inventario." }, 403);
        const operationalInventory = deleteOperationalInventoryItem(body.id, user);
        return sendJson(response, { ok: true, operationalInventory });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory-archive") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "dar de baja inventario operativo")) return;
        if (!requireSalonLocation(user, response, "archivar articulo de inventario")) return;
        const body = await readJsonBody(request);
        const itemId = normalizeText(body.itemId || body.id || "");
        const reason = normalizeText(body.reason || "");
        if (!itemId) return sendJson(response, { ok: false, error: "itemId requerido." }, 400);
        if (!reason) return sendJson(response, { ok: false, error: "Motivo requerido." }, 400);
        const existing = findOperationalInventoryItem(itemId);
        if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        if (!canWriteInventoryItem(user, existing)) return sendJson(response, { ok: false, error: "Su usuario no puede dar de baja esta area de inventario." }, 403);
        const item = archiveOperationalInventoryItem(itemId, reason, user);
        return sendJson(response, { ok: true, item, ...getInventarioSesionView(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory-meta") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "actualizar datos de inventario")) return;
        const body = await readJsonBody(request);
        const itemId = normalizeText(body.itemId || body.id || "");
        if (!itemId) return sendJson(response, { ok: false, error: "itemId requerido." }, 400);
        const existing = findOperationalInventoryItem(itemId);
        if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        const nextArea = Object.prototype.hasOwnProperty.call(body, "inventoryDomain") || Object.prototype.hasOwnProperty.call(body, "categoryId")
          ? normalizeInventoryDomain(body.inventoryDomain) || inferInventoryDomainFromCategory(body.categoryId || existing.categoryId)
          : getInventoryAreaForItem(existing);
        const nextCategoryArea = inferInventoryDomainFromCategory(body.categoryId || existing.categoryId);
        if (nextArea && nextCategoryArea && nextArea !== nextCategoryArea) {
          return sendJson(response, { ok: false, error: "El area no coincide con la categoria seleccionada." }, 400);
        }
        const nextItemForPermission = { ...existing, ...body, inventoryArea: nextArea };
        if (!canWriteInventoryItem(user, existing) || !canWriteInventoryItem(user, nextItemForPermission)) {
          return sendJson(response, { ok: false, error: "Su usuario no puede modificar esta area de inventario." }, 403);
        }
        const expiryStatus = normalizeOperationalExpiryStatus(body.expiryStatus || "");
        const expiryDate = normalizeText(body.expiryDate || "");
        if (expiryStatus && !expiryDate) return sendJson(response, { ok: false, error: "Fecha de vencimiento requerida." }, 400);
        if (expiryStatus && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return sendJson(response, { ok: false, error: "La fecha de vencimiento debe tener formato YYYY-MM-DD." }, 400);
        const item = updateOperationalInventoryMeta(body, user);
        return sendJson(response, { ok: true, item });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/inventario-sesion") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:read", "stock:write", "stock:kitchen:read", "stock:kitchen_equipment:read", "stock:operations:read", "events:write", "logistics:read"]);
        if (!user) return;
        return sendJson(response, { ok: true, ...getInventarioSesionView(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/inventario-sesion/start") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "logistics:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "iniciar toma de inventario")) return;
        const body = await readJsonBody(request);
        const sesion = startInventarioSesion(body.location, user);
        return sendJson(response, { ok: true, sesion });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/inventario-sesion/item") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "logistics:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "registrar conteo de inventario")) return;
        const body = await readJsonBody(request);
        if (!loadInventarioSesion().active) return sendJson(response, { ok: false, error: "No hay una sesion de inventario activa." }, 400);
        if (!normalizeText(body.itemId || "")) return sendJson(response, { ok: false, error: "itemId requerido." }, 400);
        const existing = findOperationalInventoryItem(body.itemId);
        if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        if (!canWriteInventoryItem(user, existing)) return sendJson(response, { ok: false, error: "Su usuario no puede contar esta area de inventario." }, 403);
        const packageValidation = validatePackageCountInput(body.packageCount, body.qty);
        if (!packageValidation.ok) return sendJson(response, { ok: false, error: packageValidation.error }, 400);
        const sesion = updateInventarioSesionItem(body.itemId, body.counted, body.qty, user, packageValidation.packageCount);
        return sendJson(response, { ok: true, sesion });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/inventario-sesion/location") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write"]);
        if (!user) return;
        if (user.role !== "admin") return sendJson(response, { ok: false, error: "Solo admin puede cambiar la ubicacion de la sesion." }, 403);
        const body = await readJsonBody(request);
        if (!loadInventarioSesion().active) return sendJson(response, { ok: false, error: "No hay una sesion de inventario activa." }, 400);
        if (!normalizeText(body.location || "")) return sendJson(response, { ok: false, error: "Ubicacion requerida." }, 400);
        const sesion = updateInventarioSesionLocation(body.location, user);
        return sendJson(response, { ok: true, sesion });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/inventario-sesion/close") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "cerrar sesión de inventario")) return;
        const result = closeInventarioSesion(user);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/inventario-sesion/cancel") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write"]);
        if (!user) return;
        cancelInventarioSesion(user);
        return sendJson(response, { ok: true });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/estado-inventario") {
        const user = requireAnyPanelPermission(request, response, ["maintenance:read", "stock:read", "stock:write", "stock:kitchen:read", "stock:kitchen_equipment:read", "stock:operations:read", "purchases:write"]);
        if (!user) return;
        return sendJson(response, { ok: true, ...getEstadoInventarioView(user) });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-inventory-condition") {
        const user = requireAnyPanelPermission(request, response, ["maintenance:read", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "purchases:write"]);
        if (!user) return;
        if (!requireSalonLocation(user, response, "actualizar estado de artículo")) return;
        const body = await readJsonBody(request);
        if (!body.itemId) return sendJson(response, { ok: false, error: "itemId requerido." }, 400);
        const existing = findOperationalInventoryItem(body.itemId);
        if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        if (!canWriteInventoryItem(user, existing)) return sendJson(response, { ok: false, error: "Su usuario no puede modificar esta area de inventario." }, 403);
        const item = updateItemCondition(body.itemId, body.condition, body.notes, body.imagePath !== undefined ? body.imagePath : undefined, user);
        return sendJson(response, { ok: true, item });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/upload-condition-image") {
        const user = requireAnyPanelPermission(request, response, ["maintenance:read", "stock:write", "stock:kitchen:write", "stock:kitchen_equipment:write", "stock:operations:write", "purchases:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        if (!body.itemId || !body.image) return sendJson(response, { ok: false, error: "itemId e image requeridos." }, 400);
        const existing = findOperationalInventoryItem(body.itemId);
        if (!existing) return sendJson(response, { ok: false, error: "Articulo no encontrado." }, 400);
        if (!canWriteInventoryItem(user, existing)) return sendJson(response, { ok: false, error: "Su usuario no puede modificar esta area de inventario." }, 403);
        const imagePath = await saveConditionImage(body.itemId, body.image);
        return sendJson(response, { ok: true, imagePath });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/import-accountant-payments") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "finance:write"]);
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:payments", "importar pagos del contador")) return;
        try {
          const result = await importAccountantPaymentsFromSheets();
          recordAudit(user, "import", "payment", "contador", "Importar pagos contador", null, result);
          return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/sync-accountant-debts") {
        const user = requireAnyPanelPermission(request, response, ["purchases:write", "finance:write"]);
        if (!user) return;
        try {
          const result = await syncAccountantDebtsToSheets();
          recordAudit(user, "sync", "purchase", "contador", "Actualizar planilla contador", null, result);
          return sendJson(response, { ok: true, result });
        } catch (error) {
          return sendJson(response, { ok: false, error: error.message }, 400);
        }
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/finance-event-payment") {
        const user = requireAnyPanelPermission(request, response, ["finance:write", "events:write"]);
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:payments", "registrar cobros de eventos")) return;
        const body = await readJsonBody(request);
        const before = erpEvents.find((event) => event.id === body.id);
        const event = updateEventCollectionRecord(body);
        recordAudit(user, "payment", "event", event.id, `Cobro evento - ${event.name}`, before, event);
        return sendJson(response, { ok: true, event, financeDashboard: getFinanceDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-sync") {
        const body = await readJsonBody(request);
        validatePurchaseSyncToken(body);
        const result = applyPurchaseSync(body);
        return sendJson(response, { ok: true, result, dashboard: getErpDashboard(), purchases: getErpPurchaseList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/erp-event") {
        const user = requirePanelPermission(request, response, "events:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpEvents.find((event) => event.id === body.id);
        const event = saveErpEventRecord(body, user);
        recordAudit(user, body.id ? "update" : "create", "event", event.id, event.name, before, event);
        recordEventTablewareAudit(user, before || {}, event);
        return sendJson(response, { ok: true, event, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-erp-event") {
        const user = requirePanelPermission(request, response, "events:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar eventos")) return;
        const body = await readJsonBody(request);
        const before = erpEvents.find((event) => event.id === body.id);
        deleteErpEventRecord(body.id);
        recordAudit(user, "delete", "event", body.id, before?.name || body.id, before, null);
        return sendJson(response, { ok: true, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/erp-quote") {
        const user = requirePanelPermission(request, response, "quotes:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpQuotes.find((quote) => quote.id === body.id);
        const quote = saveErpQuoteRecord(body);
        recordAudit(user, body.id ? "update" : "create", "quote", quote.id, quote.eventName, before, quote);
        return sendJson(response, { ok: true, quote, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/import-quote") {
        const user = requirePanelPermission(request, response, "quotes:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const result = await importQuoteFromDocument(body);
        recordAudit(user, "import", "quote", "", result.eventName || result.fileName || "Presupuesto importado", null, result.summary);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-erp-quote") {
        const user = requirePanelPermission(request, response, "quotes:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar presupuestos")) return;
        const body = await readJsonBody(request);
        const before = erpQuotes.find((quote) => quote.id === body.id);
        deleteErpQuoteRecord(body.id);
        recordAudit(user, "delete", "quote", body.id, before?.eventName || body.id, before, null);
        return sendJson(response, { ok: true, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-option") {
        if (!requirePanelPermission(request, response, "purchases:write")) return;
        const body = await readJsonBody(request);
        const result = addPurchaseOption(body.type, body.value);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/provider") {
        const user = requireAnyPanelPermission(request, response, ["providers:write", "finance:write"]);
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpProviders.find((provider) => provider.id === body.id);
        const provider = saveProviderRecord(body);
        recordAudit(user, body.id ? "update" : "create", "provider", provider.id, provider.name, before, provider);
        return sendJson(response, { ok: true, provider, providers: getProviderList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-provider") {
        const user = requirePanelPermission(request, response, "providers:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar proveedores")) return;
        const body = await readJsonBody(request);
        const before = erpProviders.find((provider) => provider.id === body.id);
        const result = deleteProviderRecord(body.id);
        recordAudit(user, "delete", "provider", body.id, before?.name || body.id, before, null);
        return sendJson(response, { ok: true, result, providers: getProviderList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-invoice-ocr") {
        if (!requirePanelPermission(request, response, "purchases:write")) return;
        const body = await readJsonBody(request);
        const result = await extractPurchaseInvoiceData(body);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/customer") {
        const user = requirePanelPermission(request, response, "customers:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = customerRecords[body.id || body.displayPhone || body.phone];
        const customer = saveCustomerFromPanel(body);
        recordAudit(user, body.id ? "update" : "create", "customer", customer.id, customer.fullName, before, customer);
        return sendJson(response, { ok: true, customer });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-customer") {
        const user = requirePanelPermission(request, response, "customers:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar clientes")) return;
        const body = await readJsonBody(request);
        const before = customerRecords[body.id];
        const result = deleteCustomerRecord(body.id);
        recordAudit(user, "delete", "customer", body.id, before?.fullName || body.id, before, null);
        return sendJson(response, { ok: true, result, customers: getCustomerInsights() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/venue") {
        const user = requirePanelPermission(request, response, "venues:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = erpVenues.find((venue) => venue.id === body.id);
        const venue = saveVenueOption(body);
        recordAudit(user, body.id ? "update" : "create", "venue", venue.id, venue.name, before, venue);
        return sendJson(response, { ok: true, venue, venues: getVenueList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-venue") {
        const user = requirePanelPermission(request, response, "venues:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar lugares")) return;
        const body = await readJsonBody(request);
        const before = erpVenues.find((venue) => venue.id === body.id);
        const result = deleteVenueRecord(body.id);
        recordAudit(user, "delete", "venue", body.id, before?.name || body.id, before, null);
        return sendJson(response, { ok: true, result, venues: getVenueList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/recipe") {
        const user = requirePanelPermission(request, response, "recipes:write");
        if (!user) return;
        const body = await readJsonBody(request);
        const before = recipeRecords.find((recipe) => recipe.id === body.id);
        if (user.role === "cocina" && !hasPanelPermission(user, "*")) {
          const pending = submitRecipeEditForReview(body, user);
          recordAudit(user, "review_request", "recipe", pending.id, pending.recipeName, before, pending.next);
          return sendJson(response, { ok: true, pending: true, review: pending });
        }
        const recipe = saveRecipeRecord(body);
        recordAudit(user, body.id ? "update" : "create", "recipe", recipe.id, recipe.name, before, recipe);
        return sendJson(response, { ok: true, recipe });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/pending-recipe-edits") {
        const user = requirePanelPermission(request, response, "recipes:write");
        if (!user) return;
        if (!hasPanelPermission(user, "*")) {
          return sendJson(response, { ok: false, error: "Solo administracion puede revisar cambios de recetas." }, 403);
        }
        return sendJson(response, { ok: true, reviews: getPendingRecipeEditList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/approve-recipe-edit") {
        const user = requirePanelPermission(request, response, "recipes:write");
        if (!user) return;
        if (!hasPanelPermission(user, "*")) {
          return sendJson(response, { ok: false, error: "Solo administracion puede aprobar cambios de recetas." }, 403);
        }
        const body = await readJsonBody(request);
        const result = approvePendingRecipeEdit(body.id, user);
        return sendJson(response, { ok: true, result, recipes: getRecipeList(), reviews: getPendingRecipeEditList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/reject-recipe-edit") {
        const user = requirePanelPermission(request, response, "recipes:write");
        if (!user) return;
        if (!hasPanelPermission(user, "*")) {
          return sendJson(response, { ok: false, error: "Solo administracion puede rechazar cambios de recetas." }, 403);
        }
        const body = await readJsonBody(request);
        const result = rejectPendingRecipeEdit(body.id, user, body.reason || "");
        return sendJson(response, { ok: true, result, reviews: getPendingRecipeEditList() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/cost-settings") {
        const user = requirePanelPermission(request, response, "*");
        if (!user) return;
        const body = await readJsonBody(request);
        const settings = saveCostSettingsFromPanel(body);
        return sendJson(response, { ok: true, settings });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/operational-option") {
        if (!requireAnyPanelPermission(request, response, ["production:read", "events:write"])) return;
        const body = await readJsonBody(request);
        const settings = addOperationalOption(body.type, body.value);
        return sendJson(response, { ok: true, settings });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-recipe") {
        const user = requirePanelPermission(request, response, "recipes:write");
        if (!user) return;
        if (!requireSensitivePermission(user, response, "sensitive:delete", "eliminar recetas")) return;
        if (user.role === "cocina" && !hasPanelPermission(user, "*")) {
          return sendJson(response, { ok: false, error: "Cocina no puede eliminar recetas. Envie una correccion a administracion." }, 403);
        }
        const body = await readJsonBody(request);
        const before = recipeRecords.find((recipe) => recipe.id === body.id);
        deleteRecipeRecord(body.id);
        recordAudit(user, "delete", "recipe", body.id, before?.name || body.id, before, null);
        return sendJson(response, { ok: true });
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No encontrado");
    } catch (error) {
      console.error("Error en el panel local:", error);
      sendJson(response, { ok: false, error: error.message }, 500);
    }
  });

  server.listen(panelPort, panelHost, () => {
    const displayHost = panelHost === "0.0.0.0" ? "localhost" : panelHost;
    console.log(`Panel de aprobaciones disponible en http://${displayHost}:${panelPort}`);
  });

  server.on("error", (error) => {
    console.error("No se pudo iniciar el panel de aprobaciones:", error.message);
    console.error("Si el puerto esta ocupado, cambie PORT/PANEL_PORT o panelPort en config-bot.json.");
  });

  setInterval(checkpointCateringDatabaseWal, 5 * 60 * 1000);
}

function validateRuntimeConfig() {
  ensureDirectory(DATA_DIR);

  if (IS_PRODUCTION && !PANEL_AUTH_PASSWORD) {
    throw new Error("En produccion debe configurar PANEL_AUTH_PASSWORD.");
  }
}

function recordServerRequestMetric(request, response, startedAt) {
  const durationMs = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  const statusCode = Number(response.statusCode || 0);
  const method = String(request.method || "GET").toUpperCase();
  const route = normalizeRequestMetricRoute(request.url || "/");
  const key = `${method} ${route}`;

  SERVER_REQUEST_METRICS.total += 1;
  SERVER_REQUEST_METRICS.byStatus[statusCode] = (SERVER_REQUEST_METRICS.byStatus[statusCode] || 0) + 1;

  const current = SERVER_REQUEST_METRICS.byRoute[key] || {
    route: key,
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    errorCount: 0,
    lastStatus: 0,
    lastAt: "",
  };
  current.count += 1;
  current.totalDurationMs += durationMs;
  current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
  current.errorCount += statusCode >= 400 ? 1 : 0;
  current.lastStatus = statusCode;
  current.lastAt = new Date().toISOString();
  SERVER_REQUEST_METRICS.byRoute[key] = current;

  SERVER_REQUEST_METRICS.recent.unshift({
    at: current.lastAt,
    method,
    route,
    statusCode,
    durationMs,
  });
  SERVER_REQUEST_METRICS.recent = SERVER_REQUEST_METRICS.recent.slice(0, 80);
}

function normalizeRequestMetricRoute(url = "/") {
  try {
    const requestUrl = new URL(url, "http://localhost");
    if (requestUrl.pathname.startsWith("/assets/")) return "/assets/*";
    if (requestUrl.pathname === "/api/event-conformity") return "/api/event-conformity";
    return requestUrl.pathname || "/";
  } catch (error) {
    return "/";
  }
}

function getServerStats() {
  const memory = process.memoryUsage();
  const routes = Object.values(SERVER_REQUEST_METRICS.byRoute)
    .map((route) => ({
      ...route,
      averageDurationMs: route.count ? Math.round(route.totalDurationMs / route.count) : 0,
      totalDurationMs: Math.round(route.totalDurationMs),
      maxDurationMs: Math.round(route.maxDurationMs),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    startedAt: SERVER_STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()}`,
    dataDir: DATA_DIR,
    requests: {
      total: SERVER_REQUEST_METRICS.total,
      byStatus: SERVER_REQUEST_METRICS.byStatus,
      routes,
      recent: SERVER_REQUEST_METRICS.recent.slice(0, 30),
    },
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      systemTotal: os.totalmem(),
      systemFree: os.freemem(),
    },
    cpu: {
      cores: os.cpus().length,
      loadAverage: os.loadavg(),
    },
    process: {
      pid: process.pid,
      cwd: process.cwd(),
    },
  };
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; connect-src 'self' https://unpkg.com;"
  );

  if (IS_PRODUCTION) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isAuthorizedPanelRequest(request) {
  return Boolean(getPanelSessionUser(request));
}

function isPanelAuthEnabled() {
  return true;
}

function requestPanelAuth(response) {
  return sendJson(response, { ok: false, error: "Necesita iniciar sesion.", authRequired: true }, 401);
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function serveStaticAsset(response, pathname) {
  const assetsRoot = path.join(__dirname, "assets");
  const relativePath = decodeURIComponent(pathname.replace(/^\/assets\//, ""));
  const requestedPath = path.resolve(assetsRoot, relativePath);

  const isInsideAssets = requestedPath === assetsRoot || requestedPath.startsWith(`${assetsRoot}${path.sep}`);
  if (!isInsideAssets || !fs.existsSync(requestedPath) || !fs.statSync(requestedPath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
    return;
  }

  const extension = path.extname(requestedPath).toLowerCase();
  const contentTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "public, max-age=86400",
  });
  fs.createReadStream(requestedPath).pipe(response);
}

function servePanelHtml(response) {
  const panelPath = path.join(__dirname, "approval-panel.html");
  const html = fs.readFileSync(panelPath, "utf8");

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  response.end(html);
}

function serveAttendancePortalHtml(response) {
  const panelPath = path.join(__dirname, "asistencias.html");
  const html = fs.readFileSync(panelPath, "utf8");

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  response.end(html);
}

function buildSessionCookie(token, maxAge = 12 * 60 * 60) {
  const parts = [
    `catering_session=${encodeURIComponent(token || "")}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Number(maxAge || 0)}`,
  ];
  if (IS_PRODUCTION) parts.push("Secure");
  return parts.join("; ");
}

function getPanelRoleList() {
  return Object.entries(getRoleDefinitions()).map(([id, role]) => ({
    id,
    label: role.label,
    permissions: role.permissions,
    tabs: role.tabs || [],
  }));
}

function getPanelUserList() {
  return erpUsers.map(getPublicUser);
}

function savePanelUserRecord(input = {}) {
  const username = normalizeText(input.username || "").toLowerCase();
  if (!username) throw new Error("Ingrese el usuario.");
  if (!getRoleDefinitions()[input.role]) throw new Error("Seleccione un rol valido.");

  const id = normalizeText(input.id || "") || `usuario-${username.replace(/[^a-z0-9]+/g, "-") || Date.now()}`;
  const duplicate = erpUsers.find((user) => user.id !== id && user.username === username);
  if (duplicate) throw new Error("Ya existe un usuario con ese nombre.");

  const index = erpUsers.findIndex((user) => user.id === id);
  const previous = index >= 0 ? erpUsers[index] : {};
  const password = input.password || "";
  if (index < 0 && !password) throw new Error("Ingrese una clave para el usuario nuevo.");
  if (password && String(password).length < 8) throw new Error("La clave debe tener al menos 8 caracteres.");

  const passwordFields = password ? hashPanelPassword(password) : {
    passwordHash: previous.passwordHash,
    passwordSalt: previous.passwordSalt,
  };
  const user = normalizePanelUser({
    ...previous,
    ...input,
    ...passwordFields,
    id,
    username,
    displayName: normalizeText(input.displayName || input.name || previous.displayName || username),
    area: normalizeText(input.area || previous.area || ""),
    phone: normalizeText(input.phone || previous.phone || ""),
    notes: normalizeText(input.notes || previous.notes || ""),
    status: normalizeUserStatus(input.status || previous.status || (input.active === false || input.active === "false" ? "suspended" : "active")),
    mustChangePassword: input.mustChangePassword === true || ["true", "on", "1"].includes(String(input.mustChangePassword || "").toLowerCase()),
    allowOutsideSalon: parseBooleanLike(input.allowOutsideSalon),
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (index >= 0) {
    erpUsers[index] = user;
  } else {
    erpUsers.push(user);
  }

  saveErpUsers();
  return user;
}

function saveRolePermissionConfig(rolesInput = []) {
  const current = getRoleDefinitions();
  const next = normalizeRoleDefinitions(current);
  const roles = Array.isArray(rolesInput) ? rolesInput : [];

  for (const roleInput of roles) {
    const id = normalizeText(roleInput.id || "");
    if (!next[id]) continue;
    const permissions = sanitizeRolePermissions(roleInput.permissions || []);
    const finalPermissions = id === "admin"
      ? ["*"]
      : Array.from(new Set(["view", ...permissions.filter((permission) => permission !== "*")]));
    next[id] = {
      ...next[id],
      permissions: finalPermissions,
      tabs: sanitizeRoleTabs(roleInput.tabs || next[id].tabs || [], finalPermissions, id),
    };
  }

  if (!next.admin.permissions.includes("*")) {
    next.admin.permissions = ["*"];
  }
  next.admin.tabs = sanitizeRoleTabs(next.admin.tabs || ["security"], next.admin.permissions, "admin");

  panelRoleDefinitions = next;
  savePanelRoles();
  return panelRoleDefinitions;
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendXlsxExport(response) {
  if (!XLSX) {
    return sendJson(
      response,
      {
        ok: false,
        error: "Falta instalar el modulo xlsx para exportar Excel en esta computadora.",
      },
      503
    );
  }

  const workbook = XLSX.utils.book_new();
  const sheets = buildGoogleSheetsModel();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, {
      header: sheet.columns,
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });
  const fileName = `catering-erp-${getDateOnly(new Date())}.xlsx`;

  response.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function sendProvidersXlsxExport(response) {
  if (!XLSX) {
    return sendJson(
      response,
      {
        ok: false,
        error: "Falta instalar el modulo xlsx para exportar Excel en esta computadora.",
      },
      503
    );
  }

  const workbook = XLSX.utils.book_new();
  const { providers, locations } = buildProvidersExportModel();
  const providersColumns = [
    "ID",
    "Nombre comercial",
    "Razon social",
    "CUIT",
    "Condicion IVA",
    "Contacto",
    "Telefono",
    "Email",
    "Categoria",
    "Direccion principal",
    "Banco",
    "Tipo de cuenta",
    "Nro cuenta",
    "Titular de cuenta",
    "CBU/CVU",
    "Alias",
    "Condicion de pago",
    "Compras",
    "Total comprado",
    "Ultima compra",
    "Notas",
    "Creado",
    "Actualizado",
  ];
  const locationsColumns = [
    "Proveedor ID",
    "Proveedor",
    "Ubicacion",
    "Direccion",
    "Telefono",
    "Notas",
    "Maps URL",
    "Latitud",
    "Longitud",
    "Principal",
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(providers, { header: providersColumns }),
    "Proveedores"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(locations, { header: locationsColumns }),
    "Ubicaciones"
  );

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });
  const fileName = `proveedores-gratitud-${getDateOnly(new Date())}.xlsx`;

  response.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function buildProvidersExportModel() {
  const providerList = getProviderList();
  const providers = providerList.map((provider) => ({
    "ID": provider.id || "",
    "Nombre comercial": provider.name || "",
    "Razon social": provider.legalName || "",
    "CUIT": provider.cuit || "",
    "Condicion IVA": provider.ivaCondition || "",
    "Contacto": provider.contactName || "",
    "Telefono": provider.phone || "",
    "Email": provider.email || "",
    "Categoria": provider.category || "",
    "Direccion principal": provider.address || "",
    "Banco": provider.bankName || "",
    "Tipo de cuenta": provider.bankAccountType || "",
    "Nro cuenta": provider.bankAccountNumber || "",
    "Titular de cuenta": provider.bankAccountHolder || "",
    "CBU/CVU": provider.cbu || "",
    "Alias": provider.alias || "",
    "Condicion de pago": provider.paymentTerms || "",
    "Compras": Number(provider.purchaseCount || 0),
    "Total comprado": Number(provider.totalPurchased || 0),
    "Ultima compra": provider.lastPurchaseDate || "",
    "Notas": provider.notes || "",
    "Creado": provider.createdAt || "",
    "Actualizado": provider.updatedAt || "",
  }));
  const locations = providerList.flatMap((provider) => {
    const list = Array.isArray(provider.locations) && provider.locations.length
      ? provider.locations
      : normalizeProviderLocations([], provider.address || "");
    return list.map((location) => ({
      "Proveedor ID": provider.id || "",
      "Proveedor": provider.name || "",
      "Ubicacion": location.name || "",
      "Direccion": location.address || "",
      "Telefono": location.phone || "",
      "Notas": location.notes || "",
      "Maps URL": location.mapsUrl || "",
      "Latitud": location.lat || "",
      "Longitud": location.lng || "",
      "Principal": location.isPrimary ? "Si" : "No",
    }));
  });
  return { providers, locations };
}

function sendHrTimesheetXlsxExport(response, searchParams = new URLSearchParams()) {
  if (!XLSX) {
    return sendJson(
      response,
      {
        ok: false,
        error: "Falta instalar el modulo xlsx para exportar Excel en esta computadora.",
      },
      503
    );
  }

  const rows = buildHrTimesheetExportRows(searchParams);
  if (!rows.length) {
    return sendJson(response, { ok: false, error: "No hay horas guardadas para exportar con estos filtros." });
  }

  const columns = [
    "Mes",
    "Fecha",
    "Dia",
    "Evento",
    "Persona",
    "DNI",
    "Telefono",
    "Rol/tarea",
    "Entrada",
    "Salida",
    "Descanso",
    "Horas calculadas",
    "Nota",
    "Estado",
    "Cargado por",
    "Fecha de carga/actualizacion",
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  XLSX.utils.book_append_sheet(workbook, worksheet, "Horas operativas");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const period = normalizeText(searchParams.get("period") || getDateOnly(new Date()).slice(0, 7));
  const fileName = `horas-operativas-${period || getDateOnly(new Date())}.xlsx`;

  response.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function sendProposalText(response, quoteId) {
  const quote = getErpQuoteList().find((item) => item.id === quoteId);

  if (!quote) {
    return sendJson(response, { ok: false, error: "No encontre ese presupuesto." }, 404);
  }

  const text = buildProposalText(quote);
  const safeName = normalizeSearchKey(quote.eventName || quote.id).replace(/[^a-z0-9]+/g, "-") || "propuesta";

  response.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeName}.txt"`,
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function buildGoogleSheetsModel() {
  const dashboard = getErpDashboard();
  const customers = getCustomerInsights();
  const recipes = getRecipeList();
  const events = getErpEventList();
  const quotes = getErpQuoteList();
  const purchases = getErpPurchaseList();
  const providers = getProviderList();

  return [
    makeSheet("Dashboard", [
      "Indicador",
      "Valor",
    ], [
      { Indicador: "Eventos totales", Valor: dashboard.eventsTotal },
      { Indicador: "Eventos proximos", Valor: dashboard.upcomingEvents },
      { Indicador: "Eventos confirmados", Valor: dashboard.confirmedEvents },
      { Indicador: "Presupuestos abiertos", Valor: dashboard.openQuotes },
      { Indicador: "Presupuestos aceptados", Valor: dashboard.acceptedQuotes },
      { Indicador: "Venta aceptada", Valor: dashboard.estimatedRevenue },
      { Indicador: "Costo estimado", Valor: dashboard.estimatedCost },
      { Indicador: "Margen estimado", Valor: dashboard.estimatedMargin },
      { Indicador: "Margen estimado %", Valor: dashboard.estimatedMarginPercent },
      { Indicador: "Compras pendientes de pago", Valor: dashboard.pendingPurchaseAmount },
    ]),
    makeSheet("Eventos", [
      "ID",
      "Evento",
      "Cliente",
      "Fecha",
      "Horario",
      "Invitados",
      "Modalidad precio",
      "Precio por persona",
      "Total servicio",
      "Lugar",
      "Servicio",
      "Modalidad asistencia",
      "Mozos",
      "Momentos",
      "Menu completo",
      "Bebidas",
      "Detalle bebidas",
      "Vajilla",
      "Personal",
      "Horarios",
      "Estado",
      "Responsable",
      "Proxima accion",
      "Conformidad cliente",
      "Conformidad subida",
      "Presupuesto aceptado",
      "Costo presupuesto",
      "Compras imputadas",
      "Costo stock/ficticio",
      "Costo final",
      "Margen final",
      "Margen final %",
      "Notas",
      "Checklist compras",
      "Checklist produccion",
      "Checklist personal",
      "Checklist logistica",
      "Checklist menu",
      "Checklist pagos",
      "Creado",
      "Actualizado",
    ], events.map((event) => ({
      ID: event.id,
      Evento: event.name,
      Cliente: event.clientName,
      Fecha: event.eventDate,
      Horario: event.eventTime,
      Invitados: event.guestCount,
      "Modalidad precio": event.priceMode,
      "Precio por persona": event.pricePerPerson,
      "Total servicio": event.servicePriceTotal,
      Lugar: event.venue,
      Servicio: event.serviceType,
      "Modalidad asistencia": event.assistanceMode,
      Mozos: event.waiterCount,
      Momentos: event.eventMoments,
      "Menu completo": event.selectedMenu,
      Bebidas: event.includesDrinks,
      "Detalle bebidas": event.drinkType,
      Vajilla: event.tableware,
      Personal: event.staff,
      Horarios: event.schedule,
      Estado: event.status,
      Responsable: event.owner,
      "Proxima accion": event.nextAction,
      "Conformidad cliente": event.clientConformity?.originalName || "",
      "Conformidad subida": event.clientConformity?.uploadedAt || "",
      "Presupuesto aceptado": event.quoteTotal,
      "Costo presupuesto": event.quoteCostTotal,
      "Compras imputadas": event.purchaseTotal,
      "Costo stock/ficticio": event.stockCostTotal,
      "Costo final": event.finalCostTotal,
      "Margen final": event.operationalMargin,
      "Margen final %": event.operationalMarginPercent,
      Notas: event.notes,
      "Checklist compras": event.checklist?.purchases,
      "Checklist produccion": event.checklist?.production,
      "Checklist personal": event.checklist?.staff,
      "Checklist logistica": event.checklist?.logistics,
      "Checklist menu": event.checklist?.menu,
      "Checklist pagos": event.checklist?.payments,
      Creado: event.createdAt,
      Actualizado: event.updatedAt,
    }))),
    makeSheet("Presupuestos", [
      "ID",
      "Evento ID",
      "Version",
      "Evento",
      "Cliente",
      "Estado",
      "Invitados",
      "Costo total",
      "Precio total",
      "Margen $",
      "Margen %",
      "Markup %",
      "Margen objetivo %",
      "Subtotal",
      "Descuento %",
      "Descuento $",
      "Impuesto %",
      "Impuesto $",
      "Valido hasta",
      "Personal extra",
      "Logistica",
      "Vajilla",
      "Otros costos",
      "Notas",
      "Creado",
      "Actualizado",
    ], quotes.map((quote) => ({
      ID: quote.id,
      "Evento ID": quote.eventId,
      Version: quote.version,
      Evento: quote.eventName,
      Cliente: quote.clientName,
      Estado: quote.status,
      Invitados: quote.guestCount,
      "Costo total": quote.costTotal,
      "Precio total": quote.priceTotal,
      "Margen $": quote.marginAmount,
      "Margen %": quote.marginPercent,
      "Markup %": quote.markupPercent,
      "Margen objetivo %": quote.targetMarginPercent,
      Subtotal: quote.subtotalBeforeDiscount,
      "Descuento %": quote.discountPercent,
      "Descuento $": quote.discountAmount,
      "Impuesto %": quote.taxRate,
      "Impuesto $": quote.taxAmount,
      "Valido hasta": quote.validUntil,
      "Personal extra": quote.staffCost,
      Logistica: quote.logisticsCost,
      Vajilla: quote.tablewareCost,
      "Otros costos": quote.extraCost,
      Notas: quote.notes,
      Creado: quote.createdAt,
      Actualizado: quote.updatedAt,
    }))),
    makeSheet("Presupuesto_Recetas", [
      "Presupuesto ID",
      "Evento",
      "Receta ID",
      "Receta",
      "Cantidad",
      "Costo unitario",
      "Costo total",
    ], quotes.flatMap((quote) => (quote.recipes || []).map((line) => ({
      "Presupuesto ID": quote.id,
      Evento: quote.eventName,
      "Receta ID": line.recipeId,
      Receta: line.name,
      Cantidad: line.quantity,
      "Costo unitario": line.unitCost,
      "Costo total": line.totalCost,
    })))),
    makeSheet("Compras", [
      "ID",
      "Fecha",
      "Proveedor",
      "Evento",
      "Descripcion",
      "Total",
      "Estado pago",
      "Medio pago",
      "Origen fondos",
      "Creado",
    ], purchases.map((purchase) => ({
      ID: purchase.id,
      Fecha: purchase.date,
      Proveedor: purchase.provider,
      Evento: purchase.eventName,
      Descripcion: purchase.description,
      Total: purchase.totalAmount,
      "Estado pago": purchase.paymentStatus,
      "Medio pago": purchase.paymentMethod,
      "Origen fondos": purchase.fundsSource,
      Creado: purchase.createdAt,
    }))),
    makeSheet("Compra_Items", [
      "Compra ID",
      "Fecha",
      "Proveedor",
      "Evento",
      "Producto",
      "Cantidad",
      "Unitario",
      "Total",
    ], purchases.flatMap((purchase) => (purchase.lineItems || []).map((item) => ({
      "Compra ID": purchase.id,
      Fecha: purchase.date,
      Proveedor: purchase.provider,
      Evento: purchase.eventName,
      Producto: item.description,
      Cantidad: item.quantity,
      Unitario: item.unitAmount,
      Total: item.total,
    })))),
    makeSheet("Proveedores", [
      "ID",
      "Nombre comercial",
      "Razon social",
      "CUIT",
      "Condicion IVA",
      "Contacto",
      "Telefono",
      "Email",
      "Direccion",
      "Banco",
      "Tipo cuenta",
      "Nro cuenta",
      "Titular cuenta",
      "CBU/CVU",
      "Alias",
      "Condicion pago",
      "Categoria",
      "Compras",
      "Total comprado",
      "Ultima compra",
      "Notas",
      "Creado",
      "Actualizado",
    ], providers.map((provider) => ({
      ID: provider.id,
      "Nombre comercial": provider.name,
      "Razon social": provider.legalName,
      CUIT: provider.cuit,
      "Condicion IVA": provider.ivaCondition,
      Contacto: provider.contactName,
      Telefono: provider.phone,
      Email: provider.email,
      Direccion: provider.address,
      Banco: provider.bankName,
      "Tipo cuenta": provider.bankAccountType,
      "Nro cuenta": provider.bankAccountNumber,
      "Titular cuenta": provider.bankAccountHolder,
      "CBU/CVU": provider.cbu,
      Alias: provider.alias,
      "Condicion pago": provider.paymentTerms,
      Categoria: provider.category,
      Compras: provider.purchaseCount,
      "Total comprado": provider.totalPurchased,
      "Ultima compra": provider.lastPurchaseDate,
      Notas: provider.notes,
      Creado: provider.createdAt,
      Actualizado: provider.updatedAt,
    }))),
    makeSheet("Clientes", [
      "ID",
      "Telefono",
      "Telefono visible",
      "Nombre",
      "Agenda",
      "Presupuestos",
      "Presupuestos ERP",
      "Aceptados",
      "Tasa cierre %",
      "Venta aceptada",
      "Preferencias",
      "Restricciones",
      "Ultimo evento",
      "Ultimo presupuesto",
      "Ultimo contacto",
      "Notas",
      "Creado",
      "Actualizado",
    ], customers.map((customer) => ({
      ID: customer.id,
      Telefono: customer.phone,
      "Telefono visible": customer.displayPhone,
      Nombre: customer.fullName,
      Agenda: customer.contactName,
      Presupuestos: customer.budgetCount,
      "Presupuestos ERP": customer.quoteCount,
      Aceptados: customer.acceptedQuoteCount,
      "Tasa cierre %": customer.closeRate,
      "Venta aceptada": customer.totalRevenue,
      Preferencias: customer.preferences,
      Restricciones: customer.dietaryRestrictions,
      "Ultimo evento": customer.lastEventType,
      "Ultimo presupuesto": customer.lastBudgetAt,
      "Ultimo contacto": customer.lastSeenAt,
      Notas: customer.notes,
      Creado: customer.createdAt,
      Actualizado: customer.updatedAt,
    }))),
    makeSheet("Recetas", [
      "ID",
      "Receta",
      "Categoria",
      "Rinde",
      "Unidad",
      "Costo ingredientes",
      "Costo personal",
      "Costo total",
      "Costo unitario",
      "Horas personal",
      "Notas",
      "Creado",
      "Actualizado",
    ], recipes.map((recipe) => ({
      ID: recipe.id,
      Receta: recipe.name,
      Categoria: recipe.category,
      Rinde: recipe.portions,
      Unidad: recipe.yieldUnit,
      "Costo ingredientes": recipe.ingredientCost,
      "Costo personal": recipe.laborCost,
      "Costo total": recipe.totalCost,
      "Costo unitario": recipe.costPerPortion,
      "Horas personal": recipe.laborHours,
      Notas: recipe.notes,
      Creado: recipe.createdAt,
      Actualizado: recipe.updatedAt,
    }))),
    makeSheet("Receta_Items", [
      "Receta ID",
      "Receta",
      "Tipo",
      "Insumo/Preparacion",
      "Cantidad",
      "Unidad",
      "Costo unitario",
      "Merma %",
      "Costo total",
      "Receta vinculada ID",
    ], recipes.flatMap((recipe) => (recipe.items || []).map((item) => ({
      "Receta ID": recipe.id,
      Receta: recipe.name,
      Tipo: item.type || "product",
      "Insumo/Preparacion": item.name,
      Cantidad: item.quantity,
      Unidad: item.unit,
      "Costo unitario": item.unitCost,
      "Merma %": item.wastePercent,
      "Costo total": item.cost,
      "Receta vinculada ID": item.recipeId || "",
    })))),
    makeSheet("Productos_Precios", [
      "Producto",
      "Costo unitario",
      "Costo anterior",
      "Variacion %",
      "Ultima compra",
      "Proveedor",
      "Actualizado",
    ], Object.values(productPriceRecords).map((product) => ({
      Producto: product.name,
      "Costo unitario": product.unitCost,
      "Costo anterior": product.previousUnitCost,
      "Variacion %": product.changePercent,
      "Ultima compra": product.lastPurchaseDate,
      Proveedor: product.provider,
      Actualizado: product.updatedAt,
    }))),
  ];
}

function makeSheet(name, columns, rows) {
  return {
    name,
    columns,
    rows: rows.length ? rows : [Object.fromEntries(columns.map((column) => [column, ""]))],
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let rejected = false;

    request.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      body += chunk;

      if (Buffer.byteLength(body, "utf8") > MAX_JSON_BODY_BYTES) {
        rejected = true;
        reject(new Error("La solicitud es demasiado grande."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (rejected) {
        return;
      }

      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function getPendingApprovalList() {
  return Object.entries(pendingReplies).map(([id, pending]) => ({
    id,
    customerPhone: pending.customerPhone,
    customerDisplayPhone: firstReadablePhone([
      pending.customerDisplayPhone,
      getReadablePhoneFallback(pending.customerPhone),
    ]),
    customerContactName: pending.customerContactName || "",
    customerMessage: pending.customerMessage || "",
    replyPreview: pending.replyMessages.join("\n---\n"),
    createdAt: pending.createdAt,
  }));
}

function loadBusinessData() {
  Object.assign(customerRecords, readJsonFile(CUSTOMERS_FILE, {}));
  recipeRecords = readJsonFile(RECIPES_FILE, []);
  pendingRecipeEdits = readJsonFile(PENDING_RECIPE_EDITS_FILE, []);
  Object.assign(productPriceRecords, readJsonFile(PRODUCT_PRICES_FILE, {}));
  costSettings = {
    laborHourlyCost: 0,
    ...readJsonFile(COST_SETTINGS_FILE, {}),
  };
  erpEvents = readJsonFile(ERP_EVENTS_FILE, []);
  erpQuotes = readJsonFile(ERP_QUOTES_FILE, []);
  erpPurchases = loadErpPurchasesFromStorage();
  erpPurchaseOrders = normalizePurchaseOrderList(readJsonFile(ERP_PURCHASE_ORDERS_FILE, []));
  erpPurchaseReceipts = normalizePurchaseReceiptList(readJsonFile(ERP_PURCHASE_RECEIPTS_FILE, []));
  erpInventoryMovements = normalizeInventoryMovementList(readJsonFile(ERP_INVENTORY_FILE, []));
  erpOperationalInventory = normalizeOperationalInventoryData(readJsonFile(ERP_OPERATIONAL_INVENTORY_FILE, {}));
  erpProviders = readJsonFile(ERP_PROVIDERS_FILE, []);
  erpVenues = readJsonFile(ERP_VENUES_FILE, []);
  erpStaff = normalizeStaffList(readJsonFile(ERP_HR_STAFF_FILE, []));
  erpStaffShifts = normalizeStaffShiftList(readJsonFile(ERP_HR_SHIFTS_FILE, []));
  erpPayrollRecords = normalizePayrollRecordList(readJsonFile(ERP_PAYROLL_FILE, []));
  erpSanitationRecords = normalizeSanitationRecordList(readJsonFile(ERP_SANITATION_FILE, []));
  erpPaymentOrders = normalizePaymentOrderList(readJsonFile(ERP_PAYMENT_ORDERS_FILE, []));
  panelRoleDefinitions = normalizeRoleDefinitions(readJsonFile(ERP_ROLES_FILE, {}));
  erpUsers = normalizeUserList(readJsonFile(ERP_USERS_FILE, []));
  auditRecords = loadAuditFromStorage();
  ensureDefaultAdminUser();
  syncProvidersFromPurchasesAndConfig();
  syncVenuesFromEventsAndConfig();
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`No se pudo cargar ${path.basename(filePath)}:`, error.message);
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  backupJsonFile(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function backupJsonFile(filePath) {
  if (process.env.JSON_BACKUPS === "0" || !fs.existsSync(filePath)) {
    return;
  }

  try {
    const backupDir = path.join(DATA_DIR, "backups");
    ensureDirectory(backupDir);
    const parsed = path.parse(filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${parsed.name}-${stamp}${parsed.ext}`);
    fs.copyFileSync(filePath, backupPath);
    pruneJsonBackups(backupDir, parsed.name, parsed.ext);
  } catch (error) {
    console.warn("No se pudo crear backup JSON:", error.message);
  }
}

function pruneJsonBackups(backupDir, baseName, extension) {
  const keep = Number(process.env.JSON_BACKUP_KEEP || 30);
  const backups = fs
    .readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith(`${baseName}-`) && fileName.endsWith(extension))
    .map((fileName) => ({
      fileName,
      fullPath: path.join(backupDir, fileName),
      mtimeMs: fs.statSync(path.join(backupDir, fileName)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const backup of backups.slice(keep)) {
    fs.unlinkSync(backup.fullPath);
  }
}

function loadErpPurchasesFromStorage() {
  const jsonPurchases = readJsonFile(ERP_PURCHASES_FILE, []);

  if (!initCateringDatabase()) {
    return jsonPurchases;
  }

  const dbPurchases = readPurchasesFromDatabase();
  if (dbPurchases.length) {
    backupCateringDatabase({ reason: "startup" });
    return dbPurchases;
  }

  if (jsonPurchases.length) {
    savePurchasesToDatabase(jsonPurchases);
    backupCateringDatabase({ force: true, reason: "initial-migration" });
  }

  return jsonPurchases;
}

function initCateringDatabase() {
  if (!DatabaseSync) return false;
  if (cateringDb) return true;

  try {
    ensureDirectory(path.dirname(CATERING_DB_FILE));
    cateringDb = new DatabaseSync(CATERING_DB_FILE);
    cateringDb.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        date TEXT,
        provider TEXT,
        event_name TEXT,
        description TEXT,
        payment_status TEXT,
        paid_amount REAL DEFAULT 0,
        pending_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        data_json TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS purchase_payments (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL,
        provider TEXT,
        date TEXT,
        amount REAL DEFAULT 0,
        payment_method TEXT,
        funds_source TEXT,
        notes TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_purchases_provider ON purchases(provider);
      CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
      CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON purchase_payments(purchase_id);

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT,
        user_role TEXT,
        action TEXT,
        entity_type TEXT,
        entity_id TEXT,
        label TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

      CREATE TABLE IF NOT EXISTS comandas_ventas (
        id TEXT PRIMARY KEY,
        instalacion_id TEXT,
        ticket_id INTEGER,
        mesa TEXT,
        dispositivo TEXT,
        fecha TEXT,
        total REAL DEFAULT 0,
        data_json TEXT NOT NULL,
        created_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_comandas_ventas_fecha ON comandas_ventas(fecha);
    `);
    ensureZktecoSchema(cateringDb);
    return true;
  } catch (error) {
    cateringDb = null;
    console.warn("No se pudo iniciar catering.db. Se usara JSON:", error.message);
    return false;
  }
}

function readPurchasesFromDatabase() {
  if (!cateringDb) return [];

  try {
    return cateringDb
      .prepare("SELECT data_json FROM purchases ORDER BY date DESC, updated_at DESC")
      .all()
      .map((row) => JSON.parse(row.data_json));
  } catch (error) {
    console.warn("No se pudieron leer compras desde catering.db:", error.message);
    return [];
  }
}

function savePurchasesToDatabase(purchases) {
  if (!initCateringDatabase()) return false;

  const upsertPurchase = cateringDb.prepare(`
    INSERT INTO purchases (
      id, date, provider, event_name, description, payment_status,
      paid_amount, pending_amount, total_amount, data_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      provider = excluded.provider,
      event_name = excluded.event_name,
      description = excluded.description,
      payment_status = excluded.payment_status,
      paid_amount = excluded.paid_amount,
      pending_amount = excluded.pending_amount,
      total_amount = excluded.total_amount,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `);
  const deletePayments = cateringDb.prepare("DELETE FROM purchase_payments WHERE purchase_id = ?");
  const insertPayment = cateringDb.prepare(`
    INSERT INTO purchase_payments (
      id, purchase_id, provider, date, amount, payment_method,
      funds_source, notes, data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    cateringDb.exec("BEGIN");
    cateringDb.prepare("DELETE FROM purchases").run();
    for (const purchase of purchases) {
      const amounts = getPurchaseAmounts(purchase);
      const paidAmount = getPurchasePaidAmount(purchase, amounts.totalAmount);
      const pendingAmount = getPurchasePendingAmount(purchase, amounts.totalAmount);
      const normalized = {
        ...purchase,
        totalAmount: amounts.totalAmount,
        paidAmount,
        pendingAmount,
        paymentStatus: pendingAmount <= 0 ? "Pagado" : (paidAmount > 0 ? "Parcial" : (purchase.paymentStatus || "Pendiente")),
      };

      upsertPurchase.run(
        normalized.id,
        normalized.date || "",
        normalized.provider || "",
        normalized.eventName || "",
        normalized.description || "",
        normalized.paymentStatus || "",
        Number(normalized.paidAmount || 0),
        Number(normalized.pendingAmount || 0),
        Number(normalized.totalAmount || 0),
        JSON.stringify(normalized),
        normalized.createdAt || new Date().toISOString(),
        normalized.updatedAt || new Date().toISOString()
      );

      deletePayments.run(normalized.id);
      (normalized.paymentLog || []).forEach((payment, index) => {
        const paymentId = payment.id || `${normalized.id}-pago-${index + 1}`;
        insertPayment.run(
          paymentId,
          normalized.id,
          normalized.provider || "",
          payment.date || "",
          Number(payment.amount || 0),
          payment.paymentMethod || "",
          payment.fundsSource || "",
          payment.notes || "",
          JSON.stringify(payment),
          payment.createdAt || normalized.updatedAt || new Date().toISOString()
        );
      });
    }
    cateringDb.exec("COMMIT");
    backupCateringDatabase();
    return true;
  } catch (error) {
    try {
      cateringDb.exec("ROLLBACK");
    } catch (rollbackError) {
      // Ya no habia una transaccion activa.
    }
    console.warn("No se pudieron guardar compras en catering.db:", error.message);
    return false;
  }
}

function deletePurchaseFromDatabase(id) {
  if (!initCateringDatabase()) return false;

  try {
    cateringDb.prepare("DELETE FROM purchases WHERE id = ?").run(id);
    backupCateringDatabase();
    return true;
  } catch (error) {
    console.warn("No se pudo eliminar compra de catering.db:", error.message);
    return false;
  }
}

function loadAuditFromStorage() {
  if (!initCateringDatabase()) {
    return readJsonFile(ERP_AUDIT_FILE, []);
  }

  const dbCount = getAuditCountFromDatabase();
  if (dbCount > 0) {
    return readAuditFromDatabase();
  }

  const jsonAudit = readJsonFile(ERP_AUDIT_FILE, []);
  if (jsonAudit.length) {
    migrateAuditToDatabase(jsonAudit);
  }
  return jsonAudit;
}

function getAuditCountFromDatabase() {
  if (!cateringDb) return 0;
  try {
    return cateringDb.prepare("SELECT COUNT(*) AS total FROM audit_log").get().total;
  } catch (error) {
    console.warn("No se pudo contar historial en catering.db:", error.message);
    return 0;
  }
}

function readAuditFromDatabase(limit = 1000) {
  if (!cateringDb) return [];
  try {
    return cateringDb
      .prepare("SELECT data_json FROM audit_log ORDER BY at DESC LIMIT ?")
      .all(limit)
      .map((row) => JSON.parse(row.data_json))
      .reverse();
  } catch (error) {
    console.warn("No se pudo leer historial desde catering.db:", error.message);
    return [];
  }
}

function migrateAuditToDatabase(records) {
  if (!cateringDb) return;
  try {
    cateringDb.exec("BEGIN");
    for (const record of records) {
      insertAuditRecordToDatabase(record);
    }
    cateringDb.exec("COMMIT");
    backupCateringDatabase({ force: true, reason: "audit-initial-migration" });
  } catch (error) {
    try {
      cateringDb.exec("ROLLBACK");
    } catch (rollbackError) {
      // Ya no habia una transaccion activa.
    }
    console.warn("No se pudo migrar historial a catering.db:", error.message);
  }
}

function insertAuditRecordToDatabase(record) {
  if (!initCateringDatabase()) return false;
  try {
    cateringDb
      .prepare(`
        INSERT INTO audit_log (
          id, at, user_id, user_name, user_role, action, entity_type, entity_id, label, data_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(
        record.id,
        record.at || new Date().toISOString(),
        record.userId || "",
        record.userName || "",
        record.userRole || "",
        record.action || "",
        record.entityType || "",
        record.entityId || "",
        record.label || "",
        JSON.stringify(record),
        record.at || new Date().toISOString()
      );
    return true;
  } catch (error) {
    console.warn("No se pudo guardar historial en catering.db:", error.message);
    return false;
  }
}

function insertComandaVentaToDatabase(instalacionId, venta) {
  if (!initCateringDatabase()) return false;
  try {
    const id = `${instalacionId}-${venta.id}`;
    cateringDb
      .prepare(`
        INSERT INTO comandas_ventas (
          id, instalacion_id, ticket_id, mesa, dispositivo, fecha, total, data_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(
        id,
        instalacionId || "",
        Number(venta.id || 0),
        venta.mesa || "",
        venta.dispositivo || "",
        String(venta.fecha || ""),
        Number(venta.total || 0),
        JSON.stringify(venta),
        new Date().toISOString()
      );
    return true;
  } catch (error) {
    console.warn("No se pudo guardar venta de comandas en catering.db:", error.message);
    return false;
  }
}

function readComandasVentasFromDatabase({ desde, hasta } = {}) {
  if (!initCateringDatabase()) return [];
  try {
    const desdeMs = desde ? Number(desde) : 0;
    const hastaMs = hasta ? Number(hasta) : Number.MAX_SAFE_INTEGER;
    return cateringDb
      .prepare("SELECT data_json FROM comandas_ventas WHERE CAST(fecha AS INTEGER) BETWEEN ? AND ? ORDER BY fecha DESC")
      .all(desdeMs, hastaMs)
      .map((row) => JSON.parse(row.data_json));
  } catch (error) {
    console.warn("No se pudieron leer ventas de comandas desde catering.db:", error.message);
    return [];
  }
}

function applyComandasVentasSync(input = {}) {
  const instalacionId = normalizeText(input.instalacionId || "");
  const ventas = Array.isArray(input.ventas) ? input.ventas : [];
  let inserted = 0;
  for (const venta of ventas) {
    if (insertComandaVentaToDatabase(instalacionId, venta)) inserted += 1;
  }
  backupCateringDatabase();
  return { instalacionId, recibidas: ventas.length, procesadas: inserted };
}

function validateComandasSyncToken(body = {}) {
  if (!COMANDAS_SYNC_TOKEN) return;

  const token = normalizeText(body.token || body.syncToken || "");
  if (token !== COMANDAS_SYNC_TOKEN) {
    throw new Error("Token de sincronizacion de comandas invalido.");
  }
}

function getComandasStats({ desde, hasta } = {}) {
  const ventas = readComandasVentasFromDatabase({ desde, hasta });
  const totalVentas = ventas.length;
  const totalFacturado = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);

  const porProducto = new Map();
  const porMesa = new Map();
  for (const venta of ventas) {
    const mesaKey = String(venta.mesa || "Sin mesa");
    porMesa.set(mesaKey, (porMesa.get(mesaKey) || 0) + Number(venta.total || 0));

    for (const item of venta.items || []) {
      const key = item.name || "Sin nombre";
      const previo = porProducto.get(key) || { name: key, qty: 0, total: 0 };
      previo.qty += Number(item.qty || 0);
      previo.total += Number(item.qty || 0) * Number(item.price || 0);
      porProducto.set(key, previo);
    }
  }

  const topProductos = Array.from(porProducto.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  const ventasPorMesa = Array.from(porMesa.entries())
    .map(([mesa, total]) => ({ mesa, total }))
    .sort((a, b) => b.total - a.total);

  return { totalVentas, totalFacturado, topProductos, ventasPorMesa };
}

function checkpointCateringDatabaseWal() {
  if (!cateringDb) return;
  try {
    cateringDb.exec("PRAGMA wal_checkpoint(PASSIVE)");
  } catch (error) {
    console.warn("No se pudo hacer checkpoint del WAL de catering.db:", error.message);
  }
}

function backupCateringDatabase(options = {}) {
  if (!cateringDb || !fs.existsSync(CATERING_DB_FILE)) return;

  const now = Date.now();
  if (!options.force && now - lastCateringDbBackupAt < CATERING_DB_BACKUP_INTERVAL_MS) {
    return;
  }

  try {
    ensureDirectory(CATERING_BACKUP_DIR);
    cateringDb.exec("PRAGMA wal_checkpoint(FULL)");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reason = options.reason ? `-${options.reason}` : "";
    const backupPath = path.join(CATERING_BACKUP_DIR, `catering-${stamp}${reason}.db`);
    fs.copyFileSync(CATERING_DB_FILE, backupPath);
    lastCateringDbBackupAt = now;
    pruneDatabaseBackups();
  } catch (error) {
    console.warn("No se pudo crear backup de catering.db:", error.message);
  }
}

function pruneDatabaseBackups() {
  const keep = Number(process.env.CATERING_DB_BACKUP_KEEP || BOT_CONFIG.cateringDbBackupKeep || 60);
  if (!fs.existsSync(CATERING_BACKUP_DIR)) return;

  const backups = fs
    .readdirSync(CATERING_BACKUP_DIR)
    .filter((fileName) => fileName.startsWith("catering-") && fileName.endsWith(".db"))
    .map((fileName) => ({
      fileName,
      fullPath: path.join(CATERING_BACKUP_DIR, fileName),
      mtimeMs: fs.statSync(path.join(CATERING_BACKUP_DIR, fileName)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const backup of backups.slice(keep)) {
    fs.unlinkSync(backup.fullPath);
  }
}

function saveCustomerRecords() {
  writeJsonFile(CUSTOMERS_FILE, customerRecords);
}

function saveRecipeRecords() {
  writeJsonFile(RECIPES_FILE, recipeRecords);
}

function savePendingRecipeEdits() {
  writeJsonFile(PENDING_RECIPE_EDITS_FILE, pendingRecipeEdits);
}

function saveProductPriceRecords() {
  writeJsonFile(PRODUCT_PRICES_FILE, productPriceRecords);
}

function saveCostSettings() {
  writeJsonFile(COST_SETTINGS_FILE, costSettings);
}

function saveErpEvents() {
  _bustCache("evt", "dashboard", "pipeline", "finance", "prodmaster");
  writeJsonFile(ERP_EVENTS_FILE, erpEvents);
}

function saveErpQuotes() {
  _bustCache("quot", "dashboard", "pipeline");
  writeJsonFile(ERP_QUOTES_FILE, erpQuotes);
}

function saveErpPurchaseOrders() {
  _bustCache("purchase_orders", "prodmaster");
  writeJsonFile(ERP_PURCHASE_ORDERS_FILE, erpPurchaseOrders);
}

function saveErpPurchaseReceipts() {
  _bustCache("purch", "inventory", "prodmaster", "dashboard", "finance");
  writeJsonFile(ERP_PURCHASE_RECEIPTS_FILE, erpPurchaseReceipts);
}

function saveErpInventory() {
  _bustCache("inventory", "prodmaster");
  writeJsonFile(ERP_INVENTORY_FILE, erpInventoryMovements);
}

function saveErpOperationalInventory() {
  _bustCache("op_inventory");
  writeJsonFile(ERP_OPERATIONAL_INVENTORY_FILE, erpOperationalInventory);
}

function saveErpPurchases() {
  _bustCache("purch", "dashboard", "finance", "prodmaster");
  savePurchasesToDatabase(erpPurchases);
  writeJsonFile(ERP_PURCHASES_FILE, erpPurchases);
}

function saveErpProviders() {
  _bustCache("providers", "prodmaster");
  writeJsonFile(ERP_PROVIDERS_FILE, erpProviders);
}

function saveErpVenues() {
  writeJsonFile(ERP_VENUES_FILE, erpVenues);
}

function saveErpStaff() {
  writeJsonFile(ERP_HR_STAFF_FILE, erpStaff);
}

function saveErpStaffShifts() {
  writeJsonFile(ERP_HR_SHIFTS_FILE, erpStaffShifts);
}

function saveErpPayroll() {
  writeJsonFile(ERP_PAYROLL_FILE, erpPayrollRecords);
}

function saveErpSanitation() {
  writeJsonFile(ERP_SANITATION_FILE, erpSanitationRecords);
}

function saveErpPaymentOrders() {
  writeJsonFile(ERP_PAYMENT_ORDERS_FILE, erpPaymentOrders);
}

function saveErpUsers() {
  writeJsonFile(ERP_USERS_FILE, erpUsers);
}

function saveAuditRecords(record) {
  if (!insertAuditRecordToDatabase(record)) {
    writeJsonFile(ERP_AUDIT_FILE, auditRecords.slice(-1000));
  }
}

function savePanelRoles() {
  writeJsonFile(ERP_ROLES_FILE, panelRoleDefinitions);
}

let zktecoService = null;

function getZktecoService() {
  if (!zktecoService) {
    zktecoService = createZktecoService({
      config: ZKTECO_CONFIG,
      db: cateringDb || null,
      logger: console,
    });
  }
  return zktecoService;
}

function getRoleDefinitions() {
  if (!Object.keys(panelRoleDefinitions || {}).length) {
    panelRoleDefinitions = normalizeRoleDefinitions({});
  }
  return panelRoleDefinitions;
}

function normalizeRoleDefinitions(input = {}) {
  const merged = {};
  for (const [id, role] of Object.entries(DEFAULT_ROLE_DEFINITIONS)) {
    merged[id] = {
      label: role.label,
      permissions: Array.from(new Set(role.permissions || [])),
      tabs: Array.from(new Set(role.tabs || [])),
    };
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [id, role] of Object.entries(input)) {
      if (!merged[id]) continue;
      merged[id] = {
        label: normalizeText(role.label || merged[id].label),
        permissions: sanitizeRolePermissions(role.permissions || merged[id].permissions),
        tabs: sanitizeRoleTabs(role.tabs || merged[id].tabs || [], sanitizeRolePermissions(role.permissions || merged[id].permissions), id),
      };
    }
  }

  for (const [id, role] of Object.entries(merged)) {
    role.tabs = sanitizeRoleTabs(role.tabs || [], role.permissions || [], id);
  }

  return merged;
}

function sanitizeRolePermissions(permissions) {
  const allowed = new Set(["*", "view", ...PERMISSION_DEFINITIONS.map((item) => item.id)]);
  const list = Array.isArray(permissions) ? permissions : [];
  return Array.from(new Set(list.map(String).filter((permission) => allowed.has(permission))));
}

function sanitizeRoleTabs(tabs, permissions = [], roleId = "") {
  const allowed = new Set(TAB_DEFINITIONS
    .filter((tab) => permissions.includes("*") || tab.requiredAny.some((permission) => permission === "view" || permissions.includes(permission)))
    .map((tab) => tab.id));
  const list = Array.isArray(tabs) ? tabs : [];
  const selected = Array.from(new Set(list.map(String).filter((tab) => allowed.has(tab))));
  if (roleId === "admin" && !selected.includes("security")) {
    selected.push("security");
  }
  if (roleId === "admin" && !selected.includes("equipo")) {
    selected.push("equipo");
  }
  return selected.length ? selected : ["erp"].filter((tab) => allowed.has(tab));
}

function normalizeUserList(users) {
  if (!Array.isArray(users)) return [];
  return users
    .map(normalizePanelUser)
    .filter((user) => user.username && user.passwordHash);
}

function normalizePanelUser(user = {}) {
  const role = getRoleDefinitions()[user.role] ? user.role : "comercial";
  const status = normalizeUserStatus(user.status || (user.active === false ? "suspended" : "active"));

  return {
    id: normalizeText(user.id || `usuario-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    username: normalizeText(user.username || "").toLowerCase(),
    displayName: normalizeText(user.displayName || user.name || user.username || ""),
    role,
    area: normalizeText(user.area || ""),
    phone: normalizeText(user.phone || ""),
    documentId: normalizeText(user.documentId || user.dni || user.cuil || ""),
    notes: normalizeText(user.notes || ""),
    status,
    active: status === "active" || status === "invited",
    mustChangePassword: user.mustChangePassword === true || user.mustChangePassword === "true",
    allowOutsideSalon: parseBooleanLike(user.allowOutsideSalon),
    passwordHash: normalizeText(user.passwordHash || ""),
    passwordSalt: normalizeText(user.passwordSalt || ""),
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || "",
    lastLoginAt: user.lastLoginAt || "",
  };
}

function normalizeUserStatus(status) {
  const clean = normalizeSearchKey(status || "");
  if (["active", "activo"].includes(clean)) return "active";
  if (["invited", "invitado"].includes(clean)) return "invited";
  if (["suspended", "suspendido", "inactive", "inactivo"].includes(clean)) return "suspended";
  if (["offboarded", "baja"].includes(clean)) return "offboarded";
  return "active";
}

function ensureDefaultAdminUser() {
  if (erpUsers.some((user) => user.role === "admin" && user.active)) return;

  const password = PANEL_AUTH_PASSWORD || BOT_CONFIG.panelAdminPassword || "admin";
  erpUsers.push(normalizePanelUser({
    id: "usuario-admin",
    username: PANEL_AUTH_USER || "admin",
    displayName: "Administrador",
    role: "admin",
    active: true,
    ...hashPanelPassword(password),
    createdAt: new Date().toISOString(),
  }));
  saveErpUsers();
  console.log(`Usuario admin creado: ${PANEL_AUTH_USER || "admin"}${PANEL_AUTH_PASSWORD ? "" : " / clave: admin"}`);
}

function hashPanelPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    passwordSalt: salt,
    passwordHash: crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("hex"),
  };
}

function verifyPanelPassword(user, password) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const attempt = hashPanelPassword(password, user.passwordSalt).passwordHash;
  return timingSafeEqual(attempt, user.passwordHash);
}

function getPublicUser(user) {
  if (!user) return null;
  const role = getRoleDefinitions()[user.role] || getRoleDefinitions().comercial;
  const permissions = getEffectiveRolePermissions(user.role, role.permissions || []);
  const tabs = getEffectiveRoleTabs(user.role, role.tabs || [], permissions);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    roleLabel: role.label,
    area: user.area || "",
    phone: user.phone || "",
    documentId: user.documentId || "",
    notes: user.notes || "",
    active: user.active !== false,
    status: user.status || (user.active === false ? "suspended" : "active"),
    mustChangePassword: Boolean(user.mustChangePassword),
    allowOutsideSalon: Boolean(user.allowOutsideSalon),
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    lastLoginAt: user.lastLoginAt || "",
    lastLoginIp: user.lastLoginIp || "",
    lastLoginUserAgent: user.lastLoginUserAgent || "",
    lastLoginLocation: user.lastLoginLocation || "",
    lastLoginCountryCode: user.lastLoginCountryCode || "",
    lastLoginLat: user.lastLoginLat || null,
    lastLoginLng: user.lastLoginLng || null,
    lastLoginAccuracy: user.lastLoginAccuracy || null,
    permissions,
    tabs,
  };
}

function getEffectiveRolePermissions(roleId = "", permissions = []) {
  return Array.from(new Set(Array.isArray(permissions) ? permissions : []));
}

function getEffectiveRoleTabs(roleId = "", tabs = [], permissions = []) {
  const list = Array.from(new Set(Array.isArray(tabs) ? tabs : []));
  if (roleId === "logistica_evento" && (permissions.includes("staff:timesheets:read") || permissions.includes("staff:timesheets:write") || permissions.includes("staff:timesheets:export")) && !list.includes("hr")) {
    list.push("hr");
  }
  return list;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radio Tierra en metros
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isLocationRequired() {
  return BOT_CONFIG.locationRequired !== false;
}

function isUserAtSalon(user) {
  if (!user.lastLoginLat || !user.lastLoginLng) return false;
  const dist = haversineDistance(user.lastLoginLat, user.lastLoginLng, SALON_LAT, SALON_LNG);
  return dist <= SALON_RADIUS_METERS;
}

function requireSalonLocation(user, response, actionLabel) {
  if (!isLocationRequired()) return true;
  if (user.role === "admin" || (user.permissions || []).includes("sensitive:all") || user.allowOutsideSalon === true) return true;
  if (!isUserAtSalon(user)) {
    sendJson(response, {
      ok: false,
      error: `Acción restringida: "${actionLabel}" solo se puede realizar desde el salón (Guaymallén).`,
      code: "LOCATION_REQUIRED",
    }, 403);
    return false;
  }
  return true;
}

function updateUserGpsLocation(user, gpsCoords) {
  const lat = Number(gpsCoords?.lat);
  const lng = Number(gpsCoords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  user.lastLoginLat = lat;
  user.lastLoginLng = lng;
  user.lastLoginAccuracy = Number(gpsCoords?.accuracy || gpsCoords?.precision || 0) || null;
  user.updatedAt = new Date().toISOString();
  saveErpUsers();
  return true;
}

function fetchIpLocation(ip) {
  return new Promise((resolve) => {
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return resolve(null);
    }
    const url = `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,countryCode`;
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.status === "success") {
            const parts = [json.city, json.regionName, json.country].filter(Boolean);
            resolve({ text: parts.join(", "), countryCode: json.countryCode || "" });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function authenticatePanelUser(username, password, request, gpsCoords) {
  const cleanUsername = normalizeText(username || "").toLowerCase();
  const user = erpUsers.find((item) => item.username === cleanUsername && item.active);
  if (!user || !verifyPanelPassword(user, password)) {
    throw new Error("Usuario o clave incorrectos.");
  }

  const now = new Date().toISOString();
  const ip = getRequestIp(request);
  user.lastLoginAt = now;
  user.lastLoginIp = ip;
  user.lastLoginUserAgent = String(request?.headers?.["user-agent"] || "").slice(0, 300);
  user.lastLoginLocation = "";
  updateUserGpsLocation(user, gpsCoords);
  user.updatedAt = now;
  saveErpUsers();

  // geolocalización en background — no bloquea el login
  fetchIpLocation(ip).then((loc) => {
    if (loc) {
      user.lastLoginLocation = loc.text;
      user.lastLoginCountryCode = loc.countryCode;
      saveErpUsers();
    }
  }).catch(() => {});

  return user;
}

function getLoginAttemptKey(request, username) {
  const identifier = normalizeText(username || "").toLowerCase() || "sin-usuario";
  return `${getRequestIp(request)}:${identifier}`;
}

function getRequestIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "sin-ip";
}

function assertLoginAllowed(key) {
  const attempt = LOGIN_ATTEMPTS.get(key);
  if (!attempt) return;
  if (Date.now() > attempt.expiresAt) {
    LOGIN_ATTEMPTS.delete(key);
    return;
  }
  if (attempt.count >= LOGIN_ATTEMPT_MAX) {
    throw new Error("Demasiados intentos fallidos. Espere 15 minutos y vuelva a intentar.");
  }
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = LOGIN_ATTEMPTS.get(key);
  if (!current || now > current.expiresAt) {
    LOGIN_ATTEMPTS.set(key, { count: 1, expiresAt: now + LOGIN_ATTEMPT_WINDOW_MS });
    return;
  }
  current.count += 1;
  current.expiresAt = now + LOGIN_ATTEMPT_WINDOW_MS;
  LOGIN_ATTEMPTS.set(key, current);
}

function clearLoginFailures(key) {
  LOGIN_ATTEMPTS.delete(key);
}

function createPanelSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  panelSessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  });
  return token;
}

function getPanelSessionUser(request) {
  const token = parseCookies(request.headers.cookie || "").catering_session;
  if (!token) return null;
  const session = panelSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    panelSessions.delete(token);
    return null;
  }
  return erpUsers.find((user) => user.id === session.userId && user.active) || null;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index > 0) {
        cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      }
      return cookies;
    }, {});
}

function clearPanelSession(request) {
  const token = parseCookies(request.headers.cookie || "").catering_session;
  if (token) panelSessions.delete(token);
}

function hasPanelPermission(user, permission) {
  if (!permission || permission === "view") return Boolean(user);
  const role = getRoleDefinitions()[user?.role] || {};
  const permissions = getEffectiveRolePermissions(user?.role, role.permissions || []);
  return permissions.includes("*") || permissions.includes(permission);
}

function normalizeInventoryArea(area = "") {
  const key = normalizeSearchKey(area);
  if (!key) return "";
  if (["kitchen", "cocina", "inventario cocina", "alimentos", "materia prima", "heladera", "freezer"].includes(key)) return "kitchen";
  if (["operations", "operativo", "eventos", "inventario operativo", "logistica", "logistica evento", "tecnologia comunicacion", "tecnologia", "handys", "radios", "comunicacion"].includes(key)) return "operations";
  if (["general_warehouse", "deposito general", "deposito", "almacen", "warehouse"].includes(key)) return "general_warehouse";
  if (["maintenance_technology", "mantenimiento tecnologia", "mantenimiento"].includes(key)) return "maintenance_technology";
  return "";
}

function normalizeFunctionalFamily(value = "") {
  const key = normalizeSearchKey(value);
  if (!key) return "";
  if (["food", "alimentos", "comida", "materia prima", "carnes", "verduras"].includes(key)) return "food";
  if (["beverages", "bebidas", "agua", "gaseosas", "alcohol", "hielo"].includes(key)) return "beverages";
  if (["disposables", "descartables", "vasos descartables", "servilletas descartables"].includes(key)) return "disposables";
  if (["tableware", "vajilla", "platos", "cubiertos"].includes(key)) return "tableware";
  if (["glassware", "cristaleria", "cristalería", "copas", "vasos vidrio"].includes(key)) return "glassware";
  if (["linen_textiles", "manteleria", "mantelería", "textiles", "manteles", "servilletas tela"].includes(key)) return "linen_textiles";
  if (["utensils", "utensilios", "ollas", "sartenes", "pinzas"].includes(key)) return "utensils";
  if (["tools", "herramientas"].includes(key)) return "tools";
  if (["kitchen_equipment", "equipamiento cocina", "equipamiento de cocina", "artefactos cocina", "anafes", "hornos"].includes(key)) return "kitchen_equipment";
  if (["event_equipment", "equipamiento evento", "equipamiento operativo", "evento"].includes(key)) return "event_equipment";
  if (["technology_communication", "tecnologia comunicacion", "tecnología comunicación", "handys", "radios", "comunicacion"].includes(key)) return "technology_communication";
  if (["furniture_structures", "mobiliario", "estructuras", "mesas", "sillas", "tableros", "alturas"].includes(key)) return "furniture_structures";
  if (["cleaning", "limpieza", "productos de limpieza", "quimicos"].includes(key)) return "cleaning";
  if (["packaging_containers", "contenedores", "packaging", "cajas", "bins", "conservadoras"].includes(key)) return "packaging_containers";
  if (FUNCTIONAL_FAMILIES.includes(key)) return key;
  return "other";
}

function normalizeInventoryControlType(value = "") {
  const key = normalizeSearchKey(value);
  if (!key) return "";
  if (INVENTORY_CONTROL_TYPES.includes(key)) return key;
  if (["consumible"].includes(key)) return "consumable";
  if (["reutilizable"].includes(key)) return "reusable";
  if (["retornable evento", "event_returnable", "retornable"].includes(key)) return "event_returnable";
  if (["asset", "activo", "equipamiento", "activo equipamiento"].includes(key)) return "asset_equipment";
  if (["perecedero", "vencimiento"].includes(key)) return "perishable";
  if (["caja", "bulto", "box", "bundle"].includes(key)) return "box_bundle";
  if (["unidad", "unidad suelta"].includes(key)) return "loose_unit";
  return "";
}

function canReadInventoryArea(user, area) {
  const cleanArea = normalizeInventoryArea(area);
  if (!cleanArea) return false;
  return hasPanelPermission(user, "*")
    || hasPanelPermission(user, "stock:read")
    || hasPanelPermission(user, "stock:write")
    || hasPanelPermission(user, "purchases:write")
    || hasPanelPermission(user, `stock:${cleanArea}:read`)
    || hasPanelPermission(user, `stock:${cleanArea}:write`);
}

function canWriteInventoryArea(user, area) {
  const cleanArea = normalizeInventoryArea(area);
  if (!cleanArea) return false;
  return hasPanelPermission(user, "*")
    || hasPanelPermission(user, "stock:write")
    || hasPanelPermission(user, "purchases:write")
    || hasPanelPermission(user, `stock:${cleanArea}:write`);
}

function canReadInventoryItem(user, item = {}) {
  const area = getInventoryAreaForItem(item);
  if (canReadInventoryArea(user, area)) return true;
  const family = getFunctionalFamilyForItem(item);
  return area === "kitchen" && family === "kitchen_equipment" && (
    hasPanelPermission(user, "stock:kitchen_equipment:read")
    || hasPanelPermission(user, "stock:kitchen_equipment:write")
  );
}

function canWriteInventoryItem(user, item = {}) {
  const area = getInventoryAreaForItem(item);
  if (canWriteInventoryArea(user, area)) return true;
  const family = getFunctionalFamilyForItem(item);
  return area === "kitchen" && family === "kitchen_equipment" && hasPanelPermission(user, "stock:kitchen_equipment:write");
}

function getAllowedInventoryAreas(user, mode = "read") {
  const checker = mode === "write" ? canWriteInventoryArea : canReadInventoryArea;
  return INVENTORY_AREAS.filter((area) => checker(user, area));
}

function hasAnyInventoryAreaPermission(user, mode = "read") {
  if (getAllowedInventoryAreas(user, mode).length > 0) return true;
  return mode === "write"
    ? hasPanelPermission(user, "stock:kitchen_equipment:write")
    : hasPanelPermission(user, "stock:kitchen_equipment:read") || hasPanelPermission(user, "stock:kitchen_equipment:write");
}

function requirePanelPermission(request, response, permission) {
  const user = getPanelSessionUser(request);
  if (!user) {
    sendJson(response, { ok: false, error: "Necesita iniciar sesion.", authRequired: true }, 401);
    return null;
  }
  if (!hasPanelPermission(user, permission)) {
    sendJson(response, { ok: false, error: "Su usuario no tiene permiso para esta accion." }, 403);
    return null;
  }
  return user;
}

function requireAnyPanelPermission(request, response, permissions = []) {
  const user = getPanelSessionUser(request);
  if (!user) {
    sendJson(response, { ok: false, error: "Necesita iniciar sesion.", authRequired: true }, 401);
    return null;
  }
  if (!permissions.some((permission) => hasPanelPermission(user, permission))) {
    sendJson(response, { ok: false, error: "Su usuario no tiene permiso para esta accion." }, 403);
    return null;
  }
  return user;
}

function requireSensitivePermission(user, response, permission, label = "esta accion sensible") {
  if (hasPanelPermission(user, permission)) return true;
  sendJson(
    response,
    { ok: false, error: `Su usuario no tiene autorizacion para ${label}.` },
    403
  );
  return false;
}

function getAuditLog(limit = 120) {
  return auditRecords
    .slice()
    .reverse()
    .slice(0, Math.max(1, Math.min(Number(limit || 120), 300)));
}

function recordAudit(user, action, entityType, entityId, label, before = null, after = null, metadata = {}) {
  const actor = getPublicUser(user) || { id: "sistema", username: "sistema", displayName: "Sistema", role: "system" };
  const record = {
    id: `historial-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    userId: actor.id,
    userName: actor.displayName || actor.username,
    userRole: actor.role,
    action,
    entityType,
    entityId: normalizeText(entityId || ""),
    label: normalizeText(label || ""),
    before: simplifyAuditValue(before),
    after: simplifyAuditValue(after),
    metadata,
  };
  auditRecords.push(record);
  if (auditRecords.length > 1000) auditRecords = auditRecords.slice(-1000);
  saveAuditRecords(record);
  return record;
}

function simplifyAuditValue(value) {
  if (!value) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return { value: String(value) };
  }
}

function getProviderList() {
  syncProvidersFromPurchasesAndConfig();
  const stats = getProviderStats();
  return erpProviders
    .map((provider) => normalizeProviderRecord(provider, stats[normalizeSearchKey(provider.name)] || {}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeProviderRecord(provider = {}, stats = {}) {
  const now = new Date().toISOString();
  const name = normalizeText(provider.name || provider.displayName || "");
  const hasLocationsText = Object.prototype.hasOwnProperty.call(provider, "locationsText");
  const locations = normalizeProviderLocations(
    hasLocationsText ? parseProviderLocationsText(provider.locationsText) : provider.locations || provider.addresses || [],
    provider.address
  );
  const primaryLocation = locations[0] || {};
  return {
    id: provider.id || createProviderId(name),
    name,
    legalName: normalizeText(provider.legalName || ""),
    cuit: normalizeText(provider.cuit || ""),
    ivaCondition: normalizeText(provider.ivaCondition || ""),
    contactName: normalizeText(provider.contactName || ""),
    phone: normalizeText(provider.phone || ""),
    email: normalizeText(provider.email || ""),
    address: normalizeText(provider.address || primaryLocation.address || ""),
    locations,
    bankName: normalizeText(provider.bankName || ""),
    bankAccountType: normalizeText(provider.bankAccountType || ""),
    bankAccountNumber: normalizeText(provider.bankAccountNumber || ""),
    bankAccountHolder: normalizeText(provider.bankAccountHolder || provider.accountHolder || provider.legalName || ""),
    cbu: normalizeText(provider.cbu || ""),
    alias: normalizeText(provider.alias || ""),
    paymentTerms: normalizeText(provider.paymentTerms || ""),
    category: normalizeText(provider.category || ""),
    notes: normalizeText(provider.notes || ""),
    purchaseCount: Number(stats.purchaseCount || provider.purchaseCount || 0),
    totalPurchased: roundMoney(Number(stats.totalPurchased || provider.totalPurchased || 0)),
    lastPurchaseDate: stats.lastPurchaseDate || provider.lastPurchaseDate || "",
    createdAt: provider.createdAt || now,
    updatedAt: provider.updatedAt || provider.createdAt || now,
  };
}

function normalizeProviderLocations(input = [], fallbackAddress = "") {
  const rawLocations = Array.isArray(input) ? input : [];
  const normalized = rawLocations
    .map((location, index) => normalizeProviderLocation(location, index))
    .filter((location) => location.address || location.name || location.mapsUrl);
  const cleanFallback = normalizeText(fallbackAddress || "");
  if (cleanFallback && !normalized.some((location) => normalizeSearchKey(location.address) === normalizeSearchKey(cleanFallback))) {
    normalized.unshift(normalizeProviderLocation({ name: "Principal", address: cleanFallback, isPrimary: true }, 0));
  }
  return normalized.map((location, index) => ({ ...location, isPrimary: index === 0 || parseBooleanLike(location.isPrimary) }));
}

function parseProviderLocationsText(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length === 1) {
        return { name: index === 0 ? "Principal" : `Sucursal ${index + 1}`, address: parts[0] };
      }
      return {
        name: parts[0] || (index === 0 ? "Principal" : `Sucursal ${index + 1}`),
        address: parts[1] || "",
        phone: parts[2] || "",
        notes: parts.slice(3).join(" | "),
      };
    });
}

function normalizeProviderLocation(location = {}, index = 0) {
  return {
    id: normalizeText(location.id || `loc-${index + 1}`),
    name: normalizeText(location.name || location.label || (index === 0 ? "Principal" : `Sucursal ${index + 1}`)),
    address: normalizeText(location.address || location.direccion || ""),
    phone: normalizeText(location.phone || location.telefono || ""),
    notes: normalizeText(location.notes || location.reference || location.referencias || ""),
    mapsUrl: normalizeText(location.mapsUrl || location.googleMapsUrl || ""),
    lat: normalizeText(location.lat || location.latitude || ""),
    lng: normalizeText(location.lng || location.longitude || ""),
    isPrimary: parseBooleanLike(location.isPrimary),
  };
}

function getProviderStats() {
  return erpPurchases.reduce((stats, purchase) => {
    const name = normalizeText(purchase.provider || "");
    const key = normalizeSearchKey(name);
    if (!key) return stats;

    if (!stats[key]) {
      stats[key] = { purchaseCount: 0, totalPurchased: 0, lastPurchaseDate: "" };
    }

    stats[key].purchaseCount += 1;
    stats[key].totalPurchased += Number(purchase.totalAmount || 0);
    if (String(purchase.date || "") > String(stats[key].lastPurchaseDate || "")) {
      stats[key].lastPurchaseDate = purchase.date || "";
    }
    return stats;
  }, {});
}

function syncProvidersFromPurchasesAndConfig() {
  const existing = new Map();
  let changed = false;
  const purchaseNameKeys = new Set(erpPurchases.map((purchase) => normalizeSearchKey(purchase.provider)).filter(Boolean));
  erpProviders = (Array.isArray(erpProviders) ? erpProviders : [])
    .map((provider) => normalizeProviderRecord(provider))
    .filter((provider) => provider.name);

  const providersById = new Map();
  erpProviders.forEach((provider) => {
    const idKey = provider.id || createProviderId(provider.name);
    if (providersById.has(idKey)) {
      providersById.set(idKey, mergeDuplicateProviderData(providersById.get(idKey), provider, purchaseNameKeys));
      changed = true;
    } else {
      providersById.set(idKey, provider);
    }
  });
  erpProviders = Array.from(providersById.values());
  erpProviders.forEach((provider) => existing.set(normalizeSearchKey(provider.name), provider));

  [
    ...getConfigList("purchaseProviders"),
    ...erpPurchases.map((purchase) => purchase.provider),
  ].forEach((name) => {
    const cleanName = normalizeText(name || "");
    const key = normalizeSearchKey(cleanName);
    if (!key || existing.has(key)) return;

    const provider = normalizeProviderRecord({ name: cleanName });
    erpProviders.push(provider);
    existing.set(key, provider);
    changed = true;
  });

  if (changed) {
    saveErpProviders();
  }
}

function mergeDuplicateProviderData(current = {}, incoming = {}, purchaseNameKeys = new Set()) {
  const currentKey = normalizeSearchKey(current.name);
  const incomingKey = normalizeSearchKey(incoming.name);
  const preferredName = purchaseNameKeys.has(incomingKey)
    ? incoming.name
    : purchaseNameKeys.has(currentKey)
    ? current.name
    : current.name || incoming.name;
  const merged = { ...incoming, ...current, name: preferredName };
  [
    "legalName",
    "cuit",
    "ivaCondition",
    "contactName",
    "phone",
    "email",
    "address",
    "locations",
    "bankName",
    "bankAccountType",
    "bankAccountNumber",
    "bankAccountHolder",
    "cbu",
    "alias",
    "paymentTerms",
    "category",
    "notes",
  ].forEach((field) => {
    if (field === "locations") {
      merged[field] = normalizeProviderLocations(current[field]?.length ? current[field] : incoming[field], current.address || incoming.address || "");
      return;
    }
    merged[field] = normalizeText(current[field] || incoming[field] || "");
  });
  merged.createdAt = [current.createdAt, incoming.createdAt].filter(Boolean).sort()[0] || new Date().toISOString();
  merged.updatedAt = [current.updatedAt, incoming.updatedAt].filter(Boolean).sort().pop() || merged.createdAt;
  return normalizeProviderRecord(merged);
}

function saveProviderRecord(input = {}) {
  const name = normalizeText(input.name || "");
  if (!name) {
    throw new Error("Ingrese el nombre del proveedor.");
  }

  syncProvidersFromPurchasesAndConfig();
  const id = normalizeText(input.id || "") || createProviderId(name);
  const nameKey = normalizeSearchKey(name);
  const duplicate = erpProviders.find((provider) =>
    provider.id !== id && normalizeSearchKey(provider.name) === nameKey
  );

  if (duplicate) {
    if (!input.id) {
      throw new Error("Ya existe un proveedor con ese nombre.");
    }
    return mergeProviderRecords(id, duplicate.id, input);
  }

  const index = erpProviders.findIndex((provider) => provider.id === id);
  const previous = index >= 0 ? erpProviders[index] : {};
  const provider = normalizeProviderRecord({
    ...previous,
    ...input,
    id,
    name,
    createdAt: previous.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (index >= 0) {
    erpProviders[index] = provider;
  } else {
    erpProviders.push(provider);
  }

  if (previous.name && normalizeSearchKey(previous.name) !== normalizeSearchKey(provider.name)) {
    renameProviderReferences(previous.name, provider.name);
  }

  ensurePurchaseOptionExists("provider", provider.name);
  saveErpProviders();
  return normalizeProviderRecord(provider, getProviderStats()[normalizeSearchKey(provider.name)] || {});
}

function mergeProviderRecords(sourceId, targetId, input = {}) {
  const sourceIndex = erpProviders.findIndex((provider) => provider.id === sourceId);
  const targetIndex = erpProviders.findIndex((provider) => provider.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new Error("No se pudo consolidar proveedores.");
  }

  const source = erpProviders[sourceIndex];
  const target = erpProviders[targetIndex];
  const merged = normalizeProviderRecord({
    ...target,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => normalizeText(value || ""))),
    id: target.id,
    name: target.name,
    createdAt: target.createdAt || source.createdAt,
    updatedAt: new Date().toISOString(),
  });

  renameProviderReferences(source.name, merged.name);
  erpProviders = erpProviders
    .filter((provider) => provider.id !== sourceId)
    .map((provider) => provider.id === targetId ? merged : provider);
  ensurePurchaseOptionExists("provider", merged.name);
  saveErpProviders();
  return normalizeProviderRecord(merged, getProviderStats()[normalizeSearchKey(merged.name)] || {});
}

function renameProviderReferences(previousName, nextName) {
  const previousKey = normalizeSearchKey(previousName || "");
  const cleanNextName = normalizeText(nextName || "");
  if (!previousKey || !cleanNextName) return;

  let purchasesChanged = false;
  erpPurchases = erpPurchases.map((purchase) => {
    if (normalizeSearchKey(purchase.provider || purchase.proveedor) !== previousKey) return purchase;
    purchasesChanged = true;
    return {
      ...purchase,
      provider: cleanNextName,
      proveedor: cleanNextName,
      updatedAt: new Date().toISOString(),
    };
  });
  if (purchasesChanged) saveErpPurchases();

  replacePurchaseProviderOption(previousName, cleanNextName);
}

function replacePurchaseProviderOption(previousName, nextName) {
  const key = "purchaseProviders";
  const previousKey = normalizeSearchKey(previousName || "");
  const cleanNextName = normalizeText(nextName || "");
  if (!previousKey || !cleanNextName) return;
  if (!Array.isArray(BOT_CONFIG[key])) BOT_CONFIG[key] = [];

  BOT_CONFIG[key] = BOT_CONFIG[key].filter((item) => normalizeSearchKey(item) !== previousKey);
  if (!BOT_CONFIG[key].some((item) => normalizeSearchKey(item) === normalizeSearchKey(cleanNextName))) {
    BOT_CONFIG[key].push(cleanNextName);
  }
  BOT_CONFIG[key].sort((a, b) => a.localeCompare(b));
  saveBotConfig();
}

function deleteProviderRecord(id) {
  const cleanId = normalizeText(id || "");
  const provider = erpProviders.find((item) => item.id === cleanId);
  if (!provider) {
    throw new Error("No encontre ese proveedor.");
  }

  const hasPurchases = erpPurchases.some((purchase) =>
    normalizeSearchKey(purchase.provider) === normalizeSearchKey(provider.name)
  );
  if (hasPurchases) {
    throw new Error("No se puede eliminar porque tiene compras asociadas. Puede editar sus datos.");
  }

  erpProviders = erpProviders.filter((item) => item.id !== cleanId);
  removePurchaseProviderOption(provider.name);
  saveErpProviders();
  return { id: cleanId, deleted: true };
}

function removePurchaseProviderOption(name) {
  const key = "purchaseProviders";
  const providerKey = normalizeSearchKey(name || "");
  if (!providerKey || !Array.isArray(BOT_CONFIG[key])) return;

  const previousLength = BOT_CONFIG[key].length;
  BOT_CONFIG[key] = BOT_CONFIG[key].filter((item) => normalizeSearchKey(item) !== providerKey);
  if (BOT_CONFIG[key].length !== previousLength) {
    saveBotConfig();
  }
}

function createProviderId(name) {
  const base = normalizeSearchKey(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `proveedor-${base || Date.now()}`;
}

function getCustomerList() {
  return Object.values(customerRecords)
    .map(normalizeCustomerRecord)
    .sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
}

function normalizeCustomerRecord(customer) {
  return {
    id: customer.id || "",
    phone: customer.phone || "",
    displayPhone: customer.displayPhone || "",
    fullName: customer.fullName || "",
    contactName: customer.contactName || "",
    aliases: Array.isArray(customer.aliases) ? customer.aliases : [],
    budgetCount: Number(customer.budgetCount || 0),
    lastEventType: customer.lastEventType || "",
    lastBudgetAt: customer.lastBudgetAt || "",
    lastSeenAt: customer.lastSeenAt || customer.updatedAt || customer.createdAt || "",
    preferences: customer.preferences || "",
    dietaryRestrictions: customer.dietaryRestrictions || "",
    notes: customer.notes || "",
    createdAt: customer.createdAt || "",
    updatedAt: customer.updatedAt || "",
  };
}

function saveCustomerFromPanel(input) {
  const fullName = normalizeText(input.fullName || "");
  const displayPhone = normalizePhoneDigits(input.displayPhone || input.phone || "");

  if (!fullName) {
    throw new Error("Ingrese el nombre del cliente.");
  }

  const fallbackId = `cliente-${normalizeSearchKey(fullName).replace(/[^a-z0-9]+/g, "-") || Date.now()}`;

  return upsertCustomerRecord(input.id || displayPhone || fallbackId, {
    displayPhone,
    fullName,
    contactName: normalizeText(input.contactName || ""),
    preferences: normalizeText(input.preferences || ""),
    dietaryRestrictions: normalizeText(input.dietaryRestrictions || ""),
    notes: normalizeText(input.notes || ""),
    source: "panel",
  });
}

function findKnownCustomer(phone, contactInfo = {}) {
  const candidates = [
    phone,
    normalizePhoneDigits(phone),
    normalizePhoneDigits(contactInfo.displayPhone),
    normalizeText(contactInfo.contactName || "").toLowerCase(),
  ].filter(Boolean);

  return Object.values(customerRecords).find((customer) => {
    const aliases = new Set([
      customer.id,
      customer.phone,
      normalizePhoneDigits(customer.phone),
      normalizePhoneDigits(customer.displayPhone),
      normalizeText(customer.fullName || "").toLowerCase(),
      normalizeText(customer.contactName || "").toLowerCase(),
      ...(customer.aliases || []).map((item) => normalizeText(item).toLowerCase()),
    ].filter(Boolean));

    return candidates.some((candidate) => aliases.has(candidate));
  });
}

function upsertCustomerRecord(phone, input = {}) {
  const known = findKnownCustomer(phone, input);
  const id = known?.id || phone || input.displayPhone || `cliente-${Date.now()}`;
  const now = new Date().toISOString();
  const aliases = new Set(known?.aliases || []);
  const displayPhone = normalizePhoneDigits(input.displayPhone || known?.displayPhone || "");
  const contactName = normalizeText(input.contactName || known?.contactName || "");
  const fullName = normalizeText(input.fullName || known?.fullName || contactName || "");

  [phone, displayPhone, contactName, fullName].filter(Boolean).forEach((value) => aliases.add(value));

  customerRecords[id] = normalizeCustomerRecord({
    ...(known || {}),
    id,
    phone: known?.phone || phone || "",
    displayPhone,
    fullName,
    contactName,
    aliases: Array.from(aliases).slice(0, 20),
    budgetCount: Number(known?.budgetCount || 0) + (input.countBudget ? 1 : 0),
    lastEventType: input.lastEventType || known?.lastEventType || "",
    lastBudgetAt: input.countBudget ? now : known?.lastBudgetAt || "",
    lastSeenAt: now,
    preferences: input.preferences !== undefined ? normalizeText(input.preferences || "") : known?.preferences || "",
    dietaryRestrictions: input.dietaryRestrictions !== undefined ? normalizeText(input.dietaryRestrictions || "") : known?.dietaryRestrictions || "",
    notes: input.notes !== undefined ? normalizeText(input.notes || "") : known?.notes || "",
    createdAt: known?.createdAt || now,
    updatedAt: now,
  });

  saveCustomerRecords();
  return customerRecords[id];
}

function applyKnownCustomerToSession(phone, session, contactInfo = {}) {
  if (!session?.data) return null;
  const known = findKnownCustomer(phone, contactInfo);

  if (!known) return null;

  if (!session.data.fullName && known.fullName) {
    session.data.fullName = known.fullName;
  }

  if (!session.data.externalPhone && known.displayPhone) {
    session.data.externalPhone = known.displayPhone;
  }

  if (!session.data.contactName && known.contactName) {
    session.data.contactName = known.contactName;
  }

  return known;
}

function getRecipeList() {
  return recipeRecords.map((recipe) => calculateRecipeCost(recipe)).sort((a, b) => a.name.localeCompare(b.name));
}

function getRecipeListForUser(user) {
  const recipes = getRecipeList();
  return canUserSeeRecipeCosts(user) ? recipes : recipes.map(stripRecipeCosts);
}

function canUserSeeRecipeCosts(user) {
  return Boolean(user) && (
    hasPanelPermission(user, "*") ||
    hasPanelPermission(user, "finance:read") ||
    hasPanelPermission(user, "finance:write") ||
    hasPanelPermission(user, "purchases:write") ||
    hasPanelPermission(user, "stock:read") ||
    hasPanelPermission(user, "quotes:write") ||
    (!isCookingRole(user) && hasPanelPermission(user, "recipes:write"))
  );
}

function isCookingRole(user) {
  return ["cocina", "cocinero"].includes(String(user?.role || "").toLowerCase());
}

function stripRecipeCosts(recipe = {}) {
  const clone = JSON.parse(JSON.stringify(recipe || {}));
  const stripItem = (item = {}) => {
    delete item.unitCost;
    delete item.cost;
    if (item.linkedRecipe) item.linkedRecipe = stripRecipeCosts(item.linkedRecipe);
    return item;
  };
  delete clone.laborHourlyCost;
  delete clone.laborCost;
  delete clone.ingredientCost;
  delete clone.totalCost;
  delete clone.costPerPortion;
  clone.items = Array.isArray(clone.items) ? clone.items.map(stripItem) : [];
  return clone;
}

function getCostSettings() {
  return {
    laborHourlyCost: parseDecimalNumber(costSettings.laborHourlyCost || 0),
    supplyProfiles: normalizeSupplyProfiles(costSettings.supplyProfiles),
    operationalOptions: normalizeOperationalOptions(costSettings.operationalOptions),
  };
}

function getCostSettingsForUser(user) {
  const settings = getCostSettings();
  if (canUserSeeRecipeCosts(user)) return settings;
  const { laborHourlyCost, ...safeSettings } = settings;
  return safeSettings;
}

function saveCostSettingsFromPanel(input) {
  costSettings = {
    ...costSettings,
    laborHourlyCost: parseDecimalNumber(input.laborHourlyCost || 0),
    supplyProfiles: parseSupplyProfilesInput(input.supplyProfilesText || input.supplyProfiles),
    operationalOptions: parseOperationalOptionsInput(input.operationalOptionsText || input.operationalOptions),
    updatedAt: new Date().toISOString(),
  };
  saveCostSettings();
  return getCostSettings();
}

function normalizeSupplyProfiles(profiles) {
  const defaults = {
    coffee: ["Cafe", "Te", "Leche", "Azucar", "Edulcorante", "Vasos termicos", "Servilletas", "Medialunas", "Jugo"],
    finger: ["Bandejas", "Servilletas cocktail", "Pinchos", "Salsas", "Panificados", "Descartables de apoyo"],
    asado: ["Carne", "Chorizo", "Morcilla", "Carbon/lenia", "Ensaladas", "Pan", "Chimichurri"],
    bebidas: ["Agua", "Gaseosas", "Hielo", "Vasos", "Conservadoras", "Vinos/espumantes segun propuesta"],
    postre: ["Cucharas", "Platos de postre", "Bases dulces", "Fruta/decoracion", "Contenedores refrigerados"],
  };
  const source = profiles && typeof profiles === "object" && !Array.isArray(profiles) ? profiles : {};
  return Object.fromEntries(Object.entries({ ...defaults, ...source }).map(([key, values]) => [
    normalizeText(key).toLowerCase(),
    Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : String(values || "").split(",").map(normalizeText).filter(Boolean),
  ]));
}

function parseSupplyProfilesInput(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return normalizeSupplyProfiles(value);
  const text = String(value ?? "").trim();
  if (!text) return normalizeSupplyProfiles({});

  const profiles = {};
  text.split(/\r?\n/).forEach((line) => {
    const [rawKey, ...rest] = line.split(":");
    const key = normalizeText(rawKey || "").toLowerCase();
    const values = rest.join(":").split(",").map(normalizeText).filter(Boolean);
    if (key && values.length) profiles[key] = values;
  });
  return normalizeSupplyProfiles(profiles);
}

function normalizeOperationalOptions(options) {
  const defaults = {
    services: ["Coffee", "Finger", "Agape", "Cocktail", "Coctel", "Cena", "Almuerzo", "Asado", "Brunch"],
    moments: ["Recepcion", "Coffee", "Comida", "Postre", "Barra", "Trasnoche", "Desayuno", "Merienda"],
    drinks: ["Agua con gas", "Agua sin gas", "Gaseosas", "Detox", "Cafe", "Te", "Vinos", "Espumantes", "Barra"],
  };
  const source = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  return Object.fromEntries(Object.entries({ ...defaults, ...source }).map(([key, values]) => [
    key,
    Array.from(new Set((Array.isArray(values) ? values : String(values || "").split(",")).map(normalizeText).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
  ]));
}

function parseOperationalOptionsInput(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return normalizeOperationalOptions(value);
  const text = String(value ?? "").trim();
  if (!text) return normalizeOperationalOptions({});

  const options = {};
  text.split(/\r?\n/).forEach((line) => {
    const [rawKey, ...rest] = line.split(":");
    const key = normalizeText(rawKey || "");
    const values = rest.join(":").split(",").map(normalizeText).filter(Boolean);
    if (key && values.length) options[key] = values;
  });
  return normalizeOperationalOptions(options);
}

function addOperationalOption(type, value) {
  const typeMap = { service: "services", services: "services", moment: "moments", moments: "moments", drink: "drinks", drinks: "drinks" };
  const key = typeMap[normalizeText(type || "").toLowerCase()];
  const cleanValue = normalizeText(value || "");
  if (!key || !cleanValue) throw new Error("Ingrese una opcion valida.");

  const options = normalizeOperationalOptions(costSettings.operationalOptions);
  if (!options[key].some((item) => normalizeSearchKey(item) === normalizeSearchKey(cleanValue))) {
    options[key].push(cleanValue);
    options[key].sort((a, b) => a.localeCompare(b));
  }

  const profiles = normalizeSupplyProfiles(costSettings.supplyProfiles);
  if (key === "services") {
    const profileKey = normalizeSearchKey(cleanValue).replace(/[^a-z0-9]+/g, "_") || cleanValue.toLowerCase();
    if (!profiles[profileKey]) profiles[profileKey] = [];
  }

  costSettings = { ...costSettings, operationalOptions: options, supplyProfiles: profiles, updatedAt: new Date().toISOString() };
  saveCostSettings();
  return getCostSettings();
}

function getRecipeProductOptions() {
  const byKey = new Map();

  for (const product of getConfigList("purchaseProducts")) {
    const key = normalizeProductKey(product);
    byKey.set(key, {
      name: product,
      unitCost: productPriceRecords[key]?.unitCost || "",
      lastPurchaseDate: productPriceRecords[key]?.lastPurchaseDate || "",
      provider: productPriceRecords[key]?.provider || "",
    });
  }

  for (const [key, record] of Object.entries(productPriceRecords)) {
    if (!byKey.has(key)) {
      byKey.set(key, {
        name: record.name,
        unitCost: record.unitCost || "",
        lastPurchaseDate: record.lastPurchaseDate || "",
        provider: record.provider || "",
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getRecipeProductOptionsForUser(user) {
  const products = getRecipeProductOptions();
  if (canUserSeeRecipeCosts(user)) return products;
  return products.map((product) => ({ name: product.name }));
}

function canUserSeeProductCosts(user) {
  return Boolean(user) && (
    hasPanelPermission(user, "*") ||
    hasPanelPermission(user, "purchases:write") ||
    hasPanelPermission(user, "stock:read") ||
    hasPanelPermission(user, "finance:read") ||
    (!isCookingRole(user) && hasPanelPermission(user, "recipes:write"))
  );
}

function getProductMasterListForUser(user) {
  const canSeeCosts = canUserSeeProductCosts(user);
  return getProductMasterList().map((product) => {
    if (canSeeCosts) return product;
    const clone = { ...product };
    delete clone.lastUnitCost;
    delete clone.previousUnitCost;
    delete clone.changePercent;
    delete clone.totalStockValue;
    return clone;
  });
}

function getRentalProviderOptionList() {
  return getProviderList().map((provider) => ({
    id: provider.id,
    name: provider.name,
    category: provider.category,
    phone: provider.phone,
    email: provider.email,
  }));
}

function getProductMasterList() {
  return _fromCache("prodmaster", CACHE_TTL, _computeProductMasterList);
}
function _computeProductMasterList() {
  const byKey = new Map();

  const touch = (name, patch = {}) => {
    const cleanName = normalizeText(name || "");
    if (!cleanName) return null;
    if (!isPurchasableProductName(cleanName)) return null;
    const key = normalizeProductKey(cleanName);
    const current = byKey.get(key) || {
      id: key,
      key,
      name: cleanName,
      category: classifyProductCategory(cleanName, patch.itemType || ""),
      defaultUnit: "",
      itemType: normalizeReceiptItemType(patch.itemType || ""),
      lastUnitCost: 0,
      previousUnitCost: 0,
      changePercent: 0,
      lastProvider: "",
      lastPurchaseDate: "",
      stockQuantity: 0,
      stockUnit: "",
      totalStockValue: 0,
      recipeCount: 0,
      purchaseCount: 0,
      orderCount: 0,
      sources: [],
      providerSuggestions: [],
      updatedAt: "",
    };

    current.name = current.name || cleanName;
    current.category = patch.category || current.category || classifyProductCategory(cleanName, patch.itemType || "");
    current.defaultUnit = patch.defaultUnit || current.defaultUnit || patch.unit || "";
    current.itemType = normalizeReceiptItemType(patch.itemType || current.itemType || "");
    current.recipeCount += Number(patch.recipeCount || 0);
    current.purchaseCount += Number(patch.purchaseCount || 0);
    current.orderCount += Number(patch.orderCount || 0);
    current.stockQuantity = roundMoney(Number(current.stockQuantity || 0) + Number(patch.stockQuantity || 0));
    current.stockUnit = patch.stockUnit || current.stockUnit || patch.unit || "";
    current.totalStockValue = roundMoney(Number(current.totalStockValue || 0) + Number(patch.totalStockValue || 0));

    if (Number(patch.lastUnitCost || 0) > 0) current.lastUnitCost = roundMoney(Number(patch.lastUnitCost || 0));
    if (Number(patch.previousUnitCost || 0) > 0) current.previousUnitCost = roundMoney(Number(patch.previousUnitCost || 0));
    if (patch.changePercent !== undefined && patch.changePercent !== "") current.changePercent = roundMoney(Number(patch.changePercent || 0));
    if (patch.lastProvider) current.lastProvider = normalizeText(patch.lastProvider);
    if (patch.lastPurchaseDate && String(patch.lastPurchaseDate) >= String(current.lastPurchaseDate || "")) current.lastPurchaseDate = patch.lastPurchaseDate;
    if (patch.updatedAt && String(patch.updatedAt) >= String(current.updatedAt || "")) current.updatedAt = patch.updatedAt;

    for (const source of patch.sources || []) {
      if (source && !current.sources.includes(source)) current.sources.push(source);
    }
    for (const provider of [patch.provider, patch.lastProvider, ...(patch.providerSuggestions || [])]) {
      const cleanProvider = normalizeText(provider || "");
      if (cleanProvider && !current.providerSuggestions.some((item) => normalizeSearchKey(item) === normalizeSearchKey(cleanProvider))) {
        current.providerSuggestions.push(cleanProvider);
      }
    }

    byKey.set(key, current);
    return current;
  };

  for (const product of getConfigList("purchaseProducts")) {
    touch(product, { sources: ["config"] });
  }

  for (const record of Object.values(productPriceRecords)) {
    touch(record.name, {
      lastUnitCost: record.unitCost,
      previousUnitCost: record.previousUnitCost,
      changePercent: record.changePercent,
      lastPurchaseDate: record.lastPurchaseDate,
      lastProvider: record.provider,
      provider: record.provider,
      updatedAt: record.updatedAt,
      sources: ["precio"],
    });
  }

  for (const recipe of getRecipeList()) {
    for (const item of recipe.items || []) {
      if (item.type === "recipe") continue;
      touch(item.name, {
        unit: item.unit,
        recipeCount: 1,
        sources: ["receta"],
      });
    }
  }

  for (const purchase of getErpPurchaseList()) {
    for (const item of purchase.lineItems || []) {
      touch(item.description || purchase.description, {
        unit: item.unit || "",
        lastUnitCost: item.unitAmount,
        lastPurchaseDate: purchase.date,
        lastProvider: purchase.provider,
        provider: purchase.provider,
        purchaseCount: 1,
        sources: ["compra"],
      });
    }
  }

  for (const order of getPurchaseOrderList()) {
    for (const item of order.items || []) {
      touch(item.productName, {
        unit: item.unit,
        provider: item.providerName || item.suggestedProvider,
        orderCount: 1,
        itemType: item.itemType,
        category: item.category,
        sources: ["orden"],
      });
    }
  }

  for (const stock of getInventoryBalanceList()) {
    touch(stock.productName, {
      unit: stock.unit,
      stockUnit: stock.unit,
      stockQuantity: stock.quantity,
      itemType: stock.itemType,
      sources: ["stock"],
    });
  }

  return Array.from(byKey.values())
    .map((product) => ({
      ...product,
      providerSuggestions: product.providerSuggestions.slice(0, 5),
      sources: product.sources.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isPurchasableProductName(name) {
  const cleanName = normalizeText(name || "");
  if (!cleanName) return false;
  const key = normalizeSearchKey(cleanName);
  const words = key.split(/\s+/).filter(Boolean);
  const hasPurchaseUnit = /\b(x\s*\d+|kg|kgs|gr|g|lt|lts|litro|litros|ml|cc|unidad|unidades|u\.?|pack|caja|bolsa|botella|lata|frasco|bidon|bandeja)\b/.test(key);
  const knownMenuName = /\b(bruschetta|empanaditas?|mini choris?|shot de|cazuelita|canastita|brioche de autor|chip de hebras|sorrentinos|peras al vino|delicadeza|fritura de estacion|torta frita|tortilla de campo)\b/.test(key);
  const descriptiveDish = /(sobre pan|pan de campo|artesanal al horno|decorad|emulsion|lluvia de|punto justo|rellen[ao]|rucula|malbec|tostado|crema de|fresca en pan)/.test(key);
  if (knownMenuName && !hasPurchaseUnit) return false;
  if (descriptiveDish && words.length > 5 && !hasPurchaseUnit) return false;
  return true;
}

function classifyProductCategory(name, itemType = "") {
  const type = normalizeReceiptItemType(itemType || "");
  if (type === "tableware") return "Vajilla";
  if (type === "equipment") return "Equipamiento";
  if (type === "rental") return "Alquiler";
  const key = normalizeSearchKey(name || "");
  if (/(plato|copa|vaso|cubierto|tenedor|cuchillo|cuchara|jarra|bandeja|fuente)/.test(key)) return "Vajilla";
  if (/(mantel|servilleta|camino|funda)/.test(key)) return "Manteleria";
  if (/(mesa|silla|tablero|caballet|living|sillon)/.test(key)) return "Mobiliario";
  if (/(caja|conservadora|contenedor|bolsa|film|papel|descartable)/.test(key)) return "Logistica";
  if (/(agua|gaseosa|vino|cerveza|jugo|hielo|detox|cafe|te)/.test(key)) return "Bebidas";
  return "Mercaderia";
}

function rememberPurchasePrices(purchase) {
  let changed = false;

  for (const item of purchase.lineItems || []) {
    const name = normalizeText(item.description || "");
    const unitCost = Number(item.unitAmount || 0);

    if (!name || !Number.isFinite(unitCost) || unitCost <= 0) {
      continue;
    }

    const key = normalizeProductKey(name);
    const previous = productPriceRecords[key] || {};
    const previousUnitCost = Number(previous.unitCost || 0);
    const changePercent = previousUnitCost > 0
      ? roundMoney(((unitCost - previousUnitCost) / previousUnitCost) * 100)
      : 0;

    productPriceRecords[key] = {
      name,
      unitCost,
      previousUnitCost,
      changePercent,
      lastPurchaseDate: purchase.fecha || new Date().toISOString().slice(0, 10),
      provider: purchase.proveedor || "",
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }

  if (changed) {
    saveProductPriceRecords();
  }
}

function normalizeProductKey(value) {
  return normalizeSearchKey(value);
}

function normalizeSearchKey(value) {
  return normalizeText(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function saveRecipeRecord(input) {
  const existingIndex = recipeRecords.findIndex((recipe) => recipe.id === input.id);
  const previous = existingIndex >= 0 ? recipeRecords[existingIndex] : {};
  const recipe = buildRecipeRecord(input, previous);

  if (existingIndex >= 0) {
    recipeRecords[existingIndex] = recipe;
  } else {
    recipeRecords.push(recipe);
  }

  saveRecipeRecords();
  return calculateRecipeCost(recipe);
}

function buildRecipeRecord(input, previous = {}) {
  const name = normalizeText(input.name || "");
  const portions = parseDecimalNumber(input.portions || input.yieldPortions || 0);
  const items = Array.isArray(input.items) ? input.items.map(normalizeRecipeItem).filter((item) => item.name) : [];
  const laborHours = parseDecimalNumber(input.laborHours || 0);
  const processRows = Array.isArray(input.processRows)
    ? input.processRows.map(normalizeRecipeProcessRow).filter((row) => row.label)
    : [];
  const miseEnPlace = Array.isArray(input.miseEnPlace)
    ? input.miseEnPlace.map(normalizeRecipeMiseTask).filter((task) => task.name)
    : [];

  if (!name) {
    throw new Error("Ingrese el nombre de la receta.");
  }

  if (!Number.isFinite(portions) || portions <= 0) {
    throw new Error("Ingrese cuantas porciones rinde la receta.");
  }

  if (!items.length) {
    throw new Error("Ingrese al menos un ingrediente.");
  }

  const now = new Date().toISOString();
  return {
    id: previous.id || input.id || `receta-${Date.now()}`,
    name,
    category: normalizeText(input.category || previous.category || ""),
    portions,
    yieldUnit: normalizeRecipeYieldUnit(input.yieldUnit || previous.yieldUnit || "unidad"),
    laborHours,
    productionTimeHours: parseDecimalNumber(input.productionTimeHours || 0),
    assemblyTimeMinutes: parseDecimalNumber(input.assemblyTimeMinutes || 0),
    assemblyPeople: parseDecimalNumber(input.assemblyPeople || 0),
    assemblyQuantity: parseDecimalNumber(input.assemblyQuantity || 0),
    assemblyUnit: normalizeText(input.assemblyUnit || ""),
    processRows,
    miseEnPlace,
    items,
    platePhoto: normalizeRecipePhoto(input.platePhoto || previous.platePhoto || null),
    notes: normalizeText(input.notes || ""),
    createdAt: previous.createdAt || now,
    updatedAt: now,
  };
}

function submitRecipeEditForReview(input, user) {
  const previous = input.id ? recipeRecords.find((recipe) => recipe.id === input.id) : null;
  const safeInput = user?.role === "cocina" && previous
    ? preserveRecipeCostsFromPrevious(input, previous)
    : input;
  const next = buildRecipeRecord(safeInput, previous || {});
  const before = previous ? calculateRecipeCost(previous) : null;
  const after = calculateRecipeCost(next);
  const now = new Date().toISOString();
  const review = {
    id: `revision-receta-${Date.now()}`,
    recipeId: next.id,
    recipeName: next.name,
    status: "pending",
    requestedBy: user?.id || "",
    requestedByName: user?.displayName || user?.username || "",
    requestedAt: now,
    before,
    next: after,
    changes: getRecipeEditChanges(before, after),
  };
  pendingRecipeEdits = pendingRecipeEdits.filter((item) =>
    !(item.status === "pending" && item.recipeId === review.recipeId && item.requestedBy === review.requestedBy)
  );
  pendingRecipeEdits.push(review);
  savePendingRecipeEdits();
  return review;
}

function preserveRecipeCostsFromPrevious(input = {}, previous = {}) {
  const previousItems = Array.isArray(previous.items) ? previous.items : [];
  const nextItems = Array.isArray(input.items) ? input.items : [];
  return {
    ...input,
    laborHours: previous.laborHours,
    items: nextItems.map((item) => {
      const previousItem = findMatchingRecipeItem(item, previousItems);
      return {
        ...item,
        unitCost: previousItem?.unitCost ?? item.unitCost ?? "",
      };
    }),
  };
}

function findMatchingRecipeItem(item = {}, candidates = []) {
  const key = normalizeSearchKey(item.recipeId || item.name || "");
  const type = normalizeText(item.type || "product");
  return candidates.find((candidate) =>
    normalizeText(candidate.type || "product") === type &&
    (
      (item.recipeId && candidate.recipeId && normalizeSearchKey(candidate.recipeId) === normalizeSearchKey(item.recipeId)) ||
      normalizeSearchKey(candidate.name || "") === key
    )
  );
}

function getPendingRecipeEditList() {
  return pendingRecipeEdits
    .filter((item) => item.status === "pending")
    .sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));
}

function approvePendingRecipeEdit(id, user) {
  const index = pendingRecipeEdits.findIndex((item) => item.id === id && item.status === "pending");
  if (index < 0) throw new Error("No encontre esa revision pendiente.");
  const review = pendingRecipeEdits[index];
  const before = recipeRecords.find((recipe) => recipe.id === review.recipeId) || null;
  const recipe = saveRecipeRecord(review.next);
  pendingRecipeEdits[index] = {
    ...review,
    status: "approved",
    resolvedAt: new Date().toISOString(),
    resolvedBy: user?.displayName || user?.username || "",
  };
  savePendingRecipeEdits();
  recordAudit(user, "approve", "recipe", recipe.id, `Revision aprobada - ${recipe.name}`, before, recipe, { reviewId: id });
  return { reviewId: id, recipe };
}

function rejectPendingRecipeEdit(id, user, reason = "") {
  const index = pendingRecipeEdits.findIndex((item) => item.id === id && item.status === "pending");
  if (index < 0) throw new Error("No encontre esa revision pendiente.");
  const review = pendingRecipeEdits[index];
  pendingRecipeEdits[index] = {
    ...review,
    status: "rejected",
    reason: normalizeText(reason || ""),
    resolvedAt: new Date().toISOString(),
    resolvedBy: user?.displayName || user?.username || "",
  };
  savePendingRecipeEdits();
  recordAudit(user, "reject", "recipe", review.recipeId, `Revision rechazada - ${review.recipeName}`, review.before, review.next, { reviewId: id, reason });
  return { reviewId: id };
}

function getRecipeEditChanges(before, after) {
  const fields = [
    ["Nombre", before?.name, after?.name],
    ["Categoria", before?.category, after?.category],
    ["Rinde", before ? `${before.portions} ${before.yieldUnit || ""}` : "", `${after.portions} ${after.yieldUnit || ""}`],
    ["Horas personal", before?.laborHours, after?.laborHours],
    ["Tiempo elaboracion", before?.productionTimeHours, after?.productionTimeHours],
    ["Tiempo armado", before?.assemblyTimeMinutes, after?.assemblyTimeMinutes],
    ["Personas armado", before?.assemblyPeople, after?.assemblyPeople],
    ["Cantidad armada", before ? `${before.assemblyQuantity || ""} ${before.assemblyUnit || ""}` : "", `${after.assemblyQuantity || ""} ${after.assemblyUnit || ""}`],
    ["Notas", before?.notes, after?.notes],
    ["Foto plato", before?.platePhoto?.name || "", after?.platePhoto?.name || ""],
  ].map(([label, previousValue, nextValue]) => ({
    label,
    before: normalizeText(previousValue ?? ""),
    after: normalizeText(nextValue ?? ""),
    changed: normalizeText(previousValue ?? "") !== normalizeText(nextValue ?? ""),
  })).filter((item) => item.changed);

  return {
    fields,
    ingredients: diffRecipeCollections(before?.items || [], after.items || [], (item) => `${item.type}:${normalizeSearchKey(item.name)}`),
    processRows: diffRecipeCollections(before?.processRows || [], after.processRows || [], (item) => `${item.type}:${normalizeSearchKey(item.label)}`),
    miseEnPlace: diffRecipeCollections(before?.miseEnPlace || [], after.miseEnPlace || [], (item) => `${item.moment}:${normalizeSearchKey(item.name)}`),
  };
}

function diffRecipeCollections(beforeItems, afterItems, getKey) {
  const beforeMap = new Map(beforeItems.map((item) => [getKey(item), item]));
  const afterMap = new Map(afterItems.map((item) => [getKey(item), item]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, item] of afterMap.entries()) {
    if (!beforeMap.has(key)) {
      added.push(item);
    } else if (JSON.stringify(beforeMap.get(key)) !== JSON.stringify(item)) {
      changed.push({ before: beforeMap.get(key), after: item });
    }
  }
  for (const [key, item] of beforeMap.entries()) {
    if (!afterMap.has(key)) removed.push(item);
  }

  return { added, removed, changed };
}

function normalizeRecipeItem(item) {
  const type = ["product", "recipe"].includes(item.type) ? item.type : "product";
  return {
    type,
    recipeId: type === "recipe" ? normalizeText(item.recipeId || "") : "",
    name: normalizeText(item.name || ""),
    quantity: parseDecimalNumber(item.quantity || 0),
    unit: normalizeRecipeIngredientUnit(item.unit || ""),
    unitCost: parseDecimalNumber(item.unitCost || 0),
    wastePercent: parseDecimalNumber(item.wastePercent || 0),
  };
}

function normalizeRecipeProcessRow(row) {
  const allowedTypes = new Set(["raw", "clean", "waste", "cooked", "finished", "portion", "note"]);
  const type = allowedTypes.has(row.type) ? row.type : "note";

  return {
    type,
    label: normalizeText(row.label || ""),
    quantity: type === "note" ? 0 : parseDecimalNumber(row.quantity || 0),
    unit: type === "note" ? "" : normalizeRecipeIngredientUnit(row.unit || ""),
    notes: normalizeText(row.notes || ""),
    photos: normalizeRecipePhotos(row.photos || []),
  };
}

function normalizeRecipeMiseTask(task = {}) {
  const allowedMoments = new Set(["day_before", "event_morning", "before_departure", "on_site", "other"]);
  const rawMoment = normalizeSearchKey(task.moment || task.momentLabel || "");
  const momentAliases = {
    "dia anterior": "day_before",
    "manana del evento": "event_morning",
    "antes de salir": "before_departure",
    "en sitio": "on_site",
    otro: "other",
  };
  const moment = allowedMoments.has(task.moment) ? task.moment : (momentAliases[rawMoment] || "other");
  return {
    name: normalizeText(task.name || task.task || ""),
    moment,
    momentLabel: normalizeText(task.momentLabel || ""),
    estimatedTime: normalizeText(task.estimatedTime || task.time || ""),
    owner: normalizeText(task.owner || task.responsible || ""),
    conservation: normalizeText(task.conservation || ""),
    shelfLife: normalizeText(task.shelfLife || task.expiry || ""),
    notes: normalizeText(task.notes || ""),
    completed: Boolean(task.completed),
  };
}

function normalizeRecipePhoto(photo = {}) {
  if (!photo || typeof photo !== "object") return null;
  const dataUrl = normalizeText(photo.dataUrl || photo.url || "");
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(dataUrl)) return null;
  return {
    id: normalizeText(photo.id || `foto-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: normalizeText(photo.name || "foto-receta.jpg"),
    caption: normalizeText(photo.caption || ""),
    dataUrl,
    uploadedAt: photo.uploadedAt || new Date().toISOString(),
  };
}

function normalizeRecipePhotos(photos = []) {
  if (!Array.isArray(photos)) return [];
  return photos.map(normalizeRecipePhoto).filter(Boolean).slice(0, 8);
}

function calculateRecipeCost(recipe, stack = []) {
  const recipeId = recipe?.id || "";
  if (recipeId && stack.includes(recipeId)) {
    return {
      ...recipe,
      items: [],
      laborHours: parseDecimalNumber(recipe.laborHours || 0),
      laborCost: 0,
      ingredientCost: 0,
      totalCost: 0,
      costPerPortion: 0,
      circularReference: true,
    };
  }

  const items = (recipe.items || []).map((item) => {
    const quantity = parseDecimalNumber(item.quantity || 0);
    const linkedRecipe = item.type === "recipe" ? findRecipeById(item.recipeId) : null;
    const linkedRecipeCost = linkedRecipe
      ? calculateRecipeCost(linkedRecipe, [...stack, recipeId])
      : null;
    const unitCost = linkedRecipeCost
      ? linkedRecipeCost.costPerPortion
      : parseDecimalNumber(item.unitCost || 0);
    const wastePercent = Math.max(0, parseDecimalNumber(item.wastePercent || 0));
    const cost = getRecipeCostQuantity(quantity, item.unit) * unitCost * (1 + wastePercent / 100);
    return {
      ...item,
      quantity,
      unitCost,
      wastePercent,
      cost,
      linkedRecipe: linkedRecipeCost
        ? {
            id: linkedRecipeCost.id,
            name: linkedRecipeCost.name,
            portions: linkedRecipeCost.portions,
            yieldUnit: linkedRecipeCost.yieldUnit,
            costPerPortion: linkedRecipeCost.costPerPortion,
            items: linkedRecipeCost.items,
          }
        : null,
    };
  });
  const ingredientCost = items.reduce((sum, item) => sum + item.cost, 0);
  const laborHours = parseDecimalNumber(recipe.laborHours || 0);
  const laborCost = laborHours * getCostSettings().laborHourlyCost;
  const totalCost = ingredientCost + laborCost;
  const portions = parseDecimalNumber(recipe.portions || 0);

  return {
    ...recipe,
    laborHours,
    productionTimeHours: parseDecimalNumber(recipe.productionTimeHours || 0),
    assemblyTimeMinutes: parseDecimalNumber(recipe.assemblyTimeMinutes || 0),
    assemblyPeople: parseDecimalNumber(recipe.assemblyPeople || 0),
    assemblyQuantity: parseDecimalNumber(recipe.assemblyQuantity || 0),
    assemblyUnit: recipe.assemblyUnit || "",
    processRows: Array.isArray(recipe.processRows) ? recipe.processRows : [],
    miseEnPlace: Array.isArray(recipe.miseEnPlace) ? recipe.miseEnPlace.map(normalizeRecipeMiseTask).filter((task) => task.name) : [],
    platePhoto: normalizeRecipePhoto(recipe.platePhoto || null),
    yieldUnit: normalizeRecipeYieldUnit(recipe.yieldUnit || "unidad"),
    laborHourlyCost: getCostSettings().laborHourlyCost,
    laborCost,
    ingredientCost,
    items,
    totalCost,
    costPerPortion: portions > 0 ? totalCost / portions : 0,
  };
}

function normalizeRecipeYieldUnit(value) {
  const unit = normalizeText(value || "").toLowerCase();
  const allowed = new Set(["unidad", "kg", "litros"]);
  return allowed.has(unit) ? unit : "unidad";
}

function normalizeRecipeIngredientUnit(value) {
  const unit = normalizeText(value || "").toLowerCase();
  if (["g", "gr", "gramo", "gramos"].includes(unit)) return "gramos";
  if (["l", "lt", "lts", "litro", "litros"].includes(unit)) return "litros";
  if (["u", "un", "unidad", "unidades"].includes(unit)) return "unidad";
  if (["kg", "kilo", "kilos"].includes(unit)) return "kg";
  if (unit === "ml") return "ml";
  if (unit === "min") return "min";
  if (unit === "hs") return "hs";
  return unit || "kg";
}

function findRecipeById(id) {
  return recipeRecords.find((recipe) => recipe.id === id) || null;
}

function getRecipeCostQuantity(quantity, unit) {
  const normalizedUnit = normalizeRecipeIngredientUnit(unit || "");

  if (normalizedUnit === "gramos") return quantity / 1000;
  if (normalizedUnit === "ml") return quantity / 1000;
  return quantity;
}

function normalizeRecipeProductionQuantity(quantity, unit) {
  const value = parseDecimalNumber(quantity || 0);
  if (!value) return 0;
  const normalizedUnit = normalizeText(unit || "").toLowerCase();

  if (["gramos", "g", "gr", "ml"].includes(normalizedUnit) || isDiscreteRecipeUnit(normalizedUnit)) {
    return Math.ceil(value);
  }

  return roundToDecimals(value, 3);
}

function isDiscreteRecipeUnit(unit) {
  return [
    "unidad",
    "unidades",
    "porcion",
    "porción",
    "porciones",
    "cazuela",
    "cazuelas",
    "botella",
    "botellas",
    "lata",
    "latas",
    "vaso",
    "vasos",
    "copa",
    "copas",
    "bandeja",
    "bandejas",
    "contenedor",
    "contenedores",
    "pieza",
    "piezas",
  ].includes(unit);
}

function roundToDecimals(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function parseDecimalNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : raw.replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function deleteRecipeRecord(id) {
  const before = recipeRecords.length;
  recipeRecords = recipeRecords.filter((recipe) => recipe.id !== id);

  if (recipeRecords.length === before) {
    throw new Error("No encontre esa receta.");
  }

  saveRecipeRecords();
}

function getErpDashboard() {
  const events = getErpEventList();
  const quotes = getErpQuoteList();
  const purchases = getErpPurchaseList();
  const today = getDateOnly(new Date());
  const upcomingEvents = events.filter((event) =>
    event.eventDate &&
    event.eventDate >= today &&
    ["confirmed", "production"].includes(event.status)
  );
  const confirmedEvents = events.filter((event) => ["confirmed", "production"].includes(event.status));
  const completedEvents = events.filter((event) => event.status === "done");
  const openQuotes = quotes.filter((quote) => ["draft", "sent", "negotiation"].includes(quote.status));
  const acceptedQuotes = quotes.filter((quote) => quote.status === "accepted");
  const pendingPurchases = purchases.filter((purchase) => purchase.paymentStatus !== "Pagado");
  const marginEvents = events.filter((event) => ["confirmed", "production", "done"].includes(event.status));
  const estimatedRevenue = marginEvents.reduce((sum, event) => sum + Number(event.quoteTotal || 0), 0);
  const estimatedCost = marginEvents.reduce((sum, event) => sum + Number(event.finalCostTotal || 0), 0);
  const pendingPurchaseAmount = pendingPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const statusCounts = events.reduce((counts, event) => {
    counts[event.status] = (counts[event.status] || 0) + 1;
    return counts;
  }, {});
  const conformityUploaded = events.filter((event) => event.clientConformity?.fileName).length;
  const conformityPending = events.filter((event) =>
    ["confirmed", "production", "done"].includes(event.status) &&
    !event.clientConformity?.fileName &&
    !event.conformityWaiver?.approved
  ).length;

  return {
    eventsTotal: events.length,
    upcomingEvents: upcomingEvents.length,
    confirmedEvents: confirmedEvents.length,
    completedEvents: completedEvents.length,
    openQuotes: openQuotes.length,
    acceptedQuotes: acceptedQuotes.length,
    estimatedRevenue: roundMoney(estimatedRevenue),
    estimatedCost: roundMoney(estimatedCost),
    estimatedMargin: roundMoney(estimatedRevenue - estimatedCost),
    estimatedMarginPercent: estimatedRevenue > 0 ? roundMoney(((estimatedRevenue - estimatedCost) / estimatedRevenue) * 100) : 0,
    pendingPurchaseAmount: roundMoney(pendingPurchaseAmount),
    statusCounts,
    conformityUploaded,
    conformityPending,
    purchases: getPurchaseDashboard(purchases),
    pipeline: getPipelineBoard().columns.map((column) => ({
      id: column.id,
      label: column.label,
      count: column.items.length,
    })),
    alerts: buildErpAlerts(events, quotes, purchases),
  };
}

function getFinanceDashboard() {
  const events = getErpEventList()
    .filter((event) => isCollectableEvent(event))
    .map(toFinanceEventRecord)
    .sort((a, b) => String(a.eventDate || "9999-12-31").localeCompare(String(b.eventDate || "9999-12-31")));
  const purchases = getErpPurchaseList();
  const supplierDebt = roundMoney(purchases.reduce((sum, purchase) => sum + Number(purchase.pendingAmount || (purchase.paymentStatus === "Pagado" ? 0 : purchase.totalAmount || 0)), 0));
  const reimbursementGroups = getPayerReimbursementGroups(purchases);
  const reimbursementPendingTotal = roundMoney(reimbursementGroups.reduce((sum, group) => sum + Number(group.pendingAmount || 0), 0));
  const reimbursementCreditTotal = roundMoney(reimbursementGroups.reduce((sum, group) => sum + Number(group.creditAmount || 0), 0));
  const reimbursementPaidTotal = roundMoney(reimbursementGroups.reduce((sum, group) => sum + Number(group.reimbursedAmount || 0), 0));
  const salesTotal = roundMoney(events.reduce((sum, event) => sum + Number(event.saleTotal || 0), 0));
  const collectedTotal = roundMoney(events.reduce((sum, event) => sum + Number(event.collectedAmount || 0), 0));
  const pendingCollectionTotal = roundMoney(events.reduce((sum, event) => sum + Number(event.pendingCollectionAmount || 0), 0));
  const today = getDateOnly(new Date());
  const overdueCollectionTotal = roundMoney(events
    .filter((event) => event.collectionStatus !== "paid" && event.collectionDueDate && event.collectionDueDate < today)
    .reduce((sum, event) => sum + Number(event.pendingCollectionAmount || 0), 0));
  const upcomingCollectionTotal = roundMoney(events
    .filter((event) => event.collectionStatus !== "paid" && (!event.collectionDueDate || event.collectionDueDate >= today))
    .reduce((sum, event) => sum + Number(event.pendingCollectionAmount || 0), 0));

  return {
    summary: {
      salesTotal,
      collectedTotal,
      pendingCollectionTotal,
      overdueCollectionTotal,
      upcomingCollectionTotal,
      supplierDebt,
      reimbursementPendingTotal,
      reimbursementCreditTotal,
      reimbursementPaidTotal,
      projectedBalance: roundMoney(collectedTotal + pendingCollectionTotal - supplierDebt - reimbursementPendingTotal + reimbursementCreditTotal),
      eventsCount: events.length,
    },
    events,
    reimbursements: reimbursementGroups,
  };
}

function isCollectableEvent(event = {}) {
  return ["confirmed", "production", "done"].includes(event.status) && Number(event.quoteTotal || event.servicePriceTotal || 0) > 0;
}

function normalizeStaffList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map(normalizeStaffRecord)
    .filter((item) => item.fullName);
}

function normalizeStaffRecord(input = {}) {
  const now = new Date().toISOString();
  return {
    id: normalizeText(input.id || `personal-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    fullName: normalizeText(input.fullName || input.name || ""),
    role: normalizeText(input.role || input.position || ""),
    phone: normalizeText(input.phone || input.telefono || ""),
    email: normalizeText(input.email || ""),
    documentId: normalizeText(input.documentId || input.dni || input.cuil || ""),
    address: normalizeText(input.address || ""),
    availability: normalizeText(input.availability || "A definir"),
    hourlyRate: roundMoney(parseOptionalNumber(input.hourlyRate || input.valorHora || 0)),
    salaryMode: normalizeText(input.salaryMode || "hourly"),
    status: normalizeStaffStatus(input.status || "active"),
    notes: normalizeText(input.notes || ""),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function normalizeStaffStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["inactive", "inactivo", "baja"].includes(key)) return "inactive";
  if (["paused", "pausado", "licencia"].includes(key)) return "paused";
  return "active";
}

function getStaffList() {
  return normalizeStaffList(erpStaff)
    .map((staff) => ({
      ...staff,
      statusLabel: getStaffStatusLabel(staff.status),
      shiftsCount: erpStaffShifts.filter((shift) => shift.staffId === staff.id).length,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function getStaffStatusLabel(status) {
  return {
    active: "Activo",
    paused: "Pausado",
    inactive: "Inactivo",
  }[status] || "Activo";
}

function saveStaffRecord(input = {}) {
  const now = new Date().toISOString();
  const id = normalizeText(input.id || "");
  const index = erpStaff.findIndex((item) => item.id === id);
  const previous = index >= 0 ? erpStaff[index] : {};
  const staff = normalizeStaffRecord({
    ...previous,
    ...input,
    id: id || previous.id || `personal-${Date.now()}`,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });
  if (!staff.fullName) throw new Error("Ingrese el nombre del integrante.");
  if (index >= 0) erpStaff[index] = staff;
  else erpStaff.push(staff);
  saveErpStaff();
  return staff;
}

function normalizeStaffShiftList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map(normalizeStaffShiftRecord)
    .filter((item) => item.staffId || item.staffName);
}

function normalizeStaffShiftRecord(input = {}) {
  const staff = erpStaff.find((item) => item.id === input.staffId) || {};
  const event = erpEvents.find((item) => item.id === input.eventId) || {};
  const startTime = normalizeText(input.startTime || input.start || "");
  const endTime = normalizeText(input.endTime || input.end || "");
  const hours = input.hours !== undefined && input.hours !== ""
    ? parseOptionalNumber(input.hours)
    : calculateHoursBetween(startTime, endTime);
  const hourlyRate = roundMoney(parseOptionalNumber(input.hourlyRate || staff.hourlyRate || 0));
  const extrasAmount = roundMoney(parseOptionalNumber(input.extrasAmount || 0));
  const totalAmount = roundMoney(hours * hourlyRate + extrasAmount);
  return {
    id: normalizeText(input.id || `asistencia-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    staffId: normalizeText(input.staffId || staff.id || ""),
    staffName: normalizeText(input.staffName || staff.fullName || ""),
    documentId: normalizeText(input.documentId || input.dni || staff.documentId || ""),
    eventId: normalizeText(input.eventId || event.id || ""),
    eventName: normalizeText(input.eventName || event.name || ""),
    date: normalizePanelDate(input.date || event.eventDate || "") || getDateOnly(new Date()),
    role: normalizeText(input.role || staff.role || ""),
    startTime,
    endTime,
    hours: roundMoney(hours),
    hourlyRate,
    extrasAmount,
    totalAmount,
    attendanceStatus: normalizeAttendanceStatus(input.attendanceStatus || input.status || "scheduled"),
    notes: normalizeText(input.notes || ""),
    source: normalizeText(input.source || ""),
    period: normalizeText(input.period || ""),
    breakMinutes: Math.max(0, parseOptionalNumber(input.breakMinutes || 0)),
    loadedBy: normalizeText(input.loadedBy || ""),
    administrativeStatus: normalizeHrAdministrativeStatus(input.administrativeStatus || input.reviewStatus || ""),
    biometricEventIds: Array.isArray(input.biometricEventIds) ? input.biometricEventIds.map(normalizeText).filter(Boolean) : [],
    deletedAt: normalizeText(input.deletedAt || input.voidedAt || ""),
    deletedBy: normalizeText(input.deletedBy || input.voidedBy || ""),
    deletedReason: normalizeText(input.deletedReason || input.voidReason || ""),
    deletedNote: normalizeText(input.deletedNote || input.voidNote || ""),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function normalizeHrAdministrativeStatus(status = "") {
  const key = normalizeSearchKey(status || "");
  if (["approved", "aprobada", "aprobado"].includes(key)) return "approved";
  if (["exported", "exportada", "exportado"].includes(key)) return "exported";
  if (["liquidated", "liquidada", "liquidado"].includes(key)) return "liquidated";
  if (["voided", "anulada", "anulado", "deleted", "eliminada", "eliminado"].includes(key)) return "voided";
  if (["observed", "observada", "observado"].includes(key)) return "observed";
  return "";
}

function isStaffShiftDeleted(shift = {}) {
  return Boolean(shift.deletedAt) || ["voided", "deleted"].includes(normalizeHrAdministrativeStatus(shift.administrativeStatus || ""));
}

function calculateHoursBetween(startTime, endTime) {
  const parseTime = (value) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) + Number(match[2]) / 60;
  };
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null) return 0;
  return roundMoney((end >= start ? end - start : end + 24 - start));
}

function normalizeAttendanceStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["present", "presente", "realizado"].includes(key)) return "present";
  if (["absent", "ausente", "falto"].includes(key)) return "absent";
  if (["cancelled", "cancelado"].includes(key)) return "cancelled";
  return "scheduled";
}

function getAttendanceStatusLabel(status) {
  return {
    scheduled: "Programado",
    present: "Presente",
    absent: "Ausente",
    cancelled: "Cancelado",
  }[status] || "Programado";
}

function getStaffShiftList() {
  return normalizeStaffShiftList(erpStaffShifts)
    .filter((shift) => !isStaffShiftDeleted(shift))
    .map((shift) => ({ ...shift, attendanceStatusLabel: getAttendanceStatusLabel(shift.attendanceStatus) }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function buildHrTimesheetExportRows(searchParams = new URLSearchParams()) {
  const period = normalizeText(searchParams.get("period") || getDateOnly(new Date()).slice(0, 7));
  const eventId = normalizeText(searchParams.get("eventId") || "");
  const staffId = normalizeText(searchParams.get("staffId") || "");
  const staffName = normalizeText(searchParams.get("staffName") || "");
  const date = normalizePanelDate(searchParams.get("date") || "");
  const status = normalizeText(searchParams.get("status") || "");
  const source = normalizeText(searchParams.get("source") || "");
  const missingStaff = normalizeText(searchParams.get("missingStaff") || "");
  const staffNameKey = normalizeSearchKey(staffName);
  const staffById = new Map(erpStaff.map((staff) => [staff.id, staff]));
  const eventById = new Map(erpEvents.map((event) => [event.id, event]));

  return normalizeStaffShiftList(erpStaffShifts)
    .filter((shift) => !isStaffShiftDeleted(shift))
    .filter((shift) => !period || String(shift.date || "").startsWith(`${period}-`))
    .filter((shift) => !eventId || (shift.eventId || "") === eventId)
    .filter((shift) => !staffId || (shift.staffId || "") === staffId)
    .filter((shift) => {
      if (!staffNameKey) return true;
      const staff = staffById.get(shift.staffId) || {};
      const exportedNameKey = normalizeSearchKey(shift.staffName || staff.fullName || "");
      return exportedNameKey === staffNameKey || exportedNameKey.includes(staffNameKey);
    })
    .filter((shift) => !date || (shift.date || "") === date)
    .filter((shift) => !source || normalizeSearchKey(shift.source || "manual") === normalizeSearchKey(source))
    .filter((shift) => !missingStaff || !shift.staffId)
    .filter((shift) => !status || getHrShiftExportStatus(shift) === status || (status === "complete" && getHrShiftExportStatus(shift) === "approved") || (status === "partial" && getHrShiftExportStatus(shift) === "unreviewed"))
    .sort((a, b) => {
      const byDate = String(a.date || "").localeCompare(String(b.date || ""));
      if (byDate) return byDate;
      const byEvent = String(a.eventName || "").localeCompare(String(b.eventName || ""));
      if (byEvent) return byEvent;
      return String(a.staffName || "").localeCompare(String(b.staffName || ""));
    })
    .map((shift) => {
      const staff = staffById.get(shift.staffId) || {};
      const event = eventById.get(shift.eventId) || {};
      return {
        Mes: String(shift.period || shift.date || "").slice(0, 7),
        Fecha: shift.date || "",
        Dia: getSpanishWeekdayName(shift.date),
        Evento: shift.eventName || event.name || "",
        Persona: shift.staffName || staff.fullName || "",
        DNI: shift.documentId || staff.documentId || "",
        Telefono: staff.phone || "",
        "Rol/tarea": shift.role || staff.role || "",
        Entrada: shift.startTime || "",
        Salida: shift.endTime || "",
        Descanso: shift.breakMinutes ? `${shift.breakMinutes} min` : "",
        "Horas calculadas": roundMoney(shift.hours || 0),
        Nota: cleanTimesheetExportNote(shift.notes || ""),
        Estado: getHrShiftExportStatusLabel(getHrShiftExportStatus(shift)),
        "Cargado por": shift.loadedBy || "",
        "Fecha de carga/actualizacion": shift.updatedAt || shift.createdAt || "",
      };
    });
}

function getHrShiftExportAlerts(shift = {}) {
  const alerts = [];
  if (!shift.staffId) alerts.push("sin_legajo");
  if (!shift.documentId) alerts.push("sin_dni");
  if (!shift.startTime) alerts.push("sin_entrada");
  if (shift.startTime && !shift.endTime) alerts.push("entrada_sin_salida");
  if (!Number(shift.hours || 0)) alerts.push("horas_0");
  if (Number(shift.hours || 0) > 12) alerts.push("jornada_larga");
  if (!shift.staffId && !shift.staffName) alerts.push("falta_persona");
  if (!shift.eventId && !shift.eventName) alerts.push("sin_evento_labor");
  if (shift.startTime && shift.endTime && shift.endTime < shift.startTime) alerts.push("horario_inconsistente");
  return alerts;
}

function getHrShiftExportStatus(shift = {}) {
  const adminStatus = normalizeHrAdministrativeStatus(shift.administrativeStatus || "");
  if (adminStatus === "voided") return "voided";
  if (adminStatus === "liquidated") return "liquidated";
  if (adminStatus === "exported") return "exported";
  if (adminStatus === "approved") return "approved";
  if (adminStatus === "observed") return "observed";
  const notes = normalizeSearchKey(shift.notes || "");
  if (notes.includes("exportado")) return "exported";
  if (notes.includes("observado") || getHrShiftExportAlerts(shift).length) return "observed";
  if (shift.attendanceStatus === "present" && Number(shift.hours || 0) > 0) return "approved";
  return "unreviewed";
}

function getHrShiftExportStatusLabel(status = "") {
  return {
    unreviewed: "Sin revisar",
    observed: "Observado",
    approved: "Aprobado",
    exported: "Exportado",
    liquidated: "Liquidado",
    voided: "Anulado",
  }[status] || "Sin revisar";
}

function getSpanishWeekdayName(date = "") {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"][parsed.getDay()] || "";
}

function cleanTimesheetExportNote(notes = "") {
  return String(notes || "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item && !/^Descanso\s+/i.test(item) && !/^Carga mensual/i.test(item))
    .join(" | ");
}

function saveStaffShiftRecord(input = {}) {
  const id = normalizeText(input.id || "");
  const index = erpStaffShifts.findIndex((item) => item.id === id);
  const previous = index >= 0 ? erpStaffShifts[index] : {};
  const shift = normalizeStaffShiftRecord({
    ...previous,
    ...input,
    id: id || previous.id || `asistencia-${Date.now()}`,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!shift.staffId && !shift.staffName) throw new Error("Seleccione una persona.");
  if (index >= 0) erpStaffShifts[index] = shift;
  else erpStaffShifts.push(shift);
  saveErpStaffShifts();
  return shift;
}

function deleteStaffShiftRecord(input = {}, user = null) {
  const id = normalizeText(input.id || "");
  if (!id) throw new Error("Falta el identificador del horario.");
  const index = erpStaffShifts.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("No se encontro el horario.");
  const previous = normalizeStaffShiftRecord(erpStaffShifts[index]);
  if (isStaffShiftDeleted(previous)) throw new Error("Ese horario ya esta anulado.");
  const payrollUses = normalizePayrollRecordList(erpPayrollRecords).filter((payroll) => (payroll.shiftIds || []).includes(id));
  if (payrollUses.length) throw new Error("No se puede eliminar un horario incluido en una liquidacion. Primero corregi la liquidacion.");
  const reason = normalizeText(input.reason || input.deletedReason || "");
  if (!reason) throw new Error("Indique el motivo de eliminacion.");
  const now = new Date().toISOString();
  const deleted = normalizeStaffShiftRecord({
    ...previous,
    administrativeStatus: "voided",
    deletedAt: now,
    deletedBy: normalizeText(user?.username || user?.displayName || "sistema"),
    deletedReason: reason,
    deletedNote: normalizeText(input.note || input.deletedNote || ""),
    updatedAt: now,
  });
  erpStaffShifts[index] = deleted;
  saveErpStaffShifts();
  return { shift: deleted, payrollUses: payrollUses.length };
}

function saveStaffTimesheet(input = {}, user = null) {
  const staffId = normalizeText(input.staffId || "");
  const staffNameInput = normalizeText(input.staffName || "");
  const period = normalizeText(input.period || getDateOnly(new Date()).slice(0, 7));
  const eventId = normalizeText(input.eventId || "");
  const staff = erpStaff.find((item) => item.id === staffId);
  const staffName = normalizeText(staff?.fullName || staffNameInput);
  const documentId = normalizeText(input.documentId || staff?.documentId || "");
  const event = erpEvents.find((item) => item.id === eventId) || {};
  const days = Array.isArray(input.days) ? input.days : [];
  if (!staffId && !staffName) throw new Error("Ingrese o seleccione una persona.");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Seleccione un mes valido.");
  const normalizedDays = days
    .map((day) => ({
      date: normalizePanelDate(day.date || ""),
      startTime: normalizeText(day.startTime || ""),
      endTime: normalizeText(day.endTime || ""),
      breakMinutes: Math.max(0, parseOptionalNumber(day.breakMinutes || 0)),
      notes: normalizeText(day.notes || ""),
    }))
    .filter((day) => day.date && day.date.startsWith(`${period}-`));
  if (!normalizedDays.length) throw new Error("Seleccione al menos un dia trabajado.");

  if (!hasPanelPermission(user, "hr:write")) {
    const protectedShift = normalizeStaffShiftList(erpStaffShifts).find((shift) => {
      if (isStaffShiftDeleted(shift)) return false;
      if (staffId ? shift.staffId !== staffId : normalizeSearchKey(shift.staffName) !== normalizeSearchKey(staffName)) return false;
      if ((shift.source || "") !== "timesheet") return false;
      if ((shift.period || "").slice(0, 7) !== period) return false;
      if ((shift.eventId || "") !== eventId) return false;
      return ["approved", "exported", "liquidated", "voided"].includes(getHrShiftExportStatus(shift));
    });
    if (protectedShift) {
      throw new Error("La carga incluye horarios aprobados, exportados, liquidados o anulados. Debe corregirlos RRHH.");
    }
  }

  erpStaffShifts = normalizeStaffShiftList(erpStaffShifts).filter((shift) => {
    if (isStaffShiftDeleted(shift)) return true;
    if (staffId ? shift.staffId !== staffId : normalizeSearchKey(shift.staffName) !== normalizeSearchKey(staffName)) return true;
    if ((shift.source || "") !== "timesheet") return true;
    if ((shift.period || "").slice(0, 7) !== period) return true;
    if ((shift.eventId || "") !== eventId) return true;
    return false;
  });

  const saved = normalizedDays.map((day) => {
    const rawHours = calculateHoursBetween(day.startTime, day.endTime);
    const breakHours = Math.max(0, Number(day.breakMinutes || 0) / 60);
    const personKey = staffId || normalizeSearchKey(staffName).replace(/[^a-z0-9]+/g, "-") || "sin-legajo";
    return normalizeStaffShiftRecord({
      id: `asistencia-${personKey}-${day.date}-${eventId || "sin-evento"}`,
      staffId,
      staffName,
      documentId,
      eventId,
      eventName: event.name || normalizeText(input.eventName || ""),
      date: day.date,
      role: normalizeText(input.role || staff?.role || ""),
      startTime: day.startTime,
      endTime: day.endTime,
      hours: Math.max(0, roundMoney(rawHours - breakHours)),
      hourlyRate: staff?.hourlyRate || 0,
      extrasAmount: 0,
      attendanceStatus: "present",
      notes: [day.notes, day.breakMinutes ? `Descanso ${day.breakMinutes} min` : "", `Carga mensual ${period}`].filter(Boolean).join(" | "),
      source: "timesheet",
      period,
      breakMinutes: day.breakMinutes,
      loadedBy: normalizeText(user?.username || ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  erpStaffShifts.push(...saved);
  saveErpStaffShifts();
  return {
    staffId,
    staffName,
    period,
    eventId,
    eventName: event.name || "",
    days: saved.length,
    totalHours: roundMoney(saved.reduce((sum, shift) => sum + Number(shift.hours || 0), 0)),
  };
}

function getDigitsOnly(value = "") {
  return String(value || "").replace(/\D+/g, "");
}

function findStaffForPanelUser(user = {}) {
  const userDocument = getDigitsOnly(user.documentId || user.dni || user.cuil || "");
  const usernameDocument = getDigitsOnly(user.username || "");
  const documentCandidates = [userDocument, usernameDocument].filter((value) => value && value.length >= 6);
  if (documentCandidates.length) {
    const byDocument = erpStaff.find((staff) => {
      const staffDocument = getDigitsOnly(staff.documentId || "");
      return staffDocument && documentCandidates.some((candidate) => staffDocument === candidate || staffDocument.endsWith(candidate) || candidate.endsWith(staffDocument));
    });
    if (byDocument) return byDocument;
  }

  const explicitStaffId = normalizeText(user.staffId || user.hrStaffId || "");
  if (explicitStaffId) {
    const explicit = erpStaff.find((staff) => staff.id === explicitStaffId);
    if (explicit) return explicit;
  }

  const userPhone = getDigitsOnly(user.phone || "");
  if (userPhone) {
    const byPhone = erpStaff.find((staff) => {
      const staffPhone = getDigitsOnly(staff.phone || "");
      return staffPhone && (staffPhone === userPhone || staffPhone.endsWith(userPhone) || userPhone.endsWith(staffPhone));
    });
    if (byPhone) return byPhone;
  }

  const candidates = [
    user.displayName,
    user.name,
    user.username,
  ].map(normalizeSearchKey).filter(Boolean);
  if (candidates.length) {
    return erpStaff.find((staff) => {
      const staffName = normalizeSearchKey(staff.fullName || "");
      return staffName && candidates.some((candidate) => staffName === candidate || staffName.includes(candidate) || candidate.includes(staffName));
    }) || null;
  }
  return null;
}

function getEmployeeAttendanceIdentity(user = {}) {
  const staff = findStaffForPanelUser(user);
  const fallbackName = normalizeText(user.displayName || user.username || "Empleado");
  const fallbackDocument = getDigitsOnly(user.documentId || user.dni || user.cuil || user.username || "");
  return {
    staff,
    staffId: staff?.id || "",
    staffName: staff?.fullName || fallbackName,
    documentId: staff?.documentId || fallbackDocument,
    role: staff?.role || user.area || "",
    linked: Boolean(staff?.id),
  };
}

function getEmployeeAttendancePortal(user = {}) {
  const identity = getEmployeeAttendanceIdentity(user);
  const today = getArgentinaDateOnly(new Date());
  const visibleShifts = normalizeStaffShiftList(erpStaffShifts)
    .filter((shift) => !isStaffShiftDeleted(shift))
    .filter((shift) => {
      if (identity.staffId) return shift.staffId === identity.staffId;
      return normalizeSearchKey(shift.staffName || "") === normalizeSearchKey(identity.staffName || "");
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const todayShift = visibleShifts.find((shift) => shift.date === today) || null;
  return {
    user: getPublicUser(user),
    staff: identity.staff ? {
      id: identity.staff.id,
      fullName: identity.staff.fullName,
      documentId: identity.staff.documentId,
      role: identity.staff.role,
      phone: identity.staff.phone,
      status: identity.staff.status,
    } : null,
    linked: identity.linked,
    documentId: identity.documentId,
    today,
    todayShift,
    recentShifts: visibleShifts.slice(0, 12),
  };
}

function getArgentinaDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function getArgentinaDateOnly(date = new Date()) {
  return getArgentinaDateTimeParts(date).date;
}

function getArgentinaTimeValue(date = new Date()) {
  return getArgentinaDateTimeParts(date).time;
}

function saveEmployeeAttendanceFromPortal(user = {}, input = {}) {
  const identity = getEmployeeAttendanceIdentity(user);
  if (!identity.staffName) throw new Error("No se pudo identificar el usuario.");

  const action = normalizeSearchKey(input.action || "");
  if (!["entrada", "salida", "clock_in", "clock_out"].includes(action)) {
    throw new Error("Accion no valida.");
  }

  const now = new Date();
  const today = getArgentinaDateOnly(now);
  const currentTime = getArgentinaTimeValue(now);
  const note = normalizeText(input.notes || "");
  const existingIndex = erpStaffShifts.findIndex((shift) => {
    if (isStaffShiftDeleted(shift)) return false;
    if (shift.date !== today) return false;
    if (identity.staffId) return shift.staffId === identity.staffId && ["employee_portal", "timesheet", ""].includes(shift.source || "");
    return normalizeSearchKey(shift.staffName || "") === normalizeSearchKey(identity.staffName || "") && ["employee_portal", "timesheet", ""].includes(shift.source || "");
  });
  const previous = existingIndex >= 0 ? erpStaffShifts[existingIndex] : {};
  const isExit = action === "salida" || action === "clock_out";
  const startTime = isExit ? (previous.startTime || "") : currentTime;
  const endTime = isExit ? currentTime : (previous.endTime || "");
  if (isExit && !startTime) throw new Error("Primero registre la entrada.");
  if (!isExit && previous.startTime && !previous.endTime) throw new Error("Ya hay una entrada abierta para hoy.");

  const notes = [
    cleanEmployeeAttendanceNote(previous.notes || ""),
    note,
    `Carga empleado: ${user.username || user.displayName || "usuario"}`,
    identity.linked ? "" : "Sin legajo asociado",
  ].filter(Boolean).join(" | ");

  const shift = normalizeStaffShiftRecord({
    ...previous,
    id: previous.id || `asistencia-empleado-${identity.staffId || normalizeSearchKey(identity.staffName).replace(/[^a-z0-9]+/g, "-")}-${today}`,
    staffId: identity.staffId,
    staffName: identity.staffName,
    documentId: identity.documentId,
    eventName: previous.eventName || "Jornada laboral",
    date: today,
    role: identity.role || previous.role || "",
    startTime,
    endTime,
    attendanceStatus: "present",
    notes,
    source: "employee_portal",
    period: today.slice(0, 7),
    loadedBy: normalizeText(user.username || ""),
    createdAt: previous.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  });
  if (existingIndex >= 0) erpStaffShifts[existingIndex] = shift;
  else erpStaffShifts.push(shift);
  saveErpStaffShifts();
  return {
    action: isExit ? "salida" : "entrada",
    linked: identity.linked,
    shift,
  };
}

function cleanEmployeeAttendanceNote(notes = "") {
  return String(notes || "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item && !/^Carga empleado:/i.test(item) && !/^Sin legajo asociado$/i.test(item))
    .join(" | ");
}

function getBiometricDashboard(searchParams = new URLSearchParams()) {
  const service = getZktecoService();
  const filters = {
    limit: Number(searchParams.get?.("limit") || 100),
    deviceSerial: searchParams.get?.("deviceSerial") || "",
    deviceEmployeeId: searchParams.get?.("deviceEmployeeId") || "",
    staffId: searchParams.get?.("staffId") || "",
    status: searchParams.get?.("status") || "",
    from: searchParams.get?.("from") || "",
    to: searchParams.get?.("to") || "",
  };
  const staffById = new Map(erpStaff.map((staff) => [staff.id, staff]));
  const status = service.getStatus();
  const links = service.listLinks().map((link) => ({
    ...link,
    staffName: staffById.get(link.staffId)?.fullName || link.data?.staffName || "",
  }));
  const events = service.listEvents(filters).map((event) => ({
    ...event,
    staffName: staffById.get(event.linkedStaffId)?.fullName || "",
  }));
  return {
    status,
    links,
    events,
    unlinked: service.listUnlinkedEvents(50).map((event) => ({
      ...event,
      staffName: "",
    })),
  };
}

function reprocessBiometricEvents(input = {}, user = null) {
  const service = getZktecoService();
  const eventIds = Array.isArray(input.eventIds) ? input.eventIds.map(normalizeText).filter(Boolean) : [];
  const filters = eventIds.length ? { limit: 500 } : { status: input.includeProcessed ? "" : "received", limit: 500 };
  let events = service.listEvents(filters).filter((event) => event.linkedStaffId);
  if (eventIds.length) {
    const wanted = new Set(eventIds);
    events = events.filter((event) => wanted.has(event.id));
  }
  if (!events.length) {
    return { processedEvents: 0, savedShifts: 0, skipped: [], message: "No hay fichadas vinculadas pendientes." };
  }
  const built = buildAttendanceShiftsFromBiometricEvents({
    events,
    staff: erpStaff,
    existingShifts: erpStaffShifts,
    debounceSeconds: ZKTECO_CONFIG.debounceSeconds,
    timezone: ZKTECO_CONFIG.timezone,
  });
  const savedShifts = [];
  built.shifts.forEach((shift) => {
    const previousIndex = erpStaffShifts.findIndex((item) => item.id === shift.id);
    const previous = previousIndex >= 0 ? erpStaffShifts[previousIndex] : null;
    if (previous && previous.source && previous.source !== "zkteco") {
      built.skipped.push({ shiftId: shift.id, reason: "MANUAL_SHIFT_EXISTS" });
      return;
    }
    const normalized = normalizeStaffShiftRecord({
      ...previous,
      ...shift,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (previousIndex >= 0) erpStaffShifts[previousIndex] = normalized;
    else erpStaffShifts.push(normalized);
    savedShifts.push(normalized);
  });
  if (savedShifts.length) saveErpStaffShifts();
  const debouncedEventIds = built.skipped
    .filter((item) => item.eventId && item.reason === "DEBOUNCE")
    .map((item) => item.eventId);
  const processedEventIds = Array.from(new Set([...built.processedEventIds, ...debouncedEventIds]));
  if (processedEventIds.length) service.markEventsProcessed(processedEventIds, "processed");
  const skippedManualEventIds = built.skipped
    .filter((item) => item.eventId && item.reason === "MANUAL_SHIFT_EXISTS")
    .map((item) => item.eventId);
  if (skippedManualEventIds.length) service.markEventsProcessed(skippedManualEventIds, "error", "Existe asistencia manual para ese empleado y fecha.");
  recordAudit(
    user,
    "reprocess",
    "biometric_events",
    `lote-${Date.now()}`,
    "Reprocesamiento ZKTeco",
    null,
    { processedEvents: processedEventIds.length, savedShifts: savedShifts.length, skipped: built.skipped.length }
  );
  return {
    processedEvents: processedEventIds.length,
    savedShifts: savedShifts.length,
    skipped: built.skipped,
  };
}

function normalizePayrollRecordList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map(normalizePayrollRecord)
    .filter((item) => item.staffId || item.staffName);
}

function normalizePayrollRecord(input = {}) {
  const shiftIds = Array.isArray(input.shiftIds) ? input.shiftIds.map(normalizeText).filter(Boolean) : [];
  const linkedShifts = shiftIds.length
    ? erpStaffShifts.filter((shift) => shiftIds.includes(shift.id) && !isStaffShiftDeleted(shift))
    : [];
  const hours = input.hours !== undefined && input.hours !== ""
    ? parseOptionalNumber(input.hours)
    : linkedShifts.reduce((sum, shift) => sum + Number(shift.hours || 0), 0);
  const baseAmount = input.baseAmount !== undefined && input.baseAmount !== ""
    ? parseOptionalNumber(input.baseAmount)
    : linkedShifts.reduce((sum, shift) => sum + Number(shift.totalAmount || 0), 0);
  const additions = parseOptionalNumber(input.additions || 0);
  const deductions = parseOptionalNumber(input.deductions || 0);
  return {
    id: normalizeText(input.id || `sueldo-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    staffId: normalizeText(input.staffId || ""),
    staffName: normalizeText(input.staffName || ""),
    period: normalizeText(input.period || getDateOnly(new Date()).slice(0, 7)),
    shiftIds,
    hours: roundMoney(hours),
    baseAmount: roundMoney(baseAmount),
    additions: roundMoney(additions),
    deductions: roundMoney(deductions),
    totalAmount: roundMoney(baseAmount + additions - deductions),
    paymentStatus: normalizePaymentLifecycleStatus(input.paymentStatus || "pending"),
    paymentDate: normalizePanelDate(input.paymentDate || "") || "",
    notes: normalizeText(input.notes || ""),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function normalizePaymentLifecycleStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["approved", "aprobada", "aprobado"].includes(key)) return "approved";
  if (["paid", "pagada", "pagado"].includes(key)) return "paid";
  if (["rejected", "rechazada", "rechazado"].includes(key)) return "rejected";
  return "pending";
}

function getPayrollList() {
  return normalizePayrollRecordList(erpPayrollRecords)
    .sort((a, b) => String(b.period || "").localeCompare(String(a.period || "")));
}

function savePayrollRecord(input = {}) {
  const id = normalizeText(input.id || "");
  const index = erpPayrollRecords.findIndex((item) => item.id === id);
  const previous = index >= 0 ? erpPayrollRecords[index] : {};
  const staff = erpStaff.find((item) => item.id === (input.staffId || previous.staffId)) || {};
  const requestedShiftIds = Array.isArray(input.shiftIds) ? input.shiftIds.map(normalizeText).filter(Boolean) : [];
  const allowedShiftIds = requestedShiftIds.filter((shiftId) => {
    const shift = erpStaffShifts.find((item) => item.id === shiftId);
    return shift && !isStaffShiftDeleted(shift) && ["approved", "exported"].includes(getHrShiftExportStatus(shift));
  });
  const payroll = normalizePayrollRecord({
    ...previous,
    ...input,
    id: id || previous.id || `sueldo-${Date.now()}`,
    staffName: input.staffName || previous.staffName || staff.fullName || "",
    shiftIds: requestedShiftIds.length ? allowedShiftIds : (input.shiftIds || previous.shiftIds || []),
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!payroll.staffId && !payroll.staffName) throw new Error("Seleccione una persona para liquidar.");
  if (index >= 0) erpPayrollRecords[index] = payroll;
  else erpPayrollRecords.push(payroll);
  saveErpPayroll();
  return payroll;
}

function getHrDashboard() {
  const staff = getStaffList();
  const shifts = getStaffShiftList();
  const payroll = getPayrollList();
  const pendingPayroll = payroll.filter((item) => item.paymentStatus !== "paid");
  return {
    summary: {
      activeStaff: staff.filter((item) => item.status === "active").length,
      shiftsCount: shifts.length,
      pendingPayrollAmount: roundMoney(pendingPayroll.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)),
      pendingPayrollCount: pendingPayroll.length,
    },
    staff,
    shifts,
    payroll,
  };
}

function hasFullHrDashboardAccess(user) {
  return hasPanelPermission(user, "hr:read")
    || hasPanelPermission(user, "hr:write")
    || hasPanelPermission(user, "payroll:read")
    || hasPanelPermission(user, "payroll:write");
}

function getHrTimesheetStaffView(staff = {}) {
  return {
    id: normalizeText(staff.id || ""),
    fullName: normalizeText(staff.fullName || ""),
    documentId: normalizeText(staff.documentId || ""),
    phone: normalizeText(staff.phone || ""),
    role: normalizeText(staff.role || ""),
    status: normalizeStaffStatus(staff.status || "active"),
  };
}

function getHrTimesheetShiftView(shift = {}) {
  const normalized = normalizeStaffShiftRecord(shift);
  return {
    id: normalized.id,
    staffId: normalized.staffId,
    staffName: normalized.staffName,
    documentId: normalized.documentId,
    eventId: normalized.eventId,
    eventName: normalized.eventName,
    date: normalized.date,
    role: normalized.role,
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    hours: normalized.hours,
    breakMinutes: normalized.breakMinutes,
    notes: normalized.notes,
    source: normalized.source,
    period: normalized.period,
    attendanceStatus: normalized.attendanceStatus,
    loadedBy: normalized.loadedBy,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

function getHrTimesheetDashboard() {
  const staff = getStaffList().map(getHrTimesheetStaffView);
  const shifts = getStaffShiftList().map(getHrTimesheetShiftView);
  return {
    summary: {
      activeStaff: staff.filter((item) => item.status === "active").length,
      shiftsCount: shifts.length,
    },
    staff,
    shifts,
  };
}

function getHrDashboardForUser(user) {
  return hasFullHrDashboardAccess(user) ? getHrDashboard() : getHrTimesheetDashboard();
}

function getOperationalShiftInput(input = {}, user = null) {
  const requestedSource = normalizeText(input.source || "manual");
  return {
    id: normalizeText(input.id || ""),
    staffId: normalizeText(input.staffId || ""),
    staffName: normalizeText(input.staffName || ""),
    documentId: normalizeText(input.documentId || input.dni || ""),
    eventId: normalizeText(input.eventId || ""),
    eventName: normalizeText(input.eventName || ""),
    date: normalizeText(input.date || ""),
    role: normalizeText(input.role || ""),
    startTime: normalizeText(input.startTime || input.start || ""),
    endTime: normalizeText(input.endTime || input.end || ""),
    hours: input.hours,
    breakMinutes: input.breakMinutes,
    notes: normalizeText(input.notes || ""),
    source: ["manual", "timesheet"].includes(requestedSource) ? requestedSource : "manual",
    period: normalizeText(input.period || ""),
    attendanceStatus: normalizeText(input.attendanceStatus || input.status || "present"),
    administrativeStatus: "",
    loadedBy: normalizeText(user?.username || user?.displayName || ""),
  };
}

const SANITATION_CATEGORIES = {
  temperatura:      "Temperatura equipos",
  limpieza:         "Limpieza",
  recepcion:        "Recepción materia prima",
  control_producto: "Control del producto",
  produccion:       "Producción",
  despacho:         "Control de despacho",
  reuniones:        "Reuniones / Capacitaciones",
  documentacion:    "Documentación / Decomiso",
};

function normalizeSanitationCategory(value) {
  return ["temperatura","limpieza","recepcion","control_producto","produccion","despacho","reuniones","documentacion"].includes(value) ? value : "documentacion";
}

function getSanitationCategoryLabel(cat) {
  const labels = { temperatura:"Temperatura equipos", limpieza:"Limpieza", recepcion:"Recepción materia prima", control_producto:"Control del producto", produccion:"Producción", despacho:"Control de despacho", reuniones:"Reuniones / Capacitaciones", documentacion:"Documentación / Decomiso" };
  return labels[cat] || "Documentación";
}

function normalizeSanitationRecordList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map(normalizeSanitationRecord)
    .filter((item) => item.id);
}

function normalizeSanitationRecord(input = {}) {
  const recordType = normalizeSanitationType(input.recordType || input.type || "document");
  const recordCategory = normalizeSanitationCategory(input.recordCategory || "documentacion");
  const approvalStatus = normalizeSanitationApprovalStatus(input.approvalStatus || input.status || "pending");
  return {
    id: normalizeText(input.id || `broma-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    recordCategory,
    recordCategoryLabel: getSanitationCategoryLabel(recordCategory),
    recordType,
    recordTypeLabel: getSanitationTypeLabel(recordType),
    // campos comunes
    date: normalizePanelDate(input.date || "") || getDateOnly(new Date()),
    hora: normalizeText(input.hora || ""),
    responsable: normalizeText(input.responsable || input.responsible || ""),
    observaciones: normalizeText(input.observaciones || input.observations || input.reason || ""),
    // campos específicos por categoría
    temperatura: normalizeText(input.temperatura || input.temperature || ""),
    patente: normalizeText(input.patente || ""),
    proveedor: normalizeText(input.proveedor || input.provider || ""),
    alimento: normalizeText(input.alimento || input.productName || input.product || ""),
    lote: normalizeText(input.lote || input.batch || ""),
    cantidad: normalizeText(input.cantidad || input.quantity || ""),
    estadoRecepcion: normalizeText(input.estadoRecepcion || ""),
    ph: normalizeText(input.ph || ""),
    peso: normalizeText(input.peso || ""),
    caracteristicas: normalizeText(input.caracteristicas || ""),
    destino: normalizeText(input.destino || ""),
    temas: normalizeText(input.temas || ""),
    conclusiones: normalizeText(input.conclusiones || ""),
    asistentes: normalizeText(input.asistentes || ""),
    // campos de documentación (compatibilidad)
    title: normalizeText(input.title || ""),
    expirationDate: normalizePanelDate(input.expirationDate || "") || "",
    actionTaken: normalizeText(input.actionTaken || input.action || ""),
    documentName: normalizeText(input.documentName || input.fileName || ""),
    documentDataUrl: String(input.documentDataUrl || ""),
    // aprobación
    approvalStatus,
    approvalStatusLabel: getSanitationApprovalStatusLabel(approvalStatus),
    approvedBy: normalizeText(input.approvedBy || ""),
    approvedAt: input.approvedAt || "",
    approvalNotes: normalizeText(input.approvalNotes || ""),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function normalizeSanitationType(value) {
  const key = normalizeSearchKey(value || "");
  if (["etiqueta", "label"].includes(key)) return "label";
  if (["vencimiento", "expiration", "vencido"].includes(key)) return "expiration";
  if (["decomiso", "decomisar", "discard", "descarte"].includes(key)) return "discard";
  if (["aprobacion", "approval", "control"].includes(key)) return "approval";
  return "document";
}

function getSanitationTypeLabel(type) {
  return { document: "Documentacion", label: "Etiqueta", expiration: "Vencimiento", discard: "Decomiso", approval: "Aprobacion" }[type] || "Documentacion";
}

function normalizeSanitationApprovalStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["approved", "aprobado", "aprobada"].includes(key)) return "approved";
  if (["rejected", "rechazado", "rechazada"].includes(key)) return "rejected";
  return "pending";
}

function getSanitationApprovalStatusLabel(status) {
  return { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado" }[status] || "Pendiente";
}

function getSanitationDashboard() {
  const records = normalizeSanitationRecordList(erpSanitationRecords)
    .sort((a, b) => {
      const da = (a.date || "") + (a.hora || "");
      const db = (b.date || "") + (b.hora || "");
      return db.localeCompare(da);
    });
  const today = getDateOnly(new Date());
  const soon = getDateOnly(addDays(new Date(), 14));
  const byCategory = {};
  Object.keys(SANITATION_CATEGORIES).forEach((cat) => {
    byCategory[cat] = records.filter((r) => r.recordCategory === cat);
  });
  return {
    summary: {
      total: records.length,
      pendingApprovals: records.filter((item) => item.approvalStatus === "pending").length,
      dueSoon: records.filter((item) => item.expirationDate && item.expirationDate >= today && item.expirationDate <= soon).length,
      expired: records.filter((item) => item.expirationDate && item.expirationDate < today).length,
      discardsPending: records.filter((item) => item.recordType === "discard" && item.approvalStatus === "pending").length,
    },
    byCategory,
    records,
  };
}

function saveSanitationRecord(input = {}, user = null) {
  const id = normalizeText(input.id || "");
  const index = erpSanitationRecords.findIndex((item) => item.id === id);
  const previous = index >= 0 ? erpSanitationRecords[index] : {};
  const record = normalizeSanitationRecord({
    ...previous,
    ...input,
    id: id || previous.id || `broma-${Date.now()}`,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    responsable: input.responsable || user?.displayName || user?.username || "",
  });
  if (index >= 0) erpSanitationRecords[index] = record;
  else erpSanitationRecords.push(record);
  saveErpSanitation();
  return record;
}

function approveSanitationRecord(input = {}, user = null) {
  const id = normalizeText(input.id || "");
  const index = erpSanitationRecords.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("No encontre ese registro bromatologico.");
  erpSanitationRecords[index] = normalizeSanitationRecord({
    ...erpSanitationRecords[index],
    approvalStatus: normalizeSanitationApprovalStatus(input.approvalStatus || "approved"),
    approvedBy: user?.displayName || user?.username || "",
    approvedAt: new Date().toISOString(),
    approvalNotes: normalizeText(input.approvalNotes || ""),
    updatedAt: new Date().toISOString(),
  });
  saveErpSanitation();
  return erpSanitationRecords[index];
}

function normalizePaymentOrderList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map(normalizePaymentOrder)
    .filter((item) => item.beneficiary || item.concept);
}

function normalizePaymentOrder(input = {}) {
  const sourceRefs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const status = normalizePaymentLifecycleStatus(input.status || "pending");
  return {
    id: normalizeText(input.id || `op-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    type: normalizePaymentOrderType(input.type || ""),
    beneficiary: normalizeText(input.beneficiary || input.provider || input.person || ""),
    beneficiaryType: normalizeText(input.beneficiaryType || ""),
    concept: normalizeText(input.concept || input.description || ""),
    amount: roundMoney(parseOptionalNumber(input.amount || 0)),
    dueDate: normalizePanelDate(input.dueDate || "") || "",
    paymentDate: normalizePanelDate(input.paymentDate || "") || "",
    paymentMethod: normalizeText(input.paymentMethod || ""),
    fundsSource: normalizeText(input.fundsSource || ""),
    status,
    statusLabel: getPaymentOrderStatusLabel(status),
    sourceRefs,
    receipt: normalizePaymentReceipt(input.receipt),
    notes: normalizeText(input.notes || ""),
    requestedBy: normalizeText(input.requestedBy || ""),
    approvedBy: normalizeText(input.approvedBy || ""),
    approvedAt: input.approvedAt || "",
    paidBy: normalizeText(input.paidBy || ""),
    paidAt: input.paidAt || "",
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function normalizePaymentOrderType(type) {
  const key = normalizeSearchKey(type || "");
  if (["salary", "sueldo", "personal"].includes(key)) return "salary";
  if (["reimbursement", "reintegro"].includes(key)) return "reimbursement";
  if (["expense", "gasto"].includes(key)) return "expense";
  return "provider";
}

function getPaymentOrderStatusLabel(status) {
  return {
    pending: "Pendiente",
    approved: "Aprobada",
    paid: "Pagada",
    rejected: "Rechazada",
  }[status] || "Pendiente";
}

function getPaymentOrderList() {
  return normalizePaymentOrderList(erpPaymentOrders)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function getPaymentOrdersDashboard() {
  const orders = getPaymentOrderList();
  return {
    summary: {
      pendingAmount: roundMoney(orders.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      approvedAmount: roundMoney(orders.filter((item) => item.status === "approved").reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      paidAmount: roundMoney(orders.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      pendingCount: orders.filter((item) => item.status === "pending").length,
      approvedCount: orders.filter((item) => item.status === "approved").length,
    },
    orders,
  };
}

function savePaymentOrder(input = {}, user = null) {
  const id = normalizeText(input.id || "");
  const index = erpPaymentOrders.findIndex((item) => item.id === id);
  const previous = index >= 0 ? erpPaymentOrders[index] : {};
  const order = normalizePaymentOrder({
    ...previous,
    ...input,
    id: id || previous.id || `op-${Date.now()}`,
    requestedBy: previous.requestedBy || user?.displayName || user?.username || "",
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!order.beneficiary) throw new Error("Ingrese el beneficiario de la orden.");
  if (!order.concept) throw new Error("Ingrese el concepto de la orden.");
  if (order.amount <= 0) throw new Error("Ingrese un monto mayor a cero.");
  if (index >= 0) erpPaymentOrders[index] = order;
  else erpPaymentOrders.push(order);
  saveErpPaymentOrders();
  return order;
}

function updatePaymentOrderStatus(input = {}, user = null) {
  const id = normalizeText(input.id || "");
  const index = erpPaymentOrders.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("No encontre esa orden de pago.");
  const status = normalizePaymentLifecycleStatus(input.status || "");
  const current = erpPaymentOrders[index];
  erpPaymentOrders[index] = normalizePaymentOrder({
    ...current,
    ...input,
    status,
    approvedBy: status === "approved" ? user?.displayName || user?.username || current.approvedBy || "" : current.approvedBy,
    approvedAt: status === "approved" ? new Date().toISOString() : current.approvedAt,
    paidBy: status === "paid" ? user?.displayName || user?.username || current.paidBy || "" : current.paidBy,
    paidAt: status === "paid" ? new Date().toISOString() : current.paidAt,
    updatedAt: new Date().toISOString(),
  });
  saveErpPaymentOrders();
  return erpPaymentOrders[index];
}

function toFinanceEventRecord(event) {
  const saleTotal = roundMoney(Number(event.quoteTotal || event.servicePriceTotal || 0));
  const collectedAmount = roundMoney(Math.min(parseDecimalNumber(event.collectedAmount || event.collectionAmount || 0), saleTotal || Number.MAX_SAFE_INTEGER));
  const pendingCollectionAmount = roundMoney(Math.max(0, saleTotal - collectedAmount));
  const collectionStatus = normalizeCollectionStatus(event.collectionStatus || event.paymentStatus, collectedAmount, saleTotal);
  const invoiceRequirement = normalizeEventInvoiceRequirement(event.invoiceRequirement || event.billingRequirement || "");
  const invoiceStatus = invoiceRequirement === "no_invoice"
    ? "not_applicable"
    : normalizeEventInvoiceStatus(event.invoiceStatus || "not_invoiced");
  return {
    id: event.id,
    name: event.name,
    eventDate: event.eventDate,
    clientName: event.clientName,
    venue: event.venue,
    serviceType: event.serviceType,
    status: event.status,
    statusLabel: getErpEventStatusLabel(event.status),
    saleTotal,
    collectedAmount,
    pendingCollectionAmount,
    collectionStatus,
    collectionStatusLabel: getCollectionStatusLabel(collectionStatus),
    collectionDueDate: event.collectionDueDate || "",
    collectionMethod: event.collectionMethod || "",
    collectionNotes: event.collectionNotes || "",
    invoiceRequirement,
    invoiceRequirementLabel: getEventInvoiceRequirementLabel(invoiceRequirement),
    invoiceStatus,
    invoiceStatusLabel: getEventInvoiceStatusLabel(invoiceStatus),
    invoiceNumber: invoiceRequirement === "no_invoice" ? "" : event.invoiceNumber || "",
  };
}

function normalizeCollectionStatus(status, collectedAmount = 0, saleTotal = 0) {
  const key = normalizeSearchKey(status || "");
  if (["paid", "pagado", "cobrado", "cancelado"].includes(key)) return "paid";
  if (["partial", "parcial"].includes(key)) return "partial";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (Number(saleTotal || 0) > 0 && Number(collectedAmount || 0) >= Number(saleTotal || 0)) return "paid";
  if (Number(collectedAmount || 0) > 0) return "partial";
  return "pending";
}

function getCollectionStatusLabel(status) {
  return {
    pending: "Pendiente",
    partial: "Parcial",
    paid: "Cobrado",
  }[status] || "Pendiente";
}

function normalizeEventInvoiceStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["not_applicable", "no_aplica", "no aplica", "no_invoice", "no_facturar"].includes(key)) return "not_applicable";
  if (["invoiced", "facturado", "facturada"].includes(key)) return "invoiced";
  return "not_invoiced";
}

function getEventInvoiceStatusLabel(status) {
  const normalized = normalizeEventInvoiceStatus(status);
  if (normalized === "not_applicable") return "No aplica";
  return normalized === "invoiced" ? "Facturado" : "No facturado";
}

function normalizeEventInvoiceRequirement(value) {
  const key = normalizeSearchKey(value || "");
  if ([
    "no_invoice",
    "no invoice",
    "no_facturar",
    "no facturar",
    "no factura",
    "sin factura",
    "no se factura",
    "no aplica",
    "not_applicable",
  ].includes(key)) return "no_invoice";
  return "invoice_required";
}

function getEventInvoiceRequirementLabel(value) {
  return normalizeEventInvoiceRequirement(value) === "no_invoice" ? "No facturar" : "Facturar";
}

function updateEventCollectionRecord(input = {}) {
  const id = normalizeText(input.id || "");
  const index = erpEvents.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("No encontre ese evento.");
  const previous = normalizeErpEvent(erpEvents[index]);
  const saleTotal = Number(previous.quoteTotal || 0);
  const collectedAmount = roundMoney(Math.max(0, parseDecimalNumber(input.collectedAmount || 0)));
  const collectionStatus = normalizeCollectionStatus(input.collectionStatus || "", collectedAmount, saleTotal);
  const invoiceRequirement = normalizeEventInvoiceRequirement(input.invoiceRequirement || previous.invoiceRequirement || "");
  erpEvents[index] = normalizeErpEvent({
    ...erpEvents[index],
    collectedAmount,
    collectionStatus,
    collectionDueDate: normalizePanelDate(input.collectionDueDate || "") || "",
    collectionMethod: normalizeText(input.collectionMethod || ""),
    collectionNotes: normalizeText(input.collectionNotes || ""),
    invoiceRequirement,
    invoiceStatus: invoiceRequirement === "no_invoice" ? "not_applicable" : normalizeEventInvoiceStatus(input.invoiceStatus || ""),
    invoiceNumber: invoiceRequirement === "no_invoice" ? "" : normalizeText(input.invoiceNumber || ""),
    paymentStatus: getCollectionStatusLabel(collectionStatus),
    updatedAt: new Date().toISOString(),
  });
  saveErpEvents();
  return erpEvents[index];
}

function getPurchaseDashboard(purchases = getErpPurchaseList()) {
  const totalAmount = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const pendingPurchases = purchases.filter((purchase) => Number(purchase.pendingAmount || 0) > 0);
  const byProvider = groupPurchaseAmount(purchases, "provider");
  const byEvent = groupPurchaseAmount(purchases.map((purchase) => ({
    ...purchase,
    imputationLabel: getPurchaseImputationLabel(purchase),
  })), "imputationLabel");
  const byPaymentMethod = groupPurchaseAmount(purchases, "paymentMethod");

  return {
    count: purchases.length,
    totalAmount: roundMoney(totalAmount),
    paidAmount: roundMoney(purchases.reduce((sum, purchase) => sum + Number(purchase.paidAmount || 0), 0)),
    pendingAmount: roundMoney(purchases.reduce((sum, purchase) => sum + Number(purchase.pendingAmount || 0), 0)),
    averageTicket: purchases.length ? roundMoney(totalAmount / purchases.length) : 0,
    providersCount: new Set(purchases.map((purchase) => normalizeSearchKey(purchase.provider)).filter(Boolean)).size,
    pendingCount: pendingPurchases.length,
    byProvider,
    byEvent,
    byPaymentMethod,
  };
}

function groupPurchaseAmount(purchases, field) {
  const grouped = new Map();

  for (const purchase of purchases) {
    const label = normalizeText(purchase[field] || "Sin definir");
    const current = grouped.get(label) || { label, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(purchase.totalAmount || 0);
    grouped.set(label, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({ ...item, total: roundMoney(item.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function normalizePurchaseOrderList(input = []) {
  return Array.isArray(input) ? input.map(normalizePurchaseOrderRecord).filter((order) => order.title || order.items.length) : [];
}

function getPurchaseOrderList() {
  return normalizePurchaseOrderList(erpPurchaseOrders)
    .map((order) => ({ ...order, receiptSummary: getPurchaseOrderReceiptSummary(order.id) }))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function normalizePurchaseOrderRecord(input = {}) {
  const event = input.eventId ? getErpEventList().find((item) => item.id === input.eventId) : null;
  const eventName = normalizeText(input.eventName || event?.name || "");
  const items = normalizePurchaseOrderItems(input.items || input.lines || []);
  return {
    id: normalizeText(input.id || `oc-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: normalizeText(input.title || input.name || (eventName ? `Orden de compra - ${eventName}` : "Orden de compra")),
    eventId: normalizeText(input.eventId || event?.id || ""),
    eventName,
    menuType: normalizeText(input.menuType || input.serviceType || event?.serviceType || ""),
    status: normalizePurchaseOrderStatus(input.status || "draft"),
    neededDate: normalizePanelDate(input.neededDate || input.date || "") || "",
    notes: normalizeText(input.notes || ""),
    showRecipeNotesForBuyer: parseBooleanLike(input.showRecipeNotesForBuyer),
    items,
    createdAt: input.createdAt || new Date().toISOString(),
    createdBy: normalizeText(input.createdBy || ""),
    updatedAt: input.updatedAt || "",
    updatedBy: normalizeText(input.updatedBy || ""),
  };
}

function normalizePurchaseOrderItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const productName = normalizeText(item.productName || item.product || item.description || item.name || "");
      const providerName = normalizeText(item.providerName || item.provider || "");
      return {
        id: normalizeText(item.id || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        productName,
        quantity: normalizeText(item.quantity || item.cantidad || ""),
        unit: normalizeText(item.unit || item.unidad || ""),
        providerName,
        suggestedProvider: normalizeText(item.suggestedProvider || suggestProviderForProduct(productName) || providerName),
        itemType: normalizeReceiptItemType(item.itemType || item.type || item.category || ""),
        category: normalizeText(item.category || ""),
        notes: normalizeText(item.notes || item.note || ""),
        checked: parseBooleanLike(item.checked),
        buyerNotes: normalizeText(item.buyerNotes || item.buyerNote || item.comment || item.comments || ""),
        checkedAt: normalizeText(item.checkedAt || ""),
        checkedBy: normalizeText(item.checkedBy || ""),
        adminShowRecipeNotes: parseBooleanLike(item.adminShowRecipeNotes),
      };
    })
    .filter((item) => item.productName);
}

function normalizePurchaseOrderStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["sent", "enviada", "enviado"].includes(key)) return "sent";
  if (["fulfilled", "comprada", "comprado", "complete", "completa"].includes(key)) return "fulfilled";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  return "draft";
}

function normalizeReceiptItemType(value) {
  const key = normalizeSearchKey(value || "");
  if (["vajilla", "tableware"].includes(key)) return "tableware";
  if (["alquiler", "alquileres", "rental", "rentals"].includes(key)) return "rental";
  if (["equipamiento", "equipo", "equipment"].includes(key)) return "equipment";
  if (["mercaderia", "mercadería", "comida", "insumo", "materia prima", "merchandise", "food"].includes(key)) return "merchandise";
  return "merchandise";
}

function getReceiptItemTypeLabel(type) {
  return {
    merchandise: "Mercaderia",
    tableware: "Vajilla",
    rental: "Alquiler",
    equipment: "Equipamiento",
  }[normalizeReceiptItemType(type)] || "Mercaderia";
}

function suggestProviderForProduct(productName) {
  const key = normalizeSearchKey(productName || "");
  if (!key) return "";
  const matches = getErpPurchaseList()
    .filter((purchase) => {
      const values = [
        purchase.description,
        ...(purchase.lineItems || []).map((item) => item.description),
      ].map((value) => normalizeSearchKey(value || "")).filter(Boolean);
      return values.some((value) => value.includes(key) || key.includes(value));
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return normalizeText(matches[0]?.provider || "");
}

function savePurchaseOrderRecord(input = {}, user = null) {
  const now = new Date().toISOString();
  const existingIndex = erpPurchaseOrders.findIndex((order) => order.id === input.id);
  const previous = existingIndex >= 0 ? erpPurchaseOrders[existingIndex] : {};
  const order = normalizePurchaseOrderRecord({
    ...previous,
    ...input,
    id: input.id || previous.id || `oc-${Date.now()}`,
    createdAt: previous.createdAt || now,
    createdBy: previous.createdBy || user?.displayName || user?.username || "",
    updatedAt: now,
    updatedBy: user?.displayName || user?.username || "",
  });

  if (!order.eventId && !order.eventName) {
    throw new Error("Seleccione el evento al que corresponde la orden de compra.");
  }
  if (!order.items.length) {
    throw new Error("Agregue al menos un producto a la orden de compra.");
  }

  if (existingIndex >= 0) {
    erpPurchaseOrders[existingIndex] = order;
  } else {
    erpPurchaseOrders.push(order);
  }
  saveErpPurchaseOrders();
  return order;
}

function getBuyerPurchaseOrderList() {
  const providersByKey = new Map(getProviderList().map((provider) => [normalizeSearchKey(provider.name), provider]));
  return getPurchaseOrderList()
    .filter((order) => !["fulfilled", "cancelled"].includes(order.status))
    .map((order) => buildBuyerPurchaseOrder(order, providersByKey))
    .filter((order) => order.items.length)
    .sort((a, b) => {
      if (b.progress.pending !== a.progress.pending) return b.progress.pending - a.progress.pending;
      return String(a.neededDate || "9999-12-31").localeCompare(String(b.neededDate || "9999-12-31"));
    });
}

function buildBuyerPurchaseOrder(order = {}, providersByKey = new Map()) {
  const items = (order.items || [])
    .map((item) => {
      const providerName = normalizeText(item.providerName || item.suggestedProvider || "Sin proveedor");
      const provider = providersByKey.get(normalizeSearchKey(providerName)) || normalizeProviderRecord({ name: providerName });
      const locations = getBuyerProviderLocations(provider, providerName);
      const showNotes = parseBooleanLike(order.showRecipeNotesForBuyer) || parseBooleanLike(item.adminShowRecipeNotes);
      return {
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        providerName,
        checked: parseBooleanLike(item.checked),
        buyerNotes: item.buyerNotes || "",
        checkedAt: item.checkedAt || "",
        checkedBy: item.checkedBy || "",
        itemType: item.itemType || "merchandise",
        note: showNotes ? item.notes || "" : "",
        locations,
        mapsUrl: locations[0]?.mapsUrl || buildMapsSearchUrl(provider.address || providerName),
      };
    })
    .sort((a, b) => Number(a.checked) - Number(b.checked) || a.providerName.localeCompare(b.providerName) || a.productName.localeCompare(b.productName));

  const providers = Array.from(items.reduce((groups, item) => {
    const key = normalizeSearchKey(item.providerName || "Sin proveedor") || "sin-proveedor";
    if (!groups.has(key)) {
      groups.set(key, {
        providerName: item.providerName || "Sin proveedor",
        locations: item.locations || [],
        mapsUrl: item.mapsUrl || "",
        pendingItems: [],
        doneItems: [],
      });
    }
    const group = groups.get(key);
    (item.checked ? group.doneItems : group.pendingItems).push(item);
    return groups;
  }, new Map()).values())
    .sort((a, b) => b.pendingItems.length - a.pendingItems.length || a.providerName.localeCompare(b.providerName));

  const total = items.length;
  const done = items.filter((item) => item.checked).length;
  const route = providers
    .filter((provider) => provider.pendingItems.length)
    .map((provider) => ({
      providerName: provider.providerName,
      pendingCount: provider.pendingItems.length,
      itemCount: provider.pendingItems.length + provider.doneItems.length,
      locations: provider.locations,
      mapsUrl: provider.mapsUrl,
    }));
  const routeUrl = buildRouteMapsUrl(route);

  return {
    id: order.id,
    title: order.title,
    eventId: order.eventId,
    eventName: order.eventName,
    menuType: order.menuType,
    status: order.status,
    neededDate: order.neededDate,
    notes: order.notes || "",
    showRecipeNotesForBuyer: parseBooleanLike(order.showRecipeNotesForBuyer),
    progress: {
      total,
      done,
      pending: total - done,
      percent: total ? Math.round((done / total) * 100) : 0,
    },
    route,
    routeUrl,
    providers,
    items,
  };
}

function getBuyerProviderLocations(provider = {}, fallbackName = "") {
  const locations = normalizeProviderLocations(provider.locations || [], provider.address || "");
  if (locations.length) {
    return locations.map((location) => ({
      ...location,
      mapsUrl: location.mapsUrl || buildMapsSearchUrl(location.address || fallbackName),
    }));
  }
  const fallback = normalizeText(provider.address || fallbackName || "Sin direccion");
  return [{
    id: "loc-1",
    name: "Principal",
    address: fallback,
    phone: provider.phone || "",
    notes: "",
    mapsUrl: buildMapsSearchUrl(fallback),
    isPrimary: true,
  }];
}

function buildMapsSearchUrl(query = "") {
  const cleanQuery = normalizeText(query || "");
  if (!cleanQuery) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
}

function buildRouteMapsUrl(route = []) {
  const stops = route
    .map((stop) => stop.locations?.[0]?.address || stop.providerName || "")
    .map((stop) => normalizeText(stop))
    .filter(Boolean);
  if (!stops.length) return "";
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination,
  });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function updateBuyerPurchaseOrderItem(input = {}, user = null) {
  const orderId = normalizeText(input.orderId || "");
  const itemId = normalizeText(input.itemId || "");
  if (!orderId || !itemId) throw new Error("No encontre el item de la orden.");

  const orderIndex = erpPurchaseOrders.findIndex((order) => order.id === orderId);
  if (orderIndex < 0) throw new Error("No encontre esa orden de compra.");

  const previousOrder = normalizePurchaseOrderRecord(erpPurchaseOrders[orderIndex]);
  const itemIndex = previousOrder.items.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) throw new Error("No encontre ese producto dentro de la orden.");

  const now = new Date().toISOString();
  const nextItems = previousOrder.items.map((item, index) => {
    if (index !== itemIndex) return item;
    const checked = Object.prototype.hasOwnProperty.call(input, "checked")
      ? parseBooleanLike(input.checked)
      : parseBooleanLike(item.checked);
    return {
      ...item,
      checked,
      buyerNotes: normalizeText(input.buyerNotes ?? item.buyerNotes ?? ""),
      checkedAt: checked ? now : "",
      checkedBy: checked ? user?.displayName || user?.username || item.checkedBy || "" : "",
    };
  });

  const nextOrder = normalizePurchaseOrderRecord({
    ...previousOrder,
    items: nextItems,
    updatedAt: now,
    updatedBy: user?.displayName || user?.username || previousOrder.updatedBy || "",
  });
  erpPurchaseOrders[orderIndex] = nextOrder;
  saveErpPurchaseOrders();

  const providersByKey = new Map(getProviderList().map((provider) => [normalizeSearchKey(provider.name), provider]));
  return buildBuyerPurchaseOrder(nextOrder, providersByKey);
}

function deletePurchaseOrderRecord(id) {
  const cleanId = normalizeText(id || "");
  if (!cleanId) throw new Error("No encontre esa orden de compra.");
  erpPurchaseOrders = erpPurchaseOrders.filter((order) => order.id !== cleanId);
  saveErpPurchaseOrders();
}

function normalizePurchaseReceiptList(input = []) {
  return Array.isArray(input) ? input.map(normalizePurchaseReceiptRecord).filter((receipt) => receipt.orderId && receipt.items.length) : [];
}

function getPurchaseReceiptList(orderId = "") {
  const cleanOrderId = normalizeText(orderId || "");
  return normalizePurchaseReceiptList(erpPurchaseReceipts)
    .filter((receipt) => !cleanOrderId || receipt.orderId === cleanOrderId)
    .sort((a, b) => String(b.receivedAt || b.updatedAt || "").localeCompare(String(a.receivedAt || a.updatedAt || "")));
}

function getReceiptUnresolvedDifferences(receipt = {}) {
  return (receipt.items || []).filter((item) =>
    (Math.abs(Number(item.difference || 0)) > 0.0001 || normalizeText(item.differenceReason || "")) &&
    !["resolved", "accepted"].includes(normalizeText(item.differenceStatus || "pending").toLowerCase())
  );
}

function hasReceiptUnresolvedDifferences(receipt = {}) {
  return getReceiptUnresolvedDifferences(receipt).length > 0;
}

function getProviderUnresolvedReceiptDifferences(providerName = "") {
  const key = normalizeSearchKey(providerName || "");
  if (!key) return [];
  return getPurchaseReceiptList().filter((receipt) =>
    receipt.status === "with_differences" &&
    hasReceiptUnresolvedDifferences(receipt) &&
    (normalizeSearchKey(receipt.providerName) === key || (receipt.items || []).some((item) => normalizeSearchKey(item.providerName) === key))
  );
}

function normalizePurchaseReceiptRecord(input = {}) {
  const order = erpPurchaseOrders.find((item) => item.id === input.orderId) || {};
  const items = normalizePurchaseReceiptItems(input.items || input.lines || [], order);
  const differences = items.filter((item) => item.difference || normalizeText(item.differenceReason || ""));
  const unresolvedDifferences = differences.filter((item) => !["resolved", "accepted"].includes(normalizeText(item.differenceStatus || "pending").toLowerCase()));
  const completed = items.filter((item) => item.status === "complete").length;
  const status = differences.length
    ? "with_differences"
    : completed >= items.length && items.length
      ? "complete"
      : items.some((item) => parseDecimalNumber(item.receivedQuantity || 0) > 0)
        ? "partial"
        : "pending";
  const acceptanceStatus = normalizeReceiptAcceptanceStatus(input.acceptanceStatus || input.approvalStatus || "", {
    status,
    unresolvedDifferences,
    convertedPurchaseId: input.convertedPurchaseId,
  });
  return {
    id: normalizeText(input.id || `recepcion-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    orderId: normalizeText(input.orderId || ""),
    orderTitle: normalizeText(input.orderTitle || order.title || ""),
    eventId: normalizeText(input.eventId || order.eventId || ""),
    eventName: normalizeText(input.eventName || order.eventName || ""),
    providerName: normalizeText(input.providerName || ""),
    receivedAt: normalizePanelDate(input.receivedAt || input.date || "") || getDateOnly(new Date()),
    receivedBy: normalizeText(input.receivedBy || ""),
    status,
    acceptanceStatus,
    hasUnresolvedDifferences: unresolvedDifferences.length > 0,
    unresolvedDifferenceCount: unresolvedDifferences.length,
    convertedPurchaseId: normalizeText(input.convertedPurchaseId || ""),
    convertedAt: input.convertedAt || "",
    convertedBy: normalizeText(input.convertedBy || ""),
    notes: normalizeText(input.notes || ""),
    items,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || "",
    updatedBy: normalizeText(input.updatedBy || ""),
  };
}

function normalizeReceiptAcceptanceStatus(value, context = {}) {
  const key = normalizeSearchKey(value || "");
  if (context.convertedPurchaseId || ["converted", "convertida", "compra"].includes(key)) return "converted";
  if (["accepted", "aceptada", "aprobada"].includes(key)) return "accepted";
  if (context.status === "complete" && !context.unresolvedDifferences?.length) return "accepted";
  return "pending";
}

function normalizePurchaseReceiptItems(items = [], order = {}) {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const incoming = Array.isArray(items) ? items : [];
  const sourceItems = incoming.length ? incoming : orderItems;
  return sourceItems
    .map((item) => {
      const orderItem = orderItems.find((orderLine) =>
        orderLine.id === item.orderItemId ||
        normalizeSearchKey(orderLine.productName) === normalizeSearchKey(item.productName || item.product || "")
      ) || {};
      const orderedQuantity = normalizeText(item.orderedQuantity || orderItem.quantity || "");
      const receivedQuantity = normalizeText(item.receivedQuantity || item.received || "");
      const orderedNumber = parseDecimalNumber(orderedQuantity || 0);
      const receivedNumber = parseDecimalNumber(receivedQuantity || 0);
      const difference = orderedNumber || receivedNumber ? roundMoney(receivedNumber - orderedNumber) : 0;
      const differenceReason = normalizeText(item.differenceReason || item.reason || "");
      const differenceStatus = normalizeReceiptDifferenceStatus(item.differenceStatus || item.resolutionStatus || item.differenceResolved);
      const status = Math.abs(difference) < 0.0001 && (receivedQuantity || orderedQuantity)
        ? "complete"
        : receivedNumber > 0
          ? "partial"
          : "pending";
      return {
        id: normalizeText(item.id || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        orderItemId: normalizeText(item.orderItemId || orderItem.id || ""),
        productName: normalizeText(item.productName || item.product || orderItem.productName || ""),
        providerName: normalizeText(item.providerName || orderItem.providerName || orderItem.suggestedProvider || ""),
        itemType: normalizeReceiptItemType(item.itemType || orderItem.itemType || ""),
        orderedQuantity,
        receivedQuantity,
        unit: normalizeText(item.unit || orderItem.unit || ""),
        unitAmount: roundMoney(parseOptionalNumber(item.unitAmount || orderItem.unitAmount || 0)),
        ivaRate: normalizeIvaRate(item.ivaRate ?? item.iva ?? orderItem.ivaRate ?? 0),
        brandRequested: normalizeText(item.brandRequested || item.requestedBrand || ""),
        brandReceived: normalizeText(item.brandReceived || item.receivedBrand || ""),
        difference,
        differenceReason,
        differenceStatus: Math.abs(difference) > 0.0001 || differenceReason ? differenceStatus : "none",
        notes: normalizeText(item.notes || item.note || ""),
        status,
      };
    })
    .filter((item) => item.productName);
}

function normalizeReceiptDifferenceStatus(value) {
  if (value === true) return "resolved";
  const key = normalizeSearchKey(value || "");
  if (["resolved", "resuelta", "resuelto", "ok"].includes(key)) return "resolved";
  if (["accepted", "aceptada", "aceptado", "aceptar"].includes(key)) return "accepted";
  return "pending";
}

function getPurchaseOrderReceiptSummary(orderId) {
  const receipts = getPurchaseReceiptList(orderId);
  const latest = receipts[0] || null;
  const order = erpPurchaseOrders.find((item) => item.id === orderId) || {};
  const totalItems = Array.isArray(order.items) ? order.items.length : 0;
  if (!latest) {
    return { status: "pending", label: "Sin recibir", totalItems, completeItems: 0, differenceItems: 0, receivedAt: "" };
  }
  const completeItems = latest.items.filter((item) => item.status === "complete").length;
  const differenceItems = latest.items.filter((item) => item.difference || item.differenceReason).length;
  return {
    status: latest.status,
    label: getPurchaseReceiptStatusLabel(latest.status),
    acceptanceStatus: latest.acceptanceStatus,
    hasUnresolvedDifferences: hasReceiptUnresolvedDifferences(latest),
    unresolvedDifferenceCount: getReceiptUnresolvedDifferences(latest).length,
    convertedPurchaseId: latest.convertedPurchaseId || "",
    totalItems: latest.items.length || totalItems,
    completeItems,
    differenceItems,
    receivedAt: latest.receivedAt,
    receiptId: latest.id,
  };
}

function getPurchaseReceiptStatusLabel(status) {
  return {
    pending: "Sin recibir",
    partial: "Parcial",
    complete: "Completa",
    with_differences: "Con diferencias",
  }[status] || "Sin recibir";
}

function savePurchaseReceiptRecord(input = {}, user = null) {
  const orderId = normalizeText(input.orderId || "");
  const order = erpPurchaseOrders.find((item) => item.id === orderId);
  if (!order) throw new Error("No encontre la orden de compra para recibir.");

  const now = new Date().toISOString();
  const existingIndex = erpPurchaseReceipts.findIndex((receipt) => receipt.id === input.id);
  const previous = existingIndex >= 0 ? erpPurchaseReceipts[existingIndex] : {};
  const receipt = normalizePurchaseReceiptRecord({
    ...previous,
    ...input,
    orderTitle: order.title,
    eventId: order.eventId,
    eventName: order.eventName,
    id: input.id || previous.id || `recepcion-${Date.now()}`,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    updatedBy: user?.displayName || user?.username || "",
    receivedBy: input.receivedBy || previous.receivedBy || user?.displayName || user?.username || "",
  });

  if (!receipt.items.length) {
    throw new Error("La recepcion debe tener al menos un producto.");
  }

  if (existingIndex >= 0) {
    erpPurchaseReceipts[existingIndex] = receipt;
  } else {
    erpPurchaseReceipts.push(receipt);
  }

  saveErpPurchaseReceipts();
  return receipt;
}

function normalizeInventoryMovementList(input = []) {
  return (Array.isArray(input) ? input : [])
    .map((item) => ({
      id: normalizeText(item.id || `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      date: normalizePanelDate(item.date || item.createdAt || "") || getDateOnly(new Date()),
      productName: normalizeText(item.productName || item.product || item.description || ""),
      itemType: normalizeReceiptItemType(item.itemType || item.type || ""),
      quantity: roundMoney(parseOptionalNumber(item.quantity || 0)),
      unit: normalizeText(item.unit || ""),
      movementType: normalizeText(item.movementType || item.typeMovement || "in"),
      providerName: normalizeText(item.providerName || item.provider || ""),
      eventId: normalizeText(item.eventId || ""),
      eventName: normalizeText(item.eventName || ""),
      sourceType: normalizeText(item.sourceType || ""),
      sourceId: normalizeText(item.sourceId || ""),
      notes: normalizeText(item.notes || ""),
      createdAt: item.createdAt || new Date().toISOString(),
    }))
    .filter((item) => item.productName && item.quantity);
}

function getInventoryMovementList() {
  return normalizeInventoryMovementList(erpInventoryMovements)
    .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
}

function getInventoryBalanceList() {
  const grouped = new Map();
  for (const movement of getInventoryMovementList()) {
    if (movement.itemType === "rental") continue;
    const key = [normalizeSearchKey(movement.productName), normalizeSearchKey(movement.unit), movement.itemType].join("|");
    const current = grouped.get(key) || {
      productName: movement.productName,
      itemType: movement.itemType,
      itemTypeLabel: getReceiptItemTypeLabel(movement.itemType),
      unit: movement.unit,
      quantity: 0,
      lastMovementDate: "",
    };
    const multiplier = movement.movementType === "out" ? -1 : 1;
    current.quantity = roundMoney(current.quantity + Number(movement.quantity || 0) * multiplier);
    current.lastMovementDate = [current.lastMovementDate, movement.date].sort().pop() || "";
    grouped.set(key, current);
  }
  return Array.from(grouped.values())
    .filter((item) => Math.abs(Number(item.quantity || 0)) > 0.0001)
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

function getDefaultOperationalInventoryCategories() {
  return [
    { id: "alimentos", label: "Alimentos", type: "consumable", subcategories: ["Freezer", "Heladera", "Deposito", "Secos"] },
    { id: "bebidas", label: "Bebidas", type: "consumable", subcategories: ["Agua", "Gaseosas", "Alcohol", "Hielo"] },
    { id: "vajilla", label: "Vajilla", type: "reusable", subcategories: ["Platos", "Copas", "Cubiertos", "Servicio"] },
    { id: "cristaleria", label: "Cristaleria", type: "reusable", subcategories: ["Copas", "Vasos", "Jarras"] },
    { id: "utensilios", label: "Utensilios", type: "reusable", subcategories: ["Cocina", "Servicio", "Barra"] },
    { id: "herramientas", label: "Herramientas", type: "reusable", subcategories: ["Cocina", "Mantenimiento"] },
    { id: "artefactos", label: "Artefactos", type: "reusable", subcategories: ["Calor", "Frio", "Electrico"] },
    { id: "contenedores", label: "Contenedores", type: "reusable", subcategories: ["Grandes", "Chicos", "Termicos"] },
    { id: "manteleria", label: "Manteleria", type: "reusable", subcategories: ["Manteles", "Caminos", "Servilletas"] },
    { id: "mobiliario", label: "Mobiliario", type: "reusable", subcategories: ["Mesas", "Tableros", "Sillas", "Barras"] },
    { id: "tecnologia", label: "Tecnologia y comunicacion", type: "reusable", subcategories: ["Handys", "Cargadores", "Audio"] },
    { id: "transporte", label: "Transporte", type: "reusable", subcategories: ["Auto", "Camioneta", "Camion", "Carros"] },
    { id: "descartables", label: "Descartables", type: "consumable", subcategories: ["Vasos", "Platos", "Servilletas"] },
    { id: "limpieza", label: "Productos de limpieza", type: "consumable", subcategories: ["Quimicos", "Paños", "Bolsas"] },
  ];
}

function normalizeOperationalInventoryData(input = {}) {
  const defaults = getDefaultOperationalInventoryCategories();
  const inputCategories = Array.isArray(input.categories) ? input.categories : [];
  const categoryMap = new Map(defaults.map((category) => [category.id, normalizeOperationalInventoryCategory(category)]));
  inputCategories.forEach((category) => {
    const normalized = normalizeOperationalInventoryCategory(category);
    if (normalized.id) categoryMap.set(normalized.id, { ...categoryMap.get(normalized.id), ...normalized });
  });
  return {
    categories: Array.from(categoryMap.values()),
    items: (Array.isArray(input.items) ? input.items : []).map(normalizeOperationalInventoryItem).filter((item) => item.name),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function normalizeOperationalInventoryCategory(input = {}) {
  const label = normalizeText(input.label || input.name || "");
  const id = normalizeText(input.id || normalizeSearchKey(label).replace(/[^a-z0-9]+/g, "_") || `categoria-${Date.now()}`);
  const type = ["consumable", "reusable"].includes(normalizeText(input.type || "").toLowerCase())
    ? normalizeText(input.type).toLowerCase()
    : "reusable";
  return {
    id,
    label: label || id,
    type,
    subcategories: Array.from(new Set((Array.isArray(input.subcategories) ? input.subcategories : String(input.subcategories || "").split(","))
      .map(normalizeText)
      .filter(Boolean))),
  };
}

function normalizeInventoryBarcode(value = "") {
  return normalizeText(value || "").replace(/\s+/g, "");
}

function normalizeInventoryInternalCode(value = "") {
  return normalizeInventoryBarcode(value).toUpperCase();
}

function isValidInventoryInternalCode(value = "") {
  const code = normalizeInventoryInternalCode(value);
  return /^GG-[0-9A-HJKMNP-TV-Z]{6}$/.test(code) && !/[ILOU]/.test(code);
}

function normalizeInventoryBarcodeAliases(input = [], primaryBarcode = "") {
  const source = Array.isArray(input)
    ? input
    : String(input || "").split(/[\n,;]+/);
  const primary = normalizeInventoryBarcode(primaryBarcode);
  return Array.from(new Set(source.map(normalizeInventoryBarcode).filter(Boolean)))
    .filter((code) => code !== primary);
}

function getInventoryBarcodesForItem(item = {}) {
  return Array.from(new Set([
    normalizeInventoryBarcode(item.barcode || ""),
    ...normalizeInventoryBarcodeAliases(item.barcodeAliases || item.barcodes || item.providerBarcodes || [], item.barcode || ""),
    normalizeInventoryInternalCode(item.internalCode || ""),
  ].filter(Boolean)));
}

function findOperationalInventoryItemByBarcode(code = "", excludeItemId = "") {
  const clean = normalizeInventoryBarcode(code);
  if (!clean) return null;
  const cleanKey = clean.toUpperCase();
  return normalizeOperationalInventoryData(erpOperationalInventory).items.find((item) => {
    if (excludeItemId && item.id === excludeItemId) return false;
    return getInventoryBarcodesForItem(item).some((itemCode) => itemCode.toUpperCase() === cleanKey);
  }) || null;
}

function cleanupInventoryInternalCodeReservations(now = Date.now()) {
  inventoryInternalCodeReservations.forEach((expiresAt, code) => {
    if (expiresAt <= now) inventoryInternalCodeReservations.delete(code);
  });
}

function generateInventoryInternalCode() {
  cleanupInventoryInternalCodeReservations();
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let suffix = "";
    for (let index = 0; index < 6; index += 1) suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    const code = `GG-${suffix}`;
    if (inventoryInternalCodeReservations.has(code)) continue;
    if (findOperationalInventoryItemByBarcode(code)) continue;
    inventoryInternalCodeReservations.set(code, Date.now() + 30 * 60 * 1000);
    return code;
  }
  throw new Error("No se pudo generar un codigo interno unico. Intente nuevamente.");
}

function normalizeOperationalInventoryItem(input = {}) {
  const categoryId = normalizeText(input.categoryId || input.category || "utensilios");
  const quantity = Math.max(0, parseDecimalNumber(input.quantity ?? input.totalQuantity ?? 1));
  const functionalFamily = normalizeFunctionalFamily(input.functionalFamily || "") || inferFunctionalFamilyFromCategory(categoryId);
  const inventoryArea = normalizeInventoryArea(input.inventoryArea || "") || normalizeInventoryDomain(input.inventoryDomain || "") || inferInventoryAreaFromFamily(functionalFamily, categoryId);
  const inventoryDomain = normalizeInventoryDomain(input.inventoryDomain || "") || inventoryArea;
  const controlType = normalizeInventoryControlType(input.controlType || "") || inferInventoryControlType(input, functionalFamily, categoryId);
  const barcode = normalizeInventoryBarcode(input.barcode || input.ean || input.sku || "");
  const internalCode = normalizeInventoryInternalCode(input.internalCode || "");
  const countMode = input.countMode === "packages" ? "packages" : "units";
  const unitsPerBundle = countMode === "packages"
    ? Math.max(0, parseDecimalNumber(input.unitsPerBundle || 0))
    : 0;
  return {
    id: normalizeText(input.id || `opinv-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: normalizeText(input.name || input.productName || input.description || ""),
    barcode,
    barcodeAliases: normalizeInventoryBarcodeAliases(input.barcodeAliases || input.barcodes || input.providerBarcodes || [], barcode)
      .filter((code) => code.toUpperCase() !== internalCode),
    internalCode,
    categoryId,
    subcategory: normalizeText(input.subcategory || ""),
    inventoryDomain,
    inventoryArea,
    functionalFamily,
    controlType,
    quantity,
    unit: normalizeText(input.unit || "unidad"),
    countMode,
    unitsPerBundle,
    minStock: Math.max(0, parseDecimalNumber(input.minStock || 0)),
    status: normalizeOperationalInventoryStatus(input.status || "available"),
    operationalStatus: normalizeInventoryOperationalStatus(input.operationalStatus || ""),
    location: normalizeText(input.location || ""),
    locationType: normalizeInventoryLocationType(input.locationType || ""),
    locationDetail: normalizeText(input.locationDetail || ""),
    usageType: normalizeInventoryUsageType(input.usageType || ""),
    notes: normalizeText(input.notes || ""),
    kitchenNotes: normalizeText(input.kitchenNotes || ""),
    condition: input.condition || null,
    conditionNotes: normalizeText(input.conditionNotes || ""),
    conditionImagePath: normalizeText(input.conditionImagePath || ""),
    conditionAt: input.conditionAt || null,
    conditionBy: normalizeText(input.conditionBy || ""),
    expiryStatus: normalizeOperationalExpiryStatus(input.expiryStatus || ""),
    expiryDate: normalizeText(input.expiryDate || ""),
    preciseLocation: normalizePreciseInventoryLocation(input.preciseLocation || {}),
    archivedAt: input.archivedAt || null,
    archivedBy: normalizeText(input.archivedBy || ""),
    archivedReason: normalizeText(input.archivedReason || ""),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function inferInventoryDomainFromCategory(categoryId = "") {
  return inferInventoryAreaFromFamily(inferFunctionalFamilyFromCategory(categoryId), categoryId);
}

function inferFunctionalFamilyFromCategory(categoryId = "") {
  const key = normalizeSearchKey(categoryId);
  if (["alimentos"].includes(key)) return "food";
  if (["bebidas"].includes(key)) return "beverages";
  if (["descartables"].includes(key)) return "disposables";
  if (["vajilla"].includes(key)) return "tableware";
  if (["cristaleria", "cristalería"].includes(key)) return "glassware";
  if (["manteleria", "mantelería"].includes(key)) return "linen_textiles";
  if (["utensilios", "ollas"].includes(key)) return "utensils";
  if (["herramientas"].includes(key)) return "tools";
  if (["artefactos", "equipamiento_cocina", "equipamiento cocina"].includes(key)) return "kitchen_equipment";
  if (["equipamiento_evento", "equipamiento evento"].includes(key)) return "event_equipment";
  if (["tecnologia", "tecnología", "handys", "comunicacion", "comunicación"].includes(key)) return "technology_communication";
  if (["mobiliario", "transporte", "estructuras"].includes(key)) return "furniture_structures";
  if (["limpieza"].includes(key)) return "cleaning";
  if (["contenedores", "cajas", "bins", "packaging"].includes(key)) return "packaging_containers";
  return "other";
}

function inferInventoryAreaFromFamily(family = "", categoryId = "") {
  const cleanFamily = normalizeFunctionalFamily(family);
  if (["food", "beverages", "utensils", "tools", "kitchen_equipment", "cleaning"].includes(cleanFamily)) return "kitchen";
  if (["disposables", "tableware", "glassware", "linen_textiles", "event_equipment", "technology_communication", "furniture_structures", "packaging_containers"].includes(cleanFamily)) return "operations";
  const key = normalizeSearchKey(categoryId);
  if (["deposito", "deposito_general", "almacen"].includes(key)) return "general_warehouse";
  return "general_warehouse";
}

function inferInventoryControlType(item = {}, family = "", categoryId = "") {
  const cleanFamily = normalizeFunctionalFamily(family || inferFunctionalFamilyFromCategory(categoryId));
  const categoryType = normalizeText(item.categoryType || item.type || "").toLowerCase();
  if (normalizeOperationalExpiryStatus(item.expiryStatus || "") || cleanFamily === "food") return "perishable";
  if (["disposables", "beverages", "cleaning"].includes(cleanFamily)) return "consumable";
  if (["tableware", "glassware", "linen_textiles", "event_equipment", "furniture_structures", "packaging_containers"].includes(cleanFamily)) return "event_returnable";
  if (["kitchen_equipment", "technology_communication"].includes(cleanFamily)) return "asset_equipment";
  if (cleanFamily === "tools" || cleanFamily === "utensils") return "reusable";
  if (categoryType === "consumable") return "consumable";
  if (categoryType === "reusable") return "reusable";
  if (normalizeInventoryUsageType(item.usageType || "") === "eventos") return "event_returnable";
  return "loose_unit";
}

function normalizeInventoryDomain(value = "") {
  const key = normalizeSearchKey(value);
  if (["equipment", "equipamiento"].includes(key)) return "";
  const area = normalizeInventoryArea(value);
  if (area) return area;
  return "";
}

function getInventoryAreaForItem(item = {}) {
  return normalizeInventoryArea(item.inventoryArea || "") || normalizeInventoryDomain(item.inventoryDomain || "") || inferInventoryAreaFromFamily(getFunctionalFamilyForItem(item), item.categoryId || item.category || "");
}

function getFunctionalFamilyForItem(item = {}) {
  return normalizeFunctionalFamily(item.functionalFamily || "") || inferFunctionalFamilyFromCategory(item.categoryId || item.category || "");
}

function getControlTypeForItem(item = {}) {
  return normalizeInventoryControlType(item.controlType || "") || inferInventoryControlType(item, getFunctionalFamilyForItem(item), item.categoryId || item.category || "");
}

function filterOperationalInventoryItemsForUser(items = [], user = null, mode = "read") {
  return (Array.isArray(items) ? items : []).filter((item) => {
    return mode === "write" ? canWriteInventoryItem(user, item) : canReadInventoryItem(user, item);
  });
}

function filterOperationalInventoryCategoriesForItems(categories = [], items = []) {
  const categoryIds = new Set((Array.isArray(items) ? items : []).map((item) => item.categoryId).filter(Boolean));
  return (Array.isArray(categories) ? categories : []).filter((category) => categoryIds.has(category.id));
}

function filterOperationalInventoryCategoriesForUser(categories = [], user = null, mode = "read") {
  return (Array.isArray(categories) ? categories : []).filter((category) => {
    const itemLike = {
      categoryId: category.id,
      functionalFamily: inferFunctionalFamilyFromCategory(category.id),
      controlType: category.type === "consumable" ? "consumable" : "reusable",
    };
    return mode === "write" ? canWriteInventoryItem(user, itemLike) : canReadInventoryItem(user, itemLike);
  });
}

function normalizeInventoryLocationType(value = "") {
  const key = normalizeSearchKey(value);
  if (["heladera", "freezer", "deposito", "cocina", "salon", "estanteria", "movil", "otro"].includes(key)) return key;
  if (["depósito"].includes(value)) return "deposito";
  if (["salón"].includes(value)) return "salon";
  if (["móvil"].includes(value)) return "movil";
  return "";
}

function normalizeInventoryUsageType(value = "") {
  const key = normalizeSearchKey(value);
  if (["cocina_diaria", "cocina diaria"].includes(key)) return "cocina_diaria";
  if (["eventos", "evento"].includes(key)) return "eventos";
  if (["mixto", "mixta"].includes(key)) return "mixto";
  return "";
}

function normalizeInventoryOperationalStatus(value = "") {
  const key = normalizeSearchKey(value);
  if (["ok", "bajo_stock", "bajo stock", "faltante", "bloqueado", "bloqueado no usar", "no usar"].includes(key)) {
    if (key.includes("bajo")) return "bajo_stock";
    if (key.includes("bloqueado") || key.includes("no usar")) return "bloqueado";
    return key;
  }
  return "";
}

function normalizeOperationalExpiryStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["vence_el", "vence el", "por_vencer", "por vencer", "proximo", "proxima"].includes(key)) return "vence_el";
  if (["vencido", "vencida"].includes(key)) return "vencido";
  return "";
}

function normalizeInventoryPackageCount(input = {}) {
  const bundles = Math.max(0, parseDecimalNumber(input.bundles || input.packageBundles || 0));
  const unitsPerBundle = Math.max(0, parseDecimalNumber(input.unitsPerBundle || input.units_per_bundle || 0));
  const looseUnits = Math.max(0, parseDecimalNumber(input.looseUnits || input.loose || 0));
  const totalUnits = bundles * unitsPerBundle + looseUnits;
  return { bundles, unitsPerBundle, looseUnits, totalUnits };
}

function validatePackageCountInput(input, qty) {
  if (input === undefined) return { ok: true, packageCount: undefined };
  if (input === null) return { ok: true, packageCount: null };
  const packageCount = normalizeInventoryPackageCount(input);
  const expectedQty = Math.max(0, parseDecimalNumber(qty || 0));
  if (packageCount.totalUnits <= 0) return { ok: false, error: "El total por bultos debe ser mayor a cero." };
  if (Math.abs(packageCount.totalUnits - expectedQty) > 0.0001) return { ok: false, error: "El total por bultos no coincide con la cantidad contada." };
  return { ok: true, packageCount };
}

function findOperationalInventoryItem(id) {
  const cleanId = normalizeText(id || "");
  if (!cleanId) return null;
  return normalizeOperationalInventoryData(erpOperationalInventory).items.find((item) => item.id === cleanId) || null;
}

function normalizePreciseInventoryLocation(input = {}) {
  return {
    deposit: normalizeText(input.deposit || input.deposito || ""),
    shelf: normalizeText(input.shelf || input.estanteria || ""),
    level: normalizeText(input.level || input.estante || input.nivel || ""),
    position: normalizeText(input.position || input.posicion || ""),
  };
}

function normalizeOperationalInventoryStatus(status) {
  const key = normalizeSearchKey(status || "");
  if (["broken", "roto", "malo", "mal_estado"].includes(key)) return "broken";
  if (["maintenance", "mantenimiento", "reparacion"].includes(key)) return "maintenance";
  if (["lost", "perdido"].includes(key)) return "lost";
  if (["inactive", "baja", "inactivo"].includes(key)) return "inactive";
  return "available";
}

function getOperationalInventoryStatusLabel(status) {
  return {
    available: "Disponible",
    broken: "Roto",
    maintenance: "Mantenimiento",
    lost: "Perdido",
    inactive: "Baja",
  }[normalizeOperationalInventoryStatus(status)] || "Disponible";
}

function getOperationalInventoryAdminView(user = null) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const visibleItems = filterOperationalInventoryItemsForUser(data.items, user, "read");
  return {
    areas: getAllowedInventoryAreas(user, "read"),
    writableAreas: getAllowedInventoryAreas(user, "write"),
    categories: filterOperationalInventoryCategoriesForUser(data.categories, user, "read"),
    items: visibleItems.map((item) => ({
      ...item,
      inventoryArea: getInventoryAreaForItem(item),
      statusLabel: getOperationalInventoryStatusLabel(item.status),
      reservedQuantity: getOperationalInventoryReservedQuantity(item, null),
      availableQuantity: Math.max(0, Number(item.quantity || 0) - getOperationalInventoryReservedQuantity(item, null)),
    })),
  };
}

function getOperationalInventoryCatalogForEvent(event = {}) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const currentReservations = normalizeOperationalInventoryReservations(event.operationalSheet?.reservations || []);
  const currentByItem = new Map(currentReservations.map((reservation) => [reservation.itemId, reservation]));
  const suggestedCategories = getSuggestedOperationalInventoryCategories(event);
  const eventText = getOperationalInventoryEventText(event);
  return {
    categories: data.categories,
    items: data.items.map((item) => {
      const current = currentByItem.get(item.id);
      const reservedElsewhere = getOperationalInventoryReservedQuantity(item, event);
      const availableQuantity = Math.max(0, Number(item.quantity || 0) - reservedElsewhere);
      const itemKey = normalizeSearchKey([item.name, item.subcategory, item.notes].join(" "));
      const suggested = suggestedCategories.has(item.categoryId)
        || (itemKey && eventText.includes(itemKey));
      const disabledReason = item.status !== "available"
        ? getOperationalInventoryStatusLabel(item.status)
        : (!current && availableQuantity <= 0 ? "Sin disponibilidad" : "");
      return {
        ...item,
        statusLabel: getOperationalInventoryStatusLabel(item.status),
        reservedQuantity: reservedElsewhere,
        availableQuantity,
        suggested,
        selected: Boolean(current),
        selectedQuantity: current?.quantity || "",
        selectedNote: current?.note || "",
        disabled: Boolean(disabledReason && !current),
        disabledReason,
      };
    }),
  };
}

function getSuggestedOperationalInventoryCategories(event = {}) {
  const categories = new Set();
  const add = (category) => categories.add(category);
  const serviceKey = normalizeServiceCategoryKey(event.serviceType || event.eventMoments || "");
  const deliveryOnly = isDeliveryOnlyEvent(event);
  if ((event.menuItems || []).length || event.selectedMenu || event.menu || event.menuText) add("alimentos");
  if (event.includesDrinks || event.drinkType) add("bebidas");
  if (event.tableware || event.tablewareQuantities || event.tablewareDetail) {
    add("vajilla");
    add("contenedores");
  }
  if (event.largeContainers || event.smallContainers) add("contenedores");
  if (!deliveryOnly) {
    add("utensilios");
    add("descartables");
    add("limpieza");
    if (serviceKey.includes("coffee") || serviceKey.includes("finger") || serviceKey.includes("agape") || serviceKey.includes("cocktail")) {
      add("manteleria");
      add("mobiliario");
    }
  }
  if (Number(event.guestCount || 0) > 0) add("transporte");
  return categories;
}

function getOperationalInventoryEventText(event = {}) {
  const menuText = (event.menuItems || []).flatMap((item) => [
    item.name,
    item.detail,
    ...(Array.isArray(item.subItems) ? item.subItems.flatMap((subItem) => [subItem.name, subItem.detail]) : []),
  ]);
  return normalizeSearchKey([
    event.selectedMenu,
    event.menu,
    event.menuText,
    event.drinkType,
    event.tableware,
    event.tablewareQuantities,
    event.tablewareDetail,
    event.largeContainers,
    event.smallContainers,
    event.serviceType,
    ...menuText,
  ].filter(Boolean).join(" "));
}

function getOperationalInventoryReservedQuantity(item = {}, targetEvent = null) {
  const category = getOperationalInventoryCategory(item.categoryId);
  const targetDate = targetEvent?.eventDate || "";
  return erpEvents.reduce((sum, event) => {
    if (targetEvent?.id && event.id === targetEvent.id) return sum;
    const status = normalizeErpEventStatus(event.status || "");
    if (!["confirmed", "production"].includes(status)) return sum;
    const sheet = event.operationalSheet || {};
    const reservations = normalizeOperationalInventoryReservations(sheet.reservations || []);
    if (!reservations.length) return sum;
    if (category.type !== "consumable" && targetDate && normalizePanelDate(event.eventDate || "") !== targetDate) return sum;
    return sum + reservations
      .filter((reservation) => reservation.itemId === item.id)
      .reduce((partial, reservation) => partial + parseDecimalNumber(reservation.quantity || 1), 0);
  }, 0);
}

function getOperationalInventoryCategory(categoryId) {
  return normalizeOperationalInventoryData(erpOperationalInventory).categories.find((category) => category.id === categoryId)
    || getDefaultOperationalInventoryCategories()[0];
}

function normalizeOperationalInventoryReservations(input = []) {
  return (Array.isArray(input) ? input : [])
    .map((item) => ({
      id: normalizeText(item.id || `reserva-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      itemId: normalizeText(item.itemId || item.inventoryItemId || ""),
      itemName: normalizeText(item.itemName || item.name || ""),
      categoryId: normalizeText(item.categoryId || ""),
      quantity: normalizeText(item.quantity || "1"),
      unit: normalizeText(item.unit || ""),
      checked: parseBooleanLike(item.checked),
      note: normalizeText(item.note || item.notes || ""),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }))
    .filter((item) => item.itemId || item.itemName);
}

function saveOperationalInventoryRecord(input = {}, user = null) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const categories = Array.isArray(input.categories) ? input.categories.map(normalizeOperationalInventoryCategory).filter((item) => item.label) : data.categories;
  const itemInput = input.item || input;
  const existingIndex = data.items.findIndex((entry) => entry.id === normalizeText(itemInput.id || ""));
  const item = normalizeOperationalInventoryItem({ ...(existingIndex >= 0 ? data.items[existingIndex] : {}), ...itemInput });
  if (!item.name) throw new Error("Ingrese el nombre del item de inventario.");
  if (item.countMode === "packages" && item.unitsPerBundle <= 0) throw new Error("Ingrese cuantas unidades contiene cada caja o bulto.");
  if (item.internalCode && !isValidInventoryInternalCode(item.internalCode)) throw new Error("El codigo interno debe usar el formato GG-XXXXXX.");
  if (item.barcode && item.internalCode && item.barcode.toUpperCase() === item.internalCode) throw new Error("El codigo comercial y el codigo interno deben ser diferentes.");
  if (!categories.some((category) => category.id === item.categoryId)) categories.push(normalizeOperationalInventoryCategory({ id: item.categoryId, label: item.categoryId }));
  const index = data.items.findIndex((entry) => entry.id === item.id);
  const before = index >= 0 ? data.items[index] : null;
  const nextCodes = getInventoryBarcodesForItem(item);
  if (nextCodes.length) {
    const nextCodeKeys = nextCodes.map((code) => code.toUpperCase());
    const conflict = data.items.find((entry) => {
      if (entry.id === item.id) return false;
      const codes = getInventoryBarcodesForItem(entry).map((code) => code.toUpperCase());
      return nextCodeKeys.some((code) => codes.includes(code));
    });
    if (conflict) {
      throw new Error(`El codigo ya esta asociado a ${conflict.name || "otro articulo"}.`);
    }
  }
  const now = new Date().toISOString();
  const nextItem = { ...(index >= 0 ? data.items[index] : {}), ...item, updatedAt: now };
  if (index >= 0) data.items[index] = nextItem;
  else data.items.push(nextItem);
  erpOperationalInventory = { categories, items: data.items, updatedAt: now };
  saveErpOperationalInventory();
  if (nextItem.internalCode) inventoryInternalCodeReservations.delete(nextItem.internalCode);
  recordAudit(user, input.id ? "update" : "create", "operational_inventory", nextItem.id, nextItem.name, before, nextItem);
  return getOperationalInventoryAdminView(user);
}

function associateOperationalInventoryBarcode(input = {}, user = null) {
  const itemId = normalizeText(input.itemId || "");
  const codeType = normalizeText(input.codeType || "").toLowerCase();
  const code = codeType === "internal"
    ? normalizeInventoryInternalCode(input.code || "")
    : normalizeInventoryBarcode(input.code || "");
  if (!itemId) throw new Error("itemId requerido.");
  if (!code) throw new Error("Codigo requerido.");
  if (!["commercial", "provider", "internal"].includes(codeType)) throw new Error("Tipo de codigo invalido.");
  if (codeType === "internal" && !isValidInventoryInternalCode(code)) throw new Error("El codigo interno debe usar el formato GG-XXXXXX.");

  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const index = data.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error("Articulo no encontrado.");
  const conflict = findOperationalInventoryItemByBarcode(code, itemId);
  if (conflict) throw new Error(`El codigo ya esta asociado a ${conflict.name || "otro articulo"}.`);

  const before = data.items[index];
  const next = { ...before };
  if (codeType === "commercial") {
    if (next.barcode && normalizeInventoryBarcode(next.barcode) !== code) {
      throw new Error("El articulo ya tiene un codigo comercial. Agreguelo como codigo de proveedor si corresponde.");
    }
    next.barcode = code;
  } else if (codeType === "provider") {
    const aliases = normalizeInventoryBarcodeAliases(next.barcodeAliases || [], next.barcode || "");
    const codeKey = code.toUpperCase();
    if (codeKey !== normalizeInventoryBarcode(next.barcode || "").toUpperCase() && codeKey !== normalizeInventoryInternalCode(next.internalCode || "") && !aliases.some((alias) => alias.toUpperCase() === codeKey)) aliases.push(code);
    next.barcodeAliases = aliases;
  } else {
    if (next.internalCode && normalizeInventoryInternalCode(next.internalCode) !== code) {
      throw new Error("El articulo ya tiene un codigo interno. No se reemplazo.");
    }
    if (code === normalizeInventoryBarcode(next.barcode || "").toUpperCase()) throw new Error("El codigo interno debe ser diferente del codigo comercial.");
    next.internalCode = code;
    next.barcodeAliases = normalizeInventoryBarcodeAliases(next.barcodeAliases || [], next.barcode || "").filter((alias) => alias !== code);
  }
  next.updatedAt = new Date().toISOString();
  data.items[index] = normalizeOperationalInventoryItem(next);
  erpOperationalInventory = { ...data, updatedAt: next.updatedAt };
  saveErpOperationalInventory();
  inventoryInternalCodeReservations.delete(code);
  recordAudit(user, "update", "operational_inventory_barcode", itemId, before.name, before, data.items[index], { codeType });
  return data.items[index];
}

function saveOperationalInventoryCategories(input = {}, user = null) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const categories = (Array.isArray(input.categories) ? input.categories : data.categories).map(normalizeOperationalInventoryCategory).filter((item) => item.label);
  erpOperationalInventory = { ...data, categories, updatedAt: new Date().toISOString() };
  saveErpOperationalInventory();
  recordAudit(user, "update", "operational_inventory", "categories", "Categorias inventario operativo", data.categories, categories);
  return getOperationalInventoryAdminView(user);
}

function deleteOperationalInventoryItem(id, user = null) {
  const cleanId = normalizeText(id || "");
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const before = data.items.find((item) => item.id === cleanId);
  erpOperationalInventory = {
    ...data,
    items: data.items.filter((item) => item.id !== cleanId),
    updatedAt: new Date().toISOString(),
  };
  saveErpOperationalInventory();
  recordAudit(user, "delete", "operational_inventory", cleanId, before?.name || cleanId, before, null);
  return getOperationalInventoryAdminView(user);
}

function archiveOperationalInventoryItem(id, reason, user = null) {
  const cleanId = normalizeText(id || "");
  const cleanReason = normalizeText(reason || "");
  if (!cleanId) throw new Error("itemId requerido.");
  if (!cleanReason) throw new Error("Motivo requerido.");
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const idx = data.items.findIndex((item) => item.id === cleanId);
  if (idx < 0) throw new Error("Articulo no encontrado.");
  const before = data.items[idx];
  const now = new Date().toISOString();
  data.items[idx] = {
    ...before,
    status: "inactive",
    archivedAt: now,
    archivedBy: normalizeText(user?.username || ""),
    archivedReason: cleanReason,
    updatedAt: now,
  };
  erpOperationalInventory = { ...data, updatedAt: now };
  saveErpOperationalInventory();
  recordAudit(user, "update", "operational_inventory_archive", cleanId, before.name, before, data.items[idx]);
  return data.items[idx];
}

const OPERATIONAL_INVENTORY_PATCH_FIELDS = new Set([
  "name", "barcode", "internalCode", "inventoryDomain", "inventoryArea",
  "functionalFamily", "controlType", "categoryId", "subcategory",
  "quantity", "unit", "countMode", "unitsPerBundle", "location", "locationType", "locationDetail",
  "usageType", "minStock", "operationalStatus", "notes", "kitchenNotes",
  "expiryStatus", "expiryDate", "preciseLocation",
]);

function patchOperationalInventoryItem(id, inputFields = {}, expectedUpdatedAt = "", user = null) {
  const cleanId = normalizeText(id || "");
  if (!cleanId) throw new Error("Articulo requerido.");
  if (!inputFields || typeof inputFields !== "object" || Array.isArray(inputFields)) throw new Error("Campos a modificar requeridos.");
  const fieldNames = Object.keys(inputFields);
  if (!fieldNames.length) throw new Error("No hay cambios para guardar.");
  const unsupported = fieldNames.filter((field) => !OPERATIONAL_INVENTORY_PATCH_FIELDS.has(field));
  if (unsupported.length) throw new Error("Campos no permitidos: " + unsupported.join(", ") + ".");

  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const index = data.items.findIndex((item) => item.id === cleanId);
  if (index < 0) throw new Error("Articulo no encontrado.");
  const before = data.items[index];
  if (!expectedUpdatedAt) throw new Error("Falta la version esperada del articulo.");
  if (String(before.updatedAt || "") !== String(expectedUpdatedAt)) {
    const conflictError = new Error("Este articulo fue modificado por otra persona. Cerra la ficha y volve a abrirla.");
    conflictError.code = "INVENTORY_CONFLICT";
    throw conflictError;
  }
  if (!canWriteInventoryItem(user, before)) {
    const forbiddenError = new Error("Su usuario no puede modificar esta area de inventario.");
    forbiddenError.code = "INVENTORY_FORBIDDEN";
    throw forbiddenError;
  }

  const activeSession = loadInventarioSesion();
  const hasActiveCount = Boolean(activeSession.active && activeSession.counts && Object.prototype.hasOwnProperty.call(activeSession.counts, cleanId));
  const countSensitiveFields = ["quantity", "unit", "countMode", "unitsPerBundle", "controlType"];
  if (hasActiveCount && countSensitiveFields.some((field) => Object.prototype.hasOwnProperty.call(inputFields, field))) {
    throw new Error("El articulo tiene un conteo en curso. No se puede cambiar cantidad, unidad ni presentacion desde la ficha.");
  }

  const merged = { ...before, ...inputFields, id: before.id, updatedAt: before.updatedAt };
  const next = normalizeOperationalInventoryItem(merged);
  if (!next.name) throw new Error("Ingrese el nombre del articulo.");
  if (next.countMode === "packages" && next.unitsPerBundle <= 0) throw new Error("Ingrese cuantas unidades contiene cada caja o bulto.");
  if (next.internalCode && !isValidInventoryInternalCode(next.internalCode)) throw new Error("El codigo interno debe usar el formato GG-XXXXXX.");
  if (next.barcode && next.internalCode && next.barcode.toUpperCase() === next.internalCode.toUpperCase()) {
    throw new Error("El codigo comercial y el codigo interno deben ser diferentes.");
  }
  if (next.expiryStatus && !next.expiryDate) throw new Error("Fecha de vencimiento requerida.");
  if (next.expiryStatus && !/^\d{4}-\d{2}-\d{2}$/.test(next.expiryDate)) throw new Error("La fecha de vencimiento debe tener formato YYYY-MM-DD.");
  if (!next.expiryStatus) next.expiryDate = "";

  if (!canWriteInventoryItem(user, next)) {
    const forbiddenError = new Error("Su usuario no puede mover el articulo al area seleccionada.");
    forbiddenError.code = "INVENTORY_FORBIDDEN";
    throw forbiddenError;
  }

  const nextCodes = getInventoryBarcodesForItem(next).map((code) => code.toUpperCase());
  const codeConflict = data.items.find((item) => item.id !== cleanId
    && getInventoryBarcodesForItem(item).some((code) => nextCodes.includes(code.toUpperCase())));
  if (codeConflict) throw new Error("El codigo ya esta asociado a " + (codeConflict.name || "otro articulo") + ".");

  const now = new Date().toISOString();
  next.updatedAt = now;
  data.items[index] = next;
  erpOperationalInventory = { ...data, items: data.items, updatedAt: now };
  saveErpOperationalInventory();
  if (next.internalCode) inventoryInternalCodeReservations.delete(next.internalCode);

  const beforeChanged = {};
  const afterChanged = {};
  fieldNames.forEach((field) => {
    beforeChanged[field] = before[field] ?? null;
    afterChanged[field] = next[field] ?? null;
  });
  recordAudit(user, "update", "operational_inventory", cleanId, next.name, beforeChanged, afterChanged, {
    origin: "inventario_mobile",
    fields: fieldNames,
  });
  return next;
}

function updateOperationalInventoryMeta(input = {}, user = null) {
  const cleanId = normalizeText(input.itemId || input.id || "");
  if (!cleanId) throw new Error("itemId requerido.");
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const idx = data.items.findIndex((item) => item.id === cleanId);
  if (idx < 0) throw new Error("Articulo no encontrado.");
  const before = data.items[idx];
  const now = new Date().toISOString();
  const next = { ...before, updatedAt: now };
  if (Object.prototype.hasOwnProperty.call(input, "expiryStatus")) next.expiryStatus = normalizeOperationalExpiryStatus(input.expiryStatus);
  if (Object.prototype.hasOwnProperty.call(input, "expiryDate")) next.expiryDate = normalizeText(input.expiryDate || "");
  if (!next.expiryStatus) next.expiryDate = "";
  if (Object.prototype.hasOwnProperty.call(input, "inventoryDomain")) next.inventoryDomain = normalizeInventoryDomain(input.inventoryDomain);
  if (Object.prototype.hasOwnProperty.call(input, "categoryId")) next.categoryId = normalizeText(input.categoryId || next.categoryId || "");
  if (Object.prototype.hasOwnProperty.call(input, "subcategory")) next.subcategory = normalizeText(input.subcategory || "");
  if (Object.prototype.hasOwnProperty.call(input, "locationType")) next.locationType = normalizeInventoryLocationType(input.locationType || "");
  if (Object.prototype.hasOwnProperty.call(input, "locationDetail")) next.locationDetail = normalizeText(input.locationDetail || "");
  if (Object.prototype.hasOwnProperty.call(input, "usageType")) next.usageType = normalizeInventoryUsageType(input.usageType || "");
  if (Object.prototype.hasOwnProperty.call(input, "minStock")) next.minStock = Math.max(0, parseDecimalNumber(input.minStock || 0));
  if (Object.prototype.hasOwnProperty.call(input, "operationalStatus")) next.operationalStatus = normalizeInventoryOperationalStatus(input.operationalStatus || "");
  if (Object.prototype.hasOwnProperty.call(input, "kitchenNotes")) next.kitchenNotes = normalizeText(input.kitchenNotes || "");
  if (Object.prototype.hasOwnProperty.call(input, "notes")) next.notes = normalizeText(input.notes || "");
  if (Object.prototype.hasOwnProperty.call(input, "preciseLocation")) next.preciseLocation = normalizePreciseInventoryLocation(input.preciseLocation || {});
  data.items[idx] = next;
  erpOperationalInventory = { ...data, updatedAt: now };
  saveErpOperationalInventory();
  recordAudit(user, "update", "operational_inventory_meta", cleanId, before.name, before, next);
  return next;
}

/* ===================== SESION DE TOMA DE INVENTARIO ===================== */

function loadInventarioSesion() {
  try {
    const raw = fs.readFileSync(ERP_INVENTARIO_SESION_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { active: false, location: "", startedAt: null, startedBy: null, counts: {} };
  }
}

function saveInventarioSesion(data) {
  fs.writeFileSync(ERP_INVENTARIO_SESION_FILE, JSON.stringify(data, null, 2));
}

function startInventarioSesion(location, user) {
  const sesion = { active: true, location: normalizeText(location || ""), startedAt: new Date().toISOString(), startedBy: user?.username || null, counts: {} };
  saveInventarioSesion(sesion);
  recordAudit(user, "create", "inventario_sesion", "sesion", "Inventario general iniciado", null, { location: sesion.location });
  return sesion;
}

function updateInventarioSesionItem(itemId, counted, qty, user, packageCount = undefined) {
  const sesion = loadInventarioSesion();
  if (!sesion.active) throw new Error("No hay una sesion de inventario activa.");
  const previous = sesion.counts[itemId] || {};
  const next = { ...previous, counted: Boolean(counted), qty: Math.max(0, Number(qty) || 0) };
  if (packageCount === null) delete next.packageCount;
  else if (packageCount !== undefined) next.packageCount = packageCount;
  sesion.counts[itemId] = next;
  saveInventarioSesion(sesion);
  return sesion;
}

function updateInventarioSesionLocation(location, user) {
  const sesion = loadInventarioSesion();
  if (!sesion.active) throw new Error("No hay una sesion de inventario activa.");
  const before = sesion.location || "";
  sesion.location = normalizeText(location || "");
  if (!sesion.location) throw new Error("Ubicacion requerida.");
  saveInventarioSesion(sesion);
  recordAudit(user, "update", "inventario_sesion", "location", "Ubicacion de inventario", { location: before }, { location: sesion.location });
  return sesion;
}

function closeInventarioSesion(user) {
  const sesion = loadInventarioSesion();
  if (!sesion.active) throw new Error("No hay una sesion de inventario activa.");
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const now = new Date().toISOString();
  let updated = 0;
  const promotedPresentations = [];
  data.items = data.items.map((item) => {
    const count = sesion.counts[item.id];
    if (!count || !count.counted) return item;
    if (!canWriteInventoryItem(user, item)) return item;
    updated++;
    const packageCount = count.packageCount && normalizeInventoryPackageCount(count.packageCount);
    const canPromoteLegacyPresentation = item.countMode !== "packages"
      && packageCount
      && packageCount.unitsPerBundle > 0;
    const next = {
      ...item,
      quantity: packageCount ? packageCount.totalUnits : count.qty,
      location: sesion.location,
      countMode: canPromoteLegacyPresentation ? "packages" : item.countMode,
      unitsPerBundle: canPromoteLegacyPresentation ? packageCount.unitsPerBundle : item.unitsPerBundle,
      updatedAt: now,
    };
    if (canPromoteLegacyPresentation) {
      promotedPresentations.push({
        itemId: item.id,
        name: item.name,
        before: { countMode: item.countMode, unitsPerBundle: item.unitsPerBundle },
        after: { countMode: next.countMode, unitsPerBundle: next.unitsPerBundle },
      });
    }
    return normalizeOperationalInventoryItem(next);
  });
  erpOperationalInventory = { ...data, updatedAt: now };
  saveErpOperationalInventory();
  saveInventarioSesion({ active: false, location: sesion.location, closedAt: now, closedBy: user?.username || null, counts: sesion.counts });
  recordAudit(user, "update", "inventario_sesion", "sesion", "Inventario general cerrado", null, { location: sesion.location, itemsUpdated: updated });
  promotedPresentations.forEach((change) => {
    recordAudit(user, "update", "operational_inventory", change.itemId, change.name, change.before, change.after, {
      origin: "inventario_session_close",
      reason: "legacy_package_presentation_promotion",
    });
  });
  return { updated, location: sesion.location };
}

function cancelInventarioSesion(user) {
  const sesion = loadInventarioSesion();
  saveInventarioSesion({ ...sesion, active: false, cancelledAt: new Date().toISOString() });
  recordAudit(user, "delete", "inventario_sesion", "sesion", "Inventario general cancelado");
}

function getInventarioSesionView(user = null) {
  const sesion = loadInventarioSesion();
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const visibleItems = filterOperationalInventoryItemsForUser(data.items, user, "read");
  const activeItems = visibleItems.filter((item) => normalizeOperationalInventoryStatus(item.status) !== "inactive");
  const total = activeItems.length;
  const activeIds = new Set(activeItems.map((item) => item.id));
  const counted = Object.entries(sesion.counts || {}).filter(([itemId, count]) => activeIds.has(itemId) && count.counted).length;
  return {
    sesion,
    items: activeItems.map((item) => ({ ...item, inventoryArea: getInventoryAreaForItem(item) })),
    categories: filterOperationalInventoryCategoriesForUser(data.categories, user, "read"),
    areas: getAllowedInventoryAreas(user, "read"),
    writableAreas: getAllowedInventoryAreas(user, "write"),
    total,
    counted,
  };
}

function getEstadoInventarioView(user = null) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const CONDITION_LABELS = { ok: "Ok", roto: "Roto", sucio: "Sucio", desoldado: "Desoldado", falta_pieza: "Falta pieza", otro: "Otro" };
  const visibleItems = filterOperationalInventoryItemsForUser(data.items, user, "read");
  return {
    categories: filterOperationalInventoryCategoriesForUser(data.categories, user, "read"),
    areas: getAllowedInventoryAreas(user, "read"),
    writableAreas: getAllowedInventoryAreas(user, "write"),
    items: visibleItems.map((item) => ({
      ...item,
      inventoryArea: getInventoryAreaForItem(item),
      conditionLabel: CONDITION_LABELS[item.condition] || null,
    })),
  };
}

function updateItemCondition(itemId, condition, notes, imagePath, user) {
  const data = normalizeOperationalInventoryData(erpOperationalInventory);
  const idx = data.items.findIndex((item) => item.id === itemId);
  if (idx < 0) throw new Error("Articulo no encontrado.");
  const item = data.items[idx];
  const now = new Date().toISOString();
  data.items[idx] = {
    ...item,
    condition: condition || null,
    conditionNotes: normalizeText(notes || ""),
    conditionImagePath: imagePath != null ? normalizeText(imagePath) : item.conditionImagePath,
    conditionAt: now,
    conditionBy: normalizeText(user?.username || ""),
    updatedAt: now,
  };
  erpOperationalInventory = { ...data, updatedAt: now };
  saveErpOperationalInventory();
  recordAudit(user, "update", "inventario_condicion", itemId, item.name, { condition: item.condition }, { condition });
  return data.items[idx];
}

async function saveConditionImage(itemId, base64Data) {
  const imagesDir = dataPath("images/condition");
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const clean = String(base64Data || "").replace(/^data:image\/\w+;base64,/, "");
  if (!clean) throw new Error("Imagen vacia.");
  const buffer = Buffer.from(clean, "base64");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("La imagen es demasiado grande (max 5MB).");
  const filename = `cond-${normalizeText(itemId)}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(imagesDir, filename), buffer);
  return `condition/${filename}`;
}

function upsertInventoryMovementsFromReceipt(receipt = {}) {
  const sourcePrefix = `receipt:${receipt.id}:`;
  erpInventoryMovements = erpInventoryMovements.filter((movement) => !String(movement.sourceId || "").startsWith(sourcePrefix));
  const movements = (receipt.items || [])
    .filter((item) => ["merchandise", "tableware", "equipment"].includes(normalizeReceiptItemType(item.itemType)))
    .filter((item) => parseOptionalNumber(item.receivedQuantity || 0) > 0)
    .map((item) => ({
      id: `inv-${receipt.id}-${item.id}`,
      date: receipt.receivedAt || getDateOnly(new Date()),
      productName: item.productName,
      itemType: normalizeReceiptItemType(item.itemType),
      quantity: roundMoney(parseOptionalNumber(item.receivedQuantity || 0)),
      unit: item.unit || "",
      movementType: "in",
      providerName: item.providerName || receipt.providerName || "",
      eventId: receipt.eventId || "",
      eventName: receipt.eventName || "",
      sourceType: "purchase_receipt",
      sourceId: `${sourcePrefix}${item.id}`,
      notes: [`Recepcion ${receipt.orderTitle || receipt.orderId}`, item.differenceReason].filter(Boolean).join(" | "),
      createdAt: new Date().toISOString(),
    }));
  erpInventoryMovements.push(...normalizeInventoryMovementList(movements));
  saveErpInventory();
}

function convertPurchaseReceiptToPurchase(input = {}, user = null) {
  const receiptId = normalizeText(input.id || input.receiptId || "");
  const receiptIndex = erpPurchaseReceipts.findIndex((receipt) => receipt.id === receiptId);
  if (receiptIndex < 0) throw new Error("No encontre esa recepcion.");
  const receipt = normalizePurchaseReceiptRecord(erpPurchaseReceipts[receiptIndex]);

  if (receipt.convertedPurchaseId) {
    throw new Error("Esta recepcion ya fue convertida en compra real.");
  }
  if (receipt.status === "pending" || receipt.status === "partial") {
    throw new Error("Para convertir, primero complete la recepcion.");
  }
  if (hasReceiptUnresolvedDifferences(receipt)) {
    throw new Error("Hay diferencias sin resolver. Marquelas como resueltas o aceptadas antes de convertir.");
  }

  const lineItems = receipt.items
    .filter((item) => parseOptionalNumber(item.receivedQuantity || 0) > 0)
    .map((item) => ({
      description: item.productName,
      quantity: parseOptionalNumber(item.receivedQuantity || 0),
      unitAmount: parseOptionalNumber(item.unitAmount || 0),
      ivaRate: normalizeIvaRate(item.ivaRate || 0),
    }));

  if (!lineItems.length) {
    throw new Error("La recepcion no tiene productos recibidos para convertir.");
  }
  if (lineItems.some((item) => Number(item.unitAmount || 0) <= 0)) {
    throw new Error("Para convertir en compra real, cargue el precio unitario de cada producto recibido.");
  }

  const provider = normalizeText(input.provider || receipt.providerName || receipt.items.map((item) => item.providerName).find(Boolean) || "");
  const purchase = buildPurchaseRecord({
    id: `compra-${receipt.id}`,
    date: receipt.receivedAt || getDateOnly(new Date()),
    provider,
    eventName: receipt.eventName || "Sin evento",
    invoiceType: normalizeText(input.invoiceType || "Orden de compra"),
    paymentStatus: normalizeText(input.paymentStatus || "Pendiente"),
    paymentMethod: normalizeText(input.paymentMethod || ""),
    fundsSource: normalizeText(input.fundsSource || ""),
    notes: [receipt.notes, `Generada desde recepcion ${receipt.orderTitle || receipt.id}`].filter(Boolean).join("\n"),
    items: lineItems,
  }, { requireEvent: false, defaultEvent: receipt.eventName || "Sin evento" });

  purchase.source = "purchase_receipt";
  purchase.sourceReceiptId = receipt.id;
  purchase.sourceOrderId = receipt.orderId;
  const savedPurchase = rememberErpPurchase(purchase);
  rememberPurchasePrices(purchase);

  erpPurchaseReceipts[receiptIndex] = normalizePurchaseReceiptRecord({
    ...receipt,
    acceptanceStatus: "converted",
    convertedPurchaseId: savedPurchase.id,
    convertedAt: new Date().toISOString(),
    convertedBy: user?.displayName || user?.username || "",
  });
  saveErpPurchaseReceipts();
  upsertInventoryMovementsFromReceipt(erpPurchaseReceipts[receiptIndex]);

  return {
    receipt: erpPurchaseReceipts[receiptIndex],
    purchase: savedPurchase,
    inventory: getInventoryBalanceList(),
  };
}

function buildErpAlerts(events, quotes, purchases) {
  const today = getDateOnly(new Date());
  const soon = getDateOnly(addDays(new Date(), 7));
  const alerts = [];

  const eventsWithoutQuote = events.filter(
    (event) =>
      ["confirmed", "production"].includes(event.status) &&
      !erpQuotes.some((quote) => quote.eventId === event.id && quote.status === "accepted")
  );
  const lowMarginQuotes = quotes.filter((quote) => Number(quote.marginPercent || 0) > 0 && Number(quote.marginPercent || 0) < 25);
  const dueEvents = events.filter((event) => event.eventDate && event.eventDate >= today && event.eventDate <= soon);
  const unpaidPurchases = purchases.filter((purchase) => purchase.paymentStatus !== "Pagado");
  const dueFollowUps = getChatDashboardList().filter((chat) => chat.isDueToday || chat.isOverdue);
  const expiredQuotes = quotes.filter((quote) => quote.validUntil && quote.validUntil < today && !["accepted", "rejected"].includes(quote.status));
  const staleRecipes = getRecipeList().filter((recipe) =>
    (recipe.items || []).some((item) => item.type !== "recipe" && !productPriceRecords[normalizeProductKey(item.name)])
  );
  const priceAlerts = getProductPriceAlerts().filter((alert) => Math.abs(Number(alert.changePercent || 0)) >= 15);
  const unresolvedReceiptDifferences = getPurchaseReceiptList().filter((receipt) => hasReceiptUnresolvedDifferences(receipt));

  if (eventsWithoutQuote.length) {
    alerts.push({
      type: "warning",
      title: "Eventos confirmados sin presupuesto aceptado",
      detail: `${eventsWithoutQuote.length} evento(s) necesitan control comercial antes de producir.`,
    });
  }

  if (lowMarginQuotes.length) {
    alerts.push({
      type: "danger",
      title: "Presupuestos con margen bajo",
      detail: `${lowMarginQuotes.length} presupuesto(s) estan por debajo del 25% de margen.`,
    });
  }

  if (dueEvents.length) {
    alerts.push({
      type: "info",
      title: "Eventos proximos",
      detail: `${dueEvents.length} evento(s) ocurren dentro de los proximos 7 dias.`,
    });
  }

  if (unpaidPurchases.length) {
    alerts.push({
      type: "warning",
      title: "Compras pendientes de pago",
      detail: `${unpaidPurchases.length} compra(s) requieren seguimiento administrativo.`,
    });
  }

  if (unresolvedReceiptDifferences.length) {
    alerts.push({
      type: "danger",
      title: "Recepciones con diferencias sin resolver",
      detail: `${unresolvedReceiptDifferences.length} recepcion(es) bloquean pagos o conversion a compra hasta resolver diferencias.`,
      items: unresolvedReceiptDifferences.slice(0, 8).map((receipt) => `${receipt.orderTitle || receipt.orderId}: ${receipt.unresolvedDifferenceCount || getReceiptUnresolvedDifferences(receipt).length} diferencia(s)`),
    });
  }

  if (dueFollowUps.length) {
    alerts.push({
      type: "warning",
      title: "Seguimientos comerciales pendientes",
      detail: `${dueFollowUps.length} seguimiento(s) vencen hoy o estan atrasados.`,
    });
  }

  if (expiredQuotes.length) {
    alerts.push({
      type: "danger",
      title: "Presupuestos vencidos",
      detail: `${expiredQuotes.length} presupuesto(s) superaron su fecha de validez.`,
    });
  }

  if (staleRecipes.length) {
    alerts.push({
      type: "warning",
      title: "Recetas sin precio actualizado",
      detail: `${staleRecipes.length} receta(s) tienen insumos sin ultimo precio de compra.`,
    });
  }

  if (priceAlerts.length) {
    alerts.push({
      type: "danger",
      title: "Insumos con variacion fuerte",
      detail: `${priceAlerts.length} producto(s) cambiaron 15% o mas y afectan recetas.`,
    });
  }

  return alerts;
}

function getPipelineBoard() {
  const columns = [
    { id: "lead", label: "Consulta", items: [] },
    { id: "in_progress", label: "Relevamiento", items: [] },
    { id: "ready_to_quote", label: "Listo para cotizar", items: [] },
    { id: "proposal_sent", label: "Propuesta enviada", items: [] },
    { id: "follow_up", label: "Seguimiento", items: [] },
    { id: "confirmed", label: "Confirmado", items: [] },
    { id: "done", label: "Realizado", items: [] },
    { id: "lost", label: "Perdido", items: [] },
  ];
  const byId = new Map(columns.map((column) => [column.id, column]));
  const completedEventKeys = new Set(getErpEventList()
    .filter((event) => event.status === "done")
    .flatMap((event) => [event.name, event.clientName].map(normalizeSearchKey).filter(Boolean)));

  for (const chat of getChatDashboardList()) {
    const chatKeys = [
      chat.data?.eventName,
      chat.data?.eventType,
      chat.data?.fullName,
      chat.data?.clientName,
    ].map(normalizeSearchKey).filter(Boolean);
    if (chatKeys.some((key) => completedEventKeys.has(key))) continue;

    const id = mapPipelineStatus(chat.status);
    byId.get(id)?.items.push({
      id: chat.phone,
      source: "commercial",
      title: chat.data?.fullName || chat.displayPhone || chat.phone,
      subtitle: chat.data?.eventType || chat.channel || "",
      amount: 0,
      date: chat.followUpDate || "",
      owner: chat.assignedTo || "",
      role: chat.assignedTo || "",
      nextAction: chat.nextAction || "",
    });
  }

  for (const event of getErpEventList()) {
    if (event.status === "done") continue;
    const id = mapPipelineStatus(event.status);
    byId.get(id)?.items.push({
      id: event.id,
      source: "event",
      title: event.name,
      subtitle: event.clientName || event.serviceType || "",
      amount: event.quoteTotal || 0,
      date: event.eventDate || "",
      owner: event.owner || "",
      role: event.role || "",
      nextAction: event.nextAction || "",
    });
  }

  return { columns };
}

function mapPipelineStatus(status) {
  const normalized = normalizeStatus(status);
  const mapping = {
    new: "lead",
    pending_approval: "lead",
    approved_waiting_reason: "lead",
    in_progress: "in_progress",
    missing_info: "in_progress",
    ready_to_quote: "ready_to_quote",
    quoted: "ready_to_quote",
    proposal_sent: "proposal_sent",
    follow_up: "follow_up",
    confirmed: "confirmed",
    production: "confirmed",
    done: "done",
    lost: "lost",
    cancelled: "lost",
    ignored: "lost",
    referred: "lost",
  };

  return mapping[normalized] || mapping[String(status || "").toLowerCase()] || "lead";
}

function getConfirmedEventList() {
  return getErpEventList()
    .filter((event) => ["confirmed", "production", "done"].includes(event.status))
    .map((event) => ({
      ...event,
      checklist: normalizeOperationalChecklist(event.checklist),
      unpaidPurchases: getErpPurchaseList().filter(
        (purchase) =>
          purchase.eventName &&
          normalizeSearchKey(purchase.eventName) === normalizeSearchKey(event.name) &&
          purchase.paymentStatus !== "Pagado"
      ).length,
      operationalMargin: roundMoney(Number(event.quoteTotal || 0) - Number(event.finalCostTotal || 0)),
      operationalMarginPercent: Number(event.quoteTotal || 0) > 0
        ? roundMoney(((Number(event.quoteTotal || 0) - Number(event.finalCostTotal || 0)) / Number(event.quoteTotal || 0)) * 100)
        : 0,
    }));
}

function getOperationalSheetCategoryList() {
  return OPERATIONAL_SHEET_CATEGORIES
    .filter(([id]) => OPERATIONAL_PROCEDURE_CATEGORY_IDS.has(id))
    .map(([id, label]) => ({ id, label }));
}

function getLogisticsEventList() {
  return getErpEventList()
    .filter((event) => event.status === "confirmed" && event.logisticsStatus !== "pending_admin_close")
    .sort(compareEventsByDate)
    .map((event) => toLogisticsEventSummary(event));
}

function getLogisticsEventDetail(id) {
  const event = getErpEventList().find((item) => item.id === id);
  if (!event) return null;
  const normalizedSheet = normalizeOperationalSheet(event.operationalSheet, event);
  const index = erpEvents.findIndex((item) => item.id === event.id);
  if (index >= 0 && JSON.stringify(erpEvents[index].operationalSheet || {}) !== JSON.stringify(normalizedSheet)) {
    erpEvents[index] = { ...erpEvents[index], operationalSheet: normalizedSheet, updatedAt: new Date().toISOString() };
    saveErpEvents();
  }
  return toLogisticsEventDetail({ ...event, operationalSheet: normalizedSheet });
}

function updateLogisticsEventChecklist(input = {}, user = null) {
  const id = normalizeText(input.id || input.eventId || "");
  const index = erpEvents.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("No encontre ese evento.");

  const previous = normalizeErpEvent(erpEvents[index]);
  const rawSheet = mergeDeletedOperationalSeeds(input.operationalSheet || input.sheet || {}, previous.operationalSheet || {});
  const sheet = normalizeOperationalSheet(rawSheet, previous);
  validateOperationalSheet(sheet);

  erpEvents[index] = normalizeErpEvent({
    ...erpEvents[index],
    operationalSheet: {
      ...sheet,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
  upsertInventoryMovementsFromEventLeftovers(erpEvents[index]);
  saveErpEvents();
  recordAudit(user, "update", "event", id, `Ficha logistica - ${previous.name}`, previous.operationalSheet || null, erpEvents[index].operationalSheet);
  return toLogisticsEventDetail(normalizeErpEvent(erpEvents[index]));
}

function closeLogisticsEvent(input = {}, user = null) {
  const id = normalizeText(input.id || input.eventId || "");
  const index = erpEvents.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("No encontre ese evento.");

  const previous = normalizeErpEvent(erpEvents[index]);
  if (previous.status !== "confirmed") {
    throw new Error("Solo se pueden cerrar desde logistica eventos confirmados.");
  }
  if (previous.eventDate && previous.eventDate > new Date().toISOString().slice(0, 10)) {
    throw new Error("No se puede cerrar un evento con fecha futura.");
  }

  const rawSheet = mergeDeletedOperationalSeeds(input.operationalSheet || input.sheet || previous.operationalSheet || {}, previous.operationalSheet || {});
  const sheet = normalizeOperationalSheet(rawSheet, previous);
  validateOperationalSheet(sheet);
  validateLogisticsCloseSheet(sheet);
  const withoutConformity = !previous.clientConformity?.fileName;
  if (withoutConformity && !parseBooleanLike(input.requestWithoutConformity)) {
    throw new Error("Este evento no tiene conformidad. Envie una solicitud de cierre sin conformidad para que administracion la autorice.");
  }

  const updated = normalizeErpEvent({
    ...erpEvents[index],
    logisticsStatus: "pending_admin_close",
    operationalSheet: {
      ...sheet,
      logisticsClosedAt: new Date().toISOString(),
      logisticsClosedBy: user?.name || user?.username || "",
      closeWithoutConformityRequested: withoutConformity,
      closeWithoutConformityRequestedAt: withoutConformity ? new Date().toISOString() : "",
      closeWithoutConformityRequestedBy: withoutConformity ? user?.name || user?.username || "" : "",
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  erpEvents[index] = updated;
  upsertInventoryMovementsFromEventLeftovers(updated);
  saveErpEvents();
  recordAudit(user, "update", "event", id, `Solicitud de cierre logistico - ${previous.name}`, previous, updated);
  return toLogisticsEventDetail(updated);
}

function approveLogisticsEventClose(input = {}, user = null) {
  const id = normalizeText(input.id || input.eventId || "");
  const index = erpEvents.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("No encontre ese evento.");

  const previous = normalizeErpEvent(erpEvents[index]);
  if (previous.logisticsStatus !== "pending_admin_close") {
    throw new Error("Este evento no tiene un cierre logistico pendiente de autorizacion.");
  }
  const sheet = normalizeOperationalSheet(previous.operationalSheet || {}, previous);
  validateLogisticsCloseSheet(sheet);
  const requestedWithoutConformity = parseBooleanLike(sheet.closeWithoutConformityRequested);
  if (!previous.clientConformity?.fileName && !requestedWithoutConformity) {
    validateEventConformityForClose(previous);
  }

  const updated = normalizeErpEvent({
    ...erpEvents[index],
    status: "done",
    logisticsStatus: "admin_approved_close",
    conformityWaiver: !previous.clientConformity?.fileName && requestedWithoutConformity
      ? {
        approved: true,
        approvedAt: new Date().toISOString(),
        approvedBy: normalizeText(user?.name || user?.username || ""),
        requestedBy: normalizeText(sheet.closeWithoutConformityRequestedBy || ""),
        requestedAt: sheet.closeWithoutConformityRequestedAt || "",
        reason: normalizeText(sheet.postEventNotes || "Cierre autorizado sin conformidad adjunta."),
      }
      : previous.conformityWaiver || null,
    operationalSheet: {
      ...sheet,
      closedAt: new Date().toISOString(),
      closedBy: user?.name || user?.username || "",
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  erpEvents[index] = updated;
  saveErpEvents();
  recordAudit(user, "update", "event", id, `Autorizacion cierre logistico - ${previous.name}`, previous, updated);
  return getErpEventList().find((event) => event.id === id) || updated;
}

function validateLogisticsCloseSheet(sheet = {}) {
  const notes = normalizeText(sheet.postEventNotes || "");
  if (!notes) {
    throw new Error("Antes de cerrar el evento, cargue un comentario post-evento. Puede escribir 'Sin comentarios' si no hubo observaciones.");
  }

  const teardownItems = sheet.categories?.desmontaje || [];
  const pendingTeardown = teardownItems.filter((item) => !item.checked);
  if (pendingTeardown.length) {
    throw new Error("Para cerrar el evento, complete primero los items de Desmontaje y descarga en deposito.");
  }
}

function validateEventConformityForClose(event = {}) {
  if (!event.clientConformity?.fileName && !event.conformityWaiver?.approved) {
    throw new Error("Para cerrar el evento, primero suba la conformidad del cliente en PDF.");
  }
}

function normalizeEventConformity(input = {}) {
  if (!input || typeof input !== "object") return null;
  const fileName = normalizeText(input.fileName || "");
  if (!fileName) return null;
  return {
    fileName,
    originalName: normalizeText(input.originalName || "conformidad-cliente.pdf"),
    mimeType: normalizeText(input.mimeType || "application/pdf"),
    size: Number(input.size || 0),
    uploadedAt: input.uploadedAt || "",
    uploadedBy: normalizeText(input.uploadedBy || ""),
  };
}

function normalizeEventConformityWaiver(input = {}) {
  if (!input || typeof input !== "object" || !parseBooleanLike(input.approved)) return null;
  return {
    approved: true,
    approvedAt: input.approvedAt || "",
    approvedBy: normalizeText(input.approvedBy || ""),
    requestedAt: input.requestedAt || "",
    requestedBy: normalizeText(input.requestedBy || ""),
    reason: normalizeText(input.reason || ""),
  };
}

function saveEventConformity(input = {}, user = null) {
  const id = normalizeText(input.id || input.eventId || "");
  const index = erpEvents.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("No encontre ese evento.");

  const dataUrl = String(input.dataUrl || "");
  const match = dataUrl.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error("La conformidad debe ser un archivo PDF valido.");

  const buffer = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.slice(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("El archivo seleccionado no parece ser un PDF valido.");
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("La conformidad PDF no puede superar 10 MB.");
  }

  ensureDirectory(ERP_CONFORMITIES_DIR);
  const previous = normalizeErpEvent(erpEvents[index]);
  const safeId = normalizeSearchKey(id).replace(/[^a-z0-9]+/g, "-") || `evento-${Date.now()}`;
  const fileName = `${safeId}-${Date.now()}.pdf`;
  const targetPath = path.join(ERP_CONFORMITIES_DIR, fileName);
  fs.writeFileSync(targetPath, buffer);

  if (previous.clientConformity?.fileName) {
    const previousPath = path.join(ERP_CONFORMITIES_DIR, path.basename(previous.clientConformity.fileName));
    if (previousPath !== targetPath && fs.existsSync(previousPath)) {
      try {
        fs.unlinkSync(previousPath);
      } catch (error) {
        console.warn("No se pudo eliminar conformidad anterior:", error.message);
      }
    }
  }

  const updated = normalizeErpEvent({
    ...erpEvents[index],
    clientConformity: {
      fileName,
      originalName: normalizeText(input.fileName || "conformidad-cliente.pdf"),
      mimeType: "application/pdf",
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user?.displayName || user?.username || user?.name || "",
    },
    updatedAt: new Date().toISOString(),
  });

  erpEvents[index] = updated;
  saveErpEvents();
  recordAudit(user, "upload", "event", id, `Conformidad cliente - ${updated.name}`, previous.clientConformity || null, updated.clientConformity);
  return getErpEventList().find((event) => event.id === id) || updated;
}

function sendEventConformityPdf(response, id) {
  const cleanId = normalizeText(id || "");
  const event = getErpEventList().find((item) => item.id === cleanId);
  if (!event) return sendJson(response, { ok: false, error: "No encontre ese evento." }, 404);
  if (!event.clientConformity?.fileName) {
    return sendJson(response, { ok: false, error: "Ese evento no tiene conformidad cargada." }, 404);
  }

  const filePath = path.join(ERP_CONFORMITIES_DIR, path.basename(event.clientConformity.fileName));
  if (!fs.existsSync(filePath)) {
    return sendJson(response, { ok: false, error: "No encontre el PDF de conformidad en disco." }, 404);
  }

  const safeName = `${normalizeSearchKey(event.name || event.id).replace(/[^a-z0-9]+/g, "-") || "evento"}-conformidad.pdf`;
  response.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
}

function validateOperationalSheet(sheet = {}) {
  for (const [categoryId] of OPERATIONAL_SHEET_CATEGORIES) {
    const items = sheet.categories?.[categoryId] || [];
    for (const item of items) {
      if (!normalizeText(item.text || "")) {
        throw new Error("No se pueden guardar items vacios en la ficha operativa.");
      }
    }
  }
}

function toLogisticsEventSummary(event) {
  const progress = getOperationalSheetProgress(event.operationalSheet);
  return {
    id: event.id,
    name: event.name,
    eventDate: event.eventDate,
    clientName: event.clientName,
    venue: event.venue,
    guestCount: event.guestCount,
    serviceType: event.serviceType,
    status: event.status,
    statusLabel: getErpEventStatusLabel(event.status),
    logisticsStatus: event.logisticsStatus || "",
    hasClientConformity: Boolean(event.clientConformity?.fileName),
    conformityWaiver: event.conformityWaiver || null,
    closeWithoutConformityRequested: parseBooleanLike(event.operationalSheet?.closeWithoutConformityRequested),
    progress,
  };
}

function toLogisticsEventDetail(event) {
  const venue = getVenueList().find((item) => normalizeSearchKey(item.name) === normalizeSearchKey(event.venue));
  const venueDetail = {
    ...(venue || {}),
    latitude: event.latitude ?? venue?.latitude ?? null,
    longitude: event.longitude ?? venue?.longitude ?? null,
    mapLabel: event.mapLabel || venue?.mapLabel || "",
    address: event.venueAddress || venue?.address || "",
    reference: event.venueReference || venue?.reference || "",
  };
  const customer = findCustomerForLogisticsEvent(event);
  const sheet = normalizeOperationalSheet(event.operationalSheet, event);
  return {
    ...toLogisticsEventSummary({ ...event, operationalSheet: sheet }),
    owner: event.owner,
    role: event.role,
    eventTime: event.eventTime || "",
    nextAction: event.nextAction,
    notes: event.notes,
    checklistDetails: event.checklistDetails,
    clientPhone: customer?.displayPhone || customer?.phone || "",
    eventMoments: event.eventMoments,
    menuItems: event.menuItems || [],
    drinkType: event.drinkType || "",
    includesDrinks: event.includesDrinks || "",
    tableware: event.tableware || "",
    tablewareQuantities: event.tablewareQuantities || "",
    tablewareDetail: event.tablewareDetail || "",
    tablewareItems: event.tablewareItems || [],
    tablewareRental: event.tablewareRental || {},
    largeContainers: event.largeContainers || "",
    smallContainers: event.smallContainers || "",
    staff: event.staff || "",
    schedule: event.schedule || "",
    dietaryRestrictions: event.dietaryRestrictions || "",
    venueDetail,
    operationalSheet: sheet,
    operationalInventory: getOperationalInventoryCatalogForEvent({ ...event, operationalSheet: sheet }),
    learnedSuggestions: getSimilarOperationalLearnings(event),
  };
}

function findCustomerForLogisticsEvent(event = {}) {
  const clientKey = normalizeSearchKey(event.clientName || "");
  const clientId = normalizeText(event.clientId || "");
  return getCustomerList().find((customer) => {
    if (clientId && customer.id === clientId) return true;
    return clientKey && [
      customer.fullName,
      customer.contactName,
      customer.displayPhone,
    ].some((value) => normalizeSearchKey(value) === clientKey);
  });
}

function normalizeOperationalSheet(sheet = {}, event = {}) {
  const now = new Date().toISOString();
  const categories = {};
  const existingCategories = sheet?.categories && typeof sheet.categories === "object" ? sheet.categories : {};
  const deletedSeeds = normalizeDeletedOperationalSeeds(sheet?.deletedSeeds || {});

  for (const [categoryId] of OPERATIONAL_SHEET_CATEGORIES) {
    categories[categoryId] = Array.isArray(existingCategories[categoryId])
      ? existingCategories[categoryId].map(normalizeOperationalSheetItem).filter((item) => item.text)
      : [];
  }

  cleanOperationalSheetNoise(categories, event);
  cleanDeliveryOnlyOperationalSuggestions(categories, event);
  seedOperationalSheet(categories, event, deletedSeeds);

  return {
    categories,
    deletedSeeds,
    leftovers: normalizeEventLeftovers(sheet.leftovers || event.leftovers || event.leftoverItems || []),
    reservations: normalizeOperationalInventoryReservations(sheet.reservations || sheet.operationalInventory || []),
    postEventNotes: normalizeText(sheet.postEventNotes || sheet.eventComments || ""),
    closeWithoutConformityRequested: parseBooleanLike(sheet.closeWithoutConformityRequested),
    closeWithoutConformityRequestedAt: sheet.closeWithoutConformityRequestedAt || "",
    closeWithoutConformityRequestedBy: normalizeText(sheet.closeWithoutConformityRequestedBy || ""),
    updatedAt: sheet.updatedAt || now,
  };
}

function isDeliveryOnlyEvent(event = {}) {
  if (event.assistanceMode === "delivery_only") return true;
  const values = [
    event.assistanceMode,
    event.serviceMode,
    event.serviceType,
    event.staff,
    event.notes,
  ].map((value) => normalizeSearchKey(value || "")).join(" ");
  return values.includes("solo entrega") || values.includes("delivery only") || values.includes("sin montaje");
}

function cleanDeliveryOnlyOperationalSuggestions(categories, event = {}) {
  if (!isDeliveryOnlyEvent(event)) return;
  const autoSeedKeys = {
    utensilios: [
      "Cuchillos de servicio",
      "Pinzas de servicio",
      "Cucharas de servicio",
      "Tablas de apoyo",
      "Termos / dispensers de cafe",
      "Jarras para leche/agua",
      "Bandejas de servicio",
      "Pinzas para bocados",
    ],
    manteleria: [
      "Manteles para mesa de apoyo",
    ],
    mobiliario: [
      "Mesa de apoyo",
    ],
  };

  for (const [category, labels] of Object.entries(autoSeedKeys)) {
    const keys = new Set(labels.map((label) => normalizeSearchKey(label)));
    categories[category] = (categories[category] || []).filter((item) => {
      const key = normalizeSearchKey(item.text || "");
      const looksManual = item.checked || item.owner || item.note || item.updatedAt;
      return !keys.has(key) || looksManual;
    });
  }
}

function normalizeDeletedOperationalSeeds(input = {}) {
  const deletedSeeds = {};
  for (const [categoryId] of OPERATIONAL_SHEET_CATEGORIES) {
    const values = Array.isArray(input?.[categoryId]) ? input[categoryId] : [];
    deletedSeeds[categoryId] = Array.from(new Set(values.map((value) => normalizeSearchKey(value)).filter(Boolean)));
  }
  return deletedSeeds;
}

function mergeDeletedOperationalSeeds(nextSheet = {}, previousSheet = {}) {
  const merged = {
    ...nextSheet,
    deletedSeeds: normalizeDeletedOperationalSeeds(nextSheet.deletedSeeds || previousSheet.deletedSeeds || {}),
  };
  const previousCategories = previousSheet?.categories || {};
  const nextCategories = nextSheet?.categories || {};

  for (const [categoryId] of OPERATIONAL_SHEET_CATEGORIES) {
    const previousItems = Array.isArray(previousCategories[categoryId]) ? previousCategories[categoryId] : [];
    const nextKeys = new Set((Array.isArray(nextCategories[categoryId]) ? nextCategories[categoryId] : [])
      .map((item) => normalizeSearchKey(item.text || item.name || ""))
      .filter(Boolean));
    for (const item of previousItems) {
      const key = normalizeSearchKey(item.text || item.name || "");
      if (key && !nextKeys.has(key)) {
        merged.deletedSeeds[categoryId].push(key);
      }
    }
    merged.deletedSeeds[categoryId] = Array.from(new Set(merged.deletedSeeds[categoryId]));
  }

  return merged;
}

function getSimilarOperationalLearnings(event = {}) {
  const serviceKey = normalizeServiceCategoryKey(event.serviceType || event.eventMoments || "");
  if (!serviceKey) return [];
  return getErpEventList()
    .filter((item) =>
      item.id !== event.id &&
      item.status === "done" &&
      normalizeServiceCategoryKey(item.serviceType || item.eventMoments || "") === serviceKey &&
      item.operationalSheet?.postEventNotes
    )
    .sort((a, b) => String(b.eventDate || "").localeCompare(String(a.eventDate || "")))
    .slice(0, 5)
    .map((item) => ({
      eventName: item.name,
      eventDate: item.eventDate,
      serviceType: item.serviceType,
      note: item.operationalSheet.postEventNotes,
    }));
}

function normalizeServiceCategoryKey(value) {
  const key = normalizeSearchKey(value || "");
  if (!key) return "";
  if (key.includes("coffee")) return "coffee";
  if (key.includes("finger") || key.includes("agape")) return "finger-agape";
  if (key.includes("cocktail") || key.includes("coctel")) return "cocktail";
  if (key.includes("cena")) return "cena";
  if (key.includes("almuerzo")) return "almuerzo";
  return key.split(" ").slice(0, 3).join("-");
}

function addDaysToDate(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return getDateOnly(date);
}

function normalizeOperationalSheetItem(item = {}) {
  return {
    id: normalizeText(item.id || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    text: normalizeText(item.text || item.name || ""),
    quantity: normalizeText(item.quantity || item.cantidad || ""),
    checked: parseBooleanLike(item.checked),
    owner: normalizeText(item.owner || ""),
    note: normalizeText(item.note || ""),
    updatedAt: item.updatedAt || "",
  };
}

function seedOperationalSheet(categories, event = {}, deletedSeeds = {}) {
  const add = (category, text, quantity = "", note = "") => {
    const clean = normalizeText(text || "");
    if (!clean) return;
    const cleanKey = normalizeSearchKey(clean);
    if ((deletedSeeds[category] || []).includes(cleanKey)) return;
    const exists = categories[category].some((item) => normalizeSearchKey(item.text) === normalizeSearchKey(clean));
    if (!exists) categories[category].push(normalizeOperationalSheetItem({ text: clean, quantity, note, checked: false }));
  };

  if (event.dietaryRestrictions) {
    add("montaje", "Identificar restricciones alimentarias antes del armado", "", event.dietaryRestrictions);
  }
  if (event.largeContainers || event.smallContainers) {
    add("transporte", "Verificar contenedores asignados antes de cargar");
  }
  const waiterCount = Number(event.waiterCount || 0) || extractWaiterCount(event.staff);
  if (waiterCount > 0) {
    add("personal", "Mozos", String(waiterCount));
  } else if (event.staff && !normalizeSearchKey(event.staff).includes("mozo")) {
    add("personal", event.staff);
  }
  seedOperationalSuggestions(categories, event, add);
}

function buildOperationalMenuEntries(event = {}) {
  const entries = [];
  for (const item of event.menuItems || []) {
    const itemName = normalizeText(item.name || "");
    const category = normalizeText(item.category || classifyImportedMenuItem(`${itemName} ${item.detail || ""}`));
    const subItems = Array.isArray(item.subItems) ? item.subItems.filter((subItem) => subItem.name) : [];

    if (subItems.length) {
      for (const subItem of subItems) {
        entries.push({
          text: [itemName, subItem.name].filter(Boolean).join(" - "),
          detail: normalizeText(subItem.detail || item.detail || ""),
          quantity: normalizeText(subItem.quantity || ""),
          category,
          parentName: itemName,
        });
      }
      continue;
    }

    entries.push({
      text: itemName,
      detail: normalizeText(item.detail || ""),
      quantity: normalizeText(item.quantity || ""),
      category,
      parentName: "",
    });
  }
  return entries.filter((entry) => entry.text);
}

function getOperationalMenuEntryQuantity(entry, entries, event = {}) {
  const guests = Number(event.guestCount || 0);
  if (!guests) return normalizeText(entry.quantity || "");
  const category = normalizeSearchKey(entry.category || "");
  const countByCategory = (categoryKey) => entries.filter((item) => normalizeSearchKey(item.category) === categoryKey).length || 1;
  const range = (minPerGuest, maxPerGuest, categoryKey, unit = "u aprox") => {
    const count = countByCategory(categoryKey);
    const min = Math.round((guests * minPerGuest) / count);
    const max = Math.round((guests * maxPerGuest) / count);
    return min === max ? `${min} ${unit}` : `${min}-${max} ${unit}`;
  };

  if (category === "finger_food") return range(4, 5, "finger_food");
  if (category === "empanadas") return range(2, 3, "empanadas");
  if (category === "cazuelas") return range(1, 2, "cazuelas", "porciones aprox");
  if (category === "principal") return range(1, 1, "principal", "porciones aprox");
  if (category === "postre") return range(1, 1, "postre", "porciones aprox");
  return normalizeText(entry.quantity || "");
}

function seedOperationalSuggestions(categories, event = {}, add) {
  const guests = Number(event.guestCount || 0);
  const serviceKey = normalizeServiceCategoryKey(event.serviceType || event.eventMoments || "");
  const assisted = event.assistanceMode === "assisted" || normalizeSearchKey(event.staff).includes("mozo");

  if (serviceKey.includes("coffee")) {
    add("montaje", "Armar estacion de cafe e infusiones");
    add("montaje", "Verificar agua caliente, cafe, leche, azucar y endulzantes");
  }

  if (serviceKey.includes("finger") || serviceKey.includes("agape") || serviceKey.includes("cocktail")) {
    add("montaje", "Definir mesa de apoyo para reposicion");
    add("montaje", "Confirmar circuito de salida de bocados y reposicion");
  }

  if (assisted) {
    add("montaje", "Briefing de servicio con personal");
  }

  add("montaje", "Revisar acceso de carga y descarga");
  add("montaje", "Ubicar mesa principal / estacion de servicio");
  add("montaje", "Verificar electricidad, agua y espacio de apoyo");
  add("desmontaje", "Desmontar el servicio completo");
  add("desmontaje", "Descargar en deposito");
  add("desmontaje", "Separar sucio, sobrantes y devoluciones");
  add("desmontaje", "Controlar que no queden vajilla, manteles ni utensilios");
  add("desmontaje", "Registrar roturas o faltantes");
  add("documentacion", "Llevar ficha operativa del evento");
  add("documentacion", "Confirmar contacto del cliente y lugar");

  if (guests > 0) {
    add("montaje", "Confirmar cantidad final de invitados con responsable");
  }

  if (guests >= 90) {
    add("transporte", "Transporte sugerido: camion");
    add("transporte", "Revisar volumen de mobiliario, conservadoras y vajilla");
  } else if (guests >= 30) {
    add("transporte", "Transporte sugerido: camioneta");
    add("transporte", "Revisar volumen antes de cargar");
  } else if (guests > 0) {
    add("transporte", "Transporte sugerido: auto o camioneta chica");
  } else {
    add("transporte", "Definir transporte segun volumen");
  }

  add("extras", "Cinta, marcador y bolsas");
  add("extras", "Kit de limpieza basico");
  add("extras", "Repaso final antes de salir");
}

function cleanOperationalSheetNoise(categories, event = {}) {
  categories.alimentos = (categories.alimentos || []).map((item) => {
    if (item.quantity) return item;
    const match = normalizeText(item.text || "").match(/^(\d+(?:[.,]\d+)?(?:\s*[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?)\s*-\s*(.+)$/);
    if (!match) return item;
    return {
      ...item,
      quantity: normalizeText(match[1]),
      text: normalizeText(match[2]),
    };
  });
  if ((event.menuItems || []).length) {
    categories.alimentos = (categories.alimentos || []).filter((item) => !isCorruptedImportedText(item.text));
  }
  const removeByKey = {
    bebidas: new Set(["con bebidas", "sin bebidas", "a definir"]),
    personal: new Set(["confirmar cantidad de mozos"]),
  };
  for (const [category, keys] of Object.entries(removeByKey)) {
    categories[category] = (categories[category] || []).filter((item) => !keys.has(normalizeSearchKey(item.text)));
  }
  categories.personal = (categories.personal || []).filter((item) => {
    const key = normalizeSearchKey(item.text);
    return !/^\d+\s*mozo?s?$/.test(key) && !/^mozo?s?\s*\d+$/.test(key);
  });
  for (const [categoryId] of OPERATIONAL_SHEET_CATEGORIES) {
    const seen = new Set();
    categories[categoryId] = (categories[categoryId] || []).filter((item) => {
      const key = normalizeSearchKey(item.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function isCorruptedImportedText(value) {
  const text = String(value || "");
  return text.includes("�") || /\?\?/.test(text);
}

function extractWaiterCount(value) {
  const text = normalizeSearchKey(value || "");
  const match = text.match(/(\d+)\s*mozo?s?/) || text.match(/mozo?s?\s*(\d+)/);
  return match ? Number(match[1] || 0) : 0;
}

function splitOperationalText(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function splitMenuOperationalItems(value) {
  const text = normalizeText(value || "");
  if (!text) return [];
  const baseItems = splitOperationalText(text);
  const source = baseItems.length > 1 ? baseItems : [text];
  return source
    .flatMap((item) => {
      if (item.length < 120) return [item];
      return item
        .replace(/\s+/g, " ")
        .split(/\s+(?=[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 2);
    })
    .filter(Boolean);
}

function splitTablewareOperationalItems(value) {
  return splitOperationalText(value)
    .flatMap((item) => item.split(/\s+\|\s+/g))
    .map((item) => {
      const text = normalizeText(item);
      const match = text.match(/^(.+?)(?:\s*[:x-]\s*|\s+)(\d+(?:[.,]\d+)?\s*[a-zA-ZáéíóúÁÉÍÓÚñÑ]*)$/);
      if (!match) return { text, quantity: "" };
      return {
        text: normalizeText(match[1]),
        quantity: normalizeText(match[2]),
      };
    })
    .filter((item) => item.text);
}

function normalizeEventLeftovers(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: normalizeText(item.id || `sobrante-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    inventoryItemId: normalizeText(item.inventoryItemId || item.itemId || ""),
    food: normalizeText(item.food || item.productName || item.name || ""),
    status: normalizeText(item.status || item.leftoverStatus || "pending"),
    quantity: normalizeText(item.quantity || ""),
    unit: normalizeText(item.unit || ""),
    destination: normalizeText(item.destination || ""),
    storage: normalizeText(item.storage || ""),
    notes: normalizeText(item.notes || ""),
    returnToStock: parseBooleanLike(item.returnToStock),
    itemType: normalizeReceiptItemType(item.itemType || "merchandise"),
    updatedAt: item.updatedAt || "",
  })).filter((item) => item.food);
}

function upsertInventoryMovementsFromEventLeftovers(event = {}) {
  const eventId = normalizeText(event.id || "");
  if (!eventId) return;
  const sourcePrefix = `event-leftover:${eventId}:`;
  erpInventoryMovements = erpInventoryMovements.filter((movement) => !String(movement.sourceId || "").startsWith(sourcePrefix));
  const leftovers = normalizeEventLeftovers(event.operationalSheet?.leftovers || []);
  const movements = leftovers
    .filter((item) => item.returnToStock)
    .filter((item) => !["none", "no_sobro", "sin_sobrante"].includes(normalizeSearchKey(item.status || "")))
    .filter((item) => normalizeSearchKey(item.destination) !== "descartar")
    .map((item) => {
      const quantity = parseDecimalNumber(item.quantity || 0);
      return quantity > 0 ? {
        id: `inv-leftover-${eventId}-${item.id}`,
        date: getDateOnly(new Date()),
        productName: item.food,
        itemType: normalizeReceiptItemType(item.itemType || "merchandise"),
        quantity,
        unit: item.unit || "",
        movementType: "in",
        providerName: "",
        eventId,
        eventName: event.name || "",
        sourceType: "event_leftover",
        sourceId: `${sourcePrefix}${item.id}`,
        notes: [item.destination, item.storage, item.notes].filter(Boolean).join(" | "),
        createdAt: new Date().toISOString(),
      } : null;
    })
    .filter(Boolean);
  if (movements.length) erpInventoryMovements.push(...normalizeInventoryMovementList(movements));
  saveErpInventory();
}

function getOperationalSheetProgress(sheet = {}) {
  const byCategory = {};
  let total = 0;
  let completed = 0;

  for (const [categoryId, label] of OPERATIONAL_SHEET_CATEGORIES.filter(([id]) => OPERATIONAL_PROCEDURE_CATEGORY_IDS.has(id))) {
    const items = sheet.categories?.[categoryId] || [];
    const categoryTotal = items.length;
    const categoryCompleted = items.filter((item) => item.checked).length;
    total += categoryTotal;
    completed += categoryCompleted;
    byCategory[categoryId] = {
      label,
      total: categoryTotal,
      completed: categoryCompleted,
      percent: categoryTotal ? roundMoney((categoryCompleted / categoryTotal) * 100) : 0,
    };
  }

  const percent = total ? roundMoney((completed / total) * 100) : 0;
  return {
    total,
    completed,
    percent,
    status: total === 0 ? "not_started" : completed === 0 ? "not_started" : completed >= total ? "complete" : "in_progress",
    byCategory,
  };
}

function getCustomerInsights() {
  const customers = getCustomerList();
  const events = getErpEventList();
  const quotes = getErpQuoteList();

  return customers.map((customer) => {
    const nameKey = normalizeSearchKey(customer.fullName || customer.contactName || customer.displayPhone);
    const customerEvents = events.filter((event) => normalizeSearchKey(event.clientName) === nameKey);
    const customerQuotes = quotes.filter((quote) => normalizeSearchKey(quote.clientName) === nameKey);
    const accepted = customerQuotes.filter((quote) => quote.status === "accepted").length;

    return {
      ...customer,
      events: customerEvents,
      quotes: customerQuotes,
      quoteCount: customerQuotes.length,
      acceptedQuoteCount: accepted,
      closeRate: customerQuotes.length ? roundMoney((accepted / customerQuotes.length) * 100) : 0,
      totalRevenue: roundMoney(customerQuotes.reduce((sum, quote) => sum + (quote.status === "accepted" ? Number(quote.priceTotal || 0) : 0), 0)),
    };
  });
}

function deleteCustomerRecord(id) {
  const cleanId = normalizeText(id || "");
  if (!cleanId || !customerRecords[cleanId]) return { id: cleanId, deleted: false };
  delete customerRecords[cleanId];
  saveCustomerRecords();
  return { id: cleanId, deleted: true };
}

function getVenueList() {
  syncVenuesFromEventsAndConfig();
  return erpVenues.map(normalizeVenueRecord).sort((a, b) => a.name.localeCompare(b.name));
}

function syncVenuesFromEventsAndConfig() {
  const existing = new Map((Array.isArray(erpVenues) ? erpVenues : [])
    .map((venue) => normalizeVenueRecord(venue))
    .filter((venue) => venue.name)
    .map((venue) => [normalizeSearchKey(venue.name), venue]));

  [...getConfigList("eventVenues"), ...erpEvents.map((event) => event.venue).filter(Boolean)].forEach((name) => {
    const cleanName = normalizeText(name);
    const key = normalizeSearchKey(cleanName);
    if (!key || existing.has(key)) return;
    existing.set(key, normalizeVenueRecord({ name: cleanName }));
  });

  erpVenues = Array.from(existing.values());
  saveErpVenues();
}

function normalizeVenueRecord(input = {}) {
  const now = new Date().toISOString();
  const name = normalizeText(input.name || input.venue || "");
  return {
    id: normalizeText(input.id || createVenueId(name)),
    name,
    address: normalizeText(input.address || input.direccion || ""),
    phone: normalizeText(input.phone || input.telefono || ""),
    contactName: normalizeText(input.contactName || input.contacto || ""),
    email: normalizeText(input.email || ""),
    reference: normalizeText(input.reference || input.references || input.referencia || ""),
    notes: normalizeText(input.notes || input.notas || ""),
    latitude: input.latitude !== "" && input.latitude !== undefined ? Number(input.latitude) : null,
    longitude: input.longitude !== "" && input.longitude !== undefined ? Number(input.longitude) : null,
    mapLabel: normalizeText(input.mapLabel || ""),
    mapProvider: normalizeText(input.mapProvider || ""),
    mapPlaceId: normalizeText(input.mapPlaceId || ""),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || "",
  };
}

function createVenueId(name) {
  const base = normalizeSearchKey(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `lugar-${base || Date.now()}`;
}

function saveVenueOption(input = {}) {
  const name = normalizeText(input.name || input.venue || "");
  if (!name) {
    throw new Error("Ingrese el nombre del lugar.");
  }

  const now = new Date().toISOString();
  const id = normalizeText(input.id || "");
  const index = erpVenues.findIndex((venue) =>
    (id && venue.id === id) || normalizeSearchKey(venue.name) === normalizeSearchKey(name)
  );
  const previous = index >= 0 ? erpVenues[index] : {};
  const venue = normalizeVenueRecord({
    ...previous,
    ...input,
    id: id || previous.id || createVenueId(name),
    name,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });

  if (index >= 0) {
    erpVenues[index] = venue;
  } else {
    erpVenues.push(venue);
  }

  if (!Array.isArray(BOT_CONFIG.eventVenues)) {
    BOT_CONFIG.eventVenues = [];
  }

  if (!BOT_CONFIG.eventVenues.some((item) => normalizeSearchKey(item) === normalizeSearchKey(venue.name))) {
    BOT_CONFIG.eventVenues.push(venue.name);
    BOT_CONFIG.eventVenues.sort((a, b) => a.localeCompare(b));
    saveBotConfig();
  }

  saveErpVenues();
  return venue;
}

function deleteVenueRecord(id) {
  const cleanId = normalizeText(id || "");
  const venue = erpVenues.find((item) => item.id === cleanId);
  if (!venue) return { id: cleanId, deleted: false };

  erpVenues = erpVenues.filter((item) => item.id !== cleanId);
  if (Array.isArray(BOT_CONFIG.eventVenues)) {
    BOT_CONFIG.eventVenues = BOT_CONFIG.eventVenues.filter((item) => normalizeSearchKey(item) !== normalizeSearchKey(venue.name));
    saveBotConfig();
  }
  saveErpVenues();
  return { id: cleanId, deleted: true };
}

async function searchMapPlaces(query) {
  const cleanQuery = normalizeText(query || "");
  if (!cleanQuery) return [];
  const normalizedQuery = normalizeSearchKey(cleanQuery);
  const mendozaBiasedQuery = /\bmendoza\b|\bargentina\b/.test(normalizedQuery)
    ? cleanQuery
    : `${cleanQuery}, Mendoza, Argentina`;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");
  url.searchParams.set("viewbox", "-69.60,-32.55,-68.45,-33.25");
  url.searchParams.set("bounded", "0");
  url.searchParams.set("q", mendozaBiasedQuery);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "CateringERP/1.0 (venue-search)",
      },
    });

    if (!response.ok) {
      throw new Error(`Mapa no disponible (${response.status})`);
    }

    const results = await response.json();
    return results.map((item) => ({
      name: normalizeText(item.name || item.display_name?.split(",")[0] || ""),
      display_name: normalizeText(item.display_name || ""),
      lat: Number(item.lat),
      lon: Number(item.lon),
      place_id: normalizeText(item.place_id || ""),
      type: normalizeText(item.type || ""),
      category: normalizeText(item.category || ""),
      mendozaPriority: normalizeSearchKey(item.display_name || "").includes("mendoza") ? 0 : 1,
    }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      .sort((a, b) => a.mendozaPriority - b.mendozaPriority);
  } finally {
    clearTimeout(timeout);
  }
}

function getProductPriceAlerts() {
  return Object.values(productPriceRecords)
    .filter((product) => Number(product.previousUnitCost || 0) > 0 && Number(product.changePercent || 0) !== 0)
    .map((product) => ({
      ...product,
      affectedRecipes: findRecipesUsingProduct(product.name).map((recipe) => recipe.name),
    }))
    .sort((a, b) => Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0)));
}

function findRecipesUsingProduct(productName) {
  const key = normalizeProductKey(productName);
  return getRecipeList().filter((recipe) =>
    (recipe.items || []).some((item) => item.type !== "recipe" && normalizeProductKey(item.name) === key)
  );
}

function getErpEventList() {
  return _fromCache("evt", CACHE_TTL, () =>
    erpEvents.map(normalizeErpEvent).sort((a, b) => {
      const dateCompare = String(a.eventDate || "9999-12-31").localeCompare(String(b.eventDate || "9999-12-31"));
      return dateCompare || a.name.localeCompare(b.name);
    })
  );
}

function getProductionEventList() {
  return getErpEventList()
    .filter((event) => ["confirmed", "production", "done"].includes(event.status))
    .map((event) => ({
      id: event.id,
      name: event.name,
      clientName: event.clientName,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      guestCount: event.guestCount,
      venue: event.venue,
      serviceType: event.serviceType,
      status: event.status,
      owner: event.owner,
      role: event.role,
      nextAction: event.nextAction,
      productionStatus: event.productionStatus,
      menuStatus: event.menuStatus,
      checklist: event.checklist,
      checklistDetails: event.checklistDetails,
      menuItems: event.menuItems,
      selectedMenu: event.selectedMenu,
      dietaryRestrictions: event.dietaryRestrictions,
      notes: event.notes,
      operationalSheet: event.operationalSheet,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }))
    .sort(compareEventsByDate);
}

function normalizeErpEvent(event = {}) {
  const quote = getBestQuoteForEvent(event.id);
  const purchases = getErpPurchaseList().filter((purchase) => purchase.eventName && normalizeSearchKey(purchase.eventName) === normalizeSearchKey(event.name));
  const purchaseTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const stockItems = normalizeStockCostItems(event.stockItems || event.stockCosts || []);
  const stockCostTotal = stockItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const quoteCostTotal = quote ? Number(quote.costTotal || 0) : 0;
  const staffBudgetCost = quote ? Number(quote.staffCost || 0) : 0;
  const staffRealCost = getEventStaffShiftTotal(event);
  const appliedStaffCost = staffRealCost > 0 ? staffRealCost : staffBudgetCost;
  const finalCostTotal = Math.max(0, quoteCostTotal - staffBudgetCost) + appliedStaffCost + purchaseTotal + stockCostTotal;
  const priceMode = normalizeText(event.priceMode || "total");
  const pricePerPerson = roundMoney(Number(event.pricePerPerson || 0));
  const servicePriceTotal = roundMoney(Number(event.servicePriceTotal || event.priceTotal || 0));
  const eventSaleTotal = priceMode === "per_person"
    ? roundMoney(pricePerPerson * parseDecimalNumber(event.guestCount || 0))
    : servicePriceTotal;
  const quoteTotal = quote ? Number(quote.priceTotal || 0) : eventSaleTotal;
  const menuItems = normalizeEventMenuItems(event.menuItems || event.selectedMenu || []);
  const selectedMenu = menuItems.length
    ? menuItems.map((item) => item.name).filter(Boolean).join(", ")
    : normalizeText(event.selectedMenu || "");
  const finalMargin = quoteTotal - finalCostTotal;
  const invoiceRequirement = normalizeEventInvoiceRequirement(event.invoiceRequirement || event.billingRequirement || "");
  const invoiceStatus = invoiceRequirement === "no_invoice"
    ? "not_applicable"
    : normalizeEventInvoiceStatus(event.invoiceStatus || "");
  const tablewareItems = normalizeEventTablewareItems(event.tablewareItems || []);
  const tablewareRental = normalizeEventTablewareRental(event.tablewareRental || {});

  return {
    id: event.id || `evento-${Date.now()}`,
    name: normalizeText(event.name || event.eventName || ""),
    clientId: normalizeText(event.clientId || ""),
    clientName: normalizeText(event.clientName || ""),
    eventDate: normalizePanelDate(event.eventDate || event.date || ""),
    eventTime: normalizeText(event.eventTime || ""),
    guestCount: parseDecimalNumber(event.guestCount || 0),
    venue: normalizeText(event.venue || ""),
    venueAddress: normalizeText(event.venueAddress || event.address || ""),
    venueReference: normalizeText(event.venueReference || ""),
    latitude: event.latitude !== "" && event.latitude !== undefined && event.latitude !== null ? Number(event.latitude) : null,
    longitude: event.longitude !== "" && event.longitude !== undefined && event.longitude !== null ? Number(event.longitude) : null,
    mapLabel: normalizeText(event.mapLabel || ""),
    serviceType: normalizeText(event.serviceType || ""),
    assistanceMode: normalizeText(event.assistanceMode || ""),
    waiterCount: parseDecimalNumber(event.waiterCount || 0),
    eventMoments: normalizeText(event.eventMoments || ""),
    dietaryRestrictionMode: normalizeText(event.dietaryRestrictionMode || ""),
    selectedMenu,
    menuItems,
    includesDrinks: normalizeText(event.includesDrinks || ""),
    drinkType: normalizeText(event.drinkType || ""),
    tableware: normalizeText(event.tableware || ""),
    tablewareQuantities: normalizeText(event.tablewareQuantities || ""),
    tablewareDetail: normalizeText(event.tablewareDetail || ""),
    tablewareItems,
    tablewareRental,
    largeContainers: normalizeText(event.largeContainers || ""),
    smallContainers: normalizeText(event.smallContainers || ""),
    staff: normalizeText(event.staff || ""),
    schedule: normalizeText(event.schedule || ""),
    budgetRange: normalizeText(event.budgetRange || ""),
    priceMode,
    pricePerPerson,
    servicePriceTotal,
    status: normalizeErpEventStatus(event.status || "lead"),
    owner: normalizeText(event.owner || event.assignedTo || ""),
    role: normalizeText(event.role || ""),
    nextAction: normalizeText(event.nextAction || ""),
    paymentStatus: normalizeText(event.paymentStatus || ""),
    collectedAmount: roundMoney(parseDecimalNumber(event.collectedAmount || event.collectionAmount || 0)),
    collectionStatus: normalizeCollectionStatus(event.collectionStatus || event.paymentStatus, parseDecimalNumber(event.collectedAmount || event.collectionAmount || 0), quoteTotal),
    collectionDueDate: normalizePanelDate(event.collectionDueDate || "") || "",
    collectionMethod: normalizeText(event.collectionMethod || ""),
    collectionNotes: normalizeText(event.collectionNotes || ""),
    invoiceRequirement,
    invoiceStatus,
    invoiceNumber: invoiceRequirement === "no_invoice" ? "" : normalizeText(event.invoiceNumber || ""),
    productionStatus: normalizeText(event.productionStatus || ""),
    menuStatus: normalizeText(event.menuStatus || ""),
    staffStatus: normalizeText(event.staffStatus || ""),
    logisticsStatus: normalizeText(event.logisticsStatus || ""),
    clientConformity: normalizeEventConformity(event.clientConformity || event.conformity || {}),
    conformityWaiver: normalizeEventConformityWaiver(event.conformityWaiver || event.conformityException || {}),
    checklist: normalizeOperationalChecklist(event.checklist || event),
    checklistDetails: normalizeText(event.checklistDetails || ""),
    operationalSheet: normalizeOperationalSheet(event.operationalSheet || {}, event),
    dietaryRestrictions: normalizeText(event.dietaryRestrictions || ""),
    notes: normalizeText(event.notes || ""),
    quoteTotal: roundMoney(quoteTotal),
    quoteCostTotal: roundMoney(quoteCostTotal),
    staffBudgetCost: roundMoney(staffBudgetCost),
    staffRealCost: roundMoney(staffRealCost),
    appliedStaffCost: roundMoney(appliedStaffCost),
    quoteMarginPercent: quote ? Number(quote.marginPercent || 0) : 0,
    purchaseTotal: roundMoney(purchaseTotal),
    stockCostTotal: roundMoney(stockCostTotal),
    stockItems,
    finalCostTotal: roundMoney(finalCostTotal),
    operationalMargin: roundMoney(finalMargin),
    operationalMarginPercent: quoteTotal > 0 ? roundMoney((finalMargin / quoteTotal) * 100) : 0,
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      date: purchase.date,
      provider: purchase.provider,
      description: purchase.description,
      lineItems: (purchase.lineItems || []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        total: item.total,
        ivaRate: item.ivaRate,
      })),
      paymentStatus: purchase.paymentStatus,
      totalAmount: purchase.totalAmount,
    })),
    eventType: normalizeText(event.eventType || "catering"),
    ventaPlanner: event.ventaPlanner || undefined,
    createdAt: event.createdAt || "",
    updatedAt: event.updatedAt || "",
  };
}

function compareEventsByDate(a, b) {
  const dateCompare = String(a.eventDate || "9999-12-31").localeCompare(String(b.eventDate || "9999-12-31"));
  return dateCompare || String(a.name || "").localeCompare(String(b.name || ""));
}

function getEventStaffShiftTotal(event = {}) {
  const eventId = normalizeText(event.id || "");
  const eventNameKey = normalizeSearchKey(event.name || event.eventName || "");
  return normalizeStaffShiftList(erpStaffShifts)
    .filter((shift) => !isStaffShiftDeleted(shift))
    .filter((shift) => !["absent", "cancelled"].includes(shift.attendanceStatus))
    .filter((shift) => {
      if (eventId && shift.eventId === eventId) return true;
      return eventNameKey && normalizeSearchKey(shift.eventName || "") === eventNameKey;
    })
    .reduce((sum, shift) => sum + Number(shift.totalAmount || 0), 0);
}

function getErpEventStatusLabel(status) {
  return {
    lead: "Consulta",
    quoted: "Presupuestado",
    confirmed: "Confirmado",
    production: "Produccion",
    done: "Finalizado",
    lost: "Perdido",
    cancelled: "Cancelado",
  }[status] || status || "Sin estado";
}

function normalizeEventMenuItems(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return { name: normalizeText(item), quantity: "", detail: "", category: "", suggestedQuantity: "", subItems: [] };
        return {
          name: normalizeText(item.name || item.item || item.description || ""),
          quantity: normalizeText(item.quantity || item.qty || ""),
          detail: normalizeText(item.detail || item.notes || ""),
          category: normalizeText(item.category || item.type || ""),
          suggestedQuantity: normalizeText(item.suggestedQuantity || item.suggestion || ""),
          subItems: normalizeEventMenuItems(item.subItems || item.children || item.varieties || []),
        };
      })
      .filter((item) => item.name);
  }

  return String(input || "")
    .split(/\r?\n|,/)
    .map((name) => ({ name: normalizeText(name) }))
    .filter((item) => item.name);
}

function normalizeStockCostItems(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const quantity = parseDecimalNumber(item.quantity || 1);
      const unitAmount = parseDecimalNumber(item.unitAmount || item.amount || 0);
      const total = roundMoney(parseDecimalNumber(item.total || 0) || quantity * unitAmount);
      return {
        description: normalizeText(item.description || item.name || ""),
        quantity,
        unitAmount: roundMoney(unitAmount),
        total,
        notes: normalizeText(item.notes || ""),
      };
    })
    .filter((item) => item.description || item.total > 0);
}

function normalizeOperationalChecklist(input = {}) {
  const checklist = input.checklist && typeof input.checklist === "object" ? input.checklist : input;
  return {
    purchases: parseBooleanLike(checklist.purchases ?? input.purchases ?? input.checklistPurchases),
    production: parseBooleanLike(checklist.production ?? input.production ?? input.checklistProduction),
    staff: parseBooleanLike(checklist.staff ?? input.staff ?? input.checklistStaff),
    logistics: parseBooleanLike(checklist.logistics ?? input.logistics ?? input.checklistLogistics),
    menu: parseBooleanLike(checklist.menu ?? input.menu ?? input.checklistMenu),
    payments: parseBooleanLike(checklist.payments ?? input.payments ?? input.checklistPayments),
  };
}

function parseBooleanLike(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function saveErpEventRecord(input, user = null) {
  const name = normalizeText(input.name || input.eventName || "");

  if (!name) {
    throw new Error("Ingrese el nombre del evento.");
  }

  const now = new Date().toISOString();
  const existingIndex = erpEvents.findIndex((event) => event.id === input.id);
  const previous = existingIndex >= 0 ? erpEvents[existingIndex] : {};
  let event = normalizeErpEvent({
    ...previous,
    ...input,
    id: input.id || previous.id || `evento-${Date.now()}`,
    name,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });

  if (event.status === "done" && event.eventDate && event.eventDate > new Date().toISOString().slice(0, 10)) {
    throw new Error("No se puede marcar como realizado un evento con fecha futura.");
  }
  if (event.status === "done" && !event.clientConformity?.fileName && !event.conformityWaiver?.approved) {
    const sheet = normalizeOperationalSheet(event.operationalSheet || {}, event);
    const hasPendingWithoutConformityRequest = event.logisticsStatus === "pending_admin_close" &&
      parseBooleanLike(sheet.closeWithoutConformityRequested);
    const adminApprovedWithoutConformity = parseBooleanLike(input.approveWithoutConformity || input.authorizeWithoutConformity);
    const adminUserApprovedWithoutConformity = user && (user.role === "admin" || hasPanelPermission(user, "*"));
    if (hasPendingWithoutConformityRequest || adminApprovedWithoutConformity || adminUserApprovedWithoutConformity) {
      event = normalizeErpEvent({
        ...event,
        conformityWaiver: {
          approved: true,
          approvedAt: now,
          approvedBy: normalizeText(input.approvedBy || input.updatedBy || user?.displayName || user?.username || "Administracion"),
          requestedBy: sheet.closeWithoutConformityRequestedBy || "",
          requestedAt: sheet.closeWithoutConformityRequestedAt || "",
          reason: normalizeText(input.conformityWaiverReason || sheet.postEventNotes || "Cierre autorizado sin conformidad adjunta."),
        },
        logisticsStatus: "admin_approved_close",
      });
    }
  }
  if (event.status === "done") {
    validateEventConformityForClose(event);
  }

  if (existingIndex >= 0) {
    erpEvents[existingIndex] = event;
  } else {
    erpEvents.push(event);
  }

  if (event.clientName || event.clientId) {
    upsertCustomerRecord(event.clientId || event.clientName, {
      fullName: event.clientName,
      contactName: event.clientName,
      lastEventType: event.serviceType,
      lastBudgetAt: event.eventDate,
    });
  }

  ensurePurchaseOptionExists("event", event.name);
  if (event.venue) {
    saveVenueOption({ name: event.venue });
  }
  saveErpEvents();
  return event;
}

function deleteErpEventRecord(id) {
  erpEvents = erpEvents.filter((event) => event.id !== id);
  saveErpEvents();
}

function getErpQuoteList() {
  return _fromCache("quot", CACHE_TTL, () =>
    erpQuotes.map(normalizeErpQuote).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  );
}

async function importQuoteFromDocument(input = {}) {
  const fileName = normalizeText(input.fileName || "presupuesto");
  const text = await extractQuoteDocumentText(input);
  if (!text || text.length < 20) {
    throw new Error("No pude leer texto suficiente del presupuesto. Si es una imagen o PDF escaneado, conviertalo a texto/PDF con texto o carguelo manualmente.");
  }

  const parsed = parseImportedQuoteText(text, fileName);
  return {
    ...parsed,
    fileName,
    sourceText: text.slice(0, 12000),
    summary: {
      menuItems: parsed.menuItems.length,
      drinks: parsed.drinkItems.length,
      priceTotal: parsed.priceTotal,
      guestCount: parsed.guestCount,
    },
  };
}

async function extractQuoteDocumentText(input = {}) {
  const dataUrl = String(input.dataUrl || "");
  const textInput = normalizeText(input.text || "");
  if (textInput) return normalizeImportedDocumentText(textInput);

  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new Error("Suba un archivo valido para importar.");
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("El presupuesto no puede superar 8 MB.");
  }

  if (mimeType.includes("pdf")) {
    return normalizeImportedDocumentText(await extractTextFromPdfBuffer(buffer));
  }

  if (mimeType.includes("text") || mimeType.includes("csv") || mimeType.includes("json")) {
    return normalizeImportedDocumentText(buffer.toString("utf8"));
  }

  return normalizeImportedDocumentText(buffer.toString("utf8"));
}

async function extractTextFromPdfBuffer(buffer) {
  const parsed = await extractTextWithPdfParse(buffer);
  if (parsed && parsed.length > 40) {
    return parsed;
  }

  const raw = buffer.toString("latin1");
  const chunks = [raw];
  const streamRegex = /<<(?:.|\r|\n)*?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let streamMatch;
  while ((streamMatch = streamRegex.exec(raw))) {
    const streamStart = streamMatch.index;
    const dictionary = raw.slice(Math.max(0, streamStart - 800), streamStart);
    const streamBytes = Buffer.from(streamMatch[1], "latin1");
    if (dictionary.includes("/FlateDecode")) {
      try {
        chunks.push(zlib.inflateSync(streamBytes).toString("latin1"));
      } catch (error) {
        try {
          chunks.push(zlib.inflateRawSync(streamBytes).toString("latin1"));
        } catch (_) {
          chunks.push(streamBytes.toString("latin1"));
        }
      }
    } else {
      chunks.push(streamBytes.toString("latin1"));
    }
  }

  return chunks.map(extractPdfTextTokens).join("\n");
}

async function extractTextWithPdfParse(buffer) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result?.text || "";
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.warn("No se pudo leer PDF con pdf-parse:", error.message);
    return "";
  }
}

function extractPdfTextTokens(text) {
  const tokens = [];
  const literalRegex = /\((?:\\.|[^\\)])*\)/g;
  let match;
  while ((match = literalRegex.exec(text))) {
    const value = decodePdfLiteral(match[0].slice(1, -1));
    if (looksLikeReadableText(value)) tokens.push(value);
  }

  const hexRegex = /<([0-9A-Fa-f]{4,})>/g;
  while ((match = hexRegex.exec(text))) {
    const value = decodePdfHex(match[1]);
    if (looksLikeReadableText(value)) tokens.push(value);
  }
  return tokens.join("\n");
}

function decodePdfLiteral(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfHex(hex) {
  const clean = hex.length % 2 ? `${hex}0` : hex;
  const bytes = Buffer.from(clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars = [];
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      chars.push(String.fromCharCode(bytes.readUInt16BE(index)));
    }
    return chars.join("");
  }
  return bytes.toString("utf8");
}

function looksLikeReadableText(value) {
  const clean = normalizeText(value || "");
  return clean.length >= 2 && /[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]/.test(clean);
}

function normalizeImportedDocumentText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseImportedQuoteText(text, fileName = "") {
  const lines = getImportedLogicalLines(text);
  const compact = lines.join("\n");
  const eventName = pickLabeledValue(lines, ["evento", "nombre del evento", "propuesta"]) || cleanFileTitle(fileName);
  const clientName = pickLabeledValue(lines, ["cliente", "contacto"]) || "";
  const venue = pickLabeledValue(lines, ["ubicacion", "ubicación", "lugar", "venue"]) || "";
  const serviceType = pickLabeledValue(lines, ["servicio", "tipo de servicio"]) || inferServiceTypeFromText(compact);
  const guestCount = parseDecimalNumber((compact.match(/(\d+(?:[.,]\d+)?)\s*(?:invitados|personas|pax|comensales)/i) || [])[1] || 0);
  const eventDate = normalizePanelDate((compact.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/) || [])[1] || "");
  const eventTime = (compact.match(/(?:hora|horario)\s*:?\s*([0-2]?\d[:.][0-5]\d)/i) || [])[1] || "";
  const pricePerPerson = parseMoneyFromText(
    (compact.match(/(?:precio|inversion|valor)?\s*[:\-]?\s*\$?\s*([\d\.\,]+)\s*(?:x|por)\s*(?:persona|pax)/i) || [])[1]
    || (compact.match(/(?:precio|valor)\s+(?:por\s+)?(?:persona|pax)\s*:?\s*\$?\s*([\d\.\,]+)/i) || [])[1]
    || ""
  );
  const totalMatch = compact.match(/(?:venta total|total propuesta|inversion total|precio total|total)\s*:?\s*\$?\s*([\d\.\,]+)/i);
  const priceTotal = parseMoneyFromText(totalMatch?.[1] || "") || (pricePerPerson && guestCount ? roundMoney(pricePerPerson * guestCount) : 0);
  const menuItems = splitImportedItems(extractImportedSection(lines, ["menu", "menu y bebidas", "menú", "menú y bebidas"], ["bebidas", "operacion", "operación", "precio", "condiciones", "notas"]));
  const inlineMenu = splitImportedItems(pickLabeledValue(lines, ["menu", "menú"]));
  const structured = extractStructuredImportedQuoteItems(lines);
  const bulletMenu = structured.menuItems;
  const drinkItems = splitImportedItems([
    ...extractImportedSection(lines, ["bebidas", "detalle bebidas"], ["operacion", "operación", "precio", "condiciones", "notas", "vajilla"]),
    pickLabeledValue(lines, ["bebidas", "detalle bebidas"]),
    ...extractImportedDrinkItems(lines),
  ].filter(Boolean).join("\n"));
  const notes = extractImportedSection(lines, ["observaciones", "notas"], ["condiciones", "precio"]).join("\n");
  const fallbackMenuItems = uniqueImportedItems(menuItems.length ? menuItems : inlineMenu)
    .map((name) => enrichImportedMenuItem(splitImportedTitleDetail(name)));

  return {
    eventName,
    clientName,
    venue,
    eventDate,
    eventTime,
    guestCount,
    serviceType,
    priceMode: pricePerPerson ? "per_person" : "total",
    pricePerPerson,
    priceTotal,
    menuItems: structured.menuItems.length ? structured.menuItems : fallbackMenuItems,
    includedServices: structured.includedServices,
    drinkItems: uniqueImportedItems(drinkItems),
    includesDrinks: drinkItems.length ? "Con bebidas" : "",
    notes,
  };
}

function getImportedLogicalLines(text) {
  const rawLines = String(text || "")
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const lines = [];

  for (const line of rawLines) {
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) continue;
    const previous = lines[lines.length - 1] || "";
    const startsNewBlock = /^[●○■•\-]\s*/.test(line)
      || /^[ivx]+\.\s/i.test(line)
      || /^(principal|postre|bandejeo|estaci[oó]n|infraestructura|personal|vajilla|ambientaci[oó]n|seguridad|mobiliario|referencias|armado de cocina|precio|aclaraciones|condiciones)\b/i.test(line);
    const isContinuation = previous
      && !startsNewBlock
      && /^[a-záéíóúñ0-9(]/.test(line)
      && !/[.;:]$/.test(previous);

    if (isContinuation) {
      lines[lines.length - 1] = `${previous} ${line}`.trim();
    } else {
      lines.push(line);
    }
  }

  return lines;
}

function pickLabeledValue(lines, labels) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const regex = new RegExp(`^(?:${labelPattern})\\s*[:\\-]\\s*(.+)$`, "i");
  const line = lines.find((item) => regex.test(item));
  return line ? normalizeText(line.match(regex)?.[1] || "") : "";
}

function extractImportedSection(lines, startLabels, endLabels) {
  const startKeys = startLabels.map(normalizeSearchKey);
  const endKeys = endLabels.map(normalizeSearchKey);
  const output = [];
  let active = false;
  for (const line of lines) {
    const key = normalizeSearchKey(line.replace(/:$/, ""));
    const isStart = startKeys.some((label) => key === label || key.startsWith(`${label}:`));
    if (isStart) {
      active = true;
      const inline = line.includes(":") ? line.split(":").slice(1).join(":").trim() : "";
      if (inline) output.push(inline);
      continue;
    }
    if (active && endKeys.some((label) => key === label || key.startsWith(`${label}:`))) break;
    if (active) output.push(line);
  }
  return output;
}

function splitImportedItems(value) {
  const text = Array.isArray(value) ? value.join("\n") : String(value || "");
  return text
    .split(/\n|•|- |\u2022|●|○|■|;|,(?=\s*[A-ZÁÉÍÓÚÑ])/)
    .flatMap((line) => line.split(/\.\s+(?=[A-ZÁÉÍÓÚÑ])/))
    .map((item) => normalizeText(item.replace(/^(menu|menú|bebidas?)\s*:?\s*/i, "")))
    .map((item) => item.replace(/[.;,\s]+$/, ""))
    .filter((item) => item.length > 2 && !/^(a definir|sin bebidas|sin menu)$/i.test(item));
}

function extractImportedBulletMenuItems(lines) {
  const stopPattern = /^(precio|aclaraciones|condiciones|infraestructura|personal|vajilla|ambientacion|ambientación|seguridad|mobiliario|referencias|armado de cocina)\b/i;
  const skipPattern = /^(propuesta|ubicacion|ubicación|servicio de|una secuencia|principal|i\.|ii\.|iii\.|estacion|estación|bandejeo|clasicos|clásicos|frescura|delicadeza|postre regional|cortes de|embutidos|ensaladas|panificados)\b/i;
  const items = [];
  let active = false;
  for (const originalLine of lines) {
    const line = normalizeText(originalLine);
    if (/recepcion|recepción|welcome|bandejeo|principal|asado|menu|menú/i.test(line)) {
      active = true;
    }
    if (!active) continue;
    if (stopPattern.test(line)) break;
    const hadBullet = /^[●○■•\-]\s*/.test(line);
    const clean = line
      .replace(/^[●○■•\-]\s*/, "")
      .replace(/^--\s*\d+\s+of\s+\d+\s*--$/i, "")
      .trim();
    if (!clean || skipPattern.test(clean)) continue;
    if (!hadBullet && !/:\s+.+/.test(clean)) continue;
    if (/^(agua mineral|linea clasica|línea clásica|gaseosas)/i.test(clean)) continue;
    items.push(clean.replace(/:$/, ""));
  }
  return splitImportedItems(items.join("\n"));
}

function extractStructuredImportedQuoteItems(lines) {
  const menuItems = [];
  const includedServices = [];
  let activeMenu = false;
  let activeInfrastructure = false;
  let current = null;
  const menuHeadingPattern = /recepcion|recepción|welcome|bandejeo|principal|asado|menu|menú|postre|picada|finger|cazuela/i;
  const sectionHeadingPattern = /^(i+\.|[ivx]+\.)\s|^(principal|postre|bandejeo|estaci[oó]n|cortes|embutidos|ensaladas|panificados)\b/i;
  const stopPattern = /^(precio|aclaraciones|condiciones)\b/i;

  for (const rawLine of lines) {
    const line = normalizeText(rawLine);
    if (!line || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) continue;
    if (stopPattern.test(line)) break;
    const cleanRouteLine = cleanImportedBulletLine(line);

    if (isImportedInfrastructureLine(cleanRouteLine)) {
      activeInfrastructure = true;
      activeMenu = false;
      current = null;
      includedServices.push(cleanRouteLine);
      continue;
    }

    if (activeInfrastructure) {
      const service = cleanImportedBulletLine(line);
      if (service) includedServices.push(service);
      continue;
    }

    if (menuHeadingPattern.test(line)) {
      activeMenu = true;
      current = null;
      continue;
    }

    if (!activeMenu) continue;
    if (sectionHeadingPattern.test(line) && !/^[●○■•\-]/.test(line)) {
      current = null;
      continue;
    }

    const bulletLevel = getImportedBulletLevel(line);
    const clean = cleanImportedBulletLine(line);
    if (!clean) continue;
    if (isImportedInfrastructureLine(clean)) {
      activeInfrastructure = true;
      activeMenu = false;
      current = null;
      includedServices.push(clean);
      continue;
    }
    if (isImportedNarrativeLine(clean)) continue;
    if (/^(agua mineral|linea clasica|línea clásica|gaseosas)/i.test(clean)) continue;
    if (isImportedMenuGroupHeading(clean, bulletLevel)) {
      if (shouldKeepImportedMenuParent(clean)) {
        current = enrichImportedMenuItem(splitImportedTitleDetail(clean));
        current.subItems = current.subItems || [];
        expandImportedParentDetail(current);
        menuItems.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (!bulletLevel && !clean.includes(":")) continue;

    const item = enrichImportedMenuItem(splitImportedTitleDetail(clean));
    if (bulletLevel >= 2 && current && shouldKeepImportedMenuParent(current.name)) {
      current.subItems = current.subItems || [];
      current.subItems.push(item);
    } else {
      menuItems.push(item);
      current = item;
    }
  }

  return { menuItems: compactImportedMenuTree(menuItems), includedServices: uniqueImportedItems(includedServices) };
}

function getImportedBulletLevel(line) {
  if (/^[■]\s*/.test(line)) return 3;
  if (/^[○]\s*/.test(line)) return 2;
  if (/^[●•\-]\s*/.test(line)) return 1;
  return 0;
}

function cleanImportedBulletLine(line) {
  return normalizeText(line || "")
    .replace(/^[●○■•\-]\s*/, "")
    .replace(/:$/, "")
    .trim();
}

function isImportedInfrastructureLine(line) {
  return /^(infraestructura|infraestructura y servicios|servicios incluidos|personal|vajilla|manteler[ií]a|ambientaci[oó]n|seguridad|mobiliario|referencias|armado de cocina|sonido|iluminaci[oó]n|ba[ñn]os|generador|grupo electr[oó]geno)\b/i.test(line || "");
}

function isImportedMenuGroupHeading(line, bulletLevel = 0) {
  const key = normalizeSearchKey(line || "").replace(/:$/, "");
  if (isImportedInfrastructureLine(line)) return true;
  if (/^(clasicos reversionados|clasicos|frescura y vegetales|frescura|delicadeza en masa|delicadeza|postre regional|cortes de ternera|cortes de carne|embutidos parrilleros|embutidos|ensaladas|panificados|guarniciones)$/.test(key)) {
    return true;
  }
  return bulletLevel === 1
    && !shouldKeepImportedMenuParent(line)
    && !line.includes(":")
    && line.split(/\s+/).length <= 4;
}

function shouldKeepImportedMenuParent(line) {
  return /empanad|picada|tabla|cazuela|principal|asado criollo|plato principal|postre/i.test(line || "");
}

function expandImportedParentDetail(item) {
  if (!item.detail || item.subItems?.length) return;
  const pieces = splitImportedItems(item.detail);
  if (pieces.length < 2) return;
  item.subItems = pieces.map((name) => enrichImportedMenuItem({ name }));
  item.detail = "";
}

function isImportedNarrativeLine(line) {
  return /^(servicio de|una secuencia|pensada para|y sabores|tradicional con|asegurar|todas nuestras|el presente|los valores|para congelar|el pago)/i.test(line);
}

function splitImportedTitleDetail(value) {
  const clean = normalizeText(value || "");
  const colonIndex = clean.indexOf(":");
  if (colonIndex > 2 && colonIndex < clean.length - 2) {
    return {
      name: clean.slice(0, colonIndex).trim(),
      detail: clean.slice(colonIndex + 1).trim(),
    };
  }
  return { name: clean, detail: "" };
}

function enrichImportedMenuItem(item = {}) {
  const name = normalizeText(item.name || "");
  const detail = normalizeText(item.detail || "");
  const category = classifyImportedMenuItem(`${name} ${detail}`);
  return {
    name,
    detail,
    category,
    suggestedQuantity: getImportedMenuQuantitySuggestion(category, `${name} ${detail}`),
    quantity: "",
    subItems: Array.isArray(item.subItems) ? item.subItems : [],
  };
}

function classifyImportedMenuItem(value) {
  const key = normalizeSearchKey(value || "");
  if (/empanad|pastelit/.test(key)) return "empanadas";
  if (/cazuel|shot/.test(key)) return "cazuelas";
  if (/bruschetta|canastita|buñuelo|bunuelo|chip|brioche|torta frita|tortilla|sorrentino|finger|bocado/.test(key)) return "finger_food";
  if (/picada|fiambre|queso|mortadela|jamon|salame/.test(key)) return "picada";
  if (/asado|vacio|costillar|chorizo|principal|ternera|carne/.test(key)) return "principal";
  if (/postre|pera|dulce|chocolate|torta/.test(key)) return "postre";
  if (/ensalada|papin|vegetal|tomate|zanahoria|papa/.test(key)) return "guarnicion";
  return "otro";
}

function getImportedMenuQuantitySuggestion(category, value = "") {
  const key = normalizeSearchKey(value);
  if (category === "finger_food") return "4-5 unidades por persona en total del grupo";
  if (category === "empanadas") {
    return /humita|vegetarian|verdura/.test(key)
      ? "Menos que carne/criolla; ajustar mix"
      : "2-3 unidades por persona en total del grupo";
  }
  if (category === "cazuelas") return "1-2 cazuelas por persona en total del grupo";
  if (category === "picada") return "Definir gramos por persona segun mix";
  if (category === "principal") return "1 porcion por persona";
  if (category === "postre") return "1 porcion por persona";
  return "";
}

function compactImportedMenuTree(items) {
  return items
    .map((item) => ({
      ...item,
      subItems: Array.isArray(item.subItems) ? item.subItems.filter((subItem) => subItem.name) : [],
    }))
    .filter((item) => item.name);
}

function extractImportedDrinkItems(lines) {
  const drinks = [];
  let active = false;
  for (const originalLine of lines) {
    const line = normalizeText(originalLine);
    if (/bebidas|welcome drink/i.test(line)) {
      active = true;
    }
    if (active && /^(bandejeo|principal|precio|aclaraciones)\b/i.test(line)) break;
    if (!active) continue;
    if (/agua/i.test(line)) {
      if (/con gas/i.test(line)) drinks.push("Agua con gas");
      if (/sin gas/i.test(line)) drinks.push("Agua sin gas");
      if (!/con gas|sin gas/i.test(line)) drinks.push("Agua mineral");
    }
    if (/gaseosa/i.test(line)) drinks.push("Gaseosas");
    if (/vino/i.test(line)) drinks.push("Vinos");
    if (/barra/i.test(line)) drinks.push("Barra");
  }
  return uniqueImportedItems(drinks);
}

function uniqueImportedItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeSearchKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseMoneyFromText(value) {
  const number = parseMoneyLikeNumber(value);
  return Number.isFinite(number) ? roundMoney(number) : 0;
}

function cleanFileTitle(fileName) {
  return normalizeText(String(fileName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " "))
    .toUpperCase();
}

function inferServiceTypeFromText(text) {
  const key = normalizeSearchKey(text);
  const services = ["coffee", "finger", "agape", "cocktail", "coctel", "cena", "almuerzo", "asado", "brunch"];
  return services.find((service) => key.includes(service)) || "";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeErpQuote(quote = {}) {
  const costTotal = roundMoney(Number(quote.costTotal || 0));
  const priceTotal = roundMoney(Number(quote.priceTotal || 0));
  const marginAmount = roundMoney(priceTotal - costTotal);

  return {
    id: quote.id || `presupuesto-${Date.now()}`,
    version: normalizeText(quote.version || ""),
    eventId: normalizeText(quote.eventId || ""),
    eventName: normalizeText(quote.eventName || ""),
    clientName: normalizeText(quote.clientName || ""),
    status: normalizeErpQuoteStatus(quote.status || "draft"),
    validUntil: normalizePanelDate(quote.validUntil || ""),
    guestCount: parseDecimalNumber(quote.guestCount || 0),
    costTotal,
    priceTotal,
    marginAmount,
    marginPercent: priceTotal > 0 ? roundMoney((marginAmount / priceTotal) * 100) : 0,
    markupPercent: costTotal > 0 ? roundMoney(((priceTotal - costTotal) / costTotal) * 100) : 0,
    targetMarginPercent: parseDecimalNumber(quote.targetMarginPercent || 35),
    discountAmount: roundMoney(Number(quote.discountAmount || 0)),
    discountPercent: roundMoney(Number(quote.discountPercent || 0)),
    taxRate: roundMoney(Number(quote.taxRate || 0)),
    taxAmount: roundMoney(Number(quote.taxAmount || 0)),
    manualPrice: roundMoney(Number(quote.manualPrice || 0)),
    tablewareCost: roundMoney(Number(quote.tablewareCost || 0)),
    logisticsCost: roundMoney(Number(quote.logisticsCost || 0)),
    staffCost: roundMoney(Number(quote.staffCost || 0)),
    extraCost: roundMoney(Number(quote.extraCost || 0)),
    subtotalBeforeDiscount: roundMoney(Number(quote.subtotalBeforeDiscount || priceTotal || 0)),
    recipes: Array.isArray(quote.recipes) ? quote.recipes.map(normalizeQuoteRecipeLine).filter((item) => item.recipeId || item.name) : [],
    notes: normalizeText(quote.notes || ""),
    createdAt: quote.createdAt || "",
    updatedAt: quote.updatedAt || "",
  };
}

function normalizeQuoteRecipeLine(item = {}) {
  const recipe = findRecipeById(item.recipeId);
  const quantity = normalizeRecipeProductionQuantity(item.quantity || 0, recipe?.yieldUnit || "unidad");
  return {
    recipeId: normalizeText(item.recipeId || ""),
    name: normalizeText(item.name || ""),
    quantity,
    unitCost: roundMoney(Number(item.unitCost || 0)),
    totalCost: roundMoney(Number(item.totalCost || 0)),
  };
}

function saveErpQuoteRecord(input) {
  const now = new Date().toISOString();
  const existingIndex = erpQuotes.findIndex((quote) => quote.id === input.id);
  const previous = existingIndex >= 0 ? erpQuotes[existingIndex] : {};
  const event = erpEvents.find((item) => item.id === input.eventId);

  if (!input.eventId || !event) {
    throw new Error("Seleccione el evento al que corresponde el presupuesto.");
  }

  const calculated = calculateErpQuote(input);
  const version = input.version || previous.version || getNextQuoteVersion(input.eventId);
  const quote = normalizeErpQuote({
    ...previous,
    ...input,
    ...calculated,
    eventName: input.eventName || event?.name || previous.eventName || "",
    clientName: input.clientName || event?.clientName || previous.clientName || "",
    guestCount: input.guestCount || event?.guestCount || previous.guestCount || "",
    version,
    id: input.id || previous.id || `presupuesto-${Date.now()}`,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });

  if (existingIndex >= 0) {
    erpQuotes[existingIndex] = quote;
  } else {
    erpQuotes.push(quote);
  }

  if (quote.eventId) {
    if (event) {
      event.updatedAt = now;
      if (quote.status === "accepted") {
        event.status = "confirmed";
      } else if (["sent", "negotiation"].includes(quote.status) && !["confirmed", "production", "done"].includes(event.status)) {
        event.status = "quoted";
      } else if (event.status === "lead") {
        event.status = "quoted";
      }
      saveErpEvents();
    }
  }

  saveErpQuotes();
  return quote;
}

function calculateErpQuote(input) {
  const recipes = Array.isArray(input.recipes) ? input.recipes : [];
  const recipeLines = recipes.map((line) => {
    const recipe = findRecipeById(line.recipeId);
    const quantity = normalizeRecipeProductionQuantity(line.quantity || 0, recipe?.yieldUnit || "unidad");
    const unitCost = Number(recipe ? calculateRecipeCost(recipe).costPerPortion : line.unitCost || 0);

    return normalizeQuoteRecipeLine({
      recipeId: line.recipeId,
      name: recipe?.name || line.name || "",
      quantity,
      unitCost,
      totalCost: unitCost * quantity,
    });
  });
  const recipeCost = recipeLines.reduce((sum, line) => sum + Number(line.totalCost || 0), 0);
  const staffCost = parseDecimalNumber(input.staffCost || 0);
  const logisticsCost = parseDecimalNumber(input.logisticsCost || 0);
  const tablewareCost = parseDecimalNumber(input.tablewareCost || 0);
  const extraCost = parseDecimalNumber(input.extraCost || 0);
  const costTotal = roundMoney(recipeCost + staffCost + logisticsCost + tablewareCost + extraCost);
  const targetMarginPercent = Math.min(95, Math.max(0, parseDecimalNumber(input.targetMarginPercent || getDefaultMarginForEvent(input.eventName || input.serviceType || ""))));
  const manualPrice = parseDecimalNumber(input.manualPrice || input.priceManual || 0);
  const suggestedPrice = targetMarginPercent >= 95 ? costTotal : costTotal / (1 - targetMarginPercent / 100);
  const subtotalBeforeDiscount = manualPrice > 0 ? manualPrice : roundMoney(suggestedPrice);
  const discountPercent = Math.max(0, parseDecimalNumber(input.discountPercent || 0));
  const discountAmountInput = Math.max(0, parseDecimalNumber(input.discountAmount || 0));
  const discountAmount = roundMoney(discountAmountInput || subtotalBeforeDiscount * (discountPercent / 100));
  const taxableSubtotal = Math.max(0, subtotalBeforeDiscount - discountAmount);
  const taxRate = Math.max(0, parseDecimalNumber(input.taxRate || 0));
  const taxAmount = roundMoney(taxableSubtotal * taxRate);
  const priceTotal = roundMoney(taxableSubtotal + taxAmount);

  return {
    recipes: recipeLines,
    costTotal,
    priceTotal,
    manualPrice,
    subtotalBeforeDiscount,
    discountPercent,
    discountAmount,
    taxRate,
    taxAmount,
    tablewareCost,
    targetMarginPercent,
  };
}

function getDefaultMarginForEvent(eventType) {
  const targets = BOT_CONFIG.marginTargets || costSettings.marginTargets || {};
  const key = normalizeSearchKey(eventType);
  const match = Object.entries(targets).find(([name]) => key.includes(normalizeSearchKey(name)));
  return parseDecimalNumber(match?.[1] || BOT_CONFIG.defaultMarginPercent || costSettings.defaultMarginPercent || 35);
}

function getNextQuoteVersion(eventId) {
  const count = erpQuotes.filter((quote) => quote.eventId === eventId).length;
  return `v${count + 1}`;
}

function buildProposalText(quote) {
  const lines = [
    `Propuesta ${quote.version || ""} - ${quote.eventName || "Evento"}`.trim(),
    "",
    `Cliente: ${quote.clientName || "A confirmar"}`,
    `Invitados: ${quote.guestCount || "A confirmar"}`,
    "",
    "Menu / servicio:",
    ...(quote.recipes || []).map((item) => `- ${item.name}: ${item.quantity}`),
    "",
    `Inversion total: ${formatMoneyText(quote.priceTotal)}`,
  ];

  if (quote.validUntil) {
    lines.push(`Validez de la propuesta: ${quote.validUntil}`);
  }

  if (quote.discountAmount) {
    lines.push(`Descuento aplicado: ${formatMoneyText(quote.discountAmount)}`);
  }

  if (quote.taxAmount) {
    lines.push(`Impuestos incluidos: ${formatMoneyText(quote.taxAmount)}`);
  }

  if (quote.notes) {
    lines.push("", "Notas:", quote.notes);
  }

  return `${lines.join("\n")}\n`;
}

function formatMoneyText(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function deleteErpQuoteRecord(id) {
  erpQuotes = erpQuotes.filter((quote) => quote.id !== id);
  saveErpQuotes();
}

function getBestQuoteForEvent(eventId) {
  if (!eventId) return null;
  return getErpQuoteList().find((quote) => quote.eventId === eventId && quote.status === "accepted")
    || getErpQuoteList().find((quote) => quote.eventId === eventId)
    || null;
}

function getErpPurchaseList() {
  return _fromCache("purch", CACHE_TTL, () => _computeErpPurchaseList());
}
function _computeErpPurchaseList() {
  return erpPurchases.map((purchase) => {
    const amounts = getPurchaseAmounts(purchase);
    const paidAmount = getPurchasePaidAmount(purchase, amounts.totalAmount);
    const pendingAmount = getPurchasePendingAmount(purchase, amounts.totalAmount);
    const paymentStatus = pendingAmount <= 0 ? "Pagado" : (paidAmount > 0 ? "Parcial" : (purchase.paymentStatus || "Pendiente"));
    const reimbursementPaidAmount = getPurchaseReimbursementPaidAmount(purchase, paidAmount);
    const reimbursementBalance = getPurchaseReimbursementBalance(purchase, paidAmount);
    const reimbursementPendingAmount = getPurchaseReimbursementPendingAmount(purchase, paidAmount);
    return {
      ...purchase,
      invoiceType: purchase.invoiceType || "",
      netAmount: amounts.netAmount,
      ivaRate: amounts.ivaRate,
      ivaAmount: amounts.ivaAmount,
      totalAmount: amounts.totalAmount,
      paidAmount,
      pendingAmount,
      paymentStatus,
      imputationType: normalizePurchaseImputationType(purchase, purchase.eventName || purchase.evento || ""),
      internalArea: purchase.internalArea || purchase.areaConsumo || "",
      imputationNotes: purchase.imputationNotes || purchase.detalleImputacion || "",
      imputationLabel: getPurchaseImputationLabel(purchase),
      reimbursementPaidAmount,
      reimbursementBalance,
      reimbursementPendingAmount,
      reimbursementCreditAmount: roundMoney(Math.max(0, -reimbursementBalance)),
      reimbursementStatus: reimbursementBalance < 0 ? "Saldo a favor" : (reimbursementPendingAmount <= 0 && reimbursementPaidAmount > 0 ? "Reintegrado" : (reimbursementPaidAmount > 0 ? "Parcial" : "Pendiente")),
      notes: purchase.notes || "",
    };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function getPurchaseAmounts(purchase = {}) {
  const purchaseItems = purchase.lineItems || purchase.items || [];
  const lineNetTotal = roundMoney(purchaseItems.reduce(
    (sum, item) => sum + Number(item.netTotal || (Number(item.quantity || 0) * Number(item.unitAmount || 0)) || item.total || 0),
    0
  ));
  const lineIvaTotal = roundMoney(purchaseItems.reduce((sum, item) => sum + Number(item.ivaAmount || 0), 0));
  const lineGrossTotal = roundMoney(purchaseItems.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  ));
  const rawIvaRate = Number(purchase.ivaRate || purchase.ivaPorcentaje || 0);
  const ivaRate = roundMoney(rawIvaRate > 1 ? rawIvaRate / 100 : rawIvaRate);
  const storedIvaAmount = roundMoney(Number(purchase.ivaAmount || purchase.ivaCalculado || 0));
  const storedTotal = roundMoney(Number(purchase.totalAmount || purchase.montoTotal || purchase.total || 0));
  const storedNet = roundMoney(Number(purchase.netAmount || purchase.neto || 0));
  const netAmount = roundMoney(storedNet || lineNetTotal || (ivaRate > 0 ? storedTotal / (1 + ivaRate) : storedTotal));
  const ivaAmount = roundMoney(storedIvaAmount || lineIvaTotal || netAmount * ivaRate);
  const grossAmount = roundMoney(netAmount + ivaAmount);
  const totalAmount = storedTotal || lineGrossTotal || grossAmount;

  return { netAmount, ivaRate, ivaAmount, totalAmount };
}

function getPurchasePaidAmount(purchase = {}, totalAmount = 0) {
  const explicitPaid = Number(purchase.paidAmount || purchase.montoPagado || 0);
  if (explicitPaid > 0) return roundMoney(Math.min(explicitPaid, totalAmount));
  if (normalizeSearchKey(purchase.paymentStatus || purchase.estadoPago) === "pagado") return roundMoney(totalAmount);
  return 0;
}

function normalizeEventTablewareItems(input = []) {
  if (!Array.isArray(input)) return [];
  const inventory = normalizeOperationalInventoryData(erpOperationalInventory).items;
  const providers = getProviderList();
  const validModes = new Set(["stock", "rental", "mixed", "client", "venue", "pending"]);
  const validRentalStatuses = new Set(["unassigned", "pending_quote", "quoted", "confirmed", "cancelled"]);
  const seen = new Set();
  return input.map((line, index) => {
    const inventoryItemId = normalizeText(line.inventoryItemId || "");
    if (!inventoryItemId || seen.has(inventoryItemId)) return null;
    seen.add(inventoryItemId);
    const inventoryItem = inventory.find((item) => item.id === inventoryItemId);
    const requiredQuantity = Math.max(0, parseDecimalNumber(line.requiredQuantity || 0));
    const sourcingMode = validModes.has(line.sourcingMode) ? line.sourcingMode : "pending";
    const externalSupply = sourcingMode === "client" || sourcingMode === "venue" || sourcingMode === "pending";
    const stockPlannedQuantity = externalSupply ? 0 : Math.max(0, parseDecimalNumber(line.stockPlannedQuantity || 0));
    const rentalQuantity = externalSupply ? 0 : Math.max(0, parseDecimalNumber(line.rentalQuantity || 0));
    const provider = providers.find((item) => item.id === normalizeText(line.rentalProviderId || ""));
    return {
      id: normalizeText(line.id || `event-tableware-${Date.now()}-${index}`),
      inventoryItemId,
      name: normalizeText(inventoryItem?.name || line.name || ""),
      categoryId: normalizeText(inventoryItem?.categoryId || line.categoryId || ""),
      functionalFamily: normalizeFunctionalFamily(inventoryItem?.functionalFamily || line.functionalFamily || ""),
      unit: normalizeText(inventoryItem?.unit || line.unit || "unidad"),
      requiredQuantity,
      stockAvailableSnapshot: Math.max(0, parseDecimalNumber(line.stockAvailableSnapshot ?? inventoryItem?.quantity ?? 0)),
      stockPlannedQuantity,
      rentalQuantity,
      sourcingMode,
      rentalProviderId: normalizeText(provider?.id || line.rentalProviderId || ""),
      rentalProviderName: normalizeText(provider?.name || line.rentalProviderName || ""),
      rentalStatus: validRentalStatuses.has(line.rentalStatus) ? line.rentalStatus : (rentalQuantity > 0 ? "unassigned" : ""),
      notes: normalizeText(line.notes || ""),
    };
  }).filter((line) => line && line.name);
}

function normalizeEventTablewareRental(input = {}) {
  const providers = getProviderList();
  const provider = providers.find((item) => item.id === normalizeText(input.defaultProviderId || ""));
  const validStatuses = new Set(["unassigned", "pending_quote", "quoted", "confirmed", "cancelled"]);
  return {
    defaultProviderId: normalizeText(provider?.id || input.defaultProviderId || ""),
    defaultProviderName: normalizeText(provider?.name || input.defaultProviderName || ""),
    deliveryAt: normalizeText(input.deliveryAt || ""),
    returnAt: normalizeText(input.returnAt || ""),
    notes: normalizeText(input.notes || ""),
    status: validStatuses.has(input.status) ? input.status : "pending_quote",
  };
}

function recordEventTablewareAudit(user, beforeEvent = {}, afterEvent = {}) {
  const beforeLines = new Map(normalizeEventTablewareItems(beforeEvent.tablewareItems || []).map((line) => [line.inventoryItemId, line]));
  const afterLines = new Map(normalizeEventTablewareItems(afterEvent.tablewareItems || []).map((line) => [line.inventoryItemId, line]));
  const ids = new Set([...beforeLines.keys(), ...afterLines.keys()]);
  ids.forEach((inventoryItemId) => {
    const before = beforeLines.get(inventoryItemId) || null;
    const after = afterLines.get(inventoryItemId) || null;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const action = !before ? "add" : !after ? "delete" : "update";
    recordAudit(user, action, "event_tableware", afterEvent.id, after?.name || before?.name || "Vajilla", before, after, {
      eventId: afterEvent.id,
      inventoryItemId,
    });
  });
  const beforeRental = normalizeEventTablewareRental(beforeEvent.tablewareRental || {});
  const afterRental = normalizeEventTablewareRental(afterEvent.tablewareRental || {});
  if (JSON.stringify(beforeRental) !== JSON.stringify(afterRental)) {
    recordAudit(user, "update", "event_tableware_rental", afterEvent.id, afterEvent.name, beforeRental, afterRental);
  }
}

function isMissingPurchaseEventName(value = "") {
  const key = normalizeSearchKey(value || "");
  return !key || ["sin evento", "compra general", "general", "sin definir"].includes(key);
}

function normalizePurchaseImputationType(input = {}, eventName = "") {
  const rawType = normalizeSearchKey(input.imputationType || input.tipoImputacion || "");
  if (["internal", "empresa", "consumo interno", "consumo_interno"].includes(rawType)) return "internal";
  if (["event", "evento"].includes(rawType)) return "event";
  if (!isMissingPurchaseEventName(eventName || input.eventName || input.evento || "")) return "event";
  return "unassigned";
}

function getPurchaseImputationLabel(purchase = {}) {
  const type = normalizePurchaseImputationType(purchase, purchase.eventName || purchase.evento || "");
  if (type === "internal") return `Empresa · ${purchase.internalArea || purchase.areaConsumo || "Sin area"}`;
  if (type === "event") return `Evento · ${purchase.eventName || purchase.evento || "Sin evento"}`;
  return "Pendiente de imputacion";
}

function getPurchasePendingAmount(purchase = {}, totalAmount = 0) {
  return roundMoney(Math.max(0, Number(totalAmount || 0) - getPurchasePaidAmount(purchase, totalAmount)));
}

function getPurchaseReimbursementPaidAmount(purchase = {}, paidByPayerAmount = 0) {
  const explicitPaid = Number(purchase.reimbursementPaidAmount || purchase.montoReintegrado || 0);
  return roundMoney(Math.max(0, explicitPaid));
}

function getPurchaseReimbursementBalance(purchase = {}, paidByPayerAmount = 0) {
  if (!isReimbursablePurchase(purchase)) return 0;
  return roundMoney(Number(paidByPayerAmount || 0) - getPurchaseReimbursementPaidAmount(purchase, paidByPayerAmount));
}

function getPurchaseReimbursementPendingAmount(purchase = {}, paidByPayerAmount = 0) {
  if (!isReimbursablePurchase(purchase)) return 0;
  return roundMoney(Math.max(0, getPurchaseReimbursementBalance(purchase, paidByPayerAmount)));
}

function isReimbursablePurchase(purchase = {}) {
  const payer = normalizeSearchKey(purchase.fundsSource || purchase.origenFondos || "");
  return isPersonalReimbursementPayer(payer);
}

function isPersonalReimbursementPayer(value = "") {
  const payer = normalizeSearchKey(value || "");
  return payer.includes("joaquin")
    || payer.includes("joaqu")
    || payer.includes("german")
    || payer.includes("germa")
    || payer.includes("gustavo")
    || payer.includes("eugenia");
}

function rememberErpPurchase(purchase) {
  const lineTotal = (purchase.lineItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const amounts = getPurchaseAmounts({ ...purchase, lineItems: purchase.lineItems || [] });
  const existingIndex = erpPurchases.findIndex((item) => item.id === purchase.id);
  const previous = existingIndex >= 0 ? erpPurchases[existingIndex] : {};
  const purchaseStatusKey = normalizeSearchKey(purchase.estadoPago || purchase.paymentStatus || "");
  const preservedPaidAmount = purchaseStatusKey === "pagado"
    ? amounts.totalAmount
    : purchaseStatusKey === "pendiente"
      ? 0
      : purchase.paidAmount !== undefined
        ? Number(purchase.paidAmount || 0)
        : getPurchasePaidAmount(previous, amounts.totalAmount);
  const paidAmount = roundMoney(Math.min(preservedPaidAmount, amounts.totalAmount));
  const pendingAmount = roundMoney(Math.max(0, amounts.totalAmount - paidAmount));
  const reimbursementPaidAmount = purchase.reimbursementPaidAmount !== undefined
    ? roundMoney(Number(purchase.reimbursementPaidAmount || 0))
    : getPurchaseReimbursementPaidAmount(previous, paidAmount);
  const reimbursementBalance = isReimbursablePurchase(purchase)
    ? roundMoney(paidAmount - reimbursementPaidAmount)
    : 0;
  const record = {
    id: purchase.id || `compra-${Date.now()}`,
    date: purchase.fecha || getDateOnly(new Date()),
    provider: purchase.proveedor || "",
    eventName: purchase.evento || "",
    eventId: purchase.eventId || "",
    imputationType: normalizePurchaseImputationType(purchase, purchase.evento || purchase.eventName || ""),
    internalArea: purchase.internalArea || "",
    imputationNotes: purchase.imputationNotes || "",
    imputationLabel: getPurchaseImputationLabel(purchase),
    description: purchase.descripcion || "",
    source: purchase.source || previous.source || "panel_compras",
    sourceReceiptId: purchase.sourceReceiptId || previous.sourceReceiptId || "",
    sourceOrderId: purchase.sourceOrderId || previous.sourceOrderId || "",
    paymentStatus: pendingAmount <= 0 ? "Pagado" : (paidAmount > 0 ? "Parcial" : (purchase.estadoPago || "Pendiente")),
    paymentMethod: purchase.medioPago || "",
    fundsSource: purchase.origenFondos || "",
    invoiceType: purchase.comprobante || "",
    netAmount: amounts.netAmount || roundMoney(Number(purchase.neto || lineTotal || 0)),
    ivaRate: amounts.ivaRate,
    ivaAmount: amounts.ivaAmount,
    totalAmount: amounts.totalAmount,
    paidAmount,
    pendingAmount,
    reimbursementPaidAmount,
    reimbursementBalance,
    reimbursementPendingAmount: roundMoney(Math.max(0, reimbursementBalance)),
    reimbursementCreditAmount: roundMoney(Math.max(0, -reimbursementBalance)),
    reimbursementLog: Array.isArray(previous.reimbursementLog) ? previous.reimbursementLog : [],
    notes: purchase.observaciones || "",
    lineItems: purchase.lineItems || [],
    paymentLog: Array.isArray(previous.paymentLog) ? previous.paymentLog : [],
    createdAt: previous.createdAt || purchase.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    erpPurchases[existingIndex] = record;
  } else {
    erpPurchases.push(record);
  }

  saveErpPurchases();
  return record;
}

async function deletePurchaseRecord(id, options = {}) {
  const cleanId = normalizeText(id || "");
  const purchase = erpPurchases.find((item) => item.id === cleanId);

  if (!purchase) {
    throw new Error("No encontre esa compra para eliminar.");
  }

  erpPurchases = erpPurchases.filter((item) => item.id !== cleanId);
  saveErpPurchases();

  if (options.syncSheets) {
    await syncPurchaseToSheets("delete", { id: cleanId, ...purchase });
  }

  return { id: cleanId, deleted: true };
}

function normalizePaymentReceipt(receipt = null) {
  if (!receipt || typeof receipt !== "object" || !receipt.dataUrl) return null;
  return {
    name: normalizeText(receipt.name || "comprobante"),
    type: normalizeText(receipt.type || "application/octet-stream"),
    size: Number(receipt.size || 0),
    dataUrl: String(receipt.dataUrl || ""),
    uploadedAt: normalizeText(receipt.uploadedAt || new Date().toISOString()),
  };
}

async function applyProviderPayment(input = {}) {
  const provider = normalizeText(input.provider || "");
  const mode = normalizeText(input.mode || "partial");
  const paymentMethod = normalizeText(input.paymentMethod || "");
  const fundsSource = normalizeText(input.fundsSource || "");
  const notes = normalizeText(input.notes || "");
  const receipt = normalizePaymentReceipt(input.receipt);
  const paymentDate = normalizePanelDate(input.date || getDateOnly(new Date())) || getDateOnly(new Date());

  if (!provider) {
    throw new Error("Seleccione el proveedor al que corresponde el pago.");
  }

  const unresolvedReceipts = getProviderUnresolvedReceiptDifferences(provider);
  if (unresolvedReceipts.length) {
    throw new Error(`Hay ${unresolvedReceipts.length} recepcion(es) con diferencias sin resolver para este proveedor. Resuelva o acepte las diferencias antes de pagar.`);
  }

  const pendingPurchases = getErpPurchaseList()
    .filter((purchase) => normalizeSearchKey(purchase.provider) === normalizeSearchKey(provider))
    .filter((purchase) => Number(purchase.pendingAmount || 0) > 0)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  if (!pendingPurchases.length) {
    throw new Error("Ese proveedor no tiene compras pendientes.");
  }

  const debtTotal = roundMoney(pendingPurchases.reduce((sum, purchase) => sum + Number(purchase.pendingAmount || 0), 0));
  let remaining = mode === "total" ? debtTotal : roundMoney(parseOptionalNumber(input.amount));

  if (remaining <= 0) {
    throw new Error("Ingrese un monto de pago mayor a cero.");
  }

  const applied = [];

  for (const purchase of pendingPurchases) {
    if (remaining <= 0) break;
    const amount = Math.min(Number(purchase.pendingAmount || 0), remaining);
    const index = erpPurchases.findIndex((item) => item.id === purchase.id);
    if (index < 0 || amount <= 0) continue;

    const current = erpPurchases[index];
    const currentAmounts = getPurchaseAmounts(current);
    const nextPaid = roundMoney(getPurchasePaidAmount(current, currentAmounts.totalAmount) + amount);
    const nextPending = roundMoney(Math.max(0, currentAmounts.totalAmount - nextPaid));
    const paymentLog = Array.isArray(current.paymentLog) ? current.paymentLog : [];

    erpPurchases[index] = {
      ...current,
      paidAmount: nextPaid,
      pendingAmount: nextPending,
      paymentStatus: nextPending <= 0 ? "Pagado" : "Parcial",
      paymentMethod: paymentMethod || current.paymentMethod || "",
      fundsSource: fundsSource || current.fundsSource || "",
      notes: [current.notes, notes ? `Pago proveedor ${paymentDate}: ${formatMoneyText(amount)}${notes ? ` - ${notes}` : ""}` : ""].filter(Boolean).join("\n"),
      paymentLog: [
        ...paymentLog,
        {
          id: `pago-${Date.now()}-${applied.length + 1}`,
          date: paymentDate,
          amount: roundMoney(amount),
          paymentMethod,
          fundsSource,
          notes,
          receipt,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    applied.push({
      id: purchase.id,
      date: purchase.date,
      description: purchase.description,
      appliedAmount: roundMoney(amount),
      pendingAmount: nextPending,
      status: erpPurchases[index].paymentStatus,
    });
    remaining = roundMoney(remaining - amount);
  }

  saveErpPurchases();

  if (input.syncSheets !== false && PURCHASE_BIDIRECTIONAL_SYNC_ENABLED) {
    for (const item of applied) {
      const purchase = erpPurchases.find((entry) => entry.id === item.id);
      if (purchase) await syncPurchaseToSheets("upsert", purchase);
    }
  }

  return {
    provider,
    requestedAmount: mode === "total" ? debtTotal : roundMoney(parseOptionalNumber(input.amount)),
    appliedAmount: roundMoney(applied.reduce((sum, item) => sum + item.appliedAmount, 0)),
    remainingCredit: roundMoney(Math.max(0, remaining)),
    debtBefore: debtTotal,
    debtAfter: roundMoney(Math.max(0, debtTotal - applied.reduce((sum, item) => sum + item.appliedAmount, 0))),
    purchases: applied,
  };
}

function getPayerReimbursementGroups(purchases = getErpPurchaseList()) {
  const groups = {};

  purchases
    .filter((purchase) => isReimbursablePurchase(purchase))
    .forEach((purchase) => {
      const paidByPayer = Number(purchase.paidAmount || 0);
      if (paidByPayer <= 0) return;
      const payer = normalizeText(purchase.fundsSource || "Sin definir");
      const reimbursed = Number(purchase.reimbursementPaidAmount || 0);
      const balance = purchase.reimbursementBalance !== undefined
        ? Number(purchase.reimbursementBalance || 0)
        : roundMoney(paidByPayer - reimbursed);
      const pending = Math.max(0, balance);
      const credit = Math.max(0, -balance);
      if (!groups[payer]) {
        groups[payer] = {
          payer,
          totalPaid: 0,
          reimbursedAmount: 0,
          balanceAmount: 0,
          pendingAmount: 0,
          creditAmount: 0,
          purchaseCount: 0,
          purchases: [],
        };
      }
      groups[payer].totalPaid += paidByPayer;
      groups[payer].reimbursedAmount += reimbursed;
      groups[payer].balanceAmount += balance;
      groups[payer].pendingAmount += pending;
      groups[payer].creditAmount += credit;
      groups[payer].purchaseCount += 1;
      groups[payer].purchases.push(purchase);
    });

  return Object.values(groups)
    .map((group) => ({
      ...group,
      totalPaid: roundMoney(group.totalPaid),
      reimbursedAmount: roundMoney(group.reimbursedAmount),
      balanceAmount: roundMoney(group.balanceAmount),
      pendingAmount: roundMoney(group.pendingAmount),
      creditAmount: roundMoney(group.creditAmount),
    }))
    .sort((a, b) => Math.abs(b.balanceAmount) - Math.abs(a.balanceAmount));
}

function applyPayerReimbursement(input = {}) {
  const payer = normalizeText(input.payer || "");
  const mode = normalizeText(input.mode || "partial");
  const paymentMethod = normalizeText(input.paymentMethod || "");
  const fundsSource = normalizeText(input.fundsSource || "");
  const notes = normalizeText(input.notes || "");
  const receipt = normalizePaymentReceipt(input.receipt);
  const paymentDate = normalizePanelDate(input.date || getDateOnly(new Date())) || getDateOnly(new Date());

  if (!payer) {
    throw new Error("Seleccione a quien se le reintegra la plata.");
  }

  const payerPurchases = getErpPurchaseList()
    .filter((purchase) => isReimbursablePurchase(purchase))
    .filter((purchase) => normalizeSearchKey(purchase.fundsSource || "").includes(normalizeSearchKey(payer).slice(0, 5)))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  if (!payerPurchases.length) {
    throw new Error("No hay compras pagadas por esa persona.");
  }

  const pendingPurchases = payerPurchases.filter((purchase) => Number(purchase.reimbursementPendingAmount || 0) > 0);
  const debtTotal = roundMoney(pendingPurchases.reduce((sum, purchase) => sum + Number(purchase.reimbursementPendingAmount || 0), 0));
  let remaining = mode === "total" ? debtTotal : roundMoney(parseOptionalNumber(input.amount));

  if (remaining <= 0) {
    throw new Error("Ingrese un monto de reintegro mayor a cero.");
  }

  const applied = [];

  for (const purchase of pendingPurchases) {
    if (remaining <= 0) break;
    const amount = Math.min(Number(purchase.reimbursementPendingAmount || 0), remaining);
    const index = erpPurchases.findIndex((item) => item.id === purchase.id);
    if (index < 0 || amount <= 0) continue;

    const current = erpPurchases[index];
    const currentAmounts = getPurchaseAmounts(current);
    const paidByPayer = getPurchasePaidAmount(current, currentAmounts.totalAmount);
    const previousReimbursed = getPurchaseReimbursementPaidAmount(current, paidByPayer);
    const nextReimbursed = roundMoney(previousReimbursed + amount);
    const nextBalance = roundMoney(paidByPayer - nextReimbursed);
    const reimbursementLog = Array.isArray(current.reimbursementLog) ? current.reimbursementLog : [];

    erpPurchases[index] = {
      ...current,
      reimbursementPaidAmount: nextReimbursed,
      reimbursementBalance: nextBalance,
      reimbursementPendingAmount: roundMoney(Math.max(0, nextBalance)),
      reimbursementCreditAmount: roundMoney(Math.max(0, -nextBalance)),
      reimbursementLog: [
        ...reimbursementLog,
        {
          id: `reintegro-${Date.now()}-${applied.length + 1}`,
          date: paymentDate,
          amount: roundMoney(amount),
          paymentMethod,
          fundsSource,
          notes,
          receipt,
        },
      ],
      notes: [current.notes, `Reintegro ${payer} ${paymentDate}: ${formatMoneyText(amount)}${notes ? ` - ${notes}` : ""}`].filter(Boolean).join("\n"),
      updatedAt: new Date().toISOString(),
    };

    applied.push({
      id: purchase.id,
      date: purchase.date,
      provider: purchase.provider,
      description: purchase.description,
      appliedAmount: roundMoney(amount),
      pendingAmount: roundMoney(Math.max(0, nextBalance)),
      balanceAmount: nextBalance,
      creditAmount: roundMoney(Math.max(0, -nextBalance)),
    });
    remaining = roundMoney(remaining - amount);
  }

  if (remaining > 0) {
    const target = [...payerPurchases].reverse()[0];
    const index = erpPurchases.findIndex((item) => item.id === target.id);
    if (index >= 0) {
      const current = erpPurchases[index];
      const currentAmounts = getPurchaseAmounts(current);
      const paidByPayer = getPurchasePaidAmount(current, currentAmounts.totalAmount);
      const previousReimbursed = getPurchaseReimbursementPaidAmount(current, paidByPayer);
      const nextReimbursed = roundMoney(previousReimbursed + remaining);
      const nextBalance = roundMoney(paidByPayer - nextReimbursed);
      const reimbursementLog = Array.isArray(current.reimbursementLog) ? current.reimbursementLog : [];
      const amount = remaining;
      erpPurchases[index] = {
        ...current,
        reimbursementPaidAmount: nextReimbursed,
        reimbursementBalance: nextBalance,
        reimbursementPendingAmount: roundMoney(Math.max(0, nextBalance)),
        reimbursementCreditAmount: roundMoney(Math.max(0, -nextBalance)),
        reimbursementLog: [
          ...reimbursementLog,
          {
            id: `reintegro-${Date.now()}-${applied.length + 1}`,
            date: paymentDate,
            amount: roundMoney(amount),
            paymentMethod,
            fundsSource,
            notes,
            receipt,
          },
        ],
        notes: [current.notes, `Reintegro ${payer} ${paymentDate}: ${formatMoneyText(amount)}${notes ? ` - ${notes}` : ""}`].filter(Boolean).join("\n"),
        updatedAt: new Date().toISOString(),
      };
      applied.push({
        id: target.id,
        date: target.date,
        provider: target.provider,
        description: target.description,
        appliedAmount: roundMoney(amount),
        pendingAmount: roundMoney(Math.max(0, nextBalance)),
        balanceAmount: nextBalance,
        creditAmount: roundMoney(Math.max(0, -nextBalance)),
      });
      remaining = 0;
    }
  }

  saveErpPurchases();

  const appliedAmount = roundMoney(applied.reduce((sum, item) => sum + item.appliedAmount, 0));
  const balanceAfter = roundMoney(debtTotal - appliedAmount);
  return {
    payer,
    requestedAmount: mode === "total" ? debtTotal : roundMoney(parseOptionalNumber(input.amount)),
    appliedAmount,
    remainingCredit: roundMoney(Math.max(0, remaining)),
    debtBefore: debtTotal,
    debtAfter: roundMoney(Math.max(0, balanceAfter)),
    balanceAfter,
    creditAmount: roundMoney(Math.max(0, -balanceAfter)),
    purchases: applied,
  };
}

async function importAccountantPaymentsFromSheets() {
  if (!ACCOUNTANT_SHEETS_SYNC_ENABLED) {
    throw new Error("La sincronizacion con la planilla del contador esta desactivada. Los pagos se guardan en la base del ERP.");
  }

  if (!ACCOUNTANT_PAYMENTS_WEBHOOK_URL) {
    throw new Error("Falta configurar accountantPaymentsWebhookUrl en config-bot.json.");
  }

  const exportResult = await callAccountantPaymentsWebhook({
    action: "export",
  });
  const rows = exportResult.payments || exportResult.rows || [];

  if (!Array.isArray(rows)) {
    throw new Error("La planilla del contador no devolvio una lista de pagos pendiente.");
  }

  let imported = 0;
  let skipped = 0;
  const importedRows = [];
  const errorRows = [];
  const errors = [];

  for (const row of rows) {
    const rowNumber = row.rowNumber || row.row || "";
    const status = normalizeText(row.status || row.estado || "");

    if (status && !["pendiente", "pendiente de importar", "nuevo"].includes(normalizeSearchKey(status))) {
      skipped += 1;
      continue;
    }

    try {
      const payment = normalizeAccountantPaymentRow(row);
      const result = await applyProviderPayment({
        provider: payment.provider,
        mode: payment.mode,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        fundsSource: payment.fundsSource,
        notes: payment.notes,
        date: payment.date,
        syncSheets: false,
      });

      imported += 1;
      importedRows.push({
        rowNumber,
        importedAt: new Date().toISOString(),
        appliedAmount: result.appliedAmount,
        provider: payment.provider,
        message: `Importado: ${formatMoneyText(result.appliedAmount)}. Saldo proveedor: ${formatMoneyText(result.debtAfter)}.`,
      });
    } catch (error) {
      skipped += 1;
      const message = error.message || String(error);
      if (errors.length < 8) errors.push(message);
      if (rowNumber) {
        errorRows.push({
          rowNumber,
          message,
        });
      }
    }
  }

  if (importedRows.length || errorRows.length) {
    await callAccountantPaymentsWebhook({
      action: "mark",
      importedRows,
      errorRows,
    });
  }

  return {
    imported,
    skipped,
    errors,
    importedRows,
    errorRows,
  };
}

async function syncAccountantDebtsToSheets() {
  if (!ACCOUNTANT_SHEETS_SYNC_ENABLED) {
    throw new Error("La sincronizacion con la planilla del contador esta desactivada. Las deudas se consultan desde Finanzas en la base del ERP.");
  }

  if (!ACCOUNTANT_PAYMENTS_WEBHOOK_URL) {
    throw new Error("Falta configurar accountantPaymentsWebhookUrl en config-bot.json.");
  }

  const payload = buildAccountantDebtPayload();
  const result = await callAccountantPaymentsWebhook({
    action: "syncdebts",
    ...payload,
  });

  return {
    providers: payload.providers.length,
    purchases: payload.purchases.length,
    updatedAt: payload.updatedAt,
    message: result.message || "Planilla del contador actualizada.",
  };
}

function buildAccountantDebtPayload() {
  const pendingPurchases = getErpPurchaseList()
    .filter((purchase) => Number(purchase.pendingAmount || 0) > 0)
    .sort((a, b) =>
      normalizeSearchKey(a.provider).localeCompare(normalizeSearchKey(b.provider)) ||
      String(a.date || "").localeCompare(String(b.date || ""))
    );

  const grouped = {};
  pendingPurchases.forEach((purchase) => {
    const provider = purchase.provider || "Sin proveedor";
    const key = normalizeSearchKey(provider);
    if (!grouped[key]) {
      grouped[key] = {
        provider,
        purchaseCount: 0,
        totalDebt: 0,
        oldestDate: purchase.date || "",
      };
    }
    grouped[key].purchaseCount += 1;
    grouped[key].totalDebt = roundMoney(grouped[key].totalDebt + Number(purchase.pendingAmount || 0));
    if (purchase.date && (!grouped[key].oldestDate || String(purchase.date) < String(grouped[key].oldestDate))) {
      grouped[key].oldestDate = purchase.date;
    }
  });
  const providersByName = new Map(
    getProviderList().map((provider) => [normalizeSearchKey(provider.name), provider])
  );

  return {
    updatedAt: new Date().toISOString(),
    providers: Object.values(grouped)
      .sort((a, b) => b.totalDebt - a.totalDebt)
      .map((item) => {
        const providerRecord = providersByName.get(normalizeSearchKey(item.provider)) || {};
        return {
          provider: item.provider,
          alias: providerRecord.alias || "",
          bankName: providerRecord.bankName || "",
          accountHolder: providerRecord.bankAccountHolder || providerRecord.legalName || providerRecord.name || "",
          cbu: providerRecord.cbu || "",
          bankAccountType: providerRecord.bankAccountType || "",
          bankAccountNumber: providerRecord.bankAccountNumber || "",
          purchaseCount: item.purchaseCount,
          totalDebt: roundMoney(item.totalDebt),
          oldestDate: item.oldestDate,
        };
      }),
    purchases: pendingPurchases.map((purchase) => ({
      id: purchase.id,
      date: purchase.date || "",
      provider: purchase.provider || "",
      description: purchase.description || "",
      eventName: purchase.eventName || "",
      invoiceType: purchase.invoiceType || "",
      paymentStatus: purchase.paymentStatus || "",
      totalAmount: roundMoney(purchase.totalAmount || 0),
      paidAmount: roundMoney(purchase.paidAmount || 0),
      pendingAmount: roundMoney(purchase.pendingAmount || 0),
      notes: purchase.notes || "",
    })),
  };
}

function normalizeAccountantPaymentRow(row = {}) {
  const provider = normalizeText(row.provider || row.proveedor || "");
  const paymentType = normalizeSearchKey(row.paymentType || row.tipoPago || row.tipo || "");
  const mode = paymentType.includes("total") ? "total" : "partial";
  const amount = roundMoney(parseOptionalNumber(row.amount || row.monto || row.montoPagado || row["Monto pagado"]));
  const date = normalizePanelDate(row.date || row.fecha || row.fechaPago || getDateOnly(new Date())) || getDateOnly(new Date());

  if (!provider) {
    throw new Error("Hay una fila de pago sin proveedor.");
  }

  if (mode !== "total" && amount <= 0) {
    throw new Error(`El pago de ${provider} no tiene un monto valido.`);
  }

  return {
    date,
    provider,
    mode,
    amount,
    paymentMethod: normalizeText(row.paymentMethod || row.medioPago || row.medio || ""),
    fundsSource: normalizeText(row.fundsSource || row.origenFondos || row.cuenta || row.origen || ""),
    notes: normalizeText(row.notes || row.nota || row.observaciones || ""),
  };
}

async function callAccountantPaymentsWebhook(payload) {
  const body = {
    ...payload,
    token: ACCOUNTANT_PAYMENTS_TOKEN,
  };

  const response = await fetch(ACCOUNTANT_PAYMENTS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let result = {};

  try {
    result = text ? JSON.parse(text) : {};
  } catch (error) {
    result = { raw: text };
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `La planilla del contador respondio con error: ${text}`);
  }

  return result;
}

async function importPurchasesFromSheets() {
  if (!PURCHASE_BIDIRECTIONAL_SYNC_ENABLED) {
    throw new Error("Actualice Apps Script y active purchaseBidirectionalSyncEnabled para importar compras historicas desde Sheets.");
  }

  const result = await syncPurchaseToSheets("export", { id: "dashboard-import-request" });
  const rows = result.response?.purchases || result.response?.rows || [];

  if (!Array.isArray(rows)) {
    const message = result.response?.message || result.response?.raw || JSON.stringify(result.response || {});
    throw new Error(`Sheets no devolvio una lista de compras. La implementacion publicada parece seguir usando el Apps Script anterior. Respuesta: ${message}`);
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const purchase = buildPurchaseRecord({
        ...row,
        id: getImportedPurchaseId(row),
        date: row.date || row.fecha,
        provider: row.provider || row.proveedor,
        eventName: row.eventName || row.evento,
        invoiceType: row.invoiceType || row.comprobante,
        paymentStatus: row.paymentStatus || row.estadoPago,
        paymentMethod: row.paymentMethod || row.medioPago,
        fundsSource: row.fundsSource || row.origenFondos,
        notes: row.notes || row.observaciones,
        items: row.items || row.lineItems,
      }, { requireEvent: false, defaultEvent: "Sin evento" });
      rememberErpPurchase(purchase);
      rememberPurchasePrices(purchase);
      imported += 1;
    } catch (error) {
      skipped += 1;
      if (errors.length < 5) {
        errors.push(error.message);
      }
    }
  }

  return { imported, skipped, errors };
}

function getImportedPurchaseId(row = {}) {
  const existingId = normalizeText(row.id || row.purchaseId || "");
  if (existingId) return existingId;

  const rowNumber = normalizeText(row.rowNumber || row.row || "");
  if (rowNumber) return `sheets-row-${rowNumber}`;

  return [
    "sheets",
    normalizeText(row.date || row.fecha || ""),
    normalizeText(row.provider || row.proveedor || ""),
    normalizeText(row.description || row.descripcion || ""),
    normalizeText(row.eventName || row.evento || ""),
    normalizeText(row.totalAmount || row.total || ""),
  ].join("-");
}

function validatePurchaseSyncToken(body = {}) {
  if (!PURCHASE_SYNC_TOKEN) return;

  const token = normalizeText(body.token || body.syncToken || "");
  if (token !== PURCHASE_SYNC_TOKEN) {
    throw new Error("Token de sincronizacion de compras invalido.");
  }
}

function applyPurchaseSync(input = {}) {
  const action = normalizeText(input.action || input.type || "upsert").toLowerCase();
  const purchaseInput = input.purchase || input;

  if (action === "delete") {
    const id = normalizeText(purchaseInput.id || input.id || "");
    const exists = erpPurchases.some((purchase) => purchase.id === id);
    erpPurchases = erpPurchases.filter((purchase) => purchase.id !== id);
    saveErpPurchases();
    return { action, id, deleted: exists };
  }

  const purchase = buildPurchaseRecord({
    ...purchaseInput,
    id: purchaseInput.id || input.id,
    date: purchaseInput.date || purchaseInput.fecha,
    provider: purchaseInput.provider || purchaseInput.proveedor,
    eventName: purchaseInput.eventName || purchaseInput.evento,
    invoiceType: purchaseInput.invoiceType || purchaseInput.comprobante,
    paymentStatus: purchaseInput.paymentStatus || purchaseInput.estadoPago,
    paymentMethod: purchaseInput.paymentMethod || purchaseInput.medioPago,
    fundsSource: purchaseInput.fundsSource || purchaseInput.origenFondos,
    notes: purchaseInput.notes || purchaseInput.observaciones,
    items: purchaseInput.items || purchaseInput.lineItems,
  }, { requireEvent: false, defaultEvent: "Sin evento" });
  const saved = rememberErpPurchase(purchase);
  rememberPurchasePrices(purchase);
  return { action: "upsert", purchase: saved };
}

function normalizeErpEventStatus(status) {
  const value = normalizeSearchKey(status || "");
  if (["cancelado", "cancelada", "cancelled", "canceled"].includes(value)) return "cancelled";
  const allowed = new Set(["lead", "quoted", "confirmed", "production", "done", "lost", "cancelled"]);
  return allowed.has(value) ? value : "lead";
}

function normalizeErpQuoteStatus(status) {
  const value = normalizeText(status || "").toLowerCase();
  const allowed = new Set(["draft", "sent", "negotiation", "accepted", "rejected"]);
  return allowed.has(value) ? value : "draft";
}

function normalizePanelDate(value) {
  const raw = normalizeText(value || "");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = parseDateDDMMYYYY(raw);
  return parsed ? getDateOnly(parsed) : raw;
}

function getDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getChatDashboardList() {
  const records = { ...chatRecords };

  for (const [phone, session] of Object.entries(sessions)) {
    records[phone] = buildChatRecord(phone, {
      ...(records[phone] || {}),
      session,
    });
  }

  for (const [id, pending] of Object.entries(pendingReplies)) {
    records[pending.customerPhone] = buildChatRecord(pending.customerPhone, {
      ...(records[pending.customerPhone] || {}),
      approvalId: id,
      status: "pending_approval",
      lastMessage: pending.customerMessage || "",
      displayPhone: pending.customerDisplayPhone,
      contactName: pending.customerContactName,
      createdAt: pending.createdAt,
      updatedAt: pending.createdAt,
      session: pending.nextSession,
    });
  }

  return Object.values(records).sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
}

function getDashboardMetrics() {
  const chats = getChatDashboardList();

  return {
    total: chats.length,
    pendingApproval: chats.filter((chat) => chat.status === "pending_approval").length,
    inProgress: chats.filter((chat) => chat.status === "in_progress").length,
    missingInfo: chats.filter((chat) => chat.status === "missing_info").length,
    readyToQuote: chats.filter((chat) => chat.status === "ready_to_quote").length,
    proposalSent: chats.filter((chat) => chat.status === "proposal_sent").length,
    followUp: chats.filter((chat) => chat.status === "follow_up").length,
    confirmed: chats.filter((chat) => chat.status === "confirmed").length,
    referred: chats.filter((chat) => chat.status === "referred").length,
    overdue: chats.filter((chat) => chat.isOverdue).length,
    dueToday: chats.filter((chat) => chat.isDueToday).length,
    unassigned: chats.filter((chat) => !chat.assignedTo).length,
  };
}

function buildChatRecord(phone, overrides = {}) {
  const session = overrides.session || sessions[phone] || createEmptySession();
  const data = session.data || {};
  const knownCustomer = findKnownCustomer(phone, {
    displayPhone: overrides.displayPhone || data.externalPhone,
    contactName: overrides.contactName || data.contactName,
  });
  const status = normalizeStatus(
    overrides.status || chatRecords[phone]?.status || getSessionStatus(session)
  );
  const displayPhone = firstReadablePhone([
    overrides.displayPhone,
    data.externalPhone,
    knownCustomer?.displayPhone,
    chatRecords[phone]?.displayPhone,
    getReadablePhoneFallback(phone),
  ]);
  const followUpDate = data.followUpDate || "";
  const urgency = getFollowUpUrgency(followUpDate);
  const history = Array.isArray(overrides.history)
    ? overrides.history
    : Array.isArray(chatRecords[phone]?.history)
      ? chatRecords[phone].history
      : [];

  return {
    phone,
    status,
    statusLabel: getStatusLabel(status),
    channel: overrides.channel || chatRecords[phone]?.channel || data.channel || "WhatsApp empresa",
    displayPhone,
    contactName: overrides.contactName || data.contactName || knownCustomer?.contactName || chatRecords[phone]?.contactName || "",
    knownCustomer: knownCustomer || null,
    approvalId: overrides.approvalId || "",
    lastMessage: overrides.lastMessage || chatRecords[phone]?.lastMessage || "",
    contactReason: data.contactReason || "",
    step: session.step,
    stepLabel: getStepLabel(session.step),
    progress: getProgress(session.step),
    suggestedQuestions: getSuggestedQuestions(data, status),
    data: {
      ...data,
      fullName: data.fullName || knownCustomer?.fullName || "",
      externalPhone: data.externalPhone || knownCustomer?.displayPhone || "",
      contactName: data.contactName || knownCustomer?.contactName || "",
    },
    assignedTo: data.assignedTo || "",
    nextAction: data.nextAction || "",
    followUpDate,
    isOverdue: urgency === "overdue",
    isDueToday: urgency === "today",
    history,
    createdAt: overrides.createdAt || chatRecords[phone]?.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

function getSuggestedQuestions(data = {}, status = "") {
  if (status === "pending_approval" || status === "ignored") {
    return [];
  }

  const suggestions = [];
  const eventType = (data.eventType || "").toLowerCase();
  const serviceType = (data.serviceType || "").toLowerCase();
  const text = `${eventType} ${serviceType} ${data.eventMoments || ""}`.toLowerCase();

  addIfMissing(suggestions, data.eventMoments, "Que momentos del evento desea cubrir: bienvenida, recepcion, coffee, comida, postre, barra o trasnoche?");
  addIfMissing(suggestions, data.drinkType || data.includesDrinks, "Desea incluir bebidas? Que tipo: agua/gaseosas, vinos, mocktails, barra o hidratacion continua?");
  addIfMissing(suggestions, data.serviceMode || data.operationalNeeds, "Como imagina la dinamica del servicio: bandejeo, estaciones, sentado a la mesa, autoservicio o mixto?");
  addIfMissing(suggestions, data.logistics || data.kitchenAvailable, "El lugar cuenta con cocina o espacio de apoyo, agua, electricidad y lugar para montaje?");
  addIfMissing(suggestions, data.tableware, "Necesita vajilla, cristaleria, manteleria o descartables?");
  addIfMissing(suggestions, data.staff, "Necesita personal de sala, mozos, barra o estaciones asistidas?");

  if (text.includes("congreso") || text.includes("corporativo") || text.includes("empresa")) {
    addIfMissing(suggestions, data.schedule, "Cuantas jornadas y pausas tendra el evento? En que horarios?");
    addIfMissing(suggestions, data.foodFormat, "Necesita coffee break, almuerzo rapido, hidratacion continua o coctel de cierre?");
  }

  if (text.includes("boda") || text.includes("casamiento") || text.includes("pre boda")) {
    addIfMissing(suggestions, data.foodFormat, "Desean recepcion, comida principal, postre, barra y trasnoche?");
    addIfMissing(suggestions, data.selectedMenu, "Prefieren menu cocktail, sentado a la mesa, estaciones o experiencia mixta?");
  }

  if (text.includes("coffee") || text.includes("brunch")) {
    addIfMissing(suggestions, data.foodFormat, "El coffee/brunch debe incluir infusiones, jugos, dulce, salado y opciones saludables?");
  }

  if (text.includes("cocktail") || text.includes("coctel") || text.includes("bandej")) {
    addIfMissing(suggestions, data.trayServiceType, "Prefieren solo finger food, cazuelas o combinacion de ambos?");
  }

  addIfMissing(suggestions, data.budgetRange, "Hay un rango de presupuesto objetivo o nivel de propuesta esperado: basica, premium o signature?");

  return suggestions.slice(0, 8);
}

function addIfMissing(list, value, question) {
  if (!value || String(value).trim().length < 2) {
    list.push(question);
  }
}

function normalizeStatus(status) {
  const migratedStatus = STATUS_MIGRATION[status] || status || "new";
  return ALLOWED_STATUSES.has(migratedStatus) ? migratedStatus : "new";
}

function getFollowUpUrgency(followUpDate) {
  if (!followUpDate) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${followUpDate}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return "";
  }

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate.getTime() === today.getTime()) {
    return "today";
  }

  return "future";
}

function upsertChatRecord(phone, updates = {}) {
  chatRecords[phone] = buildChatRecord(phone, {
    ...(chatRecords[phone] || {}),
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

function appendHistoryEvent(phone, action, detail = "", actor = "Sistema") {
  if (!chatRecords[phone]) {
    return;
  }

  const history = Array.isArray(chatRecords[phone].history)
    ? chatRecords[phone].history
    : [];

  history.unshift({
    at: new Date().toISOString(),
    actor,
    action,
    detail,
  });

  chatRecords[phone].history = history.slice(0, 80);
}

function getSessionStatus(session) {
  if (!session) {
    return "pending_approval";
  }

  if (session.step === STEPS.COMPLETED) {
    if (session.data?.contactReason && session.data.contactReason !== "presupuesto_nuevo") {
      return "referred";
    }

    return "ready_to_quote";
  }

  if (session.step === STEPS.CONTACT_REASON) {
    return "approved_waiting_reason";
  }

  return "in_progress";
}

function getStatusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || status;
}

function getStepLabel(step) {
  const labels = {
    [STEPS.CONTACT_REASON]: "Motivo de contacto",
    [STEPS.FULL_NAME]: "Nombre",
    [STEPS.EVENT_TYPE]: "Tipo de evento",
    [STEPS.EVENT_DATE]: "Fecha",
    [STEPS.GUEST_COUNT]: "Invitados",
    [STEPS.VENUE]: "Lugar",
    [STEPS.SERVICE_TYPE]: "Servicio",
    [STEPS.DIETARY_RESTRICTIONS]: "Restricciones",
    [STEPS.COMPLETED]: "Completado",
  };

  return labels[step] || "Sin definir";
}

function getProgress(step) {
  if (step === STEPS.CONTACT_REASON) return 0;
  if (step >= STEPS.COMPLETED) return 100;
  return Math.max(0, Math.round(((step + 1) / STEPS.COMPLETED) * 100));
}

async function processIncomingMessage(message) {
  if (!shouldProcessMessage(message)) {
    return;
  }

  const messageId = getMessageId(message);

  if (messageId && processedMessageIds.has(messageId)) {
    return;
  }

  if (messageId) {
    processedMessageIds.add(messageId);
    savePersistentState();
  }

  const phone = message.from;
  const text = normalizeText(message.body);
  const contactInfo = await getMessageContactInfo(message);
  const knownCustomer = upsertCustomerRecord(phone, {
    displayPhone: contactInfo.displayPhone,
    contactName: contactInfo.contactName,
  });

  if (ADMIN_INCOMING_IDS.has(phone) && isAdminApprovalCommand(text)) {
    await handleAdminCommand(text);
    return;
  }

  if (!(await isTestMessage(message)) && await isInternalTeamMessage(message)) {
    console.log(`Mensaje interno ignorado: ${phone}`);
    return;
  }

  upsertChatRecord(phone, {
    lastMessage: text,
    displayPhone: contactInfo.displayPhone || knownCustomer.displayPhone,
    contactName: contactInfo.contactName || knownCustomer.contactName,
  });
  savePersistentState();

  if (!approvedCustomers.has(phone)) {
    await requestInitialConversationPermission({
      customerPhone: phone,
      customerDisplayPhone: contactInfo.displayPhone,
      customerContactName: contactInfo.contactName,
      customerMessage: text,
    });
    return;
  }

  if (sessions[phone]?.data && contactInfo.displayPhone) {
    sessions[phone].data.externalPhone = contactInfo.displayPhone;
  }

  if (sessions[phone]?.data) {
    applyKnownCustomerToSession(phone, sessions[phone], contactInfo);
  }

  const replyPlan = buildReplyPlan(phone, text);

  if (!replyPlan) {
    return;
  }

  await deliverReplyPlan(phone, replyPlan);
}

async function processUnreadMessagesOnStartup() {
  try {
    const chats = await client.getChats();
    const unreadChats = chats.filter((chat) => chat.unreadCount > 0);

    if (unreadChats.length === 0) {
      console.log("No hay mensajes no leidos para retomar.");
      return;
    }

    console.log(`Retomando ${unreadChats.length} chat(s) con mensajes no leidos...`);

    for (const chat of unreadChats) {
      const unreadCount = Math.min(chat.unreadCount, 10);
      const messages = await chat.fetchMessages({ limit: unreadCount });
      messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      for (const message of messages) {
        await processIncomingMessage(message);
      }
    }
  } catch (error) {
    console.error("No se pudieron revisar mensajes no leidos al iniciar:", error);
  }
}

function getMessageId(message) {
  return message.id?._serialized || "";
}

function loadBotMessages() {
  const messagesPath = path.join(__dirname, "mensajes-bot.json");

  try {
    const fileContent = fs.readFileSync(messagesPath, "utf8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("No se pudo cargar mensajes-bot.json:", error.message);
    console.error("Revise que el archivo exista y que no tenga comas mal ubicadas.");
    process.exit(1);
  }
}

function loadPersistentState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return 1;
    }

    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

    Object.assign(sessions, state.sessions || {});
    Object.assign(pendingReplies, state.pendingReplies || {});
    Object.assign(chatRecords, state.chatRecords || {});
    migratePersistentSessions();

    for (const phone of state.approvedCustomers || []) {
      approvedCustomers.add(phone);
    }

    for (const messageId of state.processedMessageIds || []) {
      processedMessageIds.add(messageId);
    }

    console.log("Estado anterior del bot cargado correctamente.");
    return state.pendingReplyCounter || 1;
  } catch (error) {
    console.error("No se pudo cargar bot-state.json:", error.message);
    console.error("El bot iniciara sin estado previo.");
    return 1;
  }
}

function migratePersistentSessions() {
  for (const session of Object.values(sessions)) {
    if (!session || !session.data) continue;
    ensureOperationalFields(session.data);
    migrateOldStepNumbers(session);
  }

  for (const pending of Object.values(pendingReplies)) {
    if (pending?.nextSession?.data) {
      ensureOperationalFields(pending.nextSession.data);
      migrateOldStepNumbers(pending.nextSession);
    }
  }

  for (const record of Object.values(chatRecords)) {
    if (record?.status) {
      record.status = normalizeStatus(record.status);
    }

    if (record?.data) {
      ensureOperationalFields(record.data);
    }

    if (!Array.isArray(record.history)) {
      record.history = [];
    }
  }

  cleanupStalePendingRecords();
}

function migrateOldStepNumbers(session) {
  // En versiones anteriores COMPLETED era 7; ahora el flujo tiene mas pasos.
  if (session.step === 7 && session.data?.dietaryRestrictions) {
    session.step = 11;
  }
}

function ensureOperationalFields(data) {
  const defaults = {
    eventMoments: "",
    drinkType: "",
    operationalNeeds: "",
    logistics: "",
    tableware: "",
    staff: "",
    kitchenAvailable: "",
    schedule: "",
    budgetRange: "",
    nextAction: "",
    externalPhone: "",
    contactName: "",
    assignedTo: "",
    followUpDate: "",
    statusReason: "",
  };

  for (const [field, value] of Object.entries(defaults)) {
    if (data[field] === undefined) {
      data[field] = value;
    }
  }
}

function savePersistentState() {
  const state = {
    sessions,
    pendingReplies,
    chatRecords,
    approvedCustomers: Array.from(approvedCustomers),
    processedMessageIds: Array.from(processedMessageIds).slice(-500),
    pendingReplyCounter,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function cleanupStalePendingRecords() {
  let changed = false;
  const phonesWithPendingApproval = new Set(
    Object.values(pendingReplies).map((pending) => pending.customerPhone)
  );

  for (const [phone, record] of Object.entries(chatRecords)) {
    if (record?.status !== "pending_approval") {
      continue;
    }

    if (phonesWithPendingApproval.has(phone)) {
      continue;
    }

    const session = sessions[phone] || record.session || createEmptySession();
    const fallbackStatus = approvedCustomers.has(phone)
      ? getSessionStatus(session)
      : "ignored";

    chatRecords[phone] = buildChatRecord(phone, {
      ...record,
      approvalId: "",
      status: fallbackStatus,
      session,
      updatedAt: record.updatedAt || new Date().toISOString(),
    });
    changed = true;
  }

  return changed;
}

function shouldProcessMessage(message) {
  if (message.fromMe) {
    return false;
  }

  if (message.from.endsWith("@g.us")) {
    return false;
  }

  if (message.hasMedia) {
    return false;
  }

  if (!message.body || typeof message.body !== "string") {
    return false;
  }

  return true;
}

function isAdminApprovalCommand(text) {
  return /^(APROBAR|RECHAZAR)\s+\d{4}$/i.test(text);
}

async function isTestMessage(message) {
  if (TEST_CHAT_IDS.has(message.from)) {
    return true;
  }

  const senderDigits = normalizePhoneDigits(message.from);

  if (senderDigits && TEST_PHONE_NUMBERS.has(senderDigits)) {
    return true;
  }

  try {
    const contact = await message.getContact();
    const contactCandidates = [
      contact?.id?._serialized,
      contact?.id?.user,
      contact?.number,
    ];

    return contactCandidates.some((value) => {
      if (!value) return false;
      if (TEST_CHAT_IDS.has(value)) return true;
      return TEST_PHONE_NUMBERS.has(normalizePhoneDigits(value));
    });
  } catch (error) {
    console.error("No se pudo verificar si el mensaje era de prueba:", error.message);
    return false;
  }
}

async function isInternalTeamMessage(message) {
  if (INTERNAL_TEAM_CHAT_IDS.has(message.from)) {
    return true;
  }

  const senderDigits = normalizePhoneDigits(message.from);

  if (senderDigits && INTERNAL_TEAM_PHONE_NUMBERS.has(senderDigits)) {
    return true;
  }

  try {
    const contact = await message.getContact();
    const contactCandidates = [
      contact?.id?._serialized,
      contact?.id?.user,
      contact?.number,
      contact?.pushname,
    ];

    return contactCandidates.some((value) => {
      if (!value) return false;
      if (INTERNAL_TEAM_CHAT_IDS.has(value)) return true;
      return INTERNAL_TEAM_PHONE_NUMBERS.has(normalizePhoneDigits(value));
    });
  } catch (error) {
    console.error("No se pudo verificar si el mensaje era interno:", error.message);
    return false;
  }
}

function formatWhatsappChatId(phoneNumber) {
  if (!phoneNumber || phoneNumber.includes("X")) {
    return "";
  }

  if (phoneNumber.endsWith("@c.us")) {
    return phoneNumber;
  }

  return `${phoneNumber.replace(/\D/g, "")}@c.us`;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function getMessageContactInfo(message) {
  const fallback = getReadablePhoneFallback(message.from);

  try {
    const contact = await message.getContact();
    const displayPhone =
      getPhoneFromContact(contact) ||
      fallback;

    return {
      displayPhone,
      contactName: contact?.pushname || contact?.name || contact?.shortName || "",
    };
  } catch (error) {
    console.error("No se pudo obtener el contacto real:", error.message);
    return {
      displayPhone: fallback,
      contactName: "",
    };
  }
}

function getPhoneFromContact(contact) {
  if (!contact) {
    return "";
  }

  if (contact.number) {
    return normalizePhoneDigits(contact.number);
  }

  const serializedId = contact.id?._serialized || "";
  const contactServer = contact.id?.server || "";

  if (contactServer === "c.us" && contact.id?.user) {
    return normalizePhoneDigits(contact.id.user);
  }

  if (serializedId.endsWith("@c.us")) {
    return normalizePhoneDigits(serializedId);
  }

  return "";
}

function getReadablePhoneFallback(chatId) {
  const value = String(chatId || "");

  if (value.endsWith("@lid")) {
    return "";
  }

  return normalizePhoneDigits(value) || value;
}

function firstReadablePhone(values) {
  for (const value of values) {
    const cleanValue = normalizeReadablePhone(value);

    if (cleanValue) {
      return cleanValue;
    }
  }

  return "Telefono no disponible";
}

function normalizeReadablePhone(value) {
  const text = String(value || "").trim();

  if (!text || text.endsWith("@lid")) {
    return "";
  }

  if (text.endsWith("@c.us")) {
    return normalizePhoneDigits(text);
  }

  return text;
}

function buildReplyPlan(phone, text) {
  const nextSession = cloneSession(sessions[phone] || createEmptySession());

  if (isResetCommand(text)) {
    return {
      nextSession: createEmptySession(),
      messages: buildWelcomeMessages(),
    };
  }

  if (!sessions[phone]) {
    return {
      nextSession,
      messages: buildWelcomeMessages(),
    };
  }

  if (nextSession.step === STEPS.CONTACT_REASON) {
    return buildContactReasonReplyPlan(nextSession, text);
  }

  if (nextSession.step >= STEPS.COMPLETED) {
    return null;
  }

  const result = validateAndStoreAnswer(nextSession, text);

  if (!result.isValid) {
    return {
      nextSession: cloneSession(sessions[phone]),
      messages: [
        result.errorMessage,
        renderMessage(QUESTIONS[sessions[phone].step], sessions[phone].data),
      ],
    };
  }

  nextSession.step += 1;

  if (nextSession.step === STEPS.COMPLETED) {
    const payload = buildWebhookPayload(phone, nextSession.data);
    return {
      nextSession,
      webhookPayload: payload,
      messages: [
        buildSummaryMessage(nextSession.data),
        BOT_MESSAGES.despedida,
      ],
    };
  }

  return {
    nextSession,
    messages: [renderMessage(QUESTIONS[nextSession.step], nextSession.data)],
  };
}

function buildContactReasonReplyPlan(nextSession, text) {
  const option = normalizeContactReason(text);

  if (option === "budget") {
    nextSession.step = STEPS.FULL_NAME;
    nextSession.data.contactReason = "presupuesto_nuevo";

    return {
      nextSession,
      messages: [
        BOT_MESSAGES.motivosContacto.presupuestoNuevo,
        renderMessage(QUESTIONS[STEPS.FULL_NAME], nextSession.data),
      ],
    };
  }

  if (option === "issued_budget") {
    nextSession.step = STEPS.COMPLETED;
    nextSession.data.contactReason = "presupuesto_emitido";

    return {
      nextSession,
      messages: [BOT_MESSAGES.motivosContacto.presupuestoEmitido],
    };
  }

  if (option === "supplier") {
    nextSession.step = STEPS.COMPLETED;
    nextSession.data.contactReason = "proveedor";

    return {
      nextSession,
      messages: [BOT_MESSAGES.motivosContacto.proveedor],
    };
  }

  if (option === "other") {
    nextSession.step = STEPS.COMPLETED;
    nextSession.data.contactReason = "otra_consulta";

    return {
      nextSession,
      messages: [BOT_MESSAGES.motivosContacto.otraConsulta],
    };
  }

  return {
    nextSession,
    messages: [BOT_MESSAGES.errores.motivoContacto, buildWelcomeMessages()[0]],
  };
}

function normalizeContactReason(text) {
  const value = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (value === "1" || value.includes("presupuesto nuevo") || value.includes("cotizar")) {
    return "budget";
  }

  if (value === "2" || value.includes("presupuesto") || value.includes("emitido")) {
    return "issued_budget";
  }

  if (value === "3" || value.includes("proveedor")) {
    return "supplier";
  }

  if (value === "4" || value.includes("consulta")) {
    return "other";
  }

  return "";
}

async function requestInitialConversationPermission({
  customerPhone,
  customerDisplayPhone,
  customerContactName,
  customerMessage,
}) {
  const existingApprovalId = findPendingApprovalIdByCustomer(customerPhone);

  if (existingApprovalId) {
    upsertChatRecord(customerPhone, {
      approvalId: existingApprovalId,
      status: "pending_approval",
      lastMessage: customerMessage,
      displayPhone: customerDisplayPhone,
      contactName: customerContactName,
    });
    savePersistentState();
    console.log(
      `El cliente ${customerPhone} ya tiene una solicitud pendiente (${existingApprovalId}).`
    );
    return;
  }

  const approvalId = String(pendingReplyCounter++).padStart(4, "0");
  const replyMessages = buildWelcomeMessages();
  const nextSession = createEmptySession();
  nextSession.data.externalPhone = customerDisplayPhone || "";
  nextSession.data.contactName = customerContactName || "";
  applyKnownCustomerToSession(customerPhone, nextSession, {
    displayPhone: customerDisplayPhone,
    contactName: customerContactName,
  });

  pendingReplies[approvalId] = {
    customerPhone,
    customerDisplayPhone: customerDisplayPhone || "",
    customerContactName: customerContactName || "",
    customerMessage,
    replyMessages,
    nextSession,
    createdAt: new Date().toISOString(),
  };
  upsertChatRecord(customerPhone, {
    approvalId,
    status: "pending_approval",
    lastMessage: customerMessage,
    session: nextSession,
    displayPhone: customerDisplayPhone,
    contactName: customerContactName,
    createdAt: pendingReplies[approvalId].createdAt,
  });
  savePersistentState();

  console.log(
    `Nueva solicitud pendiente (${approvalId}) de ${customerPhone}. Revise el panel local.`
  );
}

function findPendingApprovalIdByCustomer(customerPhone) {
  return Object.keys(pendingReplies).find(
    (approvalId) => pendingReplies[approvalId].customerPhone === customerPhone
  );
}

async function deliverReplyPlan(phone, replyPlan) {
  for (const replyMessage of replyPlan.messages) {
    await client.sendMessage(phone, replyMessage);
  }

  sessions[phone] = replyPlan.nextSession;
  upsertCustomerRecord(phone, {
    displayPhone: replyPlan.nextSession.data?.externalPhone,
    contactName: replyPlan.nextSession.data?.contactName,
    fullName: replyPlan.nextSession.data?.fullName,
    lastEventType: replyPlan.nextSession.data?.eventType,
    countBudget: Boolean(replyPlan.webhookPayload),
  });
  upsertChatRecord(phone, {
    session: replyPlan.nextSession,
  });
  savePersistentState();

  if (replyPlan.webhookPayload) {
    await sendBudgetRequestToWebhook(replyPlan.webhookPayload);
  }
}

async function handleAdminCommand(text) {
  const match = /^(APROBAR|RECHAZAR)\s+(\d{4})$/i.exec(text);

  if (!match) {
    await client.sendMessage(
      ADMIN_CHAT_ID,
      "Comando no reconocido. Use APROBAR 0001 o RECHAZAR 0001."
    );
    return;
  }

  const action = match[1].toUpperCase();
  const approvalId = match[2];

  if (!pendingReplies[approvalId]) {
    await client.sendMessage(
      ADMIN_CHAT_ID,
      `No encontre una respuesta pendiente con ID ${approvalId}.`
    );
    return;
  }

  if (action === "RECHAZAR") {
    const pending = rejectPendingConversation(approvalId);
    await client.sendMessage(
      ADMIN_CHAT_ID,
      `Listo. No se respondio al cliente ${pending.customerPhone}.`
    );
    return;
  }

  const pending = await approvePendingConversation(approvalId);

  await client.sendMessage(
    ADMIN_CHAT_ID,
    `Listo. Conversacion iniciada con ${pending.customerPhone}. A partir de ahora el bot continuara automaticamente el cuestionario con este cliente.`
  );
}

async function approvePendingConversation(approvalId) {
  const pending = pendingReplies[approvalId];

  if (!pending) {
    cleanupStalePendingRecords();
    savePersistentState();
    return null;
  }

  approvedCustomers.add(pending.customerPhone);

  for (const replyMessage of pending.replyMessages) {
    await client.sendMessage(pending.customerPhone, replyMessage);
  }

  delete pendingReplies[approvalId];
  sessions[pending.customerPhone] = pending.nextSession;
  upsertCustomerRecord(pending.customerPhone, {
    displayPhone: pending.customerDisplayPhone,
    contactName: pending.customerContactName,
    fullName: pending.nextSession.data?.fullName,
  });
  upsertChatRecord(pending.customerPhone, {
    approvalId: "",
    session: pending.nextSession,
    status: getSessionStatus(pending.nextSession),
  });
  appendHistoryEvent(
    pending.customerPhone,
    "Conversacion iniciada",
    "Solicitud aprobada desde el panel"
  );
  savePersistentState();

  if (pending.webhookPayload) {
    await sendBudgetRequestToWebhook(pending.webhookPayload);
  }

  return pending;
}

function rejectPendingConversation(approvalId) {
  const pending = pendingReplies[approvalId];

  if (!pending) {
    cleanupStalePendingRecords();
    savePersistentState();
    return null;
  }

  delete pendingReplies[approvalId];
  upsertChatRecord(pending.customerPhone, {
    approvalId: "",
    status: "ignored",
    session: pending.nextSession || createEmptySession(),
  });
  appendHistoryEvent(
    pending.customerPhone,
    "Solicitud ignorada",
    "No se inicio respuesta automatica"
  );
  savePersistentState();

  return pending;
}

function updateChatManualStatus(phone, status) {
  if (!phone) {
    throw new Error("Falta el telefono del chat.");
  }

  const normalizedStatus = normalizeStatus(status);

  if (!ALLOWED_STATUSES.has(normalizedStatus)) {
    throw new Error("Estado no permitido.");
  }

  const previousStatus = normalizeStatus(chatRecords[phone]?.status);
  upsertChatRecord(phone, {
    status: normalizedStatus,
    session: sessions[phone] || chatRecords[phone]?.session || createEmptySession(),
  });
  appendHistoryEvent(
    phone,
    "Estado actualizado",
    `${getStatusLabel(previousStatus)} -> ${getStatusLabel(normalizedStatus)}`,
    "Panel"
  );
  savePersistentState();
}

function createManualBudgetRecord(input) {
  const channel = normalizeText(input.channel || "");
  const fullName = normalizeText(input.fullName || "");
  const phone = normalizeText(input.phone || "");

  if (!channel) {
    throw new Error("Seleccione el canal por el cual se recibio la solicitud.");
  }

  if (!fullName) {
    throw new Error("Ingrese el nombre del cliente.");
  }

  const recordId = `manual-${Date.now()}`;
  const status = normalizeStatus(input.status || "in_progress");
  const session = {
    step: status === "ready_to_quote" ? STEPS.COMPLETED : STEPS.FULL_NAME,
    data: {
      contactReason: "presupuesto_externo",
      channel,
      fullName,
      eventType: normalizeText(input.eventType || ""),
      eventDate: normalizeText(input.eventDate || ""),
      guestCount: input.guestCount ? Number(input.guestCount) : 0,
      venue: normalizeText(input.venue || ""),
      serviceType: normalizeText(input.serviceType || ""),
      eventMoments: normalizeText(input.eventMoments || ""),
      drinkType: normalizeText(input.drinkType || ""),
      operationalNeeds: normalizeText(input.operationalNeeds || ""),
      logistics: normalizeText(input.logistics || ""),
      selectedMenu: normalizeText(input.selectedMenu || ""),
      includesDrinks: normalizeText(input.includesDrinks || ""),
      serviceMode: normalizeText(input.serviceMode || ""),
      trayServiceType: normalizeText(input.trayServiceType || ""),
      foodFormat: normalizeText(input.foodFormat || ""),
      tableware: normalizeText(input.tableware || ""),
      staff: normalizeText(input.staff || ""),
      kitchenAvailable: normalizeText(input.kitchenAvailable || ""),
      schedule: normalizeText(input.schedule || ""),
      budgetRange: normalizeText(input.budgetRange || ""),
      nextAction: normalizeText(input.nextAction || ""),
      assignedTo: normalizeText(input.assignedTo || ""),
      followUpDate: normalizeText(input.followUpDate || ""),
      statusReason: normalizeText(input.statusReason || ""),
      commercialNotes: normalizeText(input.commercialNotes || ""),
      dietaryRestrictions: normalizeText(input.dietaryRestrictions || ""),
      notes: normalizeText(input.notes || ""),
      externalPhone: phone,
    },
  };

  sessions[recordId] = session;
  approvedCustomers.add(recordId);
  upsertCustomerRecord(phone || recordId, {
    displayPhone: phone,
    fullName,
    lastEventType: session.data.eventType,
    countBudget: true,
  });
  upsertChatRecord(recordId, {
    channel,
    lastMessage: session.data.notes || "Pedido cargado manualmente",
    session,
    status,
    createdAt: new Date().toISOString(),
  });
  appendHistoryEvent(recordId, "Oportunidad creada", `Canal: ${channel}`, "Panel");
  savePersistentState();

  return chatRecords[recordId];
}

function updateBudgetRecord(phone, input) {
  if (!phone || !sessions[phone]) {
    throw new Error("No encontre el presupuesto para editar.");
  }

  const currentSession = sessions[phone];
  const data = currentSession.data || {};

  currentSession.data = {
    ...data,
    channel: normalizeText(input.channel || data.channel || ""),
    fullName: normalizeText(input.fullName || data.fullName || ""),
    eventType: normalizeText(input.eventType || ""),
    eventDate: normalizeText(input.eventDate || ""),
    guestCount: input.guestCount ? Number(input.guestCount) : 0,
    venue: normalizeText(input.venue || ""),
    serviceType: normalizeText(input.serviceType || ""),
    eventMoments: normalizeText(input.eventMoments || ""),
    drinkType: normalizeText(input.drinkType || ""),
    operationalNeeds: normalizeText(input.operationalNeeds || ""),
    logistics: normalizeText(input.logistics || ""),
    selectedMenu: normalizeText(input.selectedMenu || ""),
    includesDrinks: normalizeText(input.includesDrinks || ""),
    serviceMode: normalizeText(input.serviceMode || ""),
    trayServiceType: normalizeText(input.trayServiceType || ""),
    foodFormat: normalizeText(input.foodFormat || ""),
    tableware: normalizeText(input.tableware || ""),
    staff: normalizeText(input.staff || ""),
    kitchenAvailable: normalizeText(input.kitchenAvailable || ""),
    schedule: normalizeText(input.schedule || ""),
    budgetRange: normalizeText(input.budgetRange || ""),
    nextAction: normalizeText(input.nextAction || ""),
    assignedTo: normalizeText(input.assignedTo || ""),
    followUpDate: normalizeText(input.followUpDate || ""),
    statusReason: normalizeText(input.statusReason || ""),
    dietaryRestrictions: normalizeText(input.dietaryRestrictions || ""),
    commercialNotes: normalizeText(input.commercialNotes || ""),
    notes: normalizeText(input.notes || ""),
    externalPhone: normalizeText(input.externalPhone || input.displayPhone || data.externalPhone || ""),
  };

  const previousStatus = normalizeStatus(chatRecords[phone]?.status);
  const status = normalizeStatus(input.status || chatRecords[phone]?.status || getSessionStatus(currentSession));
  upsertCustomerRecord(phone, {
    displayPhone: currentSession.data.externalPhone,
    contactName: currentSession.data.contactName,
    fullName: currentSession.data.fullName,
    lastEventType: currentSession.data.eventType,
  });

  upsertChatRecord(phone, {
    channel: currentSession.data.channel || chatRecords[phone]?.channel || "WhatsApp empresa",
    status,
    session: currentSession,
    lastMessage: currentSession.data.notes || chatRecords[phone]?.lastMessage || "",
  });
  appendHistoryEvent(
    phone,
    "Presupuesto editado",
    previousStatus !== status
      ? `${getStatusLabel(previousStatus)} -> ${getStatusLabel(status)}`
      : "Datos comerciales actualizados",
    "Panel"
  );
  savePersistentState();

  return chatRecords[phone];
}

function deleteBudgetRecord(phone) {
  if (!phone) {
    throw new Error("Falta indicar que presupuesto desea eliminar.");
  }

  const hadSession = Boolean(sessions[phone]);
  const hadRecord = Boolean(chatRecords[phone]);
  let hadPending = false;

  for (const [approvalId, pending] of Object.entries(pendingReplies)) {
    if (pending.customerPhone === phone) {
      delete pendingReplies[approvalId];
      hadPending = true;
    }
  }

  delete sessions[phone];
  delete chatRecords[phone];
  approvedCustomers.delete(phone);
  savePersistentState();

  if (!hadSession && !hadRecord && !hadPending) {
    throw new Error("No encontre ese presupuesto para eliminar.");
  }
}

async function submitPurchaseRecord(input) {
  const existingId = normalizeText(input.id || "");
  const updateExisting = parseBooleanLike(input.updateExisting);
  const purchaseInput = { ...input };
  if (existingId && !updateExisting) {
    purchaseInput.id = "";
    purchaseInput.restoredFromClientId = existingId;
  }
  const purchase = buildPurchaseRecord(purchaseInput);
  const newProvider = ensurePurchaseOptionExists("provider", purchase.proveedor);
  const newProducts = purchase.lineItems.filter((item) =>
    ensurePurchaseOptionExists("product", item.description)
  ).length;
  rememberPurchasePrices(purchase);
  rememberErpPurchase(purchase);
  const googleResult = await syncPurchaseToSheets(existingId && updateExisting ? "upsert" : "create", purchase);

  return {
    ...googleResult,
    addedOptions: { provider: newProvider, product: newProducts > 0 },
    purchase,
  };
}

async function syncPurchaseToSheets(action, purchase) {
  const webhookUrl = process.env.PURCHASE_WEBHOOK_URL || BOT_CONFIG.purchaseWebhookUrl;

  if (!PURCHASE_SHEETS_SYNC_ENABLED) {
    return {
      sent: false,
      storage: "erp_database",
      message: "Compra guardada en la base del ERP. La sincronizacion automatica con Sheets esta desactivada.",
      purchase,
    };
  }

  if (action !== "create" && !PURCHASE_BIDIRECTIONAL_SYNC_ENABLED) {
    return {
      sent: false,
      storage: "erp_database",
      message: "Compra actualizada en la base del ERP. Active purchaseBidirectionalSyncEnabled solo si necesita sincronizar ediciones/eliminaciones con Sheets.",
      purchase,
    };
  }

  if (!webhookUrl) {
    console.log("Webhook de compras no configurado. Compra generada:");
    console.log(JSON.stringify(purchase, null, 2));
    return {
      sent: false,
      storage: "erp_database",
      message: "Webhook de compras no configurado. La compra quedo guardada en la base del ERP.",
      purchase,
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...purchase,
      action,
      rowNumber: purchase.rowNumber || "",
      purchase,
    }),
  });

  const text = await response.text();
  let googleResult = {};

  try {
    googleResult = text ? JSON.parse(text) : {};
  } catch (error) {
    googleResult = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Google Sheets respondio con estado ${response.status}: ${text}`);
  }

  if (googleResult.ok === false) {
    throw new Error(`Google Sheets informo un error: ${googleResult.error || text}`);
  }

  return {
    sent: true,
    message: googleResult.message || getPurchaseSyncMessage(action),
    row: googleResult.row || null,
    response: googleResult,
  };
}

function getPurchaseSyncMessage(action) {
  if (action === "delete") return "Compra eliminada en Google Sheets.";
  if (action === "upsert") return "Compra actualizada en Google Sheets.";
  return "Compra enviada a Google Sheets.";
}

function ensurePurchaseOptionExists(type, value) {
  const cleanValue = normalizeText(value || "");

  if (!cleanValue) {
    return false;
  }

  const allowedTypes = {
    provider: "purchaseProviders",
    product: "purchaseProducts",
    event: "purchaseEvents",
  };
  const key = allowedTypes[type];

  if (!key) {
    return false;
  }

  if (!Array.isArray(BOT_CONFIG[key])) {
    BOT_CONFIG[key] = [];
  }

  const exists = BOT_CONFIG[key].some(
    (item) => normalizeText(item).toLowerCase() === cleanValue.toLowerCase()
  );

  if (exists) {
    return false;
  }

  BOT_CONFIG[key].push(cleanValue);
  saveBotConfig();
  return true;
}

function buildPurchaseRecord(input, options = {}) {
  const requireEvent = options.requireEvent !== false;
  const lineItems = parsePurchaseItems(input);
  const firstItem = lineItems[0];
  const cleanId = normalizeText(input.id || "");
  const sheetRowMatch = cleanId.match(/^sheets-row-(\d+)$/);
  const rowNumber = normalizeText(input.rowNumber || input.row || (sheetRowMatch ? sheetRowMatch[1] : ""));
  const netAmount = roundMoney(
    lineItems.reduce((sum, item) => sum + item.netTotal, 0)
  );
  const ivaAmount = roundMoney(lineItems.reduce((sum, item) => sum + item.ivaAmount, 0));
  const totalAmount = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  const ivaRate = getDominantIvaRate(lineItems);
  const rawEventName = isMissingPurchaseEventName(input.eventName || input.evento || "") ? "" : normalizeText(input.eventName || input.evento || "");
  const imputationType = normalizePurchaseImputationType(input, rawEventName);
  const internalArea = imputationType === "internal" ? normalizeText(input.internalArea || input.areaConsumo || "") : "";
  const imputationNotes = imputationType === "internal" ? normalizeText(input.imputationNotes || input.detalleImputacion || "") : "";
  const eventName = imputationType === "event"
    ? rawEventName || (requireEvent ? "" : normalizeText(options.defaultEvent || "Sin evento"))
    : "";
  const eventRecord = eventName
    ? getErpEventList().find((event) => normalizeSearchKey(event.name || event.eventName || "") === normalizeSearchKey(eventName))
    : null;

  const purchase = {
    id: cleanId || `compra-${Date.now()}`,
    rowNumber,
    source: "panel_compras",
    spreadsheetId: BOT_CONFIG.purchaseSpreadsheetId || "",
    sheetName: BOT_CONFIG.purchaseSheetName || "Registro_Gastos",
    createdAt: new Date().toISOString(),
    fecha: normalizeText(input.date || ""),
    proveedor: normalizeText(input.provider || ""),
    descripcion: firstItem.description,
    cantidad: firstItem.quantity,
    montoUnitario: firstItem.unitAmount,
    montoTotal: totalAmount,
    comprobante: normalizeText(input.invoiceType || ""),
    evento: eventName,
    eventId: imputationType === "event" ? normalizeText(input.eventId || eventRecord?.id || "") : "",
    imputationType,
    internalArea,
    imputationNotes,
    neto: netAmount,
    ivaPorcentaje: ivaRate,
    ivaCalculado: ivaAmount,
    total: totalAmount,
    estadoPago: normalizeText(input.paymentStatus || "Pendiente"),
    medioPago: normalizeText(input.paymentMethod || ""),
    origenFondos: normalizeText(input.fundsSource || ""),
    observaciones: normalizeText(input.notes || ""),
    lineItems,
  };

  Object.assign(purchase, {
    date: purchase.fecha,
    provider: purchase.proveedor,
    description: purchase.descripcion,
    quantity: purchase.cantidad,
    unitAmount: purchase.montoUnitario,
    totalAmount: purchase.montoTotal,
    netAmount: purchase.neto,
    ivaRate: purchase.ivaPorcentaje,
    ivaAmount: purchase.ivaCalculado,
    invoiceType: purchase.comprobante,
    eventId: purchase.eventId,
    eventName: purchase.evento,
    imputationType: purchase.imputationType,
    internalArea: purchase.internalArea,
    imputationNotes: purchase.imputationNotes,
    imputationLabel: getPurchaseImputationLabel(purchase),
    paymentStatus: purchase.estadoPago,
    paymentMethod: purchase.medioPago,
    fundsSource: purchase.origenFondos,
    notes: purchase.observaciones,
    items: lineItems,
  });

  if (!purchase.fecha) {
    throw new Error("Ingrese la fecha de la compra.");
  }

  if (!purchase.proveedor) {
    throw new Error("Ingrese el proveedor.");
  }

  if (!purchase.descripcion) {
    throw new Error("Ingrese la descripcion de la compra.");
  }

  if (requireEvent && purchase.imputationType === "unassigned") {
    throw new Error("Seleccione si la compra corresponde a un evento o a consumo interno.");
  }

  if (requireEvent && purchase.imputationType === "event" && !purchase.evento) {
    throw new Error("Ingrese el evento al que corresponde la compra.");
  }

  if (purchase.imputationType === "internal" && !purchase.internalArea) {
    throw new Error("Seleccione el area de consumo interno.");
  }

  return purchase;
}

function parsePurchaseItems(input) {
  let items = input.items || [];
  const defaultIvaRate = normalizeIvaRate(input.ivaRate);

  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (error) {
      items = [];
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    items = [{
      description: input.description,
      quantity: input.quantity,
      unitAmount: input.unitAmount,
    }];
  }

  return items
    .map((item, index) => {
      const description = normalizeText(item.description || "");
      const quantity = parsePositivePurchaseDecimal(item.quantity || 1, `cantidad del producto ${index + 1}`);
      const unitAmount = parsePositivePurchaseDecimal(item.unitAmount, `monto unitario del producto ${index + 1}`);
      const rawIvaRate = parsePurchaseDecimal(item.ivaRate ?? item.iva ?? defaultIvaRate, 4, `IVA del producto ${index + 1}`);
      const ivaRate = rawIvaRate > 1 ? rawIvaRate / 100 : rawIvaRate;
      const netTotal = roundToDecimals(quantity * unitAmount, 8);
      const ivaAmount = roundToDecimals(netTotal * ivaRate, 8);

      if (!description) {
        throw new Error(`Ingrese la descripcion del producto ${index + 1}.`);
      }

      return {
        description,
        quantity,
        unitAmount,
        ivaRate,
        netTotal,
        ivaAmount,
        total: roundToDecimals(netTotal + ivaAmount, 8),
      };
    });
}

function normalizeIvaRate(value) {
  const rate = parseOptionalNumber(value);
  return rate > 1 ? rate / 100 : rate;
}

function getDominantIvaRate(lineItems) {
  const rates = Array.from(new Set((lineItems || []).map((item) => Number(item.ivaRate || 0))));
  return rates.length === 1 ? rates[0] : 0;
}

function parsePositiveNumber(value, label) {
  const number = Number(String(value || "").replace(",", "."));

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Ingrese un valor valido para ${label}.`);
  }

  return number;
}

function parsePurchaseDecimal(value, maxDecimals = 4, label = "valor") {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Ingrese un valor valido para ${label}.`);
    const factor = 10 ** maxDecimals;
    if (Math.abs(value * factor - Math.round(value * factor)) > 1e-6) {
      throw new Error(`${label} admite hasta ${maxDecimals} decimales.`);
    }
    return value;
  }

  const raw = String(value).trim().replace(/\s/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw.replace(/[^\d,.-]/g, "");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = normalized.replace(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Ingrese un valor valido para ${label}.`);
  }
  const decimals = normalized.split(".")[1]?.length || 0;
  if (decimals > maxDecimals) {
    throw new Error(`${label} admite hasta ${maxDecimals} decimales.`);
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`Ingrese un valor valido para ${label}.`);
  return number;
}

function parsePositivePurchaseDecimal(value, label, maxDecimals = 4) {
  const number = parsePurchaseDecimal(value, maxDecimals, label);
  if (number <= 0) throw new Error(`Ingrese un valor valido para ${label}.`);
  return number;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function extractPurchaseInvoiceData(input) {
  const imageDataUrl = String(input.imageDataUrl || "");

  if (!imageDataUrl.startsWith("data:image/")) {
    throw new Error("Suba una imagen valida de la factura.");
  }

  if (imageDataUrl.length > 18_000_000) {
    throw new Error("La imagen es demasiado grande. Pruebe sacando una foto mas liviana.");
  }

  const ocrText = await readInvoiceTextWithTesseract(imageDataUrl);
  const ollamaResult = await tryExtractInvoiceWithOllama(imageDataUrl, ocrText);

  if (ollamaResult) {
    return normalizeExtractedInvoiceData({
      ...ollamaResult,
      notes: [
        ollamaResult.notes || "",
        "Lectura local con Ollama + OCR gratuito. Revisar antes de cargar.",
      ].filter(Boolean).join(" | "),
    });
  }

  return normalizeExtractedInvoiceData({
    ...extractInvoiceDataFromOcrText(ocrText),
    notes: "Lectura gratuita con OCR local. Revise especialmente proveedor, productos e importes antes de cargar.",
  });
}

async function extractPurchaseInvoiceDataWithOpenAI(input) {
  const imageDataUrl = String(input.imageDataUrl || "");
  const apiKey = process.env.OPENAI_API_KEY || BOT_CONFIG.openaiApiKey;
  const model = BOT_CONFIG.invoiceOcrModel || "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("Falta configurar OPENAI_API_KEY u openaiApiKey en config-bot.json.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Extrae datos de esta factura, ticket, remito, presupuesto o documento no fiscal de compra para cargar en una planilla de gastos gastronomicos.",
                "Devuelve solo JSON valido, sin markdown.",
                "El documento puede ser impreso, fiscal, no fiscal, remito, presupuesto, factura A/B/C, ticket factura A o manuscrito.",
                "Ejemplos de proveedores esperables: Solucion Sustentable, Baca, Papelera del Oeste, Panaderia La Parra, La Casa del Cerdo, Seba Guzzo, Talastilla, Virgen del Valle, Avicola Rodeo, Lapiz y Papel.",
                "Campos requeridos: date en formato YYYY-MM-DD si aparece; provider; description; quantity; unitAmount; invoiceType; ivaRate; total; paymentMethod; cuit; invoiceNumber; notes; lineItems.",
                "lineItems debe ser un array con objetos {description, quantity, unitAmount, ivaRate, total}. Si un articulo indica IVA 10.5, 21 o 27, cargalo en ivaRate de ese articulo.",
                "description debe ser el producto principal si hay uno solo. Si hay varios productos, usa una descripcion resumida como VARIOS LIMPIEZA, VERDURA, CARNES, PANIFICADOS, LIBRERIA o DESCARTABLES segun corresponda.",
                "quantity debe ser la cantidad del producto principal. Si hay varios productos y no hay uno principal, usa 1.",
                "unitAmount debe ser precio unitario neto sin IVA cuando el documento separa IVA. El total de cada item debe ser neto + IVA.",
                "invoiceType debe ser Factura A, Factura B, Factura C, Ticket, Remito, Presupuesto o Sin comprobante.",
                "ivaRate debe ser 0, 0.105, 0.21 o 0.27.",
                "Para documentos no fiscales o presupuestos/remitos manuscritos, usa invoiceType Presupuesto o Sin comprobante segun lo que diga el papel.",
                "Si aparece TOTAL grande, usalo como total. En Argentina los importes pueden venir como 1.665.000 o 82.610,65.",
                "Si un dato no esta claro, dejalo vacio o usa null. No inventes datos.",
              ].join(" "),
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
            },
          ],
        },
      ],
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(getOpenAIInvoiceErrorMessage(text));
  }

  const result = JSON.parse(text);
  const outputText = getOpenAIResponseText(result);
  const extracted = parseJsonObjectFromText(outputText);

  return normalizeExtractedInvoiceData(extracted);
}

async function readInvoiceTextWithTesseract(imageDataUrl) {
  try {
    const result = await recognize(imageDataUrl, BOT_CONFIG.localOcrLanguage || "spa+eng");
    return normalizeOcrText(result?.data?.text || "");
  } catch (error) {
    throw new Error(`No se pudo leer texto de la factura con OCR gratuito: ${error.message}`);
  }
}

async function tryExtractInvoiceWithOllama(imageDataUrl, ocrText) {
  const enabled = BOT_CONFIG.localInvoiceAiEnabled !== false;
  const model = BOT_CONFIG.localInvoiceAiModel || "qwen2.5vl:latest";
  const endpoint = BOT_CONFIG.localInvoiceAiUrl || "http://127.0.0.1:11434/api/generate";

  if (!enabled) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const base64Image = imageDataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        prompt: buildLocalInvoicePrompt(ocrText),
        images: [base64Image],
        options: {
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return parseJsonObjectFromText(payload.response || "");
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalInvoicePrompt(ocrText) {
  return [
    "Sos un asistente local para cargar compras gastronomicas en una planilla.",
    "Analiza la imagen y el texto OCR. Devolve solo JSON valido, sin markdown.",
    "Campos requeridos: date YYYY-MM-DD si aparece; provider; description; quantity; unitAmount; invoiceType; ivaRate; total; paymentMethod; cuit; invoiceNumber; notes; lineItems.",
    "lineItems debe ser array de objetos {description, quantity, unitAmount, ivaRate, total}. Si un articulo indica IVA 10.5, 21 o 27, cargalo en ivaRate de ese articulo.",
    "invoiceType debe ser Factura A, Factura B, Factura C, Ticket, Remito, Presupuesto o Sin comprobante.",
    "ivaRate debe ser 0, 0.105, 0.21 o 0.27.",
    "En Argentina los importes pueden venir como 1.665.000 o 82.610,65.",
    "unitAmount debe ser precio unitario neto sin IVA cuando el documento separa IVA. El total de cada item debe ser neto + IVA.",
    "Si hay varios productos, extrae todos los legibles. Si no estas seguro, deja el dato vacio o null.",
    "Texto OCR disponible:",
    ocrText.slice(0, 7000),
  ].join("\n");
}

function extractInvoiceDataFromOcrText(ocrText) {
  const lines = ocrText.split("\n").map((line) => line.trim()).filter(Boolean);
  const provider = findKnownProviderFromText(ocrText) || findInvoiceProvider(lines);
  const lineItems = extractInvoiceLineItemsFromOcr(lines, provider);
  const itemSubtotal = roundMoney(lineItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
  const detectedTotal = findInvoiceTotal(lines);
  const total = detectedTotal && (!itemSubtotal || (detectedTotal >= itemSubtotal * 0.8 && detectedTotal <= itemSubtotal * 3))
    ? detectedTotal
    : itemSubtotal || detectedTotal;
  const quantity = 1;
  const description = lineItems.length
    ? summarizeInvoiceLineItems(lineItems)
    : findInvoiceDescription(lines);
  const date = findInvoiceDate(ocrText);

  return {
    date,
    provider,
    description,
    quantity,
    unitAmount: total || "",
    invoiceType: findInvoiceType(ocrText),
    ivaRate: findInvoiceIvaRate(ocrText),
    total,
    paymentMethod: findPaymentMethod(ocrText),
    cuit: findInvoiceCuit(ocrText),
    invoiceNumber: findInvoiceNumber(ocrText),
    lineItems: lineItems.length
      ? lineItems
      : description
        ? [{ description, quantity, unitAmount: total || "", total }]
        : [],
  };
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function findInvoiceProvider(lines) {
  const ignored = /^(original|factura|ticket|ti?que|cliente|senor|señor|fecha|cuit|iva|responsable|domicilio|telefono|total|subtotal|condicion|cod\.?|nro|mail|cae|arca)/i;
  const providerLine = lines.find((line) =>
    line.length >= 3 &&
    line.length <= 60 &&
    /[a-zA-Z]/.test(line) &&
    !ignored.test(line) &&
    !line.toLowerCase().includes("factura") &&
    !/\d{2}\/\d{2}\/\d{2,4}/.test(line)
  );

  return normalizeProviderName(providerLine || "");
}

function findKnownProviderFromText(text) {
  const haystack = normalizeForLooseMatch(text);
  const manualMatches = [
    ["virgen del valle", ["virgen", "valle"]],
    ["virgen del valle", ["vargas", "3401"]],
    ["virgen del valle", ["pedrd", "vargas"]],
    ["grupo radel s.r.l.", ["grupo", "radel"]],
    ["solucion sustentable sa", ["solucion", "sustentable"]],
    ["papelera del oeste", ["papelera", "oeste"]],
  ];

  for (const [provider, words] of manualMatches) {
    if (words.every((word) => haystack.includes(word))) {
      return normalizeProviderName(provider);
    }
  }

  const providers = [...(BOT_CONFIG.purchaseProviders || [])]
    .filter((provider) => normalizeForLooseMatch(provider).length >= 6)
    .sort((a, b) => normalizeForLooseMatch(b).length - normalizeForLooseMatch(a).length);

  return providers.find((provider) => {
    const needle = normalizeForLooseMatch(provider);
    const words = needle.split(" ").filter((word) => word.length > 2);

    return needle.length > 4 &&
      (haystack.includes(needle) ||
        (words.length >= 2 && words.every((word) => haystack.includes(word))));
  }) || "";
}

function normalizeForLooseMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProviderName(value) {
  return normalizeText(String(value || "")
    .replace(/[^a-zA-Z0-9ÁÉÍÓÚÜÑáéíóúüñ .,&/-]/g, " ")
    .replace(/\b(sa|sas|srl)\b/gi, (match) => match.toUpperCase()));
}

function findInvoiceDescription(lines) {
  const productLines = lines.filter((line) =>
    /[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/.test(line) &&
    !/(factura|ticket|cliente|fecha|cuit|iva|subtotal|total|domicilio|telefono|condicion|responsable|original|cae)/i.test(line) &&
    (/\d/.test(line) || line.length > 8)
  );

  const best = productLines.slice(0, 8).find((line) => line.length <= 80) || productLines[0] || "";
  return normalizeText(best.replace(/\$?\s*[\d.,]+/g, " ").replace(/\s+/g, " "));
}

function extractInvoiceLineItemsFromOcr(lines, provider = "") {
  const providerKey = normalizeForLooseMatch(provider);

  if (providerKey.includes("virgen") && providerKey.includes("valle")) {
    return extractVirgenDelValleLineItems(lines);
  }

  if (providerKey.includes("grupo") && providerKey.includes("radel")) {
    return extractGrupoRadelLineItems(lines);
  }

  if (providerKey.includes("solucion") && providerKey.includes("sustentable")) {
    return extractSolucionSustentableLineItems(lines);
  }

  const items = [];
  const moneyToken = "\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})|\\d{4,9}";
  const productLinePattern = new RegExp(
    `^(\\d+(?:[.,]\\d+)?)\\s+(.+?)\\s+(${moneyToken})\\s+[-—]?\\s*(${moneyToken})(?:\\s+[^0-9]*)?$`
  );
  const codedProductLinePattern = new RegExp(
    `^[^0-9]{0,12}\\d{4,7}\\s+([\\d.,]+)\\s+(.+?)\\s+(${moneyToken})\\s+[-—]?\\s*(${moneyToken})(?:\\s+[^0-9]*)?$`
  );

  for (const line of lines) {
    const cleanLine = line.replace(/\s+/g, " ").trim();
    const match = cleanLine.match(productLinePattern) || cleanLine.match(codedProductLinePattern);

    if (!match || /(subtotal|total|iva|descuento|cae|cuit|fecha)/i.test(cleanLine)) {
      continue;
    }

    const quantity = parseOcrQuantity(match[1]);
    const description = normalizeText(match[2].replace(/[|_]/g, " "));
    const total = parseOcrMoneyToken(match[4]);
    let unitAmount = parseOcrMoneyToken(match[3]);

    if (quantity > 0 && total > 0 && (!unitAmount || unitAmount > total)) {
      unitAmount = roundMoney(total / quantity);
    }

    if (description && quantity > 0 && total > 0) {
      items.push({
        description,
        quantity,
        unitAmount,
        total,
      });
    }
  }

  if (items.length) {
    return items.slice(0, 20);
  }

  return extractLooseInvoiceLineItemsFromOcr(lines).slice(0, 20);
}

function extractGrupoRadelLineItems(lines) {
  const items = [];
  const moneyToken = "\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})|\\d{5,9}|\\d+(?:[.,]\\d{2})";
  const pattern = new RegExp(
    `^[^0-9]{0,12}\\d{4,7}\\s+([\\d.,]+)\\s+(.+?)\\s+(${moneyToken})\\s+[-—]?\\s*(${moneyToken})(?:\\s+[^0-9]*)?$`
  );

  for (const line of lines) {
    const cleanLine = line.replace(/\s+/g, " ").trim();
    const match = cleanLine.match(pattern);

    if (!match) {
      continue;
    }

    const quantity = parseOcrQuantity(match[1]);
    const description = normalizeText(match[2]);
    const total = parseOcrMoneyToken(match[4]);
    let unitAmount = parseOcrMoneyToken(match[3]);

    if (quantity > 0 && total > 0 && (!unitAmount || unitAmount > total)) {
      unitAmount = roundMoney(total / quantity);
    }

    if (isLikelyProductDescription(description) && quantity > 0 && total > 0) {
      items.push({ description, quantity, unitAmount, total });
    }
  }

  return items.slice(0, 20);
}

function extractSolucionSustentableLineItems(lines) {
  const items = [];
  const productLine = lines.find((line) => /bambu|espadita/i.test(line));

  if (!productLine) {
    return items;
  }

  const productWindow = lines.join(" ");
  const totalMatch = productWindow.match(/\$\s*(\d{6,9})|(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2}))/);
  const unitMatch = productLine.match(/(\d+[.,]\d{3,4})/);
  const total = totalMatch ? parseOcrMoneyToken(totalMatch[1] || totalMatch[2]) : "";
  const unitAmount = unitMatch ? parseOcrUnitAmount(unitMatch[1]) : "";
  const quantity = total && unitAmount ? Math.max(1, Math.round(total / unitAmount)) : 1;
  const description = normalizeText(productLine.replace(/\b[A-Z0-9]{3,10}\b\s+/, "").replace(/\d+[.,]\d+.*$/, ""));

  if (description) {
    items.push({
      description,
      quantity,
      unitAmount: unitAmount || (total ? roundMoney(total / quantity) : ""),
      total,
    });
  }

  return items;
}

function extractVirgenDelValleLineItems(lines) {
  const productNames = [
    /mini\s*facturas|minifacturas|romans/i,
    /mini\s*tortitas|hinitortitas|m?n?tortitas/i,
    /tortitas/i,
    /medialunas|facts|facturas\s+media/i,
    /jamon|queso/i,
    /masas/i,
  ];
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const matched = productNames.find((pattern) => pattern.test(line));

    if (!matched || !isLikelyProductDescription(line)) {
      continue;
    }

    const windowText = lines.slice(index - 1, index + 4).join(" ");
    const quantityMatch = windowText.match(/\b(\d+(?:[.,]\d+)?)\s*\/\s*\d/);
    const decimalAmounts = findDecimalMoneyCandidates(windowText)
      .map(parseOcrMoneyToken)
      .filter((value) => Number.isFinite(value) && value >= 1000);
    const total = decimalAmounts.length ? decimalAmounts[decimalAmounts.length - 1] : "";
    const quantity = quantityMatch ? parseMoneyLikeNumber(quantityMatch[1]) : 1;

    items.push({
      description: normalizeVirgenProductName(line),
      quantity,
      unitAmount: total && quantity ? roundMoney(total / quantity) : "",
      total,
    });
  }

  return items.filter((item, index, arr) =>
    arr.findIndex((other) => normalizeForLooseMatch(other.description) === normalizeForLooseMatch(item.description)) === index
  );
}

function normalizeVirgenProductName(line) {
  const clean = normalizeForLooseMatch(line);

  if (clean.includes("romans") || clean.includes("minifacturas")) return "MINIFACTURAS";
  if (clean.includes("hinitortitas") || clean.includes("tortitas")) return clean.includes("var") ? "TORTITAS VARIAS POR 6 UNID." : "MINITORTITAS";
  if (clean.includes("medial") || clean.includes("facts")) return "FACTURAS MEDIALUNAS POR UNID.";
  if (clean.includes("jamon") || clean.includes("queso")) return "FACTURAS DE JAMON Y QUESO POR UNID.";
  if (clean.includes("masas")) return "MASAS HUMEDAS";

  return normalizeText(line);
}

function findDecimalMoneyCandidates(text) {
  return String(text || "").match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g) || [];
}

function parseOcrUnitAmount(value) {
  const clean = String(value || "").trim();

  if (/^\d[.,]\d{4}$/.test(clean)) {
    return Number(clean.replace(/[.,]/g, "")) / 10;
  }

  if (/^\d+[.,]\d{3,4}$/.test(clean)) {
    return Number(clean.replace(",", "."));
  }

  return parseOcrMoneyToken(clean);
}

function parseOcrQuantity(value) {
  const clean = String(value || "").trim();

  if (/^\d[.,]\d{3}$/.test(clean)) {
    return Number(clean.replace(",", "."));
  }

  if (/^\d{3,4}$/.test(clean)) {
    return Number(clean) / 100;
  }

  return parseMoneyLikeNumber(clean);
}

function extractLooseInvoiceLineItemsFromOcr(lines) {
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const nextLine = (lines[index + 1] || "").replace(/\s+/g, " ").trim();

    if (!isLikelyProductDescription(line)) {
      continue;
    }

    const windowText = lines.slice(index, index + 4).join(" ");
    const amounts = findMoneyCandidates(windowText)
      .map(parseOcrMoneyToken)
      .filter((value) => Number.isFinite(value) && value > 0);
    const quantityMatch = windowText.match(/\b(\d+(?:[.,]\d+)?)\s*\/\s*\d/);
    const parsedQuantity = quantityMatch ? parseOcrQuantity(quantityMatch[1]) : 1;
    const quantity = parsedQuantity > 100 ? parsedQuantity / 1000 : parsedQuantity;
    const total = amounts.length ? Math.max(...amounts) : "";

    if (total) {
      items.push({
        description: normalizeText(line),
        quantity,
        unitAmount: quantity > 0 ? roundMoney(total / quantity) : total,
        total,
      });
      continue;
    }

    if (isLikelyProductDescription(nextLine)) {
      items.push({
        description: normalizeText(line),
        quantity: 1,
        unitAmount: "",
        total: "",
      });
    }
  }

  return items;
}

function isLikelyProductDescription(line) {
  const clean = normalizeText(line);

  if (clean.length < 4 || clean.length > 80) {
    return false;
  }

  if (!/[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/.test(clean)) {
    return false;
  }

  return !/(factura|ticket|tique|cliente|señor|senor|fecha|cuit|iva|subtotal|total|domicilio|telefono|condicion|responsable|original|cae|ing\.?|brutos|actividad|pesos|cambio|recibi|defensa|consumidor)/i.test(clean);
}

function summarizeInvoiceLineItems(items) {
  if (!items.length) {
    return "";
  }

  if (items.length === 1) {
    return items[0].description;
  }

  return "VARIOS: " + items.slice(0, 3).map((item) => item.description).join(", ");
}

function findInvoiceDate(text) {
  const lines = String(text || "").split("\n");
  const preferredLine = lines.find((line) =>
    /fecha/i.test(line) &&
    !/(inicio|actividad|vto|venc|cae)/i.test(line) &&
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(line)
  );
  const fallbackLine = lines.find((line) =>
    !/(inicio|actividad|vto|venc|cae)/i.test(line) &&
    /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.test(line)
  );
  const match = (preferredLine || fallbackLine || "").match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);

  if (!match) {
    return "";
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function findInvoiceTotal(lines) {
  const totalLine = [...lines].reverse().find((line) => /\btotal\b/i.test(line) && findMoneyCandidates(line).length);
  const candidates = totalLine ? findMoneyCandidates(totalLine) : [];
  const values = candidates.map(parseOcrMoneyToken).filter((value) => Number.isFinite(value) && value > 0);

  if (!values.length) {
    return "";
  }

  return Math.max(...values);
}

function findMoneyCandidates(text) {
  return String(text || "").match(/\$?\s*\d{5,9}|\$?\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\$?\s*\d+(?:[.,]\d{2})/g) || [];
}

function parseOcrMoneyToken(value) {
  const clean = String(value || "")
    .replace(/\s/g, "")
    .replace(/\$/g, "");

  if (/^\d{6,9}$/.test(clean)) {
    return Number(clean) / 100;
  }

  return parseMoneyLikeNumber(clean);
}

function findInvoiceType(text) {
  const clean = String(text || "").toLowerCase();

  if (clean.includes("presupuesto")) return "Presupuesto";
  if (clean.includes("remito")) return "Remito";
  if (clean.includes("documento no fiscal")) return "Sin comprobante";
  if (clean.includes("factura a") || clean.includes("ticket factura a")) return "Factura A";
  if (clean.includes("factura b") || clean.includes("ticket factura b")) return "Factura B";
  if (clean.includes("factura c") || clean.includes("ticket factura c")) return "Factura C";
  if (clean.includes("factura")) return "Factura A";
  if (clean.includes("ticket") || clean.includes("tique")) return "Ticket";
  return "Sin comprobante";
}

function findInvoiceIvaRate(text) {
  const clean = String(text || "");

  if (/27\s*%/.test(clean)) return "0.27";
  if (/21\s*%/.test(clean)) return "0.21";
  if (/10[,.]?\s*5\s*%|10\.50\s*%|10,50\s*%/.test(clean)) return "0.105";
  return "0";
}

function findPaymentMethod(text) {
  const clean = String(text || "").toLowerCase();

  if (clean.includes("efectivo")) return "Efectivo";
  if (clean.includes("transferencia")) return "Transferencia";
  if (clean.includes("mercado pago") || clean.includes("mp")) return "Mercado Pago";
  if (clean.includes("contado")) return "Contado";
  return "";
}

function findInvoiceCuit(text) {
  const match = String(text || "").match(/\b\d{2}[-\s]?\d{7,8}[-\s]?\d\b/);
  return match ? match[0].replace(/\s/g, "") : "";
}

function findInvoiceNumber(text) {
  const match = String(text || "").match(/\b\d{4,5}[-\s]\d{6,8}\b/);
  return match ? match[0].replace(/\s/g, "") : "";
}

function getOpenAIInvoiceErrorMessage(responseText) {
  try {
    const payload = JSON.parse(responseText);
    const code = payload?.error?.code;
    const type = payload?.error?.type;

    if (code === "insufficient_quota" || type === "insufficient_quota") {
      return "No se pudo leer la factura porque la cuenta de OpenAI no tiene credito o cuota disponible. Revise la facturacion de OpenAI y vuelva a intentar.";
    }

    if (code === "invalid_api_key") {
      return "No se pudo leer la factura porque la clave de OpenAI no es valida. Revise openaiApiKey en config-bot.json.";
    }

    if (payload?.error?.message) {
      return `No se pudo leer la factura: ${payload.error.message}`;
    }
  } catch (error) {
    // Si OpenAI responde algo no JSON, mostramos un error simple para el panel.
  }

  return "No se pudo leer la factura. Revise la configuracion de OpenAI y vuelva a intentar.";
}

function getOpenAIResponseText(result) {
  if (result.output_text) {
    return result.output_text;
  }

  const parts = [];

  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n");
}

function parseJsonObjectFromText(text) {
  const clean = String(text || "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("La lectura inteligente no devolvio datos en formato valido.");
  }

  return JSON.parse(clean.slice(start, end + 1));
}

function normalizeExtractedInvoiceData(data = {}) {
  const quantity = data.quantity ? parseMoneyLikeNumber(data.quantity) : 1;
  const total = data.total ? parseMoneyLikeNumber(data.total) : 0;
  const unitAmount = data.unitAmount
    ? parseMoneyLikeNumber(data.unitAmount)
    : total && quantity
      ? roundMoney(total / quantity)
      : "";
  const lineItems = normalizeInvoiceLineItems(data.lineItems);
  const lineNotes = lineItems.length
    ? `Items leidos: ${lineItems.map(formatInvoiceLineItem).join("; ")}`
    : "";

  return {
    date: normalizeText(data.date || ""),
    provider: normalizeText(data.provider || ""),
    description: normalizeText(data.description || ""),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unitAmount: Number.isFinite(unitAmount) && unitAmount > 0 ? unitAmount : "",
    invoiceType: normalizeText(data.invoiceType || ""),
    ivaRate: data.ivaRate === null || data.ivaRate === undefined ? "" : String(data.ivaRate),
    total: Number.isFinite(total) && total > 0 ? total : "",
    paymentMethod: normalizeText(data.paymentMethod || ""),
    cuit: normalizeText(data.cuit || ""),
    invoiceNumber: normalizeText(data.invoiceNumber || ""),
    lineItems,
    notes: normalizeText([data.notes || "", lineNotes].filter(Boolean).join(" | ")),
  };
}

function normalizeInvoiceLineItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      description: normalizeText(item.description || ""),
      quantity: item.quantity ? parseMoneyLikeNumber(item.quantity) : "",
      unitAmount: item.unitAmount ? parseMoneyLikeNumber(item.unitAmount) : "",
      ivaRate: item.ivaRate === null || item.ivaRate === undefined ? "" : normalizeIvaRate(item.ivaRate),
      total: item.total ? parseMoneyLikeNumber(item.total) : "",
    }))
    .filter((item) => item.description)
    .slice(0, 20);
}

function formatInvoiceLineItem(item) {
  const parts = [
    item.quantity ? `${item.quantity} x` : "",
    item.description,
    item.ivaRate ? `IVA ${roundMoney(Number(item.ivaRate) * 100)}%` : "",
    item.total ? `$${item.total}` : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function parseMoneyLikeNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const clean = String(value || "")
    .replace(/\s/g, "")
    .replace(/\$/g, "");

  if (!clean) {
    return 0;
  }

  if (clean.includes(",") && clean.includes(".")) {
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");

    if (lastDot > lastComma) {
      return Number(clean.replace(/,/g, ""));
    }

    return Number(clean.replace(/\./g, "").replace(",", "."));
  }

  if (clean.includes(",")) {
    if ((clean.match(/,/g) || []).length > 1 || /,\d{3}$/.test(clean)) {
      return Number(clean.replace(/,/g, ""));
    }

    return Number(clean.replace(",", "."));
  }

  if ((clean.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(clean)) {
    return Number(clean.replace(/\./g, ""));
  }

  return Number(clean);
}

function buildWelcomeMessages() {
  return [
    renderMessage(BOT_MESSAGES.bienvenida.join("\n")),
  ];
}

function cloneSession(session) {
  return JSON.parse(JSON.stringify(session));
}

function renderMessage(message, data = {}) {
  return message.replaceAll("{nombre}", data.fullName || "");
}

function normalizeText(value) {
  return fixMojibakeText(String(value ?? "")).trim().replace(/\s+/g, " ");
}

function fixMojibakeText(value) {
  return String(value ?? "")
    .replaceAll("Ã¡", "á")
    .replaceAll("Ã©", "é")
    .replaceAll("Ã­", "í")
    .replaceAll("Ã³", "ó")
    .replaceAll("Ãº", "ú")
    .replaceAll("Ã", "Á")
    .replaceAll("Ã‰", "É")
    .replaceAll("Ã", "Í")
    .replaceAll("Ã“", "Ó")
    .replaceAll("Ãš", "Ú")
    .replaceAll("Ã±", "ñ")
    .replaceAll("Ã‘", "Ñ")
    .replaceAll("Â°", "°")
    .replaceAll("Âº", "º")
    .replaceAll("Âª", "ª")
    .replaceAll("Â·", "·")
    .replaceAll("Â", "");
}

function isResetCommand(text) {
  return ["reiniciar", "reset", "empezar de nuevo", "inicio"].includes(
    text.toLowerCase()
  );
}

function createEmptySession() {
  return {
    step: STEPS.CONTACT_REASON,
    data: {
      contactReason: "",
      fullName: "",
      eventType: "",
      eventDate: "",
      guestCount: 0,
      venue: "",
      serviceType: "",
      eventMoments: "",
      drinkType: "",
      operationalNeeds: "",
      logistics: "",
      selectedMenu: "",
      includesDrinks: "",
      serviceMode: "",
      trayServiceType: "",
      foodFormat: "",
      tableware: "",
      staff: "",
      kitchenAvailable: "",
      schedule: "",
      budgetRange: "",
      nextAction: "",
      commercialNotes: "",
      dietaryRestrictions: "",
      notes: "",
      externalPhone: "",
      contactName: "",
      assignedTo: "",
      followUpDate: "",
      statusReason: "",
    },
  };
}

async function sendWelcomeMessage(phone) {
  await client.sendMessage(phone, buildWelcomeMessages()[0]);
}

function validateAndStoreAnswer(session, text) {
  switch (session.step) {
    case STEPS.FULL_NAME:
      return validateFullName(session, text);

    case STEPS.EVENT_TYPE:
      return validateRequiredText(session, "eventType", text, {
        minLength: 3,
        errorMessage: BOT_MESSAGES.errores.tipoEvento,
      });

    case STEPS.EVENT_DATE:
      return validateFutureDate(session, text);

    case STEPS.GUEST_COUNT:
      return validateGuestCount(session, text);

    case STEPS.VENUE:
      return validateRequiredText(session, "venue", text, {
        minLength: 3,
        errorMessage: BOT_MESSAGES.errores.lugar,
      });

    case STEPS.SERVICE_TYPE:
      return validateServiceType(session, text);

    case STEPS.EVENT_MOMENTS:
      return validateRequiredText(session, "eventMoments", text, {
        minLength: 3,
        errorMessage: BOT_MESSAGES.errores.momentosEvento,
      });

    case STEPS.DRINKS_DETAIL:
      return validateDrinksDetail(session, text);

    case STEPS.OPERATIONAL_NEEDS:
      return validateOperationalNeeds(session, text);

    case STEPS.LOGISTICS:
      return validateRequiredText(session, "logistics", text, {
        minLength: 3,
        errorMessage: BOT_MESSAGES.errores.logistica,
      });

    case STEPS.DIETARY_RESTRICTIONS:
      return validateRequiredText(session, "dietaryRestrictions", text, {
        minLength: 2,
        errorMessage: BOT_MESSAGES.errores.restricciones,
      });

    default:
      return {
        isValid: false,
        errorMessage: BOT_MESSAGES.errores.pasoDesconocido,
      };
  }
}

module.exports = {
  extractPurchaseInvoiceData,
};

function validateFullName(session, text) {
  const parts = text.split(" ").filter(Boolean);
  const hasOnlyReasonableCharacters = /^[\p{L}' -]+$/u.test(text);

  if (parts.length < 2 || text.length < 5 || !hasOnlyReasonableCharacters) {
    return {
      isValid: false,
      errorMessage: BOT_MESSAGES.errores.nombre,
    };
  }

  session.data.fullName = toTitleCase(text);
  return { isValid: true };
}

function validateRequiredText(session, field, text, options) {
  if (!text || text.length < options.minLength) {
    return {
      isValid: false,
      errorMessage: options.errorMessage,
    };
  }

  session.data[field] = text;
  return { isValid: true };
}

function validateServiceType(session, text) {
  const result = validateRequiredText(session, "serviceType", text, {
    minLength: 3,
    errorMessage: BOT_MESSAGES.errores.tipoServicio,
  });

  if (!result.isValid) {
    return result;
  }

  const lower = text.toLowerCase();
  if (lower.includes("bandej")) session.data.serviceMode = "Bandejeo";
  if (lower.includes("sentad") || lower.includes("mesa")) session.data.serviceMode = "Sentado a la mesa";
  if (lower.includes("estacion")) session.data.serviceMode = "Estaciones";
  if (lower.includes("mixto")) session.data.serviceMode = "Mixto";
  if (lower.includes("finger")) session.data.trayServiceType = "Solo finger food";
  if (lower.includes("cazuela")) session.data.trayServiceType = "Bandejeo de cazuelas";
  if (lower.includes("coffee")) session.data.foodFormat = "Coffee / brunch";
  if (lower.includes("brunch")) session.data.foodFormat = "Coffee / brunch";
  if (lower.includes("cocktail") || lower.includes("coctel")) session.data.foodFormat = "Cocktail";

  return result;
}

function validateDrinksDetail(session, text) {
  const result = validateRequiredText(session, "drinkType", text, {
    minLength: 2,
    errorMessage: BOT_MESSAGES.errores.bebidas,
  });

  if (!result.isValid) {
    return result;
  }

  const lower = text.toLowerCase();
  if (lower.includes("no") || lower.includes("sin bebida")) {
    session.data.includesDrinks = "Sin bebidas";
  } else {
    session.data.includesDrinks = "Con bebidas";
  }

  return result;
}

function validateOperationalNeeds(session, text) {
  const result = validateRequiredText(session, "operationalNeeds", text, {
    minLength: 3,
    errorMessage: BOT_MESSAGES.errores.operacionServicio,
  });

  if (!result.isValid) {
    return result;
  }

  const lower = text.toLowerCase();
  if (lower.includes("bandej")) session.data.serviceMode = "Bandejeo";
  if (lower.includes("sentad") || lower.includes("mesa")) session.data.serviceMode = "Sentado a la mesa";
  if (lower.includes("estacion")) session.data.serviceMode = "Estaciones";
  if (lower.includes("mixto")) session.data.serviceMode = "Mixto";
  if (lower.includes("autoserv")) session.data.serviceMode = "Autoservicio";
  if (lower.includes("finger")) session.data.trayServiceType = "Solo finger food";
  if (lower.includes("cazuela")) session.data.trayServiceType = "Bandejeo de cazuelas";

  return result;
}

function validateFutureDate(session, text) {
  const parsedDate = parseDateDDMMYYYY(text);

  if (!parsedDate) {
    return {
      isValid: false,
      errorMessage: BOT_MESSAGES.errores.fechaFormato,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsedDate <= today) {
    return {
      isValid: false,
      errorMessage: BOT_MESSAGES.errores.fechaPasada,
    };
  }

  session.data.eventDate = text;
  return { isValid: true };
}

function parseDateDDMMYYYY(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isRealDate ? date : null;
}

function validateGuestCount(session, text) {
  const guestCount = Number(text);

  if (!Number.isInteger(guestCount) || guestCount <= 0) {
    return {
      isValid: false,
      errorMessage: BOT_MESSAGES.errores.cantidadInvitados,
    };
  }

  session.data.guestCount = guestCount;
  return { isValid: true };
}

async function finishConversation(phone, data) {
  const payload = buildWebhookPayload(phone, data);

  await client.sendMessage(phone, buildSummaryMessage(data));

  // Placeholder listo para conectar con Google Apps Script, Make, Zapier o un CRM.
  await sendBudgetRequestToWebhook(payload);

  await client.sendMessage(
    phone,
    "Muchas gracias por compartir la informacion. Nuestro equipo revisara los detalles y un asesor se contactara para enviarle una propuesta formal, cuidada y acorde a su evento."
  );

  sessions[phone].step = STEPS.COMPLETED;
}

function buildSummaryMessage(data) {
  return [
    BOT_MESSAGES.resumenTitulo,
    "",
    `Nombre: ${data.fullName}`,
    `Tipo de evento: ${data.eventType}`,
    `Fecha estimada: ${data.eventDate}`,
    `Cantidad de invitados: ${data.guestCount}`,
    `Lugar o zona: ${data.venue}`,
    `Servicio gastronomico: ${data.serviceType}`,
    `Momentos del evento: ${data.eventMoments || "A definir"}`,
    `Bebidas solicitadas: ${data.drinkType || data.includesDrinks || "A definir"}`,
    `Operacion/logistica: ${data.operationalNeeds || data.logistics || "A definir"}`,
    `Menu elegido: ${data.selectedMenu || "A definir"}`,
    `Bebidas: ${data.includesDrinks || "A definir"}`,
    `Modalidad: ${data.serviceMode || "A definir"}`,
    `Tipo de bandejeo: ${data.trayServiceType || "A definir"}`,
    `Formato gastronomico: ${data.foodFormat || "A definir"}`,
    `Restricciones alimentarias: ${data.dietaryRestrictions}`,
    "",
    BOT_MESSAGES.resumenCierre,
  ].join("\n");
}

function buildWebhookPayload(phone, data) {
  return {
    source: "whatsapp",
    phone,
    status: "new_budget_request",
    createdAt: new Date().toISOString(),
    customer: {
      fullName: data.fullName,
    },
    event: {
      type: data.eventType,
      estimatedDate: data.eventDate,
      guestCount: data.guestCount,
      venue: data.venue,
      serviceType: data.serviceType,
      eventMoments: data.eventMoments || "",
      drinkType: data.drinkType || "",
      operationalNeeds: data.operationalNeeds || "",
      logistics: data.logistics || "",
      selectedMenu: data.selectedMenu || "",
      includesDrinks: data.includesDrinks || "",
      serviceMode: data.serviceMode || "",
      trayServiceType: data.trayServiceType || "",
      foodFormat: data.foodFormat || "",
      tableware: data.tableware || "",
      staff: data.staff || "",
      kitchenAvailable: data.kitchenAvailable || "",
      schedule: data.schedule || "",
      budgetRange: data.budgetRange || "",
      nextAction: data.nextAction || "",
      assignedTo: data.assignedTo || "",
      followUpDate: data.followUpDate || "",
      statusReason: data.statusReason || "",
      dietaryRestrictions: data.dietaryRestrictions,
      commercialNotes: data.commercialNotes || "",
      notes: data.notes || "",
    },
  };
}

async function sendBudgetRequestToWebhook(payload) {
  const WEBHOOK_URL = process.env.BUDGET_WEBHOOK_URL || BOT_CONFIG.webhookUrl;

  if (!WEBHOOK_URL) {
    console.log("Webhook no configurado. Payload generado:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook respondio con estado ${response.status}`);
    }
  } catch (error) {
    console.error("No se pudo enviar el presupuesto al webhook:", error);
  }
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

