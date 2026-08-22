import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0 // La version vigente puede cambiar; no cachear estaticamente

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )

    const { data, error } = await supabase
      .from('privacy_policy_versions')
      .select('version, title, content, published_at')
      .eq('is_current', true)
      .single()

    if (error || !data) {
      console.error('Error fetching current privacy policy:', error)
      return NextResponse.json({ success: false, error: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('API privacy-policy Error:', err)
    return NextResponse.json({ success: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}
