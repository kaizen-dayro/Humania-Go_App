import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { CandidateActions } from '../[id]/CandidateActions'
import { evaluacionAvanzadaCompleta } from '@/lib/domain/eligibility'

export default async function CompararCandidatosPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const resolvedParams = await searchParams
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const idsParam = resolvedParams.id
  if (!idsParam) redirect('/admin/candidatos')
  
  const ids = Array.isArray(idsParam) ? idsParam : [idsParam]

  // Obtener los candidatos
  const { data: candidatos, error } = await supabase
    .from('candidatos')
    .select(`
      *,
      fiadores (*),
      referencias (*),
      candidatos_evaluacion (*),
      ciudades_operacion (nombre_oficial),
      activos (
        modelos_vehiculo (
          nombre,
          marcas_vehiculo (nombre)
        )
      )
    `)
    .in('id', ids)

  if (error || !candidatos || candidatos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-center">
        <h1 className="text-xl font-bold mb-4">Error cargando candidatos</h1>
        <Link href="/admin/candidatos"><Button>Volver</Button></Link>
      </div>
    )
  }

  // Estado de la referencia laboral más reciente por candidato (no viene
  // en el join anterior porque puede haber varias filas históricas).
  const { data: referenciasLaborales } = await supabase
    .from('referencia_laboral')
    .select('candidato_id, estado, created_at')
    .in('candidato_id', ids)
    .order('created_at', { ascending: false })

  const referenciaLaboralCompletaPorCandidato = new Map<string, boolean>()
  for (const rl of referenciasLaborales || []) {
    if (!referenciaLaboralCompletaPorCandidato.has(rl.candidato_id)) {
      referenciaLaboralCompletaPorCandidato.set(rl.candidato_id, rl.estado === 'COMPLETADA')
    }
  }

  const StatusIcon = ({ status }: { status: 'PASS' | 'FAIL' | 'PENDING' }) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="w-4 h-4 text-green-500 inline mr-2" />
      case 'FAIL': return <XCircle className="w-4 h-4 text-red-500 inline mr-2" />
      case 'PENDING': return <AlertTriangle className="w-4 h-4 text-amber-500 inline mr-2" />
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Comparación de Candidatos</h1>
          <p className="text-humania-gray">Evaluación objetiva y contextual lado a lado</p>
        </div>
        <Link href="/admin/candidatos">
          <Button variant="outline">&larr; Volver a la lista</Button>
        </Link>
      </div>

      <div className="overflow-x-auto pb-6">
        <div className="flex gap-6 min-w-max">
          {candidatos.map(c => {
            const fiador = c.fiadores?.[0]
            const refFam = c.referencias?.find((r: any) => r.tipo_referencia === 'FAMILIAR')
            const refPer = c.referencias?.find((r: any) => r.tipo_referencia === 'PERSONAL')
            const evalAv = c.candidatos_evaluacion?.[0]
            const modelo = c.activos?.modelos_vehiculo
            
            return (
              <div key={c.id} className="w-[400px] bg-white border border-neutral-200 rounded-lg shadow-sm flex flex-col">
                <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
                  <p className="text-[10px] font-bold tracking-widest text-humania-gray/50 mb-2">CANDIDATO</p>
                  <h2 className="text-xl font-bold text-humania-blue mb-1">{c.nombres} {c.apellidos}</h2>
                  <p className="text-sm text-humania-gray mb-3">{c.tipo_perfil} • {c.ciudades_operacion?.nombre_oficial}</p>
                  <p className="text-xs font-bold bg-neutral-200 text-humania-blue inline-block px-2 py-1 rounded">ESTADO: {c.estado}</p>
                  {modelo && <p className="text-xs text-humania-gray mt-2 font-medium">Oportunidad: {modelo.marcas_vehiculo?.nombre} {modelo.nombre}</p>}
                </div>

                <div className="p-6 flex-1 space-y-8">
                  {/* OBJETIVOS */}
                  <div>
                    <h3 className="text-xs font-bold text-humania-blue border-b border-humania-blue pb-2 mb-4">REQUISITOS OBJETIVOS</h3>
                    <ul className="space-y-3 text-sm">
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Experiencia declarada:</span>
                        {c.anos_experiencia_declarados} años
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Licencia:</span>
                        {c.licencia_declarada_vigente ? <><StatusIcon status="PASS"/> Vigente</> : <><StatusIcon status="FAIL"/> No vigente</>}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Comparendos declarados:</span>
                        {c.cantidad_comparendos_declarados}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Fiador solidario:</span>
                        {fiador ? <><StatusIcon status="PASS"/> Registrado</> : <><StatusIcon status="FAIL"/> Ausente</>}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Ingresos Fiador:</span>
                        {fiador ? fiador.ingresos_mensuales_aprox : '—'}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Finca raíz declarada (Fiador):</span>
                        {fiador?.tiene_finca_raiz ? <><StatusIcon status="PENDING"/> Sí, pendiente verificar</> : 'No declarada'}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Ref. Familiar:</span>
                        {refFam ? <><StatusIcon status="PASS"/> {refFam.nombre_completo}</> : <><StatusIcon status="FAIL"/> Ausente</>}
                      </li>
                      <li>
                        <span className="font-semibold text-humania-gray block mb-1">Ref. Personal:</span>
                        {refPer ? <><StatusIcon status="PASS"/> {refPer.nombre_completo}</> : <><StatusIcon status="FAIL"/> Ausente</>}
                      </li>
                    </ul>
                  </div>

                  {/* CONTEXTUALES */}
                  <div>
                    <h3 className="text-xs font-bold text-humania-blue border-b border-neutral-200 pb-2 mb-4">INFORMACIÓN CONTEXTUAL</h3>
                    {!evalAv ? (
                      <p className="text-xs text-neutral-400 italic">No se ha registrado información de entrevista.</p>
                    ) : (
                      <ul className="space-y-3 text-sm">
                        <li><span className="font-semibold text-humania-gray mr-2">Edad:</span> {evalAv.edad || '—'}</li>
                        <li><span className="font-semibold text-humania-gray mr-2">Estado civil:</span> {evalAv.estado_civil || '—'}</li>
                        <li><span className="font-semibold text-humania-gray mr-2">Hijos:</span> {
                          evalAv.tiene_hijos === true ? `Sí (${evalAv.cantidad_hijos ?? '—'})`
                          : evalAv.tiene_hijos === false ? 'No'
                          : 'Sin información'
                        }</li>
                        <li><span className="font-semibold text-humania-gray mr-2">Con quién vive:</span> {evalAv.con_quien_vive || '—'}</li>
                        <li><span className="font-semibold text-humania-gray mr-2">Dependientes:</span> {evalAv.personas_dependientes || '0'}</li>
                        <li>
                          <span className="font-semibold text-humania-gray block mb-1">Responsabilidades:</span>
                          <p className="text-xs text-neutral-600 line-clamp-3">{evalAv.descripcion_responsabilidades || '—'}</p>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 mt-auto">
                  <p className="text-xs font-bold text-humania-gray/50 mb-3">DECISIÓN</p>
                  <CandidateActions
                    candidatoId={c.id}
                    currentState={c.estado}
                    evaluacionCompleta={evaluacionAvanzadaCompleta(c.candidatos_evaluacion)}
                    referenciaLaboralCompleta={referenciaLaboralCompletaPorCandidato.get(c.id) || false}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
