// Piezas de pantalla que se repiten en varias vistas.
import * as C from './calculos.js';
import { compraPorId } from './estado.js';
import { esc, esIOS, instalada, pushSoportado, ICO_CHECK, ICO_COMPARTIR } from './utilidades.js';

function claseFila(q) {
  if (q.pagada) return 'pagada';
  if (q.dias < 0) return 'vencida';
  if (q.dias <= 3) return 'pronto';
  return '';
}

/**
 * Una fila de cuota con el círculo para marcarla pagada.
 * conCompra = true  → muestra el nombre de la compra (Inicio)
 * conCompra = false → muestra "Cuota 3 de 12" (detalle de una compra)
 */
export function filaCuota(q, { conCompra = true } = {}) {
  const compra = q.compra || compraPorId(q.compra_id);
  const total = compra?.num_cuotas ?? '';
  const titulo = conCompra ? esc(compra?.descripcion) : `Cuota ${q.numero} de ${total}`;
  const sub = conCompra
    ? `Cuota ${q.numero} de ${total}${compra?.lugar ? ' · ' + esc(compra.lugar) : ''}`
    : C.fechaLarga(q.fecha_vencimiento);
  const rel = q.pagada
    ? `Pagada${q.fecha_pago ? ' el ' + C.fechaCorta(q.fecha_pago) : ''}`
    : conCompra ? `${C.textoRelativo(q.dias)} · ${C.fechaCorta(q.fecha_vencimiento)}` : C.textoRelativo(q.dias);
  const destino = conCompra
    ? `data-ir="#/compra/${q.compra_id}?c=${q.id}"`
    : `data-accion="editar-cuota" data-id="${q.id}"`;
  return `
    <div class="fila ${claseFila(q)}" id="c-${q.id}">
      <button class="check ${q.pagada ? 'si' : ''}" data-accion="alternar-pago" data-id="${q.id}"
        aria-label="${q.pagada ? 'Marcar como no pagada' : 'Marcar como pagada'}">${ICO_CHECK}</button>
      <div class="info" ${destino}>
        <strong>${titulo}</strong>
        <span class="sub">${sub}</span>
        <span class="rel">${rel}</span>
      </div>
      <div class="valor">${C.pesos(q.valor)}</div>
    </div>`;
}

/** Aviso amarillo para instalar la app, o azul para activar recordatorios. */
export function bannerInstalacion() {
  if (esIOS && !instalada()) {
    return `<div class="banner"><div class="ico">📲</div><div>
      <strong>Instala la app para recibir avisos</strong>
      En Safari toca ${ICO_COMPARTIR} <b>Compartir</b> y luego <b>Agregar a inicio</b>. Después ábrela desde el ícono.
    </div></div>`;
  }
  if (pushSoportado() && Notification.permission === 'default') {
    return `<div class="banner info"><div class="ico">🔔</div><div>
      <strong>Activa los recordatorios</strong>
      Te avisamos antes de que venza cada cuota. <a href="#/ajustes">Activar ahora</a>
    </div></div>`;
  }
  return '';
}