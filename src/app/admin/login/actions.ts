'use server'

import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Fase 13 (Documento 17 sección 9, Documento 18 sección 16.1): login y
 * solicitud de recuperación de contraseña, ambos sin sesión previa.
 *
 * Cliente con Secret Key: el único llamador legítimo de
 * solicitar_recuperacion_password (la RPC ya no tiene GRANT a anon ni a
 * authenticated -- ver supabase/00033, ronda 2 de auditoría). También se
 * usa para escribir admin_login_attempts, porque un cliente sin Secret Key
 * (el navegador) nunca debe poder autoreportar "exitoso" -- no sería un
 * registro de seguridad confiable.
 */
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

const VENTANA_INTENTOS_LOGIN = 10

/**
 * Login server-side (reemplaza el signInWithPassword directo del navegador
 * que usaba antes admin/login/page.tsx). Necesario porque el conteo de
 * "3 intentos fallidos consecutivos" (Documento 17 9.1, Documento 18
 * hallazgo/decisión de la ronda 2) requiere que el servidor registre cada
 * intento con la Secret Key -- un cliente sin ella podría autoreportar
 * cualquier cosa.
 */
export async function loginAdmin(correo: string, password: string) {
  const correoNormalizado = correo.trim().toLowerCase()
  const supabase = await createClient() // Cliente SSR: crea la sesión real (cookies) si el login es exitoso.
  const { data, error } = await supabase.auth.signInWithPassword({ email: correoNormalizado, password })

  const serviceClient = getServiceClient()

  if (error) {
    await serviceClient.from('admin_login_attempts').insert({ correo: correoNormalizado, exitoso: false })

    // Fase 13: "3 intentos fallidos" debe ser CONSECUTIVOS -- se reinicia
    // tras un login exitoso. Se cuenta desde el intento más reciente hacia
    // atrás, deteniéndose en el primer éxito (o al acabarse las filas).
    const { data: intentos } = await serviceClient
      .from('admin_login_attempts')
      .select('exitoso')
      .eq('correo', correoNormalizado)
      .order('intentado_en', { ascending: false })
      .limit(VENTANA_INTENTOS_LOGIN)

    let consecutivos = 0
    for (const intento of intentos || []) {
      if (!intento.exitoso) consecutivos++
      else break
    }

    return { success: false, error: error.message, mostrarRecuperacion: consecutivos >= 3 }
  }

  if (data.user) {
    await serviceClient.from('admin_login_attempts').insert({ correo: correoNormalizado, exitoso: true, admin_id: data.user.id })
  }

  return { success: true }
}

const LIMITE_SOLICITUDES_POR_CORREO_HORA = 3
const LIMITE_SOLICITUDES_POR_IP_HORA = 10

/**
 * Solicita recuperación de contraseña (Documento 17 sección 9.2). El
 * rate limiting real vive aquí (Next.js), no en PostgreSQL -- corrección
 * obligatoria de la ronda 2 de auditoría de seguridad (Documento 18
 * sección 15.6, punto 2): solicitar_recuperacion_password ya no tiene
 * GRANT a "anon", así que esta Server Action, usando el cliente de Secret
 * Key, es la ÚNICA puerta de entrada real al flujo.
 *
 * Siempre responde success:true con el mismo mensaje genérico, exista o
 * no el correo, esté o no bloqueado por rate limit -- nunca revela nada
 * (Documento 17 9.5, "prevención de enumeración de usuarios").
 */
export async function solicitarRecuperacion(correo: string) {
  const correoNormalizado = correo.trim().toLowerCase()
  if (!correoNormalizado) return { success: true }

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || headersList.get('x-real-ip') || 'desconocida'

  const serviceClient = getServiceClient()
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [{ count: countCorreo }, { count: countIp }] = await Promise.all([
    serviceClient.from('password_recovery_request_log').select('id', { count: 'exact', head: true }).eq('correo', correoNormalizado).gte('intentado_en', haceUnaHora),
    serviceClient.from('password_recovery_request_log').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('intentado_en', haceUnaHora),
  ])

  const limiteAlcanzado = (countCorreo || 0) >= LIMITE_SOLICITUDES_POR_CORREO_HORA || (countIp || 0) >= LIMITE_SOLICITUDES_POR_IP_HORA

  // Se registra el intento SIEMPRE (incluso si va a bloquearse) -- es lo
  // que permite que el propio límite se siga contando correctamente.
  await serviceClient.from('password_recovery_request_log').insert({ correo: correoNormalizado, ip })

  if (!limiteAlcanzado) {
    await serviceClient.rpc('solicitar_recuperacion_password', { p_correo: correoNormalizado })
  }

  return { success: true }
}
