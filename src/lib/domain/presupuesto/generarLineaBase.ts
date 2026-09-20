// KAI-29 — HERRAMIENTA DE DESARROLLO para crear `lineaBase.json`. NO es parte de la calculadora
// y CI NUNCA la ejecuta: CI solo compara contra el archivo versionado.
//
//   node .verificacion-presupuesto/presupuesto/generarLineaBase.js <ruta-de-salida.json>
//
// - Genera la línea base desde el código ACTUAL (mismas funciones que usa la calculadora).
// - Se niega a sobrescribir un archivo existente salvo que se pase --sobrescribir. Nunca
//   apunta por defecto a `lineaBase.json`: cambiar la línea base protegida es una decisión
//   explícita (spec.md 33) y debe verse como un cambio revisable en Git.
// - Antes de usar el resultado como línea base hay que VALIDAR el código contra una
//   referencia histórica; generar y aceptar sin esa validación no prueba nada.

import fs from 'node:fs'
import path from 'node:path'
import { ESCENARIOS_LINEA_BASE, SEMANAS_APLAZATORIAS_LINEA_BASE, TOLERANCIA_ABSOLUTA, calcularHuellaCombinacion, combinacionesLineaBase, type LineaBase } from './lineaBase'
import { FINANCIAL_MODEL_VERSION } from './version'

export function construirLineaBase(origen: string, nota: string): LineaBase {
  const combinaciones: LineaBase['combinaciones'] = {}
  for (const c of combinacionesLineaBase()) combinaciones[c.clave] = calcularHuellaCombinacion(c)
  return {
    meta: {
      modelo: FINANCIAL_MODEL_VERSION,
      tolerancia_absoluta: TOLERANCIA_ABSOLUTA,
      semanas_aplazatorias: [...SEMANAS_APLAZATORIAS_LINEA_BASE],
      escenarios: ESCENARIOS_LINEA_BASE.length,
      combinaciones: Object.keys(combinaciones).length,
      origen,
      nota,
    },
    combinaciones,
  }
}

/** Serialización estable: la cabecera legible y una combinación por línea (los cambios se ven por escenario en Git). */
export function serializarLineaBase(lb: LineaBase): string {
  const filas = Object.entries(lb.combinaciones).map(([clave, huella]) => `    ${JSON.stringify(clave)}: ${JSON.stringify(huella)}`)
  return `{\n  "meta": ${JSON.stringify(lb.meta)},\n  "combinaciones": {\n${filas.join(',\n')}\n  }\n}\n`
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const sobrescribir = args.includes('--sobrescribir')
  const destino = args.find((a) => !a.startsWith('--'))
  if (!destino) {
    console.error('Uso: node generarLineaBase.js <ruta-de-salida.json> [--sobrescribir]')
    process.exit(2)
  }
  const ruta = path.resolve(destino)
  if (fs.existsSync(ruta) && !sobrescribir) {
    console.error(`Se niega a sobrescribir ${ruta}. Cambiar la línea base es una decisión explícita: usa una ruta nueva o --sobrescribir.`)
    process.exit(2)
  }
  const lb = construirLineaBase(
    'Generada desde el código actual con generarLineaBase.ts.',
    'Herramienta de desarrollo: CI no la regenera. Validar contra una referencia histórica antes de aceptarla (spec.md 33).',
  )
  fs.writeFileSync(ruta, serializarLineaBase(lb))
  console.log(`Línea base escrita en ${ruta} (${lb.meta.combinaciones} combinaciones).`)
}
