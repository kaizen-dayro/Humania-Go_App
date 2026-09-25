// KAI-29 — Verificación de D6, abono mínimo requerido (spec.md 39.2, 39.8.1; plan.md 19.K).
// Incluye las tres protecciones que sostienen la búsqueda binaria: invariante de monotonía del ROI e
// invariancia del payback sobre combinaciones aleatorias (semilla fija), comparación binaria frente a
// exhaustiva, y guardia de dependencia del campo del abono.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PASO_MAXIMO_ABONO, abonoMinimoExhaustivo, calcularAbonoMinimo, conAbono } from './abonoMinimo'
import { ESCENARIOS_LINEA_BASE } from './lineaBase'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, conSeguroLegacy, validarParametros, type ParametrosPresupuesto } from './parametros'
import { POLITICA_FINANCIERA_V1, type PoliticaFinanciera } from './politicaFinanciera'

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
const conRoiMinimo = (minimo: number): PoliticaFinanciera => ({ ...POLITICA_FINANCIERA_V1, roiCortes: [Math.min(0.2, minimo / 2), minimo, Math.max(0.6, minimo + 0.1)] })
const conPaybackMaximo = (maximo: number): PoliticaFinanciera => ({ ...POLITICA_FINANCIERA_V1, paybackCortesSemanas: [Math.floor(maximo / 3), Math.floor((2 * maximo) / 3), maximo] })

verificar('D6: escenario de referencia → YA_CUMPLE_SIN_ABONO (ROI 41,0 % ≥ 30 %, payback 87 ≤ 104)', () => {
  const r = calcularAbonoMinimo(P, 0, POLITICA_FINANCIERA_V1)
  assert.equal(r.estado, 'YA_CUMPLE_SIN_ABONO')
  if (r.estado === 'YA_CUMPLE_SIN_ABONO') {
    assert.equal(r.detalle.porcentaje, 0)
    assert.equal(r.detalle.montoMensual, 0)
    assert.equal(r.detalle.payback, 87)
  }
})

verificar('D6: ROI mínimo 50 % → ENCONTRADO, mínimo exacto de la grilla de 0,1 % (el valor inmediatamente inferior no cumple) (AC-48)', () => {
  const politica = conRoiMinimo(0.5)
  const r = calcularAbonoMinimo(P, 0, politica)
  assert.equal(r.estado, 'ENCONTRADO')
  if (r.estado !== 'ENCONTRADO') return
  const d = r.detalle
  const paso = Math.round(d.porcentaje * 1000)
  assert.ok(d.roi >= 0.5, 'el abono encontrado cumple')
  const anterior = calcularMetricas(conAbono(P, (paso - 1) / 1000), 0)
  assert.ok(anterior.roiSobreInversionTotal < 0.5, 'el paso anterior no cumple')
  assert.ok(r.evaluaciones <= 16, `búsqueda binaria acotada (${r.evaluaciones} evaluaciones)`)
  // Detalle coherente con el motor en ese abono (no se recalcula por otro camino).
  const m = calcularMetricas(conAbono(P, d.porcentaje), 0)
  assert.equal(d.roi, m.roiSobreInversionTotal)
  assert.equal(d.payback, m.paybackFlujoContractualCompleto)
  assert.equal(d.mesesReales, m.amortizacionConAbono!.mesesReales)
  assert.equal(d.ahorroIntereses, m.amortizacionConAbono!.ahorroIntereses)
  assert.equal(d.montoMensual, d.porcentaje * m.amortizacionNormal!.cuotaMensual)
  assert.equal(d.mesInicio, P.mesInicioAbonoCapital)
  assert.equal(d.flujoDeCajaNeto, m.flujoDeCajaNeto)
})

verificar('D6: ROI mínimo 80 % (ni con 500 % se llega: 75,05 %) → NO_ALCANZABLE_POR_ROI', () => {
  const r = calcularAbonoMinimo(P, 0, conRoiMinimo(0.8))
  assert.equal(r.estado, 'NO_ALCANZABLE_POR_ROI')
  if (r.estado === 'NO_ALCANZABLE_POR_ROI') {
    assert.equal(r.porcentajeMaximo, 5)
    assert.ok(r.roiConAbonoMaximo < 0.8)
  }
})

verificar('D6: payback máximo 80 semanas (payback 87, que el abono no mueve) → NO_ALCANZABLE_POR_PAYBACK', () => {
  const r = calcularAbonoMinimo(P, 0, conPaybackMaximo(80))
  assert.equal(r.estado, 'NO_ALCANZABLE_POR_PAYBACK')
})

