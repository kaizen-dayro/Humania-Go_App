// KAI-29 — Verificación de la simulación manual del abono (2026-09-25).
// El campo "Abono mensual al capital (%)" alimenta el MISMO `porcentajeAbonoCapital` del motor: estas
// pruebas comprueban que el escenario manual es idéntico a la fila equivalente de la sensibilidad, que
// el gráfico de saldo sale del porcentaje activo, que D6 es independiente y que el snapshot lo conserva.

import assert from 'node:assert/strict'
import { calcularAbonoMinimo, conAbono } from './abonoMinimo'
import { calcularMetricas, type ResultadoMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, type ParametrosPresupuesto } from './parametros'
import { POLITICA_FINANCIERA_V1, evaluarPolitica, type PoliticaFinanciera } from './politicaFinanciera'
import { reconocerSnapshot } from './reconocerSnapshot'
import { TEXTOS_SIMULACION_ABONO as TA } from './textosInterfaz'
import { FINANCIAL_MODEL_VERSION } from './version'
import { abonoActivo, modeloGraficoSaldo, sensibilidadAbono } from './vistasGraficos'

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
/** Misma tolerancia financiera del proyecto (lineaBase.ts / compararHistorico.ts). */
const TOL = 1e-4
const cerca = (a: number, b: number, que: string) => assert.ok(Math.abs(a - b) <= TOL, `${que}: ${a} vs ${b}`)

/** Todo lo que el pedido exige comparar: saldo final, meses, intereses, ahorro, ROI, flujo y serie del gráfico. */
function comparar(manual: ResultadoMetricas, referencia: ResultadoMetricas, pManual: ParametrosPresupuesto, pReferencia: ParametrosPresupuesto, etiqueta: string) {
  cerca(manual.roiSobreInversionTotal, referencia.roiSobreInversionTotal, `${etiqueta} ROI`)
  cerca(manual.resultadoNeto, referencia.resultadoNeto, `${etiqueta} resultado neto`)
  cerca(manual.flujoDeCajaNeto, referencia.flujoDeCajaNeto, `${etiqueta} flujo de caja neto`)
  cerca(manual.costosFinancierosRentabilidad, referencia.costosFinancierosRentabilidad, `${etiqueta} intereses al cierre`)
  assert.equal(manual.paybackFlujoContractualCompleto, referencia.paybackFlujoContractualCompleto, `${etiqueta} payback`)
  assert.equal(manual.mesesCreditoReales, referencia.mesesCreditoReales, `${etiqueta} meses reales`)
  const a = manual.amortizacionConAbono
  const b = referencia.amortizacionConAbono
  assert.equal(a === null, b === null, `${etiqueta} existencia del cronograma con abono`)
  if (a && b) {
    cerca(a.interesTotalConAbono, b.interesTotalConAbono, `${etiqueta} interés total`)
    cerca(a.ahorroIntereses, b.ahorroIntereses, `${etiqueta} ahorro de intereses`)
    cerca(a.cronograma[a.cronograma.length - 1].saldoFinal, b.cronograma[b.cronograma.length - 1].saldoFinal, `${etiqueta} saldo final`)
  }
  const sa = modeloGraficoSaldo(manual, pManual)!
  const sb = modeloGraficoSaldo(referencia, pReferencia)!
  assert.deepEqual(sa, sb, `${etiqueta} serie del gráfico de saldo`)
}

verificar('Caso 1: abono manual 0% = escenario sin abono (sin cronograma con abono; mismo resultado que la referencia)', () => {
  const r = calcularMetricas(conAbono(P, 0), 0)
  const ref = calcularMetricas(P, 0)
  assert.equal(r.amortizacionConAbono, null)
  assert.deepEqual(modeloGraficoSaldo(r, P)!.conAbono, null)
  comparar(r, ref, P, P, '0%')
})

