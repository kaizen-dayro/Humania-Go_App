import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCandidateEmail, sendAdminEmail } from '@/lib/services/email'
import { sendWhatsAppNotification } from '@/lib/services/whatsapp'

// Tarea programada diaria (ver web/vercel.json) -- deliberadamente UNA
// sola vez al día, no cada pocos minutos: el plan gratuito de Vercel del
// usuario ya bloqueó antes agregar una simple variable de entorno, así
// que este cron se diseñó para no depender de ningún límite más generoso
// de lo que ese plan probablemente permite. Por el mismo motivo, esta
// ruta tampoco exige un secreto de autorización (CRON_SECRET) -- no
// devuelve ningún dato sensible, y cada operación que hace es idempotente
// (una fila que ya se procesó nunca vuelve a coincidir con el filtro
// correspondiente), así que llamarla de más nunca causa un envío
// duplicado ni una anonimización prematura.
//
// Generalizada en la Fase 18 (antes mantenimiento-descartes-edad, solo
// candidatos_descartados_por_edad) y otra vez en la Fase 21 (renombrada
// de mantenimiento-descartes a mantenimiento-diario, ya no solo procesa
// tablas de "descarte silencioso" de candidatos): un solo cron diario
// concentra tres tareas de dominios distintos para no depender de más de
// un cron job en el plan de Vercel del usuario.
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const HORAS_48_MS = 48 * 60 * 60 * 1000
const HORAS_24_MS = 24 * 60 * 60 * 1000
const TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000

async function procesarDescartesEdad() {
  const resultado = { correosEnviados: 0, correosFallidos: 0, anonimizados: 0 }

  const limiteCorreo = new Date(Date.now() - HORAS_48_MS).toISOString()
  const { data: pendientesCorreo, error: errPendientes } = await supabaseAdmin
    .from('candidatos_descartados_por_edad')
    .select('id, nombres, correo_electronico')
    .lte('creado_en', limiteCorreo)
    .is('correo_agradecimiento_enviado_en', null)
    .not('correo_electronico', 'is', null)

  if (errPendientes) {
    console.error('[CRON diario] Error consultando pendientes de correo (edad):', errPendientes)
  } else {
    for (const fila of pendientesCorreo || []) {
      // Reserva optimista: solo envía si nadie más ya marcó esta fila
      // (protege contra una ejecución solapada del propio cron).
      const { data: reservado } = await supabaseAdmin
        .from('candidatos_descartados_por_edad')
        .update({ correo_agradecimiento_enviado_en: new Date().toISOString() })
        .eq('id', fila.id)
        .is('correo_agradecimiento_enviado_en', null)
        .select('id')
        .maybeSingle()

      if (!reservado) continue

      const enviado = await sendCandidateEmail({
        to: fila.correo_electronico!,
        subject: 'Humania Go — Gracias por tu interés',
        eventType: 'DESCARTE_EDAD_AGRADECIMIENTO',
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${fila.nombres || ''}.</h2>
            <p>Gracias por tomarte el tiempo de conocer más sobre Humania Go y por tu interés en nuestra oportunidad de movilidad.</p>
            <p>En este momento, tu perfil no cumple con los requisitos que tenemos definidos para esta convocatoria. Te invitamos a estar atento a futuras oportunidades, ya que las condiciones de nuestras convocatorias pueden cambiar con el tiempo.</p>
            <br>
            <p>Gracias por confiar en Humania Go.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })

      if (enviado) resultado.correosEnviados++
      else resultado.correosFallidos++
    }
  }

  const limiteAnonimizacion = new Date(Date.now() - TRES_MESES_MS).toISOString()
  const { data: anonimizados, error: errAnon } = await supabaseAdmin
    .from('candidatos_descartados_por_edad')
    .update({ nombres: null, correo_electronico: null, anonimizado_en: new Date().toISOString() })
    .lte('creado_en', limiteAnonimizacion)
    .not('correo_electronico', 'is', null)
    .select('id')

  if (errAnon) {
    console.error('[CRON diario] Error anonimizando registros (edad):', errAnon)
  } else {
    resultado.anonimizados = anonimizados?.length || 0
  }

  return resultado
}

