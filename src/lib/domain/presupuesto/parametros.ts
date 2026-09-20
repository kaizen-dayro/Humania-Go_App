// Calculadora de Presupuesto (KAI-29) — parámetros del motor financiero.
// Ver Documentos/SDD/calculadora-presupuesto/spec.md (Decisiones D1-D14,
// Sección 20) para las reglas de negocio completas. Función pura: sin
// persistencia, sin dependencias de Next.js/Supabase (mismo patrón que
// indiceSer.ts, KAI-27).

import { calcularCronogramaSeguro, type CotizacionSeguro } from '../seguros/adaptador'
import { SEGURO_LEGACY_REFERENCIA } from './seguroLegacy'

/**
 * Modalidad de adquisición del activo — decisión pedida explícitamente
 * por Humania Go (2026-09-01): existen ambas posibilidades en el
 * negocio. CREDITO usa financiación bancaria + financiación del seguro
 * (Capa B completa); RECURSOS_PROPIOS paga todo de contado, incluido
 * el seguro (confirmado por el usuario) — sin crédito, sin intereses,
 * sin amortización.
 */
export type ModalidadAdquisicion = 'CREDITO' | 'RECURSOS_PROPIOS'

/**
 * Cómo entra el seguro al modelo (KAI-29, spec.md 29; las decisiones
 * pendientes siguen abiertas):
 * - LEGACY_NO_CONFIRMADO: el modelo anterior — capital, costo financiero
 *   estimado y plazo propios de `seguro.legacy` (valores históricos NO
 *   confirmados, aislados en `seguroLegacy.ts`). Alimenta el cálculo tal
 *   como lo hacía antes, con el banner MODELO CON DATOS NO CONFIRMADOS.
 * - SIN_MODELAR: el seguro queda FUERA del cálculo (ni capital, ni costo,
 *   ni cuotas). No es un valor de negocio: es la ausencia de modelo hasta
 *   que exista una integración financiera aprobada.
 */
export type ModoSeguro = 'LEGACY_NO_CONFIRMADO' | 'SIN_MODELAR'

/**
 * Datos del modelo anterior del seguro. El plazo es PROPIO del seguro: ya no
 * se toma del plazo del crédito bancario (`mesesCreditoVehiculo`).
 */
export interface SeguroLegacyParametros {
  principalFinanciacion: number
  costoFinancieroEstimado: number
  plazoMeses: number
}

export interface SeguroParametros {
  modo: ModoSeguro
  legacy: SeguroLegacyParametros
  /**
   * Datos nominales de la financiación vigente (dominio `seguros`), con el
   * estado documental de cada dato. INFORMATIVO: no entra a ningún indicador
   * (la integración financiera sigue pendiente). null = no hay cotización cargada.
   */
  cotizacion: CotizacionSeguro | null
}

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
  // modalidad CREDITO). mesesCreditoVehiculo es exclusivamente el plazo del
  // crédito bancario del vehículo: ni la duración del contrato con el
  // conductor (D12, spec.md 19.18.2) ni el plazo del seguro (spec.md 29).
  principalCreditoBancario: number
  tasaEfectivaAnualCredito: number
  mesesCreditoVehiculo: number
  /** Seguro: separado del crédito del vehículo (spec.md 29). */
  seguro: SeguroParametros
  /**
   * Abono extraordinario a capital, reducción de plazo (D15 CERRADA,
   * spec.md Sección 11/21, `Documentos/CAL/Amortizacion_Abono.xlsx`) —
   * % de la cuota mensual ORIGINAL del crédito (nunca de la cuota del
   * conductor ni del ingreso operativo), 100% a capital. 0 = sin abono
   * (comportamiento idéntico al de antes de esta funcionalidad).
   * Fracción (1 = 100% de la cuota); puede superar 1 — en la operación
   * real se abona a capital 2, 3 o 5 veces la cuota (hasta
   * `PORCENTAJE_ABONO_CAPITAL_MAXIMO`, 500%).
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
  tasaEfectivaAnualCredito: 0.268,
  mesesCreditoVehiculo: 72,
  // El escenario de referencia conserva el modelo anterior del seguro (cifras oficiales sin
  // cambio, spec.md 29.1). Los valores viven en seguroLegacy.ts; la cotización vigente no se
  // hardcodea aquí: llega desde el dominio `seguros`.
  seguro: {
    modo: 'LEGACY_NO_CONFIRMADO',
    legacy: { ...SEGURO_LEGACY_REFERENCIA },
    cotizacion: null,
  },
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

/** Lo que el seguro aporta hoy al cálculo, según el modo (spec.md 29). */
export interface SeguroEfectivo {
  principal: number
  costoFinancieroTotal: number
  plazoMeses: number
}