verificar('Casos 2-4: abono manual 50%, 100% y 200% = filas 50/100/200 de la sensibilidad (ROI, flujo, intereses, meses, saldo, serie)', () => {
  const puntos = sensibilidadAbono(P, 0, POLITICA_FINANCIERA_V1, null)!
  for (const porcentaje of [0.5, 1, 2]) {
    const pManual = conAbono(P, porcentaje)
    const manual = calcularMetricas(pManual, 0)
    const fila = puntos.find((x) => x.porcentaje === porcentaje)!
    cerca(manual.roiSobreInversionTotal, fila.roi, `${porcentaje * 100}% ROI vs fila`)
    cerca(manual.flujoDeCajaNeto, fila.flujoDeCajaNeto, `${porcentaje * 100}% flujo vs fila`)
    cerca(manual.costosFinancierosRentabilidad, fila.costosFinancierosRentabilidad, `${porcentaje * 100}% intereses vs fila`)
    assert.equal(manual.mesesCreditoReales, fila.mesesReales)
    assert.equal(manual.paybackFlujoContractualCompleto, fila.payback)
    // Y contra una evaluación independiente con el mismo porcentaje (misma ruta del motor, sin atajos).
    comparar(manual, calcularMetricas({ ...P, porcentajeAbonoCapital: porcentaje }, 0), pManual, { ...P, porcentajeAbonoCapital: porcentaje }, `${porcentaje * 100}%`)
  }
})

verificar('Caso 5: abono manual 137% calcula un escenario nuevo (entre 100% y 200%) y aparece como fila "actual" de la sensibilidad', () => {
  const p137 = conAbono(P, 1.37)
  const r137 = calcularMetricas(p137, 0)
  const r100 = calcularMetricas(conAbono(P, 1), 0)
  const r200 = calcularMetricas(conAbono(P, 2), 0)
  assert.ok(r137.roiSobreInversionTotal > r100.roiSobreInversionTotal && r137.roiSobreInversionTotal < r200.roiSobreInversionTotal)
  assert.ok(r137.mesesCreditoReales! < r100.mesesCreditoReales! && r137.mesesCreditoReales! > r200.mesesCreditoReales!)
  const puntos = sensibilidadAbono(p137, 0, POLITICA_FINANCIERA_V1, null)!
  const actual = puntos.filter((x) => x.esActual)
  assert.equal(actual.length, 1)
  assert.equal(actual[0].porcentaje, 1.37)
  cerca(actual[0].roi, r137.roiSobreInversionTotal, '137% fila actual')
  for (const estandar of [0, 0.5, 1, 2, 3, 5]) assert.ok(puntos.some((x) => x.porcentaje === estandar), `sigue la fila estándar ${estandar}`)
  // El gráfico usa exactamente el 137%: su última posición es el mes real del cronograma de 137%.
  const saldo = modeloGraficoSaldo(r137, p137)!
  assert.equal(saldo.conAbono![saldo.conAbono!.length - 1].mes, r137.mesesCreditoReales)
  assert.equal(saldo.mesFinCredito, r137.mesesCreditoReales)
})

verificar('Caso 6: cambios dinámicos 0 → 100 → 200 → 50 → 137 %: cada paso recalcula todo desde el porcentaje actual (sin memoria del anterior)', () => {
  const directo = new Map([0, 1, 2, 0.5, 1.37].map((x) => [x, calcularMetricas(conAbono(P, x), 0)]))
  let p = P
  for (const x of [0, 1, 2, 0.5, 1.37]) {
    p = { ...p, porcentajeAbonoCapital: x } // mismo reemplazo que hace el campo (setParam)
    const r = calcularMetricas(p, 0)
    comparar(r, directo.get(x)!, p, conAbono(P, x), `secuencia ${x * 100}%`)
    const activo = abonoActivo(r, p)!
    assert.equal(activo.porcentaje, x)
  }
})

verificar('Caso 7: con otro capital, tasa y plazo, el porcentaje manual se aplica al crédito nuevo (cuota y cronograma nuevos)', () => {
  const otro: ParametrosPresupuesto = { ...P, principalCreditoBancario: 45_000_000, tasaEfectivaAnualCredito: 0.32, mesesCreditoVehiculo: 60, porcentajeAbonoCapital: 1.37 }
  const r = calcularMetricas(otro, 0)
  const activo = abonoActivo(r, otro)!
  assert.equal(activo.cuotaMensualOriginal, r.amortizacionConAbono!.cuotaMensualOriginal, 'misma base que el motor')
  cerca(activo.montoMensual, 1.37 * r.amortizacionConAbono!.cuotaMensualOriginal, 'monto sobre la cuota del crédito nuevo')
  const conAbonoExtra = r.amortizacionConAbono!.cronograma.filter((c) => c.mes >= otro.mesInicioAbonoCapital && c.abonoExtra > 0)
  // Salvo el último mes (recortado al saldo), cada abono extra es exactamente 137% de la cuota del crédito nuevo.
  for (const c of conAbonoExtra.slice(0, -1)) cerca(c.abonoExtra, activo.montoMensual, `abono del mes ${c.mes}`)
  const referencia = calcularMetricas(P, 0)
  assert.notEqual(activo.cuotaMensualOriginal, referencia.amortizacionNormal!.cuotaMensual, 'la cuota cambió con el crédito')
  const saldo = modeloGraficoSaldo(r, otro)!
  assert.deepEqual(saldo.normal[0], { mes: 0, saldo: 45_000_000 })
})

