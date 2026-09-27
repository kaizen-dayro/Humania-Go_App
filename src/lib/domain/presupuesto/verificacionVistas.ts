// KAI-29 — Verificación de D7, modelos de vista de las visualizaciones (spec.md 39.3 y 39.8.3).

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { conAbono } from './abonoMinimo'
import { ESCENARIOS_LINEA_BASE } from './lineaBase'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, conSeguroLegacy, seguroEfectivo, type ParametrosPresupuesto } from './parametros'
import { POLITICA_FINANCIERA_V1 } from './politicaFinanciera'
import { TEXTOS_APROBADOS as T } from './textosInterfaz'
import { construirVistaSeguroSimulacion } from './vistaSeguroSimulacion'
import { GRILLA_SENSIBILIDAD_ABONO, modeloGraficoFlujo, modeloGraficoSaldo, semanaDeCruceDibujada, sensibilidadAbono } from './vistasGraficos'
import { cotizacionDesdeRegistro, type FinanciacionSeguroRegistro } from '../seguros/adaptador'
import { construirVistaCotizacionSeguro, type FilaVistaCotizacion } from '../seguros/vistaCotizacion'

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

// ===== KAI-40: tarjeta "Seguro en esta simulación" (solo presentación) =====

const REGISTRO_COTIZACION_KAI40: FinanciacionSeguroRegistro = {
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
  estado_datos_campos: {
    valor_financiado: 'CONFIRMADO_POR_COTIZACION',
    pago_inicial: 'CONFIRMADO_POR_COTIZACION',
    gravamen_4x1000: 'CONFIRMADO_POR_COTIZACION',
    numero_cuotas: 'CONFIRMADO_POR_COTIZACION',
    cuota_valor: 'CONFIRMADO_POR_COTIZACION',
    cuota_es_aproximada: 'CONFIRMADO_POR_COTIZACION',
    dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL',
  },
  poliza: { valor_poliza: 1_711_586, estado_datos_campos: { valor_poliza: 'CONFIRMADO_POR_COTIZACION' } },
}
const COTIZACION_KAI40 = cotizacionDesdeRegistro(REGISTRO_COTIZACION_KAI40)!
const conCotizacionKai40 = (p: ParametrosPresupuesto): ParametrosPresupuesto => ({ ...p, seguro: { ...p.seguro, cotizacion: COTIZACION_KAI40 } })
const RECURSOS_PROPIOS: ParametrosPresupuesto = { ...P, modalidadAdquisicion: 'RECURSOS_PROPIOS' }
const SIN_MODELAR: ParametrosPresupuesto = { ...P, seguro: { ...P.seguro, modo: 'SIN_MODELAR' } }
const TS = T.seguroSimulacion

/** La vista tal como la arma la página: con la vista de la cotización de ESE presupuesto y su propio resultado. */
function vistaSeguroDe(p: ParametrosPresupuesto) {
  const r = calcularMetricas(p, 0)
  const vistaCotizacion = construirVistaCotizacionSeguro(p.seguro.cotizacion, r.seguroNominal)
  const hayDetalle = p.modalidadAdquisicion === 'CREDITO' && !!r.amortizacionNormal
  return { r, vistaCotizacion, vista: construirVistaSeguroSimulacion(p, vistaCotizacion, hayDetalle) }
}

