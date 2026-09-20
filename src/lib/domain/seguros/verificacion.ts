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
import { TEXTOS_VISTA_COTIZACION, construirVistaCotizacionSeguro, textoEstado } from './vistaCotizacion'

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

// ===== Vista informativa de la cotización (spec.md 34) =====
// Tarjeta de solo lectura: estos casos fijan los textos aprobados literalmente y comprueban que la
// vista solo reordena datos existentes (nada nuevo, nada promovido).

const REGISTRO_CARGADO: FinanciacionSeguroRegistro = {
  ...REGISTRO,
  poliza: { valor_poliza: '1711586', estado_datos_campos: { valor_poliza: 'CONFIRMADO_POR_COTIZACION' } },
  estado_datos_campos: {
    valor_financiado: 'CONFIRMADO_POR_COTIZACION',
    pago_inicial: 'CONFIRMADO_POR_COTIZACION',
    gravamen_4x1000: 'CONFIRMADO_POR_COTIZACION',
    numero_cuotas: 'CONFIRMADO_POR_COTIZACION',
    periodicidad: 'CONFIRMADO_POR_COTIZACION',
    cuota_valor: 'CONFIRMADO_POR_COTIZACION',
    cuota_es_aproximada: 'CONFIRMADO_POR_COTIZACION',
    dia_vencimiento: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL',
  },
}
const COTIZACION_CARGADA = cotizacionDesdeRegistro(REGISTRO_CARGADO)!
const NOMINAL_CARGADO = calcularCronogramaSeguro(COTIZACION_CARGADA)
const VISTA = construirVistaCotizacionSeguro(COTIZACION_CARGADA, NOMINAL_CARGADO)!

verificar('vista (cotización CARGADA): título, subtítulo, nota fija y etiquetas de filas y totales son EXACTAMENTE los aprobados, en orden', () => {
  assert.ok(VISTA)
  assert.equal(VISTA.titulo, 'Financiación del seguro (cotización)')
  assert.equal(VISTA.subtitulo, 'Datos informativos de la cotización: no participan en ROI, payback, caja ni resultado neto.')
  assert.equal(VISTA.nota, 'La diferencia nominal no es un interés ni una tasa: la tasa, el sistema de amortización y el saldo siguen pendientes de documento.')
  assert.deepEqual(
    VISTA.filas.map((f) => f.etiqueta),
    ['Valor de la póliza', 'Pago inicial', '4×1000 del pago inicial', 'Pago inicial total', 'Valor financiado', 'Número de cuotas', 'Valor de cada cuota (aproximado)', 'Periodicidad', 'Día de vencimiento'],
  )
  assert.deepEqual(
    VISTA.totales.map((f) => f.etiqueta),
    ['Total de las cuotas', 'Diferencia nominal sobre lo financiado', 'Total nominal (pago inicial + cuotas)'],
  )
})

verificar('vista: valores nominales de la cotización (256.738; 5.819; 262.557; 1.454.848; 10; 155.839; Mensual; día 5)', () => {
  const valor = (etiqueta: string) => VISTA.filas.find((f) => f.etiqueta === etiqueta)?.valor
  assert.equal(valor('Valor de la póliza'), 1_711_586)
  assert.equal(valor('Pago inicial'), 256_738)
  assert.equal(valor('4×1000 del pago inicial'), 5_819)
  assert.equal(valor('Pago inicial total'), 262_557)
  assert.equal(valor('Valor financiado'), 1_454_848)
  assert.equal(valor('Número de cuotas'), 10)
  assert.equal(valor('Valor de cada cuota (aproximado)'), 155_839)
  assert.equal(valor('Periodicidad'), 'Mensual')
  assert.equal(valor('Día de vencimiento'), 5)
})