verificar('Monto estimado = porcentaje × cuota mensual original del motor (referencia: 100% ≈ $719.172/mes); texto literal', () => {
  const p = conAbono(P, 1)
  const r = calcularMetricas(p, 0)
  const a = abonoActivo(r, p)!
  assert.equal(a.cuotaMensualOriginal, r.amortizacionNormal!.cuotaMensual)
  assert.equal(a.cuotaMensualOriginal, r.amortizacionConAbono!.cuotaMensualOriginal)
  assert.equal(Math.round(a.montoMensual), 719172)
  assert.equal(abonoActivo(calcularMetricas({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0), { ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }), null)
  assert.equal(TA.etiqueta, 'Abono mensual al capital (%)')
  assert.equal(TA.estimado('$720.000'), 'Abono mensual estimado: $720.000/mes')
})

verificar('D6 es independiente del porcentaje manual: mismo abono mínimo con cualquier valor manual; el manual se evalúa por su cuenta', () => {
  const politica: PoliticaFinanciera = { ...POLITICA_FINANCIERA_V1, roiCortes: [0.2, 0.5, 0.6] }
  const base = calcularAbonoMinimo(P, 0, politica)
  assert.equal(base.estado, 'ENCONTRADO')
  if (base.estado !== 'ENCONTRADO') return
  for (const manual of [0, 0.2, 1.37, 5]) {
    const r = calcularAbonoMinimo(conAbono(P, manual), 0, politica)
    assert.deepEqual(r, base, `D6 no cambia con el manual ${manual * 100}%`)
  }
  const minimo = base.detalle.porcentaje
  const evaluar = (x: number) => evaluarPolitica(calcularMetricas(conAbono(P, x), 0), politica).veredicto
  assert.equal(evaluar(minimo - 0.001), 'NO_CUMPLE', 'manual por debajo del mínimo: no alcanza la política')
  assert.notEqual(evaluar(minimo), 'NO_CUMPLE', 'manual igual al mínimo: cumple')
  assert.notEqual(evaluar(minimo + 0.5), 'NO_CUMPLE', 'manual por encima del mínimo: cumple')
})

verificar('Presupuesto guardado: el porcentaje manual viaja en `parametros` y se restaura exacto; no se toma el de otra simulación', () => {
  const guardadoA = { ...conAbono(P, 1.37) } as unknown as Record<string, unknown>
  const guardadoB = { ...conAbono(P, 0.5) } as unknown as Record<string, unknown>
  const a = reconocerSnapshot(guardadoA, FINANCIAL_MODEL_VERSION)
  const b = reconocerSnapshot(guardadoB, FINANCIAL_MODEL_VERSION)
  const a2 = reconocerSnapshot(guardadoA, FINANCIAL_MODEL_VERSION)
  assert.equal(a.estado, 'DETERMINISTA')
  assert.equal(b.estado, 'DETERMINISTA')
  if (a.estado !== 'DETERMINISTA' || b.estado !== 'DETERMINISTA' || a2.estado !== 'DETERMINISTA') return
  assert.equal(a.parametros.porcentajeAbonoCapital, 1.37)
  assert.equal(b.parametros.porcentajeAbonoCapital, 0.5)
  assert.equal(a2.parametros.porcentajeAbonoCapital, 1.37, 'A → B → A restaura el 137%')
  const rA = calcularMetricas(a2.parametros, 0)
  assert.deepEqual(modeloGraficoSaldo(rA, a2.parametros), modeloGraficoSaldo(calcularMetricas(conAbono(P, 1.37), 0), conAbono(P, 1.37)), 'el gráfico se reconstruye con el 137%')
})

console.log(`\n${casos} casos de la simulación manual del abono verificados, todos OK.`)
