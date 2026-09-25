// Calculadora de Presupuesto (KAI-29) — textos de la interfaz (spec.md 39.4.1 y 39.9).
//
// TEXTOS_APROBADOS: aprobados LITERALMENTE por Humania Go el 2026-09-25; las pruebas los fijan
// palabra por palabra. Los montos que antes estaban fijos en el texto ("450.000", "240.000",
// "$210.000") salen ahora de los parámetros (AC-54).
//
// TEXTOS_NUEVOS_PENDIENTES: textos que la implementación necesita y que NO estaban en la lista
// aprobada (títulos de gráficos, etiquetas de la política, etc.). Viven aquí, separados, para que
// Humania Go los apruebe o corrija en la revisión del PR sin buscar por todo el componente.

import type { ClasificacionPayback, ClasificacionRoi, Incumplimiento, Observacion, Veredicto } from './politicaFinanciera'

export const TEXTOS_APROBADOS = {
  grupos: {
    economiaActivo: 'Economía del activo',
    financiacionBancaria: 'Financiación bancaria',
    contratoConductor: 'Contrato con el conductor',
  },
  paybackPrincipal: (cuotaSemanal: string) => `Payback contractual completo (${cuotaSemanal}/semana)`,
  paybackOperativo: (ingresoOperativoSemanal: string) => `Payback operativo (${ingresoOperativoSemanal}/semana, sin el componente de adquisición)`,
  plazoAdquisicion: (valor: string) => `Editable: recalcula el valor de venta contractual con el componente de adquisición de ${valor}/semana.`,
  roiPrincipal: 'ROI sobre inversión total',
  roiComplementario: 'ROI sobre recursos propios (complementario)',
  roiNoDefinido: 'No definido (100% financiado)',
  roiNotaComplementario: 'Refleja apalancamiento; no determina la política.',
  veredictos: {
    CUMPLE: 'CUMPLE LA POLÍTICA',
    CUMPLE_CON_OBSERVACIONES: 'CUMPLE CON OBSERVACIONES',
    NO_CUMPLE: 'NO CUMPLE LA POLÍTICA',
  } satisfies Record<Veredicto, string>,
  razones: {
    roiBajoMinimo: (roi: string, minimo: string) => `ROI sobre inversión total de ${roi}, por debajo del mínimo de ${minimo}.`,
    paybackSobreMaximo: (semana: number, maximo: number) => `Payback contractual en la semana ${semana}, por encima del máximo de ${maximo} semanas.`,
    paybackNoAlcanzado: 'El payback contractual no se alcanza dentro del contrato.',
    paybackRiesgoElevado: (semana: number) => `Payback contractual en riesgo elevado (semana ${semana}).`,
  },
  sinPolitica: 'Este presupuesto se guardó sin política financiera registrada; no se evalúa con la política vigente.',
  abonoMinimo: {
    titulo: 'Abono mínimo requerido para cumplir la política',
    yaCumple: 'La operación ya cumple la política sin abono.',
    encontrado: (porcentaje: string, monto: string, mes: number) => `${porcentaje} de la cuota mensual (${monto}/mes) desde el mes ${mes}.`,
    noAlcanzableRoi: (maximo: string, minimo: string) => `Ningún abono dentro del máximo de ${maximo} alcanza el ROI mínimo de ${minimo}.`,
    noAlcanzablePayback: 'El abono no modifica el payback contractual: con el payback actual, la política no se alcanza mediante abono.',
    soloCredito: 'Aplica solo a la modalidad Crédito bancario.',
  },
  alertas: 'Alertas',
  paybackNoAlcanzadoReal: 'No se alcanza dentro del contrato',
  paybackNoAlcanzadoExtrapolado: 'No se alcanza en el horizonte simulado',
  equivalencia: (semana: number, meses: string) => `Semana ${semana} (≈ ${meses} meses)`,
  seguroUsado: {
    etiqueta: 'Seguro usado en el cálculo',
    modeloAnterior: 'modelo anterior, no confirmado',
    noIncluido: 'no incluido',
  },
  modeloAnteriorTitulo: 'Modelo anterior del seguro (no confirmado)',
  modeloAnteriorPlazo: 'Dato del modelo anterior, no confirmado; independiente del plazo del crédito.',
  origenAvisoM6: 'El cálculo usa la financiación del seguro del modelo anterior (Configuración › Financiación bancaria), sin soporte documental.',
  flujoContrato: 'Flujo del contrato',
} as const

/** Clasificaciones tal como aparecen en las tablas aprobadas de la política (spec.md 39.1). */
export const TEXTOS_CLASIFICACION_ROI: Record<ClasificacionRoi, string> = {
  MUY_BAJO: 'MUY BAJO',
  BAJO: 'BAJO',
  BUENO: 'BUENO',
  EXCELENTE: 'EXCELENTE',
}

export const TEXTOS_CLASIFICACION_PAYBACK: Record<ClasificacionPayback, string> = {
  RIESGO_BAJO: 'RIESGO BAJO',
  RIESGO_MEDIO: 'RIESGO MEDIO',
  RIESGO_ELEVADO: 'RIESGO ELEVADO',
  RIESGO_ALTO: 'RIESGO ALTO',
}

