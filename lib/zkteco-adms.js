"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  DatabaseSync = null;
}

const DEFAULT_CONFIG = {
  enabled: false,
  bindHost: "0.0.0.0",
  port: 8080,
  allowedIps: [],
  allowedSerials: [],
  timezone: "America/Argentina/Buenos_Aires",
  debounceSeconds: 180,
  logRawPayloads: true,
  maxBodyBytes: 1024 * 1024,
  bodyTimeoutMs: 5000,
  syncEnabled: false,
  syncUrl: "",
  syncToken: "",
  syncIntervalSeconds: 30,
  syncBatchSize: 100,
  syncRequestTimeoutMs: 10000,
};

const VERIFY_METHOD_NAMES = {
  15: "face",
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "si", "sí"].includes(String(value).trim().toLowerCase());
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadBotConfig(configFile) {
  if (!configFile) return {};
  try {
    if (!fs.existsSync(configFile)) return {};
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (error) {
    return {};
  }
}

function loadZktecoConfig(env = process.env, options = {}) {
  const configFile = env.BOT_CONFIG_FILE || path.join(options.baseDir || process.cwd(), "config-bot.json");
  const botConfig = options.botConfig || loadBotConfig(configFile);
  const dataDir = path.resolve(env.DATA_DIR || botConfig.dataDir || options.dataDir || process.cwd());
  const dbFile = path.resolve(dataDir, env.CATERING_DB_FILE || botConfig.cateringDbFile || options.dbFileName || "catering.db");
  const config = {
    ...DEFAULT_CONFIG,
    enabled: parseBoolean(env.ZKTECO_ENABLED ?? botConfig.zktecoEnabled, false),
    bindHost: String(env.ZKTECO_BIND_HOST || botConfig.zktecoBindHost || DEFAULT_CONFIG.bindHost).trim(),
    port: Number(env.ZKTECO_PORT || botConfig.zktecoPort || DEFAULT_CONFIG.port),
    allowedIps: parseCsv(env.ZKTECO_ALLOWED_IPS || botConfig.zktecoAllowedIps || ""),
    allowedSerials: parseCsv(env.ZKTECO_ALLOWED_SERIALS || botConfig.zktecoAllowedSerials || ""),
    timezone: String(env.ZKTECO_TIMEZONE || botConfig.zktecoTimezone || DEFAULT_CONFIG.timezone).trim(),
    debounceSeconds: Number(env.ZKTECO_DEBOUNCE_SECONDS || botConfig.zktecoDebounceSeconds || DEFAULT_CONFIG.debounceSeconds),
    logRawPayloads: parseBoolean(env.ZKTECO_LOG_RAW_PAYLOADS ?? botConfig.zktecoLogRawPayloads, true),
    maxBodyBytes: Number(env.ZKTECO_MAX_BODY_BYTES || botConfig.zktecoMaxBodyBytes || DEFAULT_CONFIG.maxBodyBytes),
    bodyTimeoutMs: Number(env.ZKTECO_BODY_TIMEOUT_MS || botConfig.zktecoBodyTimeoutMs || DEFAULT_CONFIG.bodyTimeoutMs),
    syncEnabled: parseBoolean(env.ZKTECO_SYNC_ENABLED ?? botConfig.zktecoSyncEnabled, false),
    syncUrl: String(env.ZKTECO_SYNC_URL || botConfig.zktecoSyncUrl || DEFAULT_CONFIG.syncUrl).trim(),
    syncToken: String(env.ZKTECO_SYNC_TOKEN || botConfig.zktecoSyncToken || DEFAULT_CONFIG.syncToken).trim(),
    syncIntervalSeconds: Number(env.ZKTECO_SYNC_INTERVAL_SECONDS || botConfig.zktecoSyncIntervalSeconds || DEFAULT_CONFIG.syncIntervalSeconds),
    syncBatchSize: Number(env.ZKTECO_SYNC_BATCH_SIZE || botConfig.zktecoSyncBatchSize || DEFAULT_CONFIG.syncBatchSize),
    syncRequestTimeoutMs: Number(env.ZKTECO_SYNC_REQUEST_TIMEOUT_MS || botConfig.zktecoSyncRequestTimeoutMs || DEFAULT_CONFIG.syncRequestTimeoutMs),
    dataDir,
    dbFile,
  };
  validateZktecoConfig(config);
  return config;
}

function validateZktecoConfig(config = {}) {
  if (!config.bindHost) throw new Error("ZKTECO_BIND_HOST no puede estar vacio.");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("ZKTECO_PORT debe ser un puerto TCP valido.");
  }
  if (!config.timezone || !isSupportedTimeZone(config.timezone)) {
    throw new Error("ZKTECO_TIMEZONE debe ser una zona horaria valida.");
  }
  if (!Number.isFinite(config.debounceSeconds) || config.debounceSeconds < 0) {
    throw new Error("ZKTECO_DEBOUNCE_SECONDS debe ser un numero mayor o igual a 0.");
  }
  if (!Number.isInteger(config.maxBodyBytes) || config.maxBodyBytes < 1024) {
    throw new Error("ZKTECO_MAX_BODY_BYTES debe ser mayor a 1024 bytes.");
  }
  if (!Number.isInteger(config.bodyTimeoutMs) || config.bodyTimeoutMs < 1000) {
    throw new Error("ZKTECO_BODY_TIMEOUT_MS debe ser mayor a 1000 ms.");
  }
  if (!Number.isInteger(config.syncIntervalSeconds) || config.syncIntervalSeconds < 1) {
    throw new Error("ZKTECO_SYNC_INTERVAL_SECONDS debe ser mayor a 0.");
  }
  if (!Number.isInteger(config.syncBatchSize) || config.syncBatchSize < 1 || config.syncBatchSize > 500) {
    throw new Error("ZKTECO_SYNC_BATCH_SIZE debe estar entre 1 y 500.");
  }
  if (!Number.isInteger(config.syncRequestTimeoutMs) || config.syncRequestTimeoutMs < 1000) {
    throw new Error("ZKTECO_SYNC_REQUEST_TIMEOUT_MS debe ser mayor a 1000 ms.");
  }
  if (config.syncEnabled) {
    if (!config.syncToken) throw new Error("ZKTECO_SYNC_TOKEN es obligatorio cuando ZKTECO_SYNC_ENABLED=true.");
  }
  if (config.syncUrl) {
    try {
      const url = new URL(config.syncUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocolo invalido");
    } catch (error) {
      throw new Error("ZKTECO_SYNC_URL debe ser una URL HTTP/HTTPS valida.");
    }
  }
  return true;
}

function isSupportedTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

function ensureZktecoSchema(db) {
  if (!db) throw new Error("SQLite no esta disponible para ZKTeco.");
  db.exec(`
    CREATE TABLE IF NOT EXISTS biometric_events (
      id TEXT PRIMARY KEY,
      device_serial TEXT NOT NULL,
      device_employee_id TEXT NOT NULL,
      device_timestamp TEXT NOT NULL,
      received_at TEXT NOT NULL,
      attendance_status TEXT,
      verify_method TEXT,
      verify_method_name TEXT,
      raw_line TEXT NOT NULL,
      raw_payload TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      processing_status TEXT NOT NULL,
      linked_staff_id TEXT,
      processing_error TEXT,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_last_error TEXT,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_biometric_events_serial ON biometric_events(device_serial);
    CREATE INDEX IF NOT EXISTS idx_biometric_events_employee ON biometric_events(device_employee_id);
    CREATE INDEX IF NOT EXISTS idx_biometric_events_timestamp ON biometric_events(device_timestamp);
    CREATE INDEX IF NOT EXISTS idx_biometric_events_staff ON biometric_events(linked_staff_id);
    CREATE INDEX IF NOT EXISTS idx_biometric_events_status ON biometric_events(processing_status);

    CREATE TABLE IF NOT EXISTS biometric_staff_links (
      id TEXT PRIMARY KEY,
      device_serial TEXT NOT NULL,
      device_employee_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_staff_links_active_device_employee
      ON biometric_staff_links(device_serial, device_employee_id)
      WHERE active = 1;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_staff_links_active_staff_device
      ON biometric_staff_links(device_serial, staff_id)
      WHERE active = 1;

    CREATE TABLE IF NOT EXISTS biometric_device_status (
      device_serial TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      last_ip TEXT,
      last_endpoint TEXT,
      push_version TEXT,
      firmware TEXT,
      platform TEXT,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureTableColumns(db, "biometric_events", {
    sync_status: "TEXT NOT NULL DEFAULT 'pending'",
    sync_attempts: "INTEGER NOT NULL DEFAULT 0",
    sync_last_error: "TEXT",
    synced_at: "TEXT",
  });
  db.exec("CREATE INDEX IF NOT EXISTS idx_biometric_events_sync_status ON biometric_events(sync_status);");
}

function ensureTableColumns(db, tableName, columns = {}) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name));
  Object.entries(columns).forEach(([column, definition]) => {
    if (existing.has(column)) return;
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${definition};`);
  });
}

