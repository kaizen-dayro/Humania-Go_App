import Link from 'next/link'
import { ReferenciaLaboralScore } from './ReferenciaLaboralScore'
import { CollapsibleCard } from './CollapsibleCard'

export type ReferenciaLaboralRow = {
  id: string
  candidato_id: string
  contacto_nombre: string | null
  contacto_empresa: string | null
  contacto_cargo: string | null
  contacto_relacion: string | null
  contacto_telefono: string | null
  responsabilidad: number | null
  cumplimiento: number | null
  honestidad_transparencia: number | null
  cuidado_recursos: number | null
  autonomia: number | null
  manejo_dificultades: number | null
  relaciones: number | null
  pregunta_confianza: number | null
  recontratacion: number | null
  destacaria_trabajador: string | null
  observaciones_previas: string | null
  estado: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA'
  usuario_id: string
  created_at: string
  updated_at: string
  completado_at: string | null
}

export type EvaluacionKey = 'responsabilidad' | 'cumplimiento' | 'honestidad_transparencia' | 'cuidado_recursos' | 'autonomia' | 'manejo_dificultades' | 'relaciones'

export const EVALUACION_FILAS: { key: EvaluacionKey; titulo: string; pregunta: string; opciones: string[]; icono: 'shield' | 'clipboard' | 'user' | 'package' | 'send' | 'cloud' | 'users' }[] = [
  {
    key: 'responsabilidad',
    titulo: 'Responsabilidad',
    pregunta: '¿Cómo era su nivel de responsabilidad frente a las tareas y compromisos que asumía?',
    opciones: ['Incumplía frecuentemente', 'Requería seguimiento constante', 'Se destacaba por su responsabilidad'],
    icono: 'shield',
  },
  {
    key: 'cumplimiento',
    titulo: 'Cumplimiento',
    pregunta: '¿Qué tan confiable era para cumplir lo que acordaba sin necesidad de seguimiento?',
    opciones: ['Incumplía frecuentemente', 'Requería seguimiento constante', 'Cumplía incluso sin supervisión'],
    icono: 'clipboard',
  },
  {
    key: 'honestidad_transparencia',
    titulo: 'Honestidad y transparencia',
    pregunta: 'Cuando cometía un error o se presentaba una dificultad, ¿cómo actuaba?',
    opciones: ['Ocultaba o evitaba responsabilidades', 'Le costaba reconocer o comunicar', 'Se destacaba por su honestidad'],
    icono: 'user',
  },
  {
    key: 'cuidado_recursos',
    titulo: 'Cuidado de recursos',
    pregunta: '¿Cómo era su manera de cuidar los equipos, herramientas, dinero u otros recursos?',
    opciones: ['Descuidos frecuentes o uso inadecuado', 'Presentaba descuidos y requería seguimiento', 'Se destacaba por el cuidado de recursos'],
    icono: 'package',
  },
  {
    key: 'autonomia',
    titulo: 'Autonomía',
    pregunta: '¿Cómo se desempeñaba cuando tenía responsabilidades que debía resolver por su cuenta?',
    opciones: ['Dependía constantemente', 'Requería acompañamiento frecuente', 'Se destacaba por su autonomía y criterio'],
    icono: 'send',
  },
  {
    key: 'manejo_dificultades',
    titulo: 'Manejo de dificultades',
    pregunta: 'Cuando se presentaban problemas o situaciones inesperadas, ¿cómo reaccionaba?',
    opciones: ['Reaccionaba de manera inadecuada', 'Le costaba manejar situaciones de presión', 'Se destacaba por su capacidad de respuesta'],
    icono: 'cloud',
  },
  {
    key: 'relaciones',
    titulo: 'Relaciones',
    pregunta: '¿Cómo era su manera de relacionarse con jefes, compañeros y clientes?',
    opciones: ['Generaba conflictos frecuentes', 'Presentaba dificultades', 'Se destacaba por respeto, servicio y manejo de relaciones'],
    icono: 'users',
  },
]

export const CONFIANZA_OPCIONES = ['Sí, sin ninguna reserva', 'Sí, con algunas condiciones', 'No']
export const RECONTRATACION_OPCIONES = ['Sí, sin duda', 'Sí, dependiendo de las condiciones', 'No']
export const RELACION_OPCIONES = ['Jefe directo', 'Jefe anterior', 'Recursos Humanos', 'Compañero de trabajo', 'Cliente', 'Proveedor', 'Otro']

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'text-neutral-500' },
  EN_PROGRESO: { label: '⚠ En progreso', className: 'text-amber-700' },
  COMPLETADA: { label: '✓ Completada', className: 'text-green-700' },
}

