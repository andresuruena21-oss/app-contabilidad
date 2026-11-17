// Pantalla Nueva compra: formulario con vista previa del calendario de cuotas.
import * as C from '../calculos.js';
import { sb } from '../supabase.js';
import { estado, guardarCache, actualizarBadge } from '../estado.js';
import { esc, miles, soloDigitos, toast } from '../utilidades.js';

export function render() {
  const lugares = [...new Set(estado.compras.map((c) => c.lugar).filter(Boolean))];
  const enUnMes = C.fechaDelPago(C.hoyColombia(), 'mensual', 1);
  return `
    <h1>Nueva compra</h1>
    <div class="sub">La app calcula las cuotas y las fechas de pago.</div>
    <form id="form-nueva" autocomplete="off">
      <label for="f-desc">¿Qué compraste?</label>
      <input id="f-desc" name="descripcion" required maxlength="80" placeholder="Ej: Celular Samsung">

      <label for="f-lugar">¿Dónde o con qué? <span class="opc">(opcional)</span></label>
      <input id="f-lugar" name="lugar" list="lugares" maxlength="60" placeholder="Ej: Tarjeta Bancolombia, Éxito">
      <datalist id="lugares">${lugares.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>

      <label for="f-valor">Valor total</label>
      <input id="f-valor" name="valor_total" required inputmode="numeric" placeholder="$ 0">

      <div class="dos">
        <div>
          <label for="f-n">Número de cuotas</label>
          <input id="f-n" name="num_cuotas" required type="number" inputmode="numeric" min="1" max="120" value="12">
        </div>
        <div>
          <label for="f-frec">Cada cuánto</label>
          <select id="f-frec" name="frecuencia">
            <option value="mensual">Mensual</option>
            <option value="quincenal">Quincenal</option>
            <option value="semanal">Semanal</option>
          </select>
        </div>
      </div>

      <label for="f-fecha">Fecha del primer pago</label>
      <input id="f-fecha" name="fecha_primer_pago" required type="date" value="${enUnMes}">

      <div class="dos">
        <div>
          <label for="f-int">Interés mensual <span class="opc">(%)</span></label>
          <input id="f-int" name="interes_mensual" type="number" inputmode="decimal" min="0" max="10" step="0.01" value="0">
        </div>
        <div>
          <label for="f-ya">Cuotas ya pagadas</label>
          <input id="f-ya" name="ya_pagadas" type="number" inputmode="numeric" min="0" value="0">
        </div>
      </div>
      <div class="ayuda">Deja el interés en 0 si es sin interés. "Cuotas ya pagadas" sirve para compras que ya venías pagando.</div>

      <label for="f-notas">Notas <span class="opc">(opcional)</span></label>
      <textarea id="f-notas" name="notas" rows="2" maxlength="300"></textarea>

      <div class="tarjeta vista-previa" id="vista-previa"></div>
      <p class="error" id="form-error" hidden></p>
      <button class="btn" type="submit">Guardar compra</button>
    </form>`;
}

export function montar($app) {
  const form = $app.querySelector('#form-nueva');
  pintarVistaPrevia(form);
  $app.oninput = (e) => {
    if (e.target.id === 'f-valor') e.target.value = miles(e.target.value); // pone los puntos de miles
    pintarVistaPrevia(form);
  };
  $app.onchange = () => pintarVistaPrevia(form);
  $app.onsubmit = (e) => { e.preventDefault(); guardar(form); };
}

function leerFormulario(form) {
  const f = new FormData(form);
  return {
    descripcion: String(f.get('descripcion') || '').trim(),
    lugar: String(f.get('lugar') || '').trim() || null,
    valor_total: Number(soloDigitos(f.get('valor_total'))),
    num_cuotas: Math.trunc(Number(f.get('num_cuotas'))),
    frecuencia: f.get('frecuencia'),
    fecha_primer_pago: f.get('fecha_primer_pago'),
    interes_mensual: Number(String(f.get('interes_mensual') || '0').replace(',', '.')) || 0,
    ya_pagadas: Math.max(0, Math.trunc(Number(f.get('ya_pagadas')) || 0)),
    notas: String(f.get('notas') || '').trim() || null,
  };
}

