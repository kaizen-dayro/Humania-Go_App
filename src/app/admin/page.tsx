import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Users, Car, CheckCircle2, AlertTriangle, UserX } from 'lucide-react'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Verificar sesión
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/admin/login')
  }

  // Fetch Stats in parallel
  const [
    { count: totalActivos },
    { count: activosDisponibles },
    { count: totalCandidatos },
    { count: candidatosRevision },
    { count: candidatosFinalistas },
    { count: descartadosPorEdad }
  ] = await Promise.all([
    supabase.from('activos').select('*', { count: 'exact', head: true }),
    supabase.from('activos').select('*', { count: 'exact', head: true }).eq('estado', 'DISPONIBLE'),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }).eq('estado', 'REVISION_PRELIMINAR'),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }).in('estado', ['SELECCIONADO', 'EN_ESPERA']),
    supabase.from('candidatos_descartados_por_edad').select('*', { count: 'exact', head: true })
  ])

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-humania-blue">Dashboard</h1>
        <p className="text-humania-gray">Resumen de operación de Humania Go</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        
        {/* KPI: Activos Totales */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Activos Totales</h3>
            <Car className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{totalActivos || 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Vehículos registrados</p>
          </div>
        </div>

        {/* KPI: Activos Disponibles */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-humania-blue/20 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-blue/70 uppercase tracking-widest">Disponibles</h3>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{activosDisponibles || 0}</p>
            <p className="text-xs text-humania-blue/70 mt-2 font-medium">Listos para asignar</p>
          </div>
        </div>

        {/* KPI: Candidatos Totales */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Candidatos</h3>
            <Users className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{totalCandidatos || 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Postulaciones históricas</p>
          </div>
        </div>
        {/* KPI: En Revisión */}
        <Link href="/admin/candidatos?estado=REVISION_PRELIMINAR" className="bg-white p-6 rounded-lg shadow-sm border border-yellow-200 bg-yellow-50/30 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-yellow-700 uppercase tracking-widest">En Revisión</h3>
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{candidatosRevision || 0}</p>
            <p className="text-xs text-yellow-700 mt-2 font-medium">Requieren atención</p>
          </div>
        </Link>
        {/* KPI: Finalistas */}
        <Link href="/admin/candidatos?estado=FINALISTAS" className="bg-white p-6 rounded-lg shadow-sm border border-humania-blue bg-blue-50/30 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-blue uppercase tracking-widest">Finalistas</h3>
            <Users className="w-5 h-5 text-humania-blue" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{candidatosFinalistas || 0}</p>
            <p className="text-xs text-humania-blue mt-2 font-medium">En espera o seleccionados</p>
          </div>
        </Link>

        {/* KPI: Descartados por Edad */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Descartados (Edad)</h3>
            <UserX className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{descartadosPorEdad || 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Fuera del rango de edad elegible</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Link href="/admin/candidatos" className="group bg-white p-8 rounded-lg shadow-sm border border-neutral-200 hover:border-humania-blue transition-all flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-humania-blue mb-1">Ver Candidatos</h3>
            <p className="text-sm text-humania-gray">Revisa y evalúa las postulaciones recientes.</p>
          </div>
          <div className="text-humania-blue/50 group-hover:text-humania-blue group-hover:translate-x-1 transition-transform">
            &rarr;
          </div>
        </Link>
        <Link href="/admin/activos" className="group bg-white p-8 rounded-lg shadow-sm border border-neutral-200 hover:border-humania-blue transition-all flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-humania-blue mb-1">Gestionar Activos</h3>
            <p className="text-sm text-humania-gray">Controla la disponibilidad de vehículos.</p>
          </div>
          <div className="text-humania-blue/50 group-hover:text-humania-blue group-hover:translate-x-1 transition-transform">
            &rarr;
          </div>
        </Link>
      </div>

    </div>
  )
}
