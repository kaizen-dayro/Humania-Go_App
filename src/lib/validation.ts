import type { ChangeEvent } from 'react'

/**
 * Reglas de entrada compartidas. Mismos patrones usados desde el
 * formulario público de aplicación (src/app/apply/page.tsx) desde el
 * inicio del proyecto: los formularios nuevos deben reutilizar estas
 * mismas reglas en lugar de definir las suyas.
 */
export const LETTERS_ONLY = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/
export const NUMBERS_ONLY = /^\d*$/
export const ALPHANUMERIC = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]*$/

/** Letras y números sin espacios ni caracteres especiales (ej. placa vehicular). */
export const ALPHANUMERIC_NO_SPACES = /^[a-zA-Z0-9]*$/

/** Teléfono móvil colombiano: exactamente 10 dígitos, debe iniciar en 3. */
export const PHONE_CO = /^3\d{9}$/

/**
 * Texto descriptivo libre (respuestas abiertas, observaciones): letras,
 * números, espacios y puntuación normal de una oración en español.
 * Bloquea símbolos de relleno/spam (# % & * + = < > { } [ ] | \ ~ ^ @ etc.)
 * sin impedir escribir oraciones reales con comas, puntos y signos de
 * interrogación/exclamación.
 */
export const DESCRIPTIVE_TEXT = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,;:¿?¡!'"-]*$/

/**
 * Texto narrativo sin números (Fase 13, Documento 17/18): letras, espacios
 * y puntuación básica de una oración en español, SIN dígitos. Usado en
 * campos donde el motivo/observación debe leerse como texto humano, nunca
 * mezclado con cifras (motivo de cambio de estado, estado físico de un
 * activo, descripciones de evidencia/historial, respuestas abiertas de
 * referencia laboral). Debe coincidir exactamente con el CHECK equivalente
 * en PostgreSQL (ver supabase/00028-00032).
 */
export const LETTERS_WITH_PUNCTUATION = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s.,;:¿?¡!'"-]*$/

/**
 * Normaliza texto humano en vivo, mientras la persona escribe: primera
 * letra de cada palabra en mayúscula, resto en minúscula. Debe
 * coincidir exactamente con la función normalizar_texto_humano() en
 * Postgres (Fase 10) para que lo que la persona ve mientras escribe sea
 * lo mismo que terminará guardado.
 */
export function capitalizarPalabras(texto: string): string {
  return texto
    .split(' ')
    .map(palabra => palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase() : palabra)
    .join(' ')
}

/**
 * Handler de onChange listo para usar en un <input> controlado: aplica
 * capitalizarPalabras() en vivo y conserva la posición del cursor. Como
 * el largo del texto nunca cambia (solo el caso de las letras), la
 * misma posición sigue siendo válida tras el re-render -- se restaura
 * con requestAnimationFrame porque React actualiza el DOM de forma
 * asíncrona respecto al evento.
 */
export function handleCapitalizedChange(
  e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  setter: (value: string) => void
) {
  const input = e.target
  const cursorPos = input.selectionStart
  setter(capitalizarPalabras(input.value))
  requestAnimationFrame(() => {
    input.setSelectionRange(cursorPos, cursorPos)
  })
}
