import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// KAI-18: para que /apply/parte2 pueda saludar por nombre al candidato
// antes de que llene el formulario. Espejo del mismo criterio de
// validación de submit_application_parte2 -- no revela nada si el token
// no coincide, sin distinguir "no existe" de "token incorrecto".
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function GET(req: NextRequest) {
  const candidatoId = req.nextUrl.searchParams.get('candidato_id')
  const token = req.nextUrl.searchParams.get('token')

  if (!candidatoId || !token) {
    return NextResponse.json({ success: false, data: null }, { status: 400 })
  }

  const { data: nombres, error } = await supabaseAdmin.rpc('obtener_nombre_parte2', {
    p_candidato_id: candidatoId,
    p_token: token
  })

  if (error) {
    console.error('Error consultando nombre de Parte 2:', error)
    return NextResponse.json({ success: false, data: null }, { status: 400 })
  }

  return NextResponse.json({ success: !!nombres, data: nombres ? { nombres } : null })
}
