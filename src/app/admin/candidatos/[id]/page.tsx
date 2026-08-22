import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { evaluateCandidateRequirements, evaluacionAvanzadaCompleta } from '@/lib/domain/eligibility'
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react'
import { CandidateActions } from './CandidateActions'
import { EvaluacionForm } from './EvaluacionForm'
import { ContractStatusForm } from './ContractStatusForm'
import { ReferenciaLaboralSection, type ReferenciaLaboralRow } from './ReferenciaLaboralSection'
import { getCandidateStatusHistory } from '../../actions'

export default async function CandidatoDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/admin/login')
  }

  // Fetch candidato data including relationships
  const { data: candidato, error } = await supabase
    .from('candidatos')
    .select(`
      *,
      ciudades_operacion (nombre_oficial),
      municipios_operacion (nombre_oficial),
      activos (
        codigo_interno,
        placa,
        estado,
        color,
        modelos_vehiculo (
          nombre,
          tipos_vehiculo (nombre),
          marcas_vehiculo (nombre)
        )
      ),
      candidatos_evaluacion (*)
    `)
    .eq('id', resolvedParams.id)
    .single()

  if (error || !candidato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-humania-blue mb-4">Candidato no encontrado</h2>
          <Link href="/admin"><Button variant="outline">Volver al panel</Button></Link>
        </div>
      </div>
    )
  }

  const { data: fiador } = await supabase.from('fiadores').select('*').eq('candidato_id', resolvedParams.id).single()
  const { data: referencias } = await supabase.from('referencias').select('*').eq('candidato_id', resolvedParams.id)
  const { data: referenciaLaboral } = await supabase
    .from('referencia_laboral')
    .select('*')
    .eq('candidato_id', resolvedParams.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data: autorizacionesDatos } = await supabase
    .from('candidate_data_authorizations')
    .select('*')
    .eq('candidate_id', resolvedParams.id)
    .order('created_at', { ascending: false })
  const { historial: historialCambios } = await getCandidateStatusHistory(resolvedParams.id)

  const candidatePayload = { ...candidato, fiador, referencias }
  const evaluations = evaluateCandidateRequirements(candidatePayload)

  const fails = evaluations.filter(e => e.status === 'FAIL')

  let activosParaAsignar: any[] = []
  if (candidato.estado === 'SELECCIONADO' && !candidato.estatus_contractual) {
    const { data: actDisp } = await supabase.from('activos')
      .select('id, codigo_interno, placa, modelo_id, modelos_vehiculo(nombre, marcas_vehiculo(nombre))')
      .eq('estado', 'DISPONIBLE')

    activosParaAsignar = actDisp || []
  }

  // UI Helpers
  const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">{title}</h3>
      <div className="grid md:grid-cols-2 gap-y-6 gap-x-12">{children}</div>
    </div>
  )

  const DataPoint = ({ label, value }: { label: string, value: string | number | boolean | null }) => (
    <div>
      <p className="text-[11px] text-humania-gray/50 font-bold tracking-widest mb-1.5 uppercase">{label}</p>
      <p className="text-sm font-medium text-humania-blue">
        {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : (value || 'No especificado')}
      </p>
    </div>
  )

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
      case 'FAIL': return <XCircle className="w-5 h-5 text-red-500 shrink-0" />
      case 'PENDING_VERIFICATION': return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
      case 'NA': default: return <HelpCircle className="w-5 h-5 text-neutral-400 shrink-0" />
    }
  }

  const StatusColorText = ({ status, text }: { status: string, text: string }) => {
    switch (status) {
      case 'PASS': return <span className="text-green-700 font-medium">{text}</span>
      case 'FAIL': return <span className="text-red-700 font-bold">{text}</span>
      case 'PENDING_VERIFICATION': return <span className="text-amber-700 font-medium">{text}</span>
      case 'NA': default: return <span className="text-neutral-500 font-medium">{text}</span>
    }
  }

  const modelo = candidato.activos?.modelos_vehiculo
  const refFamiliar = referencias?.find(r => r.tipo_referencia === 'FAMILIAR')
  const refPersonal = referencias?.find(r => r.tipo_referencia === 'PERSONAL')

  return (
    <div className="min-h-screen bg-neutral-50 font-sans pb-20">
      {/* Top Bar */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/candidatos">
              <Button variant="ghost" size="sm" className="text-humania-gray hover:text-humania-blue -ml-3">
                &larr; Volver
              </Button>
            </Link>
          </div>
          <div>
            <CandidateActions
              candidatoId={candidato.id}
              currentState={candidato.estado}
              evaluacionCompleta={evaluacionAvanzadaCompleta(candidato.candidatos_evaluacion)}
              referenciaLaboralCompleta={referenciaLaboral?.estado === 'COMPLETADA'}
              puedeDesistirDesdeSeleccionado={!candidato.estatus_contractual}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-8 space-y-6">
        
        {/* Encabezado del Candidato */}
        <div className="bg-white border border-neutral-200 p-8 rounded-lg shadow-sm flex justify-between items-start">
          <div>
            <p className="text-xs font-bold text-humania-gray/50 tracking-widest mb-2">CANDIDATO</p>
            <h1 className="text-3xl font-bold text-humania-blue">{candidato.nombres} {candidato.apellidos}</h1>
            <p className="text-sm text-humania-gray mt-2">ID: {candidato.numero_documento} • Registrado el {new Date(candidato.created_at).toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-humania-gray/50 tracking-widest mb-2">ESTADO ACTUAL</p>
            <div className="inline-block px-3 py-1 bg-neutral-100 text-humania-blue font-bold text-sm rounded-sm">
              {candidato.estado}
            </div>
            {modelo && (
              <p className="text-sm text-humania-gray mt-3 font-medium">
                Oportunidad: {modelo.marcas_vehiculo?.nombre} {modelo.nombre}
                {candidato.estado === 'SELECCIONADO' && (
                  candidato.estatus_contractual
                    ? <span className="text-green-700 font-bold">: Con Activo</span>
                    : <span className="text-amber-700 font-bold">: Sin Activo</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Resumen de Requisitos y Alertas */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-200 p-8 rounded-lg shadow-sm">
            <h3 className="text-sm font-bold text-humania-gray/50 tracking-widest mb-6">RESUMEN DE REQUISITOS</h3>
            <div className="space-y-4">
              {evaluations.map(e => (
                <div key={e.requirement} className="flex gap-3">
                  <StatusIcon status={e.status} />
                  <div>
                    <p className="text-sm text-humania-blue font-semibold">{e.label}</p>
                    <p className="text-xs mt-0.5"><StatusColorText status={e.status} text={e.reason} /></p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className={`border p-8 rounded-lg shadow-sm ${fails.length > 0 ? 'bg-red-50/50 border-red-200' : 'bg-white border-neutral-200'}`}>
              <h3 className={`text-sm font-bold tracking-widest mb-4 ${fails.length > 0 ? 'text-red-700' : 'text-humania-gray/50'}`}>
                REQUISITOS NO CUMPLIDOS
              </h3>
              {fails.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-800 mb-2">Este candidato presenta {fails.length} requisito(s) que no cumple:</p>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                    {fails.map(f => (
                      <li key={f.requirement}><span className="font-semibold">{f.label}:</span> {f.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  No se identifican incumplimientos en los requisitos declarados.
                </div>
              )}
            </div>

            <div className="bg-white border border-neutral-200 p-8 rounded-lg shadow-sm">
               <h3 className="text-sm font-bold text-humania-gray/50 tracking-widest mb-4">RESPALDO DEL CANDIDATO</h3>
               <div className="space-y-3">
                 <p className="text-sm text-humania-blue flex items-center justify-between">
                   <span className="font-medium">Referencia familiar:</span> 
                   {refFamiliar ? <StatusColorText status="PASS" text="✓ Registrada" /> : <StatusColorText status="FAIL" text="✕ Ausente" />}
                 </p>
                 <p className="text-sm text-humania-blue flex items-center justify-between">
                   <span className="font-medium">Referencia personal:</span> 
                   {refPersonal ? <StatusColorText status="PASS" text="✓ Registrada" /> : <StatusColorText status="FAIL" text="✕ Ausente" />}
                 </p>
                 <div className="h-px w-full bg-neutral-100 my-2"></div>
                 <p className="text-sm text-humania-blue flex items-center justify-between">
                   <span className="font-medium">Fiador solidario:</span> 
                   {fiador ? <StatusColorText status="PASS" text="✓ Registrado" /> : <StatusColorText status="FAIL" text="✕ Ausente" />}
                 </p>
                 <p className="text-sm text-humania-blue flex items-center justify-between">
                   <span className="font-medium">Finca raíz (Fiador):</span> 
                   {fiador?.tiene_finca_raiz ? <StatusColorText status="PENDING_VERIFICATION" text="⚠ Pendiente verificación" /> : <StatusColorText status="NA" text="No declarada" />}
                 </p>
               </div>
            </div>
          </div>
        </div>

        {/* Detalles Completos */}
        <div className="mt-8">
          <Section title="INFORMACIÓN PERSONAL">
            <DataPoint label="Tipo Documento" value={candidato.tipo_documento} />
            <DataPoint label="Número de Documento" value={candidato.numero_documento} />
            <DataPoint label="Correo Electrónico" value={candidato.correo_electronico} />
            <DataPoint label="Teléfono" value={candidato.telefono} />
            <DataPoint label="Ciudad" value={candidato.ciudades_operacion?.nombre_oficial} />
            <DataPoint label="Municipio" value={candidato.municipios_operacion?.nombre_oficial} />
            <DataPoint label="Barrio" value={candidato.barrio} />
            <DataPoint label="Género" value={candidato.genero} />
          </Section>

          <Section title="PERFIL Y OCUPACIÓN">
            <DataPoint label="Perfil Principal" value={candidato.tipo_perfil} />
            {candidato.tipo_perfil === 'CONDUCTOR_PLATAFORMA' ? (
              <DataPoint label="Plataformas" value={(candidato.plataformas || []).join(', ')} />
            ) : (
              <DataPoint label="Área de Actividad" value={candidato.categoria_actividad} />
            )}
            <DataPoint label="Años de experiencia" value={candidato.anos_experiencia_declarados} />
          </Section>

          <Section title="LICENCIA Y COMPARENDOS">
            <DataPoint label="Licencia Vigente Declarada" value={candidato.licencia_declarada_vigente} />
            <DataPoint label="Comparendos Estimados" value={candidato.cantidad_comparendos_declarados} />
          </Section>

          <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
             <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">FIADOR SOLIDARIO</h3>
             {fiador ? (
               <div className="grid md:grid-cols-2 gap-y-6 gap-x-12">
                 <DataPoint label="Nombre Completo" value={fiador.nombre_completo} />
                 <DataPoint label="Cédula" value={fiador.numero_documento} />
                 <DataPoint label="Teléfono" value={fiador.telefono} />
                 <DataPoint label="Ingresos Declarados" value={fiador.ingresos_mensuales_aprox} />
                 <div className="md:col-span-2">
                   <p className="text-[11px] text-humania-gray/50 font-bold tracking-widest mb-1.5 uppercase">Finca Raíz</p>
                   {fiador.tiene_finca_raiz ? (
                     <div className="flex items-center gap-2 mt-1">
                       <StatusIcon status="PENDING_VERIFICATION" />
                       <span className="text-sm text-amber-700 font-medium">Declarada por el candidato (Pendiente de verificación documental)</span>
                     </div>
                   ) : (
                     <p className="text-sm font-medium text-humania-blue">No</p>
                   )}
                 </div>
               </div>
             ) : (
               <p className="text-sm text-humania-gray">No registró información del fiador.</p>
             )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200 p-8 rounded-lg shadow-sm">
               <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">REFERENCIA FAMILIAR</h3>
               {refFamiliar ? (
                 <div className="space-y-4">
                   <DataPoint label="Nombre Completo" value={refFamiliar.nombre_completo} />
                   <DataPoint label="Parentesco" value={refFamiliar.parentesco_o_relacion} />
                   <DataPoint label="Teléfono" value={refFamiliar.telefono} />
                   <DataPoint label="Tiempo de conocerse" value={refFamiliar.tiempo_conocimiento} />
                   <DataPoint label="Ocupación" value={refFamiliar.ocupacion} />
                 </div>
               ) : (
                 <p className="text-sm text-red-600 font-medium">Ausente</p>
               )}
            </div>

            <div className="bg-white border border-neutral-200 p-8 rounded-lg shadow-sm">
               <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">REFERENCIA PERSONAL</h3>
               {refPersonal ? (
                 <div className="space-y-4">
                   <DataPoint label="Nombre Completo" value={refPersonal.nombre_completo} />
                   <DataPoint label="Relación" value={refPersonal.parentesco_o_relacion} />
                   <DataPoint label="Teléfono" value={refPersonal.telefono} />
                   <DataPoint label="Tiempo de conocerse" value={refPersonal.tiempo_conocimiento} />
                   <DataPoint label="Ocupación" value={refPersonal.ocupacion} />
                 </div>
               ) : (
                 <p className="text-sm text-red-600 font-medium">Ausente</p>
               )}
            </div>
          </div>

          <div className="bg-white border border-neutral-200 p-8 mt-6 rounded-lg shadow-sm">
            <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">AUTORIZACIÓN DE DATOS PERSONALES</h3>
            {autorizacionesDatos && autorizacionesDatos.length > 0 ? (
              <div className="space-y-4">
                {autorizacionesDatos.map((auth, idx) => (
                  <div key={auth.id} className={`grid md:grid-cols-4 gap-y-4 gap-x-8 ${idx > 0 ? 'pt-4 border-t border-neutral-100' : ''}`}>
                    <DataPoint label="Estado" value={auth.authorized ? 'Autorizada' : 'No autorizada'} />
                    <DataPoint label="Versión de política" value={auth.policy_version} />
                    <DataPoint label="Fecha de autorización" value={new Date(auth.authorized_at).toLocaleString()} />
                    <DataPoint label="Canal" value={auth.authorization_channel} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-red-600 font-medium">Sin autorización registrada</p>
            )}
          </div>

          <ReferenciaLaboralSection
            candidatoId={candidato.id}
            candidatoEstado={candidato.estado}
            initialData={referenciaLaboral as ReferenciaLaboralRow | null}
          />

          {(candidato.estado === 'ENTREVISTA' || candidato.estado === 'SELECCIONADO' || candidato.estado === 'EN_ESPERA') && (
            <div className="bg-white border border-humania-blue p-8 mt-6 rounded-lg shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-humania-blue"></div>
              <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">INFORMACIÓN AVANZADA (ENTREVISTA)</h3>
              <p className="text-sm text-humania-gray mb-6">
                Esta información complementaria debe ser registrada por el equipo humano durante o después de la entrevista para apoyar la decisión final.
              </p>
              <EvaluacionForm candidatoId={candidato.id} existingData={candidato.candidatos_evaluacion} />
            </div>
          )}

          {candidato.estado === 'SELECCIONADO' && (
            <ContractStatusForm
              candidatoId={candidato.id}
              estatus={candidato.estatus_contractual}
              activoAsignado={candidato.activos}
              activosDisponibles={activosParaAsignar}
            />
          )}

          <div className="bg-white border border-neutral-200 p-8 mt-6 rounded-lg shadow-sm">
            <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">HISTORIAL DE CAMBIOS</h3>
            {historialCambios.length === 0 ? (
              <p className="text-sm text-humania-gray/70">Sin eventos registrados todavía.</p>
            ) : (
              <div className="space-y-3">
                {historialCambios.map((h) => {
                  const badge = {
                    CAMBIO_ESTADO: 'bg-humania-blue/10 text-humania-blue',
                    ASIGNACION_ACTIVO: 'bg-green-100 text-green-800',
                    LIBERACION_ACTIVO: 'bg-amber-100 text-amber-800',
                    TRANSFERENCIA_ACTIVO: 'bg-purple-100 text-purple-800',
                  }[h.tipo_evento as string] || 'bg-neutral-100 text-humania-gray'
                  return (
                    <div key={h.id} className="border border-neutral-100 rounded-md p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${badge}`}>
                          {h.tipo_evento?.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-humania-gray/70">{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-medium text-humania-blue">
                        {h.estado_anterior ? `${h.estado_anterior} → ${h.estado_nuevo}` : h.estado_nuevo}
                        {h.estatus_contractual_nuevo && (
                          <span className="text-humania-gray"> {' '}(Contractual: {h.estatus_contractual_anterior ? `${h.estatus_contractual_anterior} → ` : ''}{h.estatus_contractual_nuevo})</span>
                        )}
                      </p>
                      <p className="text-sm text-humania-gray mt-1">{h.motivo}</p>
                      <p className="text-xs text-humania-gray/60 mt-2">Por: {h.usuario_email}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
