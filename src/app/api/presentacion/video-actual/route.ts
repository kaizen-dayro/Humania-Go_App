import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

const PERFILES_VALIDOS = ['CONDUCTOR', 'INDEPENDIENTE'] as const

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    const { data: config, error: configError } = await supabase
      .from('presentacion_configuracion')
      .select('segmentacion_activa, demo_segundos')
      .eq('id', true)
      .maybeSingle()

    if (configError) {
      console.error('Error consultando configuración de presentación:', configError)
      return NextResponse.json({ success: false, error: 'DB_ERROR' }, { status: 500 })
    }

    const demoSegundos = config?.demo_segundos ?? null
    const cookiePerfil = req.cookies.get('humania_perfil')?.value
    const segmentacionActiva = config?.segmentacion_activa === true
    const perfilDetectado = segmentacionActiva && cookiePerfil && (PERFILES_VALIDOS as readonly string[]).includes(cookiePerfil)
      ? cookiePerfil
      : 'GENERAL'

    // Intenta el video del perfil detectado; si no hay uno publicado
    // todavia para ese perfil especifico, no deja a la persona sin video
    // -- cae al GENERAL en vez de mostrar "pendiente de configuración".
    const perfilesAIntentar = perfilDetectado === 'GENERAL' ? ['GENERAL'] : [perfilDetectado, 'GENERAL']

    for (const perfil of perfilesAIntentar) {
      const { data, error } = await supabase
        .from('presentacion_video_versions')
        .select('youtube_video_id, titulo')
        .eq('is_current', true)
        .eq('perfil', perfil)
        .maybeSingle()

      if (error) {
        console.error('Error consultando video vigente:', error)
        return NextResponse.json({ success: false, error: 'DB_ERROR' }, { status: 500 })
      }

      if (data) {
        return NextResponse.json({
          success: true,
          data: { youtubeVideoId: data.youtube_video_id, titulo: data.titulo, perfil },
          demoSegundos
        })
      }
    }

    return NextResponse.json({ success: true, data: null, demoSegundos })
  } catch (err) {
    console.error('API video-actual Error:', err)
    return NextResponse.json({ success: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}
