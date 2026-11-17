// Los datos de la app en memoria: compras, cuotas y ajustes.
// También los guarda en el teléfono para poder verlos sin conexión.
import { sb } from './supabase.js';
import { hoyColombia, diasEntre } from './calculos.js';
import { toast, refrescar } from './utilidades.js';

const CACHE_KEY = 'mc-datos';

export const estado = {
  sesion: null,
  compras: [],
  cuotas: [],
  ajustes: { dias_aviso: [5, 3, 1, 0], avisar_vencidas: true },
};

// ---------- Copia local (sin conexión) ----------
export function guardarCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ compras: estado.compras, cuotas: estado.cuotas, ajustes: estado.ajustes }));
  } catch {}
}
export function leerCache() {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (d) Object.assign(estado, { compras: d.compras || [], cuotas: d.cuotas || [], ajustes: d.ajustes || estado.ajustes });
  } catch {}
}
export function borrarCache() {
  localStorage.removeItem(CACHE_KEY);
  Object.assign(estado, { compras: [], cuotas: [] });
}

// ---------- Traer todo desde Supabase ----------
export async function cargarDatos() {
  const [rc, rq, ra] = await Promise.all([
    sb.from('mis_compras').select('*').order('created_at', { ascending: false }),
    sb.from('mis_cuotas').select('*').order('fecha_vencimiento').order('numero'),
    sb.from('ajustes_usuario').select('*').maybeSingle(),
  ]);
  const err = rc.error || rq.error || ra.error;
  if (err) throw err;
  estado.compras = rc.data;
  estado.cuotas = rq.data;
  if (ra.data) estado.ajustes = { dias_aviso: ra.data.dias_aviso, avisar_vencidas: ra.data.avisar_vencidas };
  guardarCache();
  actualizarBadge();
}

// ---------- Consultas sobre los datos ----------
export const compraPorId = (id) => estado.compras.find((c) => c.id === id);
export const cuotasDe = (compraId) => estado.cuotas.filter((q) => q.compra_id === compraId).sort((a, b) => a.numero - b.numero);

/** Totales de una compra: cuántas pagadas, saldo, próxima cuota… */
export function resumenCompra(compra) {
  const cuotas = cuotasDe(compra.id);
  const pendientes = cuotas.filter((q) => !q.pagada);
  return {
    cuotas,
    pagadas: cuotas.length - pendientes.length,
    total: cuotas.length,
    saldo: pendientes.reduce((s, q) => s + Number(q.valor), 0),
    totalAPagar: cuotas.reduce((s, q) => s + Number(q.valor), 0),
    proxima: pendientes[0] || null,
  };
}

/** Cuotas sin pagar, ordenadas por fecha, con los días que faltan (`dias`) y su compra. */
export function pendientesConDias() {
  const hoy = hoyColombia();
  return estado.cuotas
    .filter((q) => !q.pagada)
    .map((q) => ({ ...q, dias: diasEntre(hoy, q.fecha_vencimiento), compra: compraPorId(q.compra_id) }))
    .filter((q) => q.compra)
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
}

/** El número rojo sobre el ícono: cuotas vencidas o que vencen en los próximos 7 días. */
export function actualizarBadge() {
  if (!('setAppBadge' in navigator)) return;
  const n = pendientesConDias().filter((q) => q.dias <= 7).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- Marcar / desmarcar una cuota como pagada ----------
export async function alternarPago(id) {
  const q = estado.cuotas.find((x) => x.id === id);
  if (!q) return;
  const antes = { pagada: q.pagada, fecha_pago: q.fecha_pago };
  const nuevo = q.pagada ? { pagada: false, fecha_pago: null } : { pagada: true, fecha_pago: hoyColombia() };

  Object.assign(q, nuevo); // se ve el cambio de una vez…
  refrescar();
  const { error } = await sb.from('mis_cuotas').update(nuevo).eq('id', id);
  if (error) { // …y si falla, se devuelve
    Object.assign(q, antes);
    refrescar();
    return toast('No se pudo guardar. Revisa tu conexión.', { tipo: 'error' });
  }
  guardarCache();
  actualizarBadge();
  if (nuevo.pagada) toast(`Cuota ${q.numero} marcada como pagada`, { deshacer: () => alternarPago(id) });
}