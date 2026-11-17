// Pantalla Compras: todas las compras con su avance.
import * as C from '../calculos.js';
import { estado, resumenCompra } from '../estado.js';
import { esc } from '../utilidades.js';

function tarjetaCompra(c) {
  const r = resumenCompra(c);
  const pct = r.total ? Math.round((r.pagadas / r.total) * 100) : 0;
  const prox = r.proxima ? `Próxima: ${C.fechaCorta(r.proxima.fecha_vencimiento)}` : 'Pagada por completo ✓';
  return `
    <div class="tarjeta compra" data-ir="#/compra/${c.id}">
      <div class="arriba"><strong>${esc(c.descripcion)}</strong><span class="valor">${C.pesos(r.saldo)}</span></div>
      <div class="sub">${c.lugar ? esc(c.lugar) + ' · ' : ''}${r.pagadas} de ${r.total} cuotas pagadas</div>
      <div class="barra"><i style="width:${pct}%"></i></div>
      <div class="abajo"><span>${prox}</span><span>saldo</span></div>
    </div>`;
}

export function render() {
  if (!estado.compras.length) {
    return `<h1>Compras</h1>
      <div class="tarjeta vacio" style="margin-top:16px"><div class="grande">🧾</div>
        <p>Aún no has registrado compras.</p><a class="btn chico" href="#/nueva">Agregar la primera</a></div>`;
  }
  const activas = estado.compras.filter((c) => resumenCompra(c).saldo > 0);
  const terminadas = estado.compras.filter((c) => resumenCompra(c).saldo <= 0);
  return `
    <h1>Compras</h1>
    <div class="sub">${activas.length} activas${terminadas.length ? ` · ${terminadas.length} terminadas` : ''}</div>
    <div style="margin-top:16px">
      ${activas.map(tarjetaCompra).join('') || '<p class="sub">No tienes compras con saldo pendiente.</p>'}
    </div>
    ${terminadas.length
      ? `<details class="terminadas"><summary>Terminadas (${terminadas.length})</summary>${terminadas.map(tarjetaCompra).join('')}</details>`
      : ''}
  `;
}