function openDatabase(dbFile) {
  if (!DatabaseSync) throw new Error("node:sqlite no esta disponible. Use Node.js 22.5+ o 24+.");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  ensureZktecoSchema(db);
  return db;
}

function normalizeDeviceTimestamp(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Fecha/hora de dispositivo invalida.");
  const [, year, month, day, hour, minute, second] = match.map(String);
  const numeric = [month, day, hour, minute, second].map(Number);
  if (numeric[0] < 1 || numeric[0] > 12 || numeric[1] < 1 || numeric[1] > 31 || numeric[2] > 23 || numeric[3] > 59 || numeric[4] > 59) {
    throw new Error("Fecha/hora de dispositivo fuera de rango.");
  }
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeRawLine(line) {
  return String(line || "").replace(/\r/g, "").trim();
}

function getVerifyMethodName(code) {
  return VERIFY_METHOD_NAMES[String(code)] || "unknown";
}

function parseAttlogLine(line) {
  const rawLine = normalizeRawLine(line);
  if (!rawLine) throw new Error("Linea ATTLOG vacia.");
  const columns = rawLine.split("\t").map((item) => item.trim());
  if (columns.length < 4) throw new Error("Linea ATTLOG incompleta.");
  const deviceEmployeeId = columns[0];
  const deviceTimestamp = normalizeDeviceTimestamp(columns[1]);
  const attendanceStatus = columns[2];
  const verifyMethod = columns[3];
  if (!deviceEmployeeId) throw new Error("ATTLOG sin ID de empleado.");
  return {
    deviceEmployeeId,
    deviceTimestamp,
    attendanceStatus,
    verifyMethod,
    verifyMethodName: getVerifyMethodName(verifyMethod),
    rawLine,
    extraColumns: columns.slice(4),
  };
}

function parseAttlogPayload(payload) {
  return String(payload || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return { ok: true, event: parseAttlogLine(line) };
      } catch (error) {
        return { ok: false, rawLine: normalizeRawLine(line), error: error.message };
      }
    });
}

function createBiometricIdempotencyKey({ deviceSerial, deviceEmployeeId, deviceTimestamp, attendanceStatus, verifyMethod, rawLine }) {
  return crypto
    .createHash("sha256")
    .update([
      deviceSerial,
      deviceEmployeeId,
      normalizeDeviceTimestamp(deviceTimestamp),
      attendanceStatus,
      verifyMethod,
      normalizeRawLine(rawLine),
    ].join("|"))
    .digest("hex");
}

