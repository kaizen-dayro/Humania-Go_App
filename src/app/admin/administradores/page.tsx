import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getAdminUsersList } from '../actions'
import { AdministradoresTable } from './AdministradoresTable'

export default async function AdministradoresPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  // Autorizacion real: RLS/RPC (is_super_admin) ya protegen cada
  // operacion de este modulo -- esta verificacion en la propia pagina
  // es, ademas, la primera de todo el proyecto que valida ROL server-side
  // (no solo sesion), para no mostrarle esta pantalla a un ADMIN comun.
  const { data: caller } = await supabase
    .from('admin_users')
    .select('role, activo')
    .eq('id', session.user.id)
    .single()

  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') {
    redirect('/admin')
  }

  const { usuarios } = await getAdminUsersList()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Administradores</h1>
          <p className="text-humania-gray">Gestión de acceso y roles del panel — exclusivo SUPER_ADMIN</p>
        </div>
      </div>

      <AdministradoresTable usuarios={usuarios} currentUserId={session.user.id} />
    </div>
  )
}
