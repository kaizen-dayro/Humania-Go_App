import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Users, Car, CheckCircle2, AlertTriangle, UserX, ShieldAlert, FileWarning } from 'lucide-react'
import Link from 'next/link'

// Fuera del componente a propósito: llamar Date.now() directamente dentro
// del cuerpo de un componente dispara react-hooks/purity ("impure
// function during render") -- en una función auxiliar normal (no un
// componente) esa regla no aplica.
function filtroActivosConDocumentosPorVencer(): string {
  const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `vencimiento_tecnomecanica.lte.${en30Dias},vencimiento_soat.lte.${en30Dias},vencimiento_impuestos.lte.${en30Dias}`
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Verificar sesión
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/admin/login')
  }

  // Fase 18: el conteo de descartados por comparendos solo lo puede ver
  // SUPER_ADMIN (pedido explícito del usuario) -- se evita la consulta por
  // completo para un ADMIN normal, aunque RLS ya la restringiría igual.
  const { data: caller } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', session.user.id)
    .single()
  const esSuperAdmin = caller?.role === 'SUPER_ADMIN'

  // Fase 21: activos con al menos un documento (Tecnomecánica/SOAT/
  // Impuestos) vencido o por vencer dentro de 30 días -- mismo umbral
  // "UN_MES" que dispara la primera notificación por correo.
  const filtroVencimientos = filtroActivosConDocumentosPorVencer()

  // Fetch Stats in parallel
  const [
    { count: totalActivos },
    { count: activosDisponibles },
    { count: totalCandidatos },
    { count: candidatosRevision },
    { count: candidatosFinalistas },
    { count: descartadosPorEdad },
    { count: descartadosPorComparendos },
    { count: activosConDocumentosPorVencer }
  ] = await Promise.all([
    supabase.from('activos').select('*', { count: 'exact', head: true }),
    supabase.from('activos').select('*', { count: 'exact', head: true }).eq('estado', 'DISPONIBLE'),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }).eq('estado', 'REVISION_PRELIMINAR'),
    supabase.from('candidatos').select('*', { count: 'exact', head: true }).in('estado', ['SELECCIONADO', 'EN_ESPERA']),
    supabase.from('candidatos_descartados_por_edad').select('*', { count: 'exact', head: true }),
    esSuperAdmin
      ? supabase.from('candidatos_descartados_por_comparendos').select('*', { count: 'exact', head: true })
      : Promise.resolve({ count: null }),
    supabase.from('activos').select('*', { count: 'exact', head: true }).or(filtroVencimientos)
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

      {/* Fase 21: visible para todos los ADMIN/SUPER_ADMIN activos */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileWarning className="w-4 h-4 text-humania-gray/50" />
          <h2 className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest">Documentos de Activos</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/admin/activos?vencimientos=1" className="bg-white p-6 rounded-lg shadow-sm border border-orange-200 bg-orange-50/30 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-bold text-orange-700 uppercase tracking-widest">Documentos por Vencer</h3>
              <FileWarning className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-4xl font-bold text-humania-blue">{activosConDocumentosPorVencer || 0}</p>
              <p className="text-xs text-orange-700 mt-2 font-medium">Tecnomecánica, SOAT o impuestos vencidos o por vencer (30 días)</p>
            </div>
          </Link>
        </div>
      </div>

      {esSuperAdmin && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-humania-gray/50" />
            <h2 className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest">Solo SUPER_ADMIN</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Descartados (Comparendos)</h3>
                <UserX className="w-5 h-5 text-humania-blue/30" />
              </div>
              <div>
                <p className="text-4xl font-bold text-humania-blue">{descartadosPorComparendos || 0}</p>
                <p className="text-xs text-humania-gray mt-2 font-medium">Más de 4 comparendos, o sin paz y salvo ni acuerdo de pago</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
