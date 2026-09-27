// KAI-41 — Verificación del seguro del activo por presupuesto: modos DIGITADO y SIN_SEGURO (spec.md 41).
//
// Los valores esperados se calculan A MANO en cada prueba (cuentas explícitas sobre los datos digitados),
// nunca llamando a las funciones que se prueban. El escenario de referencia (modelo anterior) no se toca:
// la línea base 50/50 lo protege aparte.

import assert from 'node:assert/strict'
import { abonoMinimoExhaustivo, calcularAbonoMinimo, conAbono } from './abonoMinimo'
import { hayDatosNoConfirmadosEnCalculo } from './datosNoConfirmados'
import { calcularMetricas, type ResultadoMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, inversionInicial, validarParametros, type ModoSeguro, type ParametrosPresupuesto } from './parametros'
import { evaluarPolitica, POLITICA_FINANCIERA_V1 } from './politicaFinanciera'
import { reconocerSnapshot } from './reconocerSnapshot'
import { cuotasPendientesAlTerminarCredito, seguroDigitadoDesdeCotizacion, type SeguroDigitadoParametros } from './seguroDigitado'
import { TEXTOS_APROBADOS as T, etiquetarErrorValidacion } from './textosInterfaz'
import { FINANCIAL_MODEL_VERSION } from './version'
import { construirVistaSeguroSimulacion } from './vistaSeguroSimulacion'
import { cotizacionDesdeRegistro } from '../seguros/adaptador'

let casos = 0
function verificar(nombre: string, fn: () => void) {
  casos++
  try {
    fn()
    console.log(`OK   ${nombre}`)
  } catch (err) {
    console.error(`FAIL ${nombre}`)
    throw err
  }
}

const P = PARAMETROS_REFERENCIA
/** Igualdad con tolerancia de una millonésima de peso: las diferencias entre cifras grandes arrastran redondeo de punto flotante. */
const casi = (obtenido: number, esperado: number, mensaje?: string) =>
  assert.ok(Math.abs(obtenido - esperado) < 1e-6, `${mensaje ?? ''} obtenido ${obtenido}, esperado ${esperado}`)
/** Póliza de prueba: financiar cuesta 10 × 110.000 − 1.000.000 = 100.000 por póliza (10.000 por cuota). De contado vale 1.150.000. */
const D: SeguroDigitadoParametros = { valorPoliza: 1_150_000, pagoInicial: 200_000, valorFinanciado: 1_000_000, numeroCuotas: 10, valorCuota: 110_000 }
const COSTO_POR_CUOTA = 10_000
const PRIMA_FINANCIADA = 1_200_000 // pago inicial + financiado

