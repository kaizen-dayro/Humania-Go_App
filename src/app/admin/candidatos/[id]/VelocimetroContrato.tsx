'use client'

// KAI-125 — Vista alternativa del equipo, estilo velocímetro (opción B elegida
// por Dayro el 03-10-2026 a partir del boceto): arco con aguja hasta la meta,
// marca de la semana 78, línea de hitos y datos de control (aplazatorias,
// semanas sin pago y racha). Misma fuente de datos que la carretera.

import { CheckCircle2, CircleDashed, Flag } from 'lucide-react'
import { formatearSoloFecha } from '@/lib/format'
import { fechaBogota } from '@/lib/domain/contrato/plazo'
import type { AvanceConductor } from '@/lib/domain/contrato/avance'

const AZUL = '#002B4A'
const VERDE = '#1D9E75'
const AMBAR = '#BA7517'

// Arco semicircular: centro (200, 200), radio 150, de izquierda (180°) a derecha (0°).
const CX = 200
const CY = 200
const R = 150

function punto(fraccion: number, radio: number): [number, number] {
  const angulo = Math.PI * (1 - fraccion)
  return [CX + radio * Math.cos(angulo), CY - radio * Math.sin(angulo)]
}

export function VelocimetroContrato({
  nombre,
  fechaAsignacion,
  avance,
}: {
  nombre: string
  fechaAsignacion: string
  avance: AvanceConductor
}) {
  if (avance.avance === null) return null

  const { plazo } = avance
  const f = avance.avance
  const [xFin, yFin] = punto(f, R)
  const arcoGrande = 0 // un semicírculo nunca supera 180°
  const caminoAvance = f > 0 ? `M ${CX - R} ${CY} A ${R} ${R} 0 ${arcoGrande} 1 ${xFin.toFixed(2)} ${yFin.toFixed(2)}` : null
  const [xAguja, yAguja] = punto(f, R - 34)
  const hito = avance.hito78
  const marca = hito ? [punto(hito.posicion, R - 26), punto(hito.posicion, R + 26)] : null
  const faltan78 = Math.max(0, 78 - plazo.ordinariasPagadas)

  const hitos = [
    {
      icono: <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden="true" />,
      titulo: 'Entrega del vehículo',
      detalle: formatearSoloFecha(fechaBogota(fechaAsignacion)) ?? '—',
    },
    ...(hito
      ? [{
          icono: hito.alcanzado
            ? <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden="true" />
            : <CircleDashed className="w-5 h-5 text-amber-600" aria-hidden="true" />,
          titulo: 'Semana 78 · opción de compra',
          detalle: hito.alcanzado ? 'Alcanzada' : `Faltan ${faltan78} ${faltan78 === 1 ? 'semana' : 'semanas'}`,
        }]
      : []),
    {
      icono: avance.etapa === 'COMPLETO'
        ? <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden="true" />
        : <Flag className="w-5 h-5 text-humania-blue" aria-hidden="true" />,
      titulo: 'Meta',
      detalle: avance.etapa === 'COMPLETO' ? 'Alcanzada' : `Llegada estimada ${formatearSoloFecha(plazo.fechaEstimadaFin) ?? '—'}`,
    },
  ]

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="mb-2">
        <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Camino a tu carro propio</h4>
        <p className="mt-1 text-xl font-bold text-humania-blue">{nombre}, vas por buen camino</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
        <svg viewBox="0 0 400 270" className="w-full h-auto max-w-md mx-auto" role="img" aria-label={`Velocímetro del contrato: ${avance.porcentaje} % del camino`}>
          <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#E5E3DC" strokeWidth="26" strokeLinecap="round" />
          {caminoAvance && <path d={caminoAvance} fill="none" stroke={VERDE} strokeWidth="26" strokeLinecap="round" />}
          {marca && (
            <line
              x1={marca[0][0]} y1={marca[0][1]} x2={marca[1][0]} y2={marca[1][1]}
              stroke={hito?.alcanzado ? VERDE : AMBAR} strokeWidth="5" strokeLinecap="round"
            />
          )}
          <line x1={CX} y1={CY} x2={xAguja} y2={yAguja} stroke={AZUL} strokeWidth="6" strokeLinecap="round" />
          <circle cx={CX} cy={CY} r="13" fill={AZUL} />
          <text x={CX} y={CY + 60} textAnchor="middle" fontSize="44" fontWeight="700" fill={AZUL}>{avance.porcentaje} %</text>
          <text x={CX - R} y={CY + 40} textAnchor="middle" fontSize="18" fill="#5F5E5A">0</text>
          <text x={CX + R} y={CY + 40} textAnchor="middle" fontSize="18" fontWeight="700" fill={AZUL}>Meta</text>
        </svg>

        <div>
          <ol className="space-y-0">
            {hitos.map((h, i) => (
              <li key={h.titulo} className="flex gap-3 items-start">
                <span className="mt-0.5 shrink-0">{h.icono}</span>
                <div className={`flex-1 pb-3 mb-3 ${i < hitos.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                  <p className="text-sm font-bold text-humania-blue">{h.titulo}</p>
                  <p className="text-xs text-humania-gray/70">{h.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-humania-gray">
            <span>Aplazatorias: <b className="text-humania-blue">{plazo.aplazatorias}</b></span>
            <span>Sin pago: <b className="text-humania-blue">{plazo.sinPago}</b></span>
            <span>Racha actual: <b className="text-humania-blue">{avance.racha} semanas</b></span>
          </div>
        </div>
      </div>
    </div>
  )
}
