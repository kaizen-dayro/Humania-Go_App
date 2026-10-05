// KAI-121 — Verificación del plazo del contrato (SDD `plazo-contrato-deposito`,
// spec.md AC-02 a AC-05 y casos de borde 9.1/9.2). Mismo mecanismo que las
// demás suites del dominio: sin framework de pruebas, se compila con `tsc` y
// se ejecuta con node.
//
//   npm run verificar:contrato   (desde web/)

import assert from 'node:assert/strict'
import { calcularPlazo, fechaBogota, sumarDias, type PagoParaPlazo } from './plazo'
import { filtrarEstadoCuenta } from './estadoCuenta'
import { calcularCompra } from './compra'
import { MENSAJES_ETAPA, calcularAvanceConductor, calcularRacha, etapaPorOrdinarias, fechaEnPalabras } from './avance'

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

// Entrega el martes 13-10-2026 a las 09:00 de Bogotá (14:00 UTC).
const ENTREGA = '2026-10-13T14:00:00+00:00'

function semanas(...tipos: PagoParaPlazo['tipo_pago'][]): PagoParaPlazo[] {
  return tipos.map((tipo_pago, i) => ({ numero_semana: i + 1, tipo_pago }))
}

verificar('AC-02: 152 pactadas + 2 aplazatorias + 1 sin pago = plazo ajustado 155', () => {
  const pagos = semanas('NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'APLAZATORIA', 'NORMAL', 'NORMAL', 'NORMAL', 'APLAZATORIA', 'NO_PAGO')
  const r = calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos })
  assert.equal(r.aplazatorias, 2)
  assert.equal(r.sinPago, 1)
  assert.equal(r.ordinariasPagadas, 8)
  assert.equal(r.plazoAjustado, 155)
})

verificar('AC-03: corregir NORMAL a APLAZATORIA (y al revés) recalcula el plazo', () => {
  const antes = semanas('NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL')
  const despues = antes.map(p => (p.numero_semana === 6 ? { ...p, tipo_pago: 'APLAZATORIA' as const } : p))
  assert.equal(calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: antes }).plazoAjustado, 152)
  assert.equal(calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: despues }).plazoAjustado, 153)
  assert.equal(calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: antes }).plazoAjustado, 152)
})

verificar('AC-04: semanas restantes = pactadas − NORMAL, nunca negativo', () => {
  const r = calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'APLAZATORIA', 'NORMAL', 'NO_PAGO') })
  assert.equal(r.restantes, 150)
  const pocas = calcularPlazo({ semanasPactadas: 2, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'NORMAL', 'NORMAL') })
  assert.equal(pocas.restantes, 0)
})

verificar('AC-05: fecha estimada de fin = entrega + plazo ajustado × 7 días', () => {
  const r = calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'APLAZATORIA') })
  assert.equal(r.plazoAjustado, 153)
  assert.equal(r.fechaEstimadaFin, sumarDias('2026-10-13', 153 * 7))
  assert.equal(r.fechaEstimadaFin, '2029-09-18')
})

verificar('La fecha de entrega se toma en Bogotá (una entrega a las 21:00 de Bogotá es del mismo día)', () => {
  // 21:00 de Bogotá del 13-10 = 02:00 UTC del 14-10.
  assert.equal(fechaBogota('2026-10-14T02:00:00+00:00'), '2026-10-13')
  const r = calcularPlazo({ semanasPactadas: 1, fechaAsignacion: '2026-10-14T02:00:00+00:00', pagos: [] })
  assert.equal(r.fechaEstimadaFin, '2026-10-20')
})

verificar('9.1: sin semanas pactadas, solo conteos (sin plazo, restantes ni fecha)', () => {
  const r = calcularPlazo({ semanasPactadas: null, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'APLAZATORIA', 'NO_PAGO') })
  assert.deepEqual(r, { aplazatorias: 1, sinPago: 1, ordinariasPagadas: 1, plazoAjustado: null, restantes: null, fechaEstimadaFin: null })
})