async function procesarDescartesComparendos() {
  const resultado = { correosEnviados: 0, correosFallidos: 0, anonimizados: 0 }

  // Fase 18: correo a las 24h (no 48h como edad) y, apenas se envía, se
  // anonimiza en la misma pasada -- decisión explícita del usuario de
  // minimizar la retención de datos para este filtro en particular.
  const limiteCorreo = new Date(Date.now() - HORAS_24_MS).toISOString()
  const { data: pendientesCorreo, error: errPendientes } = await supabaseAdmin
    .from('candidatos_descartados_por_comparendos')
    .select('id, nombres, correo_electronico')
    .lte('creado_en', limiteCorreo)
    .is('correo_agradecimiento_enviado_en', null)
    .not('correo_electronico', 'is', null)

  if (errPendientes) {
    console.error('[CRON diario] Error consultando pendientes de correo (comparendos):', errPendientes)
  } else {
    for (const fila of pendientesCorreo || []) {
      const { data: reservado } = await supabaseAdmin
        .from('candidatos_descartados_por_comparendos')
        .update({ correo_agradecimiento_enviado_en: new Date().toISOString() })
        .eq('id', fila.id)
        .is('correo_agradecimiento_enviado_en', null)
        .select('id')
        .maybeSingle()

      if (!reservado) continue

      const enviado = await sendCandidateEmail({
        to: fila.correo_electronico!,
        subject: 'Humania Go — Gracias por tu interés',
        eventType: 'DESCARTE_COMPARENDOS_AGRADECIMIENTO',
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${fila.nombres || ''}.</h2>
            <p>Gracias por tomarte el tiempo de conocer más sobre Humania Go y por tu interés en nuestra oportunidad de movilidad.</p>
            <p>En este momento, tu perfil no cumple con los requisitos que tenemos definidos para esta convocatoria. Te invitamos a estar atento a futuras oportunidades, ya que las condiciones de nuestras convocatorias pueden cambiar con el tiempo.</p>
            <br>
            <p>Gracias por confiar en Humania Go.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })

      if (enviado) resultado.correosEnviados++
      else resultado.correosFallidos++

      // Anonimización inmediata tras el envío (a diferencia de edad, que
      // espera 3 meses) -- se intenta tanto si el correo se envió como si
      // falló, para no dejar datos personales retenidos indefinidamente
      // solo porque Gmail estuvo caído un día.
      const { error: errAnonInmediato } = await supabaseAdmin
        .from('candidatos_descartados_por_comparendos')
        .update({ nombres: null, correo_electronico: null, anonimizado_en: new Date().toISOString() })
        .eq('id', fila.id)

      if (errAnonInmediato) {
        console.error('[CRON diario] Error anonimizando registro (comparendos):', fila.id, errAnonInmediato)
      } else {
        resultado.anonimizados++
      }
    }
  }

  return resultado
}

type TipoDocumento = 'TECNOMECANICA' | 'SOAT' | 'IMPUESTOS'
type Umbral = 'UN_MES' | 'QUINCE_DIAS' | 'DIA_VENCIMIENTO'

const LABEL_DOCUMENTO: Record<TipoDocumento, string> = {
  TECNOMECANICA: 'Tecnomecánica',
  SOAT: 'SOAT',
  IMPUESTOS: 'Impuestos',
}

const LABEL_UMBRAL: Record<Umbral, string> = {
  UN_MES: 'vence en aproximadamente 1 mes',
  QUINCE_DIAS: 'vence en 15 días o menos',
  DIA_VENCIMIENTO: 'vence hoy o ya está vencido',
}

function diasHasta(fecha: string, hoyUTC: number): number {
  const [y, m, d] = fecha.split('-').map(Number)
  const fechaUTC = Date.UTC(y, m - 1, d)
  return Math.round((fechaUTC - hoyUTC) / (1000 * 60 * 60 * 24))
}

function umbralParaDias(dias: number): Umbral | null {
  if (dias <= 0) return 'DIA_VENCIMIENTO'
  if (dias <= 15) return 'QUINCE_DIAS'
  if (dias <= 30) return 'UN_MES'
  return null
}

/**
 * Alertas de vencimiento de documentos de activos (Fase 21, 2026-08-26):
 * Tecnomecánica, SOAT, Impuestos. Tres umbrales -- 1 mes, 15 días, el
 * mismo día del vencimiento (el pedido original decía "12 horas antes",
 * pero activos.vencimiento_* son columnas DATE sin hora y este cron
 * corre una sola vez al día -- el aviso más fino posible sin cambiar el
 * tipo de dato ni el plan de Vercel es "el mismo día", ver Documento 26).
 * Una sola notificación por umbral cruzado -- idempotencia real vía la
 * restricción UNIQUE de activo_documento_notificaciones (no un bloqueo
 * optimista como los descartes de candidatos, porque aquí insertamos
 * filas nuevas, no actualizamos filas existentes).
 */
