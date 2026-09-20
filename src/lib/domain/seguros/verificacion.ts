// KAI-29 — Verificación del cronograma nominal del seguro (spec.md 28.10-28.12).
// Mismo mecanismo que `presupuesto/verificacion.ts`: sin framework de
// pruebas nuevo; se compila con `tsc` y se ejecuta con node.
//
//   npm run verificar:seguros   (desde web/)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  COLUMNAS_FINANCIACION_COTIZACION,
  calcularCronogramaSeguro,
  cotizacionDesdeRegistro,
  resolverLecturaCotizacion,
  type FinanciacionSeguroFila,
  type FinanciacionSeguroRegistro,
} from './adaptador'
import { generarCronogramaNominal, type EntradaCronogramaNominal } from './cronogramaNominal'

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

// Datos de la cotización de la aseguradora (spec.md 26.1 y 28.12).
// Estado: CONFIRMADO_POR_COTIZACION (el día 5 es REPORTADO_SIN_SOPORTE_DOCUMENTAL).
// `fechaPrimeraCuota` está PENDIENTE: se deja en null a propósito.
const VALOR_POLIZA = 1_711_586
const PAGO_INICIAL = 256_738
const GRAVAMEN_4X1000 = 5_819
const VALOR_FINANCIADO = 1_454_848
const CUOTA = 155_839

const COTIZACION: EntradaCronogramaNominal = {
  fechaOperacion: null,
  fechaPrimeraCuota: null,
  numeroCuotas: 10,
  valorCuota: CUOTA,
  cuotaEsAproximada: true,
  diaVencimiento: 5,
  periodicidad: 'MENSUAL',
  pagoInicial: PAGO_INICIAL,
  gravamen4x1000: GRAVAMEN_4X1000,
  valorFinanciado: VALOR_FINANCIADO,
}

verificar('conciliación de la cotización: 256.738 + 5.819 = 262.557 y 1.711.586 − 256.738 = 1.454.848', () => {
  assert.equal(PAGO_INICIAL + GRAVAMEN_4X1000, 262_557)
  assert.equal(VALOR_POLIZA - PAGO_INICIAL, VALOR_FINANCIADO)
})

verificar('10 cuotas de $155.839, con índice relativo 1..10', () => {
  const c = generarCronogramaNominal(COTIZACION)
  assert.equal(c.cuotas.length, 10)
  assert.deepEqual(c.cuotas.map((x) => x.indice), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.ok(c.cuotas.every((x) => x.monto === 155_839))
})

verificar('10 × 155.839 = 1.558.390 (total nominal de cuotas)', () => {
  assert.equal(generarCronogramaNominal(COTIZACION).totalCuotasNominal, 1_558_390)
})

verificar('1.558.390 − 1.454.848 = 103.542 como costo_financiero_nominal_total (diferencia nominal, NO interés)', () => {
  assert.equal(generarCronogramaNominal(COTIZACION).costoFinancieroNominalTotal, 103_542)
})

verificar('pago inicial total $262.557 y total nominal $1.820.947', () => {
  const c = generarCronogramaNominal(COTIZACION)
  assert.equal(c.pagoInicial?.monto, 256_738)
  assert.equal(c.pagoInicial?.gravamen, 5_819)
  assert.equal(c.pagoInicial?.total, 262_557)
  assert.equal(c.totalNominal, 1_820_947)
  // identidad: póliza + diferencia nominal + 4×1000 = total nominal
  assert.equal(VALOR_POLIZA + (c.costoFinancieroNominalTotal as number) + GRAVAMEN_4X1000, c.totalNominal)
})

verificar('AUSENCIA de tasa contractual: el resultado no contiene tasa, interés, sistema, capital pendiente ni saldo', () => {
  const texto = JSON.stringify(generarCronogramaNominal(COTIZACION)).toLowerCase()
  for (const prohibido of ['tasa', 'interes', 'interés', 'sistema', 'saldo', 'capitalpendiente']) {
    assert.ok(!texto.includes(prohibido), `el resultado no debe contener "${prohibido}"`)
  }
})

verificar('AUSENCIA de fecha de primera cuota: ninguna fecha inventada, cuotas SIN_FECHA y advertencia explícita', () => {
  const c = generarCronogramaNominal(COTIZACION)
  assert.ok(c.cuotas.every((x) => x.fecha === null && x.estado === 'SIN_FECHA'))
  assert.equal(c.pagoInicial?.fecha, null)
  assert.ok(c.advertencias.some((a) => a.includes('fecha_primera_cuota PENDIENTE')))
})

verificar('la cuota aproximada se propaga como advertencia (los totales heredan la aproximación)', () => {
  const c = generarCronogramaNominal(COTIZACION)
  assert.equal(c.cuotaEsAproximada, true)
  assert.ok(c.advertencias.some((a) => a.includes('aproximado')))
})

verificar('con una fecha de primera cuota (solo ilustrativa): día 5 de cada mes, sin sumar 30 días', () => {
  const c = generarCronogramaNominal({ ...COTIZACION, fechaPrimeraCuota: '2027-01-05' })
  assert.deepEqual(
    c.cuotas.map((x) => x.fecha),
    ['2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05', '2027-07-05', '2027-08-05', '2027-09-05', '2027-10-05'],
  )
  assert.ok(c.cuotas.every((x) => x.estado === 'CON_FECHA' && (x.fecha as string).endsWith('-05')))
})

verificar('cruce de año conserva el día 5 (nov → dic → ene)', () => {
  const c = generarCronogramaNominal({ ...COTIZACION, fechaPrimeraCuota: '2026-11-05', numeroCuotas: 3 })
  assert.deepEqual(c.cuotas.map((x) => x.fecha), ['2026-11-05', '2026-12-05', '2027-01-05'])
})

verificar('una fecha de primera cuota con día distinto al de vencimiento se rechaza (no se infiere)', () => {
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, fechaPrimeraCuota: '2027-01-06' }), /no coincide con el día de vencimiento/)
})

