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
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const { recognize } = require("tesseract.js");

console.log("Iniciando bot de WhatsApp...");

patchWhatsappClientInjection();

const BOT_CONFIG = loadBotConfig();
const BOT_MESSAGES = loadBotMessages();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DATA_DIR = path.resolve(process.env.DATA_DIR || BOT_CONFIG.dataDir || __dirname);
const CONFIG_FILE = path.resolve(process.env.BOT_CONFIG_FILE || path.join(__dirname, "config-bot.json"));
const STATE_FILE = dataPath("bot-state.json");
const CUSTOMERS_FILE = dataPath("clientes-bot.json");
const RECIPES_FILE = dataPath("recetas-bot.json");
const PRODUCT_PRICES_FILE = dataPath("precios-productos-bot.json");
const COST_SETTINGS_FILE = dataPath("costos-bot.json");
const ERP_EVENTS_FILE = dataPath("eventos-erp.json");
const ERP_QUOTES_FILE = dataPath("presupuestos-erp.json");
const ERP_PURCHASES_FILE = dataPath("compras-erp.json");
const PANEL_AUTH_USER = process.env.PANEL_AUTH_USER || BOT_CONFIG.panelAuthUser || "admin";
const PANEL_AUTH_PASSWORD = process.env.PANEL_AUTH_PASSWORD || BOT_CONFIG.panelAuthPassword || "";
const PANEL_SESSION_SECRET =
  process.env.PANEL_SESSION_SECRET ||
  BOT_CONFIG.panelSessionSecret ||
  crypto.createHash("sha256").update(`${PANEL_AUTH_USER}:${PANEL_AUTH_PASSWORD || "local"}`).digest("hex");
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || BOT_CONFIG.maxJsonBodyBytes || 15 * 1024 * 1024);
const DEFAULT_CHROME_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEFAULT_CHROME_VERSION = "148.0.7778.217";
const WHATSAPP_WEB_VERSION =
  process.env.WHATSAPP_WEB_VERSION ||
  BOT_CONFIG.whatsappWebVersion ||
  getLatestCachedWhatsAppWebVersion();
const WHATSAPP_CLIENT_ID =
  process.env.WHATSAPP_CLIENT_ID || BOT_CONFIG.whatsappClientId || "catering-luxury-bot";
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
    executablePath: DEFAULT_CHROME_EXECUTABLE,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--no-first-run",
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
const productPriceRecords = {};
let costSettings = {};
let erpEvents = [];
let erpQuotes = [];
let erpPurchases = [];
const approvedCustomers = new Set();
const processedMessageIds = new Set();
const WHATSAPP_INIT_MAX_ATTEMPTS = Number(process.env.WHATSAPP_INIT_MAX_ATTEMPTS || 3);
const WHATSAPP_INIT_RETRY_MS = Number(process.env.WHATSAPP_INIT_RETRY_MS || 15000);

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
    console.log(`Conectando WhatsApp (intento ${attempt}/${WHATSAPP_INIT_MAX_ATTEMPTS})...`);
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
    message.includes("quedo esperando demasiado tiempo")
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
  return Array.isArray(BOT_CONFIG[key])
    ? BOT_CONFIG[key].filter(Boolean).map(String).sort((a, b) => a.localeCompare(b))
    : [];
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

  return {
    type,
    value: cleanValue,
    items: getConfigList(key),
  };
}

