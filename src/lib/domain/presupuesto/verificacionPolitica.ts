// KAI-29 — Verificación de D8 (política financiera) y de los textos aprobados (spec.md 39.1, 39.8.2, 39.9).
// Mismo mecanismo que el resto de suites: tsc + node, sin framework. Corre dentro de `verificar:presupuesto`.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { clavesDesconocidas } from './esquemaSnapshot'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA } from './parametros'
import {
  CLAVE_POLITICA_FINANCIERA,
  POLITICA_FINANCIERA_V1 as P,
  clasificarPayback,
  clasificarRoi,
  evaluarPolitica,
  leerPoliticaGuardada,
  paybackMaximo,
  roiMinimo,
  validarPolitica,
  type PoliticaFinanciera,
} from './politicaFinanciera'
import { reconocerSnapshot } from './reconocerSnapshot'
import { TEXTOS_APROBADOS as T, etiquetarErrorValidacion, textoIncumplimiento, textoObservacion } from './textosInterfaz'
import { FINANCIAL_MODEL_VERSION } from './version'

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

const ev = (roi: number, payback: number | null) => evaluarPolitica({ roiSobreInversionTotal: roi, paybackFlujoContractualCompleto: payback }, P)
const pctTest = (v: number) => `${(v * 100).toFixed(2)}%`

verificar('D8: valores aprobados de la política (ROI 20/30/60 %, payback 52/78/104 semanas; mínimo 30 %, máximo 104)', () => {
  assert.deepEqual(P.roiCortes, [0.2, 0.3, 0.6])
  assert.deepEqual(P.paybackCortesSemanas, [52, 78, 104])
  assert.equal(roiMinimo(P), 0.3)
  assert.equal(paybackMaximo(P), 104)
  assert.deepEqual(validarPolitica(P), [])
})

verificar('D8: clasificación del ROI en los bordes exactos (AC-44)', () => {
  assert.equal(clasificarRoi(0.1999, P), 'MUY_BAJO')
  assert.equal(clasificarRoi(0.2, P), 'BAJO')
  assert.equal(clasificarRoi(0.2999, P), 'BAJO')
  assert.equal(clasificarRoi(0.3, P), 'BUENO')
  assert.equal(clasificarRoi(0.5999, P), 'BUENO')
  assert.equal(clasificarRoi(0.6, P), 'EXCELENTE')
  assert.equal(clasificarRoi(-0.5, P), 'MUY_BAJO')
})

verificar('D8: clasificación del payback en los bordes exactos, y no alcanzado = RIESGO ALTO (AC-44, DEC-8)', () => {
  assert.equal(clasificarPayback(52, P), 'RIESGO_BAJO')
  assert.equal(clasificarPayback(53, P), 'RIESGO_MEDIO')
  assert.equal(clasificarPayback(78, P), 'RIESGO_MEDIO')
  assert.equal(clasificarPayback(79, P), 'RIESGO_ELEVADO')
  assert.equal(clasificarPayback(104, P), 'RIESGO_ELEVADO')
  assert.equal(clasificarPayback(105, P), 'RIESGO_ALTO')
  assert.equal(clasificarPayback(null, P), 'RIESGO_ALTO')
})

verificar('D8: veredicto de los tres casos de spec.md 39.1.1 con la Opción A (DEC-1)', () => {
  // Escenario de referencia real: ROI 41,0 %, payback semana 87 → cumple la regla, payback en zona de observación.
  const ref = calcularMetricas(PARAMETROS_REFERENCIA, 0)
  const eRef = evaluarPolitica(ref, P)
  assert.equal(ref.paybackFlujoContractualCompleto, 87)
  assert.equal(eRef.veredicto, 'CUMPLE_CON_OBSERVACIONES')
  assert.deepEqual(eRef.observaciones, [{ tipo: 'PAYBACK_RIESGO_ELEVADO', semana: 87 }])
  assert.equal(ev(0.25, 60).veredicto, 'NO_CUMPLE')
  assert.equal(ev(0.25, 60).clasificacionRoi, 'BAJO')
  assert.equal(ev(0.45, 100).veredicto, 'CUMPLE_CON_OBSERVACIONES')
})

