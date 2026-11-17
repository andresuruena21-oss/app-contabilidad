// Pantalla Detalle de una compra: datos, cuotas, editar y eliminar.
import * as C from '../calculos.js';
import { sb } from '../supabase.js';
import { estado, compraPorId, resumenCompra, guardarCache, actualizarBadge } from '../estado.js';
import { filaCuota } from '../componentes.js';
import { esc, miles, soloDigitos, toast, abrirModal, refrescar } from '../utilidades.js';

const FRECUENCIAS = { mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal' };

export function render({ partes }) {
  const c = compraPorId(partes[1]);
  if (!c) return `<a class="volver" href="#/compras">‹ Compras</a><p>No encontré esta compra.</p>`;

  const r = resumenCompra(c);
  const hoy = C.hoyColombia();
  const pct = r.total ? Math.round((r.pagadas / r.total) * 100) : 0;
  const filas = r.cuotas
    .map((q) => filaCuota({ ...q, dias: C.diasEntre(hoy, q.fecha_vencimiento), compra: c }, { conCompra: false }))
    .join('');

  return `
    <a class="volver" href="#/compras">‹ Compras</a>
    <h1>${esc(c.descripcion)}</h1>
    ${c.lugar ? `<div class="sub">${esc(c.lugar)}</div>` : ''}
    <div class="tarjeta" style="margin-top:14px">
      <div class="barra"><i style="width:${pct}%"></i></div>
      <div class="detalle-grid">
        <div><div class="etq">Saldo pendiente</div><div class="v">${C.pesos(r.saldo)}</div></div>
        <div><div class="etq">Cuotas pagadas</div><div class="v">${r.pagadas} de ${r.total}</div></div>
        <div><div class="etq">Valor de la compra</div><div class="v">${C.pesos(c.valor_total)}</div></div>
        <div><div class="etq">Total a pagar</div><div class="v">${C.pesos(r.totalAPagar)}</div></div>
        <div><div class="etq">Frecuencia</div><div class="v">${FRECUENCIAS[c.frecuencia]}</div></div>
        <div><div class="etq">Interés</div><div class="v">${Number(c.interes_mensual) ? `${Number(c.interes_mensual)}% mensual` : 'Sin interés'}</div></div>
      </div>
      ${c.notas ? `<p class="sub" style="margin-top:12px">${esc(c.notas)}</p>` : ''}
    </div>
    <h2>Cuotas</h2>
    <p class="sub">Toca el círculo para marcarla como pagada. Toca la cuota para cambiar su valor o fecha.</p>
    <div class="lista">${filas}</div>
    <div class="dos">
      <button class="btn sec" data-accion="editar-compra" data-id="${c.id}">Editar datos</button>
      <button class="btn peligro" data-accion="eliminar-compra" data-id="${c.id}">Eliminar</button>
    </div>
  `;
}

export function montar($app, { params }) {
  // Si llegamos desde una notificación (…?c=ID), resaltamos esa cuota.
  const id = params.get('c');
  const el = id && document.getElementById('c-' + id);
  if (el) { el.classList.add('resaltar'); el.scrollIntoView({ block: 'center' }); }

  $app.onclick = (e) => {
    const acc = e.target.closest('[data-accion]');
    if (!acc) return;
    const id = acc.dataset.id;
    if (acc.dataset.accion === 'editar-cuota') editarCuota(id);
    if (acc.dataset.accion === 'editar-compra') editarCompra(id);
    if (acc.dataset.accion === 'eliminar-compra') eliminarCompra(id);
  };
}

function editarCuota(id) {
  const q = estado.cuotas.find((x) => x.id === id);
  if (!q) return;
  const modal = abrirModal(`
    <form>
      <h3>Cuota ${q.numero}</h3>
      <p class="sub">Ajusta el valor o la fecha si el banco te cobró distinto.</p>
      <label>Valor</label>
      <input name="valor" inputmode="numeric" value="${miles(Math.round(q.valor))}" required>
      <label>Fecha de vencimiento</label>
      <input name="fecha" type="date" value="${q.fecha_vencimiento}" required>
      <div class="acciones">
        <button class="btn sec" type="button" data-cerrar>Cancelar</button>
        <button class="btn" type="submit">Guardar</button>
      </div>
    </form>`, async (f) => {
    const cambios = { valor: Number(soloDigitos(f.get('valor'))), fecha_vencimiento: f.get('fecha') };
    if (!(cambios.valor > 0)) throw new Error('Escribe un valor válido');
    const { error } = await sb.from('mis_cuotas').update(cambios).eq('id', id);
    if (error) throw error;
    Object.assign(q, cambios);
    guardarCache(); actualizarBadge(); refrescar();
    toast('Cuota actualizada');
  });
  modal.querySelector('[name=valor]').addEventListener('input', (e) => { e.target.value = miles(e.target.value); });
}

function editarCompra(id) {
  const c = compraPorId(id);
  if (!c) return;
  abrirModal(`
    <form>
      <h3>Editar compra</h3>
      <p class="sub">Para cambiar el valor o el número de cuotas, elimínala y créala de nuevo.</p>
      <label>¿Qué compraste?</label>
      <input name="descripcion" value="${esc(c.descripcion)}" required maxlength="80">
      <label>¿Dónde o con qué?</label>
      <input name="lugar" value="${esc(c.lugar)}" maxlength="60">
      <label>Notas</label>
      <textarea name="notas" rows="2" maxlength="300">${esc(c.notas)}</textarea>
      <div class="acciones">
        <button class="btn sec" type="button" data-cerrar>Cancelar</button>
        <button class="btn" type="submit">Guardar</button>
      </div>
    </form>`, async (f) => {
    const cambios = {
      descripcion: String(f.get('descripcion')).trim(),
      lugar: String(f.get('lugar')).trim() || null,
      notas: String(f.get('notas')).trim() || null,
    };
    const { error } = await sb.from('mis_compras').update(cambios).eq('id', id);
    if (error) throw error;
    Object.assign(c, cambios);
    guardarCache(); refrescar();
    toast('Compra actualizada');
  });
}

async function eliminarCompra(id) {
  const c = compraPorId(id);
  if (!c || !confirm(`¿Eliminar "${c.descripcion}" y todas sus cuotas? Esto no se puede deshacer.`)) return;
  const { error } = await sb.from('mis_compras').delete().eq('id', id);
  if (error) return toast('No se pudo eliminar', { tipo: 'error' });
  estado.compras = estado.compras.filter((x) => x.id !== id);
  estado.cuotas = estado.cuotas.filter((q) => q.compra_id !== id);
  guardarCache(); actualizarBadge();
  location.hash = '#/compras';
  toast('Compra eliminada');
}