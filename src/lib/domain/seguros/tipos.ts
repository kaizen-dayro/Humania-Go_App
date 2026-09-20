// KAI-29 — Dominio de Seguros y Financiaciones (spec.md Secciones 25-28,
// plan.md Sección 13). Tipos compartidos, sin lógica financiera.
//
// Este módulo NO contiene ni consume ninguna tasa, ningún sistema de
// amortización ni valores legacy del seguro: solo describe qué es cada
// dato y qué estado documental tiene (spec.md 25.0, decisión 16).

/**
 * Estado de un dato (vocabulario oficial de spec.md 25.0). Una cifra nunca
 * sube de estado por implementación técnica: solo por documentación y
 * aprobación explícita de Humania Go.
 */
export type EstadoDato =
  | 'CONFIRMADO_POR_COTIZACION' // consta en una cotización; no equivale a póliza emitida ni a contrato
  | 'CONFIRMADO_DOCUMENTALMENTE' // documento definitivo (pagaré, tabla de amortización, contrato)
  | 'REPORTADO_SIN_SOPORTE_DOCUMENTAL' // lo informó Humania Go, sin documento en el repositorio
  | 'DERIVADO' // calculado a partir de otras cifras
  | 'DERIVADA_POR_COTIZACION' // calculado desde una cotización bajo hipótesis explícitas (no contractual)
  | 'LEGACY_NO_CONFIRMADO' // solo compatibilidad, regresión o histórico
  | 'PENDIENTE' // sin evidencia suficiente; no se infiere

/** Periodicidades soportadas hoy. Solo lo documentado por la cotización (spec.md 26.1). */
export type Periodicidad = 'MENSUAL'
