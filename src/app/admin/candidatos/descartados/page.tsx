import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { UserX, Users, RefreshCcw, CheckCircle2 } from 'lucide-react'
import { DescartadosHistorialTable, type HistorialRow } from './DescartadosHistorialTable'

const CAUSAL_LABELS: Record<string, string> = {
  EDAD: 'Edad',
  EXPERIENCIA: 'Experiencia',
  COMPARENDOS: 'Comparendos',
  LICENCIA: 'Licencia',
  MANUAL: 'Manual',
  NO_DETERMINADA: 'No determinada',
}

interface MetricasHistorial {
  total_por_causal: Record<string, number>
  total_por_poblacion: Record<string, number>
  total_general: number
  ultimos_30_dias: number
  ultimos_90_dias: number
  repostulaciones_detectadas: number
  elegibles_confirmados: number
}

export default async function DescartadosHistorialPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: caller } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', session.user.id)
    .single()
  const esSuperAdmin = caller?.role === 'SUPER_ADMIN'

  // Unica via de lectura para ADMIN (RLS bloquea el SELECT directo a la
  // tabla para ese rol) -- para SUPER_ADMIN tambien funciona igual, solo
  // que ademas puede leer el detalle identificable de abajo.
  const { data: metricas, error: metricasError } = await supabase
    .rpc('obtener_metricas_descartados_historial') as { data: MetricasHistorial | null, error: unknown }

  if (metricasError) {
    console.error('Error obteniendo métricas de descartados históricos:', metricasError)
  }

  // Solo SUPER_ADMIN llega a este SELECT con exito -- RLS de la tabla
  // (Fase 1) ya bloquea a cualquier otro rol.
  let historial: HistorialRow[] = []
  if (esSuperAdmin) {
    const { data, error } = await supabase
      .from('candidatos_descartados_historial')
      .select('id, poblacion, causal, nombres, correo_electronico, resultado_actual, fecha_descarte, retencion_anonimizado_en, causal_detalle')
      .order('fecha_descarte', { ascending: false })

    if (error) {
      console.error('Error obteniendo detalle de descartados históricos:', error)
    }
    historial = (data as HistorialRow[]) || []
  }

  const totalGeneral = metricas?.total_general ?? 0
  const totalPorCausal = metricas?.total_por_causal ?? {}
  const totalPorPoblacion = metricas?.total_por_poblacion ?? {}

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-humania-blue">Historial de Descartados</h1>
        <p className="text-humania-gray">Trazabilidad histórica de candidatos y postulantes descartados (KAI-36)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Total Histórico</h3>
            <UserX className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{totalGeneral}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Descartes registrados en total</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Últimos 30 días</h3>
            <UserX className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{metricas?.ultimos_30_dias ?? 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Descartes recientes</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Descarte Silencioso</h3>
            <Users className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{totalPorPoblacion.SILENCIOSA ?? 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Nunca llegaron a ser candidatos</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Candidatos Reales</h3>
            <Users className="w-5 h-5 text-humania-blue/30" />
          </div>
          <div>
            <p className="text-4xl font-bold text-humania-blue">{totalPorPoblacion.CANDIDATO_REAL ?? 0}</p>
            <p className="text-xs text-humania-gray mt-2 font-medium">Llegaron a existir en `candidatos`</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest mb-4">Por Causal</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(CAUSAL_LABELS).map(([causal, label]) => (
            <div key={causal} className="bg-white p-4 rounded-lg shadow-sm border border-neutral-200">
              <p className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest">{label}</p>
              <p className="text-2xl font-bold text-humania-blue mt-1">{totalPorCausal[causal] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50/50 border border-humania-blue/20 rounded-lg p-4 flex items-start gap-3">
        <RefreshCcw className="w-5 h-5 text-humania-blue/50 shrink-0 mt-0.5" />
        <div className="text-sm text-humania-gray">
          <p className="font-medium text-humania-blue">Repostulaciones detectadas: {metricas?.repostulaciones_detectadas ?? 0} · Elegibles confirmados: {metricas?.elegibles_confirmados ?? 0}</p>
          <p className="mt-1">Estos dos indicadores todavía no tienen datos: la detección automática de repostulación es una fase futura (Fase 4) aún no construida. El campo ya está listo para cuando esa lógica se implemente.</p>
        </div>
      </div>

      {esSuperAdmin ? (
        <DescartadosHistorialTable historial={historial} />
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-humania-gray/40 shrink-0 mt-0.5" />
          <p className="text-sm text-humania-gray">
            El detalle identificable (nombre, correo, fecha exacta por persona) es exclusivo de <span className="font-bold">SUPER_ADMIN</span>. Como ADMIN, solo puedes ver los totales agregados de arriba.
          </p>
        </div>
      )}
    </div>
  )
}
