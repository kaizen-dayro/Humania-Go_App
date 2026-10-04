'use client'

// KAI-125 — Progreso del conductor arriba de los pagos semanales: vista del equipo
// con dos estilos a elegir ("Carretera", por defecto, y "Velocímetro", opción B
// pedida por Dayro) y la tarjeta para el conductor. La elección se recuerda en el
// navegador de cada administrador (solo una comodidad: si el almacenamiento no está
// disponible, se usa la carretera).

import { useEffect, useState } from 'react'
import type { AvanceConductor } from '@/lib/domain/contrato/avance'
import { CaminoCarroPropio } from './CaminoCarroPropio'
import { VelocimetroContrato } from './VelocimetroContrato'
import { TarjetaConductor } from './TarjetaConductor'

type Vista = 'CARRETERA' | 'VELOCIMETRO'
const CLAVE = 'humania.progresoConductor.vista'

export function ProgresoConductor({
  nombre,
  vehiculo,
  fotoUrl,
  fechaAsignacion,
  avance,
}: {
  nombre: string
  vehiculo: string
  fotoUrl: string | null
  fechaAsignacion: string
  avance: AvanceConductor
}) {
  const [vista, setVista] = useState<Vista>('CARRETERA')

  // Se lee después del primer pintado (no en el estado inicial) para que el HTML
  // del servidor y el del navegador coincidan.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (window.localStorage.getItem(CLAVE) === 'VELOCIMETRO') setVista('VELOCIMETRO')
      } catch {
        // Sin almacenamiento disponible: se queda la carretera.
      }
    })
    return () => cancelAnimationFrame(id)
  }, [])

  function elegir(v: Vista) {
    setVista(v)
    try {
      window.localStorage.setItem(CLAVE, v)
    } catch {
      // Solo una comodidad; no afecta el funcionamiento.
    }
  }

  // Sin semanas pactadas: solo el aviso (spec R5).
  if (avance.avance === null) {
    return <CaminoCarroPropio nombre={nombre} avance={avance} />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="inline-flex border border-neutral-300 bg-white" role="group" aria-label="Estilo del gráfico">
          {([['CARRETERA', 'Carretera'], ['VELOCIMETRO', 'Velocímetro']] as Array<[Vista, string]>).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => elegir(valor)}
              aria-pressed={vista === valor}
              className={`px-4 py-1.5 text-sm font-medium cursor-pointer ${vista === valor ? 'bg-humania-blue text-white' : 'text-humania-gray hover:bg-neutral-50'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {vista === 'CARRETERA'
        ? <CaminoCarroPropio nombre={nombre} avance={avance} />
        : <VelocimetroContrato nombre={nombre} fechaAsignacion={fechaAsignacion} avance={avance} />}

      <TarjetaConductor nombre={nombre} vehiculo={vehiculo} fotoUrl={fotoUrl} avance={avance} />
    </div>
  )
}
