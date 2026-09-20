// KAI-29 — Modelo de vista de la tarjeta "Financiación del seguro (cotización)" (spec.md 34).
//
// Función pura y ESTRICTAMENTE INFORMATIVA: solo ordena y rotula datos que ya existen
// (`seguro.cotizacion` y `seguroNominal`). No calcula nada nuevo (ni tasas, ni intereses,
// ni amortización, ni saldo, ni proyecciones), no toca ningún indicador y no promueve el
// estado documental de ningún dato. Los textos son los aprobados por Humania Go y viven
// aquí para que las pruebas los fijen literalmente.

import type { CotizacionSeguro, EstadoLecturaCotizacion, ResultadoCronogramaSeguro } from './adaptador'
import type { EstadoDato } from './tipos'

export const TEXTOS_VISTA_COTIZACION = {
  titulo: 'Financiación del seguro (cotización)',
  subtitulo: 'Datos informativos de la cotización: no participan en ROI, payback, caja ni resultado neto.',
  nota: 'La diferencia nominal no es un interés ni una tasa: la tasa, el sistema de amortización y el saldo siguen pendientes de documento.',
  etiquetas: {
    pagoInicial: 'Pago inicial',
    gravamen: '4×1000 del pago inicial',
    pagoInicialTotal: 'Pago inicial total',
    valorFinanciado: 'Valor financiado',
    numeroCuotas: 'Número de cuotas',
    valorCuota: 'Valor de cada cuota (aproximado)',
    periodicidad: 'Periodicidad',
    diaVencimiento: 'Día de vencimiento',
    totalCuotas: 'Total de las cuotas',
    diferenciaNominal: 'Diferencia nominal sobre lo financiado',
    totalNominal: 'Total nominal (pago inicial + cuotas)',
  },
  estados: {
    confirmadoPorCotizacion: 'Confirmado por cotización',
    reportadoSinSoporte: 'Reportado, sin soporte documental',
  },
  fechaPrimeraCuota: 'Fecha de la primera cuota',
  fechaPendiente: 'Pendiente',
} as const

export type TextoEstadoVista =
  | typeof TEXTOS_VISTA_COTIZACION.estados.confirmadoPorCotizacion
  | typeof TEXTOS_VISTA_COTIZACION.estados.reportadoSinSoporte

export interface FilaVistaCotizacion {
  etiqueta: string
  /** moneda: pesos COP; entero: cantidad; texto: valor ya rotulado. */
  tipo: 'moneda' | 'entero' | 'texto'
  valor: number | string
  /** Estado documental del dato tal como consta; null en los totales (no son un dato informado). */
  estado: TextoEstadoVista | null
}

export interface VistaCotizacionSeguro {
  titulo: string
  subtitulo: string
  filas: FilaVistaCotizacion[]
  totales: FilaVistaCotizacion[]
  /** Frase completa: "Fecha de la primera cuota: Pendiente" (o la fecha, si algún día se informa). */
  fechaPrimeraCuota: string
  nota: string
}

/**
 * Texto aprobado para el estado de un dato. Solo existen dos: cualquier otro estado (incluido
 * el documental, que la base de datos rechaza hoy) NO recibe texto: la vista nunca "sube" un dato.
 */
export function textoEstado(estado: EstadoDato | undefined): TextoEstadoVista | null {
  if (estado === 'CONFIRMADO_POR_COTIZACION') return TEXTOS_VISTA_COTIZACION.estados.confirmadoPorCotizacion
  if (estado === 'REPORTADO_SIN_SOPORTE_DOCUMENTAL') return TEXTOS_VISTA_COTIZACION.estados.reportadoSinSoporte
  return null
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function textoFechaPrimeraCuota(fecha: string | null | undefined): string {
  const t = TEXTOS_VISTA_COTIZACION
  if (!fecha) return `${t.fechaPrimeraCuota}: ${t.fechaPendiente}`
  const m = RE_FECHA.exec(fecha)
  return `${t.fechaPrimeraCuota}: ${m ? `${m[3]}-${m[2]}-${m[1]}` : fecha}`
}

const PERIODICIDAD_A_TEXTO: Record<string, string> = { MENSUAL: 'Mensual' }

/**
 * Construye la vista solo si la lectura de la cotización está CARGADA y hay un cronograma nominal
 * válido; en cualquier otro caso devuelve null (la tarjeta no se muestra). Un dato no informado
 * (null) no genera fila: no se inventa nada.
 */
export function construirVistaCotizacionSeguro(
  estadoLectura: EstadoLecturaCotizacion,
  cotizacion: CotizacionSeguro | null,
  seguroNominal: ResultadoCronogramaSeguro | null,
): VistaCotizacionSeguro | null {
  if (estadoLectura !== 'CARGADA' || !cotizacion || !seguroNominal?.cronograma) return null
  const { entrada, estadoDatos } = cotizacion
  const cron = seguroNominal.cronograma
  const et = TEXTOS_VISTA_COTIZACION.etiquetas

  const filas: FilaVistaCotizacion[] = []
  const agregar = (
    etiqueta: string,
    tipo: FilaVistaCotizacion['tipo'],
    valor: number | string | null | undefined,
    estado: EstadoDato | undefined,
  ) => {
    if (valor === null || valor === undefined) return
    filas.push({ etiqueta, tipo, valor, estado: textoEstado(estado) })
  }
  agregar(et.pagoInicial, 'moneda', entrada.pagoInicial, estadoDatos.pagoInicial)
  agregar(et.gravamen, 'moneda', entrada.gravamen4x1000, estadoDatos.gravamen4x1000)
  // El pago inicial total es la suma que ya calcula el cronograma nominal; no es un dato informado, no lleva estado.
  agregar(et.pagoInicialTotal, 'moneda', cron.pagoInicial?.total, undefined)
  agregar(et.valorFinanciado, 'moneda', entrada.valorFinanciado, estadoDatos.valorFinanciado)
  agregar(et.numeroCuotas, 'entero', entrada.numeroCuotas, estadoDatos.numeroCuotas)
  agregar(et.valorCuota, 'moneda', entrada.valorCuota, estadoDatos.valorCuota)
  agregar(et.periodicidad, 'texto', PERIODICIDAD_A_TEXTO[entrada.periodicidad] ?? entrada.periodicidad, estadoDatos.periodicidad)
  agregar(et.diaVencimiento, 'entero', entrada.diaVencimiento, estadoDatos.diaVencimiento)

  const totales: FilaVistaCotizacion[] = []
  const agregarTotal = (etiqueta: string, valor: number | null) => {
    if (valor !== null) totales.push({ etiqueta, tipo: 'moneda', valor, estado: null })
  }
  agregarTotal(et.totalCuotas, cron.totalCuotasNominal)
  agregarTotal(et.diferenciaNominal, cron.costoFinancieroNominalTotal)
  agregarTotal(et.totalNominal, cron.totalNominal)

  return {
    titulo: TEXTOS_VISTA_COTIZACION.titulo,
    subtitulo: TEXTOS_VISTA_COTIZACION.subtitulo,
    filas,
    totales,
    fechaPrimeraCuota: textoFechaPrimeraCuota(entrada.fechaPrimeraCuota),
    nota: TEXTOS_VISTA_COTIZACION.nota,
  }
}
