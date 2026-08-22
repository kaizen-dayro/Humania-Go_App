import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormNuevoActivo from './FormNuevoActivo'

export default async function NuevoActivoPage() {
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: modelos } = await supabase
    .from('modelos_vehiculo')
    .select(`
      id,
      nombre,
      tipos_vehiculo(nombre),
      marcas_vehiculo!inner(nombre, activo)
    `)
    .eq('activo', true)
    .eq('marcas_vehiculo.activo', true)
    .order('nombre')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/activos">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Activos
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Nuevo Activo</h1>
        <p className="text-humania-gray">Registra un nuevo vehículo en el inventario operativo.</p>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormNuevoActivo modelos={modelos || []} />
      </div>
    </div>
  )
}
