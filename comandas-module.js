// comandas-module.js — Sistema de Comandas · Gratitud Gourmet
// Rutas: /gestion-comandas (panel interno) · /gestion-comandas/pedidos (público)
'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Base de datos ────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(process.env.COMANDAS_DATA_DIR || process.env.DATA_DIR || __dirname);
const DB_FILE = path.resolve(process.env.COMANDAS_DB_FILE || path.join(DATA_DIR, 'comandas-db.json'));
const PRINT_TOKEN = process.env.COMANDAS_PRINT_TOKEN || '';

const DB_DEFAULT = {
  menu:             { categorias: [], productos: [] },
  tickets:          [],
  ventas:           [],
  pedidosPendientes: [],
  printQueue:       [], // { id, estacion, ticket, datosNegocio, impreso, createdAt }
  config: {
    negocio:    { nombre: 'Gratitud Gourmet', direccion: '', cuit: '', telefono: '', mensajePie: '¡Gracias por tu visita!', logoBase64: '' },
    estaciones: { cocina: { tipo: 'pantalla', url: '' }, barra: { tipo: 'pantalla', url: '' }, postres: { tipo: 'pantalla', url: '' } },
    publicUrl:  '',
    mesas:      14,
  },
};

let _db = null;

function dbLoad() {
  if (_db) return _db;
  try {
    if (fs.existsSync(DB_FILE)) {
      _db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      _db.menu              = _db.menu              || DB_DEFAULT.menu;
      _db.tickets           = _db.tickets           || [];
      _db.ventas            = _db.ventas            || [];
      _db.pedidosPendientes = _db.pedidosPendientes || [];
      _db.printQueue        = _db.printQueue        || [];
      _db.config            = Object.assign({}, DB_DEFAULT.config, _db.config);
      _db.config.negocio    = Object.assign({}, DB_DEFAULT.config.negocio,    _db.config.negocio    || {});
      _db.config.estaciones = Object.assign({}, DB_DEFAULT.config.estaciones, _db.config.estaciones || {});
    } else {
      _db = JSON.parse(JSON.stringify(DB_DEFAULT));
      dbSave();
    }
  } catch { _db = JSON.parse(JSON.stringify(DB_DEFAULT)); }
  return _db;
}

function dbSave() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2));
  }
  catch (e) { console.error('[Comandas] Error guardando DB:', e.message); }
}

// ── WebSocket (ws) ───────────────────────────────────────────────────────────
let _wss = null;

function setupWebSocket(server, options = {}) {
  try {
    const { WebSocketServer, OPEN } = require('ws');
    const authorize = typeof options.authorize === 'function' ? options.authorize : null;
    _wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/gestion-comandas/ws') {
        if (authorize && !authorize(req)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        _wss.handleUpgrade(req, socket, head, ws => _wss.emit('connection', ws, req));
      }
    });
    _wss._OPEN = OPEN;
    console.log('[Comandas] WebSocket listo en /gestion-comandas/ws');
  } catch (e) {
    console.warn('[Comandas] ws no disponible:', e.message);
  }
}

function broadcast(event, data) {
  if (!_wss) return;
  const msg = JSON.stringify({ event, data });
  _wss.clients.forEach(c => { if (c.readyState === (_wss._OPEN || 1)) c.send(msg); });
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function isPrintRequestAuthorized(req) {
  return Boolean(PRINT_TOKEN && req.headers['x-comandas-print-token'] === PRINT_TOKEN);
}

// ── Impresión — encola trabajos para que el agente local los reclame ─────────
function dispararImpresion(ticket) {
  const db = dbLoad();
  const datosNegocio = db.config.negocio || {};
  const logoBase64   = datosNegocio.logoBase64 || '';
  let encolado = false;

  Object.entries(db.config.estaciones || {}).forEach(([estacion, cfg]) => {
    if (cfg.tipo !== 'impresora') return;
    const items = (ticket.items || []).filter(i => (i.estacion || 'cocina') === estacion);
    if (!items.length) return;
    db.printQueue.push({
      id:          `${ticket.id}-${estacion}-${Date.now()}`,
      estacion,
      ticket:      { ...ticket, items },
      datosNegocio,
      logoBase64,
      impreso:     false,
      createdAt:   Date.now(),
    });
    encolado = true;
  });

  if (encolado) {
    // Limpiar trabajos de más de 24 h para que la cola no crezca indefinidamente
    const corte = Date.now() - 86400000;
    db.printQueue = db.printQueue.filter(j => j.createdAt > corte);
    dbSave();
    console.log(`[Comandas] ${ticket.items?.length} items encolados para impresión (ticket #${ticket.id})`);
  }
}

// ── MercadoPago ──────────────────────────────────────────────────────────────
async function crearPreferenciaMp(pedidoId, items, publicUrl) {
  const { MercadoPagoConfig, Preference } = require('mercadopago');
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const pref = new Preference(client);
  const result = await pref.create({ body: {
    external_reference: pedidoId,
    items: items.map(i => ({ title: String(i.nombre), quantity: Number(i.qty) || 1, unit_price: Number(i.precio) || 0, currency_id: 'ARS' })),
    back_urls: {
      success: `${publicUrl}/gestion-comandas/pedidos/pago-ok`,
      failure: `${publicUrl}/gestion-comandas/pedidos`,
      pending: `${publicUrl}/gestion-comandas/pedidos/pago-pendiente`,
    },
    notification_url: `${publicUrl}/gestion-comandas/api/mp-webhook`,
  }});
  return result.init_point;
}

// ── QR ───────────────────────────────────────────────────────────────────────
async function generarQR(url) {
  const qrcode = require('qrcode');
  return qrcode.toBuffer(url, { type: 'png', width: 400, margin: 2 });
}

// ════════════════════════════════════════════════════════════════════════════
// HTML — Panel interno
// ════════════════════════════════════════════════════════════════════════════
function panelHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comandas · Gratitud Gourmet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f0e0c;--bg1:#1a1917;--bg2:#242220;--bg3:#2e2b28;
  --line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.15);
  --text:#f2ede8;--sub:#9e9891;--muted:#5e5a55;
  --accent:#ff6b35;--accent-d:#e85c28;--accent-l:rgba(255,107,53,.12);
  --ok:#4ade80;--ok-d:rgba(74,222,128,.12);
  --warn:#fbbf24;--warn-d:rgba(251,191,36,.12);
  --danger:#f87171;--danger-d:rgba(248,113,113,.12);
  --cocina:#fbbf24;--barra:#60a5fa;--postres:#f472b6;
  --r:10px;--r-lg:16px;
  --ft:'Bebas Neue','Arial Black',Impact,sans-serif;
  --f:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --mono:'Space Mono','Courier New',Courier,monospace;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--f);font-size:14px;-webkit-font-smoothing:antialiased}
button{cursor:pointer;font-family:var(--f)}
input,select,textarea{font-family:var(--f)}

/* Layout */
#app{display:grid;grid-template-rows:52px 1fr;height:100vh;overflow:hidden}
#nav{background:var(--bg1);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:2px;padding:0 12px;overflow-x:auto;scrollbar-width:none}
#nav::-webkit-scrollbar{display:none}
.nav-logo{font-family:var(--ft);font-size:21px;color:var(--accent);letter-spacing:2px;margin-right:12px;flex-shrink:0}
.nav-tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--sub);font-size:13px;font-weight:500;padding:0 12px;height:52px;white-space:nowrap;transition:color .15s,border-color .15s}
.nav-tab:hover{color:var(--text)}
.nav-tab.active{border-bottom-color:var(--accent);color:var(--text)}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-shrink:0;padding-left:12px}
#ws-dot{width:8px;height:8px;border-radius:50%;background:var(--danger);flex-shrink:0;transition:background .3s}
#ws-dot.ok{background:var(--ok);animation:pulse-ok 2s infinite}
@keyframes pulse-ok{0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.4)}50%{box-shadow:0 0 0 4px rgba(74,222,128,0)}}
#nav-clock{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.03em}
#nav-disp{font-size:11px;color:var(--muted);background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:2px 10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#content{overflow:hidden}
.view{display:none;height:100%;overflow:auto}
.view.active{display:flex;flex-direction:column}