function Dato({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-humania-gray/50 font-bold tracking-widest mb-1 uppercase">{label}</p>
      <p className="text-sm font-medium text-humania-blue">{value || '—'}</p>
    </div>
  )
}

export function ReferenciaLaboralSection({
  candidatoId,
  candidatoEstado,
  initialData,
}: {
  candidatoId: string
  candidatoEstado: string
  initialData: ReferenciaLaboralRow | null
}) {
  const puedeCrearOContinuar = candidatoEstado === 'ENTREVISTA'
  const esCompletada = initialData?.estado === 'COMPLETADA'
  const puedeCorregir = esCompletada && candidatoEstado !== 'DESCARTADO'
  const href = `/admin/candidatos/${candidatoId}/referencia-laboral`

  return (
    <CollapsibleCard
      title="REFERENCIA LABORAL"
      headerExtra={initialData ? <span className={`text-xs font-semibold ${ESTADO_BADGE[initialData.estado].className}`}>{ESTADO_BADGE[initialData.estado].label}</span> : undefined}
    >
      {!initialData && (
        <div>
          <p className="text-sm text-humania-gray mb-4">
            Verificación interna opcional. El equipo humano decide si la realiza después de la entrevista.
          </p>
          {puedeCrearOContinuar ? (
            <Link href={href} className="inline-block bg-humania-blue hover:bg-humania-blue/90 text-white text-sm font-semibold rounded-none px-6 py-3 transition-colors">
              Referencia Laboral
            </Link>
          ) : (
            <p className="text-sm text-neutral-400">No registrada (disponible únicamente mientras el candidato está en estado ENTREVISTA).</p>
          )}
        </div>
      )}

      {initialData && initialData.estado !== 'COMPLETADA' && (
        <div className="space-y-4">
          <p className={`text-sm font-medium ${ESTADO_BADGE[initialData.estado].className}`}>{ESTADO_BADGE[initialData.estado].label}</p>
          {puedeCrearOContinuar ? (
            <Link href={href} className="inline-block border border-neutral-300 hover:border-neutral-400 text-humania-blue text-sm font-semibold rounded-none px-6 py-3 transition-colors">
              Continuar Referencia Laboral
            </Link>
          ) : (
            <p className="text-sm text-neutral-400">
              El candidato ya no está en estado ENTREVISTA; esta referencia quedó en progreso y no puede continuarse desde aquí.
            </p>
          )}
        </div>
      )}

      {initialData && initialData.estado === 'COMPLETADA' && (
        <div className="space-y-6">
          <p className={`text-sm font-medium ${ESTADO_BADGE.COMPLETADA.className}`}>{ESTADO_BADGE.COMPLETADA.label}</p>

          <div className="grid md:grid-cols-2 gap-y-4 gap-x-8">
            <Dato label="Nombre" value={initialData.contacto_nombre} />
            <Dato label="Empresa" value={initialData.contacto_empresa} />
            <Dato label="Cargo" value={initialData.contacto_cargo} />
            <Dato label="Relación" value={initialData.contacto_relacion} />
            <Dato label="Teléfono" value={initialData.contacto_telefono} />
            <Dato label="Completada" value={initialData.completado_at ? new Date(initialData.completado_at).toLocaleString() : null} />
          </div>

          <ReferenciaLaboralScore data={initialData} />

          <div className="border-t border-neutral-100 pt-4 space-y-1.5">
            {initialData.destacaria_trabajador && (
              <p className="text-sm text-humania-gray pt-1">
                <span className="font-semibold text-humania-blue">Destacaría:</span> {initialData.destacaria_trabajador}
              </p>
            )}
            {initialData.observaciones_previas && (
              <p className="text-sm text-humania-gray">
                <span className="font-semibold text-humania-blue">Observaciones:</span> {initialData.observaciones_previas}
              </p>
            )}
          </div>

          {puedeCorregir ? (
            <Link href={href} className="inline-block border border-neutral-300 hover:border-neutral-400 text-humania-blue text-sm font-semibold rounded-none px-6 py-3 transition-colors">
              Corregir información
            </Link>
          ) : (
            candidatoEstado === 'DESCARTADO' && (
              <p className="text-sm text-neutral-400">El candidato está en estado DESCARTADO; el registro queda protegido y no puede corregirse.</p>
            )
          )}
        </div>
      )}
    </CollapsibleCard>
  )
}