verificar('D6: Recursos propios → NO_APLICA_RECURSOS_PROPIOS; parámetros o política inválidos → PARAMETROS_INVALIDOS', () => {
  assert.equal(calcularAbonoMinimo({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0, POLITICA_FINANCIERA_V1).estado, 'NO_APLICA_RECURSOS_PROPIOS')
  assert.equal(calcularAbonoMinimo({ ...P, precioCompra: 0 }, 0, POLITICA_FINANCIERA_V1).estado, 'PARAMETROS_INVALIDOS')
  assert.equal(calcularAbonoMinimo(P, 0, { ...POLITICA_FINANCIERA_V1, roiCortes: [0.3, 0.2, 0.6] }).estado, 'PARAMETROS_INVALIDOS')
})

verificar('D6: nunca modifica los parámetros ni la política recibidos', () => {
  const p = structuredClone(P)
  const politica = structuredClone(conRoiMinimo(0.5))
  calcularAbonoMinimo(p, 0, politica)
  assert.deepEqual(p, P)
  assert.deepEqual(politica, conRoiMinimo(0.5))
})

verificar('D6: búsqueda binaria = búsqueda exhaustiva de 0,1 % en casos ENCONTRADO (3 casos × 5.001 abonos)', () => {
  const casosPrueba: Array<[ParametrosPresupuesto, PoliticaFinanciera]> = [
    [P, conRoiMinimo(0.5)],
    [P, conRoiMinimo(0.7)],
    [{ ...P, mesInicioAbonoCapital: 10, tasaEfectivaAnualCredito: 0.35 }, conRoiMinimo(0.45)],
  ]
  for (const [p, politica] of casosPrueba) {
    const binaria = calcularAbonoMinimo(p, 0, politica)
    const exhaustiva = abonoMinimoExhaustivo(p, 0, politica)
    assert.equal(binaria.estado, 'ENCONTRADO')
    assert.ok(exhaustiva !== null)
    if (binaria.estado === 'ENCONTRADO') assert.equal(Math.round(binaria.detalle.porcentaje * 1000), exhaustiva)
  }
})

// Generador congruencial con semilla fija: mismas combinaciones en cada ejecución de CI.
function generador(semilla: number) {
  let s = semilla
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
}

verificar('D6 (39.8.1): ROI no decreciente y payback constante al variar el abono, en 50 combinaciones aleatorias válidas × 501 abonos', () => {
  const rnd = generador(20260925)
  const entre = (a: number, b: number) => a + (b - a) * rnd()
  let combinaciones = 0
  let evaluaciones = 0
  while (combinaciones < 50) {
    let p: ParametrosPresupuesto = {
      ...P,
      principalCreditoBancario: Math.round(entre(1e6, 8e7)),
      tasaEfectivaAnualCredito: entre(0.001, 0.6),
      mesesCreditoVehiculo: 1 + Math.floor(entre(0, 120)),
      mesInicioAbonoCapital: 1 + Math.floor(entre(0, 90)),
      capitalPropioDeclarado: Math.round(entre(0, 3e7)),
      precioCompra: Math.round(entre(1e7, 9e7)),
      cuotaSemanalConductor: Math.round(entre(250000, 900000)),
    }
    p = conSeguroLegacy(p, { principalFinanciacion: Math.round(entre(0, 6e6)), costoFinancieroEstimado: Math.round(entre(0, 4e6)), plazoMeses: 1 + Math.floor(entre(0, 72)) })
    if (validarParametros(p).length > 0) continue
    const semanas = Math.floor(entre(0, 30))
    combinaciones++
    let roiAnterior = -Infinity
    const payback0 = calcularMetricas(p, semanas).paybackFlujoContractualCompleto
    for (let paso = 0; paso <= PASO_MAXIMO_ABONO; paso += 10) {
      const r = calcularMetricas(conAbono(p, paso / 1000), semanas)
      evaluaciones++
      assert.ok(r.roiSobreInversionTotal >= roiAnterior, `ROI decrece en la combinación ${combinaciones}, abono ${paso / 10}%`)
      assert.equal(r.paybackFlujoContractualCompleto, payback0, `payback cambia en la combinación ${combinaciones}, abono ${paso / 10}%`)
      roiAnterior = r.roiSobreInversionTotal
    }
  }
  assert.equal(evaluaciones, 50 * 501)
})

verificar('D6 (39.8.1): la misma invariante en los 25 escenarios de la línea base (pasos de 5 %)', () => {
  for (const escenario of ESCENARIOS_LINEA_BASE) {
    const p = escenario.parametros(P)
    let roiAnterior = -Infinity
    const payback0 = calcularMetricas(p, 0).paybackFlujoContractualCompleto
    for (let paso = 0; paso <= PASO_MAXIMO_ABONO; paso += 50) {
      const r = calcularMetricas(conAbono(p, paso / 1000), 0)
      assert.ok(r.roiSobreInversionTotal >= roiAnterior, `${escenario.id}: ROI decrece en ${paso / 10}%`)
      assert.equal(r.paybackFlujoContractualCompleto, payback0, `${escenario.id}: payback cambia en ${paso / 10}%`)
      roiAnterior = r.roiSobreInversionTotal
    }
  }
})

verificar('D6 (39.8.1): guardia de dependencia — el abono solo se lee en metricas.ts, al construir la amortización con abono', () => {
  const carpeta = path.resolve(__dirname, '../../src/lib/domain/presupuesto')
  const motor = ['metricas.ts', 'flujoDeCaja.ts', 'amortizacion.ts', 'parametros.ts', 'seguroLegacy.ts', 'datosNoConfirmados.ts']
  for (const archivo of motor) {
    const lineas = fs
      .readFileSync(path.join(carpeta, archivo), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .filter((l) => /\bp\.(porcentajeAbonoCapital|mesInicioAbonoCapital)\b/.test(l))
    if (archivo === 'metricas.ts') {
      assert.equal(lineas.length, 2, `metricas.ts debe leer el abono solo en las dos líneas de la amortización con abono (${lineas.length})`)
      assert.ok(lineas.every((l) => /porcentajeAbonoCapital > 0|amortizarCreditoConAbono\(/.test(l)))
    } else if (archivo === 'parametros.ts') {
      // Solo la validación puede leerlo.
      assert.ok(lineas.every((l) => /errores\.push|if \(|>= 0 &&|Number\.isInteger/.test(l)), 'parametros.ts solo valida el abono')
    } else {
      assert.deepEqual(lineas, [], `${archivo} no debe leer el abono`)
    }
  }
})

console.log(`\n${casos} casos del abono mínimo requerido (D6) verificados, todos OK.`)
