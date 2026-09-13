// Calculadora de Presupuesto (KAI-29) — comparación de escenarios,
// derivada exclusivamente de metricas.ts (nunca una fórmula paralela).
// La derivación automática de los parámetros por defecto del escenario
// "Recursos Propios" queda pendiente de la aprobación explícita de
// Humania Go sobre `inversionInicialRecursosPropios` (D2, plan.md
// Sección 4, "pendiente de aprobación") — por eso esta función recibe
// los parámetros de cada escenario ya construidos, en vez de derivarlos
// internamente a partir de un supuesto no confirmado.

import { calcularMetricas, type ResultadoMetricas } from './metricas'
import type { ParametrosPresupuesto } from './parametros'

export interface ComparacionEscenarios {
  credito: ResultadoMetricas
  recursosPropios: ResultadoMetricas
}

export function compararEscenarios(
  parametrosCredito: ParametrosPresupuesto,
  parametrosRecursosPropios: ParametrosPresupuesto,
  semanasAplazatoriasUsadas = 0,
): ComparacionEscenarios {
  return {
    credito: calcularMetricas(parametrosCredito, semanasAplazatoriasUsadas),
    recursosPropios: calcularMetricas(parametrosRecursosPropios, semanasAplazatoriasUsadas),
  }
}
