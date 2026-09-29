// Humania WhatsApp Brain (KAI-44) — validador de contenido por línea de comandos.
// Ver Documentos/SDD/whatsapp-brain/plan.md 6 y tasks.md T-11.
//
//   npm run brain:validar -- "../Documentos/SDD/whatsapp-brain/contenido"   (desde web/)
//   npm run brain:validar -- "<ruta>/brain-v0001.json"
//
// SOLO LEE: nunca escribe, mueve ni borra archivos. Es, junto con las suites de
// verificación, el único archivo del módulo que usa `fs` (spec AC-29).
// Código de salida: 0 sin errores (las advertencias se muestran igual); 1 con errores.

import fs from 'node:fs'
import path from 'node:path'
import type { ProblemaValidacion } from './tipos'
import { validarConjunto } from './versionado'

export const PATRON_ARCHIVO_BRAIN = /^brain-v(\d{4})\.json$/

export interface ResultadoContenido {
  archivos: string[]
  errores: ProblemaValidacion[]
  advertencias: ProblemaValidacion[]
}

/** Valida un archivo `brain-vNNNN.json` o todos los de una carpeta, incluida la consistencia entre versiones. */
export function validarRutaContenido(ruta: string): ResultadoContenido {
  const problemas: ProblemaValidacion[] = []
  if (!fs.existsSync(ruta)) {
    return { archivos: [], errores: [{ nivel: 'ERROR', archivo: ruta, regla: 'NOMBRE_ARCHIVO', motivo: 'la ruta no existe' }], advertencias: [] }
  }
  let archivos: string[]
  if (fs.statSync(ruta).isDirectory()) {
    const nombres = fs.readdirSync(ruta).filter((n) => n.toLowerCase().endsWith('.json')).sort()
    for (const n of nombres) {
      if (!PATRON_ARCHIVO_BRAIN.test(n)) {
        problemas.push({ nivel: 'ADVERTENCIA', archivo: n, regla: 'NOMBRE_ARCHIVO', motivo: 'el archivo no sigue el patrón brain-vNNNN.json y no se valida' })
      }
    }
    archivos = nombres.filter((n) => PATRON_ARCHIVO_BRAIN.test(n)).map((n) => path.join(ruta, n))
  } else {
    archivos = [ruta]
  }

  const versiones: unknown[] = []
  const archivoPorVersion = new Map<number, string>()
  for (const archivo of archivos) {
    const nombre = path.basename(archivo)
    let datos: unknown
    try {
      datos = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    } catch (err) {
      problemas.push({ nivel: 'ERROR', archivo: nombre, regla: 'JSON_INVALIDO', motivo: `no es un JSON válido: ${(err as Error).message}` })
      continue
    }
    const m = PATRON_ARCHIVO_BRAIN.exec(nombre)
    const version = typeof datos === 'object' && datos !== null ? (datos as { version?: unknown }).version : undefined
    if (!m) {
      problemas.push({ nivel: 'ERROR', archivo: nombre, regla: 'NOMBRE_ARCHIVO', motivo: 'se esperaba el nombre brain-vNNNN.json' })
    } else if (Number(m[1]) !== version) {
      problemas.push({ nivel: 'ERROR', archivo: nombre, campo: 'version', regla: 'NOMBRE_ARCHIVO', motivo: `el nombre indica la versión ${Number(m[1])} pero el archivo dice ${String(version)}` })
    }
    if (typeof version === 'number' && !archivoPorVersion.has(version)) archivoPorVersion.set(version, nombre)
    versiones.push(datos)
  }

  const conjunto = validarConjunto(versiones)
  for (const p of [...conjunto.errores, ...conjunto.advertencias]) {
    problemas.push(p.archivo || p.brainVersion === undefined ? p : { ...p, archivo: archivoPorVersion.get(p.brainVersion) })
  }
  return {
    archivos: archivos.map((a) => path.basename(a)),
    errores: problemas.filter((p) => p.nivel === 'ERROR'),
    advertencias: problemas.filter((p) => p.nivel === 'ADVERTENCIA'),
  }
}

/** Una línea legible: nivel | archivo | versión | ficha | campo | regla | motivo. */
export function formatearProblema(p: ProblemaValidacion): string {
  return [
    p.nivel.padEnd(11),
    `archivo: ${p.archivo ?? '-'}`,
    `Brain: ${p.brainVersion === undefined ? '-' : `v${p.brainVersion}`}`,
    `ficha: ${p.fichaId ?? '-'}`,
    `campo: ${p.campo ?? '-'}`,
    `regla: ${p.regla}`,
    `motivo: ${p.motivo}`,
  ].join(' | ')
}

function principal(args: string[]): number {
  const ruta = args[0]
  if (!ruta) {
    console.error('Uso: npm run brain:validar -- "<carpeta de contenido o archivo brain-vNNNN.json>"')
    return 1
  }
  const r = validarRutaContenido(path.resolve(ruta))
  if (r.archivos.length === 0 && r.errores.length === 0) console.log(`No hay versiones del Brain (brain-vNNNN.json) en ${ruta}.`)
  else console.log(`Versiones revisadas: ${r.archivos.join(', ') || 'ninguna'}`)
  for (const p of r.errores) console.error(formatearProblema(p))
  for (const p of r.advertencias) console.warn(formatearProblema(p))
  console.log(`\n${r.errores.length} error(es), ${r.advertencias.length} advertencia(s).`)
  if (r.errores.length > 0) console.error('RESULTADO: contenido INVÁLIDO. No activar esta versión del Brain.')
  else console.log('RESULTADO: contenido válido.')
  return r.errores.length > 0 ? 1 : 0
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2))