function normalizeBiometricSyncEvent(input = {}, config = DEFAULT_CONFIG) {
  const deviceSerial = String(input.deviceSerial || input.device_serial || "").trim();
  if (!deviceSerial) throw new Error("Falta serial del reloj.");
  if (!isAllowed(deviceSerial, config.allowedSerials)) throw new Error("Serial no permitido.");
  const deviceEmployeeId = String(input.deviceEmployeeId || input.device_employee_id || "").trim();
  if (!deviceEmployeeId) throw new Error("Falta PIN/ID del reloj.");
  const deviceTimestamp = normalizeDeviceTimestamp(input.deviceTimestamp || input.device_timestamp);
  const attendanceStatus = String(input.attendanceStatus ?? input.attendance_status ?? "").trim();
  const verifyMethod = String(input.verifyMethod ?? input.verify_method ?? "").trim();
  const verifyMethodName = String(input.verifyMethodName || input.verify_method_name || getVerifyMethodName(verifyMethod)).trim() || "unknown";
  const rawLine = normalizeRawLine(input.rawLine || input.raw_line || [
    deviceEmployeeId,
    deviceTimestamp,
    attendanceStatus,
    verifyMethod,
  ].join("\t"));
  if (!rawLine) throw new Error("Falta linea cruda ATTLOG.");
  const computedKey = createBiometricIdempotencyKey({
    deviceSerial,
    deviceEmployeeId,
    deviceTimestamp,
    attendanceStatus,
    verifyMethod,
    rawLine,
  });
  const providedKey = String(input.idempotencyKey || input.idempotency_key || "").trim();
  if (providedKey && providedKey !== computedKey) throw new Error("Clave de idempotencia invalida.");
  return {
    localId: String(input.id || input.localId || "").trim(),
    deviceSerial,
    deviceEmployeeId,
    deviceTimestamp,
    attendanceStatus,
    verifyMethod,
    verifyMethodName,
    rawLine,
    idempotencyKey: providedKey || computedKey,
    receivedAt: String(input.receivedAt || input.received_at || "").trim(),
    data: sanitizeSyncData(input.data || {}),
  };
}