verificar('KAI-40: Crédito, referencia sin cotización — usa la referencia histórica con los mismos valores que lee el motor', () => {
  const { r, vista } = vistaSeguroDe(P)
  const efectivo = seguroEfectivo(P)
  assert.equal(vista.titulo, 'Seguro en esta simulación')
  assert.equal(vista.usado.titulo, 'Usado en el cálculo: referencia histórica')
  assert.equal(vista.usado.etiqueta, 'No confirmado')
  assert.deepEqual(vista.usado.filas, [
    { etiqueta: 'Capital financiado del seguro', tipo: 'moneda', valor: efectivo.principal },
    { etiqueta: 'Costo financiero estimado', tipo: 'moneda', valor: efectivo.costoFinancieroTotal },
    { etiqueta: 'Plazo', tipo: 'texto', valor: `${efectivo.plazoMeses} meses` },
  ])
  assert.equal(vista.usado.filas[0].valor, r.principalFinanciacionSeguro, 'el capital mostrado es el que entra a la estructura de capital')
  assert.equal(vista.usado.nota, 'Valores de una referencia histórica sin soporte documental. Se conservan para reproducir el escenario de referencia y los presupuestos guardados.')
  // Presupuesto antiguo sin cotización: la columna derecha lo dice y no enlaza a un detalle que no existe.
  assert.equal(vista.cotizacion.titulo, 'Cotización actual: informativa')
  assert.deepEqual(vista.cotizacion.filas, [])
  assert.equal(vista.cotizacion.nota, 'No hay una cotización del seguro cargada.')
  assert.equal(vista.cotizacion.enlaceDetalle, null)
})

verificar('KAI-40: los valores de la referencia histórica siguen a los parámetros editados (no hay cifras fijas en la vista)', () => {
  const p = conSeguroLegacy(P, { principalFinanciacion: 1_000_000, costoFinancieroEstimado: 200_000, plazoMeses: 24 })
  const { r, vista } = vistaSeguroDe(p)
  assert.deepEqual(vista.usado.filas.map((f) => f.valor), [1_000_000, 200_000, '24 meses'])
  assert.equal(r.principalFinanciacionSeguro, 1_000_000)
})

verificar('KAI-40: Crédito con cotización — resumen de 4 datos, copiados tal cual del detalle (valor y estado de CADA dato), con enlace al detalle', () => {
  const { vistaCotizacion, vista } = vistaSeguroDe(conCotizacionKai40(P))
  assert.ok(vistaCotizacion)
  assert.deepEqual(
    vista.cotizacion.filas.map((f) => f.etiqueta),
    ['Valor de la póliza', 'Valor financiado', 'Número de cuotas', 'Total nominal (pago inicial + cuotas)'],
  )
  for (const f of vista.cotizacion.filas) {
    const original: FilaVistaCotizacion | undefined = [...vistaCotizacion.filas, ...vistaCotizacion.totales].find((o) => o.etiqueta === f.etiqueta)
    assert.deepEqual(f, original, `${f.etiqueta}: mismo valor y mismo estado que el detalle`)
  }
  assert.deepEqual(vista.cotizacion.filas.map((f) => f.estado), ['Confirmado por cotización', 'Confirmado por cotización', 'Confirmado por cotización', null])
  assert.equal(vista.cotizacion.nota, 'Todavía no entra al cálculo: la tasa, el sistema de amortización y el saldo siguen pendientes de documento.')
  assert.equal(vista.cotizacion.enlaceDetalle, 'Ver el detalle en Amortización del crédito')
  // La columna usada no cambia por tener cotización: sigue siendo la referencia histórica.
  assert.deepEqual(vista.usado, vistaSeguroDe(P).vista.usado)
})

verificar('KAI-40: "Confirmado por cotización" nunca aparece como estado global de la financiación', () => {
  for (const p of [P, conCotizacionKai40(P), conCotizacionKai40(RECURSOS_PROPIOS), SIN_MODELAR]) {
    const { vista } = vistaSeguroDe(p)
    const textosGlobales = [vista.titulo, vista.subtitulo, vista.usado.titulo, vista.usado.etiqueta, vista.usado.nota, vista.cotizacion.titulo, vista.cotizacion.nota, vista.cotizacion.enlaceDetalle]
    assert.ok(!textosGlobales.some((t) => t !== null && /confirmado por cotizaci/i.test(t)))
  }
})

