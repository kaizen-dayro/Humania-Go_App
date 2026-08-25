import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const activoId = body?.activo_id

    if (typeof activoId !== 'string' || !UUID_RE.test(activoId)) {
      return NextResponse.json({ success: false, error: 'ACTIVO_INVALIDO', message: 'Oportunidad inválida.' }, { status: 400 })
    }

    const { data: token, error } = await supabaseAdmin.rpc('registrar_visualizacion_video', {
      p_activo_id: activoId
    })

    if (error) {
      console.error('Error registrando visualizacion de video:', error)
      return NextResponse.json({ success: false, error: 'DATABASE_ERROR', message: 'No se pudo registrar la presentación.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, token })
  } catch (err) {
    console.error('Unhandled API Error /api/presentacion/completar:', err)
    return NextResponse.json({ success: false, error: 'SERVER_ERROR', message: 'Ocurrió un error inesperado.' }, { status: 500 })
  }
}
