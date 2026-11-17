// Cálculos compartidos por la app y por el script de recordatorios.
// Las fechas se manejan como texto 'AAAA-MM-DD' para evitar líos de zona horaria.

export const ZONA = 'America/Bogota';

/** Fecha de hoy en Colombia, como 'AAAA-MM-DD'. */
export function hoyColombia(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

function aUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días desde `desde` hasta `hasta` (positivo si `hasta` es después). */
export function diasEntre(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
}

export function sumarDias(iso, dias) {
  return new Date(aUTC(iso) + dias * 86400000).toISOString().slice(0, 10);
}

/**
 * Fecha del pago número `n` (0 = primer pago).
 * Mensual: mismo día de cada mes; si el mes es más corto, el último día (31 ene → 28 feb).
 */
export function fechaDelPago(fechaPrimerPago, frecuencia, n) {
  if (frecuencia === 'mensual') {
    const [y, m, d] = fechaPrimerPago.split('-').map(Number);
    const total = (m - 1) + n;
    const ny = y + Math.floor(total / 12);
    const nm = total % 12; // 0-11
    const ultimoDia = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    const dia = Math.min(d, ultimoDia);
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  const paso = frecuencia === 'quincenal' ? 15 : 7;
  return sumarDias(fechaPrimerPago, paso * n);
}

/** Convierte la tasa mensual (%) a la tasa equivalente del periodo de pago. */
function tasaPeriodo(interesMensualPct, frecuencia) {
  const r = (Number(interesMensualPct) || 0) / 100;
  if (r <= 0) return 0;
  if (frecuencia === 'quincenal') return Math.pow(1 + r, 1 / 2) - 1;
  if (frecuencia === 'semanal') return Math.pow(1 + r, 12 / 52) - 1;
  return r;
}

/**
 * Genera las cuotas de una compra.
 * Sin interés: valor total / número de cuotas (redondeado a pesos; la última ajusta la diferencia).
 * Con interés: cuota fija (sistema francés), aproximada.
 */
export function calcularCuotas({ valorTotal, numCuotas, interesMensual = 0, fechaPrimerPago, frecuencia = 'mensual' }) {
  const P = Number(valorTotal);
  const n = Math.trunc(Number(numCuotas));
  if (!(P > 0) || !(n >= 1) || !fechaPrimerPago) return [];
  const r = tasaPeriodo(interesMensual, frecuencia);

  const cuotas = [];
  if (r === 0) {
    const base = Math.round(P / n);
    let acumulado = 0;
    for (let i = 0; i < n; i++) {
      const valor = i === n - 1 ? Math.round(P - acumulado) : base;
      acumulado += valor;
      cuotas.push({ numero: i + 1, fecha_vencimiento: fechaDelPago(fechaPrimerPago, frecuencia, i), valor });
    }
  } else {
    const fija = Math.round(P * r / (1 - Math.pow(1 + r, -n)));
    for (let i = 0; i < n; i++) {
      cuotas.push({ numero: i + 1, fecha_vencimiento: fechaDelPago(fechaPrimerPago, frecuencia, i), valor: fija });
    }
  }
  return cuotas;
}

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const pesos = (v) => fmtCOP.format(Math.round(Number(v) || 0));

const fmtFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtFechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const fechaCorta = (iso) => fmtFecha.format(new Date(aUTC(iso)));
export const fechaLarga = (iso) => fmtFechaLarga.format(new Date(aUTC(iso)));

/** Texto relativo: "Hoy", "Mañana", "En 5 días", "Vencida hace 2 días". */
export function textoRelativo(dias) {
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `En ${dias} días`;
  const d = -dias;
  return `Vencida hace ${d} ${d === 1 ? 'día' : 'días'}`;
}