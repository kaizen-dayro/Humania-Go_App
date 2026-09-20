// Calculadora de Presupuesto (KAI-29) — verificación del MODELO VIGENTE del
// seguro (spec.md 29): seguro desacoplado del crédito del vehículo, modo
// SIN_MODELAR, datos de la cotización estructurados pero NO integrados al
// cálculo, y compatibilidad con presupuestos guardados.
//
//   npm run verificar:presupuesto   (desde web/, corre esta suite después de la LEGACY)
//
// Separada a propósito de verificacion.ts (suite del modelo LEGACY, que fija
// las cifras históricas del escenario de referencia). Los datos de la
// cotización que aparecen aquí son FIXTURES DE PRUEBA para comprobar el
// tratamiento de estados y totales; no son parámetros de referencia.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { cotizacionDesdeRegistro, type FinanciacionSeguroRegistro } from '../seguros/adaptador'
import { construirVistaCotizacionSeguro } from '../seguros/vistaCotizacion'
import { amortizarCredito, cuotaAcumuladaAlMes, interesAcumuladoAlMes } from './amortizacion'
import { hayDatosNoConfirmadosEnCalculo } from './datosNoConfirmados'
import { calcularMetricas } from './metricas'
import {
  PARAMETROS_REFERENCIA,
  conSeguroLegacy,
  inversionInicial,
  normalizarParametrosGuardados,
  seguroEfectivo,
  validarParametros,
  type ParametrosPresupuesto,
} from './parametros'
import { SEGURO_LEGACY_REFERENCIA } from './seguroLegacy'

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

const p = PARAMETROS_REFERENCIA
const L = SEGURO_LEGACY_REFERENCIA
const sinSeguro: ParametrosPresupuesto = { ...p, seguro: { ...p.seguro, modo: 'SIN_MODELAR' } }

const REGISTRO_COTIZACION: FinanciacionSeguroRegistro = {
  valor_financiado: 1454848,
  pago_inicial: 256738,
  gravamen_4x1000: 5819,
  numero_cuotas: 10,
  periodicidad: 'MENSUAL',
  dia_vencimiento: 5,
  cuota_valor: '155839', // NUMERIC puede llegar como cadena
  cuota_es_aproximada: true,
  fecha_inicio: null,
  fecha_primera_cuota: null,
  estado_datos_campos: {
    valor_financiado: 'CONFIRMADO_POR_COTIZACION',
    pago_inicial: 'CONFIRMADO_POR_COTIZACION',
    gravamen_4x1000: 'CONFIRMADO_POR_COTIZACION',
    numero_cuotas: 'CONFIRMADO_POR_COTIZACION',
    cuota_valor: 'CONFIRMADO_POR_COTIZACION',
    cuota_es_aproximada: 'CONFIRMADO_POR_COTIZACION',
    dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL',
  },
}

function escalares(m: ReturnType<typeof calcularMetricas>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  // `seguroNominal` es informativo y no es un indicador: se excluye de la comparación de indicadores.
  for (const [k, v] of Object.entries(m)) if (k !== 'seguroNominal' && (v === null || typeof v === 'number')) salida[k] = v
  return salida
}

// ===== A. Separación LEGACY / vigente en los parámetros =====

verificar('los valores legacy del seguro viven aislados en seguroLegacy.ts y el escenario de referencia los lee de ahí', () => {
  assert.deepEqual(p.seguro.legacy, SEGURO_LEGACY_REFERENCIA)
  assert.equal(p.seguro.modo, 'LEGACY_NO_CONFIRMADO')
  assert.equal(p.seguro.cotizacion, null, 'la cotización vigente NO se hardcodea en PARAMETROS_REFERENCIA')
  assert.notEqual(p.seguro.legacy, SEGURO_LEGACY_REFERENCIA, 'el escenario copia el legacy: editarlo no altera la constante')
})

