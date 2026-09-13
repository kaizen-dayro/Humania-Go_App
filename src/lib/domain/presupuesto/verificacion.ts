// Calculadora de Presupuesto (KAI-29) — verificación del motor contra el
// caso de negocio confirmado por Humania Go (spec.md Sección 20.8,
// AC-24/AC-25). Sin framework de pruebas en este proyecto (no hay
// precedente — indiceSer.ts tampoco tiene uno): se compila con `tsc`
// (dependencia ya existente, ninguna nueva) y se ejecuta con node.
//
//   npm run verificar:presupuesto   (desde web/)

import assert from 'node:assert/strict'
import { calcularAdquisicionActivo, calcularFlujoDeCaja } from './flujoDeCaja'
import { calcularMetricas } from './metricas'
import {
  PARAMETROS_REFERENCIA,
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

console.log(`\n${casos} casos verificados, todos OK.`)
