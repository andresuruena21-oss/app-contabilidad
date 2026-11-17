// Datos públicos de conexión. Se pueden ver sin problema: la seguridad la da
// el inicio de sesión y las reglas RLS de Supabase.
// NUNCA pongas aquí la clave secreta (service_role / sb_secret_...).
export const SUPABASE_URL = 'https://svykhxcvkgtxrgrhulei.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_lPhd5RraDVpgQcb0T-c83g_JEGKEE3w';

// Clave pública VAPID para las notificaciones push (la privada va solo en GitHub Secrets).
export const VAPID_PUBLIC_KEY = 'BCkgSVm3ID56oDh9noBsqIistR-u6mSsBmZafVhDY1n7_Ly75DGBgtdAyIV3OGpNZJIZfFiKp1VEo7rhyIVd7n0';