verificar('vista: total de las cuotas 1.558.390, diferencia nominal 103.542 y total nominal 1.820.947 (los mismos números del cronograma nominal, sin cálculo nuevo)', () => {
  const total = (etiqueta: string) => VISTA.totales.find((f) => f.etiqueta === etiqueta)?.valor
  assert.equal(total('Total de las cuotas'), 1_558_390)
  assert.equal(total('Diferencia nominal sobre lo financiado'), 103_542)
  assert.equal(total('Total nominal (pago inicial + cuotas)'), 1_820_947)
  assert.equal(total('Total de las cuotas'), NOMINAL_CARGADO.cronograma!.totalCuotasNominal)
  assert.equal(total('Diferencia nominal sobre lo financiado'), NOMINAL_CARGADO.cronograma!.costoFinancieroNominalTotal)
  assert.equal(total('Total nominal (pago inicial + cuotas)'), NOMINAL_CARGADO.cronograma!.totalNominal)
  assert.ok(VISTA.totales.every((f) => f.estado === null), 'los totales no son un dato informado: no llevan estado')
})

verificar('vista: estados documentales tal como constan — "Confirmado por cotización" y el día 5 solo como "Reportado, sin soporte documental"', () => {
  const estado = (etiqueta: string) => VISTA.filas.find((f) => f.etiqueta === etiqueta)?.estado
  for (const e of ['Valor de la póliza', 'Pago inicial', '4×1000 del pago inicial', 'Valor financiado', 'Número de cuotas', 'Valor de cada cuota (aproximado)', 'Periodicidad']) {
    assert.equal(estado(e), 'Confirmado por cotización', e)
  }
  assert.equal(estado('Día de vencimiento'), 'Reportado, sin soporte documental')
  assert.equal(estado('Pago inicial total'), null, 'la suma no es un dato informado')
  const usados = new Set(VISTA.filas.map((f) => f.estado).filter(Boolean))
  assert.deepEqual([...usados].sort(), ['Confirmado por cotización', 'Reportado, sin soporte documental'])
})

verificar('vista: ningún estado se promueve — CONFIRMADO_DOCUMENTALMENTE (u otro estado) no recibe texto y el día 5 nunca sale como confirmado', () => {
  assert.equal(textoEstado('CONFIRMADO_DOCUMENTALMENTE'), null)
  assert.equal(textoEstado('DERIVADO'), null)
  assert.equal(textoEstado('LEGACY_NO_CONFIRMADO'), null)
  assert.equal(textoEstado(undefined), null)
  const promovida = { ...COTIZACION_CARGADA, estadoDatos: { ...COTIZACION_CARGADA.estadoDatos, diaVencimiento: 'CONFIRMADO_DOCUMENTALMENTE' as const } }
  const v = construirVistaCotizacionSeguro(promovida, NOMINAL_CARGADO)!
  assert.equal(v.filas.find((f) => f.etiqueta === 'Día de vencimiento')?.estado, null, 'sin texto: la vista no lo presenta como confirmado')
  assert.ok(!JSON.stringify(v).includes('documentalmente'), 'la vista no menciona confirmación documental')
})

verificar('vista: con fecha_primera_cuota NULL muestra "Fecha de la primera cuota: Pendiente" (sin mes, año ni fecha inventados)', () => {
  assert.equal(REGISTRO_CARGADO.fecha_primera_cuota, null)
  assert.equal(VISTA.fechaPrimeraCuota, 'Fecha de la primera cuota: Pendiente')
  assert.ok(!/\d{2}-\d{2}-\d{4}/.test(VISTA.fechaPrimeraCuota))
  // Solo si algún día se informa la fecha (fixture de prueba, no un dato real) se muestra en DD-MM-AAAA.
  const conFecha = cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, fecha_primera_cuota: '2026-11-05' })!
  const v = construirVistaCotizacionSeguro(conFecha, calcularCronogramaSeguro(conFecha))!
  assert.equal(v.fechaPrimeraCuota, 'Fecha de la primera cuota: 05-11-2026')
})

