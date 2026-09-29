// Humania WhatsApp Brain (KAI-44) — guardia del repositorio (spec AC-29 y AC-30).
// Humania-Go_App es un repositorio PÚBLICO: el contenido real del Brain nunca
// debe entrar en él, y el núcleo del módulo no debe tener efectos. Esta guardia
// hace fallar `npm run verificar:brain` (y por tanto el CI) si:
//   1. aparece en web/ un archivo `brain-v*.json` o un `.json` con ids de ficha
//      `KB-NNNN` (contenido real del Brain);
//   2. un archivo del núcleo del módulo importa fs, child_process, red,
//      Supabase o Next.js.
// SOLO LEE archivos.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Únicos archivos del módulo exentos de la regla de imports (T-23, aceptado por el
 * Product Owner el 29-09-2026): el validador de línea de comandos (lee los archivos
 * de contenido) y las dos suites de verificación (escriben fixtures en una carpeta
 * temporal del sistema y ejecutan el CLI). Ningún archivo del núcleo está aquí.
 */
export const EXENTOS_IMPORTS: ReadonlySet<string> = new Set(['validarContenido.ts', 'verificacionBrain.ts', 'verificacionRepositorio.ts'])

/** Núcleo de dominio puro: sin filesystem, red, Supabase ni Next.js (spec AC-29). */
export const NUCLEO_BRAIN = ['tipos.ts', 'validacion.ts', 'versionado.ts', 'exposicion.ts', 'publico.ts', 'fixtures.ts'] as const

const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', '.vercel', '.vs'])
const PATRON_IMPORT_PROHIBIDO =
  /(?:from\s+|require\(\s*|import\s*\(\s*)['"](?:(?:node:)?(?:fs|child_process|http|http2|https|net|tls|dns|dgram|os)(?:\/[^'"]*)?|@supabase\/[^'"]*|next(?:\/[^'"]*)?)['"]/
/** Acceso a red sin import (APIs globales). */
const PATRON_RED_GLOBAL = /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/

export interface HallazgoRepositorio {
  archivo: string
  regla: 'CONTENIDO_BRAIN_EN_REPOSITORIO' | 'IMPORT_PROHIBIDO'
  motivo: string
}

function recorrer(carpeta: string, visitar: (archivo: string) => void) {
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (CARPETAS_IGNORADAS.has(entrada.name) || entrada.name.startsWith('.verificacion-')) continue
      recorrer(path.join(carpeta, entrada.name), visitar)
    } else if (entrada.isFile()) {
      visitar(path.join(carpeta, entrada.name))
    }
  }
}

/** Revisa el árbol de `raizWeb` y los imports de `carpetaBrain`. Devuelve los hallazgos (vacío = todo bien). */
export function revisarRepositorio(raizWeb: string, carpetaBrain: string): HallazgoRepositorio[] {
  const hallazgos: HallazgoRepositorio[] = []
  recorrer(raizWeb, (archivo) => {
    const nombre = path.basename(archivo)
    const relativo = path.relative(raizWeb, archivo)
    if (/^brain-v\d+\.json$/i.test(nombre)) {
      hallazgos.push({ archivo: relativo, regla: 'CONTENIDO_BRAIN_EN_REPOSITORIO', motivo: 'archivo de versión del Brain dentro del repositorio público; el contenido real vive solo en Documentos/SDD/whatsapp-brain/contenido/' })
    } else if (nombre.toLowerCase().endsWith('.json') && /"KB-\d{4}"/.test(fs.readFileSync(archivo, 'utf8'))) {
      hallazgos.push({ archivo: relativo, regla: 'CONTENIDO_BRAIN_EN_REPOSITORIO', motivo: 'JSON con ids de ficha KB-NNNN dentro del repositorio público' })
    }
  })
  for (const nombre of fs.readdirSync(carpetaBrain)) {
    if (!nombre.endsWith('.ts') || EXENTOS_IMPORTS.has(nombre)) continue
    const lineas = fs.readFileSync(path.join(carpetaBrain, nombre), 'utf8').split(/\r?\n/)
    lineas.forEach((linea, i) => {
      if (PATRON_IMPORT_PROHIBIDO.test(linea) || PATRON_RED_GLOBAL.test(linea)) {
        hallazgos.push({ archivo: `${nombre}:${i + 1}`, regla: 'IMPORT_PROHIBIDO', motivo: `el núcleo del Brain no puede usar filesystem, procesos, red, Supabase ni Next.js: ${linea.trim()}` })
      }
    })
  }
  return hallazgos
}

if (require.main === module) {
  // `npm run` ejecuta desde web/ (o desde la raíz de Humania-Go_App en CI, que es el mismo contenido).
  const raizWeb = process.cwd()
  const hallazgos = revisarRepositorio(raizWeb, path.join(raizWeb, 'src', 'lib', 'domain', 'brain'))
  for (const h of hallazgos) console.error(`FAIL ${h.regla} | ${h.archivo} | ${h.motivo}`)
  if (hallazgos.length > 0) {
    console.error(`\nGuardia del Brain: ${hallazgos.length} hallazgo(s). El repositorio es público: corregir antes de continuar.`)
    process.exitCode = 1
  } else {
    console.log('OK   guardia del repositorio: sin contenido real del Brain en web/ y núcleo sin imports prohibidos (AC-29, AC-30)')
  }
}
