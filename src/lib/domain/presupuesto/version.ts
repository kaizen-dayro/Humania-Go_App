// KAI-29 — Versión del modelo financiero (spec.md Sección 12: cadena
// semántica fija). Se persiste en `presupuestos_financieros.financial_model_version`
// al guardar y NUNCA se modifica en filas ya guardadas: un presupuesto
// guardado conserva la versión con la que fue calculado.
//
// Vive aquí (y no dentro de `actions.ts`) porque un archivo `'use server'` solo
// puede exportar funciones asíncronas y esta constante debe poder verificarse.
//
// Se mantiene `v1.0`: hasta ahora solo se agregó el marcado aditivo
// `datosNoConfirmados`; la matemática del modelo no cambió. Cambiarla es la
// decisión M5b (plan.md 12.5 y 13.9), que sigue abierta y depende de
// cuándo cambie el modelo del seguro.
export const FINANCIAL_MODEL_VERSION = 'Humania Go Financial Model v1.0'