verificar('9.1: semanas pactadas inválidas (0, negativas, decimales) se tratan como no definidas', () => {
  for (const v of [0, -5, 1.5]) {
    assert.equal(calcularPlazo({ semanasPactadas: v, fechaAsignacion: ENTREGA, pagos: [] }).plazoAjustado, null)
  }
})

verificar('9.2: las semanas no registradas (huecos) no alargan el plazo', () => {
  const pagos: PagoParaPlazo[] = [
    { numero_semana: 1, tipo_pago: 'NORMAL' },
    { numero_semana: 7, tipo_pago: 'NORMAL' },
  ]
  const r = calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos })
  assert.equal(r.plazoAjustado, 152)
  assert.equal(r.restantes, 150)
})

verificar('sumarDias cruza meses y años bisiestos sin desfase', () => {
  assert.equal(sumarDias('2028-02-27', 2), '2028-02-29')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
})

// ---------------------------------------------------------------------------
// KAI-125 — Avance del conductor (SDD `progreso-conductor`, AC-03, AC-04, AC-09).

function normales(n: number): PagoParaPlazo[] {
  return Array.from({ length: n }, (_, i) => ({ numero_semana: i + 1, tipo_pago: 'NORMAL' as const }))
}

verificar('KAI-125 AC-03: 152 pactadas y 40 NORMAL = 26 %, faltan 112 semanas, unos 26 meses', () => {
  const a = calcularAvanceConductor({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: normales(40) })
  assert.equal(a.porcentaje, 26)
  assert.equal(a.plazo.restantes, 112)
  assert.equal(a.mesesAproximados, 26)
})

verificar('KAI-125 AC-04: hito de la semana 78 en 78/152 y alcanzado con 78 ordinarias', () => {
  const antes = calcularAvanceConductor({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: normales(77) })
  assert.ok(antes.hito78 && Math.abs(antes.hito78.posicion - 78 / 152) < 1e-9)
  assert.equal(antes.hito78?.alcanzado, false)
  const despues = calcularAvanceConductor({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: normales(78) })
  assert.equal(despues.hito78?.alcanzado, true)
  assert.equal(calcularAvanceConductor({ semanasPactadas: 60, fechaAsignacion: ENTREGA, pagos: [] }).hito78, null)
})

verificar('KAI-125 AC-09: mensajes en los umbrales 38/39, 77/78 y al completar las pactadas', () => {
  const etapa = (n: number) => calcularAvanceConductor({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos: normales(n) }).etapa
  assert.equal(etapa(0), 'INICIO')
  assert.equal(etapa(38), 'INICIO')
  assert.equal(etapa(39), 'MITAD')
  assert.equal(etapa(77), 'MITAD')
  assert.equal(etapa(78), 'OPCION')
  assert.equal(etapa(151), 'OPCION')
  assert.equal(etapa(152), 'COMPLETO')
  assert.equal(MENSAJES_ETAPA.COMPLETO, 'Tu carro ya es tuyo, ahora falta realizar el traspaso.')
})

verificar('KAI-125: el avance tiene tope de 100 % y las aplazatorias no cuentan como avance', () => {
  const a = calcularAvanceConductor({ semanasPactadas: 10, fechaAsignacion: ENTREGA, pagos: normales(12) })
  assert.equal(a.porcentaje, 100)
  const b = calcularAvanceConductor({ semanasPactadas: 100, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'APLAZATORIA', 'NO_PAGO', 'NORMAL') })
  assert.equal(b.porcentaje, 2)
})

