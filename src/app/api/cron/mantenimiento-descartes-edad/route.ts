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
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const CUARENTA_Y_OCHO_HORAS_MS = 48 * 60 * 60 * 1000
const TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000

export async function GET() {
  const resultado = { correosEnviados: 0, correosFallidos: 0, anonimizados: 0 }

  // 1. Correo de agradecimiento a quienes llevan 48h+ sin recibirlo.
  const limiteCorreo = new Date(Date.now() - CUARENTA_Y_OCHO_HORAS_MS).toISOString()
  const { data: pendientesCorreo, error: errPendientes } = await supabaseAdmin
    .from('candidatos_descartados_por_edad')
    .select('id, nombres, correo_electronico')
    .lte('creado_en', limiteCorreo)
    .is('correo_agradecimiento_enviado_en', null)
    .not('correo_electronico', 'is', null)

  if (errPendientes) {
    console.error('[CRON descartes-edad] Error consultando pendientes de correo:', errPendientes)
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

  // 2. Anonimización de registros con más de 3 meses.
  const limiteAnonimizacion = new Date(Date.now() - TRES_MESES_MS).toISOString()
  const { data: anonimizados, error: errAnon } = await supabaseAdmin
    .from('candidatos_descartados_por_edad')
    .update({ nombres: null, correo_electronico: null, anonimizado_en: new Date().toISOString() })
    .lte('creado_en', limiteAnonimizacion)
    .not('correo_electronico', 'is', null)
    .select('id')

  if (errAnon) {
    console.error('[CRON descartes-edad] Error anonimizando registros:', errAnon)
  } else {
    resultado.anonimizados = anonimizados?.length || 0
  }

  return NextResponse.json({ success: true, ...resultado })
}