function createZktecoService(options = {}) {
  const config = options.config || loadZktecoConfig(process.env, options);
  let db = options.db || null;
  const logger = options.logger || console;

  function getDb() {
    if (!db) db = openDatabase(config.dbFile);
    return db;
  }

  function close() {
    if (db && typeof db.close === "function") db.close();
    db = null;
  }

  function updateDeviceStatus(serial, ip, endpoint, metadata = {}) {
    const now = new Date().toISOString();
    const safeMetadata = sanitizeMetadata(metadata);
    getDb().prepare(`
      INSERT INTO biometric_device_status (
        device_serial, last_seen_at, last_ip, last_endpoint, push_version,
        firmware, platform, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_serial) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        last_ip = excluded.last_ip,
        last_endpoint = excluded.last_endpoint,
        push_version = COALESCE(excluded.push_version, biometric_device_status.push_version),
        firmware = COALESCE(excluded.firmware, biometric_device_status.firmware),
        platform = COALESCE(excluded.platform, biometric_device_status.platform),
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      serial,
      now,
      ip || "",
      endpoint || "",
      safeMetadata.pushver || safeMetadata.PushVersion || "",
      safeMetadata.Firmware || safeMetadata.firmware || "",
      safeMetadata.Platform || safeMetadata.platform || "",
      JSON.stringify(safeMetadata),
      now
    );
  }

  function getActiveLink(deviceSerial, deviceEmployeeId) {
    return getDb().prepare(`
      SELECT * FROM biometric_staff_links
      WHERE device_serial = ? AND device_employee_id = ? AND active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(deviceSerial, String(deviceEmployeeId));
  }

  function saveAttlogPayload(deviceSerial, payload, context = {}) {
    const parsed = parseAttlogPayload(payload);
    const now = new Date().toISOString();
    const dbInstance = getDb();
    const inserted = [];
    const duplicates = [];
    const invalid = [];
    dbInstance.exec("BEGIN IMMEDIATE");
    try {
      const insert = dbInstance.prepare(`
        INSERT OR IGNORE INTO biometric_events (
          id, device_serial, device_employee_id, device_timestamp, received_at,
          attendance_status, verify_method, verify_method_name, raw_line, raw_payload,
          idempotency_key, processing_status, linked_staff_id, processing_error,
          data_json, created_at, processed_at, sync_status, sync_attempts,
          sync_last_error, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of parsed) {
        if (!item.ok) {
          invalid.push(item);
          logger.warn?.("[zkteco] linea ATTLOG invalida", sanitizeMetadata(item));
          continue;
        }
        const event = item.event;
        const link = getActiveLink(deviceSerial, event.deviceEmployeeId);
        const idempotencyKey = createBiometricIdempotencyKey({
          deviceSerial,
          deviceEmployeeId: event.deviceEmployeeId,
          deviceTimestamp: event.deviceTimestamp,
          attendanceStatus: event.attendanceStatus,
          verifyMethod: event.verifyMethod,
          rawLine: event.rawLine,
        });
        const id = `bio-${idempotencyKey.slice(0, 24)}`;
        const processingStatus = link ? "received" : "unlinked";
        const dataJson = JSON.stringify({
          extraColumns: event.extraColumns,
          timezone: config.timezone,
          remoteIp: context.remoteIp || "",
          stamp: context.stamp || "",
        });
        const result = insert.run(
          id,
          deviceSerial,
          event.deviceEmployeeId,
          event.deviceTimestamp,
          now,
          event.attendanceStatus,
          event.verifyMethod,
          event.verifyMethodName,
          event.rawLine,
          config.logRawPayloads ? String(payload || "") : "",
          idempotencyKey,
          processingStatus,
          link?.staff_id || "",
          "",
          dataJson,
          now,
          "",
          "pending",
          0,
          "",
          ""
        );
        if (result.changes) inserted.push({ id, ...event, linkedStaffId: link?.staff_id || "", processingStatus });
        else duplicates.push({ idempotencyKey, ...event });
      }
      dbInstance.exec("COMMIT");
    } catch (error) {
      dbInstance.exec("ROLLBACK");
      throw error;
    }
    return { inserted, duplicates, invalid, total: parsed.length };
  }

  function saveSyncedEvents(events = [], context = {}) {
    if (!Array.isArray(events)) {
      const error = new Error("El lote debe incluir events como array.");
      error.statusCode = 400;
      throw error;
    }
    const limit = clamp(Number(context.maxEvents || config.syncBatchSize || DEFAULT_CONFIG.syncBatchSize), 1, 500);
    if (events.length > limit) {
      const error = new Error(`El lote supera el maximo permitido de ${limit} eventos.`);
      error.statusCode = 400;
      throw error;
    }
    const now = new Date().toISOString();
    const dbInstance = getDb();
    const results = [];
    const accepted = [];
    const duplicates = [];
    const errors = [];
    const insert = dbInstance.prepare(`
      INSERT OR IGNORE INTO biometric_events (
        id, device_serial, device_employee_id, device_timestamp, received_at,
        attendance_status, verify_method, verify_method_name, raw_line, raw_payload,
        idempotency_key, processing_status, linked_staff_id, processing_error,
        data_json, created_at, processed_at, sync_status, sync_attempts,
        sync_last_error, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    dbInstance.exec("BEGIN IMMEDIATE");
    try {
      events.forEach((input, index) => {
        try {
          const event = normalizeBiometricSyncEvent(input, config);
          const link = getActiveLink(event.deviceSerial, event.deviceEmployeeId);
          const id = `bio-${event.idempotencyKey.slice(0, 24)}`;
          const processingStatus = link ? "received" : "unlinked";
          const dataJson = JSON.stringify({
            ...event.data,
            syncSource: sanitizeLogValue(context.source || ""),
            sourceSentAt: sanitizeLogValue(context.sentAt || ""),
            syncRemoteIp: sanitizeLogValue(context.remoteIp || ""),
            originalReceivedAt: sanitizeLogValue(event.receivedAt || ""),
          });
          const result = insert.run(
            id,
            event.deviceSerial,
            event.deviceEmployeeId,
            event.deviceTimestamp,
            now,
            event.attendanceStatus,
            event.verifyMethod,
            event.verifyMethodName,
            event.rawLine,
            "",
            event.idempotencyKey,
            processingStatus,
            link?.staff_id || "",
            "",
            dataJson,
            now,
            "",
            "synced",
            0,
            "",
            now
          );
          const row = {
            localId: event.localId,
            id,
            idempotencyKey: event.idempotencyKey,
            deviceSerial: event.deviceSerial,
            deviceEmployeeId: event.deviceEmployeeId,
            deviceTimestamp: event.deviceTimestamp,
          };
          if (result.changes) {
            const acceptedRow = { ...row, status: "accepted" };
            accepted.push(acceptedRow);
            results.push(acceptedRow);
          } else {
            const duplicateRow = { ...row, status: "duplicate" };
            duplicates.push(duplicateRow);
            results.push(duplicateRow);
          }
        } catch (error) {
          const errorRow = {
            localId: String(input?.id || input?.localId || "").trim(),
            idempotencyKey: String(input?.idempotencyKey || input?.idempotency_key || "").trim(),
            deviceSerial: sanitizeLogValue(input?.deviceSerial || input?.device_serial || ""),
            deviceEmployeeId: sanitizeLogValue(input?.deviceEmployeeId || input?.device_employee_id || ""),
            status: "error",
            error: truncateError(error.message),
            index,
          };
          errors.push(errorRow);
          results.push(errorRow);
        }
      });
      dbInstance.exec("COMMIT");
    } catch (error) {
      dbInstance.exec("ROLLBACK");
      throw error;
    }
    return { total: events.length, accepted, duplicates, errors, results };
  }

  function listEventsForSync(limit = config.syncBatchSize) {
    const cleanLimit = clamp(Number(limit || config.syncBatchSize || DEFAULT_CONFIG.syncBatchSize), 1, 500);
    return getDb().prepare(`
      SELECT * FROM biometric_events
      WHERE sync_status IN ('pending', 'error')
      ORDER BY received_at ASC, created_at ASC
      LIMIT ?
    `).all(cleanLimit).map(mapEventRow);
  }

  function markSyncResults(localEvents = [], remoteResults = [], batchError = "") {
    const events = Array.isArray(localEvents) ? localEvents : [];
    const results = Array.isArray(remoteResults) ? remoteResults : [];
    const byLocalId = new Map();
    const byKey = new Map();
    results.forEach((result) => {
      if (result?.localId) byLocalId.set(String(result.localId), result);
      if (result?.idempotencyKey) byKey.set(String(result.idempotencyKey), result);
    });
    const now = new Date().toISOString();
    const markSynced = getDb().prepare(`
      UPDATE biometric_events
      SET sync_status = 'synced', synced_at = ?, sync_last_error = ''
      WHERE id = ?
    `);
    const markError = getDb().prepare(`
      UPDATE biometric_events
      SET sync_status = 'error',
          sync_attempts = COALESCE(sync_attempts, 0) + 1,
          sync_last_error = ?
      WHERE id = ?
    `);
    const summary = { synced: 0, duplicates: 0, errors: 0 };
    getDb().exec("BEGIN IMMEDIATE");
    try {
      events.forEach((event) => {
        const remote = batchError ? null : (byLocalId.get(String(event.id)) || byKey.get(String(event.idempotencyKey)));
        if (remote?.status === "accepted" || remote?.status === "duplicate") {
          summary.synced += markSynced.run(now, event.id).changes || 0;
          if (remote.status === "duplicate") summary.duplicates += 1;
          return;
        }
        const message = batchError || remote?.error || "Respuesta de sync sin resultado para el evento.";
        summary.errors += markError.run(truncateError(message), event.id).changes || 0;
      });
      getDb().exec("COMMIT");
    } catch (error) {
      getDb().exec("ROLLBACK");
      throw error;
    }
    return summary;
  }

  function listEvents(filters = {}) {
    const limit = clamp(Number(filters.limit || 100), 1, 500);
    const params = [];
    const where = [];
    if (filters.deviceSerial) {
      where.push("device_serial = ?");
      params.push(String(filters.deviceSerial));
    }
    if (filters.deviceEmployeeId) {
      where.push("device_employee_id = ?");
      params.push(String(filters.deviceEmployeeId));
    }
    if (filters.staffId) {
      where.push("linked_staff_id = ?");
      params.push(String(filters.staffId));
    }
    if (filters.status) {
      where.push("processing_status = ?");
      params.push(String(filters.status));
    }
    if (filters.from) {
      where.push("device_timestamp >= ?");
      params.push(String(filters.from));
    }
    if (filters.to) {
      where.push("device_timestamp <= ?");
      params.push(String(filters.to));
    }
    params.push(limit);
    return getDb().prepare(`
      SELECT * FROM biometric_events
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY device_timestamp DESC, received_at DESC
      LIMIT ?
    `).all(...params).map(mapEventRow);
  }

  function listUnlinkedEvents(limit = 100) {
    return listEvents({ status: "unlinked", limit });
  }

  function listLinks() {
    return getDb().prepare(`
      SELECT * FROM biometric_staff_links
      ORDER BY active DESC, updated_at DESC
    `).all().map(mapLinkRow);
  }

  function upsertStaffLink(input = {}, staffList = []) {
    const deviceSerial = String(input.deviceSerial || "").trim();
    const deviceEmployeeId = String(input.deviceEmployeeId || "").trim();
    const staffId = String(input.staffId || "").trim();
    if (!deviceSerial) throw new Error("Falta el numero de serie del dispositivo.");
    if (!deviceEmployeeId) throw new Error("Falta el PIN/ID del empleado en el reloj.");
    if (!staffId) throw new Error("Seleccione un empleado del ERP.");
    const staff = staffList.find((item) => String(item.id) === staffId);
    if (!staff) throw new Error("El empleado seleccionado no existe.");
    const now = new Date().toISOString();
    const dbInstance = getDb();
    dbInstance.exec("BEGIN IMMEDIATE");
    try {
      dbInstance.prepare(`
        UPDATE biometric_staff_links
        SET active = 0, updated_at = ?
        WHERE device_serial = ? AND (device_employee_id = ? OR staff_id = ?) AND active = 1
      `).run(now, deviceSerial, deviceEmployeeId, staffId);
      const id = `bio-link-${crypto.randomUUID()}`;
      const dataJson = JSON.stringify({ staffName: staff.fullName || staff.name || "", notes: String(input.notes || "") });
      dbInstance.prepare(`
        INSERT INTO biometric_staff_links (
          id, device_serial, device_employee_id, staff_id, active, data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, deviceSerial, deviceEmployeeId, staffId, dataJson, now, now);
      dbInstance.prepare(`
        UPDATE biometric_events
        SET linked_staff_id = ?, processing_status = CASE WHEN processing_status = 'unlinked' THEN 'received' ELSE processing_status END,
            processing_error = ''
        WHERE device_serial = ? AND device_employee_id = ?
      `).run(staffId, deviceSerial, deviceEmployeeId);
      dbInstance.exec("COMMIT");
      return { id, deviceSerial, deviceEmployeeId, staffId, active: true, createdAt: now, updatedAt: now, data: JSON.parse(dataJson) };
    } catch (error) {
      dbInstance.exec("ROLLBACK");
      throw error;
    }
  }

  function deactivateStaffLink(input = {}) {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("Falta el vinculo a desactivar.");
    const now = new Date().toISOString();
    const previous = getDb().prepare("SELECT * FROM biometric_staff_links WHERE id = ?").get(id);
    if (!previous) throw new Error("No encontre el vinculo.");
    getDb().prepare("UPDATE biometric_staff_links SET active = 0, updated_at = ? WHERE id = ?").run(now, id);
    return mapLinkRow({ ...previous, active: 0, updated_at: now });
  }

  function markEventsProcessed(eventIds = [], status = "processed", error = "") {
    const ids = Array.from(new Set((Array.isArray(eventIds) ? eventIds : []).map(String).filter(Boolean)));
    if (!ids.length) return { updated: 0 };
    const now = new Date().toISOString();
    const update = getDb().prepare(`
      UPDATE biometric_events
      SET processing_status = ?, processing_error = ?, processed_at = ?
      WHERE id = ?
    `);
    let updated = 0;
    getDb().exec("BEGIN IMMEDIATE");
    try {
      ids.forEach((id) => {
        updated += update.run(status, error || "", status === "processed" ? now : "", id).changes || 0;
      });
      getDb().exec("COMMIT");
    } catch (err) {
      getDb().exec("ROLLBACK");
      throw err;
    }
    return { updated };
  }

  function getStatus() {
    const devices = getDb().prepare("SELECT * FROM biometric_device_status ORDER BY last_seen_at DESC").all().map(mapDeviceRow);
    const totals = getDb().prepare(`
      SELECT processing_status AS status, COUNT(*) AS count
      FROM biometric_events
      GROUP BY processing_status
    `).all();
    const syncTotals = getDb().prepare(`
      SELECT sync_status AS status, COUNT(*) AS count
      FROM biometric_events
      GROUP BY sync_status
    `).all();
    return {
      enabled: config.enabled,
      bindHost: config.bindHost,
      port: config.port,
      timezone: config.timezone,
      debounceSeconds: config.debounceSeconds,
      syncEnabled: config.syncEnabled,
      syncUrl: config.syncUrl ? safeUrlForStatus(config.syncUrl) : "",
      syncIntervalSeconds: config.syncIntervalSeconds,
      syncBatchSize: config.syncBatchSize,
      allowedIps: config.allowedIps,
      allowedSerials: config.allowedSerials,
      devices,
      totals: Object.fromEntries(totals.map((row) => [row.status || "unknown", row.count])),
      syncTotals: Object.fromEntries(syncTotals.map((row) => [row.status || "unknown", row.count])),
    };
  }

  return {
    config,
    getDb,
    close,
    updateDeviceStatus,
    saveAttlogPayload,
    saveSyncedEvents,
    listEvents,
    listEventsForSync,
    listUnlinkedEvents,
    listLinks,
    upsertStaffLink,
    deactivateStaffLink,
    markEventsProcessed,
    markSyncResults,
    getStatus,
  };
}

function createAdmsServer(options = {}) {
  const service = options.service || createZktecoService(options);
  const config = service.config;
  const logger = options.logger || console;
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const remoteIp = normalizeRemoteIp(request.socket?.remoteAddress || "");
      const serial = String(requestUrl.searchParams.get("SN") || "").trim();
      if (!isAllowed(remoteIp, config.allowedIps) || !isAllowed(serial, config.allowedSerials)) {
        logger.warn?.("[zkteco] acceso rechazado", { remoteIp, serial: sanitizeLogValue(serial), path: requestUrl.pathname });
        return sendText(response, "Forbidden\n", 403);
      }
      if (requestUrl.pathname !== "/iclock/cdata" && requestUrl.pathname !== "/iclock/getrequest") {
        return sendText(response, "Not Found\n", 404);
      }
      if (!serial) return sendText(response, "BAD SN\n", 400);
      if (request.method === "GET" && requestUrl.pathname === "/iclock/getrequest") {
        service.updateDeviceStatus(serial, remoteIp, "getrequest", Object.fromEntries(requestUrl.searchParams.entries()));
        return sendText(response, "OK\n");
      }
      if (request.method === "GET" && requestUrl.pathname === "/iclock/cdata") {
        service.updateDeviceStatus(serial, remoteIp, "cdata", Object.fromEntries(requestUrl.searchParams.entries()));
        return sendText(response, buildCdataOptionsResponse(serial));
      }
      if (request.method === "POST" && requestUrl.pathname === "/iclock/cdata") {
        const table = String(requestUrl.searchParams.get("table") || "").toUpperCase();
        const rawBody = await readRawBody(request, config.maxBodyBytes, config.bodyTimeoutMs);
        service.updateDeviceStatus(serial, remoteIp, `cdata:${table || "unknown"}`, {
          ...Object.fromEntries(requestUrl.searchParams.entries()),
          bytes: Buffer.byteLength(rawBody),
        });
        if (table === "ATTLOG") {
          service.saveAttlogPayload(serial, rawBody, { remoteIp, stamp: requestUrl.searchParams.get("Stamp") || "" });
          return sendText(response, "OK\n");
        }
        if (table === "OPTIONS") {
          logger.info?.("[zkteco] opciones recibidas", sanitizeMetadata(parseOptionsPayload(rawBody)));
          return sendText(response, "OK\n");
        }
        if (table === "OPERLOG") {
          logger.info?.("[zkteco] operlog recibido", { serial: sanitizeLogValue(serial), remoteIp, bytes: Buffer.byteLength(rawBody) });
          return sendText(response, "OK\n");
        }
        return sendText(response, "OK\n");
      }
      return sendText(response, "Method Not Allowed\n", 405);
    } catch (error) {
      logger.error?.("[zkteco] error receptor", { message: error.message });
      const status = error.code === "BODY_TOO_LARGE" ? 413 : 500;
      return sendText(response, status === 413 ? "PAYLOAD TOO LARGE\n" : "ERROR\n", status);
    }
  });
}

async function handleBiometricSyncRequest(request, response, options = {}) {
  const service = options.service || createZktecoService(options);
  const config = options.config || service.config || DEFAULT_CONFIG;
  const logger = options.logger || console;
  const remoteIp = normalizeRemoteIp(request.socket?.remoteAddress || "");
  try {
    if (request.method !== "POST") {
      return sendJsonResponse(response, { ok: false, error: "Metodo no permitido." }, 405);
    }
    if (!config.syncEnabled) {
      return sendJsonResponse(response, { ok: false, error: "Sincronizacion ZKTeco deshabilitada." }, 403);
    }
    if (!config.syncToken) {
      logger.warn?.("[zkteco-sync] token no configurado", { remoteIp });
      return sendJsonResponse(response, { ok: false, error: "Token de sincronizacion no configurado." }, 403);
    }
    const token = getSyncTokenFromRequest(request);
    if (!token) {
      logger.warn?.("[zkteco-sync] acceso rechazado", { remoteIp, reason: "missing_token" });
      return sendJsonResponse(response, { ok: false, error: "Token requerido." }, 401);
    }
    if (!safeCompareToken(token, config.syncToken)) {
      logger.warn?.("[zkteco-sync] acceso rechazado", { remoteIp, reason: "invalid_token" });
      return sendJsonResponse(response, { ok: false, error: "Token invalido." }, 403);
    }
    const rawBody = await readRawBody(request, config.maxBodyBytes, config.bodyTimeoutMs);
    let payload = null;
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch (error) {
      return sendJsonResponse(response, { ok: false, error: "JSON invalido." }, 400);
    }
    if (!Array.isArray(payload.events)) {
      return sendJsonResponse(response, { ok: false, error: "El lote debe incluir events como array." }, 400);
    }
    const result = service.saveSyncedEvents(payload.events, {
      source: payload.source || "",
      sentAt: payload.sentAt || "",
      remoteIp,
      maxEvents: config.syncBatchSize,
    });
    return sendJsonResponse(response, { ok: true, ...result });
  } catch (error) {
    const status = error.code === "BODY_TOO_LARGE" ? 413 : (error.statusCode || 500);
    if (status >= 500) logger.error?.("[zkteco-sync] error receptor", { remoteIp, message: error.message });
    return sendJsonResponse(response, { ok: false, error: status === 413 ? "Lote demasiado grande." : error.message }, status);
  }
}

async function syncPendingEventsOnce(options = {}) {
  const service = options.service || createZktecoService(options);
  const config = options.config || service.config || DEFAULT_CONFIG;
  const logger = options.logger || console;
  if (!config.syncEnabled) return { sent: 0, synced: 0, duplicates: 0, errors: 0, skipped: true };
  if (!config.syncUrl || !config.syncToken) {
    throw new Error("Sync ZKTeco activo sin URL o token.");
  }
  const events = service.listEventsForSync(config.syncBatchSize);
  if (!events.length) return { sent: 0, synced: 0, duplicates: 0, errors: 0 };
  const payload = {
    source: "gratitud-local-zkteco",
    sentAt: new Date().toISOString(),
    events: events.map(eventToSyncPayload),
  };
  try {
    const response = await postJson(config.syncUrl, payload, {
      token: config.syncToken,
      timeoutMs: config.syncRequestTimeoutMs,
    });
    if (!response.ok) {
      const message = response.body?.error || `HTTP ${response.statusCode}`;
      const marked = service.markSyncResults(events, [], message);
      return { sent: events.length, synced: 0, duplicates: 0, errors: marked.errors, error: truncateError(message) };
    }
    const remoteResults = Array.isArray(response.body?.results) ? response.body.results : [];
    const marked = service.markSyncResults(events, remoteResults);
    return {
      sent: events.length,
      synced: marked.synced,
      duplicates: marked.duplicates,
      errors: marked.errors,
    };
  } catch (error) {
    const marked = service.markSyncResults(events, [], error.message);
    logger.warn?.("[zkteco-sync] produccion no disponible", { message: truncateError(error.message), events: events.length });
    return { sent: events.length, synced: 0, duplicates: 0, errors: marked.errors, error: truncateError(error.message) };
  }
}

function createZktecoSyncWorker(options = {}) {
  const service = options.service || createZktecoService(options);
  const config = options.config || service.config || DEFAULT_CONFIG;
  const logger = options.logger || console;
  let timer = null;
  let running = false;

  async function runOnce() {
    if (running) return { sent: 0, synced: 0, duplicates: 0, errors: 0, skipped: true };
    running = true;
    try {
      const summary = await syncPendingEventsOnce({ service, config, logger });
      if (summary.sent || summary.errors) {
        logger.info?.("[zkteco-sync] resumen", {
          enviados: summary.sent,
          sincronizados: summary.synced,
          duplicados: summary.duplicates,
          errores: summary.errors,
        });
      }
      return summary;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || !config.syncEnabled) return;
    runOnce().catch((error) => logger.warn?.("[zkteco-sync] error inicial", { message: truncateError(error.message) }));
    timer = setInterval(() => {
      runOnce().catch((error) => logger.warn?.("[zkteco-sync] error", { message: truncateError(error.message) }));
    }, Math.max(1, Number(config.syncIntervalSeconds || DEFAULT_CONFIG.syncIntervalSeconds)) * 1000);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop, runOnce };
}

function readRawBody(request, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let settled = false;
    const chunks = [];
    const timer = setTimeout(() => {
      settled = true;
      request.destroy();
      reject(new Error("Timeout leyendo body ZKTeco."));
    }, timeoutMs);
    request.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        clearTimeout(timer);
        const error = new Error("Body ZKTeco demasiado grande.");
        error.code = "BODY_TOO_LARGE";
        request.pause();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function buildCdataOptionsResponse(serial) {
  return [
    `GET OPTION FROM: ${serial}`,
    "Stamp=9999",
    "OpStamp=9999",
    "ErrorDelay=60",
    "Delay=10",
    "TransInterval=1",
    "TransFlag=1111000000",
    "TimeZone=-3",
    "Realtime=1",
    "Encrypt=0",
    "",
  ].join("\n");
}

function parseOptionsPayload(payload) {
  const result = {};
  String(payload || "").split(/\r?\n|,/).forEach((part) => {
    const [key, ...rest] = part.split("=");
    const cleanKey = String(key || "").trim();
    if (cleanKey) result[cleanKey] = rest.join("=").trim();
  });
  return result;
}

function isAllowed(value, allowlist = []) {
  if (!Array.isArray(allowlist) || !allowlist.length) return true;
  return allowlist.includes(value);
}

function normalizeRemoteIp(ip) {
  return String(ip || "").replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
}

function sendText(response, body, status = 200) {
  if (response.headersSent) return;
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendJsonResponse(response, body, status = 200) {
  if (response.headersSent) return;
  const text = JSON.stringify(body || {});
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text),
  });
  response.end(text);
}

function getSyncTokenFromRequest(request) {
  const auth = String(request.headers?.authorization || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const header = request.headers?.["x-zkteco-sync-token"];
  return String(Array.isArray(header) ? header[0] : header || "").trim();
}

function safeCompareToken(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (!providedBuffer.length || !expectedBuffer.length || providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function eventToSyncPayload(event = {}) {
  return {
    id: event.id,
    deviceSerial: event.deviceSerial,
    deviceEmployeeId: event.deviceEmployeeId,
    deviceTimestamp: event.deviceTimestamp,
    attendanceStatus: event.attendanceStatus,
    verifyMethod: event.verifyMethod,
    verifyMethodName: event.verifyMethodName,
    rawLine: event.rawLine,
    idempotencyKey: event.idempotencyKey,
    receivedAt: event.receivedAt,
    data: {
      ...sanitizeSyncData(event.data || {}),
      source: "local-adms",
    },
  };
}

function postJson(targetUrl, payload, options = {}) {
  const url = new URL(targetUrl);
  const transport = url.protocol === "https:" ? https : http;
  const body = JSON.stringify(payload || {});
  return new Promise((resolve, reject) => {
    const request = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search || ""}`,
      timeout: options.timeoutMs || DEFAULT_CONFIG.syncRequestTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${options.token || ""}`,
        "User-Agent": "gratitud-zkteco-sync/1.0",
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        const parsed = parseJsonSafe(text, null);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          body: parsed || { raw: text.slice(0, 200) },
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Timeout de sincronizacion ZKTeco."));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function sanitizeLogValue(value) {
  return String(value || "").replace(/[^\w.:-]/g, "").slice(0, 80);
}

function sanitizeMetadata(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    const cleanKey = sanitizeLogValue(key);
    if (!cleanKey) continue;
    output[cleanKey] = sanitizeLogValue(value);
  }
  return output;
}

function sanitizeSyncData(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    const cleanKey = sanitizeLogValue(key);
    if (!cleanKey || /token|password|secret|template|finger|face|photo|huella|foto/i.test(cleanKey)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      output[cleanKey] = JSON.stringify(value).slice(0, 240);
    } else {
      output[cleanKey] = String(value).slice(0, 240);
    }
  }
  return output;
}

function truncateError(message) {
  return String(message || "Error").replace(/\s+/g, " ").slice(0, 240);
}

function safeUrlForStatus(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (error) {
    return "";
  }
}

function mapEventRow(row = {}) {
  return {
    id: row.id,
    deviceSerial: row.device_serial,
    deviceEmployeeId: row.device_employee_id,
    deviceTimestamp: row.device_timestamp,
    receivedAt: row.received_at,
    attendanceStatus: row.attendance_status,
    verifyMethod: row.verify_method,
    verifyMethodName: row.verify_method_name,
    rawLine: row.raw_line,
    idempotencyKey: row.idempotency_key,
    processingStatus: row.processing_status,
    linkedStaffId: row.linked_staff_id || "",
    processingError: row.processing_error || "",
    data: parseJsonSafe(row.data_json, {}),
    createdAt: row.created_at,
    processedAt: row.processed_at || "",
    syncStatus: row.sync_status || "pending",
    syncAttempts: Number(row.sync_attempts || 0),
    syncLastError: row.sync_last_error || "",
    syncedAt: row.synced_at || "",
  };
}

function mapLinkRow(row = {}) {
  return {
    id: row.id,
    deviceSerial: row.device_serial,
    deviceEmployeeId: row.device_employee_id,
    staffId: row.staff_id,
    active: Number(row.active || 0) === 1,
    data: parseJsonSafe(row.data_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeviceRow(row = {}) {
  return {
    deviceSerial: row.device_serial,
    lastSeenAt: row.last_seen_at,
    lastIp: row.last_ip,
    lastEndpoint: row.last_endpoint,
    pushVersion: row.push_version,
    firmware: row.firmware,
    platform: row.platform,
    data: parseJsonSafe(row.data_json, {}),
    updatedAt: row.updated_at,
  };
}

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function buildAttendanceShiftsFromBiometricEvents(options = {}) {
  const events = Array.isArray(options.events) ? options.events : [];
  const staffList = Array.isArray(options.staff) ? options.staff : [];
  const existingShifts = Array.isArray(options.existingShifts) ? options.existingShifts : [];
  const debounceSeconds = Number(options.debounceSeconds || DEFAULT_CONFIG.debounceSeconds);
  const byStaffDate = new Map();
  const skipped = [];
  for (const event of events) {
    if (!event.linkedStaffId) {
      skipped.push({ eventId: event.id, reason: "UNLINKED" });
      continue;
    }
    const staff = staffList.find((item) => String(item.id) === String(event.linkedStaffId));
    if (!staff) {
      skipped.push({ eventId: event.id, reason: "STAFF_NOT_FOUND" });
      continue;
    }
    const operationalDate = getOperationalDate(event.deviceTimestamp);
    const key = `${event.linkedStaffId}|${operationalDate}`;
    if (!byStaffDate.has(key)) byStaffDate.set(key, { staff, date: operationalDate, events: [] });
    byStaffDate.get(key).events.push(event);
  }

  const shifts = [];
  const processedEventIds = [];
  for (const group of byStaffDate.values()) {
    const ordered = group.events
      .slice()
      .sort((a, b) => String(a.deviceTimestamp).localeCompare(String(b.deviceTimestamp)));
    const debounced = [];
    for (const event of ordered) {
      const previous = debounced[debounced.length - 1];
      if (previous && secondsBetweenDeviceTimestamps(previous.deviceTimestamp, event.deviceTimestamp) <= debounceSeconds) {
        skipped.push({ eventId: event.id, reason: "DEBOUNCE" });
        continue;
      }
      debounced.push(event);
    }
    if (!debounced.length) continue;
    const manualConflict = existingShifts.find((shift) =>
      shift.staffId === group.staff.id &&
      shift.date === group.date &&
      shift.source &&
      shift.source !== "zkteco"
    );
    if (manualConflict) {
      debounced.forEach((event) => skipped.push({ eventId: event.id, reason: "MANUAL_SHIFT_EXISTS" }));
      continue;
    }
    const first = debounced[0];
    const last = debounced.length > 1 ? debounced[debounced.length - 1] : null;
    const startTime = getTimeFromDeviceTimestamp(first.deviceTimestamp);
    const endTime = last ? getTimeFromDeviceTimestamp(last.deviceTimestamp) : "";
    const id = `asistencia-zkteco-${group.staff.id}-${group.date}`;
    const hours = last ? Math.max(0, roundHours(secondsBetweenDeviceTimestamps(first.deviceTimestamp, last.deviceTimestamp) / 3600)) : 0;
    shifts.push({
      id,
      staffId: group.staff.id,
      staffName: group.staff.fullName || group.staff.name || "",
      eventId: "",
      eventName: "Control horario biometrico",
      date: group.date,
      role: group.staff.role || "",
      startTime,
      endTime,
      hours,
      hourlyRate: Number(group.staff.hourlyRate || 0),
      extrasAmount: 0,
      attendanceStatus: last ? "present" : "observed",
      notes: last ? "ZKTeco MB20-VL" : "ZKTeco MB20-VL | Marcacion sin salida",
      source: "zkteco",
      period: group.date.slice(0, 7),
      breakMinutes: 0,
      loadedBy: "zkteco",
      biometricEventIds: debounced.map((event) => event.id),
    });
    processedEventIds.push(...debounced.map((event) => event.id));
  }
  return { shifts, processedEventIds, skipped };
}

function getOperationalDate(deviceTimestamp) {
  const [date, time] = String(deviceTimestamp || "").split(" ");
  if (!date || !time) return date || "";
  const hour = Number(time.slice(0, 2));
  if (hour >= 0 && hour < 6) return addDays(date, -1);
  return date;
}

function getTimeFromDeviceTimestamp(deviceTimestamp) {
  return String(deviceTimestamp || "").split(" ")[1]?.slice(0, 5) || "";
}

function secondsBetweenDeviceTimestamps(a, b) {
  return Math.abs(deviceTimestampToLocalMs(b) - deviceTimestampToLocalMs(a)) / 1000;
}

function deviceTimestampToLocalMs(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime();
}

function addDays(date, amount) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  parsed.setDate(parsed.getDate() + amount);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = {
  DEFAULT_CONFIG,
  VERIFY_METHOD_NAMES,
  buildAttendanceShiftsFromBiometricEvents,
  buildCdataOptionsResponse,
  createAdmsServer,
  createBiometricIdempotencyKey,
  createZktecoSyncWorker,
  createZktecoService,
  ensureZktecoSchema,
  getOperationalDate,
  getVerifyMethodName,
  handleBiometricSyncRequest,
  loadZktecoConfig,
  normalizeBiometricSyncEvent,
  normalizeDeviceTimestamp,
  parseAttlogLine,
  parseAttlogPayload,
  parseOptionsPayload,
  safeCompareToken,
  syncPendingEventsOnce,
  validateZktecoConfig,
};