const cuotasDelFormulario = (d) => C.calcularCuotas({
  valorTotal: d.valor_total, numCuotas: d.num_cuotas, interesMensual: d.interes_mensual,
  fechaPrimerPago: d.fecha_primer_pago, frecuencia: d.frecuencia,
});

function pintarVistaPrevia(form) {
  const d = leerFormulario(form);
  const $vp = form.querySelector('#vista-previa');
  const cuotas = cuotasDelFormulario(d);
  if (!cuotas.length) {
    $vp.innerHTML = '<span class="sub">Escribe el valor y el número de cuotas para ver el calendario.</span>';
    return;
  }
  const total = cuotas.reduce((s, q) => s + q.valor, 0);
  const iguales = cuotas.every((q) => q.valor === cuotas[0].valor);
  const MAX = 6;
  const items = cuotas.slice(0, MAX).map((q) => `
    <li class="${q.numero <= d.ya_pagadas ? 'ya' : ''}">
      <span>${q.numero}. ${C.fechaCorta(q.fecha_vencimiento)}</span><span>${C.pesos(q.valor)}</span>
    </li>`).join('');
  $vp.innerHTML = `
    <div class="cabeza">${cuotas.length} ${cuotas.length === 1 ? 'cuota' : 'cuotas'} de ${C.pesos(cuotas[0].valor)}${iguales ? '' : ' (la última se ajusta)'}</div>
    <div class="sub">Total a pagar ${C.pesos(total)}${d.interes_mensual ? ' (aproximado, con interés)' : ''} · Última: ${C.fechaLarga(cuotas.at(-1).fecha_vencimiento)}</div>
    <ol>${items}${cuotas.length > MAX ? `<li><span class="sub">… y ${cuotas.length - MAX} más</span><span></span></li>` : ''}</ol>`;
}

async function guardar(form) {
  const $err = form.querySelector('#form-error');
  const btn = form.querySelector('[type=submit]');
  const d = leerFormulario(form);
  const cuotas = cuotasDelFormulario(d);

  const problema = !d.descripcion ? 'Escribe qué compraste.'
    : !(d.valor_total > 0) ? 'Escribe el valor total.'
    : !(d.num_cuotas >= 1 && d.num_cuotas <= 120) ? 'El número de cuotas debe estar entre 1 y 120.'
    : !d.fecha_primer_pago ? 'Elige la fecha del primer pago.'
    : d.ya_pagadas > d.num_cuotas ? 'Las cuotas ya pagadas no pueden ser más que el total.'
    : '';
  if (problema) { $err.textContent = problema; $err.hidden = false; return; }
  $err.hidden = true;
  btn.disabled = true; btn.textContent = 'Guardando…';
  const fallo = (msg) => { btn.disabled = false; btn.textContent = 'Guardar compra'; $err.textContent = msg; $err.hidden = false; };

  // 1) Guardar la compra
  const { ya_pagadas, ...compra } = d;
  const rc = await sb.from('mis_compras').insert(compra).select().single();
  if (rc.error) return fallo('No se pudo guardar: ' + rc.error.message);

  // 2) Guardar sus cuotas (si falla, borramos la compra para no dejarla a medias)
  const filas = cuotas.map((q) => ({ ...q, compra_id: rc.data.id, pagada: q.numero <= ya_pagadas }));
  const rq = await sb.from('mis_cuotas').insert(filas).select();
  if (rq.error) {
    await sb.from('mis_compras').delete().eq('id', rc.data.id);
    return fallo('No se pudieron guardar las cuotas: ' + rq.error.message);
  }

  estado.compras.unshift(rc.data);
  estado.cuotas.push(...rq.data);
  guardarCache(); actualizarBadge();
  location.hash = `#/compra/${rc.data.id}`;
  toast('Compra guardada');
}