async function procesarAlertasVencimientoDocumentos() {
  const resultado = { alertasNuevas: 0, correosEnviados: 0, correosFallidos: 0, whatsappIntentados: 0 }

  const hoy = new Date()
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  const { data: activos, error: errActivos } = await supabaseAdmin
    .from('activos')
    .select('id, codigo_interno, placa, vencimiento_tecnomecanica, vencimiento_soat, vencimiento_impuestos')
    .or('vencimiento_tecnomecanica.not.is.null,vencimiento_soat.not.is.null,vencimiento_impuestos.not.is.null')

  if (errActivos) {
    console.error('[CRON diario] Error consultando activos con vencimientos:', errActivos)
    return resultado
  }

  type ItemNuevo = { activo: string, documento: string, umbral: Umbral, fecha: string, dias: number }
  const nuevos: ItemNuevo[] = []

  for (const activo of activos || []) {
    const documentos: { tipo: TipoDocumento, fecha: string | null }[] = [
      { tipo: 'TECNOMECANICA', fecha: activo.vencimiento_tecnomecanica },
      { tipo: 'SOAT', fecha: activo.vencimiento_soat },
      { tipo: 'IMPUESTOS', fecha: activo.vencimiento_impuestos },
    ]

    for (const doc of documentos) {
      if (!doc.fecha) continue
      const dias = diasHasta(doc.fecha, hoyUTC)
      const umbral = umbralParaDias(dias)
      if (!umbral) continue

      const { data: insertado, error: errInsert } = await supabaseAdmin
        .from('activo_documento_notificaciones')
        .insert({ activo_id: activo.id, tipo_documento: doc.tipo, umbral, fecha_vencimiento: doc.fecha })
        .select('id')
        .maybeSingle()

      // Si viola la restricción UNIQUE (23505), ya se notificó este
      // umbral para esta fecha exacta -- no se repite (decisión
      // explícita del usuario: una vez por umbral, no un recordatorio
      // diario).
      if (errInsert) {
        if (errInsert.code !== '23505') {
          console.error('[CRON diario] Error registrando alerta de vencimiento:', activo.id, doc.tipo, umbral, errInsert)
        }
        continue
      }
      if (!insertado) continue

      resultado.alertasNuevas++
      nuevos.push({
        activo: activo.placa || activo.codigo_interno || activo.id,
        documento: LABEL_DOCUMENTO[doc.tipo],
        umbral,
        fecha: doc.fecha,
        dias,
      })
    }
  }

  if (nuevos.length === 0) {
    return resultado
  }

  // Un solo correo resumen por administrador activo, no uno por cada
  // documento -- evita saturar a un ADMIN/SUPER_ADMIN con varios correos
  // sueltos el mismo día si varios documentos cruzan un umbral a la vez.
  const { data: admins, error: errAdmins } = await supabaseAdmin
    .from('admin_users')
    .select('id, nombre')
    .eq('activo', true)

  if (errAdmins) {
    console.error('[CRON diario] Error consultando administradores activos:', errAdmins)
    return resultado
  }

  const filas = nuevos
    .sort((a, b) => a.dias - b.dias)
    .map(n => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${n.activo}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${n.documento}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${LABEL_UMBRAL[n.umbral]}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${n.fecha}</td></tr>`)
    .join('')

  const html = `
    <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
      <h2>Documentos de activos por vencer</h2>
      <p>Estos activos tienen documentos que requieren atención:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #002B4A;">Activo</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #002B4A;">Documento</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #002B4A;">Estado</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #002B4A;">Fecha de vencimiento</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p>Revisa el detalle de cada activo en el panel de Humania Go.</p>
      <br>
      <p><strong>Humania Go</strong></p>
    </div>
  `

  for (const admin of admins || []) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(admin.id)
    const correo = userData?.user?.email
    if (!correo) continue

    const enviado = await sendAdminEmail(correo, `Humania Go — ${nuevos.length} documento(s) de activos por vencer`, html)
    if (enviado) resultado.correosEnviados++
    else resultado.correosFallidos++

    // WhatsApp (Fase 21): sin conectar todavía -- ver web/src/lib/services/whatsapp.ts.
    // admin_users no tiene un teléfono registrado hoy, así que esta
    // llamada queda lista pero no tiene a quién enviarle de verdad
    // todavía; se deja programada para cuando se conecte el proveedor y
    // se agregue el campo de teléfono correspondiente.
    resultado.whatsappIntentados++
    await sendWhatsAppNotification('PENDIENTE_CONFIGURAR', `${nuevos.length} documento(s) de activos de Humania Go requieren atención.`)
  }

  return resultado
}

export async function GET() {
  const [edad, comparendos, vencimientos] = await Promise.all([
    procesarDescartesEdad(),
    procesarDescartesComparendos(),
    procesarAlertasVencimientoDocumentos(),
  ])

  return NextResponse.json({ success: true, edad, comparendos, vencimientos })
}
