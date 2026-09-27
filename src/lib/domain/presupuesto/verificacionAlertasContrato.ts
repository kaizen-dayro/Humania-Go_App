// KAI-42 — Verificación de las alertas de la operación y de la regla contractual del crédito (spec.md 42).
//
// Regla confirmada por Humania Go (2026-09-27): el crédito del activo debe quedar pagado antes de terminar el
// contrato con el conductor. Opción A: ningún cálculo del motor cambia (la línea base 50/50 lo protege aparte);
// cambian las alertas (solo aparecen si su condición se cumple), la decisión D8 y el abono mínimo D6.
// Los valores esperados se calculan a mano o por un camino independiente (fórmula de anualidad).

import assert from 'node:assert/strict'
import { abonoMinimoContrato, abonoMinimoExhaustivo, calcularAbonoMinimo, conAbono } from './abonoMinimo'
import {
  construirAlertasOperacion,
  entradasConductorAcumuladas,
  mesFinDelContrato,
  necesidadCajaMensual,
  saldoCreditoAlMes,
  salidasCajaAcumuladas,
} from './alertasOperacion'
import { ESCENARIOS_LINEA_BASE } from './lineaBase'
import { calcularMetricas, calcularOtrosCostosHumania } from './metricas'
import { PARAMETROS_REFERENCIA, validarParametros, type ParametrosPresupuesto } from './parametros'
import { evaluarPolitica, POLITICA_FINANCIERA_V1 } from './politicaFinanciera'
import { TEXTOS_APROBADOS as T, textoIncumplimiento } from './textosInterfaz'

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
// Mismos formatos que la pantalla (CalculadoraPresupuesto.tsx: `cop` y `pct`).
const cop = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`
const pct = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
const F = { moneda: cop, porcentaje: pct }
const alertasDe = (p: ParametrosPresupuesto) => {
  const r = calcularMetricas(p, 0)
  return { r, ...construirAlertasOperacion(p, r, abonoMinimoContrato(p, 0), F) }
}

// ===== A. Datos del escenario de referencia, calculados por un camino independiente =====

verificar('referencia: el contrato termina en el mes 35 (152 semanas ÷ 4,33) y el crédito en el 72', () => {
  const r = calcularMetricas(P, 0)
  assert.equal(r.flujo.duracionContratoSemanas, 152)
  assert.equal(mesFinDelContrato(P, r), 35)
  assert.equal(r.mesesCreditoReales, 72)
  assert.equal(r.creditoSobreviveAlContrato, true)
})

verificar('referencia: saldo al mes 35 = $18.681.475 (cronograma) = fórmula de anualidad, calculada aparte', () => {
  const r = calcularMetricas(P, 0)
  const i = Math.pow(1 + P.tasaEfectivaAnualCredito, 1 / 12) - 1
  const n = P.mesesCreditoVehiculo
  const cuota = (P.principalCreditoBancario * i) / (1 - Math.pow(1 + i, -n))
  const saldo35 = P.principalCreditoBancario * Math.pow(1 + i, 35) - (cuota * (Math.pow(1 + i, 35) - 1)) / i
  assert.ok(Math.abs(saldoCreditoAlMes(r, 35) - saldo35) < 1, `${saldoCreditoAlMes(r, 35)} vs ${saldo35}`)
  assert.equal(cop(saldoCreditoAlMes(r, 35)), '$18.681.475')
  assert.ok(Math.abs(r.amortizacionNormal!.cuotaMensual - cuota) < 1e-6)
})

verificar('abono que exige el contrato: 56,4 % (56,3 % termina en el mes 36, 56,4 % en el 35), $405.613/mes desde el mes 3', () => {
  const c = abonoMinimoContrato(P, 0)
  assert.equal(c.estado, 'ENCONTRADO')
  if (c.estado !== 'ENCONTRADO') return
  assert.equal(Math.round(c.porcentaje * 1000), 564)
  assert.equal(calcularMetricas(conAbono(P, 0.563), 0).mesesCreditoReales, 36)
  assert.equal(calcularMetricas(conAbono(P, 0.564), 0).mesesCreditoReales, 35)
  assert.equal(cop(c.montoMensual), '$405.613')
  assert.equal(c.mesInicio, 3)
  // Búsqueda binaria = recorrido completo de la grilla.
  let exhaustivo = -1
  for (let paso = 0; paso <= 5000 && exhaustivo < 0; paso++) if (!calcularMetricas(conAbono(P, paso / 1000), 0).creditoSobreviveAlContrato) exhaustivo = paso
  assert.equal(exhaustivo, 564)
})

// ===== B. Alertas y mensaje positivo, texto exacto =====

verificar('referencia sin abono: una sola alerta (crédito fuera del contrato) con saldo y abono necesario; sin mensaje positivo', () => {
  const { alertas, creditoPagadoAntes } = alertasDe(P)
  assert.deepEqual(alertas, [
    'Por contrato, el crédito debe quedar pagado antes de terminar el contrato. Con este plan termina en el mes 72 (contrato: mes 35) y al terminar el contrato quedan $18.681.475 de capital por pagar. Se necesita un abono de al menos 56,4% de la cuota ($405.613/mes) desde el mes 3, o un plazo de hasta 35 meses.',
  ])
  assert.equal(creditoPagadoAntes, null)
})

// Decisión de Dayro (27-09): lo que paga el conductor (incluido el componente de adquisición) se puede usar para
// pagar el banco. La alerta de caja compara, mes a mes y en acumulado, lo pagado con lo recibido del conductor.
verificar('abono 56,4 %: el crédito termina en el mes 35 (cumple); lo que paga el conductor cubre cada mes: sin alertas', () => {
  const { r, alertas, creditoPagadoAntes } = alertasDe(conAbono(P, 0.564))
  // La "vista de caja" del motor sigue negativa porque solo cuenta el ingreso operativo; ya no genera alerta.
  assert.equal(cop(r.flujoDeCajaNeto), '$-7.691.456')
  assert.deepEqual(alertas, [])
  assert.equal(creditoPagadoAntes, null, 'termina en el mes del fin del contrato: no es "antes"')
})

verificar('abono 100 %: pagado en el mes 26, 9 meses antes, ahorro $16.191.438; sin alertas (1.438.344/mes < lo que paga el conductor)', () => {
  const { alertas, creditoPagadoAntes } = alertasDe(conAbono(P, 1))
  assert.equal(
    creditoPagadoAntes,
    'El crédito queda pagado en el mes 26, 9 meses antes de terminar el contrato: desde entonces no hay pago al banco. Ahorro en intereses por el abono: $16.191.438.',
  )
  assert.deepEqual(alertas, [])
})

const SEGURO_COTIZACION = { valorPoliza: 1_711_586, pagoInicial: 262_557, valorFinanciado: 1_454_848, numeroCuotas: 10, valorCuota: 155_839 }
const conSeguroDigitado = (p: ParametrosPresupuesto): ParametrosPresupuesto => ({ ...p, seguro: { ...p.seguro, modo: 'DIGITADO', digitado: SEGURO_COTIZACION } })

verificar('necesidad de caja, prueba de Dayro (seguro digitado, abono 350 %): meses 1-3 a mano y faltante de los meses 4 a 18, máximo $12.489.399', () => {
  const p = conAbono(conSeguroDigitado(P), 3.5)
  const r = calcularMetricas(p, 0)
  // Mes 1: 4 semanas × 450.000 − (cuota 719.172 + cuota del seguro 155.839). Mes 2: 8 semanas. Mes 3: 13 semanas
  // (13 = ⌊3 × 52 ÷ 12⌋) y desde este mes se paga cuota + 350 % de abono.
  const cuota = r.amortizacionNormal!.cuotaMensual
  const saldoMes = (m: number) => entradasConductorAcumuladas(p, r, m) - salidasCajaAcumuladas(p, r, m)
  assert.ok(Math.abs(saldoMes(1) - (4 * 450_000 - (cuota + 155_839))) < 1e-6)
  assert.ok(Math.abs(saldoMes(2) - (8 * 450_000 - 2 * (cuota + 155_839))) < 1e-6)
  assert.ok(Math.abs(saldoMes(3) - (13 * 450_000 - 2 * (cuota + 155_839) - (cuota * 4.5 + 155_839))) < 1e-6)
  assert.equal(cop(saldoMes(3)), '$707.866')
  assert.deepEqual(necesidadCajaMensual(p, r) && { ...necesidadCajaMensual(p, r)!, maximo: cop(necesidadCajaMensual(p, r)!.maximo) }, { desde: 4, hasta: 18, maximo: '$12.489.399' })
  assert.equal(cop(saldoMes(12)), '$-12.489.399', 'el mayor faltante es en el mes 12 (último pago al banco y renovaciones del año 1)')
  assert.deepEqual(alertasDe(p).alertas, [
    'Durante los meses 4 a 18 el pago al banco supera lo que paga el conductor: se necesitan hasta $12.489.399 de recursos propios en ese periodo.',
  ])
})

verificar('necesidad de caja, pruebas de Dayro: 240 % → meses 5 a 19 (máximo $8.446.058); 140 % → sin faltante', () => {
  assert.deepEqual(alertasDe(conAbono(conSeguroDigitado(P), 2.4)).alertas, [
    'Durante los meses 5 a 19 el pago al banco supera lo que paga el conductor: se necesitan hasta $8.446.058 de recursos propios en ese periodo.',
  ])
  assert.deepEqual(alertasDe(conAbono(conSeguroDigitado(P), 1.4)).alertas, [])
  assert.equal(T.abonoMinimo.filaCajaAbonoMinimo, 'Flujo de caja neto — vista de caja (capital + interés) con el abono mínimo')
  assert.equal(
    T.alertasOperacion.necesidadCajaMensual(7, 7, '$100'),
    'Durante el mes 7 el pago al banco supera lo que paga el conductor: se necesitan hasta $100 de recursos propios en ese periodo.',
  )
})

verificar('las salidas de caja acumuladas al fin del contrato = costos de caja + recurrentes + otros del motor (50 combinaciones × 3 modos de seguro)', () => {
  for (const e of ESCENARIOS_LINEA_BASE) {
    for (const s of [0, 6]) {
      for (const modo of ['LEGACY_NO_CONFIRMADO', 'DIGITADO', 'SIN_SEGURO'] as const) {
        const base = e.parametros(P)
        const p = { ...base, seguro: { ...base.seguro, modo, digitado: SEGURO_COTIZACION } }
        const r = calcularMetricas(p, s)
        const mes = mesFinDelContrato(p, r)
        const motor = r.costosFinancierosCaja + r.costosRecurrentes.total + calcularOtrosCostosHumania(p, mes)
        assert.ok(Math.abs(salidasCajaAcumuladas(p, r, mes) - motor) < 1e-6, `${e.id}|${s}|${modo}`)
      }
    }
  }
})

verificar('crédito a 30 meses sin abono: mensaje positivo sin ahorro ("5 meses antes"); a 34 meses, "1 mes antes"', () => {
  assert.equal(
    alertasDe({ ...P, mesesCreditoVehiculo: 30 }).creditoPagadoAntes,
    'El crédito queda pagado en el mes 30, 5 meses antes de terminar el contrato: desde entonces no hay pago al banco.',
  )
  assert.equal(
    alertasDe({ ...P, mesesCreditoVehiculo: 34 }).creditoPagadoAntes,
    'El crédito queda pagado en el mes 34, 1 mes antes de terminar el contrato: desde entonces no hay pago al banco.',
  )
})

verificar('Recursos propios: sin alertas ni mensaje del crédito', () => {
  const { alertas, creditoPagadoAntes } = alertasDe({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' })
  assert.deepEqual(alertas, [])
  assert.equal(creditoPagadoAntes, null)
})

verificar('pérdida: con cuota del conductor de $250.000 (ingreso operativo $40.000/semana) aparece la alerta de pérdida con el resultado neto', () => {
  const p = { ...P, mesesCreditoVehiculo: 35, cuotaSemanalConductor: 250_000 }
  assert.deepEqual(validarParametros(p), [])
  const { r, alertas } = alertasDe(p)
  assert.ok(r.resultadoNeto < 0)
  assert.equal(alertas.at(-1), `La operación cierra el contrato con pérdida: el resultado neto (vista de rentabilidad) es ${cop(r.resultadoNeto)}.`)
})

verificar('ningún abono lo logra (abono desde el mes 34): la alerta lo dice y D6 da NO_ALCANZABLE_POR_CONTRATO', () => {
  const p = { ...P, mesInicioAbonoCapital: 34 }
  assert.equal(abonoMinimoContrato(p, 0).estado, 'NO_ALCANZABLE')
  const { alertas } = alertasDe(p)
  assert.ok(
    alertas[0].endsWith('Ningún abono dentro del máximo de 500,0% lo logra desde el mes 34: reduce el plazo del crédito a 35 meses o menos, o adelanta el mes de inicio del abono.'),
    alertas[0],
  )
  const d6 = calcularAbonoMinimo(p, 0, POLITICA_FINANCIERA_V1)
  assert.equal(d6.estado, 'NO_ALCANZABLE_POR_CONTRATO')
  assert.equal(T.abonoMinimo.noAlcanzableContrato(pct(5)), 'Ningún abono dentro del máximo de 500,0% deja el crédito pagado antes de terminar el contrato.')
})

// ===== C. Coherencia con el motor, D8 y D6 =====

verificar('las 5 alertas retiradas no aparecen nunca; la del crédito aparece si y solo si el crédito sobrevive al contrato (50 combinaciones)', () => {
  const retiradas = [/ingreso operativo de Humania por sí solo/, /\(vista de rentabilidad\), la inversión no se recupera/, /\(vista de flujo de caja\), la inversión no se recupera/, /continúa pagándose/, /Al cierre del contrato la caja/]
  for (const e of ESCENARIOS_LINEA_BASE) {
    for (const s of [0, 6]) {
      const p = e.parametros(P)
      const r = calcularMetricas(p, s)
      const { alertas } = construirAlertasOperacion(p, r, abonoMinimoContrato(p, s), F)
      for (const a of alertas) for (const re of retiradas) assert.ok(!re.test(a), `${e.id}: ${a}`)
      const tieneAlertaCredito = alertas.some((a) => a.startsWith('Por contrato, el crédito debe quedar pagado'))
      assert.equal(tieneAlertaCredito, p.modalidadAdquisicion === 'CREDITO' && r.creditoSobreviveAlContrato, e.id)
      assert.equal(evaluarPolitica(r, POLITICA_FINANCIERA_V1).cumpleContrato, !r.creditoSobreviveAlContrato, e.id)
    }
  }
})

verificar('D8: la referencia NO CUMPLE solo por el contrato (razón exacta); con abono 56,4 % vuelve a CUMPLE CON OBSERVACIONES', () => {
  const e = evaluarPolitica(calcularMetricas(P, 0), POLITICA_FINANCIERA_V1)
  assert.equal(e.veredicto, 'NO_CUMPLE')
  assert.ok(e.cumpleRoi && e.cumplePayback && !e.cumpleContrato)
  assert.deepEqual(e.incumplimientos, [{ tipo: 'CREDITO_DESPUES_DEL_CONTRATO', mesCredito: 72 }])
  assert.equal(
    textoIncumplimiento(e.incumplimientos[0], pct, 35),
    'El crédito termina en el mes 72, después de terminar el contrato (mes 35); por contrato debe quedar pagado antes.',
  )
  const conAbonoContrato = evaluarPolitica(calcularMetricas(conAbono(P, 0.564), 0), POLITICA_FINANCIERA_V1)
  assert.equal(conAbonoContrato.veredicto, 'CUMPLE_CON_OBSERVACIONES')
  assert.equal(evaluarPolitica(calcularMetricas({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0), POLITICA_FINANCIERA_V1).cumpleContrato, true)
})

verificar('D6: búsqueda binaria = exhaustiva con la regla del contrato, en los escenarios de crédito de la línea base', () => {
  let comparados = 0
  for (const e of ESCENARIOS_LINEA_BASE) {
    const p = e.parametros(P)
    if (p.modalidadAdquisicion !== 'CREDITO' || p.porcentajeAbonoCapital > 0) continue
    const r = calcularAbonoMinimo(p, 0, POLITICA_FINANCIERA_V1)
    const exhaustivo = abonoMinimoExhaustivo(p, 0, POLITICA_FINANCIERA_V1)
    if (r.estado === 'ENCONTRADO') assert.equal(Math.round(r.detalle.porcentaje * 1000), exhaustivo, e.id)
    else if (r.estado === 'YA_CUMPLE_SIN_ABONO') assert.equal(exhaustivo, 0, e.id)
    else assert.equal(exhaustivo, null, `${e.id}: ${r.estado}`)
    comparados++
  }
  assert.ok(comparados >= 6, `se compararon ${comparados} escenarios`)
})

verificar('las alertas no modifican parámetros ni resultados (solo presentación)', () => {
  const p = structuredClone(conAbono(P, 1))
  const r = calcularMetricas(p, 0)
  const antes = JSON.stringify(r)
  construirAlertasOperacion(p, r, abonoMinimoContrato(p, 0), F)
  assert.deepEqual(p, conAbono(P, 1))
  assert.equal(JSON.stringify(r), antes)
})

console.log(`\n${casos} casos de las alertas y de la regla del crédito dentro del contrato (KAI-42) verificados, todos OK.`)
