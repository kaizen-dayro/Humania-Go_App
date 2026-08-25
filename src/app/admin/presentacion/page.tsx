import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getPresentacionVideoHistorial } from '../actions'
import { PresentacionVideoForm } from './PresentacionVideoForm'

export default async function PresentacionAdminPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: caller } = await supabase
    .from('admin_users')
    .select('role, activo')
    .eq('id', session.user.id)
    .single()

  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') {
    redirect('/admin')
  }

  const { historial } = await getPresentacionVideoHistorial()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-humania-blue">Video de presentación</h1>
        <p className="text-humania-gray">El que ven los candidatos en /presentacion antes de postularse — exclusivo SUPER_ADMIN</p>
      </div>

      <PresentacionVideoForm historial={historial ?? []} />
    </div>
  )
}
