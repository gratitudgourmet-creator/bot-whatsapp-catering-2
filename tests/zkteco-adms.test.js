"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildAttendanceShiftsFromBiometricEvents,
  createAdmsServer,
  createBiometricIdempotencyKey,
  createZktecoService,
  getOperationalDate,
  loadZktecoConfig,
  normalizeDeviceTimestamp,
  parseAttlogLine,
  parseAttlogPayload,
} = require("../lib/zkteco-adms");

const FIXTURE = "2\t2026-07-20 16:33:44\t255\t15\t0\t0\t0\t0\t0\t0\n";

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zkteco-adms-"));
  return path.join(dir, "test.sqlite");
}

function makeService(overrides = {}) {
  return createZktecoService({
    config: {
      enabled: true,
      bindHost: "127.0.0.1",
      port: 0,
      allowedIps: [],
      allowedSerials: ["CO8G230760214"],
      timezone: "America/Argentina/Buenos_Aires",
      debounceSeconds: 180,
      logRawPayloads: true,
      maxBodyBytes: 1024,
      bodyTimeoutMs: 2000,
      dbFile: tempDb(),
      ...overrides,
    },
    logger: { info() {}, warn() {}, error() {} },
  });
}

function request(server, method, pathname, body = "") {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: body ? { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) } : {},
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: text }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("parsea ATTLOG facial real", () => {
  const event = parseAttlogLine(FIXTURE);
  assert.equal(event.deviceEmployeeId, "2");
  assert.equal(event.deviceTimestamp, "2026-07-20 16:33:44");
  assert.equal(event.attendanceStatus, "255");
  assert.equal(event.verifyMethod, "15");
  assert.equal(event.verifyMethodName, "face");
  assert.equal(event.extraColumns.length, 6);
});

test("parsea multiples lineas con LF y CRLF", () => {
  const result = parseAttlogPayload(`${FIXTURE}\r\n3\t2026-07-20 16:34:44\t0\t99\t0\n`);
  assert.equal(result.length, 2);
  assert.equal(result[0].ok, true);
  assert.equal(result[1].event.verifyMethodName, "unknown");
});

test("detecta linea incompleta y fecha invalida sin abortar lote", () => {
  const result = parseAttlogPayload("2\t2026-07-20\n4\t2026-99-20 16:33:44\t255\t15\n");
  assert.equal(result.length, 2);
  assert.equal(result[0].ok, false);
  assert.equal(result[1].ok, false);
  assert.throws(() => normalizeDeviceTimestamp("2026-99-20 16:33:44"));
});

test("calcula idempotencia estable", () => {
  const event = parseAttlogLine(FIXTURE);
  const one = createBiometricIdempotencyKey({ deviceSerial: "CO8G230760214", ...event });
  const two = createBiometricIdempotencyKey({ deviceSerial: "CO8G230760214", ...event });
  assert.equal(one, two);
  assert.equal(one.length, 64);
});

test("guarda ATTLOG en SQLite y no duplica reintentos", () => {
  const service = makeService();
  try {
    const first = service.saveAttlogPayload("CO8G230760214", FIXTURE, { remoteIp: "127.0.0.1" });
    const second = service.saveAttlogPayload("CO8G230760214", FIXTURE, { remoteIp: "127.0.0.1" });
    assert.equal(first.inserted.length, 1);
    assert.equal(second.inserted.length, 0);
    assert.equal(second.duplicates.length, 1);
    assert.equal(service.listEvents({ limit: 10 }).length, 1);
  } finally {
    service.close();
  }
});

test("vincula PIN con empleado y reprocesa evento previo", () => {
  const service = makeService();
  try {
    service.saveAttlogPayload("CO8G230760214", FIXTURE, {});
    const link = service.upsertStaffLink({ deviceSerial: "CO8G230760214", deviceEmployeeId: "2", staffId: "staff-1" }, [{ id: "staff-1", fullName: "Joaquin", role: "Cocina" }]);
    assert.equal(link.staffId, "staff-1");
    const events = service.listEvents({ limit: 10 });
    assert.equal(events[0].linkedStaffId, "staff-1");
    assert.equal(events[0].processingStatus, "received");
  } finally {
    service.close();
  }
});

