// Calculadora de Presupuesto (KAI-29) — verificación del motor contra el
// caso de negocio confirmado por Humania Go (spec.md Sección 20.8,
// AC-24/AC-25). Sin framework de pruebas en este proyecto (no hay
// precedente — indiceSer.ts tampoco tiene uno): se compila con `tsc`
// (dependencia ya existente, ninguna nueva) y se ejecuta con node.
//
//   npm run verificar:presupuesto   (desde web/)

import assert from 'node:assert/strict'
import { amortizarCreditoConAbono } from './amortizacion'
import { calcularAdquisicionActivo, calcularFlujoDeCaja } from './flujoDeCaja'
import { calcularMetricas } from './metricas'
import {
  PARAMETROS_REFERENCIA,
  PORCENTAJE_ABONO_CAPITAL_MAXIMO,
  equityConductorSemanal,
  flujoOperativoHumaniaSemanal,
  inversionInicial,
  recursosPropiosEfectivos,
  validarParametros,
} from './parametros'

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

verificar('parámetros de referencia son válidos (sin errores)', () => {
  assert.deepEqual(validarParametros(p), [])
})

verificar('inversión inicial = 39.041.500 (D1 CERRADA)', () => {
  assert.equal(inversionInicial(p), 39_041_500)
})

verificar('equity semanal = 210.000, operativo semanal = 240.000 (D3 CERRADA)', () => {
  assert.equal(equityConductorSemanal(p), 210_000)
  assert.equal(flujoOperativoHumaniaSemanal(p), 240_000)
})

verificar('adquisición: 152 semanas completas + saldo 80.000 (D10 CERRADA)', () => {
  const a = calcularAdquisicionActivo(p)
  assert.equal(a.semanasAdquisicionCompletas, 152)
  assert.equal(a.cuotaFinalAdquisicion, 80_000)
})

verificar('caso base (0 aplazatorias): Capas 1-3 cuadran exactas (spec.md 19.19.1)', () => {
  const flujo = calcularFlujoDeCaja(p, 0)
  assert.equal(flujo.duracionContratoSemanas, 152)
  assert.equal(flujo.flujoContractualTotal, 68_480_000)
  assert.equal(flujo.equityAdministradoAcumulado, 32_000_000)
  assert.equal(flujo.ingresoOperativoHumania, 36_480_000)
  assert.equal(flujo.ingresoAplazatoriasAcumulado, 0)
  assert.equal(
    flujo.flujoContractualTotal,
    flujo.equityAdministradoAcumulado + flujo.ingresoOperativoHumania,
    'flujoContractualTotal debe cuadrar exacto con equity + operativo (D14 cierra el desfase de 19.17-F)',
  )
})

verificar('la cuota final de adquisición NUNCA es ingreso operativo (D14 CERRADA)', () => {
  const flujo = calcularFlujoDeCaja(p, 0)
  // 152 semanas normales × 240.000 = 36.480.000 exacto — si los 80.000
  // se hubieran colado como ingreso operativo, esta cifra sería mayor.
  assert.equal(flujo.ingresoOperativoHumania, 152 * 240_000)
})

verificar('paybackOperativo: NO se alcanza dentro del contrato real; extrapolado en semana 163 (spec.md 19.18.2/19.19.2)', () => {
  const m = calcularMetricas(p, 0)
  assert.equal(m.paybackOperativo, null)
  assert.equal(m.paybackOperativoExtrapolado, 163)
})

verificar('paybackFinancieroRentabilidad extrapolado en semana 303 (spec.md 19.19.2)', () => {
  const m = calcularMetricas(p, 0)
  assert.equal(m.paybackFinancieroRentabilidad, null)
  assert.equal(m.paybackFinancieroRentabilidadExtrapolado, 303)
})

verificar('paybackFinancieroCaja extrapolado en semana 449 (spec.md 19.19.2, supuesto seguro)', () => {
  const m = calcularMetricas(p, 0)
  assert.equal(m.paybackFinancieroCaja, null)
  assert.equal(m.paybackFinancieroCajaExtrapolado, 449)
})