verificar('vista (presupuesto sin cotización): sin bloque cuando el presupuesto no tiene cotización (cualquier estado de lectura la deja en null) o su cronograma no es válido', () => {
  for (const estado of ['SIN_COTIZACION', 'VARIAS_ACTIVAS', 'DATOS_INCOMPLETOS', 'ERROR'] as const) {
    const lectura = resolverLecturaCotizacion(estado === 'SIN_COTIZACION' ? [] : estado === 'VARIAS_ACTIVAS' ? [FILA, { ...FILA, id: 'fin-2' }] : estado === 'DATOS_INCOMPLETOS' ? [{ ...FILA, cuota_valor: null }] : [])
    assert.equal(construirVistaCotizacionSeguro(lectura.cotizacion, null), null, estado)
  }
  assert.equal(construirVistaCotizacionSeguro(null, NOMINAL_CARGADO), null, 'presupuesto sin cotización')
  assert.equal(construirVistaCotizacionSeguro(COTIZACION_CARGADA, null), null, 'sin cronograma')
  assert.equal(construirVistaCotizacionSeguro(COTIZACION_CARGADA, { cronograma: null, error: 'dato inválido' }), null, 'cronograma inválido')
})

verificar('vista: un dato no informado no genera fila (no se inventa nada) y es estrictamente informativa: sin tasa, interés, amortización ni saldo en filas y totales', () => {
  const sinGravamen = cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, gravamen_4x1000: null })!
  const v = construirVistaCotizacionSeguro(sinGravamen, calcularCronogramaSeguro(sinGravamen))!
  assert.ok(!v.filas.some((f) => f.etiqueta === '4×1000 del pago inicial' || f.etiqueta === 'Pago inicial total'))
  assert.ok(!v.totales.some((f) => f.etiqueta === 'Total nominal (pago inicial + cuotas)'), 'sin 4×1000 el total nominal no es determinable')
  for (const f of [...VISTA.filas, ...VISTA.totales]) assert.ok(!/inter[eé]s|tasa|amortizaci|saldo|proyecci/i.test(f.etiqueta), f.etiqueta)
  assert.ok(VISTA.subtitulo.includes('no participan en ROI, payback, caja ni resultado neto'), 'conserva la advertencia de que no participa en los indicadores')
  assert.equal(TEXTOS_VISTA_COTIZACION.etiquetas.diferenciaNominal, 'Diferencia nominal sobre lo financiado', 'la diferencia nominal nunca se llama interés')
})

verificar('adaptador: la póliza embebida aporta el valor de la póliza y su estado tal como consta (objeto o arreglo de un elemento); sin póliza no se inventa', () => {
  assert.deepEqual(COTIZACION_CARGADA.poliza, { valorPoliza: 1_711_586, estadoValorPoliza: 'CONFIRMADO_POR_COTIZACION' })
  const enArreglo = cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, poliza: [{ valor_poliza: 1711586, estado_datos_campos: null }] })!
  assert.deepEqual(enArreglo.poliza, { valorPoliza: 1_711_586 }, 'sin estado informado no se asume ninguno')
  assert.equal(cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, poliza: null })!.poliza, undefined)
  assert.equal(cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, poliza: { valor_poliza: null, estado_datos_campos: null } })!.poliza?.valorPoliza, null)
  const v = construirVistaCotizacionSeguro(cotizacionDesdeRegistro({ ...REGISTRO_CARGADO, poliza: null })!, NOMINAL_CARGADO)!
  assert.ok(!v.filas.some((f) => f.etiqueta === 'Valor de la póliza'), 'sin póliza no hay fila de póliza')
})

// ===== Presupuestos independientes (spec.md 36): nada es global =====