test("crea asistencia diurna y filtra rebote", () => {
  const staff = [{ id: "staff-1", fullName: "Joaquin", role: "Cocina", hourlyRate: 1000 }];
  const events = [
    { id: "e1", linkedStaffId: "staff-1", deviceTimestamp: "2026-07-20 08:00:00" },
    { id: "e2", linkedStaffId: "staff-1", deviceTimestamp: "2026-07-20 08:01:00" },
    { id: "e3", linkedStaffId: "staff-1", deviceTimestamp: "2026-07-20 16:00:00" },
  ];
  const result = buildAttendanceShiftsFromBiometricEvents({ events, staff, existingShifts: [], debounceSeconds: 180 });
  assert.equal(result.shifts.length, 1);
  assert.equal(result.shifts[0].startTime, "08:00");
  assert.equal(result.shifts[0].endTime, "16:00");
  assert.equal(result.shifts[0].hours, 8);
  assert.equal(result.skipped[0].reason, "DEBOUNCE");
});

test("asocia madrugada a dia operativo anterior", () => {
  assert.equal(getOperationalDate("2026-07-21 02:00:00"), "2026-07-20");
});

test("respeta conflicto con asistencia manual", () => {
  const result = buildAttendanceShiftsFromBiometricEvents({
    events: [{ id: "e1", linkedStaffId: "staff-1", deviceTimestamp: "2026-07-20 08:00:00" }],
    staff: [{ id: "staff-1", fullName: "Joaquin" }],
    existingShifts: [{ id: "manual", staffId: "staff-1", date: "2026-07-20", source: "timesheet" }],
  });
  assert.equal(result.shifts.length, 0);
  assert.equal(result.skipped[0].reason, "MANUAL_SHIFT_EXISTS");
});

test("receptor HTTP responde getrequest, options, ATTLOG y allowlist", async () => {
  const service = makeService({ allowedIps: ["127.0.0.1"], maxBodyBytes: 128 });
  const server = createAdmsServer({ service, logger: { info() {}, warn() {}, error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const getrequest = await request(server, "GET", "/iclock/getrequest?SN=CO8G230760214");
    assert.equal(getrequest.status, 200);
    assert.match(getrequest.body, /OK/);
    const options = await request(server, "POST", "/iclock/cdata?SN=CO8G230760214&table=options", "Firmware=ZMM510-NF-Ver1.0.21\n");
    assert.equal(options.status, 200);
    const attlog = await request(server, "POST", "/iclock/cdata?SN=CO8G230760214&table=ATTLOG&Stamp=9999", FIXTURE);
    assert.equal(attlog.status, 200);
    const operlog = await request(server, "POST", "/iclock/cdata?SN=CO8G230760214&table=OPERLOG&OpStamp=9999", "USER PIN=2\n");
    assert.equal(operlog.status, 200);
    assert.equal(service.listEvents({ limit: 10 }).length, 1);
    const forbidden = await request(server, "GET", "/iclock/getrequest?SN=OTRO");
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
  }
});

test("receptor HTTP mantiene idempotencia con duplicado concurrente", async () => {
  const service = makeService({ allowedIps: ["127.0.0.1"], maxBodyBytes: 256 });
  const server = createAdmsServer({ service, logger: { info() {}, warn() {}, error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const pathName = "/iclock/cdata?SN=CO8G230760214&table=ATTLOG&Stamp=9999";
    const [one, two] = await Promise.all([
      request(server, "POST", pathName, FIXTURE),
      request(server, "POST", pathName, FIXTURE),
    ]);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.equal(service.listEvents({ limit: 10 }).length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
  }
});

test("rechaza body demasiado grande", async () => {
  const service = makeService({ allowedIps: ["127.0.0.1"], maxBodyBytes: 20 });
  const server = createAdmsServer({ service, logger: { info() {}, warn() {}, error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await request(server, "POST", "/iclock/cdata?SN=CO8G230760214&table=ATTLOG", FIXTURE);
    assert.equal(result.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
  }
});

test("valida configuracion y zona horaria de Mendoza", () => {
  const config = loadZktecoConfig({
    ZKTECO_ENABLED: "true",
    ZKTECO_PORT: "8080",
    ZKTECO_TIMEZONE: "America/Argentina/Buenos_Aires",
    ZKTECO_ALLOWED_IPS: "192.168.1.201",
    ZKTECO_ALLOWED_SERIALS: "CO8G230760214",
  }, { dataDir: os.tmpdir(), baseDir: process.cwd() });
  assert.equal(config.enabled, true);
  assert.equal(config.timezone, "America/Argentina/Buenos_Aires");
  assert.deepEqual(config.allowedIps, ["192.168.1.201"]);
});
