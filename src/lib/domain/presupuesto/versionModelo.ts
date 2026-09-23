// Calculadora de Presupuesto (KAI-29) — Presupuestos guardados: B1, dominio puro
// (spec.md Sección 38, plan.md Sección 18.5, "Versionado del modelo",
// APROBADO como diseño el 2026-09-20). Registro de versiones del motor
// financiero, atado a la huella de `lineaBase.json` con que se validó cada una.
//
// Formato `Humania Go Financial Model vMAYOR.MENOR`:
// - MAYOR: fórmula, regla financiera/de negocio o corrección matemática que
//   altera resultados.
// - MENOR: capacidad aditiva que NO altera ningún resultado existente
//   (parámetro opcional que reproduce lo anterior, métrica nueva, campo nuevo
//   guardado).
// - Sin cambio: interfaz, textos, UX o refactor sin impacto financiero — no
//   genera una entrada nueva aquí.
//
// `verificacionPresupuestosGuardados.ts` exige que `FINANCIAL_MODEL_VERSION`
// (version.ts) esté registrada aquí y que su huella coincida con el
// `lineaBase.json` actual (sha256 del archivo completo). Este archivo es
// dominio puro: NO importa `node:crypto` ni `node:fs` (debe poder usarse
// desde el cliente en una futura B3); el cálculo y la comparación del hash
// viven en la verificación, que sí corre en Node.
//
// NO se sube versión en B1 (ningún resultado cambia). Las filas guardadas
// antes del 19-09-2026 conservan la etiqueta v1.0 aunque las calculó un motor
// distinto (PR #14/#15) — es un descuido histórico documentado (spec.md 38.1),
// no se repara aquí. El próximo cambio que altere resultados será v2.0.

export interface EntradaVersionModelo {
  /** Debe coincidir exactamente con un valor histórico de `FINANCIAL_MODEL_VERSION`. */
  version: string
  /** Fecha en que se registró esta entrada (no la fecha en que se guardó cada presupuesto). */
  fecha: string
  /** Resumen humano de qué cambió (o "sin cambios registrados" para la entrada de origen). */
  resumen: string
  /** sha256 de `lineaBase.json` completo en el momento de registrar esta versión. */
  huellaLineaBase: string
}

/**
 * Registro de versiones del modelo. Solo tiene una entrada hasta que exista un
 * cambio MAYOR o MENOR real — no se anticipan versiones futuras.
 */
export const REGISTRO_VERSIONES: readonly EntradaVersionModelo[] = [
  {
    version: 'Humania Go Financial Model v1.0',
    fecha: '2026-09-20',
    resumen:
      'Entrada de origen del registro de versiones (KAI-29 B1). No implica que v1.0 sea un único motor: ' +
      'las filas guardadas antes del 19-09-2026 usan un motor distinto con la misma etiqueta (spec.md 38.1, descuido histórico no reparado).',
    huellaLineaBase: '59ad324ad70416c8f70f0d82415eebf80025830503baa94b9308556d3444b7d0',
  },
] as const
