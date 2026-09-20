// KAI-29 — Verificación de la línea base financiera (spec.md 33). La ejecuta CI.
//
//   npm run verificar:linea-base   (o npm run verificar:financiero)
//
// Recalcula las 50 combinaciones (25 escenarios × 2 variantes de semanas aplazatorias) con el
// MISMO código que usa la calculadora y las compara contra `lineaBase.json` (versionado; CI nunca
// lo regenera). Ante cualquier diferencia falla con: escenario, métrica o serie, valor esperado,
// valor obtenido y diferencia (y, para series, el bloque y la primera muestra distinta).
// Tolerancias: enteros/booleanos exactos; montos y razones |diferencia| <= 1e-4 (ver lineaBase.ts).
//
// Si esta prueba falla NO se corrige la prueba ni se actualiza la línea base para aceptar el
// resultado: hay que identificar qué cambio produjo la diferencia y reportarlo.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, inversionInicial } from './parametros'
import {
  ESCENARIOS_LINEA_BASE,
  SEMANAS_APLAZATORIAS_LINEA_BASE,
  TOLERANCIA_ABSOLUTA,
  calcularHuellaCombinacion,
  combinacionesLineaBase,
  compararConLineaBase,
  extraerHuella,
  esEnteroExacto,
  type LineaBase,
} from './lineaBase'

const RUTA_LINEA_BASE = path.resolve(__dirname, '../../src/lib/domain/presupuesto/lineaBase.json')
const lineaBase = JSON.parse(fs.readFileSync(RUTA_LINEA_BASE, 'utf8')) as LineaBase

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

const combinaciones = combinacionesLineaBase()

verificar('la línea base cubre exactamente las 50 combinaciones (25 escenarios × 2 variantes de semanas aplazatorias), sin sobrantes ni faltantes', () => {
  assert.equal(ESCENARIOS_LINEA_BASE.length, 25)
  assert.deepEqual([...SEMANAS_APLAZATORIAS_LINEA_BASE], [0, 6])
  assert.equal(combinaciones.length, 50)
  assert.equal(new Set(combinaciones.map((c) => c.clave)).size, 50, 'claves repetidas')
  assert.deepEqual(Object.keys(lineaBase.combinaciones).sort(), combinaciones.map((c) => c.clave).sort())
  assert.equal(lineaBase.meta.combinaciones, 50)
  assert.equal(lineaBase.meta.escenarios, 25)
  assert.equal(lineaBase.meta.tolerancia_absoluta, TOLERANCIA_ABSOLUTA)
  assert.equal(TOLERANCIA_ABSOLUTA, 1e-4, 'la tolerancia es la ya existente en las suites (1e-4); no se amplía')
})

verificar('los 50 resultados coinciden con la línea base (escalares y series completas, por huella): si algo cambia, el error indica escenario, métrica/serie, esperado, obtenido y diferencia', () => {
  const errores: string[] = []
  let escalares = 0
  let series = 0
  let posiciones = 0
  for (const c of combinaciones) {
    const esperado = lineaBase.combinaciones[c.clave]
    const obtenido = calcularHuellaCombinacion(c)
    errores.push(...compararConLineaBase(c.etiqueta, esperado, obtenido))
    escalares += Object.keys(esperado.escalares).length
    series += Object.keys(esperado.series).length
    posiciones += Object.values(esperado.series).reduce((s, x) => s + x.n, 0)
  }
  if (errores.length > 0) {
    console.error(`\n${errores.length} diferencia(s) contra la línea base financiera protegida:`)
    for (const e of errores.slice(0, 40)) console.error('  - ' + e)
    if (errores.length > 40) console.error(`  … y ${errores.length - 40} más`)
    assert.fail(`${errores.length} resultado(s) financiero(s) protegido(s) cambiaron (ver arriba). No se corrige la prueba ni la línea base.`)
  }
  console.log(`     ${combinaciones.length}/50 combinaciones idénticas: ${escalares} valores escalares y ${series} series protegidas (${posiciones.toLocaleString('es-CO')} posiciones)`)
})

verificar('mesesCreditoReales y creditoSobreviveAlContrato (PR #16) se validan contra el cronograma REAL de amortización del mismo resultado que consume la calculadora', () => {
  for (const c of combinaciones) {
    const p = c.escenario.parametros(PARAMETROS_REFERENCIA)
    const m = calcularMetricas(p, c.semanasAplazatorias)
    const esperado = lineaBase.combinaciones[c.clave].escalares
    if (m.amortizacionConAbono) assert.equal(m.mesesCreditoReales, m.amortizacionConAbono.mesesReales, `${c.clave}: con abono = meses del cronograma con abono`)
    else if (m.amortizacionNormal) assert.equal(m.mesesCreditoReales, m.amortizacionNormal.cronograma.length, `${c.clave}: sin abono = meses del cronograma normal`)
    else assert.equal(m.mesesCreditoReales, null, `${c.clave}: sin crédito (Recursos Propios)`)
    assert.equal(esperado.mesesCreditoReales, m.mesesCreditoReales, `${c.clave}: línea base de mesesCreditoReales`)
    assert.equal(esperado.creditoSobreviveAlContrato, m.creditoSobreviveAlContrato, `${c.clave}: línea base de creditoSobreviveAlContrato`)
  }
})

