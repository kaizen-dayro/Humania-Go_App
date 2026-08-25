import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getCiudadesConMunicipios } from '../actions'
import { CiudadesManager } from './CiudadesManager'

export default async function CiudadesAdminPage() {
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

  const { ciudades, municipios } = await getCiudadesConMunicipios()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-humania-blue">Ciudades y municipios</h1>
        <p className="text-humania-gray">Dónde puede postularse un candidato en /apply — exclusivo SUPER_ADMIN</p>
      </div>

      <CiudadesManager ciudades={ciudades} municipios={municipios} />
    </div>
  )
}