verificar('KAI-125: racha = NORMAL consecutivas desde la última semana registrada', () => {
  assert.equal(calcularRacha(semanas('NORMAL', 'NORMAL', 'APLAZATORIA', 'NORMAL', 'NORMAL', 'NORMAL')), 3)
  assert.equal(calcularRacha(semanas('NORMAL', 'NO_PAGO')), 0)
  assert.equal(calcularRacha([]), 0)
  // Un hueco (semana sin registrar) corta la racha.
  assert.equal(calcularRacha([{ numero_semana: 1, tipo_pago: 'NORMAL' }, { numero_semana: 3, tipo_pago: 'NORMAL' }]), 1)
})

verificar('KAI-125: cuadrícula = una entrada por semana del plazo ajustado', () => {
  const a = calcularAvanceConductor({ semanasPactadas: 5, fechaAsignacion: ENTREGA, pagos: semanas('NORMAL', 'APLAZATORIA') })
  assert.deepEqual(a.semanas, ['NORMAL', 'APLAZATORIA', 'POR_RECORRER', 'POR_RECORRER', 'POR_RECORRER', 'POR_RECORRER'])
})

verificar('KAI-125 AC-08: sin semanas pactadas no hay avance (solo racha)', () => {
  const a = calcularAvanceConductor({ semanasPactadas: null, fechaAsignacion: ENTREGA, pagos: normales(3) })
  assert.equal(a.avance, null)
  assert.equal(a.etapa, null)
  assert.deepEqual(a.semanas, [])
  assert.equal(a.racha, 3)
})

verificar('KAI-125: fecha en palabras para la tarjeta del conductor', () => {
  assert.equal(fechaEnPalabras('2029-10-09'), 'octubre de 2029')
  assert.equal(fechaEnPalabras('2027-01-31'), 'enero de 2027')
  assert.equal(fechaEnPalabras(null), null)
  assert.equal(etapaPorOrdinarias(60, 60), 'COMPLETO')
})

// KAI-127 — Estado de cuenta (SDD estado-cuenta-conductor, R5/R6, AC-03).
const PAGOS_EC = [
  { numero_semana: 1, tipo_pago: 'NORMAL' as const, monto_pagado: 490000, fecha_pago: '2026-10-20T01:00:00+00:00' }, // 19-10 en Bogotá
  { numero_semana: 2, tipo_pago: 'APLAZATORIA' as const, monto_pagado: 200000, fecha_pago: '2026-10-27T15:00:00+00:00' },
  { numero_semana: 3, tipo_pago: 'NO_PAGO' as const, monto_pagado: 0, fecha_pago: null }, // inicio de la semana 3: 27-10
  { numero_semana: 4, tipo_pago: 'NORMAL' as const, monto_pagado: 490000, fecha_pago: '2026-11-10T15:00:00+00:00' },
]
const ABONOS_EC = [{ fecha_abono: '2026-11-05T15:00:00+00:00', valor_abono: 1000000 }]

verificar('KAI-127: sin rango = desde la entrega hasta hoy, todos los registros y totales', () => {
  const r = filtrarEstadoCuenta({ fechaAsignacion: ENTREGA, hoy: '2026-12-01', pagos: PAGOS_EC, abonos: ABONOS_EC })
  assert.equal(r.entrega, '2026-10-13')
  assert.equal(r.desde, '2026-10-13')
  assert.equal(r.hasta, '2026-12-01')
  assert.equal(r.rangoInvalido, false)
  assert.equal(r.pagos.length, 4)
  assert.equal(r.totalPagos, 1180000)
  assert.equal(r.totalAbonos, 1000000)
})

verificar('KAI-127: fecha de pago en Bogotá y semana sin pago por el inicio de su semana', () => {
  const r = filtrarEstadoCuenta({ fechaAsignacion: ENTREGA, hoy: '2026-12-01', pagos: PAGOS_EC, abonos: [] })
  assert.equal(r.pagos[0].fecha, '2026-10-19')
  assert.equal(r.pagos[2].fecha, '2026-10-27')
})