/* ─── MOZO ─── */
#view-mozo{flex-direction:row!important}
#mozo-main{flex:1;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
#mozo-main h2{font-family:var(--ft);font-size:28px;color:var(--accent);letter-spacing:2px}
#mesas-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px}
.mesa-btn{aspect-ratio:1;border-radius:var(--r);border:2px solid var(--line);background:var(--bg2);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:border-color .15s,background .15s,transform .1s}
.mesa-btn:hover{border-color:var(--accent);background:var(--accent-l);transform:scale(1.03)}
.mesa-btn.ocupada{border-color:var(--accent);background:var(--accent-l)}
.mesa-num{font-family:var(--ft);font-size:30px;letter-spacing:1px;line-height:1}
.mesa-total{font-family:var(--mono);font-size:10px;color:var(--accent)}
.mesa-tiempo{font-size:9px;color:var(--muted)}
#mozo-sidebar{width:320px;background:var(--bg1);border-left:1px solid var(--line);display:flex;flex-direction:column;flex-shrink:0}
#mozo-sidebar-head{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:8px}
#mozo-mesa-label{font-family:var(--ft);font-size:22px;letter-spacing:1px;color:var(--accent)}
.btn-sm-ghost{background:var(--bg2);border:1px solid var(--line);border-radius:6px;color:var(--sub);font-size:12px;padding:5px 10px}
.btn-sm-ghost:hover{background:var(--bg3);color:var(--text)}
#mozo-menu-area{flex:1;overflow:auto;display:flex;flex-direction:column}
#mozo-cats{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.cat-pill{background:var(--bg2);border:1px solid var(--line);border-radius:20px;color:var(--sub);font-size:12px;padding:4px 12px;transition:.12s}
.cat-pill:hover,.cat-pill.active{background:var(--accent);border-color:var(--accent);color:#fff}
#mozo-productos{flex:1;padding:8px 10px;display:grid;gap:5px;align-content:start}
.prod-row{background:var(--bg2);border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:8px;transition:background .1s}
.prod-row:hover{background:var(--bg3)}
.prod-nombre{flex:1;font-size:13px;font-weight:500}
.prod-precio{font-family:var(--mono);font-size:12px;color:var(--accent);white-space:nowrap}
.qc{display:flex;align-items:center;gap:5px;flex-shrink:0}
.qc button{width:28px;height:28px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--text);font-size:16px;display:flex;align-items:center;justify-content:center;transition:background .1s,border-color .1s}
.qc button:hover{background:var(--accent);border-color:var(--accent)}
.qc .qty{font-family:var(--mono);font-size:13px;font-weight:700;min-width:18px;text-align:center}
#mozo-carrito{border-top:1px solid var(--line);padding:12px;flex-shrink:0}
#carrito-items{max-height:130px;overflow:auto;display:grid;gap:3px;margin-bottom:8px}
.ci{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
.ci-n{flex:1;color:var(--sub)}
.ci-t{font-family:var(--mono);color:var(--text)}
.ci-empty{color:var(--muted);font-size:12px;font-style:italic;padding:6px 0}
#carrito-total{font-family:var(--mono);font-size:22px;color:var(--accent);margin-bottom:10px;font-weight:700}
#btn-enviar{width:100%;background:var(--accent);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;padding:13px;letter-spacing:.03em;transition:background .15s,transform .1s}
#btn-enviar:hover:not(:disabled){background:var(--accent-d);transform:translateY(-1px)}
#btn-enviar:disabled{opacity:.35;cursor:not-allowed}

/* ─── KDS ─── */
#view-kds{padding:14px}
.view-top{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.view-top h2{font-family:var(--ft);font-size:28px;color:var(--accent);letter-spacing:2px}
.kds-tab-btn{background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--sub);font-size:12px;font-weight:500;padding:5px 14px;transition:.12s}
.kds-tab-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
.kds-tab-btn.cocina.active{background:var(--cocina);border-color:var(--cocina);color:#000}
.kds-tab-btn.barra.active{background:var(--barra);border-color:var(--barra);color:#fff}
.kds-tab-btn.postres.active{background:var(--postres);border-color:var(--postres);color:#fff}
#kds-tickets{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.kds-ticket{background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:14px;transition:border-color .3s}
.kds-ticket.urgente{border-color:var(--danger)}
.kds-ticket-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.kds-mesa{font-family:var(--ft);font-size:48px;letter-spacing:1px;line-height:1}
.kds-timer-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.kds-badge{font-family:var(--mono);font-size:24px;font-weight:700;padding:0;border-radius:0;background:none}
.kds-badge-label{font-size:9px;color:var(--muted);text-align:right}
.kds-badge.verde{color:var(--ok)}
.kds-badge.amarillo{color:var(--warn)}
.kds-badge.rojo{color:var(--danger);animation:blink-danger .8s infinite}
@keyframes blink-danger{0%,100%{opacity:1}50%{opacity:.5}}
.kds-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer;transition:opacity .15s}
.kds-item:last-child{border-bottom:none}
.kds-item.listo{opacity:.3;text-decoration:line-through}
.kds-check{width:18px;height:18px;border-radius:5px;border:2px solid var(--line);flex-shrink:0;transition:background .15s,border-color .15s}
.kds-item.listo .kds-check{background:var(--ok);border-color:var(--ok)}
.kds-item-n{flex:1;font-size:13px;font-weight:500}
.kds-item-q{font-family:var(--mono);font-size:14px;font-weight:700;color:var(--accent)}
.kds-actions{margin-top:10px}
.btn-cerrar-ticket{width:100%;background:var(--accent);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;padding:8px;transition:background .12s}
.btn-cerrar-ticket:hover{background:var(--accent-d)}
.kds-empty{color:var(--muted);font-style:italic;padding:40px;text-align:center;grid-column:1/-1;font-size:15px}

/* ─── PRODUCTOS ─── */
#view-productos{padding:14px}
#prod-cats-bar{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
#prod-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.prod-card{background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:border-color .15s,transform .12s,box-shadow .15s;position:relative;overflow:hidden}
.prod-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);transform:scaleY(0);transform-origin:bottom;transition:transform .2s cubic-bezier(.22,1,.36,1)}
.prod-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,.2)}
.prod-card:hover::before{transform:scaleY(1)}
.prod-card-name{font-size:14px;font-weight:600;color:var(--text);line-height:1.3}
.prod-card-price{font-size:20px;font-weight:700;color:var(--accent);font-family:var(--mono);letter-spacing:-.02em}
.prod-card-footer{display:flex;align-items:center;gap:6px;margin-top:2px}
.prod-card-cat{font-size:11px;color:var(--sub);background:var(--bg3);border-radius:4px;padding:2px 7px}
.est-badge{display:inline-block;border-radius:4px;font-size:10px;font-weight:700;padding:2px 6px;text-transform:uppercase;letter-spacing:.05em}
.est-badge.cocina{background:rgba(251,191,36,.15);color:var(--cocina)}
.est-badge.barra{background:rgba(96,165,250,.15);color:var(--barra)}
.est-badge.postres{background:rgba(244,114,182,.15);color:var(--postres)}
/* ─── Modal producto ─── */
#pm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:210;display:none;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:20px}
#pm-overlay.open{display:flex}
#pm-box{background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-lg);padding:0;width:100%;max-width:420px;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.6);overflow:hidden}
#pm-head{padding:20px 24px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
#pm-head-title{font-family:var(--ft);font-size:22px;letter-spacing:1px;color:var(--text)}
#pm-close{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:.1s;line-height:1}
#pm-close:hover{background:var(--bg3);color:var(--text)}
#pm-body{padding:20px 24px;display:flex;flex-direction:column;gap:14px}
.pm-field{display:flex;flex-direction:column;gap:5px}
.pm-label{font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.06em}
.pm-input{background:var(--bg3);border:1px solid var(--line2);border-radius:8px;color:var(--text);font-size:14px;padding:10px 14px;width:100%;outline:none;font-family:var(--f);transition:border-color .12s;box-sizing:border-box}
.pm-input:focus{border-color:var(--accent)}
.pm-select{background:var(--bg3);border:1px solid var(--line2);border-radius:8px;color:var(--text);font-size:14px;padding:10px 14px;width:100%;outline:none;font-family:var(--f);transition:border-color .12s;appearance:none;cursor:pointer}
.pm-select:focus{border-color:var(--accent)}
.pm-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#pm-foot{padding:16px 24px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:space-between;align-items:center}
#pm-del{background:none;border:1px solid var(--danger);color:var(--danger);border-radius:8px;font-size:12px;font-weight:700;padding:8px 14px;cursor:pointer;font-family:var(--f);transition:.12s}
#pm-del:hover{background:var(--danger);color:#fff}
.pm-actions{display:flex;gap:8px;margin-left:auto}
#pm-cancel{background:var(--bg3);border:1px solid var(--line);color:var(--sub);border-radius:8px;font-size:13px;font-weight:700;padding:9px 18px;cursor:pointer;font-family:var(--f);transition:.12s}
#pm-cancel:hover{color:var(--text)}
#pm-save{background:var(--accent);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:700;padding:9px 20px;cursor:pointer;font-family:var(--f);transition:.12s}
#pm-save:hover{background:var(--accent-d)}
.btn-accent{background:var(--accent);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;padding:7px 14px;transition:.12s}
.btn-accent:hover{background:var(--accent-d)}
.btn-ghost{background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--text);font-size:13px;padding:7px 14px;transition:.12s}
.btn-ghost:hover{background:var(--bg3)}

/* ─── STATS ─── */
#view-stats{padding:14px;overflow:auto;flex-direction:column}
.period-bar{display:flex;gap:4px;flex-wrap:wrap}
.period-pill{background:var(--bg2);border:1px solid var(--line);border-radius:20px;color:var(--sub);font-size:12px;padding:4px 13px;transition:.12s}
.period-pill.active{background:var(--accent);border-color:var(--accent);color:#fff}
.period-pill:not(.active):hover{border-color:var(--accent);color:var(--accent)}
.stats-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:18px}
.stats-kpi{background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.stats-kpi-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:600}
.stats-kpi-value{font-family:var(--mono);font-size:32px;font-weight:700;line-height:1}
.stats-kpi-value.accent{color:var(--accent)}
.stats-section{margin-bottom:20px}
.stats-section-title{font-family:var(--ft);font-size:16px;letter-spacing:2px;color:var(--sub);margin-bottom:10px}
.bar-chart{display:flex;align-items:flex-end;gap:5px;height:110px;border-bottom:1px solid var(--line);overflow-x:auto;padding:0 2px}
.bar-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;position:relative}
.bar{background:var(--accent);border-radius:3px 3px 0 0;width:26px;min-height:3px;transition:height .3s;opacity:.8}
.bar:hover{opacity:1}
.bar-wrap:hover .bar-tooltip{display:block}
.bar-tooltip{display:none;position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;font-family:var(--mono);font-size:10px;white-space:nowrap;z-index:5}
.bar-label{font-family:var(--mono);font-size:8px;color:var(--muted)}
.bar-val{font-family:var(--mono);font-size:8px;color:var(--sub)}
.top-list{display:grid;gap:5px}
.top-row{background:var(--bg1);border:1px solid var(--line);border-radius:8px;padding:9px 12px;display:grid;grid-template-columns:24px 1fr auto auto;gap:10px;align-items:center;font-size:12px}
.top-rank{font-family:var(--mono);color:var(--muted);font-weight:700}
.top-total{font-family:var(--mono);color:var(--accent);white-space:nowrap;font-weight:700}
.orig-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
.orig-row:last-child{border-bottom:none}