/**
 * Datos del seguro que realmente entran al cálculo: los del modelo LEGACY en
 * modo LEGACY_NO_CONFIRMADO, y ceros en SIN_MODELAR. Nunca lee
 * `mesesCreditoVehiculo` ni la cotización (informativa).
 */
export function seguroEfectivo(p: ParametrosPresupuesto): SeguroEfectivo {
  if (p.seguro.modo === 'SIN_MODELAR') return { principal: 0, costoFinancieroTotal: 0, plazoMeses: 0 }
  const { principalFinanciacion, costoFinancieroEstimado, plazoMeses } = p.seguro.legacy
  return { principal: principalFinanciacion, costoFinancieroTotal: costoFinancieroEstimado, plazoMeses }
}

/** Copia de los parámetros con cambios en el modelo LEGACY del seguro (inmutable). */
export function conSeguroLegacy(p: ParametrosPresupuesto, cambios: Partial<SeguroLegacyParametros>): ParametrosPresupuesto {
  return { ...p, seguro: { ...p.seguro, legacy: { ...p.seguro.legacy, ...cambios } } }
}

/**
 * Inversión inicial total — depende de la modalidad de adquisición
 * (pedido explícito de Humania Go, 2026-09-01, ambas modalidades
 * existen en el negocio):
 * - CREDITO (D1, cerrada): capital propio + crédito + financiación del
 *   seguro + costos iniciales, año 1 de SOAT/Tecno/Impuestos incluido.
 * - RECURSOS_PROPIOS: todo pagado de contado (incluido el seguro, sin
 *   costo financiero adicional) — sin crédito, sin intereses. El capital
 *   del seguro es el del modelo LEGACY (no confirmado; spec.md 25 y 26.5)
 *   y solo entra si el modo es LEGACY_NO_CONFIRMADO.
 */