verificar('la clasificación de tolerancias es la documentada: enteros de conteo exactos; montos y razones con tolerancia absoluta de 1e-4', () => {
  for (const r of ['paybackFlujoContractualCompleto', 'paybackOperativoExtrapolado', 'flujo.duracionContratoSemanas', 'mesesCreditoReales', 'amortizacionConAbono.mesesReales', 'amortizacionNormal.mesPagoCompleto']) {
    assert.equal(esEnteroExacto(r), true, r)
  }
  for (const r of ['resultadoNeto', 'roiSobreInversionTotal', 'flujoDeCajaNeto', 'inversionInicial', 'costosFinancierosCaja', 'amortizacionConAbono.totalPagado']) {
    assert.equal(esEnteroExacto(r), false, r)
  }
})

// ===== Controles negativos: la red de seguridad SÍ detecta cambios (y no protesta por ruido dentro de la tolerancia) =====

const claveControl = 'abono_5_ini_3|aplaz0'
const combControl = combinaciones.find((c) => c.clave === claveControl)!
const esperadoControl = lineaBase.combinaciones[claveControl]
const resultadoControl = () => JSON.parse(JSON.stringify(calcularMetricas(combControl.escenario.parametros(PARAMETROS_REFERENCIA), 0))) as Record<string, unknown>
const inversionControl = inversionInicial(combControl.escenario.parametros(PARAMETROS_REFERENCIA))

verificar('control negativo (escalar): un ROI distinto en 0,001 falla con escenario, métrica, esperado, obtenido y diferencia; 5e-5 (dentro de la tolerancia) no', () => {
  const r = resultadoControl()
  ;(r.roiSobreInversionTotal as number) += 0.001
  const errores = compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(r, inversionControl))
  assert.equal(errores.length, 1)
  assert.match(errores[0], /Escenario "abono_5_ini_3" .*\/ roiSobreInversionTotal: esperado [\d.]+, obtenido [\d.]+, diferencia [\d.e-]+/)
  const ruido = resultadoControl()
  ;(ruido.roiSobreInversionTotal as number) += 5e-5
  assert.deepEqual(compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(ruido, inversionControl)), [])
})

verificar('control negativo (entero): un payback distinto en 1 semana falla aunque la diferencia sea menor que cualquier tolerancia monetaria', () => {
  const r = resultadoControl()
  ;(r.paybackFlujoContractualCompleto as number) += 1
  const errores = compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(r, inversionControl))
  assert.equal(errores.length, 1)
  assert.match(errores[0], /paybackFlujoContractualCompleto: esperado \d+, obtenido \d+, diferencia 1/)
})

verificar('control negativo (series): un cambio en cualquier semana o mes cambia la huella e indica serie, bloque de semanas/meses y la primera muestra distinta cuando la hay', () => {
  const enMuestra = resultadoControl() as { flujo: { serieIngresoOperativoAcumulado: number[] } }
  enMuestra.flujo.serieIngresoOperativoAcumulado[52] += 1 // inicio del bloque 2 (semana 53): es una muestra
  let e = compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(enMuestra as unknown as Record<string, unknown>, inversionControl))
  assert.equal(e.length, 1)
  assert.match(e[0], /serie flujo\.serieIngresoOperativoAcumulado: la huella de la serie completa difiere \(900 posiciones\)\. Primer bloque distinto: semanas 53–104; primera muestra distinta en la semana 53: esperado [\d.]+, obtenido [\d.]+, diferencia 1/)

  const internoAlBloque = resultadoControl() as { flujo: { serieFlujoContractualAcumulado: number[] } }
  internoAlBloque.flujo.serieFlujoContractualAcumulado[100] += 1 // semana 101, dentro del bloque 53–104, sin ser muestra
  e = compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(internoAlBloque as unknown as Record<string, unknown>, inversionControl))
  assert.equal(e.length, 1)
  assert.match(e[0], /serie flujo\.serieFlujoContractualAcumulado: .*Primer bloque distinto: semanas 53–104; ninguna muestra difiere/)

  const saldo = resultadoControl() as { amortizacionConAbono: { cronograma: Array<{ saldoFinal: number }> } }
  saldo.amortizacionConAbono.cronograma[5].saldoFinal += 1 // mes 6 del cronograma con abono
  e = compararConLineaBase(combControl.etiqueta, esperadoControl, extraerHuella(saldo as unknown as Record<string, unknown>, inversionControl))
  assert.equal(e.length, 1)
  assert.match(e[0], /serie amortizacionConAbono\.cronograma\[\]\.saldoFinal: .*Primer bloque distinto: meses 1–9/)
})

console.log(`\n${casos} verificaciones de la línea base financiera, todas OK.`)
