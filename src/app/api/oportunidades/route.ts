import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0; // Evitar caché estática para disponibilidad de activos

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    const { data, error } = await supabase
      .from('activos')
      .select(`
        id,
        codigo_interno,
        estado,
        image_url,
        modelos_vehiculo (
          nombre,
          image_url,
          marcas_vehiculo (nombre),
          tipos_vehiculo (nombre)
        ),
        activo_fotos ( storage_path )
      `)
      .eq('estado', 'DISPONIBLE')

    if (error) {
      console.error("Error fetching opportunities:", error)
      return NextResponse.json({ success: false, error: "DB_ERROR" }, { status: 500 })
    }

    // RLS en activo_fotos solo expone, a un cliente publico, la foto
    // PRINCIPAL vigente (categoria='PRINCIPAL' AND activo=true) de cada
    // activo -- por eso alcanza con tomar la primera fila, si existe. Si
    // no hay foto subida por Storage, se cae al campo de texto legado.
    const oportunidades = (data as any[] || []).map(activo => {
      const fotoPrincipal = activo.activo_fotos?.[0]
      const imagen = fotoPrincipal
        ? supabase.storage.from('activo-fotos-publicas').getPublicUrl(fotoPrincipal.storage_path).data.publicUrl
        : (activo.image_url || activo.modelos_vehiculo?.image_url)
      return {
        id: activo.id,
        codigo_interno: activo.codigo_interno,
        tipo: activo.modelos_vehiculo?.tipos_vehiculo?.nombre,
        marca: activo.modelos_vehiculo?.marcas_vehiculo?.nombre,
        modelo: activo.modelos_vehiculo?.nombre,
        imagen
      }
    })

    return NextResponse.json({ success: true, data: oportunidades })

  } catch (err) {
    console.error("API Oportunidades Error:", err)
    return NextResponse.json({ success: false, error: "SERVER_ERROR" }, { status: 500 })
  }
}