function startApprovalPanelServer() {
  validateRuntimeConfig();
  const panelPort = Number(process.env.PORT || process.env.PANEL_PORT || BOT_CONFIG.panelPort || 3080);
  const panelHost =
    process.env.PANEL_HOST ||
    BOT_CONFIG.panelHost ||
    (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");

  const server = http.createServer(async (request, response) => {
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

      if (!isAuthorizedPanelRequest(request)) {
        return requestPanelAuth(response);
      }

      if (request.method === "GET" && requestUrl.pathname === "/") {
        return servePanelHtml(response);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/state") {
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
        return sendJson(response, {
          ok: true,
          customers: getCustomerInsights(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/recipes") {
        return sendJson(response, {
          ok: true,
          recipes: getRecipeList(),
          products: getRecipeProductOptions(),
          settings: getCostSettings(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/erp") {
        return sendJson(response, {
          ok: true,
          dashboard: getErpDashboard(),
          pipeline: getPipelineBoard(),
          events: getErpEventList(),
          confirmedEvents: getConfirmedEventList(),
          quotes: getErpQuoteList(),
          purchases: getErpPurchaseList(),
          recipes: getRecipeList(),
          customers: getCustomerInsights(),
          productAlerts: getProductPriceAlerts(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/proposal.txt") {
        return sendProposalText(response, requestUrl.searchParams.get("quoteId"));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/sheets") {
        return sendJson(response, {
          ok: true,
          sheets: buildGoogleSheetsModel(),
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/export.xlsx") {
        return sendXlsxExport(response);
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/approve") {
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
        const body = await readJsonBody(request);
        updateChatManualStatus(body.phone, body.status);
        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/manual-budget") {
        const body = await readJsonBody(request);
        const record = createManualBudgetRecord(body);
        return sendJson(response, { ok: true, record });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/update-budget") {
        const body = await readJsonBody(request);
        const record = updateBudgetRecord(body.phone, body);
        return sendJson(response, { ok: true, record });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-budget") {
        const body = await readJsonBody(request);
        deleteBudgetRecord(body.phone);
        return sendJson(response, { ok: true });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase") {
        const body = await readJsonBody(request);
        const result = await submitPurchaseRecord(body);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/erp-event") {
        const body = await readJsonBody(request);
        const event = saveErpEventRecord(body);
        return sendJson(response, { ok: true, event, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-erp-event") {
        const body = await readJsonBody(request);
        deleteErpEventRecord(body.id);
        return sendJson(response, { ok: true, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/erp-quote") {
        const body = await readJsonBody(request);
        const quote = saveErpQuoteRecord(body);
        return sendJson(response, { ok: true, quote, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-erp-quote") {
        const body = await readJsonBody(request);
        deleteErpQuoteRecord(body.id);
        return sendJson(response, { ok: true, dashboard: getErpDashboard() });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-option") {
        const body = await readJsonBody(request);
        const result = addPurchaseOption(body.type, body.value);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/purchase-invoice-ocr") {
        const body = await readJsonBody(request);
        const result = await extractPurchaseInvoiceData(body);
        return sendJson(response, { ok: true, result });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/customer") {
        const body = await readJsonBody(request);
        const customer = saveCustomerFromPanel(body);
        return sendJson(response, { ok: true, customer });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/recipe") {
        const body = await readJsonBody(request);
        const recipe = saveRecipeRecord(body);
        return sendJson(response, { ok: true, recipe });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/cost-settings") {
        const body = await readJsonBody(request);
        const settings = saveCostSettingsFromPanel(body);
        return sendJson(response, { ok: true, settings });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/delete-recipe") {
        const body = await readJsonBody(request);
        deleteRecipeRecord(body.id);
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
}

function validateRuntimeConfig() {
  ensureDirectory(DATA_DIR);

  if (IS_PRODUCTION && !PANEL_AUTH_PASSWORD) {
    throw new Error("En produccion debe configurar PANEL_AUTH_PASSWORD.");
  }
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self';"
  );

  if (IS_PRODUCTION) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isAuthorizedPanelRequest(request) {
  if (!isPanelAuthEnabled()) {
    return true;
  }

  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return timingSafeEqual(user, PANEL_AUTH_USER) && timingSafeEqual(password, PANEL_AUTH_PASSWORD);
  } catch (error) {
    return false;
  }
}

function isPanelAuthEnabled() {
  return Boolean(PANEL_AUTH_PASSWORD);
}

function requestPanelAuth(response) {
  response.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Catering ERP", charset="UTF-8"',
  });
  response.end("Autenticacion requerida.");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function servePanelHtml(response) {
  const panelPath = path.join(__dirname, "approval-panel.html");
  const html = fs.readFileSync(panelPath, "utf8");

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendXlsxExport(response) {
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
      "Invitados",
      "Lugar",
      "Servicio",
      "Estado",
      "Responsable",
      "Proxima accion",
      "Presupuesto aceptado",
      "Margen %",
      "Compras imputadas",
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
      Invitados: event.guestCount,
      Lugar: event.venue,
      Servicio: event.serviceType,
      Estado: event.status,
      Responsable: event.owner,
      "Proxima accion": event.nextAction,
      "Presupuesto aceptado": event.quoteTotal,
      "Margen %": event.quoteMarginPercent,
      "Compras imputadas": event.purchaseTotal,
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
  Object.assign(productPriceRecords, readJsonFile(PRODUCT_PRICES_FILE, {}));
  costSettings = {
    laborHourlyCost: 0,
    ...readJsonFile(COST_SETTINGS_FILE, {}),
  };
  erpEvents = readJsonFile(ERP_EVENTS_FILE, []);
  erpQuotes = readJsonFile(ERP_QUOTES_FILE, []);
  erpPurchases = readJsonFile(ERP_PURCHASES_FILE, []);
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

function saveCustomerRecords() {
  writeJsonFile(CUSTOMERS_FILE, customerRecords);
}

function saveRecipeRecords() {
  writeJsonFile(RECIPES_FILE, recipeRecords);
}

function saveProductPriceRecords() {
  writeJsonFile(PRODUCT_PRICES_FILE, productPriceRecords);
}

function saveCostSettings() {
  writeJsonFile(COST_SETTINGS_FILE, costSettings);
}

function saveErpEvents() {
  writeJsonFile(ERP_EVENTS_FILE, erpEvents);
}

function saveErpQuotes() {
  writeJsonFile(ERP_QUOTES_FILE, erpQuotes);
}

function saveErpPurchases() {
  writeJsonFile(ERP_PURCHASES_FILE, erpPurchases);
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

  if (!displayPhone) {
    throw new Error("Ingrese un telefono para reconocer al cliente.");
  }

  return upsertCustomerRecord(input.id || displayPhone, {
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

function getCostSettings() {
  return {
    laborHourlyCost: parseDecimalNumber(costSettings.laborHourlyCost || 0),
  };
}

function saveCostSettingsFromPanel(input) {
  costSettings = {
    ...costSettings,
    laborHourlyCost: parseDecimalNumber(input.laborHourlyCost || 0),
    updatedAt: new Date().toISOString(),
  };
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
  const name = normalizeText(input.name || "");
  const portions = parseDecimalNumber(input.portions || input.yieldPortions || 0);
  const items = Array.isArray(input.items) ? input.items.map(normalizeRecipeItem).filter((item) => item.name) : [];
  const laborHours = parseDecimalNumber(input.laborHours || 0);
  const processRows = Array.isArray(input.processRows)
    ? input.processRows.map(normalizeRecipeProcessRow).filter((row) => row.label)
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
  const existingIndex = recipeRecords.findIndex((recipe) => recipe.id === input.id);
  const previous = existingIndex >= 0 ? recipeRecords[existingIndex] : {};
  const recipe = {
    id: previous.id || `receta-${Date.now()}`,
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
    items,
    notes: normalizeText(input.notes || ""),
    createdAt: previous.createdAt || now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    recipeRecords[existingIndex] = recipe;
  } else {
    recipeRecords.push(recipe);
  }

  saveRecipeRecords();
  return calculateRecipeCost(recipe);
}

function normalizeRecipeItem(item) {
  const type = ["product", "recipe"].includes(item.type) ? item.type : "product";
  return {
    type,
    recipeId: type === "recipe" ? normalizeText(item.recipeId || "") : "",
    name: normalizeText(item.name || ""),
    quantity: parseDecimalNumber(item.quantity || 0),
    unit: normalizeText(item.unit || ""),
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
    quantity: parseDecimalNumber(row.quantity || 0),
    unit: normalizeText(row.unit || ""),
    notes: normalizeText(row.notes || ""),
  };
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

function findRecipeById(id) {
  return recipeRecords.find((recipe) => recipe.id === id) || null;
}

function getRecipeCostQuantity(quantity, unit) {
  const normalizedUnit = normalizeText(unit || "").toLowerCase();

  if (normalizedUnit === "gramos") return quantity / 1000;
  if (normalizedUnit === "ml") return quantity / 1000;
  return quantity;
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
  const upcomingEvents = events.filter((event) => event.eventDate && event.eventDate >= today);
  const confirmedEvents = events.filter((event) => event.status === "confirmed" || event.status === "production");
  const openQuotes = quotes.filter((quote) => ["draft", "sent", "negotiation"].includes(quote.status));
  const acceptedQuotes = quotes.filter((quote) => quote.status === "accepted");
  const pendingPurchases = purchases.filter((purchase) => purchase.paymentStatus !== "Pagado");
  const estimatedRevenue = acceptedQuotes.reduce((sum, quote) => sum + Number(quote.priceTotal || 0), 0);
  const estimatedCost = acceptedQuotes.reduce((sum, quote) => sum + Number(quote.costTotal || 0), 0);
  const pendingPurchaseAmount = pendingPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);

  return {
    eventsTotal: events.length,
    upcomingEvents: upcomingEvents.length,
    confirmedEvents: confirmedEvents.length,
    openQuotes: openQuotes.length,
    acceptedQuotes: acceptedQuotes.length,
    estimatedRevenue: roundMoney(estimatedRevenue),
    estimatedCost: roundMoney(estimatedCost),
    estimatedMargin: roundMoney(estimatedRevenue - estimatedCost),
    estimatedMarginPercent: estimatedRevenue > 0 ? roundMoney(((estimatedRevenue - estimatedCost) / estimatedRevenue) * 100) : 0,
    pendingPurchaseAmount: roundMoney(pendingPurchaseAmount),
    pipeline: getPipelineBoard().columns.map((column) => ({
      id: column.id,
      label: column.label,
      count: column.items.length,
    })),
    alerts: buildErpAlerts(events, quotes, purchases),
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
    { id: "lost", label: "Perdido", items: [] },
  ];
  const byId = new Map(columns.map((column) => [column.id, column]));

  for (const chat of getChatDashboardList()) {
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
    done: "confirmed",
    lost: "lost",
    ignored: "lost",
    referred: "lost",
  };

  return mapping[normalized] || mapping[String(status || "").toLowerCase()] || "lead";
}

function getConfirmedEventList() {
  return getErpEventList()
    .filter((event) => ["confirmed", "production"].includes(event.status))
    .map((event) => ({
      ...event,
      checklist: normalizeOperationalChecklist(event.checklist),
      unpaidPurchases: getErpPurchaseList().filter(
        (purchase) =>
          purchase.eventName &&
          normalizeSearchKey(purchase.eventName) === normalizeSearchKey(event.name) &&
          purchase.paymentStatus !== "Pagado"
      ).length,
    }));
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
  return erpEvents.map(normalizeErpEvent).sort((a, b) => {
    const dateCompare = String(a.eventDate || "9999-12-31").localeCompare(String(b.eventDate || "9999-12-31"));
    return dateCompare || a.name.localeCompare(b.name);
  });
}

function normalizeErpEvent(event = {}) {
  const quote = getBestQuoteForEvent(event.id);
  const purchases = getErpPurchaseList().filter((purchase) => purchase.eventName && normalizeSearchKey(purchase.eventName) === normalizeSearchKey(event.name));
  const purchaseTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);

  return {
    id: event.id || `evento-${Date.now()}`,
    name: normalizeText(event.name || event.eventName || ""),
    clientId: normalizeText(event.clientId || ""),
    clientName: normalizeText(event.clientName || ""),
    eventDate: normalizePanelDate(event.eventDate || event.date || ""),
    guestCount: parseDecimalNumber(event.guestCount || 0),
    venue: normalizeText(event.venue || ""),
    serviceType: normalizeText(event.serviceType || ""),
    status: normalizeErpEventStatus(event.status || "lead"),
    owner: normalizeText(event.owner || event.assignedTo || ""),
    role: normalizeText(event.role || ""),
    nextAction: normalizeText(event.nextAction || ""),
    paymentStatus: normalizeText(event.paymentStatus || ""),
    productionStatus: normalizeText(event.productionStatus || ""),
    menuStatus: normalizeText(event.menuStatus || ""),
    staffStatus: normalizeText(event.staffStatus || ""),
    logisticsStatus: normalizeText(event.logisticsStatus || ""),
    checklist: normalizeOperationalChecklist(event.checklist || event),
    notes: normalizeText(event.notes || ""),
    quoteTotal: quote ? Number(quote.priceTotal || 0) : 0,
    quoteMarginPercent: quote ? Number(quote.marginPercent || 0) : 0,
    purchaseTotal: roundMoney(purchaseTotal),
    createdAt: event.createdAt || "",
    updatedAt: event.updatedAt || "",
  };
}

function normalizeOperationalChecklist(input = {}) {
  return {
    purchases: parseBooleanLike(input.purchases ?? input.checklistPurchases),
    production: parseBooleanLike(input.production ?? input.checklistProduction),
    staff: parseBooleanLike(input.staff ?? input.checklistStaff),
    logistics: parseBooleanLike(input.logistics ?? input.checklistLogistics),
    menu: parseBooleanLike(input.menu ?? input.checklistMenu),
    payments: parseBooleanLike(input.payments ?? input.checklistPayments),
  };
}

function parseBooleanLike(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function saveErpEventRecord(input) {
  const name = normalizeText(input.name || input.eventName || "");

  if (!name) {
    throw new Error("Ingrese el nombre del evento.");
  }

  const now = new Date().toISOString();
  const existingIndex = erpEvents.findIndex((event) => event.id === input.id);
  const previous = existingIndex >= 0 ? erpEvents[existingIndex] : {};
  const event = normalizeErpEvent({
    ...previous,
    ...input,
    id: input.id || previous.id || `evento-${Date.now()}`,
    name,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });

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
  saveErpEvents();
  return event;
}

function deleteErpEventRecord(id) {
  erpEvents = erpEvents.filter((event) => event.id !== id);
  saveErpEvents();
}

function getErpQuoteList() {
  return erpQuotes.map(normalizeErpQuote).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
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
  return {
    recipeId: normalizeText(item.recipeId || ""),
    name: normalizeText(item.name || ""),
    quantity: parseDecimalNumber(item.quantity || 0),
    unitCost: roundMoney(Number(item.unitCost || 0)),
    totalCost: roundMoney(Number(item.totalCost || 0)),
  };
}

function saveErpQuoteRecord(input) {
  const now = new Date().toISOString();
  const existingIndex = erpQuotes.findIndex((quote) => quote.id === input.id);
  const previous = existingIndex >= 0 ? erpQuotes[existingIndex] : {};
  const event = erpEvents.find((item) => item.id === input.eventId);
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
    const quantity = parseDecimalNumber(line.quantity || 0);
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
  const manualPrice = parseDecimalNumber(input.priceTotal || 0);
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
  return erpPurchases.map((purchase) => ({
    ...purchase,
    totalAmount: roundMoney(Number(purchase.totalAmount || 0)),
  })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function rememberErpPurchase(purchase) {
  const record = {
    id: purchase.id || `compra-${Date.now()}`,
    date: purchase.fecha || getDateOnly(new Date()),
    provider: purchase.proveedor || "",
    eventName: purchase.evento || "",
    description: purchase.descripcion || "",
    paymentStatus: purchase.estadoPago || "Pendiente",
    paymentMethod: purchase.medioPago || "",
    fundsSource: purchase.origenFondos || "",
    totalAmount: purchase.totalAmount || 0,
    lineItems: purchase.lineItems || [],
    createdAt: new Date().toISOString(),
  };

  erpPurchases.push(record);
  saveErpPurchases();
  return record;
}

function normalizeErpEventStatus(status) {
  const value = normalizeText(status || "").toLowerCase();
  const allowed = new Set(["lead", "quoted", "confirmed", "production", "done", "lost"]);
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
  const purchase = buildPurchaseRecord(input);
  const newProvider = ensurePurchaseOptionExists("provider", purchase.proveedor);
  const newProducts = purchase.lineItems.filter((item) =>
    ensurePurchaseOptionExists("product", item.description)
  ).length;
  rememberPurchasePrices(purchase);
  rememberErpPurchase(purchase);
  const webhookUrl = process.env.PURCHASE_WEBHOOK_URL || BOT_CONFIG.purchaseWebhookUrl;

  if (!webhookUrl) {
    console.log("Webhook de compras no configurado. Compra generada:");
    console.log(JSON.stringify(purchase, null, 2));
    return {
      sent: false,
      message: "Webhook de compras no configurado. La compra quedo generada para prueba.",
      addedOptions: { provider: newProvider, product: newProducts > 0 },
      purchase,
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(purchase),
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
    message: googleResult.message || "Compra enviada a Google Sheets.",
    addedOptions: { provider: newProvider, product: newProducts > 0 },
    row: googleResult.row || null,
    response: googleResult,
  };
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

function buildPurchaseRecord(input) {
  const lineItems = parsePurchaseItems(input);
  const firstItem = lineItems[0];
  const totalAmount = roundMoney(
    lineItems.reduce((sum, item) => sum + item.total, 0)
  );
  const ivaRate = parseOptionalNumber(input.ivaRate);
  const netAmount = totalAmount;
  const ivaAmount = roundMoney(netAmount * ivaRate);

  const purchase = {
    id: input.id || `compra-${Date.now()}`,
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
    evento: normalizeText(input.eventName || ""),
    neto: netAmount,
    ivaPorcentaje: ivaRate,
    ivaCalculado: ivaAmount,
    total: roundMoney(netAmount + ivaAmount),
    estadoPago: normalizeText(input.paymentStatus || "Pendiente"),
    medioPago: normalizeText(input.paymentMethod || ""),
    origenFondos: normalizeText(input.fundsSource || ""),
    observaciones: normalizeText(input.notes || ""),
    lineItems,
  };

  if (!purchase.fecha) {
    throw new Error("Ingrese la fecha de la compra.");
  }

  if (!purchase.proveedor) {
    throw new Error("Ingrese el proveedor.");
  }

  if (!purchase.descripcion) {
    throw new Error("Ingrese la descripcion de la compra.");
  }

  if (!purchase.evento) {
    throw new Error("Ingrese el evento al que corresponde la compra.");
  }

  return purchase;
}

function parsePurchaseItems(input) {
  let items = input.items || [];

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
      const quantity = parsePositiveNumber(item.quantity || 1, `cantidad del producto ${index + 1}`);
      const unitAmount = parsePositiveNumber(item.unitAmount, `monto unitario del producto ${index + 1}`);

      if (!description) {
        throw new Error(`Ingrese la descripcion del producto ${index + 1}.`);
      }

      return {
        description,
        quantity,
        unitAmount,
        total: roundMoney(quantity * unitAmount),
      };
    });
}

function parsePositiveNumber(value, label) {
  const number = Number(String(value || "").replace(",", "."));

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Ingrese un valor valido para ${label}.`);
  }

  return number;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(String(value).replace(",", "."));
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
                "lineItems debe ser un array con objetos {description, quantity, unitAmount, total}. Si hay muchos articulos, extrae los principales o todos los legibles.",
                "description debe ser el producto principal si hay uno solo. Si hay varios productos, usa una descripcion resumida como VARIOS LIMPIEZA, VERDURA, CARNES, PANIFICADOS, LIBRERIA o DESCARTABLES segun corresponda.",
                "quantity debe ser la cantidad del producto principal. Si hay varios productos y no hay uno principal, usa 1.",
                "unitAmount debe ser el total si hay varios productos y quantity es 1. Si hay un producto principal con precio unitario claro, usa ese precio unitario.",
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
    "lineItems debe ser array de objetos {description, quantity, unitAmount, total}.",
    "invoiceType debe ser Factura A, Factura B, Factura C, Ticket, Remito, Presupuesto o Sin comprobante.",
    "ivaRate debe ser 0, 0.105, 0.21 o 0.27.",
    "En Argentina los importes pueden venir como 1.665.000 o 82.610,65.",
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
      total: item.total ? parseMoneyLikeNumber(item.total) : "",
    }))
    .filter((item) => item.description)
    .slice(0, 20);
}

function formatInvoiceLineItem(item) {
  const parts = [
    item.quantity ? `${item.quantity} x` : "",
    item.description,
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
  return value.trim().replace(/\s+/g, " ");
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

