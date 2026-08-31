import {
  calcularIndiceSER,
  type DimensionKeySER,
  type DimensionSER,
  type EvaluacionAvanzadaInput,
  type ReferenciaLaboralEvaluacionInput,
} from '@/lib/domain/indiceSer'

const ORDEN_DIMENSIONES: DimensionKeySER[] = [
  'responsabilidad',
  'honestidad',
  'autonomia',
  'manejoDificultades',
  'visitaDomiciliaria',
]

function BarraDimension({ dimension }: { dimension: DimensionSER }) {
  const valorRedondeado = dimension.valor !== null ? Math.round(dimension.valor) : null
  // Intensidad continua proporcional al valor -- nunca una categoría con
  // punto de corte de negocio (ver Documentos/SDD/indice-ser-entrevista/
  // plan.md Sección 2.2, corregida tras auditoría del usuario).
  const opacidad = dimension.valor !== null ? 0.4 + (dimension.valor / 100) * 0.6 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-humania-blue">{dimension.label}</span>
        <span className="text-[11px] text-humania-gray/50 font-bold tracking-widest uppercase shrink-0">Peso {dimension.peso}%</span>
      </div>
      <div
        className="h-3 rounded-full bg-neutral-100 overflow-hidden"
        title={dimension.disponible ? `${dimension.label}: ${valorRedondeado}%` : `${dimension.label}: pendiente de evaluación`}
      >
        {dimension.disponible ? (
          <div
            className="h-full rounded-full bg-humania-sand"
            style={{ width: `${dimension.valor}%`, opacity: opacidad }}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, #d4d4d4 0, #d4d4d4 4px, transparent 4px, transparent 8px)',
            }}
          />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-humania-gray/60">Fuente: {dimension.fuente}</span>
        <span className="text-xs font-semibold text-humania-blue shrink-0">
          {dimension.disponible ? `${valorRedondeado}%` : 'Pendiente de evaluación'}
        </span>
      </div>
    </div>
  )
}

export function IndiceSER({
  evaluacion,
  referenciaLaboral,
}: {
  evaluacion: EvaluacionAvanzadaInput | null | undefined
  referenciaLaboral: ReferenciaLaboralEvaluacionInput | null | undefined
}) {
  const resultado = calcularIndiceSER(evaluacion, referenciaLaboral)

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6 mb-6">
      <div className="text-center mb-6 pb-6 border-b border-neutral-100">
        <h4 className="text-xs font-bold text-humania-gray/50 tracking-widest uppercase mb-1">Índice SER</h4>
        {resultado.disponible ? (
          <p className="text-5xl font-extrabold text-humania-blue">{Math.round(resultado.valor as number)}%</p>
        ) : (
          <p className="inline-block text-sm font-semibold text-neutral-600 bg-neutral-100 rounded-full px-4 py-1.5 mt-2">
            Evaluación incompleta
          </p>
        )}
        <p className="text-sm text-humania-gray mt-2">Evaluación integral de entrevista</p>
        <p className="text-xs text-humania-gray/60 mt-3 max-w-md mx-auto">
          Indicador interno de apoyo para la evaluación del candidato. La decisión final corresponde al equipo humano de Humania Go.
        </p>
      </div>
      <div className="space-y-5">
        {ORDEN_DIMENSIONES.map((key) => (
          <BarraDimension key={key} dimension={resultado.dimensiones[key]} />
        ))}
      </div>
    </div>
  )
}
