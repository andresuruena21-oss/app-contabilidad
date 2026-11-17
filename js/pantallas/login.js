// Pantalla de inicio de sesión.
import { sb } from '../supabase.js';
import { esc } from '../utilidades.js';

export function render(error = '') {
  return `
    <div class="login">
      <img class="logo" src="./iconos/icono-192.png" alt="">
      <h1>Mis Cuotas</h1>
      <p class="sub">Entra con el usuario que creaste en Supabase.</p>
      <form id="form-login">
        <label for="l-email">Correo</label>
        <input id="l-email" name="email" type="email" autocomplete="username" required>
        <label for="l-pass">Contraseña</label>
        <input id="l-pass" name="password" type="password" autocomplete="current-password" required>
        <p class="error" ${error ? '' : 'hidden'}>${esc(error)}</p>
        <button class="btn" type="submit">Entrar</button>
      </form>
    </div>`;
}

export function montar($app) {
  $app.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) {
      // Si sale bien no hacemos nada aquí: app.js detecta la sesión y abre Inicio.
      $app.innerHTML = render('Correo o contraseña incorrectos.');
    }
  };
}