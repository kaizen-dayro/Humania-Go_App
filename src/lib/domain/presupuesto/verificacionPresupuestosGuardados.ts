// Calculadora de Presupuesto (KAI-29) — Presupuestos guardados: dominio puro de B1
// (esquemaSnapshot.ts, versionModelo.ts, reconocerSnapshot.ts, compararHistorico.ts) y
// de la parte de B2 que es dominio puro (clavesDesconocidas, reutilizada tal cual por
// `guardarPresupuesto` en actions.ts). (Documentos/SDD/calculadora-presupuesto/spec.md
// Sección 38, plan.md Sección 18). DISEÑO APROBADO 2026-09-20.
//
// `actions.ts` (`guardarPresupuesto`/`obtenerPresupuesto`) depende de un cliente Supabase
// con sesión real (`next/headers`) y NO se ejecuta en esta suite Node — su comportamiento
// se verifica manualmente contra la app real (sesión SUPER_ADMIN), apoyado en que toda su
// lógica de reconocimiento/validación es exactamente la que esta suite ya cubre aquí.
//
//   npm run verificar:presupuesto   (desde web/)
//
// Sin framework de pruebas (mismo criterio que el resto de `presupuesto/`): se
// compila con `tsc` y se ejecuta con node.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cotizacionDesdeRegistro, type CotizacionSeguro, type FinanciacionSeguroRegistro } from '../seguros/adaptador'
import {
  compararResultados,
  TOLERANCIA_COMPARACION,
  type ResultadoGuardado,
} from './compararHistorico'
import { CLAVES_PARAMETROS_V1, clavesDesconocidas } from './esquemaSnapshot'
import { calcularMetricas, type ResultadoMetricas } from './metricas'
import { TOLERANCIA_ABSOLUTA } from './lineaBase'
import { PARAMETROS_REFERENCIA, validarParametros, type ParametrosPresupuesto } from './parametros'
import { reconocerSnapshot } from './reconocerSnapshot'
import { FINANCIAL_MODEL_VERSION } from './version'
import { REGISTRO_VERSIONES } from './versionModelo'

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

/** Simula el viaje por Supabase JSONB: pierde funciones/undefined, conserva null — igual que un snapshot real. */
function comoSnapshot(valor: unknown): unknown {
  return JSON.parse(JSON.stringify(valor))
}

