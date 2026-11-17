// Pantalla Ajustes: activar notificaciones, cuándo avisar y cerrar sesión.
import * as C from '../calculos.js';
import { sb } from '../supabase.js';
import { VAPID_PUBLIC_KEY } from '../config.js';
import { estado, guardarCache, pendientesConDias } from '../estado.js';
import { esc, esIOS, instalada, pushSoportado, b64aBytes, toast, refrescar, ICO_COMPARTIR } from '../utilidades.js';

const DIAS_OPCIONES = [7, 5, 3, 2, 1, 0];
const etiquetaDia = (d) => (d === 0 ? 'El mismo día' : d === 1 ? '1 día antes' : `${d} días antes`);

async function estaSuscrito() {
  if (!pushSoportado() || Notification.permission !== 'granted') return false;
  try { return !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()); } catch { return false; }
}

async function bloqueNotificaciones() {
  if (esIOS && !instalada()) {
    return `<div class="estado-push"><span class="punto no"></span>Primero instala la app</div>
      <ol class="pasos">
        <li>Abre esta página en <b>Safari</b>.</li>
        <li>Toca ${ICO_COMPARTIR} <b>Compartir</b>.</li>
        <li>Elige <b>Agregar a inicio</b> y confirma.</li>
        <li>Abre <b>Mis Cuotas</b> desde el ícono y vuelve a esta pantalla.</li>
      </ol>`;
  }
  if (!pushSoportado()) {
    return `<div class="estado-push"><span class="punto no"></span>Este navegador no permite notificaciones</div>`;
  }
  if (Notification.permission === 'denied') {
    return `<div class="estado-push"><span class="punto no"></span>Notificaciones bloqueadas</div>
      <p class="sub" style="margin-top:8px">Actívalas en <b>Ajustes del iPhone › Notificaciones › Mis Cuotas</b> y vuelve a abrir la app.</p>`;
  }
  if (await estaSuscrito()) {
    return `<div class="estado-push"><span class="punto si"></span>Recordatorios activados en este dispositivo</div>
      <div class="dos">
        <button class="btn sec chico" data-accion="probar-push">Ver ejemplo</button>
        <button class="btn sec chico" data-accion="desactivar-push">Desactivar</button>
      </div>`;
  }
  return `<div class="estado-push"><span class="punto"></span>Recordatorios desactivados</div>
    <button class="btn" data-accion="activar-push">🔔 Activar recordatorios</button>`;
}

export async function render() {
  const dias = estado.ajustes.dias_aviso || [];
  return `
    <h1>Ajustes</h1>
    <h2>Notificaciones</h2>
    <div class="tarjeta">${await bloqueNotificaciones()}</div>

    <h2>¿Cuándo avisarte?</h2>
    <form class="tarjeta" id="form-ajustes">
      <div class="chips">
        ${DIAS_OPCIONES.map((d) => `
          <label class="chip"><input type="checkbox" name="dias" value="${d}" ${dias.includes(d) ? 'checked' : ''}><span>${etiquetaDia(d)}</span></label>`).join('')}
      </div>
      <label class="interruptor">Seguir avisando cada día si se vence sin pagar
        <input type="checkbox" name="vencidas" ${estado.ajustes.avisar_vencidas ? 'checked' : ''}>
      </label>
      <p class="ayuda">Los avisos llegan cada mañana, alrededor de las 8 a.&nbsp;m. (hora Colombia).</p>
      <button class="btn" type="submit">Guardar</button>
    </form>

    <h2>Cuenta</h2>
    <div class="tarjeta">
      <div class="sub">Sesión iniciada como</div>
      <div style="font-weight:600">${esc(estado.sesion?.user?.email)}</div>
      <button class="btn sec" data-accion="salir">Cerrar sesión</button>
    </div>
  `;
}

export function montar($app) {
  $app.onclick = (e) => {
    const acc = e.target.closest('[data-accion]');
    if (!acc) return;
    if (acc.dataset.accion === 'activar-push') activarPush();
    if (acc.dataset.accion === 'desactivar-push') desactivarPush();
    if (acc.dataset.accion === 'probar-push') probarPush();
    if (acc.dataset.accion === 'salir') sb.auth.signOut();
  };
  $app.onsubmit = (e) => { e.preventDefault(); guardarAjustes(e.target); };
}

async function activarPush() {
  try {
    // En iPhone el permiso se debe pedir justo después del toque, antes de cualquier otra cosa.
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { toast('No se dio permiso para notificaciones'); return refrescar(); }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(VAPID_PUBLIC_KEY) });

    // Guardamos la "dirección" de este iPhone en Supabase para que GitHub le pueda enviar avisos.
    const j = sub.toJSON();
    const { error } = await sb.rpc('guardar_suscripcion', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_dispositivo: (esIOS ? 'iPhone · ' : '') + navigator.userAgent.slice(0, 150),
    });
    if (error) throw error;
    toast('¡Recordatorios activados!');
  } catch (e) {
    toast('No se pudo activar: ' + (e.message || e), { tipo: 'error' });
  }
  refrescar();
}

async function desactivarPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb.from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  toast('Recordatorios desactivados en este dispositivo');
  refrescar();
}

/** Muestra una notificación de ejemplo desde el propio teléfono (no pasa por GitHub). */
async function probarPush() {
  const reg = await navigator.serviceWorker.ready;
  const prox = pendientesConDias()[0];
  await reg.showNotification(prox ? `${C.textoRelativo(prox.dias)}: ${prox.compra.descripcion}` : 'Mis Cuotas', {
    body: prox ? `Cuota ${prox.numero} de ${prox.compra.num_cuotas} · ${C.pesos(prox.valor)}` : 'Así se verán tus recordatorios.',
    icon: './iconos/icono-192.png',
    tag: 'ejemplo',
    data: { url: prox ? `./#/compra/${prox.compra_id}?c=${prox.id}` : './#/inicio' },
  });
}

async function guardarAjustes(form) {
  const f = new FormData(form);
  const nuevos = {
    dias_aviso: f.getAll('dias').map(Number).sort((a, b) => b - a),
    avisar_vencidas: f.get('vencidas') === 'on',
  };
  const { error } = await sb.from('ajustes_usuario').upsert({
    user_id: estado.sesion.user.id, ...nuevos, updated_at: new Date().toISOString(),
  });
  if (error) return toast('No se pudo guardar', { tipo: 'error' });
  estado.ajustes = nuevos;
  guardarCache();
  toast('Ajustes guardados');
}