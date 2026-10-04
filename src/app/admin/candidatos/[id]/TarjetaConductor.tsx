'use client'

// KAI-125 — Tarjeta para el conductor (estilo anillo). SDD `progreso-conductor`,
// spec.md R11-R14 y textos aprobados de la Sección 11.
//
// - D3: solo lo positivo (sin montos, aplazatorias, semanas sin pago ni contacto).
// - D4: foto real del vehículo; la ilustración solo si la foto no se puede leer.
// - D7 (a): sin librerías nuevas. La tarjeta es un SVG de 1080 × 1350 que se
//   convierte a PNG con el canvas del navegador. La foto se incrusta como data URL
//   para que el canvas no quede bloqueado por origen cruzado; si la foto no se
//   puede leer, se usa la ilustración (spec 9.5). Nada se sube a ningún lado.

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MENSAJES_ETAPA, fechaEnPalabras, type AvanceConductor } from '@/lib/domain/contrato/avance'
import { CarroIlustrado } from './CarroIlustrado'

const AZUL = '#002B4A'
const ARENA = '#D9C4A1'
const GRIS = '#2F3437'
const FUENTE = 'Arial, Helvetica, sans-serif'

const ANCHO = 1080
const ALTO = 1350
const CX = 540
const CY = 610
const R_ANILLO = 290
const R_FOTO = 236
const CIRCUNFERENCIA = 2 * Math.PI * R_ANILLO

async function aDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(blob)
  })
}

export function TarjetaConductor({
  nombre,
  vehiculo,
  fotoUrl,
  avance,
}: {
  nombre: string
  /** "Marca Modelo · PLACA" */
  vehiculo: string
  fotoUrl: string | null
  avance: AvanceConductor
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [fotoData, setFotoData] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fotoUrl) return
    let vigente = true
    aDataUrl(fotoUrl)
      .then(d => { if (vigente) setFotoData(d) })
      .catch(err => {
        // Spec 9.5: sin foto legible, la tarjeta usa la ilustración.
        console.error('No se pudo leer la foto del vehículo para la tarjeta:', err)
      })
    return () => { vigente = false }
  }, [fotoUrl])

  if (avance.avance === null || avance.etapa === null) return null

  const { plazo } = avance
  const usarFoto = !!fotoData
  const llegada = fechaEnPalabras(plazo.fechaEstimadaFin)
  const progreso = Math.max(0.0001, avance.avance)

  async function descargar() {
    if (!svgRef.current) return
    setError('')
    setDescargando(true)
    try {
      const xml = new XMLSerializer().serializeToString(svgRef.current)
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('No se pudo dibujar la tarjeta.'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = ANCHO
      canvas.height = ALTO
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('El navegador no permite generar la imagen.')
      ctx.drawImage(img, 0, 0, ANCHO, ALTO)
      URL.revokeObjectURL(url)
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('El navegador no pudo generar el PNG.')
      const enlace = document.createElement('a')
      const fecha = new Date().toISOString().slice(0, 10)
      const slug = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      enlace.download = `camino-${slug || 'conductor'}-${fecha}.png`
      enlace.href = URL.createObjectURL(blob)
      enlace.click()
      setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
    } catch (err) {
      console.error('Error generando la tarjeta del conductor:', err)
      setError(err instanceof Error ? err.message : 'No se pudo generar la imagen.')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          width={ANCHO}
          height={ALTO}
          className="w-full h-auto rounded-xl shadow-sm border border-neutral-200"
          role="img"
          aria-label={`Tarjeta para ${nombre}: ${avance.porcentaje} % del camino`}
        >
          <defs>
            <clipPath id="tarjeta-foto">
              <circle cx={CX} cy={CY} r={R_FOTO} />
            </clipPath>
          </defs>

          {/* fondo */}
          <rect width={ANCHO} height={ALTO} fill="#FFFFFF" />
          <rect width={ANCHO} height="250" fill={AZUL} />
          <rect y="250" width={ANCHO} height="10" fill={ARENA} />
          <text x="80" y="96" fontFamily={FUENTE} fontSize="34" fontWeight="700" fill={ARENA} letterSpacing="2">Humania Go</text>
          <text x="80" y="160" fontFamily={FUENTE} fontSize="54" fontWeight="700" fill="#FFFFFF">{nombre},</text>
          <text x="80" y="222" fontFamily={FUENTE} fontSize="54" fontWeight="700" fill="#FFFFFF">cada semana cuenta</text>

          {/* anillo */}
          <circle cx={CX} cy={CY} r={R_ANILLO} fill="none" stroke="#E5E3DC" strokeWidth="44" />
          <circle
            cx={CX}
            cy={CY}
            r={R_ANILLO}
            fill="none"
            stroke={AZUL}
            strokeWidth="44"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUNFERENCIA * progreso} ${CIRCUNFERENCIA}`}
            transform={`rotate(-90 ${CX} ${CY})`}
          />

          {/* centro: foto real o ilustración */}
          <circle cx={CX} cy={CY} r={R_FOTO} fill="#F1EFE8" />
          {usarFoto ? (
            <image
              href={fotoData!}
              x={CX - R_FOTO}
              y={CY - R_FOTO}
              width={R_FOTO * 2}
              height={R_FOTO * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#tarjeta-foto)"
            />
          ) : (
            <CarroIlustrado x={CX} y={CY + 60} escala={3.1} detalle={ARENA} />
          )}

          {/* porcentaje */}
          <rect x={CX - 150} y={CY + R_ANILLO - 58} width="300" height="116" rx="58" fill={AZUL} stroke="#FFFFFF" strokeWidth="8" />
          <text x={CX} y={CY + R_ANILLO + 8} textAnchor="middle" fontFamily={FUENTE} fontSize="62" fontWeight="700" fill="#FFFFFF">{avance.porcentaje} %</text>
          <text x={CX} y={CY + R_ANILLO + 44} textAnchor="middle" fontFamily={FUENTE} fontSize="26" fill={ARENA}>del camino</text>

          {/* cifras */}
          <text x={CX} y="1040" textAnchor="middle" fontFamily={FUENTE} fontSize="44" fontWeight="700" fill={AZUL}>{plazo.ordinariasPagadas} semanas cumplidas</text>
          <text x={CX} y="1094" textAnchor="middle" fontFamily={FUENTE} fontSize="32" fill={GRIS}>
            Te faltan {plazo.restantes} semanas, cerca de {avance.mesesAproximados} meses
          </text>
          {llegada && (
            <text x={CX} y="1140" textAnchor="middle" fontFamily={FUENTE} fontSize="30" fill={GRIS}>Llegada estimada: {llegada}</text>
          )}

          {/* mensaje */}
          <rect x="80" y="1172" width={ANCHO - 160} height="96" rx="20" fill="#F6EFE3" stroke={ARENA} strokeWidth="3" />
          <text x={CX} y="1232" textAnchor="middle" fontFamily={FUENTE} fontSize="30" fontWeight="700" fill={AZUL}>{MENSAJES_ETAPA[avance.etapa]}</text>

          {/* pie */}
          <text x={CX} y="1316" textAnchor="middle" fontFamily={FUENTE} fontSize="26" fill="#888780">{vehiculo}</text>
        </svg>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Tarjeta para el conductor</h4>
          </div>

          <Button type="button" onClick={descargar} disabled={descargando} className="rounded-none">
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            {descargando ? 'Generando...' : 'Descargar imagen'}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