const REGISTRO_OTRO: FinanciacionSeguroRegistro = {
  ...REGISTRO_CARGADO,
  valor_financiado: 900_000,
  pago_inicial: 150_000,
  gravamen_4x1000: 3_600,
  numero_cuotas: 12,
  cuota_valor: 80_000,
  dia_vencimiento: 15,
  poliza: { valor_poliza: 1_050_000, estado_datos_campos: { valor_poliza: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' } },
  estado_datos_campos: { ...REGISTRO_CARGADO.estado_datos_campos, dia_vencimiento: 'CONFIRMADO_POR_COTIZACION', cuota_valor: 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' },
}
const COTIZACION_OTRA = cotizacionDesdeRegistro(REGISTRO_OTRO)!
const VISTA_OTRA = construirVistaCotizacionSeguro(COTIZACION_OTRA, calcularCronogramaSeguro(COTIZACION_OTRA))!

verificar('presupuestos independientes: un presupuesto muestra su financiación de seguro y otro presupuesto muestra valores DIFERENTES (los del segundo, con sus propios estados)', () => {
  const valor = (v: NonNullable<typeof VISTA>, e: string) => [...v.filas, ...v.totales].find((f) => f.etiqueta === e)?.valor
  const estado = (v: NonNullable<typeof VISTA>, e: string) => v.filas.find((f) => f.etiqueta === e)?.estado
  // Presupuesto A: la cotización cargada
  assert.equal(valor(VISTA, 'Valor de la póliza'), 1_711_586)
  assert.equal(valor(VISTA, 'Número de cuotas'), 10)
  assert.equal(valor(VISTA, 'Total de las cuotas'), 1_558_390)
  // Presupuesto B: otra póliza, otro valor financiado, otras cuotas
  assert.equal(valor(VISTA_OTRA, 'Valor de la póliza'), 1_050_000)
  assert.equal(valor(VISTA_OTRA, 'Valor financiado'), 900_000)
  assert.equal(valor(VISTA_OTRA, 'Número de cuotas'), 12)
  assert.equal(valor(VISTA_OTRA, 'Valor de cada cuota (aproximado)'), 80_000)
  assert.equal(valor(VISTA_OTRA, 'Día de vencimiento'), 15)
  assert.equal(valor(VISTA_OTRA, 'Total de las cuotas'), 960_000)
  assert.equal(valor(VISTA_OTRA, 'Diferencia nominal sobre lo financiado'), 60_000)
  assert.equal(valor(VISTA_OTRA, 'Total nominal (pago inicial + cuotas)'), 1_113_600)
  assert.equal(estado(VISTA_OTRA, 'Valor de la póliza'), 'Reportado, sin soporte documental')
  assert.equal(estado(VISTA_OTRA, 'Día de vencimiento'), 'Confirmado por cotización', 'cada presupuesto conserva SUS estados; no se copian los del otro')
  assert.equal(estado(VISTA, 'Día de vencimiento'), 'Reportado, sin soporte documental')
})

verificar('presupuestos independientes: los valores no son globales — la vista es una función pura de la cotización del presupuesto (sin memoria entre llamadas)', () => {
  const nominalA = calcularCronogramaSeguro(COTIZACION_CARGADA)
  const nominalB = calcularCronogramaSeguro(COTIZACION_OTRA)
  const secuencia = [
    construirVistaCotizacionSeguro(COTIZACION_CARGADA, nominalA),
    construirVistaCotizacionSeguro(COTIZACION_OTRA, nominalB),
    construirVistaCotizacionSeguro(null, null),
    construirVistaCotizacionSeguro(COTIZACION_CARGADA, nominalA),
    construirVistaCotizacionSeguro(COTIZACION_OTRA, nominalB),
  ]
  assert.deepEqual(secuencia[0], VISTA)
  assert.deepEqual(secuencia[3], VISTA, 'volver al presupuesto A da exactamente lo mismo que la primera vez')
  assert.deepEqual(secuencia[1], VISTA_OTRA)
  assert.deepEqual(secuencia[4], VISTA_OTRA)
  assert.equal(secuencia[2], null, 'un presupuesto sin cotización no hereda la del anterior')
  assert.notDeepEqual(VISTA, VISTA_OTRA)
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