verificar('día de vencimiento > 28 se rechaza: la regla de fechas inexistentes (R15) está PENDIENTE', () => {
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, diaVencimiento: 31 }), /R15/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, diaVencimiento: 29 }), /R15/)
})

verificar('entradas inválidas se rechazan explícitamente (nunca 0 ni valores por defecto silenciosos)', () => {
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, numeroCuotas: 0 }), /numeroCuotas/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, numeroCuotas: 2.5 }), /numeroCuotas/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, valorCuota: 0 }), /valorCuota/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, valorCuota: -1 }), /valorCuota/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, diaVencimiento: 0 }), /diaVencimiento/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, fechaPrimeraCuota: '2027-13-05' }), /fecha/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, pagoInicial: -1 }), /pagoInicial/)
  assert.throws(() => generarCronogramaNominal({ ...COTIZACION, periodicidad: 'SEMANAL' as never }), /periodicidad/)
})

verificar('sin datos opcionales no se inventan derivados: sin valor financiado ni pago inicial, quedan en null', () => {
  const c = generarCronogramaNominal({ numeroCuotas: 10, valorCuota: CUOTA, diaVencimiento: 5, periodicidad: 'MENSUAL' })
  assert.equal(c.costoFinancieroNominalTotal, null)
  assert.equal(c.pagoInicial, null)
  assert.equal(c.totalNominal, null)
  assert.equal(c.totalCuotasNominal, 1_558_390)
})

verificar('sin 4×1000 informado, el pago inicial total no es determinable (null, con advertencia)', () => {
  const c = generarCronogramaNominal({ ...COTIZACION, gravamen4x1000: null })
  assert.equal(c.pagoInicial?.total, null)
  assert.equal(c.totalNominal, null)
  assert.ok(c.advertencias.some((a) => a.includes('4×1000')))
})

// ===== Adaptador fila de `financiaciones_seguro` -> cronograma nominal (plan.md 14) =====

const REGISTRO: FinanciacionSeguroRegistro = {
  valor_financiado: '1454848', // NUMERIC puede llegar como cadena
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
    cuota_valor: 'CONFIRMADO_POR_COTIZACION',
    dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL',
    tasa: 'CONFIRMADO_POR_COTIZACION', // columna sin campo nominal: se ignora
    numero_cuotas: 'ESTADO_INVENTADO', // fuera del vocabulario oficial: no se interpreta
  },
}

verificar('adaptador: la fila se convierte (cadenas numéricas incluidas) y produce el mismo cronograma nominal (103.542; 1.820.947)', () => {
  const c = cotizacionDesdeRegistro(REGISTRO)
  assert.ok(c)
  assert.deepEqual(c!.entrada, { ...COTIZACION })
  const r = calcularCronogramaSeguro(c!)
  assert.equal(r.error, null)
  assert.equal(r.cronograma?.costoFinancieroNominalTotal, 103_542)
  assert.equal(r.cronograma?.totalNominal, 1_820_947)
})