verificar('el código de dominio de presupuesto no contiene valores legacy del seguro fuera de seguroLegacy.ts (escaneo del fuente)', () => {
  const carpeta = path.resolve(__dirname, '../../src/lib/domain/presupuesto')
  const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.ts') && !f.startsWith('verificacion') && f !== 'seguroLegacy.ts')
  assert.ok(archivos.length >= 6, 'debe haber archivos fuente que escanear')
  const legacy: [string, RegExp][] = [
    ['$3.453.177', /3[_.,]?453[_.,]?177/],
    ['$2.500.000', /2[_.,]?500[_.,]?000/],
    ['29% EA', /29\s*%|0[.,]29\b/],
    ['tasa derivada ≈16,35% EA', /16[.,]35|1[.,]269972/],
  ]
  for (const archivo of archivos) {
    const contenido = fs.readFileSync(path.join(carpeta, archivo), 'utf8')
    for (const [nombre, patron] of legacy) assert.ok(!patron.test(contenido), `${archivo} contiene ${nombre}`)
  }
})

verificar('el plazo del seguro NO depende del plazo del crédito del vehículo (seguroEfectivo y costos)', () => {
  assert.equal(seguroEfectivo({ ...p, mesesCreditoVehiculo: 60 }).plazoMeses, L.plazoMeses)
  assert.equal(seguroEfectivo(conSeguroLegacy(p, { plazoMeses: 24 })).plazoMeses, 24)

  // Crédito a 60 meses con seguro a 72: la parte del seguro en costos = (capital + costo) / 72 por mes,
  // la del crédito = su propia amortización a 60 meses (nunca se mezclan los plazos).
  const p60: ParametrosPresupuesto = { ...p, mesesCreditoVehiculo: 60 }
  const m = calcularMetricas(p60, 0)
  const mesAlFin = m.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno)
  const meses = Math.floor(mesAlFin)
  const credito = amortizarCredito(p60.principalCreditoBancario, p60.tasaEfectivaAnualCredito, 60)
  const seguroCaja = ((L.principalFinanciacion + L.costoFinancieroEstimado) / L.plazoMeses) * meses
  const seguroRent = (L.costoFinancieroEstimado / L.plazoMeses) * meses
  assert.ok(Math.abs(m.costosFinancierosCaja - (cuotaAcumuladaAlMes(credito, mesAlFin) + seguroCaja)) < 1e-4)
  assert.ok(Math.abs(m.costosFinancierosRentabilidad - (interesAcumuladoAlMes(credito, mesAlFin) + seguroRent)) < 1e-4)
})

verificar('el seguro no genera cuotas más allá de su propio plazo (totales coherentes con la serie semanal)', () => {
  const corto = conSeguroLegacy(p, { plazoMeses: 24 })
  const m = calcularMetricas(corto, 0)
  const mesAlFin = m.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno)
  const credito = amortizarCredito(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesCreditoVehiculo)
  const seguroCaja = ((L.principalFinanciacion + L.costoFinancieroEstimado) / 24) * 24 // el contrato dura ~35 meses: el seguro cobra exactamente sus 24 cuotas
  assert.ok(Math.abs(m.costosFinancierosCaja - (cuotaAcumuladaAlMes(credito, mesAlFin) + seguroCaja)) < 1e-4)
  assert.ok(Number.isFinite(m.resultadoNeto) && Number.isFinite(m.flujoDeCajaNeto))
})

// ===== B. Modo SIN_MODELAR =====

