// KAI-125 — Avance del conductor hacia su carro propio (SDD `progreso-conductor`,
// spec.md R4-R14 y textos aprobados de la Sección 11).
//
// Módulo puro: sin Supabase, sin Next.js, sin red. Se construye sobre
// `calcularPlazo` (KAI-121). Solo calcula lo que muestran "Camino a tu carro
// propio" (panel) y la tarjeta para el conductor.

import { calcularPlazo, type EntradaPlazo, type ResultadoPlazo, type TipoPagoSemanal } from './plazo'

/** Contrato v3, Cláusula Décima: la opción de compra exige 78 semanas ordinarias pagadas. */
export const SEMANAS_OPCION_COMPRA = 78
/** Mitad del camino a la opción de compra (umbral del mensaje de etapa). */
export const SEMANAS_MITAD_OPCION = 39

export type EtapaConductor = 'INICIO' | 'MITAD' | 'OPCION' | 'COMPLETO'

/** Estado de cada semana del plazo ajustado en la cuadrícula del panel. */
export type EstadoSemana = TipoPagoSemanal | 'POR_RECORRER'

export interface AvanceConductor {
  plazo: ResultadoPlazo
  /** `null` sin semanas pactadas (R5). */
  avance: number | null
  porcentaje: number | null
  /** Posición del hito de la semana 78 en la carretera (0-1); `null` si no aplica (R6). */
  hito78: { posicion: number; alcanzado: boolean } | null
  mesesAproximados: number | null
  etapa: EtapaConductor | null
  /** Semanas NORMAL consecutivas desde la semana registrada más alta hacia atrás. */
  racha: number
  /** Una entrada por semana del plazo ajustado (vacío sin semanas pactadas). */
  semanas: EstadoSemana[]
}

/** Mensajes según la etapa — textos aprobados por Dayro (spec.md 11). */
export const MENSAJES_ETAPA: Record<EtapaConductor, string> = {
  INICIO: 'Cada martes que cumples te acerca a tu carro propio.',
  MITAD: 'Vas a mitad de camino de tu opción de compra. Sigue así.',
  OPCION: 'Ya puedes ejercer tu opción de compra. La meta está cerca.',
  COMPLETO: 'Tu carro ya es tuyo, ahora falta realizar el traspaso.',
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `2029-10-09` → `octubre de 2029` (solo para la tarjeta del conductor; excepción aprobada a la regla 10). */
export function fechaEnPalabras(fecha: string | null): string | null {
  const m = fecha ? /^(\d{4})-(\d{2})-\d{2}/.exec(fecha) : null
  if (!m) return null
  const mes = MESES[Number(m[2]) - 1]
  return mes ? `${mes} de ${m[1]}` : null
}

export function etapaPorOrdinarias(ordinarias: number, pactadas: number): EtapaConductor {
  if (ordinarias >= pactadas) return 'COMPLETO'
  if (ordinarias >= SEMANAS_OPCION_COMPRA) return 'OPCION'
  if (ordinarias >= SEMANAS_MITAD_OPCION) return 'MITAD'
  return 'INICIO'
}

export function calcularRacha(pagos: EntradaPlazo['pagos']): number {
  const porSemana = new Map(pagos.map(p => [p.numero_semana, p.tipo_pago]))
  const ultima = pagos.reduce((max, p) => Math.max(max, p.numero_semana), 0)
  let racha = 0
  for (let s = ultima; s >= 1; s--) {
    if (porSemana.get(s) !== 'NORMAL') break
    racha++
  }
  return racha
}

export function calcularAvanceConductor(entrada: EntradaPlazo): AvanceConductor {
  const plazo = calcularPlazo(entrada)
  const racha = calcularRacha(entrada.pagos)
  const pactadas = entrada.semanasPactadas

  if (plazo.plazoAjustado === null || pactadas === null) {
    return { plazo, avance: null, porcentaje: null, hito78: null, mesesAproximados: null, etapa: null, racha, semanas: [] }
  }

  const avance = Math.min(1, plazo.ordinariasPagadas / pactadas)
  const porcentaje = Math.round(avance * 100)
  const hito78 = pactadas > SEMANAS_OPCION_COMPRA
    ? { posicion: SEMANAS_OPCION_COMPRA / pactadas, alcanzado: plazo.ordinariasPagadas >= SEMANAS_OPCION_COMPRA }
    : null
  const mesesAproximados = Math.round(((plazo.restantes ?? 0) * 7) / 30.44)

  const porSemana = new Map(entrada.pagos.map(p => [p.numero_semana, p.tipo_pago]))
  const semanas: EstadoSemana[] = []
  for (let s = 1; s <= plazo.plazoAjustado; s++) {
    semanas.push(porSemana.get(s) ?? 'POR_RECORRER')
  }

  return {
    plazo,
    avance,
    porcentaje,
    hito78,
    mesesAproximados,
    etapa: etapaPorOrdinarias(plazo.ordinariasPagadas, pactadas),
    racha,
    semanas,
  }
}
