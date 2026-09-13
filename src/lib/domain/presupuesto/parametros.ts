// Calculadora de Presupuesto (KAI-29) — parámetros del motor financiero.
// Ver Documentos/SDD/calculadora-presupuesto/spec.md (Decisiones D1-D14,
// Sección 20) para las reglas de negocio completas. Función pura: sin
// persistencia, sin dependencias de Next.js/Supabase (mismo patrón que
// indiceSer.ts, KAI-27).

/**
 * Modalidad de adquisición del activo — decisión pedida explícitamente
 * por Humania Go (2026-09-01): existen ambas posibilidades en el
 * negocio. CREDITO usa financiación bancaria + financiación del seguro
 * (Capa B completa); RECURSOS_PROPIOS paga todo de contado, incluido
 * el seguro (confirmado por el usuario) — sin crédito, sin intereses,
 * sin amortización.
 */
export type ModalidadAdquisicion = 'CREDITO' | 'RECURSOS_PROPIOS'

export interface ParametrosPresupuesto {
  modalidadAdquisicion: ModalidadAdquisicion

  // Capa A — economía del activo (D1/D2, cerradas)
  precioCompra: number
  valorComercialBase: number
  traspaso: number
  capitalPropioDeclarado: number
  /**
   * Costos iniciales adicionales solo relevantes en modalidad
   * RECURSOS_PROPIOS (ej. GPS u otros) que en modalidad CREDITO ya
   * quedan embebidos dentro de `principalCreditoBancario` (ver nota en
   * `plan.md` Sección 4 — el GPS no se rastrea como parámetro propio
   * desde D1). Por defecto 0 — no se inventa un valor de negocio.
   */
  otrosCostosInicialesRecursosPropios: number

  // Capa B — financiación bancaria (D1, cerrada; solo aplica en
  // modalidad CREDITO). mesesContrato es exclusivamente el plazo del
  // crédito bancario, no la duración del contrato con el conductor
  // (D12, spec.md 19.18.2).
  principalCreditoBancario: number
  principalFinanciacionSeguro: number
  costoFinancieroSeguroEstimado: number
  tasaEfectivaAnualCredito: number
  mesesContrato: number
  /**
   * Abono extraordinario a capital, reducción de plazo (D15 CERRADA,
   * spec.md Sección 11/21, `Documentos/CAL/Amortizacion_Abono.xlsx`) —
   * % de la cuota mensual ORIGINAL del crédito (nunca de la cuota del
   * conductor ni del ingreso operativo), 100% a capital. 0 = sin abono
   * (comportamiento idéntico al de antes de esta funcionalidad).
   */
  porcentajeAbonoCapital: number
  /** Mes desde el cual aplica el abono (sugerido 3, coincide con el Excel de referencia — no un valor de negocio confirmado como fijo). */
  mesInicioAbonoCapital: number

  // Capa C — contrato Humania↔conductor (D3/D10/D11/D12/D14, cerradas)
  valorVentaContractualActivo: number
  cuotaSemanalConductor: number
  ahorroSemanalConductor: number
  bonoPatrimonialSemanal: number
  cuotaSemanaAplazatoria: number
  mesMinimoAbonosConductor: number
  abonoAdicionalConductorSemanal: number
  abonoConductorOcasional: number
  mesAbonoConductorOcasional: number
  porcentajeAtribucionAbonosConductor: number

  // Costos recurrentes anuales de Humania (D9, cerrada — periodicidad
  // independiente por concepto, año 1 ya incluido en la inversión
  // inicial, sin doble contabilización)
  soatAnual: number
  soatPeriodicidadMeses: number
  tecnomecanicaAnual: number
  tecnomecanicaPeriodicidadMeses: number
  impuestosAnuales: number
  impuestosPeriodicidadMeses: number
  otrosCostosHumaniaAnuales: number

  semanasPorAno: number
  mesesPorAno: number
}