verificar('KAI-127: el rango filtra pagos y abonos (bordes incluidos)', () => {
  const r = filtrarEstadoCuenta({ fechaAsignacion: ENTREGA, hoy: '2026-12-01', desde: '2026-10-27', hasta: '2026-11-05', pagos: PAGOS_EC, abonos: ABONOS_EC })
  assert.deepEqual(r.pagos.map(p => p.numero_semana), [2, 3])
  assert.equal(r.totalPagos, 200000)
  assert.equal(r.abonos.length, 1)
})

verificar('KAI-127 AC-03: rango invertido = periodo completo y aviso', () => {
  const r = filtrarEstadoCuenta({ fechaAsignacion: ENTREGA, hoy: '2026-12-01', desde: '2026-11-30', hasta: '2026-10-01', pagos: PAGOS_EC, abonos: ABONOS_EC })
  assert.equal(r.rangoInvalido, true)
  assert.equal(r.desde, '2026-10-13')
  assert.equal(r.pagos.length, 4)
})

verificar('KAI-127: fechas mal formadas se ignoran; periodo sin registros da totales en cero', () => {
  const r = filtrarEstadoCuenta({ fechaAsignacion: ENTREGA, hoy: '2026-12-01', desde: 'x', hasta: '2026-10-15', pagos: PAGOS_EC, abonos: ABONOS_EC })
  assert.equal(r.desde, '2026-10-13')
  assert.equal(r.pagos.length, 0)
  assert.equal(r.totalPagos, 0)
  assert.equal(r.totalAbonos, 0)
})

// KAI-128 — Acumulado para la compra y saldo (SDD valores-compra-contrato, D2-D4).
verificar('KAI-128: sin valores registrados no hay cálculo', () => {
  assert.equal(calcularCompra({ valorVenta: null, aporteAhorroSemanal: 90000, aporteBonoSemanal: 120000, ordinariasPagadas: 3, totalAbonos: 0 }), null)
  assert.equal(calcularCompra({ valorVenta: 32000000, aporteAhorroSemanal: null, aporteBonoSemanal: 120000, ordinariasPagadas: 3, totalAbonos: 0 }), null)
})

verificar('KAI-128: ejemplo del contrato (152 semanas × $210.000 → saldo $80.000)', () => {
  const r = calcularCompra({ valorVenta: 32000000, aporteAhorroSemanal: 90000, aporteBonoSemanal: 120000, ordinariasPagadas: 152, totalAbonos: 0 })!
  assert.equal(r.aporteSemanal, 210000)
  assert.equal(r.acumuladoAhorro, 13680000)
  assert.equal(r.acumuladoBono, 18240000)
  assert.equal(r.acumulado, 31920000)
  assert.equal(r.saldo, 80000)
})

verificar('KAI-128 D3: solo suman las semanas ordinarias (aplazatorias y sin pago no) y los abonos', () => {
  const pagos = semanas('NORMAL', 'APLAZATORIA', 'NORMAL', 'NO_PAGO', 'NORMAL')
  const { ordinariasPagadas } = calcularPlazo({ semanasPactadas: 152, fechaAsignacion: ENTREGA, pagos })
  const r = calcularCompra({ valorVenta: 32000000, aporteAhorroSemanal: 90000, aporteBonoSemanal: 120000, ordinariasPagadas, totalAbonos: 1000000 })!
  assert.equal(r.acumulado, 3 * 210000 + 1000000)
  assert.equal(r.saldo, 32000000 - 1630000)
})

verificar('KAI-128: el saldo nunca es negativo y el avance no pasa de 100 %', () => {
  const r = calcularCompra({ valorVenta: 1000000, aporteAhorroSemanal: 90000, aporteBonoSemanal: 120000, ordinariasPagadas: 10, totalAbonos: 0 })!
  assert.equal(r.saldo, 0)
  assert.equal(r.avance, 1)
})

console.log(`\n${casos} casos del plazo del contrato verificados.`)
