// Pantalla Inicio: resumen del mes y próximos pagos.
import * as C from '../calculos.js';
import { pendientesConDias } from '../estado.js';
import { filaCuota, bannerInstalacion } from '../componentes.js';

const MAX_FILAS = 20;

export function render() {
  const hoy = C.hoyColombia();
  const mes = hoy.slice(0, 7); // '2026-11'
  const pend = pendientesConDias();
  const vencidas = pend.filter((q) => q.dias < 0);
  const esteMes = pend.filter((q) => q.dias < 0 || q.fecha_vencimiento.slice(0, 7) === mes);
  const suma = (arr) => arr.reduce((s, q) => s + Number(q.valor), 0);
  const nombreMes = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(hoy + 'T12:00:00Z'));
  const proximas = pend.slice(0, MAX_FILAS);

  const lista = proximas.length
    ? `<div class="lista">${proximas.map((q) => filaCuota(q)).join('')}</div>
       ${pend.length > proximas.length
         ? `<p class="sub" style="margin-top:10px">Y ${pend.length - proximas.length} cuotas más. Míralas en <a href="#/compras">Compras</a>.</p>`
         : ''}`
    : `<div class="tarjeta vacio"><div class="grande">🎉</div><p>No tienes cuotas pendientes.</p>
       <a class="btn chico" href="#/nueva">Agregar una compra</a></div>`;

  return `
    <h1>Mis Cuotas</h1>
    <div class="sub">${C.fechaLarga(hoy)}</div>
    ${bannerInstalacion()}
    <div class="resumen">
      <div class="dato ancho">
        <div class="etq">Por pagar en ${nombreMes}${vencidas.length ? ' (incluye vencidas)' : ''}</div>
        <div class="num">${C.pesos(suma(esteMes))}</div>
      </div>
      <div class="dato"><div class="etq">Deuda pendiente</div><div class="num">${C.pesos(suma(pend))}</div></div>
      <div class="dato ${vencidas.length ? 'rojo' : ''}"><div class="etq">Cuotas vencidas</div><div class="num">${vencidas.length}</div></div>
    </div>
    <h2>Próximos pagos</h2>
    ${lista}
  `;
}