/** Escenario de referencia validado en spec.md Secciones 19.12-19.19 (operación real, modalidad Crédito). */
export const PARAMETROS_REFERENCIA: ParametrosPresupuesto = {
  modalidadAdquisicion: 'CREDITO',

  precioCompra: 32_000_000,
  valorComercialBase: 32_600_000,
  traspaso: 452_500,
  capitalPropioDeclarado: 6_890_000,
  otrosCostosInicialesRecursosPropios: 0,

  principalCreditoBancario: 27_329_323,
  principalFinanciacionSeguro: 3_453_177,
  costoFinancieroSeguroEstimado: 2_500_000,
  tasaEfectivaAnualCredito: 0.268,
  mesesContrato: 72,
  porcentajeAbonoCapital: 0,
  mesInicioAbonoCapital: 3,

  // valorVentaContractualActivo coincide con precioCompra solo como
  // sugerencia de partida del ejemplo dado por Humania Go — es un
  // parámetro independiente (D10, spec.md 19.17), no una igualdad
  // automática confirmada.
  valorVentaContractualActivo: 32_000_000,
  cuotaSemanalConductor: 450_000,
  ahorroSemanalConductor: 90_000,
  bonoPatrimonialSemanal: 120_000,
  cuotaSemanaAplazatoria: 200_000,
  mesMinimoAbonosConductor: 13,
  abonoAdicionalConductorSemanal: 0,
  abonoConductorOcasional: 0,
  mesAbonoConductorOcasional: 0,
  porcentajeAtribucionAbonosConductor: 100,

  soatAnual: 456_000,
  soatPeriodicidadMeses: 12,
  tecnomecanicaAnual: 360_000,
  tecnomecanicaPeriodicidadMeses: 12,
  impuestosAnuales: 553_000,
  impuestosPeriodicidadMeses: 12,
  otrosCostosHumaniaAnuales: 0,

  semanasPorAno: 52,
  mesesPorAno: 12,
}

/**
 * Inversión inicial total — depende de la modalidad de adquisición
 * (pedido explícito de Humania Go, 2026-09-01, ambas modalidades
 * existen en el negocio):
 * - CREDITO (D1, cerrada): capital propio + crédito + financiación del
 *   seguro + costos iniciales, año 1 de SOAT/Tecno/Impuestos incluido.
 * - RECURSOS_PROPIOS: todo pagado de contado (incluido el seguro,
 *   confirmado por el usuario — sin costo financiero adicional, D1/
 *   19.13.1-19.14.2: `principalFinanciacionSeguro` ya es el costo real
 *   del seguro antes de financiarlo) — sin crédito, sin intereses.
 */
export function inversionInicial(p: ParametrosPresupuesto): number {
  if (p.modalidadAdquisicion === 'RECURSOS_PROPIOS') {
    return (
      p.precioCompra +
      p.traspaso +
      p.principalFinanciacionSeguro +
      p.otrosCostosInicialesRecursosPropios +
      p.soatAnual +
      p.tecnomecanicaAnual +
      p.impuestosAnuales
    )
  }
  return (
    p.principalCreditoBancario +
    p.principalFinanciacionSeguro +
    p.capitalPropioDeclarado +
    p.soatAnual +
    p.tecnomecanicaAnual +
    p.impuestosAnuales
  )
}

/**
 * Recursos propios realmente aportados por Humania — en modalidad
 * RECURSOS_PROPIOS, el 100% de la inversión inicial es capital propio
 * (no hay crédito que separar); en modalidad CREDITO, es exactamente
 * `capitalPropioDeclarado` (sin cambio). Nunca usar `capitalPropioDeclarado`
 * directamente para "recursos propios" sin pasar por esta función —
 * daría una cifra incompleta en modalidad RECURSOS_PROPIOS.
 */
export function recursosPropiosEfectivos(p: ParametrosPresupuesto): number {
  return p.modalidadAdquisicion === 'RECURSOS_PROPIOS' ? inversionInicial(p) : p.capitalPropioDeclarado
}

export function equityConductorSemanal(p: ParametrosPresupuesto): number {
  return p.ahorroSemanalConductor + p.bonoPatrimonialSemanal
}

export function flujoOperativoHumaniaSemanal(p: ParametrosPresupuesto): number {
  return p.cuotaSemanalConductor - equityConductorSemanal(p)
}

/**
 * Margen de venta del activo (D3, refinamiento del 2026-09-01, spec.md
 * Sección 23) — diferencia entre el valor de venta contractual (lo que
 * el conductor paga por el vehículo, D10) y el precio real de compra
 * (lo que Humania pagó). Puede ser positivo (Humania vende por encima
 * de su costo) o negativo (por debajo). Se expone como dato informativo
 * propio — NO se suma aparte a `resultadoNeto`/`flujoDeCajaNeto`,
 * porque ya queda implícito en la comparación de `flujoContractualTotal`
 * (que usa `valorVentaContractualActivo`) contra `inversionInicial`
 * (que usa `precioCompra`) — sumarlo también ahí sería doble conteo.
 */