verificar('resultadoNeto y ROI al final del contrato ~ spec.md 19.19.3 (tolerancia por redondeo de meses)', () => {
  const m = calcularMetricas(p, 0)
  assert.ok(Math.abs(m.resultadoNeto - 15_970_496) < 50_000, `resultadoNeto=${m.resultadoNeto}`)
  assert.ok(Math.abs(m.roiSobreInversionTotal - 0.409) < 0.01, `roiSobreInversionTotal=${m.roiSobreInversionTotal}`)
  assert.notEqual(m.roiSobreRecursosPropios, null)
  assert.ok(Math.abs((m.roiSobreRecursosPropios as number) - 2.318) < 0.05, `roiSobreRecursosPropios=${m.roiSobreRecursosPropios}`)
})

verificar('resultadoNeto (rentabilidad) y flujoDeCajaNeto (caja) nunca son la misma cifra (D14, nunca mezclar)', () => {
  const m = calcularMetricas(p, 0)
  assert.notEqual(m.resultadoNeto, m.flujoDeCajaNeto)
  assert.ok(m.flujoDeCajaNeto < m.resultadoNeto, 'la vista de caja resta más (capital+interés) que la de rentabilidad (solo interés)')
})

verificar('semanas aplazatorias: 100% ingreso operativo, 0% equity, extienden el contrato (D11 CERRADA)', () => {
  const base = calcularFlujoDeCaja(p, 0)
  const conAplazatorias = calcularFlujoDeCaja(p, 5)
  assert.equal(conAplazatorias.duracionContratoSemanas, base.duracionContratoSemanas + 5)
  assert.equal(conAplazatorias.equityAdministradoAcumulado, base.equityAdministradoAcumulado, 'la aplazatoria no debe alterar el equity')
  assert.equal(conAplazatorias.ingresoAplazatoriasAcumulado, 5 * p.cuotaSemanaAplazatoria)
  assert.equal(conAplazatorias.ingresoOperativoHumania, base.ingresoOperativoHumania + 5 * p.cuotaSemanaAplazatoria)
})

verificar('validarParametros rechaza datos inválidos (AC-42, nunca 0 silencioso)', () => {
  const errores = validarParametros({ ...p, cuotaSemanalConductor: -1, porcentajeAtribucionAbonosConductor: 150 })
  assert.ok(errores.length >= 2)
})

verificar('roiSobreRecursosPropios es null cuando capitalPropioDeclarado=0 (100% financiado, nunca Infinity/NaN silencioso)', () => {
  const m = calcularMetricas({ ...p, capitalPropioDeclarado: 0 }, 0)
  assert.equal(m.roiSobreRecursosPropios, null)
  assert.ok(Number.isFinite(m.roiSobreInversionTotal), 'roiSobreInversionTotal sí debe seguir siendo un número')
})

verificar('otrosCostosHumaniaAnuales se aplica de forma consistente en el snapshot final (revisión del motor, corrige inconsistencia)', () => {
  const base = calcularMetricas(p, 0)
  const conOtrosCostos = calcularMetricas({ ...p, otrosCostosHumaniaAnuales: 1_000_000 }, 0)
  // El contrato dura ~35 meses (152 semanas / 4,333) => 2 ocurrencias adicionales de "otrosCostos" (mes 12 y mes 24, ademas de la de mes 0)
  // ocurrencias = floor(mesEntero/12) + 1 = floor(35/12) + 1 = 2 + 1 = 3
  const diferenciaEsperada = 3 * 1_000_000
  assert.ok(
    Math.abs(base.resultadoNeto - conOtrosCostos.resultadoNeto - diferenciaEsperada) < 1,
    `base=${base.resultadoNeto} conOtrosCostos=${conOtrosCostos.resultadoNeto} diferenciaEsperada=${diferenciaEsperada}`,
  )
})

