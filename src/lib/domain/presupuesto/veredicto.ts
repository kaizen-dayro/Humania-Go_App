// Calculadora de Presupuesto (KAI-29) — veredicto automático
// (CONVIENE/REQUIERE REVISIÓN/NO CONVIENE). D8 (umbrales de ROI mínimo
// y payback máximo) sigue ABIERTA (spec.md Sección 11, no bloqueante)
// — hasta que Humania Go los confirme, el veredicto se muestra
// explícitamente "sin definir", nunca con un umbral inventado.

import type { ResultadoMetricas } from './metricas'

export type Veredicto = 'CONVIENE' | 'REQUIERE_REVISION' | 'NO_CONVIENE' | 'SIN_DEFINIR'

export interface UmbralesVeredicto {
  roiMinimoRequerido: number
  maximoPaybackAceptableSemanas: number
}

export interface ResultadoVeredicto {
  veredicto: Veredicto
  razon: string
}

export function calcularVeredicto(metricas: ResultadoMetricas, umbrales?: UmbralesVeredicto): ResultadoVeredicto {
  if (!umbrales) {
    return {
      veredicto: 'SIN_DEFINIR',
      razon: 'D8 (umbrales de ROI mínimo y payback máximo) sigue abierta — el veredicto automático no puede calcularse sin ellos (spec.md Sección 11). Las métricas sí están disponibles.',
    }
  }
  const roiSuficiente = metricas.roiSobreInversionTotal >= umbrales.roiMinimoRequerido
  const paybackDentroDelLimite =
    metricas.paybackFinancieroRentabilidad !== null && metricas.paybackFinancieroRentabilidad <= umbrales.maximoPaybackAceptableSemanas

  if (roiSuficiente && paybackDentroDelLimite) return { veredicto: 'CONVIENE', razon: 'ROI y payback dentro de los umbrales configurados.' }
  if (!roiSuficiente && !paybackDentroDelLimite) {
    return { veredicto: 'NO_CONVIENE', razon: 'ROI por debajo del mínimo y payback financiero fuera del límite (o no alcanzado) configurados.' }
  }
  return { veredicto: 'REQUIERE_REVISION', razon: 'Solo uno de los dos criterios (ROI, payback) se cumple.' }
}
