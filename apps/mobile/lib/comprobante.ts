import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import {
  formatCOP,
  type DatosFactura,
  type DatosComprobantePago,
} from "@acueducto/cobros";

// Fase 2: convierte los datos ya ensamblados (Fase 1) en un PDF y lo comparte.
// Las plantillas son HTML inline → expo-print las rasteriza a PDF → expo-sharing
// abre el share sheet (WhatsApp, mail, etc.).

// Escapa texto que viene de datos (nombre del suscriptor/acueducto) para no romper el
// HTML ni permitir inyección en la plantilla.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function folioFmt(folio: number): string {
  return String(folio).padStart(4, "0");
}

// Estilos compartidos por ambos comprobantes (impresión en A4, sobrio).
const ESTILOS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  .header { border-bottom: 3px solid #1a73e8; padding-bottom: 12px; margin-bottom: 20px; }
  .acueducto { font-size: 22px; font-weight: 700; color: #1a73e8; }
  .doc { font-size: 13px; color: #6b7280; margin-top: 2px; }
  .folio { float: right; font-size: 13px; color: #6b7280; }
  .meta { margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
  .meta b { color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
  th { text-align: left; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; padding: 8px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; }
  .tot { display: flex; justify-content: space-between; align-items: center;
         background: #eff6ff; border-radius: 8px; padding: 14px 16px; margin-top: 8px; }
  .tot .label { font-size: 14px; font-weight: 600; color: #1d4ed8; }
  .tot .value { font-size: 22px; font-weight: 800; color: #1d4ed8; }
  .saldo { margin-top: 12px; font-size: 14px; color: #374151; }
  .stamp { margin-top: 28px; text-align: center; font-size: 26px; font-weight: 800;
           letter-spacing: 2px; color: #16a34a; border: 3px solid #16a34a;
           border-radius: 10px; padding: 12px; }
  .foot { margin-top: 28px; font-size: 11px; color: #9ca3af; text-align: center; }
`;

function documento(titulo: string, cuerpo: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(titulo)}</title><style>${ESTILOS}</style></head>
    <body>${cuerpo}</body></html>`;
}

function htmlFactura(d: DatosFactura): string {
  const filas = d.lineas
    .map(
      (l) => `<tr>
        <td>#${esc(l.numeroSerie)}</td>
        <td class="num">${l.consumo} m³</td>
        <td class="num">${formatCOP(l.cargoFijo)}</td>
        <td class="num">${formatCOP(l.excedente)}</td>
        <td class="num">${formatCOP(l.total)}</td>
      </tr>`
    )
    .join("");

  const saldo =
    d.saldoCuenta > 0
      ? `<div class="saldo">Saldo de cuenta: <b>${formatCOP(d.saldoCuenta)}</b></div>`
      : `<div class="saldo">Cuenta al día.</div>`;

  return documento(
    `Factura ${d.periodo}`,
    `<div class="header">
       <span class="folio">N° ${folioFmt(d.folio)}</span>
       <div class="acueducto">${esc(d.organizacion)}</div>
       <div class="doc">Cuenta de cobro — ${esc(d.periodo)}</div>
     </div>
     <div class="meta">
       <div><b>Suscriptor:</b> ${esc(d.suscriptor)}</div>
       <div><b>Consumo del período:</b> ${d.consumoTotal} m³</div>
       <div><b>Emitida:</b> ${esc(d.emitidoEn)}</div>
     </div>
     <table>
       <thead><tr>
         <th>Medidor</th><th class="num">Consumo</th><th class="num">Cargo fijo</th>
         <th class="num">Excedente</th><th class="num">Subtotal</th>
       </tr></thead>
       <tbody>${filas || `<tr><td colspan="5">Sin lecturas en el período.</td></tr>`}</tbody>
     </table>
     <div class="tot">
       <span class="label">TOTAL A PAGAR</span>
       <span class="value">${formatCOP(d.total)}</span>
     </div>
     ${saldo}
     <div class="foot">Documento generado por el sistema del acueducto. No es factura electrónica DIAN.</div>`
  );
}

function htmlComprobantePago(d: DatosComprobantePago): string {
  const saldo =
    d.saldoRestante > 0
      ? `<div class="saldo">Saldo restante: <b>${formatCOP(d.saldoRestante)}</b></div>`
      : `<div class="stamp">PAGADO</div>`;

  return documento(
    `Comprobante de pago N° ${folioFmt(d.folio)}`,
    `<div class="header">
       <span class="folio">N° ${folioFmt(d.folio)}</span>
       <div class="acueducto">${esc(d.organizacion)}</div>
       <div class="doc">Comprobante de pago</div>
     </div>
     <div class="meta">
       <div><b>Recibí de:</b> ${esc(d.suscriptor)}</div>
       <div><b>Fecha del pago:</b> ${esc(d.fechaPago)}</div>
       <div><b>Método:</b> ${esc(d.metodo)}</div>
       <div><b>Emitido:</b> ${esc(d.emitidoEn)}</div>
     </div>
     <div class="tot">
       <span class="label">MONTO PAGADO</span>
       <span class="value">${formatCOP(d.montoPagado)}</span>
     </div>
     ${saldo}
     <div class="foot">Documento generado por el sistema del acueducto.</div>`
  );
}

// Nombre de archivo legible y seguro: saca los caracteres inválidos de filesystem
// (/ \ : * ? " < > |) y colapsa espacios. Acentos y comas se conservan (válidos).
function sanitizeNombre(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Rasteriza el HTML a PDF, lo renombra a algo legible y abre el share sheet. Si el
// dispositivo no puede compartir, avisa con un throw para que la UI muestre el error.
async function generarYCompartir(html: string, nombreArchivo: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartir no está disponible en este dispositivo.");
  }
  // expo-print genera el PDF con un nombre UUID; lo movemos a un nombre con sentido
  // para que llegue así al compartir (WhatsApp, mail, etc.).
  const { uri } = await Print.printToFileAsync({ html });
  const destino = new File(Paths.cache, `${sanitizeNombre(nombreArchivo)}.pdf`);
  if (destino.exists) destino.delete(); // re-compartir: pisar la versión anterior
  new File(uri).move(destino);

  await Sharing.shareAsync(destino.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: nombreArchivo,
  });
}

export async function compartirFacturaPDF(datos: DatosFactura): Promise<void> {
  // "Factura Junio 2026 - Pérez, Juan"
  await generarYCompartir(
    htmlFactura(datos),
    `Factura ${datos.periodo} - ${datos.suscriptor}`
  );
}

export async function compartirComprobantePagoPDF(
  datos: DatosComprobantePago
): Promise<void> {
  // "Comprobante 0042 - Pérez, Juan"
  await generarYCompartir(
    htmlComprobantePago(datos),
    `Comprobante ${folioFmt(datos.folio)} - ${datos.suscriptor}`
  );
}
