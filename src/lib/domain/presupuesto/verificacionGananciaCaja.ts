// KAI-43 — Verificación de la ganancia de caja del contrato (spec.md 43).
//
// Cada escenario se calcula por DOS caminos y deben coincidir al centavo:
//   1. El módulo `calcularGananciaCaja` (resultado del motor + identidad de control).
//   2. Un cálculo independiente, escrito aquí como flujo de caja a mano: suma de las filas del cronograma del
//      banco dentro del contrato + saldo pendiente, renovaciones con la fórmula de periodicidad, seguro con
//      fórmulas propias de cada modo y recursos propios leídos de los parámetros.
// Además: 50 combinaciones de la línea base (× 3 modos de seguro), 50 combinaciones aleatorias con semilla fija
// y casos con valores literales (las pruebas de Dayro).

import assert from 'node:assert/strict'
import { conAbono } from './abonoMinimo'
import { calcularGananciaCaja, deCada100 } from './gananciaCaja'
import { ESCENARIOS_LINEA_BASE } from './lineaBase'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, validarParametros, type ModoSeguro, type ParametrosPresupuesto } from './parametros'
import type { SeguroDigitadoParametros } from './seguroDigitado'
import { TEXTOS_APROBADOS as T } from './textosInterfaz'

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
const D: SeguroDigitadoParametros = { valorPoliza: 1_711_586, pagoInicial: 262_557, valorFinanciado: 1_454_848, numeroCuotas: 10, valorCuota: 155_839 }
const conModo = (p: ParametrosPresupuesto, modo: ModoSeguro): ParametrosPresupuesto => ({ ...p, seguro: { ...p.seguro, modo, digitado: D } })
const cop = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`
const TOL = 1e-6

/** Cálculo independiente, como flujo de caja, sin usar el módulo que se prueba. */
function gananciaIndependiente(p: ParametrosPresupuesto, semanas: number) {
  const r = calcularMetricas(p, semanas)
  const mes = Math.floor(r.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno))
  const esCredito = p.modalidadAdquisicion === 'CREDITO'

  // Banco: filas del cronograma pagadas dentro del contrato + el saldo que el contrato exige pagar al terminar.
  let banco = 0
  let mesFinCredito: number | null = null
  if (esCredito && r.amortizacionConAbono) {
    const filas = r.amortizacionConAbono.cronograma
    for (const f of filas) if (f.mes <= mes) banco += f.pagoTotal
    banco += filas[mes - 1]?.saldoFinal ?? 0
    mesFinCredito = r.amortizacionConAbono.mesesReales
  } else if (esCredito && r.amortizacionNormal) {
    const filas = r.amortizacionNormal.cronograma
    for (const f of filas) if (f.mes <= mes) banco += f.cuota
    banco += filas[mes - 1]?.saldo ?? 0
    mesFinCredito = p.mesesCreditoVehiculo
  }

  // Gastos del vehículo: año 1 + renovaciones ⌊mes ÷ periodicidad⌋ × monto.
  const gastos =
    p.soatAnual + p.tecnomecanicaAnual + p.impuestosAnuales +
    Math.floor(mes / p.soatPeriodicidadMeses) * p.soatAnual +
    Math.floor(mes / p.tecnomecanicaPeriodicidadMeses) * p.tecnomecanicaAnual +
    Math.floor(mes / p.impuestosPeriodicidadMeses) * p.impuestosAnuales
  const otros = p.otrosCostosHumaniaAnuales === 0 ? 0 : (Math.floor(mes / p.mesesPorAno) + 1) * p.otrosCostosHumaniaAnuales

  // Seguro, por modo.
  let seguro = 0
  const modo = p.seguro.modo
  if (modo === 'LEGACY_NO_CONFIRMADO') {
    const l = p.seguro.legacy
    seguro = l.principalFinanciacion + (esCredito ? (l.costoFinancieroEstimado / l.plazoMeses) * Math.min(mes, l.plazoMeses) : 0)
  } else if (modo === 'DIGITADO') {
    const d = p.seguro.digitado as SeguroDigitadoParametros
    if (!esCredito) {
      seguro = d.valorPoliza + Math.floor(mes / p.mesesPorAno) * d.valorPoliza
    } else {
      seguro = d.pagoInicial + d.valorFinanciado
      const costoPorCuota = (d.numeroCuotas * d.valorCuota - d.valorFinanciado) / d.numeroCuotas
      for (let k = 0; k * p.mesesPorAno <= mes; k++) {
        const inicio = k * p.mesesPorAno
        const financiada = k === 0 || inicio < (mesFinCredito as number)
        if (k >= 1) seguro += financiada ? d.pagoInicial + d.valorFinanciado : d.valorPoliza
        if (financiada) {
          const cuotas = Math.max(0, Math.min(d.numeroCuotas, Math.min(mes, mesFinCredito as number) - inicio))
          seguro += cuotas * costoPorCuota
        }
      }
    }
  }

  const recursosPropios = esCredito ? p.capitalPropioDeclarado : p.precioCompra + p.traspaso + p.otrosCostosInicialesRecursosPropios
  const ganancia = r.flujo.flujoContractualTotal - banco - gastos - otros - seguro - recursosPropios
  return { r, banco, gastos, otros, seguro, recursosPropios, ganancia }
}

/** Compara el módulo con el cálculo independiente, componente por componente, y la identidad de control. */
function comparar(p: ParametrosPresupuesto, semanas: number, etiqueta: string) {
  const ind = gananciaIndependiente(p, semanas)
  const g = calcularGananciaCaja(p, ind.r)
  const cerca = (a: number, b: number, que: string) => assert.ok(Math.abs(a - b) < TOL, `${etiqueta} ${que}: módulo ${a} vs independiente ${b}`)
  cerca(g.creditoCapital + g.creditoIntereses, ind.banco, 'banco')
  cerca(g.gastosVehiculo, ind.gastos, 'gastos')
  cerca(g.otrosCostos, ind.otros, 'otros')
  cerca(g.seguro, ind.seguro, 'seguro')
  cerca(g.recursosPropios, ind.recursosPropios, 'recursos propios')
  cerca(g.ganancia, ind.ganancia, 'ganancia')
  cerca(g.ganancia, ind.r.resultadoNeto + ind.r.flujo.equityAdministradoAcumulado - ind.r.inversionInicialTotal, 'identidad')
  cerca(g.diferenciaConResultadoNeto, ind.r.inversionInicialTotal - ind.r.flujo.equityAdministradoAcumulado, 'diferencia')
  const reparto = deCada100(g)
  if (reparto) assert.equal(Object.values(reparto).reduce((s, v) => s + v, 0), 100, `${etiqueta} reparto suma 100`)
  else assert.ok(g.ganancia < 0, `${etiqueta} sin reparto solo con pérdida`)
  return g
}

// ===== A. Casos con valores literales (pruebas de Dayro, seguro digitado con la cotización, abono desde el mes 3) =====

verificar('prueba de Dayro, abono 350 %: $68.480.000 − 27.329.323 − 3.921.100 − 4.107.000 − 5.244.119 − 6.890.000 = $20.988.458', () => {
  const g = comparar(conAbono(conModo(P, 'DIGITADO'), 3.5), 0, '350%')
  assert.deepEqual(
    [g.flujoConductor, g.creditoCapital, g.creditoIntereses, g.gastosVehiculo, g.seguro, g.recursosPropios, g.otrosCostos].map(cop),
    ['$68.480.000', '$27.329.323', '$3.921.100', '$4.107.000', '$5.244.119', '$6.890.000', '$0'],
  )
  assert.equal(cop(g.ganancia), '$20.988.458')
  assert.equal(cop(g.gananciaPorMes), '$599.670')
  assert.equal(cop(g.diferenciaConResultadoNeto), '$5.305.728')
  assert.equal(g.saldoCreditoPendiente, 0)
  assert.equal(T.gananciaCaja.millones('$21,0'), '$21,0 millones')
})

verificar('prueba de Dayro, abono 350 %: "de cada $100" = banco 45, SOAT y otros 6, seguro 8, recursos propios 10, ganancia 31 (suma 100)', () => {
  const g = calcularGananciaCaja(conAbono(conModo(P, 'DIGITADO'), 3.5), calcularMetricas(conAbono(conModo(P, 'DIGITADO'), 3.5), 0))
  // Exactos: 45,63 / 6,00 / 7,66 / 10,06 / 30,65 → pisos 45/6/7/10/30 (98) + los 2 mayores restos (seguro, ganancia).
  assert.deepEqual(deCada100(g), { banco: 45, gastos: 6, seguro: 8, recursosPropios: 10, ganancia: 31 })
})

verificar('prueba de Dayro, abono 240 %: ganancia $19.974.745 (intereses $4.897.931)', () => {
  const g = comparar(conAbono(conModo(P, 'DIGITADO'), 2.4), 0, '240%')
  assert.equal(cop(g.creditoIntereses), '$4.897.931')
  assert.equal(cop(g.ganancia), '$19.974.745')
})

verificar('prueba de Dayro, abono 140 %: ganancia $18.031.752 (intereses $6.778.800)', () => {
  const g = comparar(conAbono(conModo(P, 'DIGITADO'), 1.4), 0, '140%')
  assert.equal(cop(g.creditoIntereses), '$6.778.800')
  assert.equal(cop(g.ganancia), '$18.031.752')
})

verificar('abono mínimo 56,4 %: ganancia $13.480.608 (el que más intereses paga entre los que cumplen el contrato)', () => {
  const g = comparar(conAbono(conModo(P, 'DIGITADO'), 0.564), 0, '56,4%')
  assert.equal(cop(g.ganancia), '$13.480.608')
})

verificar('referencia sin abono (no cumple el contrato): ganancia $8.962.056 con saldo pendiente $18.681.475 incluido en el capital', () => {
  const g = comparar(P, 0, 'referencia')
  assert.equal(cop(g.ganancia), '$8.962.056')
  assert.equal(cop(g.saldoCreditoPendiente), '$18.681.475')
  assert.equal(g.creditoCapital, P.principalCreditoBancario, 'el capital va completo')
  assert.equal(
    T.gananciaCaja.notaSaldo(cop(g.saldoCreditoPendiente)),
    'Incluye $18.681.475 de saldo del crédito que el contrato exige pagar antes de terminar.',
  )
})

verificar('Recursos propios: sin crédito; recursos propios = precio + traspaso ($32.452.500); ganancia $28.467.323', () => {
  const g = comparar({ ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }, 0, 'RP')
  assert.equal(g.creditoCapital + g.creditoIntereses, 0)
  assert.equal(g.recursosPropios, 32_452_500)
  assert.equal(cop(g.ganancia), '$28.467.323')
})

verificar('pérdida: cuota del conductor $250.000 → ganancia negativa, sin "de cada $100"', () => {
  const p = { ...P, mesesCreditoVehiculo: 35, cuotaSemanalConductor: 250_000 }
  assert.deepEqual(validarParametros(p), [])
  const g = comparar(p, 0, 'pérdida')
  assert.ok(g.ganancia < 0)
  assert.equal(deCada100(g), null)
})

verificar('otros costos de Humania ($1.200.000/año): se descuentan (3 ocurrencias en 35 meses) y el cálculo sigue cuadrando', () => {
  const g = comparar({ ...P, otrosCostosHumaniaAnuales: 1_200_000 }, 0, 'otros')
  assert.equal(g.otrosCostos, 3 * 1_200_000)
})

verificar('sin seguro y seguro por referencia histórica: el seguro se descuenta según el modo', () => {
  assert.equal(comparar(conModo(P, 'SIN_SEGURO'), 0, 'sin seguro').seguro, 0)
  // Referencia histórica en Crédito: capital 3.453.177 + 2.500.000 × 35/72.
  assert.ok(Math.abs(comparar(P, 0, 'legacy').seguro - (3_453_177 + (2_500_000 * 35) / 72)) < TOL)
})

verificar('textos aprobados de la tarjeta', () => {
  const G = T.gananciaCaja
  assert.equal(G.titulo, 'Ganancia de caja del contrato')
  assert.equal(G.tituloPerdida, 'Pérdida de caja del contrato')
  assert.equal(G.explicacion, 'Lo que le queda a Humania al terminar el contrato, después de pagar el crédito, los gastos y el seguro, y de recuperar sus recursos propios.')
  assert.equal(G.deCada100Titulo, 'De cada $100 que paga el conductor')
  assert.deepEqual(G.partes, { banco: 'Banco', gastos: 'SOAT y otros', seguro: 'Seguro', recursosPropios: 'Recursos propios', ganancia: 'Ganancia' })
  assert.equal(G.filas.recursosPropios, '− Recursos propios que Humania puso al comprar el activo')
  assert.equal(
    G.notaDiferencia('$5.305.728'),
    'Es $5.305.728 menor que el resultado neto: esa parte de la inversión inicial (traspaso, GPS, SOAT y seguro del año 1) no la paga el conductor.',
  )
})

verificar('solo presentación: calcular la ganancia no modifica parámetros ni resultados', () => {
  const p = structuredClone(conAbono(conModo(P, 'DIGITADO'), 2))
  const r = calcularMetricas(p, 0)
  const antes = JSON.stringify(r)
  calcularGananciaCaja(p, r)
  assert.deepEqual(p, conAbono(conModo(P, 'DIGITADO'), 2))
  assert.equal(JSON.stringify(r), antes)
})

// ===== B. Las 50 combinaciones de la línea base, cada una con los 3 modos de seguro =====

for (const e of ESCENARIOS_LINEA_BASE) {
  for (const semanas of [0, 6]) {
    verificar(`línea base ${e.id}|aplaz${semanas}: módulo = cálculo independiente (referencia histórica, digitado y sin seguro)`, () => {
      for (const modo of ['LEGACY_NO_CONFIRMADO', 'DIGITADO', 'SIN_SEGURO'] as const) comparar(conModo(e.parametros(P), modo), semanas, `${e.id}|${semanas}|${modo}`)
    })
  }
}

// ===== C. 50 combinaciones aleatorias válidas (semilla fija: las mismas en cada ejecución de CI) =====

function generador(semilla: number) {
  let s = semilla
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
}

verificar('50 combinaciones aleatorias válidas (plazo, tasa, abono, inicio, cuota, seguro, modalidad, aplazatorias): módulo = cálculo independiente', () => {
  const azar = generador(43)
  const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
  let probadas = 0
  let intentos = 0
  while (probadas < 50 && intentos < 500) {
    intentos++
    const p: ParametrosPresupuesto = conModo(
      {
        ...P,
        modalidadAdquisicion: azar() < 0.2 ? 'RECURSOS_PROPIOS' : 'CREDITO',
        mesesCreditoVehiculo: entre(12, 84),
        tasaEfectivaAnualCredito: entre(10, 40) / 100,
        porcentajeAbonoCapital: azar() < 0.3 ? 0 : entre(1, 500) / 100,
        mesInicioAbonoCapital: entre(1, 24),
        cuotaSemanalConductor: entre(400, 600) * 1000,
        otrosCostosHumaniaAnuales: azar() < 0.3 ? entre(1, 20) * 100_000 : 0,
      },
      (['LEGACY_NO_CONFIRMADO', 'DIGITADO', 'SIN_SEGURO'] as const)[entre(0, 2)],
    )
    if (validarParametros(p).length > 0) continue
    comparar(p, entre(0, 6), `aleatoria ${probadas}`)
    probadas++
  }
  assert.equal(probadas, 50, `solo ${probadas} combinaciones válidas en ${intentos} intentos`)
})

console.log(`\n${casos} casos de la ganancia de caja del contrato (KAI-43) verificados, todos OK.`)