verificar('modalidad RECURSOS_PROPIOS: inversión inicial sin crédito ni financiación del seguro (pedido de Humania Go, 2026-09-01)', () => {
  const pRecursosPropios = { ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS' as const }
  const esperado = p.precioCompra + p.traspaso + p.principalFinanciacionSeguro + p.otrosCostosInicialesRecursosPropios + p.soatAnual + p.tecnomecanicaAnual + p.impuestosAnuales
  assert.equal(inversionInicial(pRecursosPropios), esperado)
  assert.equal(recursosPropiosEfectivos(pRecursosPropios), esperado, 'en RECURSOS_PROPIOS, el 100% de la inversión inicial es capital propio')
})

verificar('modalidad RECURSOS_PROPIOS: sin intereses, sin cuota bancaria — resultadoNeto === flujoDeCajaNeto (sin deuda no hay distinción rentabilidad/caja)', () => {
  const pRecursosPropios = { ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS' as const }
  const m = calcularMetricas(pRecursosPropios, 0)
  assert.equal(m.costosFinancierosRentabilidad, 0)
  assert.equal(m.costosFinancierosCaja, 0)
  assert.equal(m.financiacionBancaria, 0)
  assert.equal(m.principalFinanciacionSeguro, 0)
  assert.equal(m.resultadoNeto, m.flujoDeCajaNeto)
})

verificar('margenVentaActivo = valorVentaContractualActivo - precioCompra (D3 refinada, spec.md Sección 23)', () => {
  const pConMargen = { ...p, valorVentaContractualActivo: 34_000_000 } // 2M por encima del precioCompra (32M)
  const m = calcularMetricas(pConMargen, 0)
  assert.equal(m.margenVentaActivo, 2_000_000)
})

verificar('paybackFlujoContractualCompleto usa el flujo de 450.000/semana, nunca solo el operativo de 240.000 (D3 refinada)', () => {
  // Escenario con margen de venta claro: activo comprado en 24M, vendido en 25.5M (121 semanas de adquisición)
  const pMargen = {
    ...p,
    modalidadAdquisicion: 'RECURSOS_PROPIOS' as const,
    precioCompra: 24_000_000,
    valorVentaContractualActivo: 25_500_000,
  }
  const m = calcularMetricas(pMargen, 0)
  const flujo = m.flujo
  assert.equal(flujo.duracionContratoSemanas, 121)
  // El payback usando flujo completo debe alcanzarse en una semana MENOR (o igual) que el operativo puro
  const inversion = m.inversionInicialTotal
  const semanaEsperada = Math.min(
    flujo.serieFlujoContractualAcumulado.findIndex((v) => v >= inversion) + 1,
    flujo.serieFlujoContractualExtrapolado.length,
  )
  assert.ok(semanaEsperada > 0, 'debe encontrar una semana de cruce dentro del horizonte de prueba')
  assert.ok(
    (m.paybackFlujoContractualCompleto ?? m.paybackFlujoContractualCompletoExtrapolado ?? Infinity) <=
      (m.paybackOperativo ?? m.paybackOperativoExtrapolado ?? Infinity),
    'el payback de flujo completo nunca debe ser más lento que el operativo puro (incluye más ingreso, nunca menos)',
  )
})

verificar('flujoContractualTotal coincide exacto con el último valor real de serieFlujoContractualAcumulado', () => {
  const m = calcularMetricas(p, 0)
  const ultimoReal = m.flujo.serieFlujoContractualAcumulado[m.flujo.duracionContratoSemanas - 1]
  assert.equal(ultimoReal, m.flujo.flujoContractualTotal)
})

verificar('amortizarCreditoConAbono con 0% se comporta igual que sin abono (mismo plazo, mismo interés total)', () => {
  const conAbono = calcularMetricas({ ...p, porcentajeAbonoCapital: 0 }, 0)
  assert.equal(conAbono.amortizacionConAbono, null, 'porcentajeAbonoCapital=0 no debe activar el cronograma con abono')
})

verificar('abono a capital (30%, desde la cuota 3) reduce el plazo y ahorra intereses — mecánica auditada del Excel', () => {
  const pConAbono = { ...p, porcentajeAbonoCapital: 0.3, mesInicioAbonoCapital: 3 }
  const m = calcularMetricas(pConAbono, 0)
  const abono = m.amortizacionConAbono
  assert.ok(abono !== null)
  assert.ok(abono!.mesesReales < p.mesesContrato, 'el abono debe reducir el plazo real por debajo del original')
  assert.ok(abono!.mesesAhorrados > 0)
  assert.ok(abono!.ahorroIntereses > 0)
  // Reconciliación: interesTotalSinAbono debe coincider con el total de la amortización normal (mismo crédito)
  const normal = m.amortizacionNormal!
  assert.ok(Math.abs(abono!.interesTotalSinAbono - normal.interesTotalMeses) < 1, 'interesTotalSinAbono debe coincidir con el interés total de la amortización normal')
  // Las 2 primeras cuotas no llevan abono (mesInicioAbonoCapital=3)
  assert.equal(abono!.cronograma[0].abonoExtra, 0)
  assert.equal(abono!.cronograma[1].abonoExtra, 0)
  assert.ok(abono!.cronograma[2].abonoExtra > 0, 'la cuota 3 sí debe llevar abono')
})

verificar('con abono a capital activo, el payback financiero se acelera (nunca se atrasa) respecto al escenario sin abono', () => {
  const sinAbono = calcularMetricas(p, 0)
  const conAbono = calcularMetricas({ ...p, porcentajeAbonoCapital: 0.5, mesInicioAbonoCapital: 1 }, 0)
  const paybackSinAbono = sinAbono.paybackFinancieroRentabilidadExtrapolado ?? Infinity
  const paybackConAbono = conAbono.paybackFinancieroRentabilidadExtrapolado ?? Infinity
  assert.ok(paybackConAbono <= paybackSinAbono, 'el abono nunca debe atrasar el payback financiero (menos interés acumulado a cada mes)')
})

// ===== Abono a capital hasta 500% (2026-09-19) =====
// Antes el tope era 100%. En la operación real se abona 200%, 300% o 500% de
// la cuota. Estos casos demuestran que el motor sigue siendo correcto con
// porcentajes > 100%: el crédito se cancela exacto, nunca queda saldo
// negativo, el abono se recorta al saldo restante, y toda la contabilidad
// (intereses, total pagado, ahorro, costos en metricas.ts) sigue cuadrando.

const pctsAltos = [1, 2, 3, 5]
const mesesInicio = [1, 3, 12]

verificar('validarParametros: el tope del abono a capital es 500% (0 y 5 válidos; -0,01, 5,01 y NaN rechazados)', () => {
  assert.equal(PORCENTAJE_ABONO_CAPITAL_MAXIMO, 5)
  for (const ok of [0, 0.3, 1, 2, 3, 4.99, 5]) {
    assert.deepEqual(validarParametros({ ...p, porcentajeAbonoCapital: ok }), [], `${ok} debe ser válido`)
  }
  for (const mal of [-0.01, 5.01, 6, 100, Number.NaN]) {
    const e = validarParametros({ ...p, porcentajeAbonoCapital: mal })
    assert.equal(e.length, 1, `${mal} debe ser rechazado con exactamente 1 error`)
    assert.match(e[0], /porcentajeAbonoCapital/)
    assert.match(e[0], /500%/)
  }
})

verificar('abono 100%-500%: el crédito se cancela exacto, sin saldos negativos ni NaN, en cualquier mes de inicio', () => {
  for (const pct of pctsAltos) {
    for (const mesInicioAbonoCapital of mesesInicio) {
      const a = amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, pct, mesInicioAbonoCapital)
      const etiqueta = `pct=${pct * 100}% inicio=${mesInicioAbonoCapital}`
      const ultimo = a.cronograma[a.cronograma.length - 1]
      assert.equal(ultimo.saldoFinal, 0, `${etiqueta}: el saldo final debe ser 0`)
      assert.ok(a.mesesReales >= 1 && a.mesesReales <= p.mesesContrato, `${etiqueta}: mesesReales fuera de rango`)
      assert.equal(a.mesesAhorrados, p.mesesContrato - a.mesesReales)
      // Capital total pagado = principal (tolerancia de 1 peso, la misma que usa el motor para "saldo cero")
      const capitalPagado = a.cronograma.reduce((acc, c) => acc + c.capitalTotal, 0)
      assert.ok(Math.abs(capitalPagado - p.principalCreditoBancario) < 1, `${etiqueta}: capital pagado ${capitalPagado} != principal`)
      let saldoPrevio = p.principalCreditoBancario
      for (const c of a.cronograma) {
        for (const [k, v] of Object.entries(c)) assert.ok(Number.isFinite(v), `${etiqueta}: mes ${c.mes} ${k} no es finito`)
        assert.ok(c.saldoFinal >= 0, `${etiqueta}: saldo negativo en el mes ${c.mes}`)
        assert.ok(c.abonoExtra >= 0, `${etiqueta}: abono negativo en el mes ${c.mes}`)
        assert.ok(c.abonoExtra <= pct * a.cuotaMensualOriginal + 1e-6, `${etiqueta}: abono del mes ${c.mes} excede ${pct * 100}% de la cuota`)
        assert.ok(c.abonoExtra === 0 || c.mes >= mesInicioAbonoCapital, `${etiqueta}: abono antes del mes de inicio (mes ${c.mes})`)
        assert.ok(Math.abs(c.saldoInicial - saldoPrevio) < 1e-6, `${etiqueta}: el saldo inicial del mes ${c.mes} no encadena con el final del anterior`)
        assert.ok(Math.abs(c.capitalTotal - (c.capitalOrdinario + c.abonoExtra)) < 1e-6)
        assert.ok(Math.abs(c.pagoTotal - (c.interes + c.capitalTotal)) < 1e-6)
        assert.ok(Math.abs(c.saldoFinal - (c.saldoInicial - c.capitalTotal)) < 1 + 1e-6, `${etiqueta}: saldo final del mes ${c.mes} no cuadra`)
        saldoPrevio = c.saldoFinal
      }
    }
  }
})

verificar('abono 500% desde la cuota 1: coincide con la fórmula cerrada S_n = P(1+i)^n − 6C((1+i)^n − 1)/i (verificación independiente del bucle)', () => {
  const pct = 5
  const a = amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, pct, 1)
  const i = Math.pow(1 + p.tasaEfectivaAnualCredito, 1 / 12) - 1
  const C = a.cuotaMensualOriginal
  // Reconstrucción independiente de la cuota francesa (no reutiliza el código del motor)
  const cuotaIndependiente = (p.principalCreditoBancario * i) / (1 - Math.pow(1 + i, -p.mesesContrato))
  assert.ok(Math.abs(C - cuotaIndependiente) < 1e-6)
  // Cada mes completo (no el último, que se recorta al saldo): capital ordinario C−interés + abono 5C
  // → saldo_n = saldo_{n-1}(1+i) − (1+pct)C, cuya solución cerrada es la de arriba.
  const factor = 1 + pct
  for (const c of a.cronograma.slice(0, -1)) {
    const cerrada = p.principalCreditoBancario * Math.pow(1 + i, c.mes) - factor * C * ((Math.pow(1 + i, c.mes) - 1) / i)
    assert.ok(Math.abs(c.saldoFinal - cerrada) < 0.01, `mes ${c.mes}: motor ${c.saldoFinal} vs cerrada ${cerrada}`)
    assert.ok(Math.abs(c.abonoExtra - pct * C) < 1e-6, `mes ${c.mes}: debe abonar exactamente 500% de la cuota`)
  }
  // El último mes se recorta: abona menos que 500% de la cuota y deja saldo exactamente 0
  const ultimo = a.cronograma[a.cronograma.length - 1]
  assert.ok(ultimo.abonoExtra < pct * C, 'el último abono debe recortarse al saldo restante')
  assert.equal(ultimo.saldoFinal, 0)
})