verificar('D8: CUMPLE solo sin incumplimientos ni observaciones; NO_CUMPLE enumera cada condición incumplida (AC-43)', () => {
  assert.equal(ev(0.45, 60).veredicto, 'CUMPLE')
  assert.equal(ev(0.3, 104).veredicto, 'CUMPLE_CON_OBSERVACIONES')
  assert.equal(ev(0.3, 78).veredicto, 'CUMPLE')
  const ambos = ev(0.1, 120)
  assert.equal(ambos.veredicto, 'NO_CUMPLE')
  assert.deepEqual(
    ambos.incumplimientos.map((i) => i.tipo),
    ['ROI_BAJO_MINIMO', 'PAYBACK_SOBRE_MAXIMO'],
  )
  assert.deepEqual(ambos.observaciones, [], 'NO_CUMPLE no lleva observaciones')
  const noAlcanzado = ev(0.5, null)
  assert.equal(noAlcanzado.veredicto, 'NO_CUMPLE')
  assert.deepEqual(noAlcanzado.incumplimientos, [{ tipo: 'PAYBACK_NO_ALCANZADO' }])
})

verificar('D8: comparación sin redondeo — 29,996 % no cumple aunque en pantalla se lea 30,0 %', () => {
  assert.equal(ev(0.29996, 60).veredicto, 'NO_CUMPLE')
  assert.equal(ev(0.3, 60).veredicto, 'CUMPLE')
})

verificar('D8: el ROI sobre recursos propios no participa en el veredicto (AC-47)', () => {
  const r = calcularMetricas(PARAMETROS_REFERENCIA, 0)
  const base = evaluarPolitica(r, P)
  for (const roiRp of [-10, 0, 1e9, null]) {
    const conOtroRoiRp = { ...r, roiSobreRecursosPropios: roiRp }
    assert.deepEqual(evaluarPolitica(conOtroRoiRp, P), base)
  }
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../src/lib/domain/presupuesto/politicaFinanciera.ts'), 'utf8')
  assert.ok(!fuente.includes('roiSobreRecursosPropios'), 'politicaFinanciera.ts no menciona el ROI sobre recursos propios')
})

verificar('D8: la política usa los umbrales que recibe (una política editada cambia el veredicto)', () => {
  const exigente: PoliticaFinanciera = { version: 'POLITICA_FINANCIERA_V1', roiCortes: [0.3, 0.5, 0.8], paybackCortesSemanas: [40, 60, 80] }
  const r = calcularMetricas(PARAMETROS_REFERENCIA, 0)
  const e = evaluarPolitica(r, exigente)
  assert.equal(e.veredicto, 'NO_CUMPLE')
  assert.deepEqual(e.incumplimientos.map((i) => i.tipo), ['ROI_BAJO_MINIMO', 'PAYBACK_SOBRE_MAXIMO'])
})

verificar('D8: validarPolitica rechaza orden inválido, negativos, NaN, payback no entero, versión y estructura (AC-45)', () => {
  const con = (cambios: Partial<PoliticaFinanciera>) => ({ ...P, ...cambios })
  assert.ok(validarPolitica(con({ roiCortes: [0.3, 0.2, 0.6] })).length > 0)
  assert.ok(validarPolitica(con({ roiCortes: [-0.1, 0.3, 0.6] })).length > 0)
  assert.ok(validarPolitica(con({ roiCortes: [0.2, 0.3, 0.3] })).length > 0)
  assert.ok(validarPolitica(con({ roiCortes: [0.2, Number.NaN, 0.6] })).length > 0)
  assert.ok(validarPolitica(con({ paybackCortesSemanas: [52, 52, 104] })).length > 0)
  assert.ok(validarPolitica(con({ paybackCortesSemanas: [0, 78, 104] })).length > 0)
  assert.ok(validarPolitica(con({ paybackCortesSemanas: [52, 78.5, 104] })).length > 0)
  assert.ok(validarPolitica({ ...P, version: 'OTRA' }).length > 0)
  for (const malo of [null, undefined, 3, 'x', [], {}]) assert.ok(validarPolitica(malo).length > 0)
})

verificar('D8: la política congelada se lee del snapshot; ausente = AUSENTE (nunca se completa con la vigente); inválida = INVALIDA (AC-46)', () => {
  const guardada: PoliticaFinanciera = { version: 'POLITICA_FINANCIERA_V1', roiCortes: [0.1, 0.25, 0.5], paybackCortesSemanas: [30, 60, 90] }
  const snapshot = { ...PARAMETROS_REFERENCIA, [CLAVE_POLITICA_FINANCIERA]: guardada }
  const l = leerPoliticaGuardada(snapshot)
  assert.equal(l.estado, 'VALIDA')
  if (l.estado === 'VALIDA') {
    assert.deepEqual(l.politica, guardada)
    assert.notEqual(l.politica.roiCortes, guardada.roiCortes, 'copia en profundidad')
    assert.notDeepEqual(l.politica, P, 'se usan los umbrales guardados, no los vigentes')
  }
  assert.deepEqual(leerPoliticaGuardada(PARAMETROS_REFERENCIA), { estado: 'AUSENTE' })
  assert.equal(leerPoliticaGuardada({ ...PARAMETROS_REFERENCIA, [CLAVE_POLITICA_FINANCIERA]: { version: 'POLITICA_FINANCIERA_V1' } }).estado, 'INVALIDA')
  assert.deepEqual(leerPoliticaGuardada(null), { estado: 'AUSENTE' })
})