const REGISTRO_COTIZACION_OK: FinanciacionSeguroRegistro = {
  valor_financiado: 1_454_848,
  pago_inicial: 256_738,
  gravamen_4x1000: 5_819,
  numero_cuotas: 10,
  periodicidad: 'MENSUAL',
  dia_vencimiento: 5,
  cuota_valor: 155_839,
  cuota_es_aproximada: true,
  fecha_inicio: null,
  fecha_primera_cuota: null,
  estado_datos_campos: { dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' },
}
const COTIZACION_OK: CotizacionSeguro = cotizacionDesdeRegistro(REGISTRO_COTIZACION_OK)!
// numero_cuotas = 0 no produce un cronograma nominal válido (mismo caso ya usado en verificacion.ts/verificacionModeloVigente.ts).
const COTIZACION_CORRUPTA: CotizacionSeguro = cotizacionDesdeRegistro({ ...REGISTRO_COTIZACION_OK, numero_cuotas: 0 })!

// ===== esquemaSnapshot.ts =====

verificar('CLAVES_PARAMETROS_V1 tiene exactamente las 31 claves de nivel superior de ParametrosPresupuesto, sin duplicados', () => {
  assert.equal(CLAVES_PARAMETROS_V1.length, 31)
  assert.equal(new Set(CLAVES_PARAMETROS_V1).size, 31)
  assert.deepEqual([...CLAVES_PARAMETROS_V1].sort(), Object.keys(p).sort())
})

verificar('clavesDesconocidas: un ParametrosPresupuesto válido no tiene ninguna clave desconocida (KAI-29 B2, guardarPresupuesto)', () => {
  assert.deepEqual(clavesDesconocidas(p as unknown as Record<string, unknown>), [])
})

verificar('clavesDesconocidas: detecta exactamente la(s) clave(s) que no están en CLAVES_PARAMETROS_V1', () => {
  assert.deepEqual(clavesDesconocidas({ ...p, claveInventada: 1, otraMas: 2 } as unknown as Record<string, unknown>), ['claveInventada', 'otraMas'])
  assert.deepEqual(clavesDesconocidas({}), [])
})

// ===== versionModelo.ts =====

verificar('FINANCIAL_MODEL_VERSION está registrada en REGISTRO_VERSIONES', () => {
  assert.ok(REGISTRO_VERSIONES.some((entrada) => entrada.version === FINANCIAL_MODEL_VERSION))
})

verificar('la huella registrada de la versión vigente coincide con lineaBase.json actual (sha256 del archivo completo)', () => {
  const rutaLineaBase = path.resolve(__dirname, '../../src/lib/domain/presupuesto/lineaBase.json')
  const huellaActual = crypto.createHash('sha256').update(fs.readFileSync(rutaLineaBase)).digest('hex')
  const entrada = REGISTRO_VERSIONES.find((e) => e.version === FINANCIAL_MODEL_VERSION)
  assert.ok(entrada, 'la versión vigente debe tener una entrada en el registro')
  assert.equal(
    entrada!.huellaLineaBase,
    huellaActual,
    'lineaBase.json cambió sin que se registrara una nueva entrada de versión (plan.md 18.5): revisar si el cambio altera resultados (MAYOR) o no (MENOR)',
  )
})

// ===== reconocerSnapshot.ts — estructura no reconocida =====

for (const [nombre, bruto] of [
  ['null', null],
  ['undefined', undefined],
  ['un array', [1, 2, 3]],
  ['una cadena', 'no es un objeto'],
  ['un número', 42],
  ['un objeto vacío', {}],
  ['un objeto ajeno sin ninguna de las dos formas conocidas', { foo: 'bar', baz: 1 }],
] as const) {
  verificar(`reconocerSnapshot: ${nombre} -> ESTRUCTURA_NO_RECONOCIDA`, () => {
    const r = reconocerSnapshot(bruto, FINANCIAL_MODEL_VERSION)
    assert.equal(r.estado, 'ESTRUCTURA_NO_RECONOCIDA')
  })
}

// ===== reconocerSnapshot.ts — forma ACTUAL, caso feliz =====

const parametrosA: ParametrosPresupuesto = {
  ...p,
  modalidadAdquisicion: 'CREDITO',
  precioCompra: 32_000_000,
  principalCreditoBancario: 27_329_323,
  mesesCreditoVehiculo: 72,
  porcentajeAbonoCapital: 1,
  mesInicioAbonoCapital: 3,
  seguro: { ...p.seguro, cotizacion: COTIZACION_OK },
}
const semanasA = 6

verificar('reconocerSnapshot: forma ACTUAL válida -> DETERMINISTA, sin claves ignoradas, con versión conocida', () => {
  const r = reconocerSnapshot(comoSnapshot(parametrosA), FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  assert.equal(r.versionConocida, true)
  assert.deepEqual(r.clavesIgnoradas, [])
  assert.deepEqual(r.parametros, comoSnapshot(parametrosA))
  assert.deepEqual(validarParametros(r.parametros), [])
})

verificar('reconocerSnapshot -> calcularMetricas reproduce el mismo resultado que calcular directamente con el snapshot original (38.6.1)', () => {
  const r = reconocerSnapshot(comoSnapshot(parametrosA), FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  const directo = calcularMetricas(parametrosA, semanasA)
  const reconstruido = calcularMetricas(r.parametros, semanasA)
  assert.equal(reconstruido.resultadoNeto, directo.resultadoNeto)
  assert.equal(reconstruido.roiSobreInversionTotal, directo.roiSobreInversionTotal)
  assert.equal(reconstruido.paybackFlujoContractualCompleto, directo.paybackFlujoContractualCompleto)
})

// ===== reconocerSnapshot.ts — forma PLANA (compatibilidad histórica) =====

verificar('reconocerSnapshot: forma PLANA anterior a spec.md 29 -> DETERMINISTA, equivalente a la forma ACTUAL', () => {
  const { seguro, mesesCreditoVehiculo, ...resto } = p
  const plana = {
    ...resto,
    mesesContrato: mesesCreditoVehiculo,
    principalFinanciacionSeguro: seguro.legacy.principalFinanciacion,
    costoFinancieroSeguroEstimado: seguro.legacy.costoFinancieroEstimado,
  }
  const r = reconocerSnapshot(comoSnapshot(plana), FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  assert.deepEqual(r.parametros, p)
})

// ===== reconocerSnapshot.ts — claves de más =====

verificar('reconocerSnapshot: clave de más + versión conocida -> DETERMINISTA, la ignora y la informa', () => {
  const conExtra = { ...comoSnapshot(parametrosA) as Record<string, unknown>, claveInventada: 123 }
  const r = reconocerSnapshot(conExtra, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  assert.deepEqual(r.clavesIgnoradas, ['claveInventada'])
  assert.ok(!('claveInventada' in r.parametros))
})

verificar('reconocerSnapshot: clave de más + versión desconocida -> NO_DETERMINISTA (nunca se interpreta a ciegas)', () => {
  const conExtra = { ...comoSnapshot(parametrosA) as Record<string, unknown>, claveInventada: 123 }
  const r = reconocerSnapshot(conExtra, 'Humania Go Financial Model v0.1-inexistente')
  assert.equal(r.estado, 'NO_DETERMINISTA')
  if (r.estado !== 'NO_DETERMINISTA') return
  assert.deepEqual(r.clavesDesconocidas, ['claveInventada'])
})

verificar('reconocerSnapshot: versión desconocida SIN claves de más -> sigue siendo determinista (decisión 8, rama "sí")', () => {
  const r = reconocerSnapshot(comoSnapshot(parametrosA), 'Humania Go Financial Model v0.1-inexistente')
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  assert.equal(r.versionConocida, false)
})

// ===== reconocerSnapshot.ts — datos inválidos, sin rellenar con defaults =====

verificar('reconocerSnapshot: falta una clave requerida -> DATOS_INVALIDOS, nunca se completa con un valor por defecto', () => {
  const incompleto = comoSnapshot(parametrosA) as Record<string, unknown>
  delete incompleto.precioCompra
  const r = reconocerSnapshot(incompleto, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DATOS_INVALIDOS')
  if (r.estado !== 'DATOS_INVALIDOS') return
  assert.ok(r.errores.some((e) => e.includes('precioCompra')))
})

verificar('reconocerSnapshot: valor fuera de rango (validarParametros) -> DATOS_INVALIDOS', () => {
  const invalido = { ...comoSnapshot(parametrosA) as Record<string, unknown>, precioCompra: -1 }
  const r = reconocerSnapshot(invalido, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DATOS_INVALIDOS')
})

verificar('reconocerSnapshot: cotización que no produce un cronograma nominal válido -> DATOS_INVALIDOS (misma causa raíz de H2, spec.md 37.4)', () => {
  const conCotizacionCorrupta: ParametrosPresupuesto = { ...parametrosA, seguro: { ...parametrosA.seguro, cotizacion: COTIZACION_CORRUPTA } }
  const r = reconocerSnapshot(comoSnapshot(conCotizacionCorrupta), FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DATOS_INVALIDOS')
})

verificar('reconocerSnapshot: cotización null se conserva como null (decisión 4), nunca se sustituye', () => {
  const conCotizacionNula: ParametrosPresupuesto = { ...parametrosA, seguro: { ...parametrosA.seguro, cotizacion: null } }
  const r = reconocerSnapshot(comoSnapshot(conCotizacionNula), FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado !== 'DETERMINISTA') return
  assert.equal(r.parametros.seguro.cotizacion, null)
})

// ===== reconocerSnapshot.ts — A -> B -> A (spec.md 38.2 punto 5 / 38.6 punto 2) =====

verificar('reconocerSnapshot: A -> B -> A reconstruye A de forma idéntica, sin residuales de B y sin referencias compartidas', () => {
  const parametrosB: ParametrosPresupuesto = {
    ...p,
    modalidadAdquisicion: 'RECURSOS_PROPIOS',
    precioCompra: 18_500_000,
    valorComercialBase: 19_000_000,
    principalCreditoBancario: 0,
    tasaEfectivaAnualCredito: 0,
    mesesCreditoVehiculo: 0,
    porcentajeAbonoCapital: 0,
    mesInicioAbonoCapital: 1,
    valorVentaContractualActivo: 18_500_000,
    seguro: { ...p.seguro, cotizacion: null },
  }
  const semanasB = 0
  assert.deepEqual(validarParametros(parametrosA), [])
  assert.deepEqual(validarParametros(parametrosB), [])

  const snapshotA = comoSnapshot(parametrosA)
  const snapshotB = comoSnapshot(parametrosB)

  const r1 = reconocerSnapshot(snapshotA, FINANCIAL_MODEL_VERSION)
  const rB = reconocerSnapshot(snapshotB, FINANCIAL_MODEL_VERSION)
  const r2 = reconocerSnapshot(snapshotA, FINANCIAL_MODEL_VERSION) // A de nuevo

  assert.equal(r1.estado, 'DETERMINISTA')
  assert.equal(rB.estado, 'DETERMINISTA')
  assert.equal(r2.estado, 'DETERMINISTA')
  if (r1.estado !== 'DETERMINISTA' || rB.estado !== 'DETERMINISTA' || r2.estado !== 'DETERMINISTA') return

  // El segundo A es idéntico por valor al snapshot original de A.
  assert.deepEqual(r2.parametros, snapshotA)
  assert.deepEqual(r1.parametros, r2.parametros)

  // Ninguna clave residual de B: A nunca tuvo RECURSOS_PROPIOS ni el precio de B.
  assert.equal(r2.parametros.modalidadAdquisicion, 'CREDITO')
  assert.equal(r2.parametros.precioCompra, parametrosA.precioCompra)
  assert.notEqual(r2.parametros.precioCompra, parametrosB.precioCompra)
  assert.deepEqual(Object.keys(r2.parametros).sort(), [...CLAVES_PARAMETROS_V1].sort())

  // Copia en profundidad: dos reconstrucciones de A son valores iguales pero instancias distintas.
  assert.notEqual(r1.parametros, r2.parametros)
  assert.notEqual(r1.parametros.seguro, r2.parametros.seguro)
  assert.notEqual(r1.parametros.seguro.cotizacion, r2.parametros.seguro.cotizacion)

  // El recálculo de A no se contamina con B ni entre sí.
  const metricasA1 = calcularMetricas(r1.parametros, semanasA)
  const metricasA2 = calcularMetricas(r2.parametros, semanasA)
  const metricasB = calcularMetricas(rB.parametros, semanasB)
  assert.equal(metricasA1.resultadoNeto, metricasA2.resultadoNeto)
  assert.notEqual(metricasA1.resultadoNeto, metricasB.resultadoNeto)
})

// ===== compararHistorico.ts =====

/** Reproduce el mismo recorte que hace `guardarPresupuesto` (actions.ts) — fixture de prueba, no una fuente compartida. */
function aResultadoGuardado(r: ResultadoMetricas): ResultadoGuardado {
  const { flujo, amortizacionNormal: _an, amortizacionConAbono: _ac, seguroNominal: _sn, mesesCreditoReales: _mcr, creditoSobreviveAlContrato: _csc, ...resto } = r
  void _an
  void _ac
  void _sn
  void _mcr
  void _csc
  return {
    ...resto,
    flujo: {
      duracionContratoSemanas: flujo.duracionContratoSemanas,
      adquisicion: flujo.adquisicion,
      flujoContractualTotal: flujo.flujoContractualTotal,
      equityAdministradoAcumulado: flujo.equityAdministradoAcumulado,
      ingresoOperativoHumania: flujo.ingresoOperativoHumania,
      ingresoAplazatoriasAcumulado: flujo.ingresoAplazatoriasAcumulado,
    },
  }
}

verificar('TOLERANCIA_COMPARACION == TOLERANCIA_ABSOLUTA (la de la línea base; no se amplía, spec.md 38.5)', () => {
  assert.equal(TOLERANCIA_COMPARACION, TOLERANCIA_ABSOLUTA)
})

verificar('compararResultados: mismo snapshot, mismo resultado -> COINCIDE, texto exacto aprobado', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historico = aResultadoGuardado(actual)
  const r = compararResultados(historico, actual)
  assert.equal(r.estado, 'COINCIDE')
  assert.deepEqual(r.diferencias, [])
  assert.equal(r.mensaje, 'Resultado actual coincide con el resultado histórico.')
})

verificar('compararResultados: diferencia por encima de la tolerancia -> DIFIERE, la reporta con histórico/actual/diferencia, texto exacto aprobado', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historico: ResultadoGuardado = { ...aResultadoGuardado(actual), resultadoNeto: actual.resultadoNeto + 10_000 }
  const r = compararResultados(historico, actual)
  assert.equal(r.estado, 'DIFIERE')
  assert.equal(r.mensaje, 'El resultado cambia respecto al histórico porque el modelo actual produce un resultado diferente.')
  const diff = r.diferencias.find((d) => d.clave === 'resultadoNeto')
  assert.ok(diff)
  assert.equal(diff!.historico, historico.resultadoNeto)
  assert.equal(diff!.actual, actual.resultadoNeto)
  assert.equal(diff!.diferencia, 10_000)
})

verificar('compararResultados: diferencia dentro de la tolerancia -> COINCIDE (no se cuenta como diferencia)', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historico: ResultadoGuardado = { ...aResultadoGuardado(actual), resultadoNeto: actual.resultadoNeto + TOLERANCIA_COMPARACION / 2 }
  const r = compararResultados(historico, actual)
  assert.equal(r.estado, 'COINCIDE')
})

verificar('compararResultados: detecta diferencias anidadas (flujo.adquisicion.* y costosRecurrentes.*)', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historicoBase = aResultadoGuardado(actual)
  const historico: ResultadoGuardado = {
    ...historicoBase,
    flujo: { ...historicoBase.flujo, adquisicion: { ...historicoBase.flujo.adquisicion, cuotaFinalAdquisicion: historicoBase.flujo.adquisicion.cuotaFinalAdquisicion + 1 } },
    costosRecurrentes: { ...historicoBase.costosRecurrentes, total: historicoBase.costosRecurrentes.total + 1 },
  }
  const r = compararResultados(historico, actual)
  assert.equal(r.estado, 'DIFIERE')
  assert.ok(r.diferencias.some((d) => d.clave === 'flujo.adquisicion.cuotaFinalAdquisicion'))
  assert.ok(r.diferencias.some((d) => d.clave === 'costosRecurrentes.total'))
})

verificar('compararResultados: clave ausente en el histórico -> NO_COMPARABLE en esa clave, nunca cuenta como diferencia', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historico = aResultadoGuardado(actual) as unknown as Record<string, unknown>
  delete historico.margenVentaActivo
  const r = compararResultados(historico as unknown as ResultadoGuardado, actual)
  assert.equal(r.estado, 'COINCIDE')
  assert.deepEqual(r.diferencias, [])
  assert.ok(r.clavesNoComparables.includes('margenVentaActivo'))
})

verificar('compararResultados: datosNoConfirmados nunca participa (marca informativa, no diferencia financiera, spec.md 38.5)', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const historico: ResultadoGuardado = { ...aResultadoGuardado(actual), datosNoConfirmados: [{ campo: 'x', motivo: 'fixture de prueba, no un dato real' } as unknown as ResultadoMetricas['datosNoConfirmados'][number]] }
  const r = compararResultados(historico, actual)
  assert.equal(r.estado, 'COINCIDE')
  assert.ok(!r.diferencias.some((d) => d.clave.includes('datosNoConfirmados')))
  assert.ok(!r.clavesNoComparables.includes('datosNoConfirmados'))
})

verificar('compararResultados: alterar el histórico no altera el resultado recalculado (decisión 2)', () => {
  const actual1 = calcularMetricas(parametrosA, semanasA)
  const historicoAlterado: ResultadoGuardado = { ...aResultadoGuardado(actual1), resultadoNeto: -999_999_999 }
  compararResultados(historicoAlterado, actual1) // solo compara, nunca escribe ni realimenta el cálculo
  const actual2 = calcularMetricas(parametrosA, semanasA)
  assert.equal(actual2.resultadoNeto, actual1.resultadoNeto)
})

verificar('compararResultados: histórico sin ninguna clave comparable -> NO_COMPARABLE (nunca "coincide" sin haber comparado nada)', () => {
  const actual = calcularMetricas(parametrosA, semanasA)
  const r = compararResultados({} as unknown as ResultadoGuardado, actual)
  assert.equal(r.estado, 'NO_COMPARABLE')
  assert.equal(r.mensaje, 'No hay datos comparables entre el resultado histórico y el resultado actual.')
})

console.log(`\n${casos} casos de presupuestos guardados (B1, dominio puro) verificados, todos OK.`)
