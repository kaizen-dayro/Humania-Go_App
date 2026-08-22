import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

async function getCurrentPolicy() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const { data, error } = await supabase
    .from('privacy_policy_versions')
    .select('version, title, content, published_at')
    .eq('is_current', true)
    .single()

  if (error) {
    console.error('Error fetching current privacy policy:', error)
    return null
  }

  return data
}

export default async function PrivacyPolicyPage() {
  const policy = await getCurrentPolicy()

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <header className="w-full border-b border-neutral-100 bg-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-20 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-humania-blue">
              Humania <span className="font-normal text-humania-gray">Go</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full flex justify-center py-16 px-6">
        <div className="w-full max-w-2xl">
          {policy ? (
            <>
              <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-1">{policy.title}</h1>
              <p className="text-sm text-humania-gray/70 mb-10">
                Versión {policy.version}
                {policy.published_at && ` — publicada el ${new Date(policy.published_at).toLocaleDateString()}`}
              </p>
              <div className="text-sm text-humania-gray whitespace-pre-wrap leading-relaxed">
                {policy.content}
              </div>
            </>
          ) : (
            <p className="text-humania-gray">No fue posible cargar la política en este momento. Intenta más tarde.</p>
          )}
        </div>
      </main>
    </div>
  )
}