verificar('KAI-40: Recursos propios — solo el capital, y es exactamente lo que el seguro suma a la inversión', () => {
  const { r, vista } = vistaSeguroDe(conCotizacionKai40(RECURSOS_PROPIOS))
  const sinSeguro = calcularMetricas({ ...RECURSOS_PROPIOS, seguro: { ...RECURSOS_PROPIOS.seguro, modo: 'SIN_MODELAR' } }, 0)
  assert.deepEqual(vista.usado.filas, [{ etiqueta: 'Capital del seguro incluido en la inversión', tipo: 'moneda', valor: seguroEfectivo(RECURSOS_PROPIOS).principal }])
  assert.equal(vista.usado.filas[0].valor, r.inversionInicialTotal - sinSeguro.inversionInicialTotal)
  assert.equal(vista.usado.etiqueta, 'No confirmado')
  // La cotización se ve también en esta modalidad, pero sin enlace: aquí no hay "Amortización del crédito".
  assert.equal(vista.cotizacion.filas.length, 4)
  assert.equal(vista.cotizacion.enlaceDetalle, null)
})

verificar('KAI-40: SIN_MODELAR (presupuestos que ya lo tengan) — "ninguno", sin filas ni etiqueta', () => {
  const { r, vista } = vistaSeguroDe(SIN_MODELAR)
  assert.equal(vista.usado.titulo, 'Usado en el cálculo: ninguno')
  assert.equal(vista.usado.etiqueta, null)
  assert.deepEqual(vista.usado.filas, [])
  assert.equal(vista.usado.nota, 'El seguro no entra en este resultado.')
  assert.equal(r.principalFinanciacionSeguro, 0)
  const conCot = vistaSeguroDe(conCotizacionKai40(SIN_MODELAR)).vista
  assert.equal(conCot.usado.titulo, 'Usado en el cálculo: ninguno')
  assert.equal(conCot.cotizacion.filas.length, 4)
})

verificar('KAI-40: solo presentación — construir la vista no cambia parámetros ni ningún resultado del motor', () => {
  for (const base of [P, conCotizacionKai40(P), conCotizacionKai40(RECURSOS_PROPIOS), SIN_MODELAR, conAbono(P, 1)]) {
    const copia = JSON.parse(JSON.stringify(base)) as ParametrosPresupuesto
    const antes = JSON.stringify(calcularMetricas(base, 0))
    vistaSeguroDe(base)
    assert.deepEqual(base, copia, 'los parámetros no se modifican')
    assert.equal(JSON.stringify(calcularMetricas(base, 0)), antes, 'el resultado del motor es idéntico')
  }
})

verificar('KAI-40: textos aprobados literalmente y sin "legacy" ni "modelo anterior" visibles', () => {
  assert.equal(TS.subtitulo, 'Qué datos del seguro usa este resultado y cuáles son solo informativos.')
  assert.equal(T.modeloAnteriorTitulo, 'Referencia histórica del seguro (no confirmada)')
  assert.equal(T.modeloAnteriorNota, 'Valores históricos sin soporte documental. Se conservan para reproducir el escenario de referencia y los presupuestos guardados; no corresponden a la cotización actual.')
  assert.equal(T.modeloAnteriorPlazo, 'Dato histórico, no confirmado; independiente del plazo del crédito.')
  assert.equal(T.financiacionSeguroHistorica, 'Financiación del seguro (referencia histórica)')
  assert.equal(T.notaCostosSeguro, 'Incluye el costo financiero estimado del seguro (referencia histórica, no confirmado).')
  assert.equal(T.noConfirmado, 'No confirmado')
  const visibles = [
    ...(Object.values(TS).filter((v) => typeof v === 'string') as string[]),
    TS.plazoMeses(72),
    T.seguroUsado.modeloAnterior,
    T.modeloAnteriorTitulo,
    T.modeloAnteriorNota,
    T.modeloAnteriorPlazo,
    T.origenAvisoM6,
    T.financiacionSeguroHistorica,
    T.notaCostosSeguro,
  ]
  assert.deepEqual(visibles.filter((t) => /legacy|modelo anterior/i.test(t)), [])
})

console.log(`\n${casos} casos de las visualizaciones (D7) y de la tarjeta del seguro (KAI-40) verificados, todos OK.`)
