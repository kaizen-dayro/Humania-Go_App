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

export type WhatsAppResult = {
  enviado: boolean
  motivo: string
}

export async function sendWhatsAppNotification(telefono: string, mensaje: string): Promise<WhatsAppResult> {
  console.warn(`[WhatsApp -- NO CONECTADO] Se habría enviado a ${telefono}: "${mensaje}"`)
  return { enviado: false, motivo: 'WHATSAPP_NO_CONECTADO' }
}
