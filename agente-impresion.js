/**
 * Agente de impresión — Gratitud Gourmet
 * Corre en la compu con la impresora USB conectada.
 * Polling cada N segundos a la API de comandas, formatea tickets
 * en ESC/POS y los manda directo a la impresora usando la API
 * de Windows (sin drivers intermedios ni GDI).
 */

'use strict';

const http       = require('http');
const https      = require('https');
const { execSync } = require('child_process');
const fs         = require('fs');
const os         = require('os');
const path       = require('path');

// ── Configuración ────────────────────────────────────────────
const CONFIG = {
  apiBase:      process.env.COMANDAS_API_BASE || 'http://localhost:3080/gestion-comandas/api',
  printerName:  process.env.COMANDAS_PRINTER_NAME || 'POS-80C',        // nombre exacto en Windows (Get-Printer)
  printToken:   process.env.COMANDAS_PRINT_TOKEN || '',
  pollMs:       Number(process.env.COMANDAS_PRINT_POLL_MS || 4000),             // cada 4 segundos
  paperWidth:   32,               // caracteres por línea (80mm ≈ 42ch, 58mm ≈ 32ch)
};

// ── ESC/POS helpers ──────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;

function buf(...args) {
  const arr = [];
  for (const a of args) {
    if (Array.isArray(a))         arr.push(...a);
    else if (Buffer.isBuffer(a))  arr.push(...a);
    else if (typeof a === 'string') arr.push(...Buffer.from(a, 'latin1'));
    else                          arr.push(a);
  }
  return Buffer.from(arr);
}

const CMD = {
  init:       buf(ESC, 0x40),
  cut:        buf(GS,  0x56, 0x42, 0x03),  // corte parcial
  lf:         buf(0x0A),
  lfx: (n) => Buffer.alloc(n, 0x0A),
  bold:       buf(ESC, 0x45, 0x01),
  boldOff:    buf(ESC, 0x45, 0x00),
  center:     buf(ESC, 0x61, 0x01),
  left:       buf(ESC, 0x61, 0x00),
  right:      buf(ESC, 0x61, 0x02),
  doubleH:    buf(ESC, 0x21, 0x10),   // doble altura
  doubleHW:   buf(ESC, 0x21, 0x30),   // doble altura + ancho
  normal:     buf(ESC, 0x21, 0x00),
  divider: (ch = '-') => buf(ch.repeat(CONFIG.paperWidth) + '\n'),
};

function linea(texto, ancho = CONFIG.paperWidth) {
  return buf(texto.slice(0, ancho).padEnd(ancho) + '\n');
}
function lineaC(texto, ancho = CONFIG.paperWidth) {
  const t = texto.slice(0, ancho);
  const pad = Math.floor((ancho - t.length) / 2);
  return buf(' '.repeat(pad) + t + '\n');
}
function lineaRL(left, right, ancho = CONFIG.paperWidth) {
  const l = left.slice(0, ancho - right.length - 1);
  const spaces = ancho - l.length - right.length;
  return buf(l + ' '.repeat(Math.max(1, spaces)) + right + '\n');
}

// ── Formatear ticket ─────────────────────────────────────────
function formatearTicketEstacion(job) {
  const { ticket, datosNegocio = {}, estacion } = job;
  const negocio = datosNegocio.negocio || {};
  const nombre  = negocio.nombre || 'Gratitud Gourmet';
  const pie     = negocio.mensajePie || '';
  const items   = (ticket.items || []).filter(i => (i.estacion || 'cocina') === estacion);
  const fecha   = new Date(ticket.createdAt || Date.now());
  const hora    = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

  const partes = [
    CMD.init,
    CMD.center,
    CMD.bold, CMD.doubleHW,
    buf(nombre.toUpperCase() + '\n'),
    CMD.normal, CMD.boldOff,
    CMD.divider('='),
    CMD.bold,
    lineaC(`ESTACION: ${estacion.toUpperCase()}`),
    CMD.boldOff,
    CMD.divider(),
    CMD.left,
    CMD.bold,
    lineaRL(`MESA: ${ticket.mesa}`, hora),
    CMD.boldOff,
    lineaRL(`Fecha: ${fechaStr}`, `Ticket #${ticket.id}`),
    ticket.dispositivo ? linea(`Mozo: ${ticket.dispositivo}`) : buf(''),
    CMD.divider(),
    CMD.bold,
    linea('CANT  PRODUCTO'),
    CMD.boldOff,
    CMD.divider('-'),
  ];

  for (const it of items) {
    const cant = String(it.cantidad || 1).padStart(3);
    const prod = it.nombre || '?';
    const nota = it.nota;
    const prec = it.precio ? `$${Number(it.precio * (it.cantidad||1)).toLocaleString('es-AR')}` : '';
    partes.push(lineaRL(`${cant}x ${prod}`, prec));
    if (nota) partes.push(linea(`     * ${nota}`));
  }

  if (ticket.notaGeneral) {
    partes.push(CMD.divider('-'));
    partes.push(linea('NOTA:'));
    partes.push(linea(ticket.notaGeneral));
  }

  partes.push(CMD.divider('='));

  if (pie) {
    partes.push(CMD.center, lineaC(pie));
  }

  partes.push(CMD.lfx(4), CMD.cut);

  return Buffer.concat(partes);
}

