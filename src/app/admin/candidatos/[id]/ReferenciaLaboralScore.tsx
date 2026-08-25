import { Shield, Clipboard, User, Package, Send, Cloud, Users, CheckCircle2, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react'
import {
  EVALUACION_FILAS,
  CONFIANZA_OPCIONES,
  RECONTRATACION_OPCIONES,
  type ReferenciaLaboralRow,
  type EvaluacionKey,
} from './ReferenciaLaboralSection'

const ICONOS: Record<string, LucideIcon> = { shield: Shield, clipboard: Clipboard, user: User, package: Package, send: Send, cloud: Cloud, users: Users }

// Rampa secuencial de un solo tono (humania-blue), 3 pasos: 1=claro (requiere seguimiento) a 3=oscuro (se destaca).
const SEQ_COLOR: Record<number, string> = { 1: '#B9C9D3', 2: '#4E7690', 3: '#002B4A' }

function calcularPuntuacion(data: ReferenciaLaboralRow) {
  const valores = EVALUACION_FILAS
    .map(fila => data[fila.key] as number | null)
    .filter((v): v is number => v !== null && v !== undefined)
  if (valores.length === 0) return null
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length
  // Reescala 1–3 (1=peor, 3=mejor) a 0–5 estrellas, redondeado a medias estrellas.
  const estrellas = Math.round((((promedio - 1) / 2) * 5) * 2) / 2
  return estrellas
}

// Confianza y recontratación tienen la escala invertida: 1 es la mejor respuesta, 3 la peor.
function estadoInvertido(valor: number | null): 'good' | 'warning' | 'critical' | null {
  if (valor === 1) return 'good'
  if (valor === 2) return 'warning'
  if (valor === 3) return 'critical'
  return null
}

const PILL_CLASSES: Record<'good' | 'warning' | 'critical', string> = {
  good: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
}
const PILL_ICONS: Record<'good' | 'warning' | 'critical', LucideIcon> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
}

function PillEstado({ label, texto, estado }: { label: string; texto: string | null; estado: 'good' | 'warning' | 'critical' | null }) {
  if (!estado || !texto) return null
  const Icon = PILL_ICONS[estado]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${PILL_CLASSES[estado]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}: {texto}
    </span>
  )
}

function StarRating({ value, idPrefix }: { value: number; idPrefix: string }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  const STAR_PATH = 'M12 2.5l2.9 6.3 6.9.7-5.1 4.7 1.5 6.8L12 17.7l-6.2 3.3 1.5-6.8L2.2 9.5l6.9-.7Z'
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => {
        const isHalf = i === full && half
        const filled = i < full
        const clipId = `${idPrefix}-star-${i}`
        return (
          <svg key={i} viewBox="0 0 24 24" className="w-4 h-4">
            <path d={STAR_PATH} fill={filled ? '#D9C4A1' : '#E5E5E5'} />
            {isHalf && (
              <>
                <clipPath id={clipId}><rect x="0" y="0" width="12" height="24" /></clipPath>
                <path d={STAR_PATH} fill="#D9C4A1" clipPath={`url(#${clipId})`} />
              </>
            )}
          </svg>
        )
      })}
    </div>
  )
}

function BarraCompetencia({ fila, valor }: { fila: (typeof EVALUACION_FILAS)[number]; valor: number | null }) {
  const Icon = ICONOS[fila.icono]
  if (valor === null || valor === undefined) {
    return (
      <div className="grid grid-cols-[170px_1fr_44px] items-center gap-3 py-2 border-t border-neutral-50 first:border-t-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-humania-gray/40 shrink-0" />
          <span className="text-xs font-semibold text-humania-blue truncate">{fila.titulo}</span>
        </div>
        <div className="h-2.5 bg-neutral-100 rounded-full" />
        <span className="text-xs text-neutral-400 text-right">—</span>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[170px_1fr_44px] items-center gap-3 py-2 border-t border-neutral-50 first:border-t-0" title={fila.pregunta}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-humania-gray/40 shrink-0" />
        <span className="text-xs font-semibold text-humania-blue truncate">{fila.titulo}</span>
      </div>
      <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(valor / 3) * 100}%`, background: SEQ_COLOR[valor] }} />
      </div>
      <span className="text-xs font-bold text-humania-blue text-right">{valor}/3</span>
      <p className="col-span-3 text-[11px] text-humania-gray/60 -mt-1 pl-6">{fila.opciones[valor - 1]}</p>
    </div>
  )
}

export function ReferenciaLaboralScore({ data }: { data: ReferenciaLaboralRow }) {
  const estrellas = calcularPuntuacion(data)
  if (estrellas === null) return null

  const confianzaEstado = estadoInvertido(data.pregunta_confianza)
  const recontratacionEstado = estadoInvertido(data.recontratacion)
  const confianzaTexto = data.pregunta_confianza ? CONFIANZA_OPCIONES[data.pregunta_confianza - 1] : null
  const recontratacionTexto = data.recontratacion ? RECONTRATACION_OPCIONES[data.recontratacion - 1] : null

  return (
    <div className="border-t border-neutral-100 pt-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-5">
        <div>
          <p className="text-[11px] font-bold text-humania-gray/50 uppercase tracking-widest mb-2">Puntuación general</p>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-4xl font-extrabold text-humania-blue leading-none">{estrellas.toFixed(1)}</span>
            <span className="text-sm text-humania-gray/50 font-semibold">/ 5</span>
          </div>
          <StarRating value={estrellas} idPrefix={data.id} />
        </div>
        <div className="flex gap-2 flex-wrap md:justify-end md:max-w-xs">
          <PillEstado label="Confianza" texto={confianzaTexto} estado={confianzaEstado} />
          <PillEstado label="Recontratación" texto={recontratacionTexto} estado={recontratacionEstado} />
        </div>
      </div>

      <div className="flex flex-col">
        {EVALUACION_FILAS.map(fila => (
          <BarraCompetencia key={fila.key} fila={fila} valor={data[fila.key as EvaluacionKey] as number | null} />
        ))}
      </div>

      <div className="flex gap-5 flex-wrap pt-3 mt-2 border-t border-neutral-50 text-[10.5px] text-humania-gray/50">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: SEQ_COLOR[1] }} />1 — requiere seguimiento</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: SEQ_COLOR[2] }} />2 — cumple con acompañamiento</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: SEQ_COLOR[3] }} />3 — se destaca</span>
      </div>
    </div>
  )
}
