// KAI-121 — Verificación del plazo del contrato (SDD `plazo-contrato-deposito`,
// spec.md AC-02 a AC-05 y casos de borde 9.1/9.2). Mismo mecanismo que las
// demás suites del dominio: sin framework de pruebas, se compila con `tsc` y
// se ejecuta con node.
//
//   npm run verificar:contrato   (desde web/)

import assert from 'node:assert/strict'
import { calcularPlazo, fechaBogota, sumarDias, type PagoParaPlazo } from './plazo'
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

console.log(`\n${casos} casos del plazo del contrato verificados.`)
