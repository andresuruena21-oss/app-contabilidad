// Revisa las cuotas pendientes y envía los recordatorios push.
// Lo ejecuta GitHub Actions todos los días (ver .github/workflows/recordatorios.yml).
//
// Variables de entorno (se configuran como "Secrets" en GitHub):
//   SUPABASE_URL, SUPABASE_SECRET_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACTO
//   PRUEBA=1  → envía una notificación de prueba a todos los dispositivos
//
// OJO: en un repositorio público los registros de GitHub Actions los puede ver cualquiera,
// por eso aquí solo se imprimen cantidades, nunca descripciones ni valores.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { hoyColombia, diasEntre, sumarDias, pesos, fechaCorta, textoRelativo } from '../js/calculos.js';

const env = (k, opcional = false) => {
  const v = process.env[k]?.trim();
  if (!v && !opcional) { console.error(`Falta la variable ${k}. Revisa los Secrets del repositorio.`); process.exit(1); }
  return v;
};

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } });
const contacto = env('VAPID_CONTACTO', true) || 'mailto:recordatorios@example.com';
webpush.setVapidDetails(contacto.includes(':') ? contacto : `mailto:${contacto}`, env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const PRUEBA = process.env.PRUEBA === '1' || process.env.PRUEBA === 'true';
const DEFAULT = { dias_aviso: [5, 3, 1, 0], avisar_vencidas: true };
const MAX_INDIVIDUALES = 4; // si hay más cuotas que avisar, se manda un resumen

async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(error.message);
  return data;
}

async function enviar(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 20, urgency: 'high' },
    );
    return 'ok';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      await sb.from('push_suscripciones').delete().eq('id', sub.id);
      return 'vencida';
    }
    console.error(`  Error al enviar (código ${e.statusCode ?? '?'})`);
    return 'error';
  }
}

function mensajeCuota(c) {
  return {
    titulo: `${textoRelativo(c.dias)}: ${c.compra.descripcion}`,
    cuerpo: `Cuota ${c.numero} de ${c.compra.num_cuotas} · ${pesos(c.valor)} · ${fechaCorta(c.fecha_vencimiento)}`,
    url: `./#/compra/${c.compra_id}?c=${c.id}`,
    tag: `cuota-${c.id}`,
  };
}

function mensajeResumen(lista) {
  const total = lista.reduce((s, c) => s + Number(c.valor), 0);
  const vencidas = lista.filter((c) => c.dias < 0).length;
  const primeras = lista.slice(0, 3).map((c) => `• ${c.compra.descripcion}: ${pesos(c.valor)} (${textoRelativo(c.dias).toLowerCase()})`);
  return {
    titulo: `Tienes ${lista.length} cuotas por pagar${vencidas ? ` (${vencidas} vencidas)` : ''}`,
    cuerpo: `Total ${pesos(total)}\n${primeras.join('\n')}${lista.length > 3 ? `\n… y ${lista.length - 3} más` : ''}`,
    url: './#/inicio',
    tag: 'resumen',
  };
}

async function main() {
  const hoy = hoyColombia();
  console.log(`Fecha en Colombia: ${hoy}${PRUEBA ? ' (modo prueba)' : ''}`);

  const subs = await q(sb.from('push_suscripciones').select('*'));
  console.log(`Dispositivos registrados: ${subs.length}`);
  if (!subs.length) return console.log('No hay dispositivos con avisos activados. Nada que enviar.');

  const porUsuario = new Map();
  for (const s of subs) porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) || []), s]);

  if (PRUEBA) {
    let ok = 0;
    for (const s of subs) {
      ok += (await enviar(s, { titulo: 'Mis Cuotas funciona ✅', cuerpo: 'Esta es una notificación de prueba enviada desde GitHub.', url: './#/inicio', tag: 'prueba' })) === 'ok';
    }
    return console.log(`Prueba enviada a ${ok} de ${subs.length} dispositivos.`);
  }

  const ajustes = new Map((await q(sb.from('ajustes_usuario').select('*'))).map((a) => [a.user_id, a]));
  const maxDias = Math.max(7, ...[...ajustes.values()].flatMap((a) => a.dias_aviso || []), ...DEFAULT.dias_aviso);
  const cuotas = await q(
    sb.from('mis_cuotas')
      .select('id, user_id, compra_id, numero, valor, fecha_vencimiento, compra:mis_compras(descripcion, num_cuotas)')
      .eq('pagada', false)
      .lte('fecha_vencimiento', sumarDias(hoy, maxDias))
      .in('user_id', [...porUsuario.keys()])
      .order('fecha_vencimiento'),
  );
  const yaEnviadas = new Set((await q(sb.from('avisos_enviados').select('cuota_id').eq('fecha_aviso', hoy))).map((r) => r.cuota_id));

  let totalAvisos = 0;
  for (const [userId, dispositivos] of porUsuario) {
    const aj = ajustes.get(userId) || DEFAULT;
    const delUsuario = cuotas.filter((c) => c.user_id === userId).map((c) => ({ ...c, dias: diasEntre(hoy, c.fecha_vencimiento) }));
    const badge = delUsuario.filter((c) => c.dias <= 7).length;
    const avisar = delUsuario.filter((c) =>
      !yaEnviadas.has(c.id) && ((c.dias < 0 && aj.avisar_vencidas) || (c.dias >= 0 && aj.dias_aviso.includes(c.dias))));
    if (!avisar.length) continue;

    const mensajes = avisar.length > MAX_INDIVIDUALES ? [mensajeResumen(avisar)] : avisar.map(mensajeCuota);
    let algunoOk = false;
    let vivos = [...dispositivos];
    for (const m of mensajes) {
      for (const d of [...vivos]) {
        const r = await enviar(d, { ...m, badge });
        if (r === 'ok') algunoOk = true;
        if (r === 'vencida') vivos = vivos.filter((x) => x !== d);
      }
    }
    if (algunoOk) {
      totalAvisos += mensajes.length;
      const { error } = await sb.from('avisos_enviados').upsert(avisar.map((c) => ({ cuota_id: c.id, fecha_aviso: hoy })), { ignoreDuplicates: true });
      if (error) console.error('No se pudo registrar los avisos enviados:', error.message);
    }
  }
  console.log(`Avisos enviados: ${totalAvisos}`);

  // Limpieza: borrar registros de avisos de hace más de 60 días
  await sb.from('avisos_enviados').delete().lt('fecha_aviso', sumarDias(hoy, -60));
}

main().catch((e) => { console.error('Falló el envío de recordatorios:', e.message); process.exit(1); });