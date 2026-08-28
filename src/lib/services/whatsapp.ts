// Fase 21 (2026-08-26): servicio de WhatsApp -- deliberadamente sin
// conectar todavía a ningún proveedor real (Meta WhatsApp Business API,
// Twilio, etc.). Existe para que el resto del sistema (el cron de
// alertas de vencimiento de documentos, hoy; otros flujos futuros)
// pueda llamar a una función real en vez de tener el envío de WhatsApp
// mezclado a mano en cada lugar que lo necesite -- cuando se conecte el
// proveedor real, solo hay que reescribir el cuerpo de esta función,
// nada de lo que la llama tiene que cambiar.
//
// Por ahora: registra en el log del servidor que "aquí se habría
// enviado un WhatsApp" y devuelve `false` (no enviado) -- nunca lanza
// una excepción, para que ningún flujo dependa de que WhatsApp esté
// conectado todavía.

import { createClient } from '@supabase/supabase-js'

export type WhatsAppResult = {
  enviado: boolean
  motivo: string
}

export async function sendWhatsAppNotification(telefono: string, mensaje: string): Promise<WhatsAppResult> {
  console.warn(`[WhatsApp -- NO CONECTADO] Se habría enviado a ${telefono}: "${mensaje}"`)
  return { enviado: false, motivo: 'WHATSAPP_NO_CONECTADO' }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Normaliza un número de teléfono tal como lo entrega un proveedor de
 * WhatsApp (formato E.164, ej. "+573001234567" o "573001234567") al
 * mismo formato de 10 dígitos que guarda candidatos.telefono (ej.
 * "3001234567", ver PHONE_CO en validation.ts). Quita el prefijo de país
 * de Colombia (57) solo cuando el número resultante empieza en 3 y tiene
 * más de 10 dígitos -- nunca corta un número que ya viene en 10 dígitos.
 */
function normalizarTelefonoWhatsApp(telefonoRemitente: string): string {
  const soloDigitos = telefonoRemitente.replace(/\D/g, '')
  if (soloDigitos.length > 10 && soloDigitos.startsWith('57')) {
    return soloDigitos.slice(-10)
  }
  return soloDigitos
}

export type ResolucionWhatsAppParte2 =
  | { tipo: 'ENVIAR_LINK', mensaje: string }
  | { tipo: 'CEDULA_NO_COINCIDE', mensaje: string }
  | { tipo: 'SIN_RESPUESTA_AUTOMATICA' }

/**
 * Infraestructura para KAI-6 (WhatsApp entrante) -- KAI-9/KAI-17,
 * 2026-08-27: lógica de negocio pura, agnóstica del proveedor, lista para
 * conectarse el día que un webhook real reciba mensajes de WhatsApp. NO
 * se llama todavía desde ningún flujo activo -- KAI-6 (elegir proveedor,
 * crear la cuenta) sigue pospuesto.
 *
 * Identifica primero a quien escribe por su NÚMERO DE TELÉFONO (no por la
 * cédula que escribió) -- así puede saludar por nombre incluso cuando la
 * cédula no coincide. Deliberadamente solo automatiza dos respuestas (el
 * link, y el aviso de cédula equivocada); cualquier otro caso queda sin
 * respuesta automática y pasa a manejo manual de Talento Humano (decisión
 * explícita del usuario, 2026-08-27) -- nunca confirma ni niega si una
 * cédula existe en el sistema para un teléfono que no reconoce.
 */
export async function resolverSolicitudParte2PorWhatsApp(
  telefonoRemitente: string,
  cedulaEscrita: string
): Promise<ResolucionWhatsAppParte2> {
  const telefono = normalizarTelefonoWhatsApp(telefonoRemitente)
  const cedula = cedulaEscrita.replace(/\D/g, '')

  const { data: candidato, error } = await supabaseAdmin
    .from('candidatos')
    .select('id, nombres, numero_documento, estado, parte2_token, parte2_habilitada_en, parte2_completada_en')
    .eq('telefono', telefono)
    .maybeSingle()

  if (error) {
    console.error('[WhatsApp Parte2] Error consultando candidato por teléfono:', error)
    return { tipo: 'SIN_RESPUESTA_AUTOMATICA' }
  }

  // Teléfono no reconocido: no hay nombre que usar con seguridad, y
  // responder cualquier cosa arriesgaría confirmar/negar que ese
  // teléfono existe en el sistema. Pasa a manejo manual.
  if (!candidato) {
    return { tipo: 'SIN_RESPUESTA_AUTOMATICA' }
  }

  if (candidato.numero_documento !== cedula) {
    return {
      tipo: 'CEDULA_NO_COINCIDE',
      mensaje: `Hola ${candidato.nombres}, esta no fue la cédula que registraste en la aplicación, ¿puedes revisar por favor si la escribiste bien?`
    }
  }

  const parte2Activa = candidato.estado !== 'DESCARTADO'
    && candidato.parte2_habilitada_en !== null
    && candidato.parte2_completada_en === null

  if (!parte2Activa) {
    return { tipo: 'SIN_RESPUESTA_AUTOMATICA' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    console.error('[WhatsApp Parte2] Falta NEXT_PUBLIC_SITE_URL -- no se puede armar el link.')
    return { tipo: 'SIN_RESPUESTA_AUTOMATICA' }
  }
  const link = `${siteUrl}/apply/parte2?candidato_id=${candidato.id}&token=${candidato.parte2_token}`

  return {
    tipo: 'ENVIAR_LINK',
    mensaje: `Hola ${candidato.nombres}, espero que todo vaya muy bien! Perfecto ya que deseas continuar con el proceso de selección es necesario que nos ayudes con el registro de tus referencias y el fiador. por favor accede a este link de nuestra plataforma y completa los datos. ${link}\n\nDespués de esto, confirmaremos tus datos y te contactaremos por correo (si después de confirmar tus datos nuestro equipo de recursos humanos decide no continuar con el proceso) o por aquí mismo si continuamos con el siguiente paso (visita domiciliaria).`
  }
}