verificar('abono a capital: más porcentaje nunca alarga el plazo ni sube el interés total (monotonía, 0%-500%)', () => {
  let mesesPrevios = Infinity
  let interesPrevio = Infinity
  for (const pct of [0.1, 0.5, 1, 1.5, 2, 3, 4, 5]) {
    const a = amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, pct, 3)
    assert.ok(a.mesesReales <= mesesPrevios, `pct=${pct * 100}%: el plazo real no debe crecer`)
    assert.ok(a.interesTotalConAbono <= interesPrevio + 1e-6, `pct=${pct * 100}%: el interés total no debe crecer`)
    mesesPrevios = a.mesesReales
    interesPrevio = a.interesTotalConAbono
  }
})

verificar('abono 500%: la contabilidad del resumen cuadra (interés + principal = total pagado; ahorro = sin abono − con abono; suma de pagos = total pagado)', () => {
  const a = amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, 5, 3)
  assert.ok(Math.abs(a.totalPagado - (a.interesTotalConAbono + p.principalCreditoBancario)) < 1e-6)
  assert.ok(Math.abs(a.ahorroIntereses - (a.interesTotalSinAbono - a.interesTotalConAbono)) < 1e-6)
  assert.ok(a.ahorroIntereses > 0)
  const sumaPagos = a.cronograma.reduce((acc, c) => acc + c.pagoTotal, 0)
  assert.ok(Math.abs(sumaPagos - a.totalPagado) < 1, `suma de pagos ${sumaPagos} != total pagado ${a.totalPagado}`)
  const sumaAbonos = a.cronograma.reduce((acc, c) => acc + c.abonoExtra, 0)
  assert.ok(Math.abs(sumaAbonos - a.totalAbonosExtra) < 1e-6)
})

