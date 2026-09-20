// KAI-29 — Valores LEGACY del seguro (spec.md 25, 26.4, 27.1; plan.md 12 y 14).
//
// Son el ÚNICO lugar del código de dominio donde viven estas cifras. Están
// aisladas a propósito: son datos históricos NO CONFIRMADOS que solo se
// conservan para reproducir escenarios y presupuestos anteriores
// (LEGACY_NO_CONFIRMADO). No son datos vigentes del seguro:
//
// - El capital de $3.453.177 es un residual contable de significado no
//   determinable (RESIDUAL_NO_DETERMINADO, spec.md 26.5).
// - Los $2.500.000 de costo financiero son una estimación nunca documentada.
// - Los 72 meses eran el plazo del crédito bancario del vehículo, usado por
//   acoplamiento como plazo del seguro; no hay soporte de que el seguro se
//   financie a 72 meses.
//
// Ningún dato de la cotización vigente (spec.md 26.1) se define aquí ni en
// PARAMETROS_REFERENCIA: llegan desde el dominio `seguros`.

export const SEGURO_LEGACY_REFERENCIA = {
  principalFinanciacion: 3_453_177,
  costoFinancieroEstimado: 2_500_000,
  plazoMeses: 72,
} as const
