import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { CandidatosTable } from './CandidatosTable'

export default async function CandidatosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const resolvedParams = await searchParams
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  let query = supabase
    .from('candidatos')
    .select('*, ciudades_operacion(nombre_oficial), municipios_operacion(nombre_oficial)')
    .order('created_at', { ascending: false })

  if (resolvedParams.estado === 'FINALISTAS') {
    // Pseudo-estado del KPI "Finalistas" del dashboard: no es un valor real
    // de candidatos.estado, agrupa los mismos dos estados que cuenta el KPI.
    query = query.in('estado', ['SELECCIONADO', 'EN_ESPERA'])
  } else if (resolvedParams.estado) {
    query = query.eq('estado', resolvedParams.estado)
  }

  const { data: candidatos, error } = await query

  if (error) {
    console.error("Error fetching candidates:", error)
  }

  // Lista liviana de activos para el filtro "Activo Asignado" (nombre legible, no solo UUID).
  const { data: activosRaw } = await supabase
    .from('activos')
    .select('id, codigo_interno, modelos_vehiculo(nombre, marcas_vehiculo(nombre))')
    .order('codigo_interno')

  const activosParaFiltro = (activosRaw || []).map((a: any) => ({
    id: a.id,
    label: `${a.codigo_interno} - ${a.modelos_vehiculo?.marcas_vehiculo?.nombre ?? ''} ${a.modelos_vehiculo?.nombre ?? ''}`.trim()
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Candidatos</h1>
          <p className="text-humania-gray">Gestión de postulaciones recibidas</p>
        </div>
      </div>

      <Suspense fallback={<div className="text-humania-gray">Cargando candidatos...</div>}>
        <CandidatosTable
          candidatos={candidatos || []}
          currentFilter={resolvedParams.estado || ''}
          activosParaFiltro={activosParaFiltro}
        />
      </Suspense>
    </div>
  )
}
