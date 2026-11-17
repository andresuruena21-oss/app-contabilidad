// Herramientas pequeñas que usan varias pantallas.

/** Escapa texto para meterlo en HTML sin riesgo (evita que un "<" rompa la página). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---------- Dispositivo ----------
export const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** true si la app se abrió desde el ícono de la pantalla de inicio (instalada). */
export const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** true si el navegador permite notificaciones push. */
export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------- Números ----------
export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');
/** "1500000" → "1.500.000" (para los campos de dinero). */
export const miles = (s) => { const d = soloDigitos(s); return d ? Number(d).toLocaleString('es-CO') : ''; };

/** Convierte la clave VAPID (texto base64) al formato que pide el navegador. */
export function b64aBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// ---------- Íconos ----------
export const ICO_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const ICO_COMPARTIR = '<svg class="ico-compartir" viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

// ---------- Mensajes emergentes (toast) ----------
const $toast = document.getElementById('toast');
let toastTimer;

/** Muestra un mensaje abajo. Opcional: tipo 'error' o un botón "Deshacer". */
export function toast(msg, { tipo = '', deshacer = null } = {}) {
  clearTimeout(toastTimer);
  $toast.className = tipo;
  $toast.innerHTML = `<span>${esc(msg)}</span>${deshacer ? '<button type="button">Deshacer</button>' : ''}`;
  $toast.hidden = false;
  if (deshacer) $toast.querySelector('button').onclick = () => { $toast.hidden = true; deshacer(); };
  toastTimer = setTimeout(() => { $toast.hidden = true; }, deshacer ? 5000 : 3200);
}

// ---------- Ventana emergente (modal) ----------
const $modal = document.getElementById('modal');
export const modalAbierto = () => $modal.open;

/**
 * Abre una ventana con un formulario. `alEnviar` recibe los datos del formulario;
 * si lanza un error, se muestra y la ventana sigue abierta.
 */
export function abrirModal(html, alEnviar) {
  $modal.innerHTML = html;
  $modal.showModal();
  const form = $modal.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await alEnviar(new FormData(form)); $modal.close(); }
    catch (err) { toast(err.message || 'No se pudo guardar', { tipo: 'error' }); }
    finally { btn.disabled = false; }
  });
  $modal.querySelector('[data-cerrar]')?.addEventListener('click', () => $modal.close());
  return $modal;
}

// ---------- Pedir que se vuelva a dibujar la pantalla ----------
/** Cualquier archivo puede llamar esto después de cambiar datos; app.js redibuja. */
export const refrescar = () => window.dispatchEvent(new CustomEvent('mc:refrescar'));