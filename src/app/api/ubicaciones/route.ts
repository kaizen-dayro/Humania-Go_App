import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0 // El catalogo puede cambiar desde administracion; no cachear estaticamente

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    const [{ data: ciudades, error: errorCiudades }, { data: municipios, error: errorMunicipios }] = await Promise.all([
      supabase.from('ciudades_operacion').select('id, nombre_oficial, orden').eq('activo', true).order('orden'),
      supabase.from('municipios_operacion').select('id, ciudad_operacion_id, nombre_oficial, orden').eq('activo', true).order('orden'),
    ])

    if (errorCiudades || errorMunicipios) {
      console.error('Error fetching ubicaciones:', errorCiudades || errorMunicipios)
      return NextResponse.json({ success: false, error: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: { ciudades: ciudades || [], municipios: municipios || [] } })
  } catch (err) {
    console.error('API ubicaciones Error:', err)
    return NextResponse.json({ success: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}
