import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { ReferenciaLaboralFullPage } from './ReferenciaLaboralFullPage'
import type { ReferenciaLaboralRow } from '../ReferenciaLaboralSection'

export default async function ReferenciaLaboralRoute({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: candidato, error } = await supabase
    .from('candidatos')
    .select('id, nombres, apellidos, estado')
    .eq('id', resolvedParams.id)
    .single()

  if (error || !candidato) notFound()

  const { data: referenciaLaboral } = await supabase
    .from('referencia_laboral')
    .select('*')
    .eq('candidato_id', resolvedParams.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <ReferenciaLaboralFullPage
      candidato={candidato}
      initialData={referenciaLaboral as ReferenciaLaboralRow | null}
    />
  )
}
