import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormNuevaMarca from './FormNuevaMarca'

export default async function NuevaMarcaPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/marcas">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Marcas
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Nueva Marca</h1>
        <p className="text-humania-gray">Registra una nueva marca en el catálogo maestro.</p>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormNuevaMarca />
      </div>
    </div>
  )
}