export function margenVentaActivo(p: ParametrosPresupuesto): number {
  return p.valorVentaContractualActivo - p.precioCompra
}

/** Rangos de validación (plan.md Sección 6) — nunca se acepta un valor fuera de rango silenciosamente. */
export function validarParametros(p: ParametrosPresupuesto): string[] {
  const errores: string[] = []
  const positivos: [string, number][] = [
    ['precioCompra', p.precioCompra],
    ['valorComercialBase', p.valorComercialBase],
    ['valorVentaContractualActivo', p.valorVentaContractualActivo],
    ['cuotaSemanalConductor', p.cuotaSemanalConductor],
    ['mesMinimoAbonosConductor', p.mesMinimoAbonosConductor],
    ['semanasPorAno', p.semanasPorAno],
    ['mesesPorAno', p.mesesPorAno],
  ]
  // Solo exigibles en modalidad CREDITO — en RECURSOS_PROPIOS no hay
  // crédito bancario que financiar (pedido explícito de Humania Go).
  if (p.modalidadAdquisicion === 'CREDITO') {
    positivos.push(['principalCreditoBancario', p.principalCreditoBancario], ['tasaEfectivaAnualCredito', p.tasaEfectivaAnualCredito], ['mesesContrato', p.mesesContrato])
  }
  for (const [nombre, valor] of positivos) {
    if (!(valor > 0)) errores.push(`${nombre} debe ser mayor que 0 (recibido: ${valor})`)
  }

  const noNegativos: [string, number][] = [
    ['traspaso', p.traspaso],
    ['capitalPropioDeclarado', p.capitalPropioDeclarado],
    ['principalFinanciacionSeguro', p.principalFinanciacionSeguro],
    ['costoFinancieroSeguroEstimado', p.costoFinancieroSeguroEstimado],
    ['otrosCostosInicialesRecursosPropios', p.otrosCostosInicialesRecursosPropios],
    ['ahorroSemanalConductor', p.ahorroSemanalConductor],
    ['bonoPatrimonialSemanal', p.bonoPatrimonialSemanal],
    ['cuotaSemanaAplazatoria', p.cuotaSemanaAplazatoria],
    ['abonoAdicionalConductorSemanal', p.abonoAdicionalConductorSemanal],
    ['abonoConductorOcasional', p.abonoConductorOcasional],
    ['soatAnual', p.soatAnual],
    ['tecnomecanicaAnual', p.tecnomecanicaAnual],
    ['impuestosAnuales', p.impuestosAnuales],
    ['otrosCostosHumaniaAnuales', p.otrosCostosHumaniaAnuales],
  ]
  for (const [nombre, valor] of noNegativos) {
    if (valor < 0) errores.push(`${nombre} no puede ser negativo (recibido: ${valor})`)
  }

  if (equityConductorSemanal(p) > p.cuotaSemanalConductor) {
    errores.push('ahorroSemanalConductor + bonoPatrimonialSemanal no puede exceder cuotaSemanalConductor')
  }
  if (p.porcentajeAtribucionAbonosConductor < 0 || p.porcentajeAtribucionAbonosConductor > 100) {
    errores.push('porcentajeAtribucionAbonosConductor debe estar entre 0 y 100')
  }
  if (!Number.isInteger(p.mesesContrato)) errores.push('mesesContrato debe ser un entero')
  if (!Number.isInteger(p.soatPeriodicidadMeses) || p.soatPeriodicidadMeses <= 0) {
    errores.push('soatPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (!Number.isInteger(p.tecnomecanicaPeriodicidadMeses) || p.tecnomecanicaPeriodicidadMeses <= 0) {
    errores.push('tecnomecanicaPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (!Number.isInteger(p.impuestosPeriodicidadMeses) || p.impuestosPeriodicidadMeses <= 0) {
    errores.push('impuestosPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (p.porcentajeAbonoCapital < 0 || p.porcentajeAbonoCapital > 1) {
    errores.push('porcentajeAbonoCapital debe estar entre 0 y 1 (0%-100%)')
  }
  if (!Number.isInteger(p.mesInicioAbonoCapital) || p.mesInicioAbonoCapital < 1) {
    errores.push('mesInicioAbonoCapital debe ser un entero mayor o igual a 1')
  }

  return errores
}
