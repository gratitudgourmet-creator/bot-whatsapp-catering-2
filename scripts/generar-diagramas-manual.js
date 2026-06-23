const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'diagramas-manual-gratitud-gourmet');
fs.mkdirSync(outDir, { recursive: true });

const diagrams = [
  {
    id: '00-flujo-general',
    title: 'Flujo general del evento',
    subtitle: 'Desde la consulta comercial hasta el cierre y mejora',
    lanes: [
      ['Consulta del cliente', 'Recepcion de consulta', 'Presupuesto y cierre comercial'],
      ['Evento confirmado', 'Administracion: pagos, facturacion y condiciones', 'RRHH: personal asignado', 'Bromatologia: requisitos y controles'],
      ['Cocina: produccion y mise en place', 'Compras y proveedores', 'Recepcion e inventario'],
      ['Deposito: preparacion de carga', 'Logistica: traslado de ida', 'Montaje del evento'],
      ['Servicio durante el evento', 'Desmontaje', 'Traslado de vuelta'],
      ['Descarga en deposito', 'Limpieza y mantenimiento', 'Cierre administrativo'],
      ['Control semanal de direccion', 'Acciones de mejora']
    ]
  },
  {
    id: '01-comercial',
    title: 'Area Comercial',
    subtitle: 'Lead, presupuesto, seguimiento y confirmacion',
    lanes: [
      ['Consulta recibida', 'Registrar lead en dashboard', 'Pedir datos minimos'],
      ['Validar evento', 'Consultar cocina/logistica/servicio si corresponde', 'Armar presupuesto'],
      ['Enviar propuesta', 'Registrar estado y proxima accion', 'Hacer seguimiento'],
      ['Cliente acepta?', 'Solicitar sena o autorizacion', 'Cambiar a Confirmed']
    ]
  },
  {
    id: '02-administracion',
    title: 'Area Administracion',
    subtitle: 'Cobros, gastos, pagos y cierre economico',
    lanes: [
      ['Evento confirmado', 'Validar datos fiscales', 'Registrar sena, saldo y condiciones'],
      ['Emitir factura o comprobante', 'Controlar cobros', 'Reclamar saldos si corresponde'],
      ['Cargar gastos del evento', 'Cargar pagos a proveedores y personal', 'Procesar ordenes de pago'],
      ['Calcular rentabilidad', 'Revisar estimado vs real', 'Cerrar evento en dashboard']
    ]
  },
  {
    id: '03-rrhh',
    title: 'Area Personal / RRHH',
    subtitle: 'Asignacion, asistencia y pagos de personal',
    lanes: [
      ['Evento confirmado', 'Definir personal requerido', 'Asignar cocina, mozos, logistica y apoyo'],
      ['Confirmar disponibilidad', 'Buscar reemplazo si falta personal', 'Registrar horarios previstos'],
      ['Controlar asistencia real', 'Registrar horas y adicionales', 'Enviar datos a administracion']
    ]
  },
  {
    id: '04-bromatologia',
    title: 'Area Bromatologia / Calidad',
    subtitle: 'BPM, alergenos, registros y acciones correctivas',
    lanes: [
      ['Evento confirmado', 'Revisar requisitos bromatologicos', 'Controlar BPM e higiene'],
      ['Verificar registros necesarios', 'Controlar alergenos y dietas especiales', 'Controlar rotulado y temperaturas'],
      ['Hay desvio?', 'Registrar no conformidad', 'Definir accion correctiva'],
      ['Liberar continuidad operativa', 'Archivar evidencia']
    ]
  },
  {
    id: '05-cocina-produccion',
    title: 'Area Cocina y Produccion',
    subtitle: 'Menu, produccion, mise en place y entrega a carga',
    lanes: [
      ['Evento confirmado', 'Revisar menu, invitados, horario y formato', 'Revisar restricciones y alergenos'],
      ['Armar lista de produccion', 'Revisar stock disponible', 'Informar faltantes a compras'],
      ['Producir segun prioridad', 'Porcionar y preparar mise en place', 'Rotular preparaciones'],
      ['Conservar segun condicion requerida', 'Entregar a carga con indicaciones de frio, calor o cuidado especial']
    ]
  },
  {
    id: '06-compras-proveedores',
    title: 'Area Compras y Proveedores',
    subtitle: 'Necesidades, proveedores, recepcion e inventario',
    lanes: [
      ['Necesidad de compra', 'Revisar lista del evento', 'Consultar stock antes de comprar'],
      ['Elegir proveedor aprobado', 'Solicitar precio y disponibilidad', 'Emitir orden de compra'],
      ['Coordinar entrega o retiro', 'Recepcion e inventario', 'Controlar conformidad'],
      ['Registrar comprobante y pago pendiente', 'Informar disponibilidad a cocina/deposito']
    ]
  },
  {
    id: '07-deposito-stock-equipamiento',
    title: 'Area Deposito, Stock y Equipamiento',
    subtitle: 'Preparacion de carga, salida, retorno e inventario',
    lanes: [
      ['Abrir ficha y lista de carga', 'Separar vajilla, cristaleria, manteleria y utensilios', 'Separar equipamiento y artefactos'],
      ['Revisar estado, limpieza y funcionamiento', 'Registrar faltantes o roturas', 'Rotular bultos'],
      ['Entregar a carga y descarga', 'Registrar salida', 'Despacho a logistica'],
      ['Retorno del evento', 'Contar contra lista original', 'Actualizar inventario'],
      ['Guardar o derivar a limpieza/reparacion']
    ]
  },
  {
    id: '08-logistica-traslados',
    title: 'Area Logistica y Traslados',
    subtitle: 'Vehiculo, ruta, horarios, ida y vuelta',
    lanes: [
      ['Carga autorizada', 'Revisar direccion, ruta y contacto', 'Revisar vehiculo, combustible y documentacion'],
      ['Registrar hora de salida', 'Avisar salida al coordinador', 'Trasladar con cuidado'],
      ['Registrar llegada', 'Definir zona de descarga', 'Entregar a montaje'],
      ['Fin de evento', 'Registrar salida del lugar', 'Registrar llegada a deposito']
    ]
  },
  {
    id: '09-carga-descarga',
    title: 'Area Carga y Descarga',
    subtitle: 'Movimiento fisico de bultos, equipos, alimentos y mobiliario',
    lanes: [
      ['Lista de carga aprobada', 'Recibir bultos por area', 'Cargar mobiliario y estructuras pesadas'],
      ['Cargar equipamiento', 'Cargar vajilla y cristaleria protegida', 'Cargar manteleria y elementos de servicio'],
      ['Cargar alimentos segun indicacion de cocina', 'Cargar bebidas y hielo', 'Cargar limpieza separado de alimentos'],
      ['Asegurar bultos', 'Descargar segun prioridad de montaje', 'Ubicar bultos en zona definida'],
      ['Desmontaje', 'Embalar y cargar retorno', 'Asegurar carga de regreso']
    ]
  },
  {
    id: '10-montaje',
    title: 'Area Montaje',
    subtitle: 'Armado del servicio en el lugar del evento',
    lanes: [
      ['Llegada al lugar', 'Coordinacion confirma espacio y prioridades', 'Logistica define acceso y descarga'],
      ['Carga y descarga baja bultos', 'Mozos montan mesas, estaciones, vajilla y cristaleria'],
      ['Cocina ubica alimentos y zona de apoyo', 'Equipamiento conecta artefactos seguros'],
      ['Limpieza define zona sucia y residuos', 'Calidad revisa higiene, alergenos y seguridad', 'Servicio listo']
    ]
  },
  {
    id: '11-servicio-mozos',
    title: 'Area Servicio / Mozos',
    subtitle: 'Atencion, reposicion, retiro y experiencia del cliente',
    lanes: [
      ['Servicio listo', 'Briefing del coordinador', 'Inicio en horario acordado'],
      ['Atencion a invitados', 'Reposicion de comida, bebida o estaciones', 'Retiro de vajilla y cristaleria usada'],
      ['Mantener mesas y estaciones prolijas', 'Derivar pedidos o imprevistos al coordinador'],
      ['Continuar servicio', 'Finaliza servicio?', 'Transicion a desmontaje']
    ]
  },
  {
    id: '12-desmontaje-retorno',
    title: 'Area Desmontaje y Retorno',
    subtitle: 'Cierre fisico, retiro, vuelta y entrega a deposito',
    lanes: [
      ['Fin del servicio', 'Coordinacion autoriza desmontaje', 'Cocina retira alimentos y define sobrantes'],
      ['Barra retira bebidas y devoluciones', 'Mozos retiran vajilla, cristaleria, cubiertos y manteleria'],
      ['Limpieza gestiona residuos y superficies', 'Equipamiento apaga, enfria y prepara artefactos'],
      ['Carga y descarga embala y carga vehiculo', 'Logistica verifica carga segura', 'Coordinacion hace recorrido final'],
      ['Registrar salida', 'Traslado de vuelta']
    ]
  },
  {
    id: '13-orden-limpieza-mantenimiento',
    title: 'Area Orden, Limpieza y Mantenimiento',
    subtitle: 'Utensilios, artefactos, deposito y pendientes',
    lanes: [
      ['Retorno al deposito', 'Separar utensilios, artefactos, textiles y residuos'],
      ['Limpieza de utensilios', 'Lavar, desinfectar, secar y guardar'],
      ['Limpieza de artefactos', 'Limpiar, revisar funcionamiento y separar danados'],
      ['Orden del deposito', 'Liberar pasillos, actualizar pendientes y guardar'],
      ['Registrar faltantes o roturas', 'Derivar reparacion, lavado externo o reposicion', 'Deposito cerrado y listo']
    ]
  },
  {
    id: '14-direccion-control',
    title: 'Area Direccion y Control de Gestion',
    subtitle: 'Revision semanal, desvios, acciones y mejora',
    lanes: [
      ['Reunion semanal', 'Revisar eventos realizados', 'Revisar eventos activos y proximos'],
      ['Revisar ventas, cobros, gastos y rentabilidad', 'Revisar compras, stock, mermas y proveedores'],
      ['Revisar cocina, logistica, servicio e incidentes', 'Hay desvios importantes?'],
      ['Definir accion correctiva', 'Asignar responsable y fecha', 'Registrar en dashboard'],
      ['Controlar cumplimiento en proxima reunion']
    ]
  }
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDiagram(diagram) {
  return `
    <section class="diagram-page" id="${esc(diagram.id)}">
      <div class="page-head">
        <div>
          <p class="eyebrow">Gratitud Gourmet</p>
          <h2>${esc(diagram.title)}</h2>
          <p class="subtitle">${esc(diagram.subtitle)}</p>
        </div>
        <span class="badge">${diagram.lanes.length} etapas</span>
      </div>
      <div class="flow">
        ${diagram.lanes.map((lane, laneIndex) => `
          <div class="lane">
            <div class="lane-label">Etapa ${laneIndex + 1}</div>
            <div class="steps">
              ${lane.map((step, stepIndex) => `
                <div class="step">
                  <span class="num">${laneIndex + 1}.${stepIndex + 1}</span>
                  <span>${esc(step)}</span>
                </div>
              `).join('<div class="arrow">›</div>')}
            </div>
          </div>
        `).join('')}
      </div>
    </section>`;
}

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Diagramas de flujo - Gratitud Gourmet</title>
  <style>
    :root {
      --ink: #1d2430;
      --muted: #697386;
      --line: #d7dde7;
      --paper: #ffffff;
      --soft: #f6f8fb;
      --brand: #176b63;
      --accent: #b64e2e;
      --blue: #315f9f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e9edf3;
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.35;
    }
    .cover, .diagram-page {
      width: min(1120px, calc(100vw - 28px));
      margin: 18px auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 28px;
      box-shadow: 0 12px 28px rgba(27, 38, 55, 0.10);
    }
    .cover h1 {
      margin: 0 0 10px;
      font-size: 34px;
      letter-spacing: 0;
    }
    .cover p { color: var(--muted); margin: 8px 0; }
    .toc {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
      margin-top: 22px;
    }
    .toc a {
      color: var(--ink);
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--soft);
      font-size: 14px;
    }
    .page-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: start;
      margin-bottom: 18px;
      border-bottom: 2px solid var(--line);
      padding-bottom: 14px;
    }
    .eyebrow {
      margin: 0 0 5px;
      color: var(--brand);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
    }
    h2 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .badge {
      white-space: nowrap;
      border-radius: 999px;
      padding: 7px 11px;
      background: #e8f3f1;
      color: var(--brand);
      font-size: 12px;
      font-weight: 700;
    }
    .flow {
      display: grid;
      gap: 14px;
    }
    .lane {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(90deg, #f9fafc, #ffffff);
      padding: 12px;
    }
    .lane-label {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: .06em;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
      align-items: stretch;
      gap: 8px;
    }
    .step {
      min-height: 62px;
      border: 1px solid #c9d3e1;
      border-left: 5px solid var(--blue);
      border-radius: 8px;
      background: #fff;
      padding: 10px 10px 10px 12px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 14px;
      font-weight: 700;
    }
    .num {
      color: var(--accent);
      font-size: 12px;
      flex: 0 0 auto;
      padding-top: 1px;
    }
    .arrow {
      display: none;
    }
    @media (min-width: 760px) {
      .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 759px) {
      .cover, .diagram-page {
        width: calc(100vw - 16px);
        margin: 8px auto;
        padding: 16px;
        border-radius: 8px;
      }
      .cover h1 { font-size: 26px; }
      .page-head { display: block; }
      .badge { display: inline-block; margin-top: 10px; }
      .steps { grid-template-columns: 1fr; }
      .step { min-height: auto; }
    }
    @media print {
      body { background: #fff; }
      .cover, .diagram-page {
        width: auto;
        margin: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        page-break-after: always;
      }
      .diagram-page { min-height: 100vh; }
      .toc a { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <section class="cover">
    <p class="eyebrow">Gratitud Gourmet</p>
    <h1>Diagramas de flujo del Manual Operativo</h1>
    <p>Version para celular, impresion y envio al equipo. Cada area tiene su propio flujo para evitar mezclar responsabilidades.</p>
    <p>Generado el 22/06/2026.</p>
    <div class="toc">
      ${diagrams.map(d => `<a href="#${esc(d.id)}">${esc(d.title)}</a>`).join('')}
    </div>
  </section>
  ${diagrams.map(renderDiagram).join('')}
</body>
</html>`;

const htmlPath = path.join(outDir, 'Diagramas_Flujo_Manual_Gratitud_Gourmet.html');
const pdfPath = path.join(outDir, 'Diagramas_Flujo_Manual_Gratitud_Gourmet.pdf');
fs.writeFileSync(htmlPath, html, 'utf8');

(async () => {
  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const executablePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
  await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' }
  });

  for (const diagram of diagrams) {
    const element = await page.$(`[id="${diagram.id}"]`);
    if (!element) continue;
    await element.screenshot({
      path: path.join(outDir, `${diagram.id}.png`)
    });
  }

  await browser.close();
  console.log(JSON.stringify({
    html: htmlPath,
    pdf: pdfPath,
    images: diagrams.length,
    outDir
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
