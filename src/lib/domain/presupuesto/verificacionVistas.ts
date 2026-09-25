// KAI-29 — Verificación de D7, modelos de vista de las visualizaciones (spec.md 39.3 y 39.8.3).

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { conAbono } from './abonoMinimo'
import { ESCENARIOS_LINEA_BASE } from './lineaBase'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA } from './parametros'
import { POLITICA_FINANCIERA_V1 } from './politicaFinanciera'
import { GRILLA_SENSIBILIDAD_ABONO, modeloGraficoFlujo, modeloGraficoSaldo, semanaDeCruceDibujada, sensibilidadAbono } from './vistasGraficos'

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

verificar('D7-1: en la referencia, el cruce dibujado es la semana 87 = payback contractual (antes el gráfico cruzaba en la 163)', () => {
  const r = calcularMetricas(P, 0)
  const m = modeloGraficoFlujo(r)
  assert.equal(m.paybackSemana, 87)
  assert.equal(semanaDeCruceDibujada(m), 87)
  assert.equal(m.inversion, r.inversionInicialTotal)
  assert.deepEqual(m.contractualReal, r.flujo.serieFlujoContractualAcumulado.slice(0, r.flujo.duracionContratoSemanas))
})

verificar('D7-1: el cruce dibujado coincide con paybackFlujoContractualCompleto en las 50 combinaciones de la línea base (AC-50)', () => {
  for (const escenario of ESCENARIOS_LINEA_BASE) {
    for (const semanas of [0, 6]) {
      const r = calcularMetricas(escenario.parametros(P), semanas)
      const m = modeloGraficoFlujo(r)
      assert.equal(semanaDeCruceDibujada(m), r.paybackFlujoContractualCompleto, `${escenario.id}|aplaz${semanas}`)
      assert.equal(m.paybackSemana, r.paybackFlujoContractualCompleto)
      assert.ok(m.horizonteSemanas >= m.duracionContratoSemanas && m.maximoY >= m.inversion)
    }
  }
})

verificar('D7-2: cada punto del saldo coincide con los cronogramas del motor, normal y con abono (AC-51)', () => {
  for (const abono of [0, 1, 5]) {
    const p = conAbono(P, abono)
    const r = calcularMetricas(p, 0)
    const m = modeloGraficoSaldo(r, p)
    assert.ok(m)
    assert.deepEqual(m.normal[0], { mes: 0, saldo: p.principalCreditoBancario })
    r.amortizacionNormal!.cronograma.forEach((c, i) => assert.equal(m.normal[i + 1].saldo, c.saldo))
    if (abono === 0) assert.equal(m.conAbono, null)
    else r.amortizacionConAbono!.cronograma.forEach((c, i) => assert.equal(m.conAbono![i + 1].saldo, c.saldoFinal))
    assert.equal(m.mesFinCredito, r.mesesCreditoReales)
    assert.equal(m.mesFinContrato, r.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno))
  }
  assert.equal(modeloGraficoSaldo(calcularMetricas({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0), { ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }), null)
})

verificar('D7-3: cada punto de la sensibilidad = calcularMetricas con solo el abono cambiado; incluye grilla, actual y mínimo (AC-52)', () => {
  const p = conAbono(P, 0.25)
  const puntos = sensibilidadAbono(p, 6, POLITICA_FINANCIERA_V1, 0.123)
  assert.ok(puntos)
  const porcentajes = puntos.map((x) => x.porcentaje)
  for (const g of GRILLA_SENSIBILIDAD_ABONO) assert.ok(porcentajes.includes(g))
  assert.ok(porcentajes.includes(0.25) && porcentajes.includes(0.123))
  assert.deepEqual(porcentajes, [...porcentajes].sort((a, b) => a - b))
  for (const x of puntos) {
    const r = calcularMetricas({ ...p, porcentajeAbonoCapital: x.porcentaje }, 6)
    assert.equal(x.roi, r.roiSobreInversionTotal)
    assert.equal(x.payback, r.paybackFlujoContractualCompleto)
    assert.equal(x.flujoDeCajaNeto, r.flujoDeCajaNeto)
    assert.equal(x.costosFinancierosRentabilidad, r.costosFinancierosRentabilidad)
  }
  assert.equal(puntos.filter((x) => x.esActual).length, 1)
  assert.equal(puntos.filter((x) => x.esMinimo).length, 1)
  assert.equal(new Set(puntos.map((x) => x.payback)).size, 1, 'el payback contractual es el mismo en toda la sensibilidad (39.8.1)')
  assert.equal(sensibilidadAbono({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0, POLITICA_FINANCIERA_V1, null), null)
})

verificar('D7: sin librerías nuevas de gráficos en package.json (AC-56)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  const graficos = todas.filter((d) => /chart|recharts|d3|plotly|victory|nivo|echarts|visx|apexcharts/i.test(d))
  assert.deepEqual(graficos, [])
})

console.log(`\n${casos} casos de las visualizaciones (D7) verificados, todos OK.`)