verificar('SIN_MODELAR: el seguro sale del cálculo (capital, costo y cuotas en cero) sin NaN', () => {
  const m = calcularMetricas(sinSeguro, 0)
  assert.equal(m.principalFinanciacionSeguro, 0)
  assert.equal(inversionInicial(sinSeguro), inversionInicial(p) - L.principalFinanciacion)
  const credito = amortizarCredito(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesCreditoVehiculo)
  const mesAlFin = m.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno)
  assert.ok(Math.abs(m.costosFinancierosRentabilidad - interesAcumuladoAlMes(credito, mesAlFin)) < 1e-4, 'solo intereses del crédito')
  assert.ok(Math.abs(m.costosFinancierosCaja - cuotaAcumuladaAlMes(credito, mesAlFin)) < 1e-4, 'solo cuotas del crédito')
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} no es finito`)
  assert.ok(m.flujo.serieIngresoOperativoAcumulado.every(Number.isFinite))
})

verificar('SIN_MODELAR equivale exactamente a un seguro LEGACY con capital y costo en cero', () => {
  const cero = conSeguroLegacy(p, { principalFinanciacion: 0, costoFinancieroEstimado: 0 })
  assert.deepEqual(escalares(calcularMetricas(sinSeguro, 0)), escalares(calcularMetricas(cero, 0)))
  const rp = { ...sinSeguro, modalidadAdquisicion: 'RECURSOS_PROPIOS' as const }
  const rpCero = { ...cero, modalidadAdquisicion: 'RECURSOS_PROPIOS' as const }
  assert.deepEqual(escalares(calcularMetricas(rp, 0)), escalares(calcularMetricas(rpCero, 0)))
})

verificar('SIN_MODELAR: deja constancia (PENDIENTE, no integrado) y no activa el banner de datos legacy', () => {
  const m = calcularMetricas(sinSeguro, 0)
  assert.deepEqual(m.datosNoConfirmados.map((d) => [d.campo, d.estado, d.origen, d.integradoEnCalculo]), [['seguro', 'PENDIENTE', 'SEGURO_NO_MODELADO', false]])
  assert.equal(hayDatosNoConfirmadosEnCalculo(m.datosNoConfirmados), false)
  assert.ok(!m.datosNoConfirmados.some((d) => d.estado === 'LEGACY_NO_CONFIRMADO'))
})

// ===== C. Datos de la cotización: estructurados, con estado, NO integrados =====

verificar('cotización: el adaptador convierte la fila (NUMERIC como cadena incluido) y copia el estado de cada dato tal cual', () => {
  const c = cotizacionDesdeRegistro(REGISTRO_COTIZACION)
  assert.ok(c)
  assert.equal(c!.entrada.valorCuota, 155839)
  assert.equal(c!.entrada.numeroCuotas, 10)
  assert.equal(c!.entrada.fechaPrimeraCuota, null, 'la fecha de primera cuota sigue PENDIENTE: no se infiere')
  assert.equal(c!.estadoDatos.valorCuota, 'CONFIRMADO_POR_COTIZACION')
  assert.equal(c!.estadoDatos.diaVencimiento, 'REPORTADO_SIN_SOPORTE_DOCUMENTAL')
  assert.ok(!Object.values(c!.estadoDatos).includes('CONFIRMADO_DOCUMENTALMENTE'), 'ningún dato se promueve a CONFIRMADO_DOCUMENTALMENTE')
})

verificar('cotización: adjuntarla NO cambia ningún indicador (informativa, sin integración financiera)', () => {
  const cot = cotizacionDesdeRegistro(REGISTRO_COTIZACION)!
  for (const base of [p, sinSeguro, { ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS' as const }, { ...p, porcentajeAbonoCapital: 2 }]) {
    const sin = calcularMetricas(base, 0)
    const con = calcularMetricas({ ...base, seguro: { ...base.seguro, cotizacion: cot } }, 0)
    assert.deepEqual(escalares(con), escalares(sin))
    assert.deepEqual(con.flujo, sin.flujo)
    assert.equal(inversionInicial({ ...base, seguro: { ...base.seguro, cotizacion: cot } }), inversionInicial(base))
  }
})

verificar('cotización: el cronograma nominal informativo sale del dominio seguros (10 × 155.839 = 1.558.390; 103.542; total 1.820.947)', () => {
  const cot = cotizacionDesdeRegistro(REGISTRO_COTIZACION)!
  const m = calcularMetricas({ ...p, seguro: { ...p.seguro, cotizacion: cot } }, 0)
  assert.equal(m.seguroNominal?.error, null)
  const c = m.seguroNominal?.cronograma
  assert.equal(c?.cuotas.length, 10)
  assert.equal(c?.totalCuotasNominal, 1_558_390)
  assert.equal(c?.costoFinancieroNominalTotal, 103_542)
  assert.equal(c?.totalNominal, 1_820_947)
  assert.ok(c?.cuotas.every((q) => q.fecha === null && q.estado === 'SIN_FECHA'), 'sin fecha_primera_cuota no hay fechas')
  assert.equal(calcularMetricas(p, 0).seguroNominal, null, 'sin cotización no hay cronograma')
})

// ===== E. Crédito del vehículo ≠ financiación del seguro; presupuestos independientes (spec.md 36) =====
// La financiación del seguro se muestra DENTRO de "Amortización del crédito", pero son obligaciones independientes:
// mover el bloque en pantalla no cambia ningún cálculo, y ninguno de los dos modelos alimenta al otro.

const REGISTRO_B: FinanciacionSeguroRegistro = {
  ...REGISTRO_COTIZACION,
  valor_financiado: 900_000,
  pago_inicial: 150_000,
  gravamen_4x1000: 3_600,
  numero_cuotas: 12,
  cuota_valor: 80_000,
  dia_vencimiento: 15,
  poliza: { valor_poliza: 1_050_000, estado_datos_campos: { valor_poliza: 'CONFIRMADO_POR_COTIZACION' } },
}
const conCotizacion = (base: ParametrosPresupuesto, r: FinanciacionSeguroRegistro): ParametrosPresupuesto => ({
  ...base,
  seguro: { ...base.seguro, cotizacion: cotizacionDesdeRegistro(r) },
})

verificar('presupuestos independientes: dos presupuestos con distinta cotización muestran valores distintos y ambos dan EXACTAMENTE los mismos indicadores que sin cotización', () => {
  const abono = { ...p, porcentajeAbonoCapital: 2, mesInicioAbonoCapital: 3 }
  for (const base of [p, abono, sinSeguro]) {
    const sin = calcularMetricas(base, 0)
    const a = calcularMetricas(conCotizacion(base, { ...REGISTRO_COTIZACION, poliza: { valor_poliza: 1_711_586, estado_datos_campos: null } }), 0)
    const b = calcularMetricas(conCotizacion(base, REGISTRO_B), 0)
    const vistaA = construirVistaCotizacionSeguro(a.seguroNominal ? cotizacionDesdeRegistro({ ...REGISTRO_COTIZACION, poliza: { valor_poliza: 1_711_586, estado_datos_campos: null } }) : null, a.seguroNominal)
    const vistaB = construirVistaCotizacionSeguro(cotizacionDesdeRegistro(REGISTRO_B), b.seguroNominal)
    assert.notDeepEqual(vistaA, vistaB, 'cada presupuesto muestra SU financiación')
    assert.deepEqual(escalares(a), escalares(sin))
    assert.deepEqual(escalares(b), escalares(sin))
    assert.deepEqual(a.flujo, sin.flujo)
    assert.deepEqual(b.flujo, sin.flujo)
    assert.deepEqual(a.amortizacionNormal, sin.amortizacionNormal)
    assert.deepEqual(b.amortizacionConAbono, sin.amortizacionConAbono)
  }
})

verificar('crédito del vehículo y financiación del seguro son independientes: cambiar uno no altera el otro (cronogramas, capital, plazo ni tasa se mezclan)', () => {
  const cot = cotizacionDesdeRegistro(REGISTRO_COTIZACION)!
  const vista = (params: ParametrosPresupuesto) => construirVistaCotizacionSeguro(params.seguro.cotizacion, calcularMetricas(params, 0).seguroNominal)
  const base = conCotizacion({ ...p, porcentajeAbonoCapital: 1, mesInicioAbonoCapital: 3 }, REGISTRO_COTIZACION)
  const vistaBase = vista(base)
  assert.ok(vistaBase)
  // 1) Cambiar el crédito del vehículo (abono, plazo, principal, tasa) no cambia la financiación del seguro
  for (const cambio of [
    { porcentajeAbonoCapital: 5 },
    { mesInicioAbonoCapital: 10 },
    { mesesCreditoVehiculo: 60 },
    { principalCreditoBancario: 20_000_000 },
    { tasaEfectivaAnualCredito: 0.2 },
  ]) {
    assert.deepEqual(vista({ ...base, ...cambio }), vistaBase, JSON.stringify(cambio))
  }
  // 2) Cambiar la cotización o el modelo legacy del seguro no cambia el cronograma ni el resumen del crédito del vehículo
  const solo = calcularMetricas(base, 0)
  for (const otro of [conCotizacion(base, REGISTRO_B), conSeguroLegacy(base, { principalFinanciacion: 1, costoFinancieroEstimado: 1, plazoMeses: 12 }), { ...base, seguro: { ...base.seguro, modo: 'SIN_MODELAR' as const } }]) {
    const m = calcularMetricas(otro, 0)
    assert.deepEqual(m.amortizacionNormal, solo.amortizacionNormal)
    assert.deepEqual(m.amortizacionConAbono, solo.amortizacionConAbono)
    assert.equal(m.mesesCreditoReales, solo.mesesCreditoReales)
  }
  // 3) La vista de la financiación no depende del modelo legacy: cambiar sus valores no la toca
  assert.deepEqual(vista(conSeguroLegacy(base, { principalFinanciacion: 1, costoFinancieroEstimado: 1, plazoMeses: 12 })), vistaBase)
  assert.equal(cot.entrada.valorFinanciado, 1_454_848, 'la cotización conserva sus propios datos')
})

verificar('la financiación del seguro nunca se suma al crédito del vehículo: capital, plazo y costo de cada obligación permanecen separados', () => {
  const m = calcularMetricas(conCotizacion(p, REGISTRO_COTIZACION), 0)
  // El capital financiado del vehículo es solo el del crédito bancario; el del seguro legacy va aparte y la cotización no entra
  assert.equal(m.financiacionBancaria, p.principalCreditoBancario)
  assert.equal(m.principalFinanciacionSeguro, p.seguro.legacy.principalFinanciacion)
  assert.notEqual(m.principalFinanciacionSeguro, 1_454_848, 'el valor financiado de la cotización no sustituye al capital legacy')
  assert.equal(m.amortizacionNormal!.cronograma.length, p.mesesCreditoVehiculo)
  assert.equal(m.seguroNominal!.cronograma!.cuotas.length, 10, 'el cronograma del seguro es el nominal de su cotización, no el del crédito')
  const principalesCredito = m.amortizacionNormal!.cronograma.reduce((s, c) => s + c.abonoCapital, 0)
  assert.ok(Math.abs(principalesCredito - p.principalCreditoBancario) < 1e-4, 'la amortización del crédito suma solo su propio principal')
})

verificar('datosNoConfirmados distingue LEGACY_NO_CONFIRMADO (integrado) de los datos de la cotización (no integrados, con su estado real)', () => {
  const cot = cotizacionDesdeRegistro(REGISTRO_COTIZACION)!
  const m = calcularMetricas({ ...p, seguro: { ...p.seguro, cotizacion: cot } }, 0)
  const legacy = m.datosNoConfirmados.filter((d) => d.origen === 'MODELO_LEGACY')
  const cotiz = m.datosNoConfirmados.filter((d) => d.origen === 'COTIZACION')
  assert.equal(legacy.length, 3)
  assert.ok(legacy.every((d) => d.estado === 'LEGACY_NO_CONFIRMADO' && d.integradoEnCalculo && d.indicadoresAfectados.length > 0))
  assert.equal(cotiz.length, 7)
  assert.ok(cotiz.every((d) => !d.integradoEnCalculo && d.indicadoresAfectados.length === 0))
  assert.equal(cotiz.find((d) => d.campo === 'seguro.cotizacion.valorCuota')?.estado, 'CONFIRMADO_POR_COTIZACION')
  assert.equal(cotiz.find((d) => d.campo === 'seguro.cotizacion.diaVencimiento')?.estado, 'REPORTADO_SIN_SOPORTE_DOCUMENTAL')
  assert.ok(!m.datosNoConfirmados.some((d) => d.estado === 'CONFIRMADO_DOCUMENTALMENTE'))
})

verificar('banner: solo lo activan datos que entran al cálculo; la cotización sola no lo activa ni lo desactiva', () => {
  const cot = cotizacionDesdeRegistro(REGISTRO_COTIZACION)!
  assert.equal(hayDatosNoConfirmadosEnCalculo(calcularMetricas(p, 0).datosNoConfirmados), true)
  assert.equal(hayDatosNoConfirmadosEnCalculo(calcularMetricas({ ...p, seguro: { ...p.seguro, cotizacion: cot } }, 0).datosNoConfirmados), true)
  assert.equal(hayDatosNoConfirmadosEnCalculo(calcularMetricas({ ...sinSeguro, seguro: { ...sinSeguro.seguro, cotizacion: cot } }, 0).datosNoConfirmados), false)
})

verificar('una cotización cuyo cronograma no es válido se informa en el resultado y se rechaza en la validación (no se corrige)', () => {
  const cot = cotizacionDesdeRegistro({ ...REGISTRO_COTIZACION, dia_vencimiento: 31 })!
  const conError: ParametrosPresupuesto = { ...p, seguro: { ...p.seguro, cotizacion: cot } }
  const m = calcularMetricas(conError, 0)
  assert.equal(m.seguroNominal?.cronograma, null)
  assert.match(m.seguroNominal?.error ?? '', /R15/)
  assert.ok(validarParametros(conError).some((e) => e.startsWith('seguro.cotizacion')))
})

// ===== D. Validación y compatibilidad con presupuestos guardados =====

verificar('validación: el plazo del seguro legacy exige entero > 0 solo donde se usa (CREDITO en modo LEGACY)', () => {
  assert.deepEqual(validarParametros(p), [])
  assert.ok(validarParametros(conSeguroLegacy(p, { plazoMeses: 0 })).some((e) => e.includes('seguro.legacy.plazoMeses')))
  assert.ok(validarParametros(conSeguroLegacy(p, { plazoMeses: 12.5 })).some((e) => e.includes('seguro.legacy.plazoMeses')))
  assert.deepEqual(validarParametros({ ...conSeguroLegacy(p, { plazoMeses: 0 }), modalidadAdquisicion: 'RECURSOS_PROPIOS' }), [])
  assert.deepEqual(validarParametros({ ...conSeguroLegacy(sinSeguro, { plazoMeses: 0 }) }), [])
  assert.ok(validarParametros(conSeguroLegacy(p, { principalFinanciacion: -1 })).some((e) => e.includes('principalFinanciacion')))
  assert.ok(validarParametros({ ...p, seguro: { ...p.seguro, modo: 'OTRO' as never } }).some((e) => e.includes('seguro.modo')))
})

verificar('validación: un seguro ausente o sin legacy devuelve errores de validación en vez de lanzar (payload malformado)', () => {
  const sinSeguroObj = { ...p, seguro: undefined } as unknown as ParametrosPresupuesto
  assert.ok(validarParametros(sinSeguroObj).some((e) => e.startsWith('seguro')))
  const sinLegacy = { ...p, seguro: { modo: 'LEGACY_NO_CONFIRMADO', cotizacion: null } } as unknown as ParametrosPresupuesto
  assert.ok(validarParametros(sinLegacy).some((e) => e.includes('seguro.legacy')))
  const { seguro: _seguro, mesesCreditoVehiculo: _meses, ...plana } = p
  void _seguro
  void _meses
  assert.doesNotThrow(() => validarParametros(plana as unknown as ParametrosPresupuesto))
  assert.ok(validarParametros(plana as unknown as ParametrosPresupuesto).length > 0)
})

verificar('presupuestos guardados con la forma plana anterior se normalizan sin cambiar ningún resultado (plazo del seguro = el del crédito de esa fila)', () => {
  const { mesesCreditoVehiculo, seguro, ...resto } = p
  const plana = { ...resto, mesesContrato: mesesCreditoVehiculo, principalFinanciacionSeguro: seguro.legacy.principalFinanciacion, costoFinancieroSeguroEstimado: seguro.legacy.costoFinancieroEstimado }
  const normalizada = normalizarParametrosGuardados(plana)
  assert.deepEqual(normalizada, p)
  assert.deepEqual(escalares(calcularMetricas(normalizada, 0)), escalares(calcularMetricas(p, 0)))
  // fila antigua con plazo del crédito de 60 meses: el seguro se calculaba también a 60 (acoplado); se conserva.
  const antigua = normalizarParametrosGuardados({ ...plana, mesesContrato: 60 })
  assert.equal(antigua.mesesCreditoVehiculo, 60)
  assert.equal(antigua.seguro.legacy.plazoMeses, 60)
  assert.equal(antigua.seguro.modo, 'LEGACY_NO_CONFIRMADO')
  // idempotente
  assert.equal(normalizarParametrosGuardados(p as unknown as Record<string, unknown>), p)
})

console.log(`\n${casos} casos del modelo vigente verificados, todos OK.`)
