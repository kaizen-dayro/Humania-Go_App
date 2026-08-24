'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Registra un login "exitoso" en admin_login_attempts justo después de que
 * un administrador completa su contraseña desde /crear-password (invitación
 * o recuperación) -- bug real encontrado por Dayro (2026-08-24): sin esto,
 * completar una recuperación de contraseña NUNCA reiniciaba la racha de
 * fallos consecutivos (Sección 5.14, Documento 18), porque updateUser()
 * no pasa por loginAdmin. El resultado real observado: los 3 fallos de una
 * prueba anterior quedaban "sin resolver" indefinidamente y se sumaban a
 * cualquier fallo futuro, mostrando "¿Olvidaste tu contraseña?" con un
 * solo error nuevo en vez de 3.
 *
 * Se lee el usuario desde la sesión ya establecida por Supabase (fragmento
 * de invitación/recuperación ya procesado) -- nunca se confía en un correo
 * enviado por el cliente.
 */
export async function registrarLoginExitosoTrasReset() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return

  const serviceClient = getServiceClient()
  await serviceClient.from('admin_login_attempts').insert({
    correo: user.email.trim().toLowerCase(),
    admin_id: user.id,
    exitoso: true,
  })
}