verificar('abono 500% en casos límite: inicio tras el último mes y tasa baja no rompen nada', () => {
  // mes de inicio mayor que el plazo → nunca aplica, idéntico a no abonar
  const sinAplicar = amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, 5, p.mesesContrato + 10)
  assert.equal(sinAplicar.totalAbonosExtra, 0)
  assert.equal(sinAplicar.mesesReales, p.mesesContrato)
  assert.equal(sinAplicar.cronograma[sinAplicar.cronograma.length - 1].saldoFinal, 0)
  // Crédito de 3 meses (vale ~2,8 cuotas) con abono de 500% desde la cuota 1: el abono se recorta y se cancela en el mes 1
  const corto = amortizarCreditoConAbono(1_000_000, 0.1, 3, 5, 1)
  assert.equal(corto.mesesReales, 1)
  assert.equal(corto.cronograma[0].saldoFinal, 0)
  assert.ok(Math.abs(corto.cronograma[0].capitalTotal - 1_000_000) < 1)
  assert.ok(corto.cronograma[0].abonoExtra < 5 * corto.cuotaMensualOriginal, 'el abono debe recortarse al saldo, no llegar a 500% de la cuota')
  // Crédito de 12 meses (vale ~11,4 cuotas): 500% no alcanza en un solo mes → 2 meses, y el 2º se recorta
  const doce = amortizarCreditoConAbono(1_000_000, 0.1, 12, 5, 1)
  assert.equal(doce.mesesReales, 2)
  assert.equal(doce.cronograma[1].saldoFinal, 0)
  assert.ok(Math.abs(doce.cronograma[0].abonoExtra - 5 * doce.cuotaMensualOriginal) < 1e-6, 'el mes 1 abona exactamente 500% de la cuota')
})