// ── Imprimir via Windows API (winspool.drv) ──────────────────
const PS_RAWPRINT_BODY = `
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  public struct DOCINFOW { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]
  public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr h,int lv,ref DOCINFOW di);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h,IntPtr p,int n,out int w);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
}
"@ -Language CSharp
$printerName = '{{PRINTER}}'
$filePath    = '{{FILE}}'
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$hPrinter = [IntPtr]::Zero
if (-not [RawPrint]::OpenPrinter($printerName,[ref]$hPrinter,[IntPtr]::Zero)) { throw "OpenPrinter failed: $printerName" }
$di = New-Object RawPrint+DOCINFOW
$di.pDocName="Comanda"; $di.pOutputFile=$null; $di.pDataType="RAW"
[RawPrint]::StartDocPrinter($hPrinter,1,[ref]$di) | Out-Null
[RawPrint]::StartPagePrinter($hPrinter) | Out-Null
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes,0,$ptr,$bytes.Length)
$written = 0
[RawPrint]::WritePrinter($hPrinter,$ptr,$bytes.Length,[ref]$written) | Out-Null
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
[RawPrint]::EndPagePrinter($hPrinter) | Out-Null
[RawPrint]::EndDocPrinter($hPrinter) | Out-Null
[RawPrint]::ClosePrinter($hPrinter) | Out-Null
Write-Host "OK $written bytes"
`;

function imprimirBuffer(escposBuffer) {
  const tmpFile = path.join(os.tmpdir(), `ticket_${Date.now()}.bin`);
  const psFile  = path.join(os.tmpdir(), `rawprint_${Date.now()}.ps1`);
  fs.writeFileSync(tmpFile, escposBuffer);
  const script = PS_RAWPRINT_BODY
    .replace('{{PRINTER}}', CONFIG.printerName.replace(/'/g, "''"))
    .replace('{{FILE}}',    tmpFile.replace(/\\/g, '\\\\').replace(/'/g, "''"));
  fs.writeFileSync(psFile, script, 'utf8');
  try {
    const out = execSync(
      `powershell -NonInteractive -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 10000 }
    );
    console.log(`[Print] ${out.toString().trim()}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(psFile);  } catch {}
  }
}

// ── HTTP helper ──────────────────────────────────────────────
function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      method,
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers:  {
        'Content-Type': 'application/json',
        ...(CONFIG.printToken ? { 'X-Comandas-Print-Token': CONFIG.printToken } : {}),
      },
    };
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Loop principal ───────────────────────────────────────────
let corriendo = false;

async function poll() {
  if (corriendo) return;
  corriendo = true;
  try {
    const res = await request('GET', `${CONFIG.apiBase}/impresion/pendientes`);
    const jobs = Array.isArray(res) ? res : (Array.isArray(res?.trabajos) ? res.trabajos : []);
    if (jobs.length) {
      console.log(`[Agente] ${jobs.length} trabajo(s) de impresión`);
    }
    const errores = [];
    for (const job of jobs) {
      try {
        const bytes = formatearTicketEstacion(job);
        imprimirBuffer(bytes);
        console.log(`[Agente] ✓ Impreso ticket #${job.ticket?.id} estación ${job.estacion}`);
      } catch (e) {
        console.error(`[Agente] ✗ Error imprimiendo ${job.id}:`, e.message);
        errores.push(job.id);
      }
    }
    if (errores.length) {
      await request('POST', `${CONFIG.apiBase}/impresion/error`, { ids: errores });
    }
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') {
      console.error('[Agente] Error de comunicación:', e.message);
    }
  }
  corriendo = false;
}

// ── Ticket de prueba ─────────────────────────────────────────
function imprimirPrueba() {
  const job = {
    estacion: 'cocina',
    ticket: {
      id: 999,
      mesa: '5',
      dispositivo: 'Mozo 1',
      createdAt: Date.now(),
      items: [
        { nombre: 'Milanesa napolitana', cantidad: 2, precio: 1800, estacion: 'cocina' },
        { nombre: 'Ensalada mixta', cantidad: 1, precio: 950, estacion: 'cocina', nota: 'sin cebolla' },
        { nombre: 'Agua mineral', cantidad: 3, precio: 400, estacion: 'cocina' },
      ],
      notaGeneral: 'Alergia a los frutos secos',
    },
    datosNegocio: {
      negocio: {
        nombre: 'Gratitud Gourmet',
        mensajePie: '¡Gracias por tu preferencia!',
      },
    },
  };
  console.log('[Agente] Imprimiendo ticket de prueba...');
  const bytes = formatearTicketEstacion(job);
  imprimirBuffer(bytes);
  console.log('[Agente] Ticket de prueba enviado.');
}

// ── Arranque ─────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--prueba')) {
  imprimirPrueba();
} else {
  console.log(`[Agente] Iniciando — impresora: ${CONFIG.printerName} | polling: ${CONFIG.pollMs}ms`);
  console.log(`[Agente] API: ${CONFIG.apiBase}`);
  console.log('[Agente] Ctrl+C para detener\n');
  setInterval(poll, CONFIG.pollMs);
  poll();
}
