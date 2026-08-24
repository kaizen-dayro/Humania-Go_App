import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormEditarModelo from './FormEditarModelo'
import { HistorialModelo } from './HistorialModelo'
import { getModeloActivacionHistory } from '../../../actions'

export default async function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const [{ data: modelo }, { data: marcas }, { data: tipos }] = await Promise.all([
    supabase.from('modelos_vehiculo').select('*').eq('id', resolvedParams.id).single(),
    supabase.from('marcas_vehiculo').select('id, nombre, activo').order('nombre'),
    supabase.from('tipos_vehiculo').select('id, nombre').order('nombre'),
  ])

  if (!modelo) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-humania-blue mb-4">Modelo no encontrado</h2>
        <Link href="/admin/modelos"><Button variant="outline">Volver al catálogo</Button></Link>
      </div>
    )
  }

  const { historial } = await getModeloActivacionHistory(resolvedParams.id)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-8">
        <Link href="/admin/modelos">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Modelos
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Editar Modelo</h1>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormEditarModelo modelo={modelo} marcas={marcas || []} tipos={tipos || []} />
      </div>

      <HistorialModelo historial={historial || []} />
    </div>
  )
}
