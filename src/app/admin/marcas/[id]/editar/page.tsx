import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormEditarMarca from './FormEditarMarca'

export default async function EditarMarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: marca } = await supabase
    .from('marcas_vehiculo')
    .select('*')
    .eq('id', resolvedParams.id)
    .single()

  if (!marca) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-humania-blue mb-4">Marca no encontrada</h2>
        <Link href="/admin/marcas"><Button variant="outline">Volver al catálogo</Button></Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/marcas">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Marcas
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Editar Marca</h1>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormEditarMarca marca={marca} />
      </div>
    </div>
  )
}
