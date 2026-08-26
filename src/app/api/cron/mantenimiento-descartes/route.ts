import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCandidateEmail } from '@/lib/services/email'

// Tarea programada diaria (ver web/vercel.json) -- deliberadamente UNA
// sola vez al día, no cada pocos minutos: el plan gratuito de Vercel del
// usuario ya bloqueó antes agregar una simple variable de entorno, así
// que este cron se diseñó para no depender de ningún límite más generoso
// de lo que ese plan probablemente permite. Por el mismo motivo, esta
// ruta tampoco exige un secreto de autorización (CRON_SECRET) -- no
// devuelve ningún dato, y cada operación que hace es idempotente (una
// fila que ya se procesó nunca vuelve a coincidir con el filtro de fecha
// correspondiente), así que llamarla de más nunca causa un envío
// duplicado ni una anonimización prematura.
//
// Generalizada en la Fase 18 (2026-08-25, antes se llamaba
// mantenimiento-descartes-edad y solo procesaba una tabla): procesa en la
// misma ejecución diaria las dos tablas de "descarte silencioso" que
// existen hoy -- candidatos_descartados_por_edad (Fase 17, correo a las
// 48h, anonimización a los 3 meses) y candidatos_descartados_por_comparendos
// (Fase 18, correo a las 24h, anonimización inmediata tras el envío) --
// para no duplicar la lógica de bloqueo optimista / envío / manejo de
// errores en dos archivos de cron separados.
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
    console.error('[CRON descartes] Error consultando pendientes de correo (edad):', errPendientes)
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
    console.error('[CRON descartes] Error anonimizando registros (edad):', errAnon)
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
    console.error('[CRON descartes] Error consultando pendientes de correo (comparendos):', errPendientes)
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
        console.error('[CRON descartes] Error anonimizando registro (comparendos):', fila.id, errAnonInmediato)
      } else {
        resultado.anonimizados++
      }
    }
  }

  return resultado
}

export async function GET() {
  const [edad, comparendos] = await Promise.all([
    procesarDescartesEdad(),
    procesarDescartesComparendos()
  ])

  return NextResponse.json({ success: true, edad, comparendos })
}
