import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormNuevoModelo from './FormNuevoModelo'

export default async function NuevoModeloPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const [{ data: marcas }, { data: tipos }] = await Promise.all([
    supabase.from('marcas_vehiculo').select('id, nombre, activo').order('nombre'),
    supabase.from('tipos_vehiculo').select('id, nombre').order('nombre'),
  ])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/modelos">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Modelos
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Nuevo Modelo</h1>
        <p className="text-humania-gray">Registra un nuevo modelo en el catálogo maestro.</p>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormNuevoModelo marcas={marcas || []} tipos={tipos || []} />
      </div>
    </div>
  )
}
