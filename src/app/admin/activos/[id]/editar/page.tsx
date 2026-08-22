import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import FormEditarActivo from './FormEditarActivo'
import { HistorialActivo } from './HistorialActivo'

export default async function EditarActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: activo } = await supabase
    .from('activos')
    .select(`
      *,
      modelos_vehiculo(
        nombre,
        marcas_vehiculo(nombre),
        tipos_vehiculo(nombre)
      )
    `)
    .eq('id', resolvedParams.id)
    .single()

  if (!activo) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-humania-blue mb-4">Activo no encontrado</h2>
        <Link href="/admin/activos"><Button variant="outline">Volver al inventario</Button></Link>
      </div>
    )
  }

  const modeloInfo = `${activo.modelos_vehiculo?.marcas_vehiculo?.nombre} ${activo.modelos_vehiculo?.nombre}`

  let candidatoAsignado = null
  if (activo.estado === 'ASIGNADO') {
    const { data: c } = await supabase
      .from('candidatos')
      .select('id, nombres, apellidos, telefono')
      .eq('activo_id', activo.id)
      .eq('estado', 'SELECCIONADO')
      .eq('estatus_contractual', 'ACTIVO')
      .maybeSingle()
    candidatoAsignado = c
  }

  const { data: historial } = await supabase
    .from('asset_assignment_history')
    .select('id, fecha_asignacion, fecha_liberacion, estatus_contractual_resultante, candidatos(nombres, apellidos)')
    .eq('activo_id', activo.id)
    .order('fecha_asignacion', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-8">
        <Link href="/admin/activos">
          <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0 mb-2">
            &larr; Volver a Activos
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-humania-blue">Editar Activo</h1>
        <p className="text-humania-gray font-medium mt-1">Vehículo: <span className="text-humania-blue">{modeloInfo}</span></p>
      </div>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
        <FormEditarActivo activo={activo} candidatoAsignado={candidatoAsignado} />
      </div>

      <HistorialActivo historial={(historial as any) || []} />
    </div>
  )
}