verificar('D8: la clave de la política no es desconocida y no entra a los parámetros reconstruidos del motor (AC-49)', () => {
  const snapshot = { ...PARAMETROS_REFERENCIA, [CLAVE_POLITICA_FINANCIERA]: P } as unknown as Record<string, unknown>
  assert.deepEqual(clavesDesconocidas(snapshot), [])
  const r = reconocerSnapshot(snapshot, FINANCIAL_MODEL_VERSION)
  assert.equal(r.estado, 'DETERMINISTA')
  if (r.estado === 'DETERMINISTA') {
    assert.ok(!(CLAVE_POLITICA_FINANCIERA in r.parametros), 'la política no se proyecta a ParametrosPresupuesto')
    assert.deepEqual(r.clavesIgnoradas, [])
  }
  // Un snapshot anterior a D8 (sin la clave) se sigue reconociendo igual.
  assert.equal(reconocerSnapshot(PARAMETROS_REFERENCIA, FINANCIAL_MODEL_VERSION).estado, 'DETERMINISTA')
})

verificar('D8: el motor no lee la política (escaneo de metricas.ts, flujoDeCaja.ts, amortizacion.ts y parametros.ts)', () => {
  for (const archivo of ['metricas.ts', 'flujoDeCaja.ts', 'amortizacion.ts', 'parametros.ts']) {
    const fuente = fs.readFileSync(path.resolve(__dirname, `../../src/lib/domain/presupuesto/${archivo}`), 'utf8')
    assert.ok(!/politica/i.test(fuente), `${archivo} no debe referenciar la política`)
  }
})

verificar('Textos aprobados (spec.md 39.4.1): veredictos, razones, D6 y payback no alcanzado, literales', () => {
  assert.deepEqual(T.veredictos, { CUMPLE: 'CUMPLE LA POLÍTICA', CUMPLE_CON_OBSERVACIONES: 'CUMPLE CON OBSERVACIONES', NO_CUMPLE: 'NO CUMPLE LA POLÍTICA' })
  assert.equal(T.razones.roiBajoMinimo('25,00%', '30,00%'), 'ROI sobre inversión total de 25,00%, por debajo del mínimo de 30,00%.')
  assert.equal(T.razones.paybackSobreMaximo(120, 104), 'Payback contractual en la semana 120, por encima del máximo de 104 semanas.')
  assert.equal(T.razones.paybackNoAlcanzado, 'El payback contractual no se alcanza dentro del contrato.')
  assert.equal(T.razones.paybackRiesgoElevado(87), 'Payback contractual en riesgo elevado (semana 87).')
  assert.equal(T.sinPolitica, 'Este presupuesto se guardó sin política financiera registrada; no se evalúa con la política vigente.')
  assert.equal(T.abonoMinimo.titulo, 'Abono mínimo requerido para cumplir la política')
  assert.equal(T.abonoMinimo.yaCumple, 'La operación ya cumple la política sin abono.')
  assert.equal(T.abonoMinimo.encontrado('12,3%', '$88.000', 3), '12,3% de la cuota mensual ($88.000/mes) desde el mes 3.')
  assert.equal(T.abonoMinimo.noAlcanzableRoi('500,0%', '30,0%'), 'Ningún abono dentro del máximo de 500,0% alcanza el ROI mínimo de 30,0%.')
  assert.equal(T.abonoMinimo.noAlcanzablePayback, 'El abono no modifica el payback contractual: con el payback actual, la política no se alcanza mediante abono.')
  assert.equal(T.abonoMinimo.soloCredito, 'Aplica solo a la modalidad Crédito bancario.')
  assert.equal(T.paybackNoAlcanzadoReal, 'No se alcanza dentro del contrato')
  assert.equal(T.paybackNoAlcanzadoExtrapolado, 'No se alcanza en el horizonte simulado')
  assert.equal(T.equivalencia(87, '20,1'), 'Semana 87 (≈ 20,1 meses)')
  assert.equal(T.origenAvisoM6, 'El cálculo usa la financiación del seguro del modelo anterior (Configuración › Financiación bancaria), sin soporte documental.')
  assert.equal(`${T.seguroUsado.etiqueta}: ${T.seguroUsado.modeloAnterior}`, 'Seguro usado en el cálculo: modelo anterior, no confirmado')
  assert.equal(`${T.seguroUsado.etiqueta}: ${T.seguroUsado.noIncluido}`, 'Seguro usado en el cálculo: no incluido')
  assert.equal(T.flujoContrato, 'Flujo del contrato')
  assert.deepEqual(T.grupos, { economiaActivo: 'Economía del activo', financiacionBancaria: 'Financiación bancaria', contratoConductor: 'Contrato con el conductor' })
})

