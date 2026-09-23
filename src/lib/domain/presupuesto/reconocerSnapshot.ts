// Calculadora de Presupuesto (KAI-29) — Presupuestos guardados: B1, dominio puro
// (spec.md Sección 38, decisiones 6/7/8 y criterio 38.3; plan.md Sección 18.2,
// "Cargador seguro de snapshots"). DISEÑO APROBADO 2026-09-20. Esta función NO
// lee ni escribe Supabase — recibe el `parametros` JSONB y el
// `financial_model_version` de una fila ya leída por el servidor (B2, sin
// implementar) y decide si puede reconstruirse de forma determinista.
//
// Flujo (spec.md 38.2 punto 8):
//   leer snapshot -> ¿estructura reconocible? -> no: incompatible
//                                              -> sí: ¿versión conocida?
//                                                       -> sí: continuar
//                                                       -> no: ¿reconstrucción determinista?
//                                                                -> sí: permitir e informar versión
//                                                                -> no: incompatible
//
// Reglas que este módulo respeta sin excepción:
// - Nunca rellena un campo ausente con el valor actual, el de referencia ni la
//   cotización ACTIVE (decisión 7). Un campo requerido ausente es dato inválido,
//   nunca un valor completado.
// - `resultados` no entra a esta función (decisión 2): solo `parametros`.
// - Nunca lanza: toda entrada malformada, nula, vacía o con claves de más
//   produce un resultado controlado (decisión 6).
// - Copia en profundidad, nunca referencias compartidas (decisión 5, prueba
//   A -> B -> A en verificacionPresupuestosGuardados.ts).

import { CLAVES_PARAMETROS_V1, clavesDesconocidas } from './esquemaSnapshot'
import { normalizarParametrosGuardados, validarParametros, type ParametrosPresupuesto } from './parametros'
import { REGISTRO_VERSIONES } from './versionModelo'

export type ResultadoReconocimientoSnapshot =
  /** `bruto` no es un objeto reconocible como ninguna forma conocida de `ParametrosPresupuesto` (null, vacío, array, forma ajena). */
  | { estado: 'ESTRUCTURA_NO_RECONOCIDA' }
  /** Estructura reconocida, pero con campos requeridos ausentes o inválidos (lista concreta). Nunca se completa con un valor por defecto. */
  | { estado: 'DATOS_INVALIDOS'; errores: readonly string[] }
  /** Versión desconocida con claves que el motor actual no puede garantizar que carezcan de significado: no se abre (decisión 8, rama "no"). */
  | { estado: 'NO_DETERMINISTA'; razon: string; clavesDesconocidas: readonly string[] }
  /** Reconstrucción determinista: `parametros` es una copia en profundidad, independiente del snapshot de entrada. */
  | {
      estado: 'DETERMINISTA'
      parametros: ParametrosPresupuesto
      /** false = la versión del snapshot no está en `REGISTRO_VERSIONES`; se permitió abrir e informar la versión. */
      versionConocida: boolean
      /** Claves de `parametros` que el sistema no conoce, ignoradas (solo puede ser no vacío con versión conocida). */
      clavesIgnoradas: readonly string[]
    }

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Las dos formas que `normalizarParametrosGuardados` sabe reconocer (parametros.ts). */
function formaReconocida(bruto: Record<string, unknown>): 'ACTUAL' | 'PLANA' | null {
  if ('seguro' in bruto && 'mesesCreditoVehiculo' in bruto) return 'ACTUAL'
  if ('mesesContrato' in bruto && 'principalFinanciacionSeguro' in bruto && 'costoFinancieroSeguroEstimado' in bruto) return 'PLANA'
  return null
}

/** Copia en profundidad sin defaults: solo copia lo que existe, nunca inventa una clave ausente. */
function proyectarClavesConocidas(normalizado: Record<string, unknown>): Record<string, unknown> {
  const proyectado: Record<string, unknown> = {}
  for (const clave of CLAVES_PARAMETROS_V1) {
    if (clave in normalizado) proyectado[clave] = structuredClone(normalizado[clave])
  }
  return proyectado
}

/**
 * Decide si un snapshot (`parametros` crudo + la `financial_model_version` de su fila)
 * puede reconstruirse de forma determinista con el motor actual (spec.md 38.3).
 */
export function reconocerSnapshot(bruto: unknown, versionOrigen: string): ResultadoReconocimientoSnapshot {
  if (!esObjetoPlano(bruto)) return { estado: 'ESTRUCTURA_NO_RECONOCIDA' }

  const forma = formaReconocida(bruto)
  if (forma === null) return { estado: 'ESTRUCTURA_NO_RECONOCIDA' }

  let normalizado: Record<string, unknown>
  try {
    // Reutiliza el mismo reconocimiento de forma que ya usa `guardarPresupuesto`/las
    // pruebas existentes (parametros.ts) — nunca una segunda implementación paralela.
    normalizado = normalizarParametrosGuardados(bruto) as unknown as Record<string, unknown>
  } catch {
    return { estado: 'ESTRUCTURA_NO_RECONOCIDA' }
  }
  if (!esObjetoPlano(normalizado)) return { estado: 'ESTRUCTURA_NO_RECONOCIDA' }

  const clavesNoConocidas = clavesDesconocidas(normalizado)
  const versionConocida = REGISTRO_VERSIONES.some((entrada) => entrada.version === versionOrigen)

  if (!versionConocida && clavesNoConocidas.length > 0) {
    return {
      estado: 'NO_DETERMINISTA',
      razon:
        `La versión "${versionOrigen}" no está registrada y el snapshot tiene ${clavesNoConocidas.length} clave(s) que el motor actual no conoce ` +
        '(podrían ser un parámetro de otro modelo que el motor actual no sabe interpretar); no se puede garantizar que carezcan de significado.',
      clavesDesconocidas: clavesNoConocidas,
    }
  }

  const clavesFaltantes = CLAVES_PARAMETROS_V1.filter((clave) => !(clave in normalizado))
  if (clavesFaltantes.length > 0) {
    return {
      estado: 'DATOS_INVALIDOS',
      errores: clavesFaltantes.map((clave) => `falta la clave "${String(clave)}" (no se completa con un valor por defecto)`),
    }
  }

  const reconstruido = proyectarClavesConocidas(normalizado) as unknown as ParametrosPresupuesto
  const errores = validarParametros(reconstruido)
  if (errores.length > 0) return { estado: 'DATOS_INVALIDOS', errores }

  return {
    estado: 'DETERMINISTA',
    parametros: reconstruido,
    versionConocida,
    // Con versión desconocida ya se rechazó arriba si había alguna: aquí solo puede haber
    // claves ignoradas cuando la versión SÍ es conocida.
    clavesIgnoradas: clavesNoConocidas,
  }
}
