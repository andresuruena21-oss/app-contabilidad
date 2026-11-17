// Arranque de la app: sesión, navegación entre pantallas y eventos generales.
import { sb } from './supabase.js';
import { estado, cargarDatos, leerCache, borrarCache, alternarPago } from './estado.js';
import { toast, modalAbierto } from './utilidades.js';

import * as login from './pantallas/login.js';
import * as inicio from './pantallas/inicio.js';
import * as compras from './pantallas/compras.js';
import * as detalle from './pantallas/detalle.js';
import * as nueva from './pantallas/nueva.js';
import * as ajustes from './pantallas/ajustes.js';

const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');

// Cada dirección (#/algo) abre una pantalla. "tab" es el botón de abajo que se ilumina.
const RUTAS = {
  inicio: { pantalla: inicio, tab: 'inicio' },
  compras: { pantalla: compras, tab: 'compras' },
  compra: { pantalla: detalle, tab: 'compras' },
  nueva: { pantalla: nueva, tab: 'nueva' },
  ajustes: { pantalla: ajustes, tab: 'ajustes' },
};

/** Lee la dirección actual. Ej: "#/compra/abc?c=123" → partes ['compra','abc'], params c=123 */
function leerRuta() {
  const [path, qs] = (location.hash.slice(1) || '/inicio').split('?');
  return { partes: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}

/** Quita los eventos de la pantalla anterior antes de montar la nueva. */
function limpiarEventos() {
  $app.onclick = $app.oninput = $app.onchange = $app.onsubmit = null;
}

async function render() {
  limpiarEventos();

  if (!estado.sesion) {
    $tabs.hidden = true;
    $app.innerHTML = login.render();
    login.montar($app);
    return;
  }

  const ruta = leerRuta();
  const { pantalla, tab } = RUTAS[ruta.partes[0]] || RUTAS.inicio;
  const html = await pantalla.render(ruta);
  $app.innerHTML = html;
  $tabs.hidden = false;
  $tabs.querySelectorAll('a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === tab));
  if (!ruta.params.get('c')) window.scrollTo(0, 0);
  pantalla.montar?.($app, ruta);
}

// ---------- Eventos que sirven en todas las pantallas ----------
// (se registran con addEventListener, así no se borran al cambiar de pantalla)
$app.addEventListener('click', (e) => {
  const pago = e.target.closest('[data-accion="alternar-pago"]');
  if (pago) return alternarPago(pago.dataset.id);
  const ir = e.target.closest('[data-ir]');
  if (ir) location.hash = ir.dataset.ir;
});

window.addEventListener('hashchange', render);
window.addEventListener('mc:refrescar', () => { if (!modalAbierto()) render(); });

// Al volver a la app, traer datos frescos (por si pagaste algo desde otro dispositivo).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.sesion) {
    cargarDatos().then(() => { if (!modalAbierto()) render(); }).catch(() => {});
  }
});

// ---------- Service worker (instalación, sin conexión y notificaciones) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Cuando tocas una notificación con la app abierta, el service worker nos dice a dónde ir.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.tipo === 'navegar') {
      const hash = new URL(e.data.url, location.href).hash;
      if (hash) location.hash = hash;
      cargarDatos().then(render).catch(() => {});
    }
  });
}

// ---------- Sesión ----------
sb.auth.onAuthStateChange((evento, sesion) => {
  const antes = estado.sesion?.user?.id;
  estado.sesion = sesion;
  if (evento === 'SIGNED_OUT') {
    borrarCache();
    render();
  } else if (evento === 'SIGNED_IN' && sesion && sesion.user.id !== antes) {
    // Acaba de iniciar sesión: cargar sus datos y mostrar Inicio.
    setTimeout(async () => {
      try { await cargarDatos(); } catch { toast('No se pudieron cargar los datos', { tipo: 'error' }); }
      render();
    });
  }
});

// ---------- Arranque ----------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  estado.sesion = session;
  if (!session) return render();

  leerCache();      // 1) mostrar al instante lo último guardado
  await render();
  try {             // 2) traer lo más reciente de Supabase
    await cargarDatos();
    await render();
  } catch {
    toast('Sin conexión: mostrando los últimos datos guardados');
  }
})();