verificar('adaptador: copia el estado de cada dato tal cual; ignora columnas sin campo nominal y estados fuera del vocabulario', () => {
  const c = cotizacionDesdeRegistro(REGISTRO)!
  assert.deepEqual(c.estadoDatos, { valorCuota: 'CONFIRMADO_POR_COTIZACION', diaVencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' })
  assert.ok(!Object.values(c.estadoDatos).includes('CONFIRMADO_DOCUMENTALMENTE'), 'nada se promueve a CONFIRMADO_DOCUMENTALMENTE')
  assert.deepEqual(cotizacionDesdeRegistro({ ...REGISTRO, estado_datos_campos: null })!.estadoDatos, {}, 'sin estados no se inventan')
})

verificar('adaptador: si falta un dato indispensable del cronograma no hay cotización utilizable (no se rellena con defectos)', () => {
  for (const campo of ['numero_cuotas', 'cuota_valor', 'dia_vencimiento', 'periodicidad'] as const) {
    assert.equal(cotizacionDesdeRegistro({ ...REGISTRO, [campo]: null }), null, campo)
  }
  assert.equal(cotizacionDesdeRegistro({ ...REGISTRO, cuota_valor: 'abc' }), null)
})

verificar('adaptador: un dato inválido se informa como error del cronograma, no se corrige ni lanza', () => {
  const c = cotizacionDesdeRegistro({ ...REGISTRO, dia_vencimiento: 31 })!
  const r = calcularCronogramaSeguro(c)
  assert.equal(r.cronograma, null)
  assert.match(r.error ?? '', /R15/)
})

// ===== Selección de la financiación vigente (lectura del servidor) =====

const FILA: FinanciacionSeguroFila = { ...REGISTRO, id: 'fin-1', estado_datos_campos: { cuota_valor: 'CONFIRMADO_POR_COTIZACION', dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' } }

verificar('lectura: sin financiaciones activas -> SIN_COTIZACION (sin cotización ni mensaje)', () => {
  const l = resolverLecturaCotizacion([])
  assert.deepEqual(l, { estado: 'SIN_COTIZACION', financiacionId: null, cotizacion: null, mensaje: null })
})

verificar('lectura: exactamente una activa completa -> CARGADA con su cotización y estados', () => {
  const l = resolverLecturaCotizacion([FILA])
  assert.equal(l.estado, 'CARGADA')
  assert.equal(l.financiacionId, 'fin-1')
  assert.equal(l.cotizacion?.estadoDatos.diaVencimiento, 'REPORTADO_SIN_SOPORTE_DOCUMENTAL')
})

verificar('lectura: con varias activas no se elige ninguna (no se adivina; se informa el motivo real)', () => {
  const l = resolverLecturaCotizacion([FILA, { ...FILA, id: 'fin-2' }])
  assert.equal(l.estado, 'VARIAS_ACTIVAS')
  assert.equal(l.cotizacion, null)
  assert.match(l.mensaje ?? '', /2 financiaciones/)
})

verificar('lectura: una activa sin datos indispensables -> DATOS_INCOMPLETOS (no se rellena)', () => {
  const l = resolverLecturaCotizacion([{ ...FILA, cuota_valor: null }])
  assert.equal(l.estado, 'DATOS_INCOMPLETOS')
  assert.equal(l.financiacionId, 'fin-1')
  assert.equal(l.cotizacion, null)
  assert.match(l.mensaje ?? '', /indispensables/)
})

verificar('lectura: las columnas que se piden a la base de datos son exactamente las que usa el adaptador', () => {
  const pedidas = COLUMNAS_FINANCIACION_COTIZACION.split(',').map((c) => c.trim())
  assert.deepEqual(pedidas.filter((c) => c !== 'id').sort(), Object.keys(REGISTRO).sort())
})

verificar('el módulo no contiene valores legacy ni tasas (escaneo del código fuente, spec.md 27.1 y 28.10)', () => {
  const carpeta = path.resolve(__dirname, '../src/lib/domain/seguros')
  const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.ts') && f !== 'verificacion.ts')
  assert.ok(archivos.length >= 2, 'debe haber archivos fuente que escanear')
  const legacy: [string, RegExp][] = [
    ['$3.453.177', /3[_.,]?453[_.,]?177/],
    ['$2.500.000', /2[_.,]?500[_.,]?000/],
    ['29% EA', /29\s*%|0[.,]29\b/],
    ['72 meses', /72\s*meses/i],
    ['tasa derivada 1,269972', /1[.,]269972/],
    ['tasa derivada 16,35% / 15,24%', /16[.,]35|15[.,]24/],
    ['cuota lineal 82.683', /82[_.,]?683/],
  ]
  for (const archivo of archivos) {
    const contenido = fs.readFileSync(path.join(carpeta, archivo), 'utf8')
    for (const [nombre, patron] of legacy) {
      assert.ok(!patron.test(contenido), `${archivo} contiene el valor legacy o la tasa derivada (${nombre})`)
    }
  }
})

console.log(`\n${casos} casos verificados, todos OK.`)
