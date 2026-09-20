// Calculadora de Presupuesto (KAI-29) — flujo contractual Humania↔conductor
// (Capa C). Ver spec.md Decisiones D3/D9/D10/D11/D12/D13/D14 (todas
// cerradas) y Secciones 19.17-19.19 para las reglas de negocio exactas
// que este archivo implementa.

import {
  equityConductorSemanal,
  flujoOperativoHumaniaSemanal,
  type ParametrosPresupuesto,
} from './parametros'

export interface AdquisicionActivo {
  /** FLOOR(valorVentaContractualActivo / equityConductorSemanal) — nunca redondeo (D10, spec.md 19.17-A). */
  semanasAdquisicionCompletas: number
  /** Pago único posterior a semanasAdquisicionCompletas — nunca ingreso operativo (D14, spec.md 19.19.1). */
  cuotaFinalAdquisicion: number
}

/** D10 CERRADA (spec.md 19.17-A / 19.18.2). */
export function calcularAdquisicionActivo(p: ParametrosPresupuesto): AdquisicionActivo {
  const equitySemanal = equityConductorSemanal(p)
  const semanasAdquisicionCompletas = Math.floor(p.valorVentaContractualActivo / equitySemanal)
  const cuotaFinalAdquisicion = p.valorVentaContractualActivo - semanasAdquisicionCompletas * equitySemanal
  return { semanasAdquisicionCompletas, cuotaFinalAdquisicion }
}

export interface FlujoContractual {
  /** D12 CERRADA: duración real del contrato — nunca mesesCreditoVehiculo (spec.md 19.18.2). */
  duracionContratoSemanas: number
  adquisicion: AdquisicionActivo
  /** Capa 1 (D13) — incluye la cuota final de adquisición (D14, spec.md 19.19.1). */
  flujoContractualTotal: number
  /** Capa 2 (D13) — nunca ingreso ni utilidad de Humania (D3). */
  equityAdministradoAcumulado: number
  /** Capa 3 (D13) — incluye el ingreso de las semanas aplazatorias (D11: 100% operativo). */
  ingresoOperativoHumania: number
  /** Capa 4 (D13, D11 CERRADA) — 100% ingreso de Humania, 0% equity. */
  ingresoAplazatoriasAcumulado: number
  /**
   * Serie semanal REAL acumulada de ingresoOperativoHumania, semana
   * 1..horizonteSemanas. D12 CERRADA: el contrato termina en
   * `duracionContratoSemanas` — más allá de esa semana no hay más
   * ingreso (la serie queda plana). Un payback que no se alcanza dentro
   * de esta serie significa, literalmente, que no se alcanza dentro del
   * contrato — nunca extrapolar esta serie más allá de su duración real
   * para "encontrar" un payback (ver `serieIngresoOperativoExtrapolada`
   * para el benchmark hipotético, explícitamente separado).
   */
  serieIngresoOperativoAcumulado: number[]
  /**
   * Serie hipotética: ¿qué semana se alcanzaría el payback SI el ritmo
   * de ingreso operativo (último valor semanal real) continuara
   * indefinidamente más allá del fin real del contrato? Es un punto de
   * referencia/comparación (spec.md 19.18.2/19.19.2), NUNCA una
   * proyección real — el contrato no genera ingreso después de
   * `duracionContratoSemanas` (D12).
   */
  serieIngresoOperativoExtrapolada: number[]
  /**
   * D3 refinada (2026-09-01, spec.md Sección 23): serie acumulada del
   * flujo contractual COMPLETO (450.000/semana normal, 200.000/semana
   * aplazatoria, más la cuota final de adquisición en el momento en que
   * se completa) — "el valor real que recibe Humania" (Humania Go, D3
   * ya establecía que recibe los $450.000 completos). Mismo criterio
   * real/extrapolado que la serie operativa — nunca ingreso después de
   * `duracionContratoSemanas`.
   */
  serieFlujoContractualAcumulado: number[]
  /** Extrapolación equivalente para `serieFlujoContractualAcumulado` — mismo criterio que `serieIngresoOperativoExtrapolada`. */
  serieFlujoContractualExtrapolado: number[]
}

/**
 * D11 CERRADA (spec.md 19.18.1): las semanas aplazatorias se modelan
 * como una extensión calendario posterior a las semanas normales de
 * adquisición — un supuesto de implementación (el orden exacto de
 * intercalado no afecta ningún total confirmado, solo podría desplazar
 * en pocas semanas el punto exacto de cruce de un payback; no es una
 * decisión de negocio, spec.md nunca especificó el orden).
 */