export function inversionInicial(p: ParametrosPresupuesto): number {
  const capitalSeguro = seguroEfectivo(p).principal
  if (p.modalidadAdquisicion === 'RECURSOS_PROPIOS') {
    return (
      p.precioCompra +
      p.traspaso +
      capitalSeguro +
      p.otrosCostosInicialesRecursosPropios +
      p.soatAnual +
      p.tecnomecanicaAnual +
      p.impuestosAnuales
    )
  }
  return (
    p.principalCreditoBancario +
    capitalSeguro +
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

/**
 * Tope de `porcentajeAbonoCapital` como fracción de la cuota mensual
 * original (5 = 500%). Ampliado desde 1 (100%) a pedido de Humania Go
 * (2026-09-19): en la vida real se abona a capital 200%, 300% o 500% de
 * la cuota. El motor (`amortizarCreditoConAbono`) nunca deja el saldo
 * negativo sin importar el porcentaje — el abono se limita al saldo
 * restante — así que este tope es de sensatez, no de estabilidad
 * numérica. Fuente única: la validación del servidor y el clamp de la
 * interfaz usan esta misma constante.
 */
export const PORCENTAJE_ABONO_CAPITAL_MAXIMO = 5

function validarSeguro(p: ParametrosPresupuesto): string[] {
  const errores: string[] = []
  // Una entrada malformada (p. ej. la forma plana anterior) se informa como error de validación; nunca lanza.
  if (!p.seguro || typeof p.seguro !== 'object') return ['seguro es obligatorio (modo, legacy y cotizacion)']
  const { modo, legacy, cotizacion } = p.seguro
  if (modo !== 'LEGACY_NO_CONFIRMADO' && modo !== 'SIN_MODELAR') {
    errores.push(`seguro.modo no es válido (recibido: ${String(modo)})`)
  }
  if (modo === 'LEGACY_NO_CONFIRMADO' && (!legacy || typeof legacy !== 'object')) {
    errores.push('seguro.legacy es obligatorio en modo LEGACY_NO_CONFIRMADO')
  } else if (modo === 'LEGACY_NO_CONFIRMADO') {
    if (legacy.principalFinanciacion < 0) errores.push(`seguro.legacy.principalFinanciacion no puede ser negativo (recibido: ${legacy.principalFinanciacion})`)
    if (legacy.costoFinancieroEstimado < 0) errores.push(`seguro.legacy.costoFinancieroEstimado no puede ser negativo (recibido: ${legacy.costoFinancieroEstimado})`)
    // El plazo solo se usa (y solo se exige) donde se calcula el costo del seguro: modalidad CREDITO.
    if (p.modalidadAdquisicion === 'CREDITO' && (!Number.isInteger(legacy.plazoMeses) || legacy.plazoMeses <= 0)) {
      errores.push(`seguro.legacy.plazoMeses debe ser un entero mayor que 0 (recibido: ${legacy.plazoMeses})`)
    }
  }
  if (cotizacion) {
    const { error } = calcularCronogramaSeguro(cotizacion)
    if (error) errores.push(`seguro.cotizacion no produce un cronograma nominal válido: ${error}`)
  }
  return errores
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
    positivos.push(['principalCreditoBancario', p.principalCreditoBancario], ['tasaEfectivaAnualCredito', p.tasaEfectivaAnualCredito], ['mesesCreditoVehiculo', p.mesesCreditoVehiculo])
  }
  for (const [nombre, valor] of positivos) {
    if (!(valor > 0)) errores.push(`${nombre} debe ser mayor que 0 (recibido: ${valor})`)
  }

  const noNegativos: [string, number][] = [
    ['traspaso', p.traspaso],
    ['capitalPropioDeclarado', p.capitalPropioDeclarado],
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
  if (!Number.isInteger(p.mesesCreditoVehiculo)) errores.push('mesesCreditoVehiculo debe ser un entero')
  errores.push(...validarSeguro(p))
  if (!Number.isInteger(p.soatPeriodicidadMeses) || p.soatPeriodicidadMeses <= 0) {
    errores.push('soatPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (!Number.isInteger(p.tecnomecanicaPeriodicidadMeses) || p.tecnomecanicaPeriodicidadMeses <= 0) {
    errores.push('tecnomecanicaPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (!Number.isInteger(p.impuestosPeriodicidadMeses) || p.impuestosPeriodicidadMeses <= 0) {
    errores.push('impuestosPeriodicidadMeses debe ser un entero mayor que 0')
  }
  if (!(p.porcentajeAbonoCapital >= 0 && p.porcentajeAbonoCapital <= PORCENTAJE_ABONO_CAPITAL_MAXIMO)) {
    errores.push(
      `porcentajeAbonoCapital debe estar entre 0 y ${PORCENTAJE_ABONO_CAPITAL_MAXIMO} (0%-${PORCENTAJE_ABONO_CAPITAL_MAXIMO * 100}%)`,
    )
  }
  if (!Number.isInteger(p.mesInicioAbonoCapital) || p.mesInicioAbonoCapital < 1) {
    errores.push('mesInicioAbonoCapital debe ser un entero mayor o igual a 1')
  }

  return errores
}

/**
 * Presupuestos guardados antes de spec.md 29 tienen los parámetros con forma
 * plana (`mesesContrato`, `principalFinanciacionSeguro`,
 * `costoFinancieroSeguroEstimado`) y con el plazo del seguro acoplado al del
 * crédito. Esta función los lleva a la forma vigente SIN cambiar ningún
 * resultado: el seguro queda en modo LEGACY_NO_CONFIRMADO con `plazoMeses`
 * igual al `mesesContrato` de la fila original (lo que el motor usaba). Es
 * idempotente: una entrada que ya tiene la forma vigente se devuelve igual.
 */
export function normalizarParametrosGuardados(bruto: Record<string, unknown>): ParametrosPresupuesto {
  if ('seguro' in bruto && 'mesesCreditoVehiculo' in bruto) return bruto as unknown as ParametrosPresupuesto
  const { mesesContrato, principalFinanciacionSeguro, costoFinancieroSeguroEstimado, ...resto } = bruto
  return {
    ...resto,
    mesesCreditoVehiculo: mesesContrato,
    seguro: {
      modo: 'LEGACY_NO_CONFIRMADO',
      legacy: {
        principalFinanciacion: principalFinanciacionSeguro,
        costoFinancieroEstimado: costoFinancieroSeguroEstimado,
        plazoMeses: mesesContrato,
      },
      cotizacion: null,
    },
  } as unknown as ParametrosPresupuesto
}