verificar('Textos: las razones del veredicto salen de los textos aprobados', () => {
  assert.equal(textoIncumplimiento({ tipo: 'ROI_BAJO_MINIMO', roi: 0.25, roiMinimo: 0.3 }, pctTest), 'ROI sobre inversión total de 25.00%, por debajo del mínimo de 30.00%.')
  assert.equal(textoIncumplimiento({ tipo: 'PAYBACK_NO_ALCANZADO' }, pctTest), T.razones.paybackNoAlcanzado)
  assert.equal(textoObservacion({ tipo: 'PAYBACK_RIESGO_ELEVADO', semana: 90 }), 'Payback contractual en riesgo elevado (semana 90).')
})

verificar('Textos con montos derivados de los parámetros, no fijos (AC-54)', () => {
  assert.equal(T.paybackPrincipal('$450.000'), 'Payback contractual completo ($450.000/semana)')
  assert.equal(T.paybackPrincipal('$500.000'), 'Payback contractual completo ($500.000/semana)')
  assert.equal(T.paybackOperativo('$240.000'), 'Payback operativo ($240.000/semana, sin el componente de adquisición)')
  assert.equal(T.plazoAdquisicion('$210.000'), 'Editable: recalcula el valor de venta contractual con el componente de adquisición de $210.000/semana.')
})

verificar('Errores de validación con etiquetas legibles (spec.md 39.9)', () => {
  assert.equal(etiquetarErrorValidacion('cuotaSemanalConductor debe ser mayor que 0 (recibido: -5)'), 'Cuota semanal total del conductor debe ser mayor que 0 (recibido: -5)')
  assert.equal(
    etiquetarErrorValidacion('ahorroSemanalConductor + bonoPatrimonialSemanal no puede exceder cuotaSemanalConductor'),
    'Componente de ahorro semanal + Componente de bono patrimonial semanal no puede exceder Cuota semanal total del conductor',
  )
  assert.equal(
    etiquetarErrorValidacion('seguro.legacy.plazoMeses debe ser un entero mayor que 0 (recibido: 0)'),
    'Plazo de la financiación del seguro debe ser un entero mayor que 0 (recibido: 0)',
  )
  // Un nombre sin etiqueta visible se deja tal cual (no se inventa un texto).
  assert.equal(etiquetarErrorValidacion('soatPeriodicidadMeses debe ser un entero mayor que 0'), 'soatPeriodicidadMeses debe ser un entero mayor que 0')
})

verificar('Interfaz: sin códigos de decisión, AC-xx, "spec.md" ni "Capa A/B/C" en textos visibles (AC-53)', () => {
  const componente = fs.readFileSync(path.resolve(__dirname, '../../src/app/admin/presupuesto/CalculadoraPresupuesto.tsx'), 'utf8')
  // Solo se revisa lo que se renderiza: se quitan comentarios de línea y de bloque (incluidos los de JSX).
  const sinComentarios = componente
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const prohibidos = [/\bD(1[0-5]|[1-9])\b/, /\bAC-\d+/, /spec\.md/, /Capa [ABC]\b/, /\blegacy\b/i]
  for (const re of prohibidos) {
    // `legacy` aparece en identificadores de código (setSeguroLegacy, seguro.legacy…): se revisan solo cadenas y texto JSX.
    const textos = [...sinComentarios.matchAll(/(['"`])((?:(?!\1).)*)\1|>([^<>{}]+)</g)].map((m) => m[2] ?? m[3] ?? '')
    const encontrados = textos.filter((t) => re.test(t) && !/^[\w.-]+$/.test(t.trim()))
    assert.deepEqual(encontrados, [], `texto visible con ${re}`)
  }
  const textosInterfaz = fs.readFileSync(path.resolve(__dirname, '../../src/lib/domain/presupuesto/textosInterfaz.ts'), 'utf8')
  const cadenas = [...textosInterfaz.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? '')
  for (const re of [/\bD(1[0-5]|[1-9])\b/, /\bAC-\d+/, /spec\.md/, /Capa [ABC]\b/]) {
    assert.deepEqual(cadenas.filter((c) => re.test(c)), [], `textosInterfaz.ts con ${re}`)
  }
})

console.log(`\n${casos} casos de la política financiera (D8) y de los textos verificados, todos OK.`)
