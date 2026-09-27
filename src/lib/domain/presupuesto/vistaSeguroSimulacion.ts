// Calculadora de Presupuesto (KAI-40) — modelo de vista de la tarjeta "Seguro en esta simulación".
//
// Función pura y ESTRICTAMENTE DE PRESENTACIÓN: responde qué seguro usa el cálculo, qué datos vienen de
// la cotización actual y cuáles son históricos/no confirmados. Solo ordena y rotula datos que ya existen:
// la columna "usado en el cálculo" sale de `seguroEfectivo` (lo mismo que lee el motor) y la columna de la
// cotización sale de la vista ya construida por `construirVistaCotizacionSeguro` (sin tocar sus textos ni
// sus estados). No calcula cifras nuevas, no modifica parámetros y no cambia ningún indicador.

import type { ParametrosPresupuesto } from './parametros'
import { seguroEfectivo } from './parametros'
import { TEXTOS_APROBADOS } from './textosInterfaz'
import { TEXTOS_VISTA_COTIZACION, type FilaVistaCotizacion, type VistaCotizacionSeguro } from '../seguros/vistaCotizacion'

const T = TEXTOS_APROBADOS.seguroSimulacion

export interface FilaSeguroUsado {
  etiqueta: string
  /** moneda: pesos COP; texto: valor ya rotulado (ej. "72 meses"). */
  tipo: 'moneda' | 'texto'
  valor: number | string
}

export interface VistaSeguroSimulacion {
  titulo: string
  subtitulo: string
  usado: {
    titulo: string
    /** "No confirmado" cuando el cálculo usa la referencia histórica; null si el seguro no entra al cálculo. */
    etiqueta: string | null
    filas: FilaSeguroUsado[]
    /** Nota de la referencia histórica, o el aviso de que el seguro no entra al resultado. */
    nota: string
  }
  cotizacion: {
    titulo: string
    /** Resumen de la cotización con el estado de CADA dato tal como consta (nunca un estado global). */
    filas: FilaVistaCotizacion[]
    /** Por qué la cotización todavía no entra al cálculo, o el aviso de que no hay cotización cargada. */
    nota: string
    /** Enlace al detalle completo; solo existe cuando hay cotización y la amortización del crédito se muestra. */
    enlaceDetalle: string | null
  }
}

/** Filas del detalle de la cotización que se resumen en la tarjeta, en este orden. */
const FILAS_RESUMEN = [
  TEXTOS_VISTA_COTIZACION.etiquetas.valorPoliza,
  TEXTOS_VISTA_COTIZACION.etiquetas.valorFinanciado,
  TEXTOS_VISTA_COTIZACION.etiquetas.numeroCuotas,
] as const
const TOTAL_RESUMEN = TEXTOS_VISTA_COTIZACION.etiquetas.totalNominal

/**
 * @param p parámetros del presupuesto mostrado (los mismos con los que se calculó el resultado).
 * @param vistaCotizacion la vista de la cotización de ESTE presupuesto, o null si no tiene cotización.
 * @param hayDetalleAmortizacion true si la página muestra "Amortización del crédito" (y con ella el detalle).
 */
export function construirVistaSeguroSimulacion(
  p: ParametrosPresupuesto,
  vistaCotizacion: VistaCotizacionSeguro | null,
  hayDetalleAmortizacion: boolean,
): VistaSeguroSimulacion {
  const efectivo = seguroEfectivo(p)
  const enCalculo = p.seguro.modo === 'LEGACY_NO_CONFIRMADO'

  const filasUsado: FilaSeguroUsado[] = !enCalculo
    ? []
    : p.modalidadAdquisicion === 'CREDITO'
      ? [
          { etiqueta: T.capitalFinanciado, tipo: 'moneda', valor: efectivo.principal },
          { etiqueta: T.costoFinancieroEstimado, tipo: 'moneda', valor: efectivo.costoFinancieroTotal },
          { etiqueta: T.plazo, tipo: 'texto', valor: T.plazoMeses(efectivo.plazoMeses) },
        ]
      : [{ etiqueta: T.capitalEnInversion, tipo: 'moneda', valor: efectivo.principal }]

  const filasCotizacion: FilaVistaCotizacion[] = vistaCotizacion
    ? [
        ...FILAS_RESUMEN.flatMap((etiqueta) => vistaCotizacion.filas.filter((f) => f.etiqueta === etiqueta)),
        ...vistaCotizacion.totales.filter((t) => t.etiqueta === TOTAL_RESUMEN),
      ]
    : []

  return {
    titulo: T.titulo,
    subtitulo: T.subtitulo,
    usado: {
      titulo: enCalculo ? T.usadoHistorico : T.usadoNinguno,
      etiqueta: enCalculo ? TEXTOS_APROBADOS.noConfirmado : null,
      filas: filasUsado,
      nota: enCalculo ? T.notaHistorico : T.sinSeguro,
    },
    cotizacion: {
      titulo: T.cotizacion,
      filas: filasCotizacion,
      nota: vistaCotizacion ? T.notaCotizacion : T.sinCotizacion,
      enlaceDetalle: vistaCotizacion && hayDetalleAmortizacion ? T.verDetalle : null,
    },
  }
}
