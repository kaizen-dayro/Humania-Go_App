import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    const { data, error } = await supabase
      .from('presentacion_video_versions')
      .select('youtube_video_id, titulo')
      .eq('is_current', true)
      .maybeSingle()

    if (error) {
      console.error('Error consultando video vigente:', error)
      return NextResponse.json({ success: false, error: 'DB_ERROR' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: true, data: null })
    }

    return NextResponse.json({ success: true, data: { youtubeVideoId: data.youtube_video_id, titulo: data.titulo } })
  } catch (err) {
    console.error('API video-actual Error:', err)
    return NextResponse.json({ success: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}