const conSeguro = (p: ParametrosPresupuesto, modo: ModoSeguro, digitado: SeguroDigitadoParametros | undefined = D): ParametrosPresupuesto => ({
  ...p,
  seguro: { ...p.seguro, modo, ...(digitado ? { digitado } : {}) },
})
const RP = (p: ParametrosPresupuesto): ParametrosPresupuesto => ({ ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS' })
const mesFinContrato = (m: ResultadoMetricas) => Math.floor(m.flujo.duracionContratoSemanas / (P.semanasPorAno / P.mesesPorAno))

/** Todos los escalares del resultado (para comparar resultados completos). */
function escalares(m: ResultadoMetricas): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  const recorrer = (v: unknown, ruta: string) => {
    if (v === null || typeof v !== 'object') salida[ruta] = v
    else if (Array.isArray(v)) salida[ruta] = JSON.stringify(v)
    else for (const [k, x] of Object.entries(v)) if (k !== 'datosNoConfirmados') recorrer(x, ruta ? `${ruta}.${k}` : k)
  }
  recorrer(m, '')
  return salida
}

// ===== A. Sin seguro =====

verificar('SIN_SEGURO: mismos números que SIN_MODELAR en Crédito y en Recursos propios (seguro en cero)', () => {
  for (const base of [P, RP(P), conAbono(P, 1)]) {
    assert.deepEqual(escalares(calcularMetricas(conSeguro(base, 'SIN_SEGURO', undefined), 0)), escalares(calcularMetricas(conSeguro(base, 'SIN_MODELAR', undefined), 0)))
  }
})

verificar('SIN_SEGURO: el capital del seguro sale de la inversión (referencia − 3.453.177) y no hay costo del seguro', () => {
  const ref = calcularMetricas(P, 0)
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  assert.equal(sin.inversionInicialTotal, ref.inversionInicialTotal - P.seguro.legacy.principalFinanciacion)
  assert.equal(sin.principalFinanciacionSeguro, 0)
  assert.equal(sin.costosRecurrentes.seguro, undefined)
})

verificar('SIN_SEGURO: es una decisión confirmada — no lista datos pendientes ni activa el aviso de datos sin soporte', () => {
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  assert.deepEqual(sin.datosNoConfirmados, [])
  assert.equal(hayDatosNoConfirmadosEnCalculo(sin.datosNoConfirmados), false)
  // SIN_MODELAR conserva su constancia de dato PENDIENTE (sin cambio).
  assert.deepEqual(calcularMetricas(conSeguro(P, 'SIN_MODELAR', undefined), 0).datosNoConfirmados.map((d) => d.estado), ['PENDIENTE'])
})

// ===== B. Seguro digitado en Crédito, sin abono (el crédito dura 72 meses) =====

verificar('DIGITADO Crédito: inversión = sin seguro + pago inicial + financiado (200.000 + 1.000.000)', () => {
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(conSeguro(P, 'DIGITADO'), 0)
  assert.equal(dig.inversionInicialTotal, sin.inversionInicialTotal + 1_200_000)
  assert.equal(dig.inversionInicialTotal, 36_788_323)
  assert.equal(dig.principalFinanciacionSeguro, 1_000_000)
})

verificar('DIGITADO Crédito: 2 renovaciones financiadas (meses 12 y 24) = 2 × 1.200.000 como costo recurrente al fin del contrato (mes 35)', () => {
  const dig = calcularMetricas(conSeguro(P, 'DIGITADO'), 0)
  assert.equal(mesFinContrato(dig), 35)
  assert.deepEqual(dig.costosRecurrentes.seguro, { ocurrenciasAdicionales: 2, totalAdicional: 2 * PRIMA_FINANCIADA })
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  assert.equal(dig.costosRecurrentes.total, sin.costosRecurrentes.total + 2_400_000)
})

verificar('DIGITADO Crédito: costo financiero — rentabilidad 30 cuotas × 10.000; caja 10 cuotas completas de la 1.ª póliza + 20 × 10.000', () => {
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(conSeguro(P, 'DIGITADO'), 0)
  // Pólizas que empiezan en los meses 0, 12 y 24: las tres completan sus 10 cuotas antes del mes 35.
  casi(dig.costosFinancierosRentabilidad - sin.costosFinancierosRentabilidad, 30 * COSTO_POR_CUOTA)
  casi(dig.costosFinancierosCaja - sin.costosFinancierosCaja, 10 * 110_000 + 20 * COSTO_POR_CUOTA)
})

verificar('DIGITADO Crédito: resultado neto y ROI = sin seguro − 2.400.000 − 300.000, sobre la inversión con seguro', () => {
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(conSeguro(P, 'DIGITADO'), 0)
  assert.ok(Math.abs(dig.resultadoNeto - (sin.resultadoNeto - 2_700_000)) < 1e-6)
  assert.equal(dig.roiSobreInversionTotal, dig.resultadoNeto / dig.inversionInicialTotal)
  assert.ok(Math.abs(dig.flujoDeCajaNeto - (sin.flujoDeCajaNeto - 2_400_000 - 1_300_000)) < 1e-6)
})

// ===== C. Terminación del crédito antes (abono a capital, spec.md 27.5) =====

verificar('DIGITADO + abono 500% (el crédito termina en el mes 9): cuotas cortadas en 9, renovaciones de contado (2 × 1.150.000), 1 cuota pendiente informativa', () => {
  const p = conSeguro(conAbono(P, 5), 'DIGITADO')
  const sin = calcularMetricas(conSeguro(conAbono(P, 5), 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(p, 0)
  assert.equal(dig.mesesCreditoReales, 9)
  assert.deepEqual(dig.costosRecurrentes.seguro, { ocurrenciasAdicionales: 2, totalAdicional: 2 * 1_150_000 })
  casi(dig.costosFinancierosRentabilidad - sin.costosFinancierosRentabilidad, 9 * COSTO_POR_CUOTA)
  assert.ok(Math.abs(dig.costosFinancierosCaja - sin.costosFinancierosCaja - 9 * 110_000) < 1e-6)
  assert.deepEqual(cuotasPendientesAlTerminarCredito(D, 12, 9), { mes: 9, cuotas: 1, monto: 110_000 })
})

verificar('DIGITADO + abono 200% (el crédito termina en el mes 17): 1.ª renovación financiada con 5 de 10 cuotas; la 2.ª de contado', () => {
  const sin = calcularMetricas(conSeguro(conAbono(P, 2), 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(conSeguro(conAbono(P, 2), 'DIGITADO'), 0)
  assert.equal(dig.mesesCreditoReales, 17)
  assert.deepEqual(dig.costosRecurrentes.seguro, { ocurrenciasAdicionales: 2, totalAdicional: 1_200_000 + 1_150_000 })
  // 10 cuotas de la 1.ª póliza + 5 de la renovación del mes 12 (meses 13 a 17).
  assert.ok(Math.abs(dig.costosFinancierosRentabilidad - sin.costosFinancierosRentabilidad - 15 * COSTO_POR_CUOTA) < 1e-6)
  assert.ok(Math.abs(dig.costosFinancierosCaja - sin.costosFinancierosCaja - (10 * 110_000 + 5 * COSTO_POR_CUOTA)) < 1e-6)
  assert.deepEqual(cuotasPendientesAlTerminarCredito(D, 12, 17), { mes: 17, cuotas: 5, monto: 550_000 })
})

verificar('cuotas pendientes: ninguna si el crédito termina entre financiaciones o sin crédito', () => {
  assert.equal(cuotasPendientesAlTerminarCredito(D, 12, 72), null, 'la póliza del mes 60 termina en el mes 70, antes del 72')
  assert.equal(cuotasPendientesAlTerminarCredito(D, 12, 10), null, 'termina justo con la última cuota')
  assert.equal(cuotasPendientesAlTerminarCredito(D, 12, null), null)
  assert.deepEqual(cuotasPendientesAlTerminarCredito(D, 12, 65), { mes: 65, cuotas: 5, monto: 550_000 })
})

// ===== D. Recursos propios =====

verificar('DIGITADO Recursos propios: la póliza de contado (1.150.000) entra a la inversión y se renueva por el mismo valor; sin costo financiero', () => {
  const sin = calcularMetricas(conSeguro(RP(P), 'SIN_SEGURO', undefined), 0)
  const dig = calcularMetricas(conSeguro(RP(P), 'DIGITADO'), 0)
  assert.equal(dig.inversionInicialTotal, sin.inversionInicialTotal + 1_150_000)
  assert.equal(dig.recursosPropios, dig.inversionInicialTotal)
  assert.deepEqual(dig.costosRecurrentes.seguro, { ocurrenciasAdicionales: 2, totalAdicional: 2_300_000 })
  assert.equal(dig.costosFinancierosRentabilidad, 0)
  assert.equal(dig.costosFinancierosCaja, 0)
  assert.equal(dig.principalFinanciacionSeguro, 0)
  assert.ok(Math.abs(dig.resultadoNeto - (sin.resultadoNeto - 2_300_000)) < 1e-6)
})

verificar('DIGITADO Recursos propios: solo el valor de la póliza importa (los datos de financiación no cambian nada)', () => {
  const a = calcularMetricas(conSeguro(RP(P), 'DIGITADO'), 0)
  const b = calcularMetricas(conSeguro(RP(P), 'DIGITADO', { ...D, pagoInicial: 0, valorFinanciado: 9, numeroCuotas: 3, valorCuota: 7 }), 0)
  assert.deepEqual(escalares(a), escalares(b))
})

// ===== E. Datos del seguro que no se usan en el modo activo =====

verificar('los datos digitados guardados NO cambian nada en los otros modos (volver a Referencia histórica da el resultado de siempre)', () => {
  for (const base of [P, RP(P), conAbono(P, 2)]) {
    const conDatos = { ...base, seguro: { ...base.seguro, digitado: D } }
    assert.deepEqual(escalares(calcularMetricas(conDatos, 0)), escalares(calcularMetricas(base, 0)))
    assert.deepEqual(escalares(calcularMetricas(conSeguro(base, 'SIN_SEGURO'), 0)), escalares(calcularMetricas(conSeguro(base, 'SIN_SEGURO', undefined), 0)))
  }
})

verificar('la forma del resultado de los modos existentes no cambia: sin clave costosRecurrentes.seguro', () => {
  for (const modo of ['LEGACY_NO_CONFIRMADO', 'SIN_MODELAR', 'SIN_SEGURO'] as const) {
    const m = calcularMetricas(conSeguro(P, modo), 0)
    assert.deepEqual(Object.keys(m.costosRecurrentes), ['soat', 'tecnomecanica', 'impuestos', 'total'])
  }
})

// ===== F. Aviso y datos sin soporte =====

verificar('DIGITADO: sus datos entran al cálculo sin soporte documental (activa el aviso); 5 datos en Crédito, 1 en Recursos propios', () => {
  const credito = calcularMetricas(conSeguro(P, 'DIGITADO'), 0).datosNoConfirmados
  assert.deepEqual(credito.map((d) => d.campo), ['seguro.digitado.valorPoliza', 'seguro.digitado.pagoInicial', 'seguro.digitado.valorFinanciado', 'seguro.digitado.numeroCuotas', 'seguro.digitado.valorCuota'])
  assert.ok(credito.every((d) => d.estado === 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' && d.origen === 'SEGURO_DIGITADO' && d.integradoEnCalculo))
  assert.equal(hayDatosNoConfirmadosEnCalculo(credito), true)
  assert.deepEqual(calcularMetricas(conSeguro(RP(P), 'DIGITADO'), 0).datosNoConfirmados.map((d) => d.campo), ['seguro.digitado.valorPoliza'])
})

verificar('DIGITADO: el mapa de indicadores afectados es veraz (variar cada dato solo cambia indicadores declarados)', () => {
  const variaciones: Partial<SeguroDigitadoParametros>[] = [
    { valorPoliza: 1_000_000 },
    { pagoInicial: 400_000 },
    { valorFinanciado: 900_000, valorPoliza: 1_000_000 },
    { numeroCuotas: 12, valorCuota: 100_000 },
    { valorCuota: 150_000 },
  ]
  for (const base of [P, conAbono(P, 2), RP(P)]) {
    const a = calcularMetricas(conSeguro(base, 'DIGITADO'), 0)
    const declarados = new Set(a.datosNoConfirmados.flatMap((d) => d.indicadoresAfectados))
    for (const v of variaciones) {
      const b = calcularMetricas(conSeguro(base, 'DIGITADO', { ...D, ...v }), 0)
      const ea = a as unknown as Record<string, unknown>
      const eb = b as unknown as Record<string, unknown>
      for (const k of Object.keys(ea)) {
        const x = ea[k]
        const y = eb[k]
        if ((x === null || typeof x === 'number') && (y === null || typeof y === 'number') && x !== y) {
          assert.ok(declarados.has(k), `${JSON.stringify(v)} cambia "${k}" pero no está declarado`)
        }
      }
    }
  }
})

// ===== G. Validación =====

verificar('validación: el modo DIGITADO exige sus datos y reglas (cuotas 1-12, cuotas ≥ financiado, pago + financiado ≥ póliza)', () => {
  const err = (d: Partial<SeguroDigitadoParametros> | undefined, base: ParametrosPresupuesto = P) =>
    validarParametros({ ...base, seguro: { ...base.seguro, modo: 'DIGITADO', digitado: d as SeguroDigitadoParametros } })
  assert.deepEqual(err(D), [])
  assert.deepEqual(err(undefined), ['seguro.digitado es obligatorio en modo DIGITADO'])
  assert.ok(err({ ...D, valorPoliza: 0 }).some((e) => e.startsWith('seguro.digitado.valorPoliza debe ser mayor que 0')))
  assert.ok(err({ ...D, numeroCuotas: 13 }).some((e) => e.includes('entre 1 y 12')))
  assert.ok(err({ ...D, numeroCuotas: 0 }).some((e) => e.includes('entre 1 y 12')))
  assert.ok(err({ ...D, numeroCuotas: 2.5 }).some((e) => e.includes('entre 1 y 12')))
  assert.ok(err({ ...D, valorCuota: 90_000 }).some((e) => e.includes('no puede ser menor que seguro.digitado.valorFinanciado')))
  assert.ok(err({ ...D, valorPoliza: 1_300_000 }).some((e) => e.includes('no puede ser menor que seguro.digitado.valorPoliza')))
  assert.ok(err({ ...D, pagoInicial: -1 }).some((e) => e.includes('pagoInicial no puede ser negativo')))
  assert.ok(err({ ...D, valorCuota: Number.NaN }).some((e) => e.includes('valorCuota debe ser un número')))
  // Recursos propios: solo se valida (y solo se usa) el valor de la póliza.
  assert.deepEqual(err({ ...D, numeroCuotas: 0, valorCuota: 0, valorFinanciado: 0, pagoInicial: 0 }, RP(P)), [])
  assert.ok(err({ ...D, valorPoliza: 0 }, RP(P)).length === 1)
  // Los demás modos no exigen datos digitados.
  for (const modo of ['LEGACY_NO_CONFIRMADO', 'SIN_MODELAR', 'SIN_SEGURO'] as const) assert.deepEqual(validarParametros(conSeguro(P, modo, undefined)), [])
  assert.ok(validarParametros({ ...P, seguro: { ...P.seguro, modo: 'OTRO' as ModoSeguro } }).some((e) => e.startsWith('seguro.modo no es válido')))
})

// ===== H. Abono mínimo (D6) y política (D8) siguen siendo correctos con el seguro digitado =====

verificar('D6 con seguro digitado: el ROI no baja al aumentar el abono y el payback contractual no cambia (0% a 500%, pasos de 5%)', () => {
  for (const base of [conSeguro(P, 'DIGITADO'), conSeguro(P, 'DIGITADO', { ...D, valorPoliza: 1_200_000 }), conSeguro(P, 'SIN_SEGURO', undefined)]) {
    let roiAnterior = -Infinity
    const paybacks = new Set<number | null>()
    for (let paso = 0; paso <= 100; paso++) {
      const m = calcularMetricas(conAbono(base, paso * 0.05), 0)
      assert.ok(m.roiSobreInversionTotal >= roiAnterior - 1e-12, `ROI bajó en abono ${paso * 5}%`)
      roiAnterior = m.roiSobreInversionTotal
      paybacks.add(m.paybackFlujoContractualCompleto)
    }
    assert.equal(paybacks.size, 1)
  }
})

verificar('D6 con seguro digitado: la búsqueda binaria encuentra el mismo abono mínimo que la búsqueda exhaustiva', () => {
  // ROI mínimo del 45%: sin abono el escenario digitado no lo alcanza (≈39,5%), con abono sí.
  const exigente = { ...POLITICA_FINANCIERA_V1, roiCortes: [0.3, 0.45, 0.6] as typeof POLITICA_FINANCIERA_V1.roiCortes }
  for (const p of [conSeguro(P, 'DIGITADO'), conSeguro(P, 'DIGITADO', { ...D, valorPoliza: 1_200_000, valorCuota: 130_000 })]) {
    const r = calcularAbonoMinimo(p, 0, exigente)
    const exhaustivo = abonoMinimoExhaustivo(p, 0, exigente)
    assert.equal(r.estado, 'ENCONTRADO')
    assert.ok(exhaustivo !== null)
    if (r.estado === 'ENCONTRADO') assert.equal(Math.round(r.detalle.porcentaje * 1000), exhaustivo)
  }
})

verificar('D8 con seguro digitado: el veredicto se evalúa sobre las métricas del modo activo', () => {
  const dig = calcularMetricas(conSeguro(P, 'DIGITADO'), 0)
  const sin = calcularMetricas(conSeguro(P, 'SIN_SEGURO', undefined), 0)
  assert.equal(evaluarPolitica(dig, POLITICA_FINANCIERA_V1).roi, dig.roiSobreInversionTotal)
  assert.ok(dig.roiSobreInversionTotal < sin.roiSobreInversionTotal, 'el seguro reduce el ROI')
})

// ===== I. Presupuestos guardados =====

verificar('presupuesto guardado con seguro digitado: se reconstruye igual (mismos parámetros y mismo resultado) y sin cambiar la versión del modelo', () => {
  for (const p of [conSeguro(P, 'DIGITADO'), conSeguro(RP(P), 'DIGITADO'), conSeguro(P, 'SIN_SEGURO', undefined), conSeguro(P, 'SIN_SEGURO')]) {
    const guardado = JSON.parse(JSON.stringify(p)) as unknown
    const r = reconocerSnapshot(guardado, FINANCIAL_MODEL_VERSION)
    assert.equal(r.estado, 'DETERMINISTA')
    if (r.estado !== 'DETERMINISTA') return
    assert.deepEqual(r.parametros, p)
    assert.deepEqual(escalares(calcularMetricas(r.parametros, 0)), escalares(calcularMetricas(p, 0)))
  }
  assert.equal(FINANCIAL_MODEL_VERSION, 'Humania Go Financial Model v1.0', 'la versión del modelo es una decisión abierta (M5b): no se cambia aquí')
})

verificar('presupuesto guardado sin la clave `digitado` (anterior a KAI-41): se abre igual que antes', () => {
  const anterior = JSON.parse(JSON.stringify(P)) as Record<string, unknown>
  const r = reconocerSnapshot(anterior, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado === 'DETERMINISTA') assert.ok(!('digitado' in r.parametros.seguro))
})

verificar('presupuesto guardado en modo DIGITADO pero sin datos: se informa como datos inválidos (nunca se completan)', () => {
  const roto = JSON.parse(JSON.stringify({ ...P, seguro: { ...P.seguro, modo: 'DIGITADO' } })) as unknown
  const r = reconocerSnapshot(roto, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DATOS_INVALIDOS')
})

// ===== J. Precarga desde la cotización =====

verificar('precarga desde la cotización: póliza, pago inicial con 4×1000, financiado, cuotas y cuota; los datos resultantes son válidos', () => {
  const cot = cotizacionDesdeRegistro({
    valor_financiado: 1454848,
    pago_inicial: 256738,
    gravamen_4x1000: 5819,
    numero_cuotas: 10,
    periodicidad: 'MENSUAL',
    dia_vencimiento: 5,
    cuota_valor: '155839',
    cuota_es_aproximada: true,
    fecha_inicio: null,
    fecha_primera_cuota: null,
    estado_datos_campos: null,
    poliza: { valor_poliza: 1_711_586, estado_datos_campos: null },
  })
  const d = seguroDigitadoDesdeCotizacion(cot)
  assert.deepEqual(d, { valorPoliza: 1_711_586, pagoInicial: 262_557, valorFinanciado: 1_454_848, numeroCuotas: 10, valorCuota: 155_839 })
  assert.deepEqual(validarParametros(conSeguro(P, 'DIGITADO', d!)), [])
  assert.equal(inversionInicial(conSeguro(P, 'DIGITADO', d!)), inversionInicial(conSeguro(P, 'SIN_SEGURO', undefined)) + 262_557 + 1_454_848)
  assert.equal(seguroDigitadoDesdeCotizacion(null), null)
})

// ===== K. Tarjeta "Seguro en esta simulación" y textos =====

const vistaDe = (p: ParametrosPresupuesto) => {
  const m = calcularMetricas(p, 0)
  return construirVistaSeguroSimulacion(p, null, p.modalidadAdquisicion === 'CREDITO', m.mesesCreditoReales)
}

verificar('tarjeta: seguro digitado en Crédito — pago inicial, financiado, cuotas, costo por póliza y renovación, con "Sin soporte documental"', () => {
  const v = vistaDe(conSeguro(P, 'DIGITADO'))
  assert.equal(v.usado.titulo, 'Usado en el cálculo: datos digitados')
  assert.equal(v.usado.etiqueta, 'Sin soporte documental')
  assert.deepEqual(v.usado.filas, [
    { etiqueta: 'Pago inicial', tipo: 'moneda', valor: 200_000 },
    { etiqueta: 'Valor financiado', tipo: 'moneda', valor: 1_000_000 },
    { etiqueta: 'Cuotas', tipo: 'cuotas', valor: 10, monto: 110_000 },
    { etiqueta: 'Costo de la financiación por póliza', tipo: 'moneda', valor: 100_000 },
    { etiqueta: 'Renovación', tipo: 'texto', valor: 'Cada 12 meses, con los mismos valores' },
  ])
  assert.equal(v.usado.nota, 'Si el crédito del vehículo termina antes, las cuotas pendientes del seguro dejan de contarse y las renovaciones siguientes se pagan de contado.')
})

verificar('tarjeta: con abono que termina el crédito en el mes 17 aparecen las 5 cuotas pendientes (informativas)', () => {
  const v = vistaDe(conSeguro(conAbono(P, 2), 'DIGITADO'))
  assert.deepEqual(v.usado.filas.at(-1), { etiqueta: 'Cuotas pendientes al terminar el crédito (no se cuentan como costo)', tipo: 'cuotas', valor: 5, monto: 110_000 })
  assert.equal(vistaDe(conSeguro(P, 'DIGITADO')).usado.filas.length, 5, 'sin abono no hay cuotas pendientes')
})

verificar('tarjeta: seguro digitado en Recursos propios y "Sin seguro"', () => {
  const rp = vistaDe(conSeguro(RP(P), 'DIGITADO'))
  assert.deepEqual(rp.usado.filas, [
    { etiqueta: 'Valor anual de la póliza (de contado)', tipo: 'moneda', valor: 1_150_000 },
    { etiqueta: 'Renovación', tipo: 'texto', valor: 'Cada 12 meses, con los mismos valores' },
  ])
  assert.equal(rp.usado.nota, 'La póliza se paga de contado y se renueva cada año por el mismo valor.')
  for (const base of [P, RP(P)]) {
    const sin = vistaDe(conSeguro(base, 'SIN_SEGURO', undefined))
    assert.deepEqual([sin.usado.titulo, sin.usado.etiqueta, sin.usado.filas, sin.usado.nota], ['Usado en el cálculo: sin seguro', null, [], 'Este presupuesto no incluye seguro a cargo de Humania.'])
  }
})

verificar('textos de KAI-41 aprobados literalmente (selector, campos, avisos, tarjeta y filas)', () => {
  const S = T.seguroActivo
  assert.equal(S.titulo, 'Seguro del activo')
  assert.deepEqual(S.opciones, { LEGACY_NO_CONFIRMADO: 'Referencia histórica', DIGITADO: 'Digitar datos del seguro', SIN_SEGURO: 'Sin seguro' })
  assert.equal(S.ayuda.DIGITADO, 'Digita los datos de la póliza de este activo. La póliza se renueva cada año con los mismos valores.')
  assert.equal(S.ayuda.SIN_SEGURO, 'Humania no paga seguro para este activo: no está asegurado o el seguro lo paga un tercero.')
  assert.deepEqual(S.campos, { valorPoliza: 'Valor anual de la póliza', pagoInicial: 'Pago inicial', valorFinanciado: 'Valor financiado', numeroCuotas: 'Número de cuotas', valorCuota: 'Valor de cada cuota' })
  assert.equal(S.costoFinanciacion('$100.000'), 'Costo de la financiación por póliza: $100.000 (cuotas menos valor financiado).')
  assert.equal(T.avisoSeguro.DIGITADO.titulo, 'SEGURO CON DATOS DIGITADOS')
  assert.equal(T.avisoSeguro.SIN_SEGURO.titulo, 'SIN SEGURO')
  assert.equal(T.seguroSimulacion.cuotasDe(10, '$110.000'), '10 cuotas de $110.000')
  assert.equal(T.seguroSimulacion.cuotasDe(1, '$110.000'), '1 cuota de $110.000')
  assert.equal(`${T.seguroUsado.etiqueta}: ${T.seguroUsado.digitado}`, 'Seguro usado en el cálculo: datos digitados, sin soporte documental')
  assert.equal(`${T.seguroUsado.etiqueta}: ${T.seguroUsado.sinSeguro}`, 'Seguro usado en el cálculo: sin seguro')
  // Los errores de validación del seguro digitado se leen con las etiquetas de pantalla, sin nombres internos.
  const errores = validarParametros(conSeguro(P, 'DIGITADO', { ...D, valorPoliza: 1_300_000, valorCuota: 90_000 })).map(etiquetarErrorValidacion)
  assert.deepEqual(errores, [
    'Número de cuotas del seguro × Valor de cada cuota del seguro no puede ser menor que Valor financiado del seguro',
    'Pago inicial del seguro + Valor financiado del seguro no puede ser menor que Valor anual de la póliza',
  ])
  assert.ok(errores.every((e) => !/seguro\.digitado|legacy|DIGITADO/.test(e)))
})

console.log(`\n${casos} casos del seguro por presupuesto (KAI-41) verificados, todos OK.`)