/** PENDIENTES DE APROBACIÓN (no estaban en spec.md 39.4.1). */
export const TEXTOS_NUEVOS_PENDIENTES = {
  tituloGraficoFlujo: 'Flujo contractual acumulado vs. inversión inicial',
  notaGraficoFlujo:
    'Línea sólida: flujo contractual acumulado dentro del contrato, la misma serie con la que se calcula el payback contractual. Línea punteada: extrapolación hipotética después del contrato. Línea tenue: ingreso operativo acumulado de Humania.',
  marcaPayback: (semana: number) => `Payback semana ${semana}`,
  tituloGraficoSaldo: 'Evolución del saldo del crédito',
  leyendaSaldoNormal: 'Saldo sin abono',
  leyendaSaldoConAbono: 'Saldo con abono',
  finCredito: (mes: number) => `Fin del crédito: mes ${mes}`,
  tituloSensibilidad: 'Sensibilidad del abono',
  notaSensibilidad: 'Cada fila recalcula la operación cambiando solo el porcentaje de abono a capital. El payback contractual no depende del abono.',
  columnaAbono: 'Abono (% de la cuota)',
  marcaActual: 'actual',
  marcaMinimo: 'mínimo',
  politicaTitulo: 'Política financiera',
  politicaDescripcion: 'Umbrales con que se evalúa esta operación. Quedan guardados con el presupuesto.',
  politicaCampos: {
    roiInicioBajo: 'ROI: inicio de BAJO',
    roiMinimo: 'ROI mínimo (inicio de BUENO)',
    roiInicioExcelente: 'ROI: inicio de EXCELENTE',
    paybackFinBajo: 'Payback: fin de RIESGO BAJO',
    paybackFinMedio: 'Payback: fin de RIESGO MEDIO',
    paybackMaximo: 'Payback máximo (fin de RIESGO ELEVADO)',
  },
  usarPoliticaVigente: 'Usar la política vigente',
  politicaInvalida: 'Política financiera inválida: la operación no se puede evaluar hasta corregir los umbrales en Configuración › Política financiera.',
  columnaVeredicto: 'Política',
} as const

/** Razón de negocio de cada incumplimiento, con los textos aprobados. */
export function textoIncumplimiento(i: Incumplimiento, formatearPct: (v: number) => string): string {
  switch (i.tipo) {
    case 'ROI_BAJO_MINIMO':
      return TEXTOS_APROBADOS.razones.roiBajoMinimo(formatearPct(i.roi), formatearPct(i.roiMinimo))
    case 'PAYBACK_SOBRE_MAXIMO':
      return TEXTOS_APROBADOS.razones.paybackSobreMaximo(i.semana, i.paybackMaximo)
    case 'PAYBACK_NO_ALCANZADO':
      return TEXTOS_APROBADOS.razones.paybackNoAlcanzado
  }
}

export function textoObservacion(o: Observacion): string {
  return TEXTOS_APROBADOS.razones.paybackRiesgoElevado(o.semana)
}

/**
 * Etiquetas visibles de los campos editables, para mostrar los errores de `validarParametros`
 * con lenguaje de pantalla (spec.md 39.9). Solo campos que la interfaz permite editar: un
 * campo sin etiqueta visible no puede producir un error desde la pantalla.
 */
export const ETIQUETAS_CAMPOS: Record<string, string> = {
  'seguro.legacy.principalFinanciacion': 'Principal financiación del seguro',
  'seguro.legacy.costoFinancieroEstimado': 'Costo financiero del seguro (estimado)',
  'seguro.legacy.plazoMeses': 'Plazo de la financiación del seguro',
  precioCompra: 'Precio real de compra',
  traspaso: 'Traspaso',
  capitalPropioDeclarado: 'Recursos propios (capital) aportados por Humania',
  otrosCostosInicialesRecursosPropios: 'Otros costos iniciales (ej. GPS)',
  principalCreditoBancario: 'Principal financiado (crédito vehículo+GPS)',
  tasaEfectivaAnualCredito: 'Tasa efectiva anual del crédito',
  mesesCreditoVehiculo: 'Plazo del crédito bancario',
  porcentajeAbonoCapital: 'Porcentaje de abono a capital',
  mesInicioAbonoCapital: 'Mes desde el cual aplica el abono',
  valorVentaContractualActivo: 'Valor de venta contractual del activo',
  cuotaSemanalConductor: 'Cuota semanal total del conductor',
  ahorroSemanalConductor: 'Componente de ahorro semanal',
  bonoPatrimonialSemanal: 'Componente de bono patrimonial semanal',
  cuotaSemanaAplazatoria: 'Cuota de semana aplazatoria',
  soatAnual: 'SOAT anual',
  tecnomecanicaAnual: 'Tecnomecánica anual',
  impuestosAnuales: 'Impuestos anuales',
}

const CLAVES_POR_LONGITUD = Object.keys(ETIQUETAS_CAMPOS).sort((a, b) => b.length - a.length)

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "cuotaSemanalConductor debe ser mayor que 0 (recibido: -5)" → "Cuota semanal total del conductor debe ser mayor que 0 (recibido: -5)". */
export function etiquetarErrorValidacion(mensaje: string): string {
  let salida = mensaje
  for (const clave of CLAVES_POR_LONGITUD) {
    salida = salida.replace(new RegExp(`(?<![\\w.])${escaparRegex(clave)}(?![\\w.])`, 'g'), ETIQUETAS_CAMPOS[clave])
  }
  return salida
}