/* ─── TICKET CONFIG ─── */
#view-comanda{padding:14px;gap:14px;overflow:auto}
.view.active#view-comanda{display:grid;grid-template-columns:1fr 280px}
.comanda-form-box{background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:18px}
.comanda-form-box h2{font-family:var(--ft);font-size:22px;color:var(--accent);letter-spacing:1px;margin-bottom:14px}
.fgroup{margin-bottom:12px}
.fgroup label{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;font-weight:500}
.fgroup input,.fgroup textarea{width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--text);font-size:13px;padding:9px 12px}
.fgroup textarea{min-height:64px;resize:vertical}
.logo-area{border:2px dashed var(--line);border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:var(--muted);font-size:12px}
.logo-area:hover{border-color:var(--accent);color:var(--accent)}
#logo-prev{max-width:100px;max-height:48px;object-fit:contain;margin:6px auto;display:block}
#ticket-preview{background:#fff;border-radius:var(--r);padding:18px;color:#222;display:flex;flex-direction:column;align-items:center;font-family:var(--mono);font-size:11px;position:sticky;top:14px;gap:4px}
#tick-logo{max-width:80px;max-height:40px;object-fit:contain;display:none}
.tick-nombre{font-size:14px;font-weight:700;text-align:center}
.tick-sub{font-size:10px;color:#555;text-align:center}
.tick-divider{width:100%;border:none;border-top:1px dashed #bbb;margin:6px 0}
.tick-pie{font-size:10px;color:#777;text-align:center;margin-top:6px}

/* ─── CONFIG ─── */
#view-config{padding:14px;overflow:auto;max-width:680px}
.view.active#view-config{display:block}
#view-config h2{font-family:var(--ft);font-size:26px;color:var(--accent);letter-spacing:1px;margin-bottom:16px}
.cfg-section{background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:12px}
.cfg-section h3{font-size:12px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.est-row{display:grid;grid-template-columns:90px 110px 1fr;gap:8px;align-items:center;margin-bottom:8px}
.est-nom{font-size:13px;text-transform:capitalize}
.est-sel,.est-url-i{background:var(--bg2);border:1px solid var(--line);border-radius:6px;color:var(--text);font-size:12px;padding:6px 8px}
.est-url-i{width:100%}
.mp-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 12px;border-radius:6px;font-weight:500}
.mp-ok{background:rgba(74,222,128,.12);color:var(--green)}
.mp-nok{background:rgba(248,113,113,.12);color:var(--red)}
.cfg-input{width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:6px;color:var(--text);font-size:13px;padding:8px 10px}
.qr-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:8px}
#qr-link{font-size:12px;color:var(--accent);word-break:break-all}
.btn-qr{background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--text);font-size:12px;font-weight:600;padding:8px 12px}
.btn-qr:hover{background:var(--accent);border-color:var(--accent)}

/* ─── Modal custom ─── */
#modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px}
#modal-overlay.open{display:flex}
#modal-box{background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-lg);padding:24px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#modal-title{font-family:var(--ft);font-size:20px;letter-spacing:1px;color:var(--text)}
#modal-msg{font-size:13px;color:var(--sub);line-height:1.5;margin-top:-8px}
#modal-input{background:var(--bg3);border:1px solid var(--line2);border-radius:8px;color:var(--text);font-size:14px;padding:10px 14px;width:100%;outline:none;font-family:var(--f)}
#modal-input:focus{border-color:var(--accent)}
.modal-btns{display:flex;gap:8px;justify-content:flex-end}
.mbtn{border:none;border-radius:8px;font-size:13px;font-weight:700;padding:9px 20px;cursor:pointer;font-family:var(--f);transition:.12s}
.mbtn.cancel{background:var(--bg3);color:var(--sub);border:1px solid var(--line)}
.mbtn.cancel:hover{background:var(--bg2);color:var(--text)}
.mbtn.ok{background:var(--accent);color:#fff}
.mbtn.ok:hover{background:var(--accent-d)}
.mbtn.danger{background:var(--danger-d);color:var(--danger);border:1px solid var(--danger)}
.mbtn.danger:hover{background:var(--danger);color:#fff}

/* Toast */
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);background:var(--bg2);border:1px solid var(--line2);border-radius:10px;color:var(--text);font-size:13px;padding:10px 20px;z-index:9999;display:none;white-space:nowrap;box-shadow:0 4px 24px rgba(0,0,0,.4);transition:transform .2s,opacity .2s;opacity:0}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#toast.ok{border-color:var(--ok);color:var(--ok)}
#toast.err{border-color:var(--danger);color:var(--danger)}
#toast.warn{border-color:var(--warn);color:var(--warn)}

@media(max-width:700px){
  #view-mozo{flex-direction:column!important}
  #mozo-sidebar{width:100%;border-left:none;border-top:1px solid var(--line);max-height:55vh}
  #view-comanda{grid-template-columns:1fr}
  #prod-list{grid-template-columns:1fr 1fr}
  .kds-mesa{font-size:36px}
  .kds-badge{font-size:18px}
  #nav-clock{display:none}
}
</style>
</head>
<body>
<div id="app">
  <nav id="nav">
    <span class="nav-logo">COMANDAS</span>
    <button class="nav-tab active" onclick="showView('mozo')">Mozo</button>
    <button class="nav-tab" onclick="showView('kds')">KDS</button>
    <button class="nav-tab" onclick="showView('productos')">Productos</button>
    <button class="nav-tab" onclick="showView('stats')">Stats</button>
    <button class="nav-tab" onclick="showView('comanda')">Ticket</button>
    <button class="nav-tab" onclick="showView('config')">Config</button>
    <div class="nav-right">
      <span id="nav-clock"></span>
      <span id="nav-disp"></span>
      <span id="ws-dot" title="WebSocket"></span>
    </div>
  </nav>
  <div id="content">

    <!-- MOZO -->
    <div class="view active" id="view-mozo">
      <div id="mozo-main">
        <h2>MESAS</h2>
        <div id="mesas-grid"></div>
      </div>
      <div id="mozo-sidebar">
        <div id="mozo-sidebar-head">
          <span id="mozo-mesa-label">Seleccioná una mesa</span>
          <button class="btn-sm-ghost" onclick="cerrarSidebar()">✕</button>
        </div>
        <div id="mozo-menu-area">
          <div id="mozo-cats"></div>
          <div id="mozo-productos"></div>
        </div>
        <div id="mozo-carrito">
          <div id="carrito-items"><div class="ci-empty">Carrito vacío</div></div>
          <div id="carrito-total">$ 0</div>
          <button id="btn-enviar" disabled onclick="enviarComanda()">Enviar comanda</button>
        </div>
      </div>
    </div>

    <!-- KDS -->
    <div class="view" id="view-kds">
      <div class="view-top">
        <h2>COCINA / KDS</h2>
        <button class="kds-tab-btn cocina active" onclick="setEst('cocina',this)">🔥 Cocina</button>
        <button class="kds-tab-btn barra" onclick="setEst('barra',this)">🍺 Barra</button>
        <button class="kds-tab-btn postres" onclick="setEst('postres',this)">🍮 Postres</button>
      </div>
      <div id="kds-tickets"><div class="kds-empty">Sin tickets activos</div></div>
    </div>

    <!-- PRODUCTOS -->
    <div class="view" id="view-productos">
      <div class="view-top">
        <h2>PRODUCTOS</h2>
        <button class="btn-ghost" onclick="addCategoria()">+ Categoría</button>
        <button class="btn-ghost" onclick="addProducto()">+ Producto</button>
        <button class="btn-accent" onclick="guardarMenu()">Guardar y sincronizar</button>
      </div>
      <div id="prod-cats-bar"></div>
      <div id="prod-list"></div>
    </div>

    <!-- ESTADÍSTICAS -->
    <div class="view" id="view-stats">
      <div class="view-top">
        <h2>ESTADÍSTICAS</h2>
        <div class="period-bar">
          <button class="period-pill active" onclick="setPeriod('hoy',this)">Hoy</button>
          <button class="period-pill" onclick="setPeriod('semana',this)">Semana</button>
          <button class="period-pill" onclick="setPeriod('mes',this)">Mes</button>
          <button class="period-pill" onclick="setPeriod('todo',this)">Todo</button>
        </div>
      </div>
      <div class="stats-kpis" id="stats-kpis"></div>
      <div class="stats-section">
        <div class="stats-section-title">VENTAS POR DÍA</div>
        <div class="bar-chart" id="stats-chart"></div>
      </div>
      <div class="stats-section">
        <div class="stats-section-title">TOP PRODUCTOS</div>
        <div class="top-list" id="stats-tops"></div>
      </div>
      <div class="stats-section">
        <div class="stats-section-title">POR ORIGEN</div>
        <div id="stats-orig"></div>
      </div>
    </div>

    <!-- TICKET -->
    <div class="view" id="view-comanda">
      <div class="comanda-form-box">
        <h2>TICKET / RECIBO</h2>
        <div class="fgroup">
          <label>Logo</label>
          <div class="logo-area" onclick="document.getElementById('logo-file').click()">
            <img id="logo-prev" style="display:none">
            <span id="logo-ph">Clic para subir logo (máx 300px, PNG/JPG)</span>
          </div>
          <input id="logo-file" type="file" accept="image/*" style="display:none" onchange="subirLogo(this)">
        </div>
        <div class="fgroup"><label>Nombre del negocio</label><input id="n-nombre" oninput="prevTick()"></div>
        <div class="fgroup"><label>Dirección</label><input id="n-dir" oninput="prevTick()"></div>
        <div class="fgroup"><label>CUIT</label><input id="n-cuit" oninput="prevTick()"></div>
        <div class="fgroup"><label>Teléfono</label><input id="n-tel" oninput="prevTick()"></div>
        <div class="fgroup"><label>Mensaje de pie</label><textarea id="n-pie" oninput="prevTick()"></textarea></div>
        <button class="btn-accent" style="width:100%" onclick="guardarTicketConfig()">Guardar y sincronizar</button>
      </div>
      <div id="ticket-preview">
        <img id="tick-logo" style="max-width:80px;max-height:40px;object-fit:contain;display:none">
        <div class="tick-nombre" id="tick-nombre">Mi Negocio</div>
        <div class="tick-sub" id="tick-sub"></div>
        <div class="tick-divider" style="width:100%;border:none;border-top:1px dashed #bbb;margin:6px 0"></div>
        <div style="width:100%;text-align:center;color:#aaa;font-size:10px">— vista previa —</div>
        <div class="tick-divider" style="width:100%;border:none;border-top:1px dashed #bbb;margin:6px 0"></div>
        <div style="width:100%;display:flex;justify-content:space-between"><span>TOTAL</span><span>$ ---</span></div>
        <div class="tick-divider" style="width:100%;border:none;border-top:1px dashed #bbb;margin:6px 0"></div>
        <div class="tick-pie" id="tick-pie"></div>
      </div>
    </div>

    <!-- CONFIG -->
    <div class="view" id="view-config">
      <h2>CONFIGURACIÓN</h2>
      <div class="cfg-section">
        <h3>Estaciones</h3>
        <div id="est-rows"></div>
      </div>
      <div class="cfg-section">
        <h3>URL pública del servidor</h3>
        <input class="cfg-input" id="cfg-url" placeholder="https://sistema.gratitudgourmet.com.ar">
        <div class="qr-row">
          <div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Menú QR:</div><a id="qr-link" href="#" target="_blank" id="qr-link"></a></div>
          <button class="btn-qr" onclick="descargarQr()">⬇ QR PNG</button>
        </div>
      </div>
      <div class="cfg-section">
        <h3>Mesas</h3>
        <div style="display:flex;align-items:center;gap:10px">
          <label style="color:var(--muted);font-size:12px">Cantidad:</label>
          <input id="cfg-mesas" type="number" min="1" max="60" style="width:70px;background:var(--bg2);border:1px solid var(--line);border-radius:6px;color:var(--text);padding:6px 10px">
        </div>
      </div>
      <div class="cfg-section">
        <h3>MercadoPago</h3>
        <div id="mp-status"></div>
      </div>
      <button class="btn-accent" onclick="guardarConfigGlobal()">Guardar configuración</button>
    </div>

  </div>
</div>
<div id="pm-overlay">
  <div id="pm-box">
    <div id="pm-head">
      <span id="pm-head-title">PRODUCTO</span>
      <button id="pm-close" onclick="closeProdModal()">✕</button>
    </div>
    <div id="pm-body">
      <div class="pm-field">
        <label class="pm-label">Nombre</label>
        <input id="pm-nombre" class="pm-input" placeholder="ej: Milanesa napolitana" autocomplete="off">
      </div>
      <div class="pm-row">
        <div class="pm-field">
          <label class="pm-label">Precio</label>
          <input id="pm-precio" class="pm-input" type="number" placeholder="0" min="0">
        </div>
        <div class="pm-field">
          <label class="pm-label">Estación</label>
          <select id="pm-estacion" class="pm-select">
            <option value="cocina">🔥 Cocina</option>
            <option value="barra">🍺 Barra</option>
            <option value="postres">🍮 Postres</option>
          </select>
        </div>
      </div>
      <div class="pm-field">
        <label class="pm-label">Categoría</label>
        <select id="pm-categoria" class="pm-select"></select>
      </div>
    </div>
    <div id="pm-foot">
      <button id="pm-del" onclick="deleteProdModal()" style="display:none">Eliminar</button>
      <div class="pm-actions">
        <button id="pm-cancel" onclick="closeProdModal()">Cancelar</button>
        <button id="pm-save" onclick="saveProdModal()">Guardar</button>
      </div>
    </div>
  </div>
</div>
<div id="modal-overlay">
  <div id="modal-box">
    <div id="modal-title"></div>
    <div id="modal-msg" style="display:none"></div>
    <input id="modal-input" style="display:none" autocomplete="off">
    <div class="modal-btns" id="modal-btns"></div>
  </div>
</div>
<div id="toast"></div>
<script>
const API = '/gestion-comandas/api';

// ── Modal custom (reemplaza prompt/confirm del navegador) ──────
function _modal({ title, msg='', input=false, placeholder='', danger=false, okLabel='Aceptar', cancelLabel='Cancelar' }) {
  return new Promise(resolve => {
    const ov  = document.getElementById('modal-overlay');
    const ttl = document.getElementById('modal-title');
    const ms  = document.getElementById('modal-msg');
    const inp = document.getElementById('modal-input');
    const bts = document.getElementById('modal-btns');
    ttl.textContent = title;
    ms.textContent  = msg; ms.style.display = msg ? 'block' : 'none';
    inp.value = ''; inp.placeholder = placeholder;
    inp.style.display = input ? 'block' : 'none';
    bts.innerHTML = \`<button class="mbtn cancel" id="mb-cancel">\${cancelLabel}</button><button class="mbtn \${danger?'danger':'ok'}" id="mb-ok">\${okLabel}</button>\`;
    ov.classList.add('open');
    const close = val => { ov.classList.remove('open'); resolve(val); };
    document.getElementById('mb-ok').onclick     = () => close(input ? (inp.value.trim()||null) : true);
    document.getElementById('mb-cancel').onclick = () => close(null);
    ov.onclick = e => { if (e.target===ov) close(null); };
    if (input) { inp.focus(); inp.onkeydown = e => { if(e.key==='Enter') close(inp.value.trim()||null); if(e.key==='Escape') close(null); }; }
    else { document.getElementById('mb-ok').focus(); }
  });
}
const ask     = (title, placeholder='', msg='') => _modal({ title, msg, input:true, placeholder });
const confirm2 = (title, msg='', danger=true)   => _modal({ title, msg, danger, okLabel:'Eliminar', cancelLabel:'Cancelar' });
let _menu = { categorias:[], productos:[] };
let _cfg  = {};
let _tix  = [];
let _vtas = [];
let _menuLocal = null;
let _mesaActiva = null;
let _carrito = {};   // { mesaNum: { prodId: qty } }
let _catMozo = '';
let _catProd = '';
let _kdsEst  = 'cocina';
let _period  = 'hoy';
let _ws;
let _logob64 = '';

// ── WebSocket ─────────────────────────────────────────────────
function setWsDot(ok) {
  const d = document.getElementById('ws-dot');
  if (d) d.className = ok ? 'ok' : '';
}
function initWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(proto + '//' + location.host + '/gestion-comandas/ws');
  _ws.onopen  = () => setWsDot(true);
  _ws.onclose = () => { setWsDot(false); setTimeout(initWs, 3000); };
  _ws.onerror = () => setWsDot(false);
  _ws.onmessage = (e) => {
    const { event, data } = JSON.parse(e.data);
    if (event === 'comandas:ticket:nuevo' || event === 'comandas:ticket:actualizado') {
      _tix = data.tickets; renderMesas(); renderKds();
    }
    if (event === 'comandas:menu:actualizado') { _menu = data; renderMozo(); renderProdView(); }
    if (event === 'comandas:config:actualizado') { _cfg = data; applyConfig(); }
  };
}

// ── Boot ──────────────────────────────────────────────────────
function startClock() {
  function tick(){
    const now=new Date();
    const h=String(now.getHours()).padStart(2,'0'),m=String(now.getMinutes()).padStart(2,'0'),s=String(now.getSeconds()).padStart(2,'0');
    const el=document.getElementById('nav-clock'); if(el) el.textContent=h+':'+m+':'+s;
  }
  tick(); setInterval(tick,1000);
}
async function boot() {
  if (!localStorage.getItem('comandas_dispositivo')) {
    const n = await ask('¿Qué dispositivo es este?', 'ej: Mozo 1, Caja, Barra') || 'Panel';
    localStorage.setItem('comandas_dispositivo', n);
  }
  const disp = getDisp();
  const dc = document.getElementById('nav-disp'); if(dc) dc.textContent = disp;
  startClock();
  const [est, vtas] = await Promise.all([
    fetch(API+'/estado').then(r=>r.json()),
    fetch(API+'/ventas').then(r=>r.json()),
  ]);
  if (est.ok)  { _menu=est.menu; _cfg=est.config; _tix=est.tickets; applyConfig(); renderMesas(); renderMozo(); }
  if (vtas.ok) _vtas = vtas.ventas;
  initWs();
  document.getElementById('pm-overlay').addEventListener('click', e=>{ if(e.target===document.getElementById('pm-overlay')) closeProdModal(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeProdModal(); });
}

function getDisp() { return localStorage.getItem('comandas_dispositivo') || 'Panel'; }

function applyConfig() {
  const ng = _cfg.negocio || {};
  document.getElementById('n-nombre').value = ng.nombre || '';
  document.getElementById('n-dir').value    = ng.direccion || '';
  document.getElementById('n-cuit').value   = ng.cuit || '';
  document.getElementById('n-tel').value    = ng.telefono || '';
  document.getElementById('n-pie').value    = ng.mensajePie || '';
  if (ng.logoBase64) {
    _logob64 = ng.logoBase64;
    const pi = document.getElementById('logo-prev');
    pi.src = ng.logoBase64; pi.style.display = 'block';
    document.getElementById('logo-ph').style.display = 'none';
    document.getElementById('tick-logo').src = ng.logoBase64;
    document.getElementById('tick-logo').style.display = 'block';
  }
  document.getElementById('cfg-mesas').value = _cfg.mesas || 14;
  const url = _cfg.publicUrl || '';
  document.getElementById('cfg-url').value = url;
  const lnk = document.getElementById('qr-link');
  lnk.href = url+'/gestion-comandas/pedidos'; lnk.textContent = (url||'(sin URL)')+'/gestion-comandas/pedidos';
  renderEst();
  fetch(API+'/estado').then(r=>r.json()).then(d=>{
    document.getElementById('mp-status').innerHTML = d.mpActivo
      ? '<span class="mp-badge mp-ok">✓ MercadoPago configurado</span>'
      : '<span class="mp-badge mp-nok">✗ MP_ACCESS_TOKEN no configurado. Pagos QR deshabilitados.</span>';
  });
  prevTick();
}

// ── Views ────────────────────────────────────────────────────
function showView(v) {
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  event.currentTarget.classList.add('active');
  if (v==='mozo')     { renderMesas(); renderMozo(); }
  if (v==='kds')      renderKds();
  if (v==='productos') renderProdView();
  if (v==='stats')    renderStats();
  if (v==='config')   renderEst();
}

// ── MOZO ─────────────────────────────────────────────────────
function renderMesas() {
  const g = document.getElementById('mesas-grid');
  const n = Number(_cfg.mesas) || 14;
  g.innerHTML = '';
  for (let i=1;i<=n;i++) {
    const t = _tix.find(x=>x.mesa===i && x.estado==='activo');
    const total = t ? t.items.reduce((s,x)=>s+x.precio*x.qty,0) : 0;
    const mins  = t ? Math.floor((Date.now()-t.createdAt)/60000) : 0;
    const btn = document.createElement('button');
    btn.className = 'mesa-btn' + (t?' ocupada':'');
    btn.innerHTML = \`<span class="mesa-num">\${i}</span>\${t?
      \`<span class="mesa-total">$\${Math.round(total).toLocaleString('es-AR')}</span><span class="mesa-tiempo">\${mins}min</span>\`
      : ''}\`;
    btn.onclick = () => selMesa(i);
    g.appendChild(btn);
  }
}

function selMesa(n) {
  _mesaActiva = n;
  document.getElementById('mozo-mesa-label').textContent = 'Mesa '+n;
  renderMozo();
}

function cerrarSidebar() { _mesaActiva = null; document.getElementById('mozo-mesa-label').textContent = 'Seleccioná una mesa'; }

function renderMozo() {
  const cats = _menu.categorias || [];
  const catsDiv = document.getElementById('mozo-cats');
  catsDiv.innerHTML = cats.map(c=>\`<button class="cat-pill\${_catMozo===c?' active':''}" onclick="setCatMozo('\${escH(c)}')">\${escH(c)}</button>\`).join('');
  if (!_catMozo && cats.length) { _catMozo = cats[0]; catsDiv.firstChild && catsDiv.firstChild.classList.add('active'); }
  renderProds();
}

function setCatMozo(c) {
  _catMozo = c;
  document.querySelectorAll('#mozo-cats .cat-pill').forEach(p=>p.classList.toggle('active', p.textContent===c));
  renderProds();
}

function renderProds() {
  const prods = (_menu.productos||[]).filter(p=>p.categoria===_catMozo);
  const carr  = _carrito[_mesaActiva] || {};
  document.getElementById('mozo-productos').innerHTML = prods.map(p=>\`
    <div class="prod-row">
      <span class="prod-nombre">\${escH(p.nombre)}</span>
      <span class="prod-precio">$ \${Number(p.precio).toLocaleString('es-AR')}</span>
      <div class="qc">
        <button onclick="chQty(\${p.id},-1)">−</button>
        <span class="qty">\${carr[p.id]||0}</span>
        <button onclick="chQty(\${p.id},1)">+</button>
      </div>
    </div>\`).join('') || '<div style="color:var(--muted);padding:14px;font-style:italic">Sin productos</div>';
}

function chQty(id,d) {
  if (!_mesaActiva) return;
  if (!_carrito[_mesaActiva]) _carrito[_mesaActiva]={};
  const c=_carrito[_mesaActiva];
  c[id]=Math.max(0,(c[id]||0)+d);
  if (!c[id]) delete c[id];
  renderProds(); renderCarrito();
}

function renderCarrito() {
  const carr = _carrito[_mesaActiva]||{};
  const items = Object.entries(carr).map(([id,qty])=>{
    const p=(_menu.productos||[]).find(x=>x.id==id);
    return p?{...p,qty}:null;
  }).filter(Boolean);
  const total = items.reduce((s,i)=>s+i.precio*i.qty,0);
  const div = document.getElementById('carrito-items');
  div.innerHTML = items.length
    ? items.map(i=>\`<div class="ci"><span class="ci-n">x\${i.qty} \${escH(i.nombre)}</span><span class="ci-t">$\${(i.precio*i.qty).toLocaleString('es-AR')}</span></div>\`).join('')
    : '<div class="ci-empty">Carrito vacío</div>';
  document.getElementById('carrito-total').textContent = '$ '+Math.round(total).toLocaleString('es-AR');
  document.getElementById('btn-enviar').disabled = !items.length;
}

async function enviarComanda() {
  if (!_mesaActiva) return;
  const carr = _carrito[_mesaActiva]||{};
  const items = Object.entries(carr).map(([id,qty])=>{
    const p=(_menu.productos||[]).find(x=>x.id==id);
    return p?{id:p.id,nombre:p.nombre,precio:p.precio,estacion:p.estacion||'cocina',qty}:null;
  }).filter(Boolean);
  if (!items.length) return;
  const r = await fetch(API+'/comandas',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mesa:_mesaActiva,dispositivo:getDisp(),origen:'mozo',items})}).then(r=>r.json());
  if (r.ok) { delete _carrito[_mesaActiva]; renderCarrito(); toast('Comanda enviada ✓','ok'); renderMesas(); }
  else toast(r.error||'Error','err');
}

// ── KDS ──────────────────────────────────────────────────────
function setEst(e,btn) {
  _kdsEst=e;
  document.querySelectorAll('.kds-tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderKds();
}

function renderKds() {
  const activos = _tix.filter(t=>t.estado==='activo');
  const div = document.getElementById('kds-tickets');
  if (!activos.length) { div.innerHTML='<div class="kds-empty">Sin tickets activos ✓</div>'; return; }
  div.innerHTML = activos.sort((a,b)=>a.createdAt-b.createdAt).map(t=>{
    const mins = Math.floor((Date.now()-t.createdAt)/60000);
    const cls  = mins<5?'verde':mins<10?'amarillo':'rojo';
    const items = (t.items||[]).map((item,gi)=>({...item,gi})).filter(i=>(i.estacion||'cocina')===_kdsEst);
    if (!items.length) return '';
    return \`<div class="kds-ticket\${cls==='rojo'?' urgente':''}">
      <div class="kds-ticket-head">
        <span class="kds-mesa">\${t.mesa}</span>
        <div class="kds-timer-wrap">
          <span class="kds-badge \${cls}">\${mins}m</span>
          <span class="kds-badge-label">\${cls==='verde'?'en tiempo':cls==='amarillo'?'atención':'¡urgente!'}</span>
        </div>
      </div>
      \${items.map(i=>\`<div class="kds-item\${i.listo?' listo':''}" onclick="toggleItem('\${t.id}',\${i.gi})">
        <div class="kds-check"></div>
        <span class="kds-item-n">\${escH(i.nombre)}</span>
        <span class="kds-item-q">×\${i.qty}</span>
      </div>\`).join('')}
      <div class="kds-actions"><button class="btn-cerrar-ticket" onclick="cerrarTicket('\${t.id}')">✓ Cerrar ticket</button></div>
    </div>\`;
  }).join('') || '<div class="kds-empty">Sin tickets para esta estación</div>';
}

async function toggleItem(tid,idx) {
  const r=await fetch(\`\${API}/tickets/\${tid}/items/\${idx}/toggle\`,{method:'POST'}).then(r=>r.json());
  if (r.ok) { _tix=r.tickets; renderKds(); }
}

async function cerrarTicket(tid) {
  const r=await fetch(\`\${API}/tickets/\${tid}\`,{method:'DELETE'}).then(r=>r.json());
  if (r.ok) { _tix=r.tickets; renderKds(); renderMesas();
    fetch(API+'/ventas').then(r=>r.json()).then(d=>{ if(d.ok) _vtas=d.ventas; });
  }
}

// ── PRODUCTOS ────────────────────────────────────────────────
function renderProdView() {
  _menuLocal = JSON.parse(JSON.stringify(_menu));
  renderCatsProd(); renderProdList();
}

function renderCatsProd() {
  const div = document.getElementById('prod-cats-bar');
  div.innerHTML = (_menuLocal.categorias||[]).map(c=>
    \`<button class="kds-tab-btn\${_catProd===c?' active':''}" onclick="setCatProd('\${escH(c)}')">\${escH(c)}</button>\`
  ).join('');
  if (!_catProd && _menuLocal.categorias.length) _catProd = _menuLocal.categorias[0];
}

function setCatProd(c) { _catProd=c; renderCatsProd(); renderProdList(); }

function renderProdList() {
  const prods = (_menuLocal.productos||[]).filter(p=>p.categoria===_catProd);
  document.getElementById('prod-list').innerHTML = prods.length ? prods.map(p=>\`
    <div class="prod-card" onclick="openProdModal(\${p.id})">
      <div class="prod-card-name">\${escH(p.nombre)}</div>
      <div class="prod-card-price">$ \${Number(p.precio).toLocaleString('es-AR')}</div>
      <div class="prod-card-footer">
        <span class="prod-card-cat">\${escH(p.categoria)}</span>
        <span class="est-badge \${p.estacion||'cocina'}">\${p.estacion||'cocina'}</span>
      </div>
    </div>\`).join('')
  : \`<div style="color:var(--muted);font-size:13px;padding:20px">Sin productos en esta categoría</div>\`;
}

let _pmId = null;
function openProdModal(id) {
  _pmId = id;
  const ov = document.getElementById('pm-overlay');
  const isNew = id === null;
  const p = isNew ? null : (_menuLocal.productos||[]).find(x=>x.id===id);
  document.getElementById('pm-head-title').textContent = isNew ? 'NUEVO PRODUCTO' : 'EDITAR PRODUCTO';
  document.getElementById('pm-nombre').value  = p ? p.nombre  : '';
  document.getElementById('pm-precio').value  = p ? p.precio  : '';
  const estSel = document.getElementById('pm-estacion');
  estSel.value = p ? (p.estacion||'cocina') : 'cocina';
  const cats = _menuLocal.categorias||[];
  const catSel = document.getElementById('pm-categoria');
  catSel.innerHTML = cats.map(c=>\`<option value="\${escAttr(c)}" \${(p?p.categoria:_catProd)===c?'selected':''}>\${escH(c)}</option>\`).join('');
  document.getElementById('pm-del').style.display = isNew ? 'none' : 'block';
  ov.classList.add('open');
  document.getElementById('pm-nombre').focus();
}
function closeProdModal() {
  document.getElementById('pm-overlay').classList.remove('open');
  _pmId = null;
}
function saveProdModal() {
  const nombre  = document.getElementById('pm-nombre').value.trim();
  if (!nombre) { document.getElementById('pm-nombre').focus(); return; }
  const precio  = Number(document.getElementById('pm-precio').value)||0;
  const estacion= document.getElementById('pm-estacion').value;
  const categoria= document.getElementById('pm-categoria').value;
  if (_pmId === null) {
    _menuLocal.productos.push({id:Date.now(), nombre, precio, categoria, estacion});
  } else {
    const p = _menuLocal.productos.find(x=>x.id===_pmId);
    if (p) Object.assign(p, {nombre, precio, categoria, estacion});
  }
  closeProdModal();
  renderCatsProd(); renderProdList();
}
async function deleteProdModal() {
  const p = _menuLocal.productos.find(x=>x.id===_pmId);
  const ok = await confirm2('Eliminar producto', p?\`"\${p.nombre}" será eliminado del menú.\`:'');
  if (!ok) return;
  _menuLocal.productos = _menuLocal.productos.filter(x=>x.id!==_pmId);
  closeProdModal(); renderProdList();
}
async function addProducto() {
  if (!_menuLocal.categorias.length) {
    const nc = await ask('Primero creá una categoría','ej: Comidas'); if(!nc) return;
    _menuLocal.categorias.push(nc); renderCatsProd();
    if (!_catProd) _catProd = _menuLocal.categorias[0];
  }
  openProdModal(null);
}
async function addCategoria() {
  const n=await ask('Nueva categoría','ej: Postres, Bebidas, Entradas'); if(!n) return;
  _menuLocal.categorias.push(n); renderCatsProd();
}
async function guardarMenu() {
  const r=await fetch(API+'/menu',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(_menuLocal)}).then(r=>r.json());
  if(r.ok) { _menu=_menuLocal; toast('Menú guardado ✓','ok'); }
  else toast(r.error||'Error','err');
}

// ── STATS ────────────────────────────────────────────────────
function startOfDay(ts){ const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime(); }
function setPeriod(p,btn) {
  _period=p;
  document.querySelectorAll('.period-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderStats();
}
function filtVtas() {
  const now=Date.now();
  return _vtas.filter(v=>{
    if(_period==='hoy')    return v.fecha>=startOfDay(now);
    if(_period==='semana') return v.fecha>=now-7*86400000;
    if(_period==='mes')    return v.fecha>=now-30*86400000;
    return true;
  });
}
function renderStats() {
  const vtas=filtVtas();
  const total=vtas.reduce((s,v)=>s+(v.total||0),0);
  const cnt=vtas.length, ticket=cnt?total/cnt:0;
  document.getElementById('stats-kpis').innerHTML=\`
    <div class="stats-kpi"><div class="stats-kpi-label">Total vendido</div><div class="stats-kpi-value accent">$ \${Math.round(total).toLocaleString('es-AR')}</div></div>
    <div class="stats-kpi"><div class="stats-kpi-label">Comandas</div><div class="stats-kpi-value">\${cnt}</div></div>
    <div class="stats-kpi"><div class="stats-kpi-label">Ticket promedio</div><div class="stats-kpi-value">$ \${Math.round(ticket).toLocaleString('es-AR')}</div></div>
  \`;
  // Chart
  const porDia={};
  vtas.forEach(v=>{ const d=new Date(v.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}); porDia[d]=(porDia[d]||0)+(v.total||0); });
  const dias=Object.keys(porDia).slice(-14);
  const maxV=Math.max(...dias.map(d=>porDia[d]),1);
  document.getElementById('stats-chart').innerHTML=dias.length
    ? dias.map(d=>\`<div class="bar-wrap"><div class="bar-val">$\${Math.round(porDia[d]/1000)}k</div><div class="bar" style="height:\${Math.round(porDia[d]/maxV*88)}px"></div><div class="bar-label">\${d}</div></div>\`).join('')
    : '<div style="color:var(--muted);font-style:italic;align-self:center;padding:20px">Sin datos</div>';
  // Top productos
  const pm={};
  vtas.forEach(v=>(v.items||[]).forEach(i=>{ if(!pm[i.nombre])pm[i.nombre]={n:i.nombre,q:0,t:0}; pm[i.nombre].q+=i.qty||1; pm[i.nombre].t+=(i.precio||0)*(i.qty||1); }));
  const top=Object.values(pm).sort((a,b)=>b.t-a.t).slice(0,6);
  document.getElementById('stats-tops').innerHTML=top.length
    ? top.map((p,i)=>\`<div class="top-row"><span class="top-rank">#\${i+1}</span><span>\${escH(p.n)}</span><span style="color:var(--muted);font-size:11px">x\${p.q}</span><span class="top-total">$\${Math.round(p.t).toLocaleString('es-AR')}</span></div>\`).join('')
    : '<div style="color:var(--muted);font-style:italic">Sin datos</div>';
  // Origenes
  const om={};
  vtas.forEach(v=>{ const o=v.origen||'mozo'; om[o]=(om[o]||0)+(v.total||0); });
  document.getElementById('stats-orig').innerHTML=Object.entries(om).map(([o,t])=>
    \`<div class="orig-row"><span>\${escH(o)}</span><span style="font-family:var(--mono);color:var(--accent)">$\${Math.round(t).toLocaleString('es-AR')}</span></div>\`
  ).join('') || '<div style="color:var(--muted);font-style:italic">Sin datos</div>';
}

// ── TICKET CONFIG ────────────────────────────────────────────
function prevTick() {
  document.getElementById('tick-nombre').textContent = document.getElementById('n-nombre').value || 'Mi Negocio';
  const sub=[document.getElementById('n-dir').value,document.getElementById('n-cuit').value,document.getElementById('n-tel').value].filter(Boolean).join(' · ');
  document.getElementById('tick-sub').textContent=sub;
  document.getElementById('tick-pie').textContent=document.getElementById('n-pie').value;
}
function subirLogo(inp) {
  const file=inp.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas');
      const sc=Math.min(1,300/img.width);
      c.width=img.width*sc; c.height=img.height*sc;
      const ctx=c.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      _logob64=c.toDataURL('image/png');
      const pi=document.getElementById('logo-prev');
      pi.src=_logob64; pi.style.display='block';
      document.getElementById('logo-ph').style.display='none';
      document.getElementById('tick-logo').src=_logob64; document.getElementById('tick-logo').style.display='block';
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
async function guardarTicketConfig() {
  const body={negocio:{nombre:document.getElementById('n-nombre').value,direccion:document.getElementById('n-dir').value,cuit:document.getElementById('n-cuit').value,telefono:document.getElementById('n-tel').value,mensajePie:document.getElementById('n-pie').value,logoBase64:_logob64}};
  const r=await fetch(API+'/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(r.ok) toast('Guardado ✓','ok'); else toast(r.error||'Error','err');
}

// ── CONFIG ───────────────────────────────────────────────────
function renderEst() {
  const est=(_cfg.estaciones)||{};
  document.getElementById('est-rows').innerHTML=['cocina','barra','postres'].map(e=>\`
    <div class="est-row">
      <span class="est-nom">\${e}</span>
      <select class="est-sel" id="est-t-\${e}" onchange="tglUrl('\${e}')">
        <option value="pantalla"\${(est[e]?.tipo||'pantalla')==='pantalla'?' selected':''}>Pantalla</option>
        <option value="impresora"\${est[e]?.tipo==='impresora'?' selected':''}>Impresora</option>
      </select>
      <input class="est-url-i" id="est-u-\${e}" placeholder="http://IP:4321" value="\${est[e]?.url||''}" style="opacity:\${(est[e]?.tipo||'pantalla')==='pantalla'?.4:1}">
    </div>\`).join('');
}
function tglUrl(e) { document.getElementById('est-u-'+e).style.opacity=document.getElementById('est-t-'+e).value==='impresora'?1:.4; }
async function guardarConfigGlobal() {
  const est={};
  ['cocina','barra','postres'].forEach(e=>{ est[e]={tipo:document.getElementById('est-t-'+e).value,url:document.getElementById('est-u-'+e).value}; });
  const url=document.getElementById('cfg-url').value;
  const body={estaciones:est,publicUrl:url,mesas:Number(document.getElementById('cfg-mesas').value)};
  const r=await fetch(API+'/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(r.ok) { _cfg={..._cfg,...body}; const lnk=document.getElementById('qr-link'); lnk.href=url+'/gestion-comandas/pedidos'; lnk.textContent=url+'/gestion-comandas/pedidos'; toast('Guardado ✓','ok'); }
  else toast(r.error||'Error','err');
}
async function descargarQr() {
  const a=document.createElement('a'); a.href=API+'/qr'; a.download='qr-menu.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Utils ────────────────────────────────────────────────────
function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }
function toast(msg,tipo='ok') {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=tipo; el.style.display='block';
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(el._t);
  el._t=setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.style.display='none',200); },3000);
}

boot();
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// HTML — App pública
// ════════════════════════════════════════════════════════════════════════════
function publicHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#1a1917">
<title>Menú · Gratitud Gourmet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f7f4ef;--card:#fff;--line:#ede9e3;--line2:#ccc7bf;
  --text:#1c1a17;--sub:#6b6760;--muted:#b5b0a9;
  --accent:#ff6b35;--accent-d:#e85c28;
  --hdr:#1a1917;
  --r:16px;
  --ft:'Bebas Neue',sans-serif;
  --f:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
html,body{background:var(--bg);font-family:var(--f);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

/* ── Loading ── */
#loading{position:fixed;inset:0;background:var(--hdr);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:100}
.ld-brand{font-family:var(--ft);font-size:40px;letter-spacing:4px;color:#fff;text-align:center;line-height:1.1}
.ld-brand span{display:block;font-size:12px;font-family:var(--f);letter-spacing:.18em;font-weight:400;color:rgba(255,255,255,.4);margin-top:8px;text-transform:uppercase}
.spinner{width:28px;height:28px;border:2.5px solid rgba(255,107,53,.2);border-top-color:var(--accent);border-radius:50%;animation:spin .75s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Header oscuro ── */
#hdr{background:var(--hdr);padding:22px 20px 24px;display:flex;align-items:center;gap:14px}
#hdr-logo{height:46px;width:46px;object-fit:contain;border-radius:12px;display:none;background:rgba(255,255,255,.08);flex-shrink:0}
.hdr-text{flex:1;min-width:0}
#hdr-nombre{font-family:var(--ft);font-size:32px;letter-spacing:2px;color:#fff;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hdr-sub{font-size:12px;color:rgba(255,255,255,.4);margin-top:5px;letter-spacing:.03em}

/* ── Botón flotante de carrito ── */
#hdr-cart-btn{
  position:fixed;bottom:max(20px,env(safe-area-inset-bottom,20px));left:50%;
  transform:translateX(-50%) translateY(120px);
  background:var(--accent);border:none;border-radius:999px;color:#fff;
  display:flex;align-items:center;padding:0;
  z-index:30;cursor:pointer;
  box-shadow:0 8px 32px rgba(255,107,53,.5);
  transition:transform .42s cubic-bezier(.34,1.56,.64,1),background .15s;
  overflow:hidden;min-width:220px;
}
#hdr-cart-btn.on{transform:translateX(-50%) translateY(0)}
#hdr-cart-btn:hover{background:var(--accent-d)}
#hdr-cart-btn:active{transform:translateX(-50%) translateY(0) scale(.97) !important}
#cart-count-badge{
  background:rgba(0,0,0,.22);border-radius:999px;
  padding:4px 11px;font-size:13px;font-weight:700;
  margin:11px 6px 11px 16px;flex-shrink:0;
}
#cart-pill-mid{flex:1;text-align:center;font-size:14px;font-weight:700;padding:0 2px}
#hdr-cart-total{
  background:rgba(0,0,0,.15);padding:11px 18px;
  font-size:14px;font-weight:700;
  border-left:1px solid rgba(255,255,255,.15);flex-shrink:0;
}

/* ── Categorías ── */
#cats-wrap{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
#cats-bar{display:flex;gap:8px;padding:12px 16px;overflow-x:auto;scrollbar-width:none}
#cats-bar::-webkit-scrollbar{display:none}
.chip{
  background:transparent;border:1.5px solid var(--line2);border-radius:999px;
  color:var(--sub);font-size:13px;font-weight:600;
  padding:7px 20px;white-space:nowrap;cursor:pointer;flex-shrink:0;transition:all .15s;
}
.chip.active{background:var(--text);border-color:var(--text);color:#fff}
.chip:not(.active):hover{border-color:var(--accent);color:var(--accent)}

/* ── Productos ── */
#prods-wrap{max-width:560px;margin:0 auto;padding:20px 14px 130px}
.cat-section{margin-bottom:32px}
.cat-title{
  font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin-bottom:14px;
  display:flex;align-items:center;gap:10px;
}
.cat-title::after{content:'';flex:1;height:1px;background:var(--line)}
.prods-grid{display:grid;gap:10px}

/* ── Tarjeta producto ── */
.pc{
  background:var(--card);border:1.5px solid var(--line);border-radius:var(--r);
  padding:16px 14px 16px 20px;
  display:flex;align-items:center;gap:14px;
  transition:border-color .15s,box-shadow .15s,transform .12s;
  position:relative;overflow:hidden;cursor:default;
}
.pc-accent-bar{
  position:absolute;left:0;top:0;bottom:0;width:4px;
  background:var(--accent);transform:scaleY(0);transform-origin:bottom;
  transition:transform .25s cubic-bezier(.22,1,.36,1);
}
.pc.en-carrito .pc-accent-bar{transform:scaleY(1)}
.pc.en-carrito{border-color:rgba(255,107,53,.28);box-shadow:0 4px 20px rgba(255,107,53,.1)}
.pc:not(.en-carrito):hover{box-shadow:0 3px 18px rgba(0,0,0,.08);transform:translateY(-1px)}
.pc-info{flex:1;min-width:0}
.pc-n{font-size:15px;font-weight:600;line-height:1.35;color:var(--text)}
.pc-desc{font-size:12px;color:var(--sub);margin-top:3px;line-height:1.45}
.pc-p{font-size:18px;font-weight:700;color:var(--accent);margin-top:8px;letter-spacing:-.01em}
.qc{display:flex;align-items:center;gap:8px;flex-shrink:0}
.qb{
  width:38px;height:38px;border-radius:999px;
  border:1.5px solid var(--line2);background:var(--bg);
  color:var(--text);font-size:21px;line-height:1;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:all .12s;font-family:var(--f);flex-shrink:0;user-select:none;
}
.qb:active{transform:scale(.84)}
.qb:hover{background:var(--text);border-color:var(--text);color:#fff}
.qb.plus{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 3px 12px rgba(255,107,53,.4)}
.qb.plus:hover{background:var(--accent-d);border-color:var(--accent-d)}
.qb.plus:active{transform:scale(.84)}
.qq{font-size:16px;font-weight:700;min-width:22px;text-align:center;color:var(--text)}

/* ── Vacío ── */
.empty-state{text-align:center;padding:80px 24px;color:var(--muted)}
.empty-ico{font-size:54px;margin-bottom:16px}
.empty-txt{font-size:16px;font-weight:500;line-height:1.55;color:var(--sub)}

/* ── Panel carrito ── */
#ped-panel{
  position:fixed;inset:0;background:rgba(12,10,8,.65);z-index:40;
  display:none;align-items:flex-end;justify-content:center;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
}
#ped-panel.open{display:flex}
#ped-inner{
  background:var(--card);border-radius:28px 28px 0 0;
  width:100%;max-width:560px;max-height:90vh;
  display:flex;flex-direction:column;overflow:hidden;
  box-shadow:0 -10px 50px rgba(0,0,0,.2);
}
#ped-drag{width:36px;height:4px;background:var(--line2);border-radius:2px;margin:14px auto 8px;flex-shrink:0}
#ped-head{
  padding:6px 20px 16px;border-bottom:1px solid var(--line);
  flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
}
#ped-head h3{font-family:var(--ft);font-size:24px;letter-spacing:1.5px;color:var(--text)}
#ped-close{
  background:var(--bg);border:1.5px solid var(--line);color:var(--sub);
  width:32px;height:32px;border-radius:999px;
  display:flex;align-items:center;justify-content:center;
  font-size:16px;cursor:pointer;transition:.12s;padding:0;
}
#ped-close:hover{background:var(--line2);color:var(--text)}
#ped-scroll{flex:1;overflow:auto;padding:8px 20px 12px}
#ped-items{display:grid}
.pi{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.pi:last-child{border-bottom:none}
.pi-qc{display:flex;align-items:center;gap:6px;flex-shrink:0}
.pi-qb{
  width:32px;height:32px;border-radius:999px;
  border:1.5px solid var(--line2);background:var(--bg);
  color:var(--text);font-size:18px;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:.12s;user-select:none;
}
.pi-qb:hover{background:var(--text);border-color:var(--text);color:#fff}
.pi-qb:active{transform:scale(.86)}
.pi-qty{font-size:15px;font-weight:700;min-width:18px;text-align:center;color:var(--text)}
.pi-n{flex:1;font-size:14px;font-weight:500;color:var(--text);line-height:1.35}
.pi-t{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap}
#ped-footer{
  padding:16px 20px;border-top:1px solid var(--line);flex-shrink:0;
  padding-bottom:max(18px,env(safe-area-inset-bottom));
}
#ped-total-row{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:16px;padding:14px 18px;
  background:var(--bg);border-radius:14px;border:1px solid var(--line);
}
#ped-total-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em}
#ped-total{font-size:26px;font-weight:700;color:var(--text);letter-spacing:-.02em}
#btn-pagar{
  width:100%;background:var(--accent);border:none;border-radius:16px;
  color:#fff;font-size:16px;font-weight:700;padding:17px 20px;
  cursor:pointer;transition:background .15s,transform .1s;
  display:flex;align-items:center;justify-content:space-between;
  box-shadow:0 5px 22px rgba(255,107,53,.4);
}
#btn-pagar:hover{background:var(--accent-d)}
#btn-pagar:active{transform:scale(.99)}
#btn-pagar:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
#btn-seguir{
  width:100%;background:none;border:1.5px solid var(--line);border-radius:16px;
  color:var(--sub);font-size:14px;font-weight:500;padding:13px;
  margin-top:10px;cursor:pointer;transition:.12s;
}
#btn-seguir:hover{border-color:var(--line2);color:var(--text)}
</style>
</head>
<body>

<div id="loading">
  <div class="ld-brand" id="ld-brand">MENÚ<span>Cargando…</span></div>
  <div class="spinner"></div>
</div>

<div id="hdr">
  <img id="hdr-logo" alt="">
  <div class="hdr-text">
    <div id="hdr-nombre">Menú</div>
    <div id="hdr-sub">Seleccioná lo que querés pedir</div>
  </div>
</div>

<div id="cats-wrap"><div id="cats-bar"></div></div>

<div id="prods-wrap"><div id="prods"></div></div>

<button id="hdr-cart-btn" onclick="abrirPed()">
  <span id="cart-count-badge">0</span>
  <span id="cart-pill-mid">Ver pedido</span>
  <span id="hdr-cart-total">$ 0</span>
</button>

<!-- Carrito -->
<div id="ped-panel" onclick="if(event.target===this)cerrarPed()">
  <div id="ped-inner">
    <div id="ped-drag"></div>
    <div id="ped-head">
      <h3>TU PEDIDO</h3>
      <button id="ped-close" onclick="cerrarPed()">✕</button>
    </div>
    <div id="ped-scroll"><div id="ped-items"></div></div>
    <div id="ped-footer">
      <div id="ped-total-row">
        <span id="ped-total-label">Total</span>
        <span id="ped-total">$ 0</span>
      </div>
      <button id="btn-pagar" onclick="pagar()">
        <span>Pagar con MercadoPago</span>
        <span style="font-size:20px">→</span>
      </button>
      <button id="btn-seguir" onclick="cerrarPed()">← Seguir eligiendo</button>
    </div>
  </div>
</div>

<script>
let _m={categorias:[],productos:[]},_cfg={},_carr={},_cat='',_mp=false;

async function init(){
  try {
    const r=await fetch('/gestion-comandas/api/menu-publico').then(r=>r.json());
    if(r.ok){_m=r.menu;_cfg=r.config;_mp=r.mpActivo;}
  } catch(e){}
  const ng=(_cfg||{}).negocio||{};
  const nombre=ng.nombre||'Menú';
  document.getElementById('hdr-nombre').textContent=nombre;
  const lb=document.getElementById('ld-brand');
  if(lb) lb.innerHTML=nombre.toUpperCase()+'<span>Seleccioná lo que querés</span>';
  if(ng.logoBase64){const im=document.getElementById('hdr-logo');im.src=ng.logoBase64;im.style.display='block';}
  if(!_mp){
    document.getElementById('btn-pagar').textContent='Pagos no disponibles';
    document.getElementById('btn-pagar').disabled=true;
  }
  document.getElementById('loading').style.display='none';
  renderCats();renderProds();
}

function renderCats(){
  const bar=document.getElementById('cats-bar');
  const cats=_m.categorias||[];
  bar.innerHTML=cats.map(c=>\`<button class="chip\${_cat===c?' active':''}" onclick="setCat('\${esc(c)}')">\${esc(c)}</button>\`).join('');
  if(!_cat&&cats.length){_cat=cats[0];bar.firstChild&&bar.firstChild.classList.add('active');}
}

function setCat(c){_cat=c;renderCats();renderProds();document.getElementById('prods-wrap').scrollIntoView({behavior:'smooth'});}

function renderProds(){
  const prods=(_m.productos||[]);
  const cats=_m.categorias||[];
  const wrap=document.getElementById('prods');
  if(!prods.length){wrap.innerHTML=\`<div class="empty-state"><div class="empty-ico">🍽️</div><div class="empty-txt">El menú está siendo actualizado…</div></div>\`;return;}
  // Si hay categoría activa, mostrar solo esa; sino todas
  const mostrar=_cat?[_cat]:cats;
  wrap.innerHTML=mostrar.map(cat=>{
    const ps=prods.filter(p=>p.categoria===cat);
    if(!ps.length) return '';
    return \`<div class="cat-section">
      \${cats.length>1?\`<div class="cat-title">\${esc(cat)}</div>\`:''}
      <div class="prods-grid">\${ps.map(p=>{
        const qty=_carr[p.id]||0;
        return \`<div class="pc\${qty>0?' en-carrito':''}" id="pc\${p.id}">
          <div class="pc-accent-bar"></div>
          <div class="pc-info">
            <div class="pc-n">\${esc(p.nombre)}</div>
            <div class="pc-p">$ \${Number(p.precio).toLocaleString('es-AR')}</div>
          </div>
          <div class="qc">
            \${qty>0?\`<button class="qb" onclick="ch(\${p.id},-1)">−</button><span class="qq">\${qty}</span>\`:''}
            <button class="qb plus" onclick="ch(\${p.id},1)">+</button>
          </div>
        </div>\`;
      }).join('')}</div>
    </div>\`;
  }).join('');
}

function ch(id,d){
  _carr[id]=Math.max(0,(_carr[id]||0)+d);
  if(!_carr[id])delete _carr[id];
  actualizarHdr();
  // Re-render solo el prod sin redibujar todo
  const p=_m.productos.find(x=>x.id==id);
  if(p){
    const qty=_carr[id]||0;
    const el=document.getElementById('pc'+id);
    if(el){
      el.classList.toggle('en-carrito',qty>0);
      el.querySelector('.qc').innerHTML=\`\${qty>0?\`<button class="qb" onclick="ch(\${id},-1)" style="user-select:none">−</button><span class="qq">\${qty}</span>\`:''}<button class="qb plus" onclick="ch(\${id},1)" style="user-select:none">+</button>\`;
    }
  }
  if(document.getElementById('ped-panel').classList.contains('open')) renderPedItems();
}

function total(){return Object.entries(_carr).reduce((s,[id,q])=>{const p=_m.productos.find(x=>x.id==id);return s+(p?p.precio*q:0);},0);}
function count(){return Object.values(_carr).reduce((s,q)=>s+q,0);}

function actualizarHdr(){
  const t=total(),n=count();
  const btn=document.getElementById('hdr-cart-btn');
  btn.classList.toggle('on',n>0);
  document.getElementById('hdr-cart-total').textContent='$ '+Math.round(t).toLocaleString('es-AR');
  document.getElementById('cart-count-badge').textContent=n;
}

function renderPedItems(){
  const items=Object.entries(_carr).map(([id,q])=>{const p=_m.productos.find(x=>x.id==id);return p?{...p,qty:q}:null;}).filter(Boolean);
  document.getElementById('ped-items').innerHTML=items.length?items.map(i=>\`
    <div class="pi">
      <div class="pi-qc">
        <button class="pi-qb" onclick="ch(\${i.id},-1)">−</button>
        <span class="pi-qty">\${i.qty}</span>
        <button class="pi-qb" onclick="ch(\${i.id},1)">+</button>
      </div>
      <span class="pi-n">\${esc(i.nombre)}</span>
      <span class="pi-t">$ \${(i.precio*i.qty).toLocaleString('es-AR')}</span>
    </div>\`).join(''):'<div style="color:var(--muted);text-align:center;padding:20px">Carrito vacío</div>';
  document.getElementById('ped-total').textContent='$ '+Math.round(total()).toLocaleString('es-AR');
}

function abrirPed(){renderPedItems();document.getElementById('ped-panel').classList.add('open');}
function cerrarPed(){document.getElementById('ped-panel').classList.remove('open');}

async function pagar(){
  const btn=document.getElementById('btn-pagar');
  btn.disabled=true;btn.innerHTML='<span class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block"></span>';
  const items=Object.entries(_carr).map(([id,q])=>{const p=_m.productos.find(x=>x.id==id);return p?{id:p.id,nombre:p.nombre,precio:p.precio,qty:q}:null;}).filter(Boolean);
  try {
    const r=await fetch('/gestion-comandas/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})}).then(r=>r.json());
    if(r.ok&&r.checkoutUrl)window.location.href=r.checkoutUrl;
    else{btn.disabled=false;btn.innerHTML='<span>Pagar con MercadoPago</span><span>→</span>';alert(r.error||'Error al procesar el pago');}
  } catch(e){btn.disabled=false;btn.innerHTML='<span>Pagar con MercadoPago</span><span>→</span>';alert('Error de conexión');}
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
init();
</script>
</body>
</html>`;
}

function pagoOkHtml() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago aprobado</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#faf9f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;overflow:hidden}.card{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;max-width:340px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.10);position:relative;z-index:1}.ico{font-size:64px;margin-bottom:16px;animation:pop .5s cubic-bezier(.36,.07,.19,.97)}@keyframes pop{0%{transform:scale(0)}80%{transform:scale(1.1)}100%{transform:scale(1)}}.ttl{font-size:24px;font-weight:700;color:#1a1815;margin-bottom:8px}.sub{font-size:14px;color:#6b6760;margin-bottom:20px;line-height:1.5}.num{font-size:32px;font-weight:800;color:#ff6b35;margin-bottom:8px;font-variant-numeric:tabular-nums}.num-label{font-size:11px;color:#b0ada7;margin-bottom:24px;text-transform:uppercase;letter-spacing:.08em}.steps{background:#faf9f7;border-radius:12px;padding:14px 16px;margin-bottom:24px;text-align:left;font-size:13px;color:#4a4845;line-height:2}.btn{background:#ff6b35;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;padding:15px 24px;cursor:pointer;width:100%;transition:background .15s}.btn:hover{background:#e85c28}.confetti{position:fixed;pointer-events:none;top:0;left:0;width:100%;height:100%;z-index:0}</style></head><body><canvas class="confetti" id="c"></canvas><div class="card"><div class="ico">🎉</div><div class="ttl">¡Pago aprobado!</div><div class="sub">Tu pedido fue recibido y está siendo preparado con todo el amor.</div><div class="num" id="ref">—</div><div class="num-label">Número de pedido</div><div class="steps">📋 El equipo ya lo recibió<br>⏱ Tiempo estimado: 15-20 min<br>🛎 Te avisamos cuando esté listo</div><button class="btn" onclick="location.href='/gestion-comandas/pedidos'">Pedir más cosas →</button></div><script>const r=new URLSearchParams(location.search).get('external_reference');if(r)document.getElementById('ref').textContent=r.replace('PED-','#');const c=document.getElementById('c'),ctx=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const cols=['#ff6b35','#4ade80','#fbbf24','#60a5fa','#f472b6','#f2ede8'];const pts=Array.from({length:80},()=>({x:Math.random()*c.width,y:Math.random()*c.height-c.height,r:Math.random()*5+3,col:cols[Math.floor(Math.random()*cols.length)],vx:(Math.random()-.5)*2,vy:Math.random()*3+2,rot:Math.random()*360,vr:Math.random()*5-2.5}));let af;function draw(){ctx.clearRect(0,0,c.width,c.height);pts.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);ctx.fillStyle=p.col;ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);ctx.restore();p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;if(p.y>c.height+20)p.y=-20;});af=requestAnimationFrame(draw);}draw();setTimeout(()=>cancelAnimationFrame(af),6000);<\/script></body></html>`;
}

function pagoPendienteHtml() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago pendiente</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#faf9f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#fff;border-radius:16px;padding:36px 28px;text-align:center;max-width:340px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.07)}.ico{font-size:54px;margin-bottom:14px}.ttl{font-size:21px;font-weight:700;color:#1a1815;margin-bottom:7px}.sub{font-size:14px;color:#6b6760;margin-bottom:20px}.btn{background:#ff6b35;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;padding:13px 24px;cursor:pointer;width:100%}</style></head><body><div class="card"><div class="ico">⏳</div><div class="ttl">Pago pendiente</div><div class="sub">Tu pago está siendo procesado. Te notificaremos cuando se confirme.</div><button class="btn" onclick="location.href='/gestion-comandas/pedidos'">Volver al menú</button></div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// Router principal
// ════════════════════════════════════════════════════════════════════════════
async function handle(request, response, options = {}) {
  const url    = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const p      = url.pathname.replace(/\/$/, '') || '/'; // normaliza trailing slash
  const method = request.method;
  const publicOnly = Boolean(options.publicOnly);

  if (!p.startsWith('/gestion-comandas')) return false; // no es nuestro

  // ── Páginas públicas ─────────────────────────────────────────────────────
  if (method === 'GET' && p === '/gestion-comandas/pedidos')            return sendHtml(response, publicHtml()),     true;
  if (method === 'GET' && p === '/gestion-comandas/pedidos/pago-ok')    return sendHtml(response, pagoOkHtml()),     true;
  if (method === 'GET' && p === '/gestion-comandas/pedidos/pago-pendiente') return sendHtml(response, pagoPendienteHtml()), true;

  // ── Panel (sin restricción extra; el ERP ya tiene auth de cookies) ───────
  if (
    publicOnly &&
    !(method === 'GET' && p === '/gestion-comandas/api/menu-publico') &&
    !(method === 'POST' && p === '/gestion-comandas/api/checkout') &&
    !(method === 'POST' && p === '/gestion-comandas/api/mp-webhook') &&
    !(isPrintRequestAuthorized(request) && method === 'GET' && p === '/gestion-comandas/api/impresion/pendientes') &&
    !(isPrintRequestAuthorized(request) && method === 'POST' && p === '/gestion-comandas/api/impresion/error') &&
    method !== 'OPTIONS'
  ) return false;

  if (method === 'GET' && p === '/gestion-comandas') return sendHtml(response, panelHtml()), true;

  // CORS preflight
  if (method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' }); response.end(); return true; }

  // ── API pública ──────────────────────────────────────────────────────────
  if (method === 'GET' && p === '/gestion-comandas/api/menu-publico') {
    const db = dbLoad();
    sendJson(response, { ok: true, menu: db.menu, config: { negocio: db.config.negocio }, mpActivo: Boolean(process.env.MP_ACCESS_TOKEN) });
    return true;
  }

  if (method === 'POST' && p === '/gestion-comandas/api/checkout') {
    const db   = dbLoad();
    const body = await readBody(request);
    if (!process.env.MP_ACCESS_TOKEN) { sendJson(response, { ok: false, error: 'Pagos no configurados en el servidor' }, 400); return true; }
    try {
      const pedidoId = 'PED-' + Date.now();
      const pub      = db.config.publicUrl || '';
      const url      = await crearPreferenciaMp(pedidoId, body.items || [], pub);
      db.pedidosPendientes.push({ id: pedidoId, items: body.items || [], fecha: Date.now(), estado: 'pendiente' });
      dbSave();
      sendJson(response, { ok: true, checkoutUrl: url, pedidoId });
    } catch (e) { sendJson(response, { ok: false, error: e.message }, 500); }
    return true;
  }

  if (method === 'POST' && p === '/gestion-comandas/api/mp-webhook') {
    response.writeHead(200); response.end('OK');
    try {
      const body = await readBody(request);
      if (body.type === 'payment' && body.data?.id) {
        const { MercadoPagoConfig, Payment } = require('mercadopago');
        const client   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const payment  = await new Payment(client).get({ id: body.data.id });
        if (payment.status === 'approved') {
          const db     = dbLoad();
          const pedido = db.pedidosPendientes.find(x => x.id === payment.external_reference && x.estado === 'pendiente');
          if (pedido) {
            pedido.estado = 'pagado';
            const ticket = { id: Date.now(), mesa: 'QR', origen: 'autoservicio', createdAt: Date.now(), estado: 'activo', items: (pedido.items || []).map(i => ({ ...i, listo: false })) };
            db.tickets.push(ticket);
            db.ventas.push({ id: Date.now(), ticketId: ticket.id, mesa: 'QR', origen: 'autoservicio', items: ticket.items, total: ticket.items.reduce((s, i) => s + (i.precio * (i.qty || 1)), 0), fecha: Date.now() });
            dbSave();
            broadcast('comandas:ticket:nuevo', { tickets: db.tickets.filter(t => t.estado === 'activo') });
            dispararImpresion(ticket);
          }
        }
      }
    } catch (e) { console.error('[Comandas] MP webhook error:', e.message); }
    return true;
  }

  // ── API del panel ────────────────────────────────────────────────────────
  if (method === 'GET' && p === '/gestion-comandas/api/estado') {
    const db = dbLoad();
    sendJson(response, { ok: true, menu: db.menu, config: db.config, tickets: db.tickets.filter(t => t.estado === 'activo'), mpActivo: Boolean(process.env.MP_ACCESS_TOKEN) });
    return true;
  }

  if (method === 'GET' && p === '/gestion-comandas/api/ventas') {
    sendJson(response, { ok: true, ventas: dbLoad().ventas });
    return true;
  }

  if (method === 'POST' && p === '/gestion-comandas/api/comandas') {
    const db   = dbLoad();
    const body = await readBody(request);
    const newItems = (body.items || []).map(i => ({ ...i, listo: false }));
    // Merge en ticket existente de esa mesa
    const existing = db.tickets.find(t => t.mesa === body.mesa && t.estado === 'activo');
    if (existing) {
      newItems.forEach(ni => {
        const ex = existing.items.find(i => i.id === ni.id);
        if (ex) ex.qty = (ex.qty || 1) + (ni.qty || 1);
        else existing.items.push(ni);
      });
      dbSave();
      broadcast('comandas:ticket:actualizado', { tickets: db.tickets.filter(t => t.estado === 'activo') });
      dispararImpresion({ ...existing, items: newItems });
      sendJson(response, { ok: true, ticket: existing, tickets: db.tickets.filter(t => t.estado === 'activo') });
      return true;
    }
    const ticket = { id: Date.now(), mesa: body.mesa, dispositivo: body.dispositivo || 'Panel', origen: body.origen || 'mozo', createdAt: Date.now(), estado: 'activo', items: newItems };
    db.tickets.push(ticket);
    dbSave();
    broadcast('comandas:ticket:nuevo', { tickets: db.tickets.filter(t => t.estado === 'activo') });
    dispararImpresion(ticket);
    sendJson(response, { ok: true, ticket, tickets: db.tickets.filter(t => t.estado === 'activo') });
    return true;
  }

  const toggleMatch = p.match(/^\/gestion-comandas\/api\/tickets\/(\d+)\/items\/(\d+)\/toggle$/);
  if (method === 'POST' && toggleMatch) {
    const db  = dbLoad();
    const tid = Number(toggleMatch[1]);
    const idx = Number(toggleMatch[2]);
    const t   = db.tickets.find(x => x.id === tid);
    if (t && t.items[idx]) t.items[idx].listo = !t.items[idx].listo;
    dbSave();
    broadcast('comandas:ticket:actualizado', { tickets: db.tickets.filter(x => x.estado === 'activo') });
    sendJson(response, { ok: true, tickets: db.tickets.filter(x => x.estado === 'activo') });
    return true;
  }

  const delMatch = p.match(/^\/gestion-comandas\/api\/tickets\/(\d+)$/);
  if (method === 'DELETE' && delMatch) {
    const db  = dbLoad();
    const tid = Number(delMatch[1]);
    const t   = db.tickets.find(x => x.id === tid);
    if (t) {
      t.estado = 'cerrado';
      db.ventas.push({ id: Date.now(), ticketId: t.id, mesa: t.mesa, origen: t.origen || 'mozo', items: t.items, total: (t.items || []).reduce((s, i) => s + (i.precio * (i.qty || 1)), 0), fecha: Date.now() });
      dbSave();
      broadcast('comandas:ticket:actualizado', { tickets: db.tickets.filter(x => x.estado === 'activo') });
    }
    sendJson(response, { ok: true, tickets: db.tickets.filter(x => x.estado === 'activo') });
    return true;
  }

  if (method === 'PUT' && p === '/gestion-comandas/api/menu') {
    const db  = dbLoad();
    const body = await readBody(request);
    db.menu = body;
    dbSave();
    broadcast('comandas:menu:actualizado', db.menu);
    sendJson(response, { ok: true });
    return true;
  }

  if (method === 'PUT' && p === '/gestion-comandas/api/config') {
    const db   = dbLoad();
    const body = await readBody(request);
    if (body.negocio)    db.config.negocio    = Object.assign(db.config.negocio, body.negocio);
    if (body.estaciones) db.config.estaciones = Object.assign(db.config.estaciones, body.estaciones);
    if (body.publicUrl !== undefined) db.config.publicUrl = body.publicUrl;
    if (body.mesas     !== undefined) db.config.mesas     = Number(body.mesas);
    dbSave();
    broadcast('comandas:config:actualizado', db.config);
    sendJson(response, { ok: true });
    return true;
  }

  // ── Cola de impresión (polling desde agente local) ───────────────────────
  if (method === 'GET' && p === '/gestion-comandas/api/impresion/pendientes') {
    const db = dbLoad();
    const pendientes = db.printQueue.filter(j => !j.impreso);
    // Marcar como "en proceso" para evitar doble reclamo si el agente tarda
    pendientes.forEach(j => { j.impreso = true; });
    if (pendientes.length) dbSave();
    sendJson(response, { ok: true, trabajos: pendientes });
    return true;
  }

  if (method === 'POST' && p === '/gestion-comandas/api/impresion/error') {
    // El agente reporta que no pudo imprimir; se devuelve a la cola
    const db   = dbLoad();
    const body = await readBody(request);
    const ids  = Array.isArray(body.ids) ? body.ids : [];
    db.printQueue.forEach(j => { if (ids.includes(j.id)) j.impreso = false; });
    if (ids.length) dbSave();
    sendJson(response, { ok: true });
    return true;
  }

  if (method === 'GET' && p === '/gestion-comandas/api/qr') {
    const db  = dbLoad();
    const qrUrl = (db.config.publicUrl || `http://localhost:3080`) + '/gestion-comandas/pedidos';
    try {
      const buf = await generarQR(qrUrl);
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="qr-menu.png"' });
      response.end(buf);
    } catch (e) {
      sendJson(response, { ok: false, error: 'qrcode no disponible: ' + e.message }, 500);
    }
    return true;
  }

  return false; // ruta no manejada
}

module.exports = { handle, setupWebSocket, dbLoad };
