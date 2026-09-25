// Calculadora de Presupuesto (KAI-29) — Presupuestos guardados: B1, dominio puro
// (diseño cerrado en Documentos/SDD/calculadora-presupuesto/spec.md Sección 38 y
// plan.md Sección 18; DISEÑO APROBADO, sin cambios de servidor, DB ni interfaz).
//
// Única fuente de verdad de las claves de nivel superior de `ParametrosPresupuesto`
// (spec.md 38.2 punto 7 y 38.7: "una única fuente de verdad para las claves permitidas
// del snapshot"). `reconocerSnapshot.ts` la usa para reconstruir; una futura B2 debe
// usar esta misma lista al filtrar lo que `guardarPresupuesto` persiste, en vez de
// mantener una copia paralela. `parametros.ts` (validar/normalizar) NO se modifica en
// B1 — esta lista es adicional, no un reemplazo.
//
// Mantenimiento: si `ParametrosPresupuesto` gana o pierde una clave de nivel superior,
// esta lista debe actualizarse en el mismo cambio — `verificacionPresupuestosGuardados.ts`
// falla si se desincroniza (compara contra `Object.keys(PARAMETROS_REFERENCIA)`).

import type { ParametrosPresupuesto } from './parametros'

/** Las 31 claves de nivel superior de `ParametrosPresupuesto`, en el orden de la interfaz. */
export const CLAVES_PARAMETROS_V1: readonly (keyof ParametrosPresupuesto)[] = [
  'modalidadAdquisicion',
  'precioCompra',
  'valorComercialBase',
  'traspaso',
  'capitalPropioDeclarado',
  'otrosCostosInicialesRecursosPropios',
  'principalCreditoBancario',
  'tasaEfectivaAnualCredito',
  'mesesCreditoVehiculo',
  'seguro',
  'porcentajeAbonoCapital',
  'mesInicioAbonoCapital',
  'valorVentaContractualActivo',
  'cuotaSemanalConductor',
  'ahorroSemanalConductor',
  'bonoPatrimonialSemanal',
  'cuotaSemanaAplazatoria',
  'mesMinimoAbonosConductor',
  'abonoAdicionalConductorSemanal',
  'abonoConductorOcasional',
  'mesAbonoConductorOcasional',
  'porcentajeAtribucionAbonosConductor',
  'soatAnual',
  'soatPeriodicidadMeses',
  'tecnomecanicaAnual',
  'tecnomecanicaPeriodicidadMeses',
  'impuestosAnuales',
  'impuestosPeriodicidadMeses',
  'otrosCostosHumaniaAnuales',
  'semanasPorAno',
  'mesesPorAno',
] as const

/**
 * Claves de nivel superior de `obj` que NO están en `CLAVES_PARAMETROS_V1` — misma
 * comprobación para ambos contextos (KAI-29 B2, plan.md Sección 18.6):
 * - Al CARGAR (`reconocerSnapshot.ts`), una clave desconocida es tolerable: puede ser
 *   dato histórico legítimo de un modelo anterior; se ignora y se informa.
 * - Al GUARDAR (`actions.ts`, `guardarPresupuesto`), una clave desconocida en un objeto
 *   recién construido por la propia interfaz no es un dato histórico — es indicio de un
 *   request manipulado o un bug; se rechaza.
 * Cada contexto decide su propia política sobre el mismo resultado; nunca dos listas.
 */
export function clavesDesconocidas(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter(
    (clave) => !(CLAVES_PARAMETROS_V1 as readonly string[]).includes(clave) && !(CLAVES_SNAPSHOT_ADICIONALES as readonly string[]).includes(clave),
  )
}

/**
 * Claves del snapshot guardado que NO son parámetros del motor (spec.md 39.9): viven en el mismo
 * JSONB `parametros`, pero nunca entran a `ParametrosPresupuesto` ni a `calcularMetricas`.
 * `politicaFinanciera` = política D8 congelada con el presupuesto (politicaFinanciera.ts).
 * `reconocerSnapshot` no las proyecta a los parámetros; se leen con su propia función.
 */
export const CLAVES_SNAPSHOT_ADICIONALES = ['politicaFinanciera'] as const