export function calcularFlujoDeCaja(
  p: ParametrosPresupuesto,
  semanasAplazatoriasUsadas: number,
  horizonteSemanas = 900,
): FlujoContractual {
  const adquisicion = calcularAdquisicionActivo(p)
  const operativoSemanal = flujoOperativoHumaniaSemanal(p)
  const { semanasAdquisicionCompletas, cuotaFinalAdquisicion } = adquisicion

  const duracionContratoSemanas = semanasAdquisicionCompletas + semanasAplazatoriasUsadas

  const flujoContractualTotal =
    semanasAdquisicionCompletas * p.cuotaSemanalConductor +
    semanasAplazatoriasUsadas * p.cuotaSemanaAplazatoria +
    cuotaFinalAdquisicion

  const equityAdministradoAcumulado = semanasAdquisicionCompletas * equityConductorSemanal(p) + cuotaFinalAdquisicion

  const ingresoAplazatoriasAcumulado = semanasAplazatoriasUsadas * p.cuotaSemanaAplazatoria
  const ingresoOperativoHumania = semanasAdquisicionCompletas * operativoSemanal + ingresoAplazatoriasAcumulado

  const serieIngresoOperativoAcumulado: number[] = []
  const serieIngresoOperativoExtrapolada: number[] = []
  let acumuladoReal = 0
  let acumuladoExtrapolado = 0
  for (let semana = 1; semana <= horizonteSemanas; semana++) {
    const dentroDelContrato = semana <= duracionContratoSemanas
    const esSemanaAplazatoria = dentroDelContrato && semana > semanasAdquisicionCompletas
    const ingresoSemana = esSemanaAplazatoria ? p.cuotaSemanaAplazatoria : operativoSemanal

    if (dentroDelContrato) acumuladoReal += ingresoSemana
    serieIngresoOperativoAcumulado.push(acumuladoReal)

    // Extrapolación: continúa al ritmo operativo normal (nunca al ritmo
    // de aplazatoria) después de duracionContratoSemanas — benchmark
    // explícito, ver comentario del campo arriba.
    acumuladoExtrapolado += dentroDelContrato ? ingresoSemana : operativoSemanal
    serieIngresoOperativoExtrapolada.push(acumuladoExtrapolado)
  }

  // Flujo contractual completo (D3 refinada, spec.md Sección 23): mismo
  // criterio real/extrapolado, pero con la cuota completa
  // (450.000/200.000, nunca solo el componente operativo) y la cuota
  // final de adquisición inyectada exactamente en la semana en que se
  // completa la adquisición — coincide con `flujoContractualTotal` en
  // la última semana real (verificado en verificacion.ts).
  const serieFlujoContractualAcumulado: number[] = []
  const serieFlujoContractualExtrapolado: number[] = []
  let acumuladoContractualReal = 0
  let acumuladoContractualExtrapolado = 0
  for (let semana = 1; semana <= horizonteSemanas; semana++) {
    const dentroDelContrato = semana <= duracionContratoSemanas
    const esSemanaAplazatoria = dentroDelContrato && semana > semanasAdquisicionCompletas
    const cuotaSemana = esSemanaAplazatoria ? p.cuotaSemanaAplazatoria : p.cuotaSemanalConductor
    const bumpCuotaFinal = semana === semanasAdquisicionCompletas ? cuotaFinalAdquisicion : 0

    if (dentroDelContrato) acumuladoContractualReal += cuotaSemana + bumpCuotaFinal
    serieFlujoContractualAcumulado.push(acumuladoContractualReal)

    acumuladoContractualExtrapolado += (dentroDelContrato ? cuotaSemana : p.cuotaSemanalConductor) + bumpCuotaFinal
    serieFlujoContractualExtrapolado.push(acumuladoContractualExtrapolado)
  }

  return {
    duracionContratoSemanas,
    adquisicion,
    flujoContractualTotal,
    equityAdministradoAcumulado,
    ingresoOperativoHumania,
    ingresoAplazatoriasAcumulado,
    serieIngresoOperativoAcumulado,
    serieIngresoOperativoExtrapolada,
    serieFlujoContractualAcumulado,
    serieFlujoContractualExtrapolado,
  }
}