verificar('calcularMetricas con abono 500%: sin NaN, costos financieros = intereses/pagos reales del cronograma, payback nunca peor que sin abono', () => {
  const sinAbono = calcularMetricas(p, 0)
  for (const inicio of [1, 3]) {
    const conAbono = calcularMetricas({ ...p, porcentajeAbonoCapital: 5, mesInicioAbonoCapital: inicio }, 0)
    const a = conAbono.amortizacionConAbono
    assert.ok(a !== null)
    // El contrato dura 152 semanas (~35 meses) y con 500% el crédito ya está pagado antes: el costo al cierre es el total del cronograma
    assert.ok(a!.mesesReales < 35)
    const seguroMeses = Math.floor(conAbono.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno))
    const seguroRent = (p.costoFinancieroSeguroEstimado / p.mesesContrato) * seguroMeses
    const seguroCaja = ((p.principalFinanciacionSeguro + p.costoFinancieroSeguroEstimado) / p.mesesContrato) * seguroMeses
    assert.ok(Math.abs(conAbono.costosFinancierosRentabilidad - (a!.interesTotalConAbono + seguroRent)) < 1e-4)
    assert.ok(Math.abs(conAbono.costosFinancierosCaja - (a!.totalPagado + seguroCaja)) < 1e-4)
    // El abono reduce el interés (rentabilidad) y mejora el resultado neto
    assert.ok(conAbono.costosFinancierosRentabilidad < sinAbono.costosFinancierosRentabilidad)
    assert.ok(conAbono.resultadoNeto > sinAbono.resultadoNeto)
    for (const [k, v] of Object.entries(conAbono)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} no es finito`)
    }
    for (const serie of [conAbono.flujo.serieIngresoOperativoAcumulado, conAbono.flujo.serieFlujoContractualAcumulado]) {
      assert.ok(serie.every(Number.isFinite), 'las series semanales no deben contener NaN/Infinity')
    }
    const pbCon = conAbono.paybackFinancieroRentabilidadExtrapolado ?? Infinity
    const pbSin = sinAbono.paybackFinancieroRentabilidadExtrapolado ?? Infinity
    assert.ok(pbCon <= pbSin, 'el abono nunca debe atrasar el payback financiero')
  }
})

console.log(`\n${casos} casos verificados, todos OK.`)
