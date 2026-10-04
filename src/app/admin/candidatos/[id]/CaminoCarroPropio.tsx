'use client'

// KAI-125 — "Camino a tu carro propio" (vista del equipo, estilo carretera).
// SDD `progreso-conductor`, spec.md R8-R10 y R14, textos aprobados de la
// Sección 11. Solo presenta: los números salen de `calcularAvanceConductor`.

import { Flame } from 'lucide-react'
import { formatearSoloFecha } from '@/lib/format'
import type { AvanceConductor, EstadoSemana } from '@/lib/domain/contrato/avance'
import { CarroIlustrado } from './CarroIlustrado'

const AZUL = '#002B4A'
const ARENA = '#D9C4A1'
const VERDE = '#1D9E75'

const COLOR_SEMANA: Record<EstadoSemana, string> = {
  NORMAL: VERDE,
  APLAZATORIA: '#EF9F27',
  NO_PAGO: '#E24B4A',
  POR_RECORRER: '#E5E3DC',
}

const LEYENDA: Array<[EstadoSemana, string]> = [
  ['NORMAL', 'Pagada'],
  ['APLAZATORIA', 'Aplazatoria'],
  ['NO_PAGO', 'Sin pago'],
  ['POR_RECORRER', 'Por recorrer'],
]

// Carretera: de x = 40 a x = 960 en un lienzo de 1000 de ancho.
const INICIO_X = 40
const LARGO = 920

export function CaminoCarroPropio({ nombre, avance }: { nombre: string; avance: AvanceConductor }) {
  const { plazo } = avance

  if (avance.avance === null) {
    return (
      <div className="rounded-lg border border-dashed border-humania-sand bg-humania-sand/10 p-5">
        <h4 className="text-sm font-bold text-humania-blue uppercase tracking-widest">Camino a tu carro propio</h4>
        <p className="mt-2 text-sm text-humania-gray">Define las semanas pactadas en Términos del contrato para ver el camino del conductor.</p>
      </div>
    )
  }

  const xCarro = Math.min(Math.max(INICIO_X + LARGO * avance.avance, INICIO_X + 72), INICIO_X + LARGO - 72)
  const xHito = avance.hito78 ? INICIO_X + LARGO * avance.hito78.posicion : null
  // La etiqueta del hito mide ~380 de ancho: se mantiene dentro del lienzo.
  const xEtiquetaHito = xHito === null ? null : Math.min(Math.max(xHito, 210), 790)
  const semanasPagadas = `${plazo.ordinariasPagadas} de ${plazo.ordinariasPagadas + (plazo.restantes ?? 0)}`

  const cifras: Array<[string, string]> = [
    ['Semanas pagadas', semanasPagadas],
    ['Te faltan', `${plazo.restantes} ${plazo.restantes === 1 ? 'semana' : 'semanas'}`],
    ['Aproximadamente', `${avance.mesesAproximados} ${avance.mesesAproximados === 1 ? 'mes' : 'meses'}`],
    ['Llegada estimada', formatearSoloFecha(plazo.fechaEstimadaFin) ?? '—'],
  ]

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Camino a tu carro propio</h4>
          <p className="mt-1 text-xl font-bold text-humania-blue">{nombre}, vas por buen camino</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold leading-none text-humania-blue tabular-nums">{avance.porcentaje} %</p>
          <p className="text-xs text-humania-gray/70 mt-1">del camino</p>
        </div>
      </div>

      <svg viewBox="0 0 1000 215" className="w-full h-auto" role="img" aria-label={`Avance del conductor: ${avance.porcentaje} % del camino`}>
        {/* carretera */}
        <rect x={INICIO_X} y="120" width={LARGO} height="36" rx="18" fill="#E5E3DC" />
        <rect x={INICIO_X} y="120" width={Math.max(36, xCarro - INICIO_X)} height="36" rx="18" fill={AZUL} />
        <line x1={INICIO_X + 18} y1="138" x2={INICIO_X + LARGO - 18} y2="138" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="16 14" opacity="0.8" />

        {/* hito de la semana 78 */}
        {xHito !== null && (
          <g>
            <line x1={xHito} y1="58" x2={xHito} y2="120" stroke={avance.hito78?.alcanzado ? VERDE : '#BA7517'} strokeWidth="3" />
            <path d={`M${xHito} 58 L${xHito + 30} 66 L${xHito} 74 Z`} fill={avance.hito78?.alcanzado ? VERDE : '#EF9F27'} />
            <text x={xEtiquetaHito ?? xHito} y="40" textAnchor="middle" fontSize="26" fontWeight="700" fill={AZUL}>Semana 78 · opción de compra</text>
          </g>
        )}

        {/* meta: bandera a cuadros */}
        <g>
          <line x1={INICIO_X + LARGO - 10} y1="62" x2={INICIO_X + LARGO - 10} y2="120" stroke="#5F5E5A" strokeWidth="3" />
          {[0, 1, 2, 3].map(c => [0, 1, 2].map(f => (
            <rect key={`${c}-${f}`} x={INICIO_X + LARGO - 8 + c * 9} y={62 + f * 9} width="9" height="9" fill={(c + f) % 2 === 0 ? AZUL : '#FFFFFF'} stroke={AZUL} strokeWidth="0.5" />
          )))}
        </g>

        <text x={INICIO_X} y="196" fontSize="26" fill="#5F5E5A">Entrega</text>
        <text x={INICIO_X + LARGO} y="196" textAnchor="end" fontSize="26" fontWeight="700" fill={AZUL}>Meta</text>

        <CarroIlustrado x={xCarro} y={134} escala={1.15} detalle={ARENA} />
      </svg>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cifras.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-md bg-neutral-50 border border-neutral-100 px-3 py-2">
            <p className="text-xs text-humania-gray/70">{etiqueta}</p>
            <p className="text-lg font-bold text-humania-blue tabular-nums">{valor}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-xs text-humania-gray/70">Cada cuadro es una semana</p>
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-humania-blue">
            <Flame className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            Racha actual: {avance.racha} semanas
          </p>
        </div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10px, 1fr))' }}>
          {avance.semanas.map((estado, i) => (
            <div key={i} title={`Semana ${i + 1}`} className="aspect-square rounded-[2px]" style={{ background: COLOR_SEMANA[estado] }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-humania-gray/80">
          {LEYENDA.map(([estado, etiqueta]) => (
            <span key={estado} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: COLOR_SEMANA[estado] }} />
              {etiqueta}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
