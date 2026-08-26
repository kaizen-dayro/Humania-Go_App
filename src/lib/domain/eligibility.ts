import { z } from 'zod'
import { PHONE_CO } from '@/lib/validation'
import { SIMIT_MAX_FINES_REQUIRING_VALIDATION, type SimitQueryResult } from '@/lib/services/simit'

export { SIMIT_MAX_FINES_REQUIRING_VALIDATION }

// ==========================================
// 1. ZOD SCHEMAS (Para validación estricta frontend y backend)
// ==========================================

export const GENEROS = ['MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERO_NO_DECIR'] as const;

// Fase 11 (Documento 16, Subfase 11A): listas cerradas confirmadas en
// conversación con el usuario, no inventadas. Usadas tanto en el
// formulario público (/apply) como en la validación Zod, para que el
// backend nunca dependa solo del frontend (misma filosofía que las
// CHECK constraints agregadas en la migración 00023).

/** Actividad = PLATAFORMA (Documento 16 S3, 9 opciones literales del documento, "Otro" con texto libre). */
export const PLATAFORMA_OPTIONS = ['Uber', 'Yango', 'Didi', 'Picap', 'InDriver', 'Cabify', 'Maxim', 'Fory'] as const;

/** Actividad = EMPLEO_FORMAL / INDEPENDIENTE / OTRO: categorías + ejemplo, "Otro" con texto libre. */
export const CATEGORIA_ACTIVIDAD_OPTIONS = [
  { value: 'Ventas', ejemplo: 'Asesor Comercial' },
  { value: 'Tecnología', ejemplo: 'Administrador de Sistemas' },
  { value: 'Marketing', ejemplo: 'Redes Sociales' },
  { value: 'Salud', ejemplo: 'Enfermero(a)' },
  { value: 'Transporte', ejemplo: 'Conductor' },
  { value: 'Administración', ejemplo: 'Auxiliar Administrativo' },
  { value: 'Alimentación', ejemplo: 'Mesero(a)' },
] as const;

/**
 * Parentesco (Referencia Familiar) y Relación (Referencia Personal):
 * listas distintas a propósito (2026-08-25, pedido explícito del usuario)
 * -- antes compartían una sola lista, lo cual no tenía sentido en
 * contexto humano ("Amigo(a)" no es un parentesco familiar). La última
 * opción de cada una ("Otro familiar" / "Otro") es la que habilita el
 * campo de texto libre -- no hay una opción "Otro" genérica aparte.
 */
export const PARENTESCO_FAMILIAR_OPTIONS = [
  'Madre', 'Padre', 'Hermano(a)', 'Hijo(a)', 'Cónyuge', 'Otro familiar',
] as const;

export const RELACION_PERSONAL_OPTIONS = [
  'Amigo(a)', 'Vecino(a)', 'Compañero(a) de trabajo', 'Excompañero(a) de trabajo', 'Conocido(a)', 'Otro',
] as const;

/** Tiempo de conocerse de las referencias (Documento 16 S8, cerrado, sin "Otro"). */
export const TIEMPO_CONOCERSE_OPTIONS = ['1 año', '2 años', '3 años', 'más de 5 años'] as const;

/**
 * Ingresos mensuales del fiador (Documento 16 S5, 5 categorías).
 * Redacción "Desde X hasta menos de Y" / "Z o más" (ajustada 2026-08-22):
 * cada cifra límite (2M, 3M, 5M, 10M) pertenece sin ambigüedad a una
 * sola categoría -- la que la incluye como piso ("Desde X..."), nunca
 * la que la usaba como techo. Sin apóstrofe como separador de miles
 * (ajustado el mismo día): el apóstrofe recto se corrompía a comilla
 * tipográfica al copiar/pegar entre el archivo de migración y el SQL
 * Editor de Supabase, rompiendo el CHECK constraint -- el punto solo
 * ya separa los miles con suficiente claridad.
 */
export const INGRESOS_OPTIONS = [
  "Desde 1.000.000 hasta menos de 2.000.000",
  "Desde 2.000.000 hasta menos de 3.000.000",
  "Desde 3.000.000 hasta menos de 5.000.000",
  "Desde 5.000.000 hasta menos de 10.000.000",
  "10.000.000 o más",
] as const;

/** Categorías de ingresos que cuentan como elegibilidad OK (>= $3.000.000, equivalente a la regla numérica anterior). */
export const INGRESOS_PASS = new Set<string>(INGRESOS_OPTIONS.slice(2));

// Regex Patterns
const LettersOnly = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
/** Parentesco permite "()" y "/" además de letras (ej. "Esposo(a) / Cónyuge", "Hermano(a)"). */
const ParentescoChars = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ()/\s]+$/;

export const ReferenceSchema = z.object({
  tipo_referencia: z.enum(['FAMILIAR', 'PERSONAL']),
  nombre_completo: z.string()
    .min(3, "Obligatorio")
    .max(60, "Máximo 60 letras")
    .regex(LettersOnly, "Solo se permiten letras"),
  parentesco_o_relacion: z.string()
    .min(2, "Obligatorio")
    .max(33, "Máximo 33 caracteres")
    .regex(ParentescoChars, "Caracteres no permitidos"),
  telefono: z.string().regex(PHONE_CO, "Debe tener 10 números e iniciar en 3"),
  tiempo_conocimiento: z.enum(TIEMPO_CONOCERSE_OPTIONS as unknown as [string, ...string[]], { message: "Selecciona una opción" }),
  ocupacion: z.string()
    .min(2, "Obligatorio")
    .max(15, "Máximo 15 letras")
    .regex(LettersOnly, "Solo se permiten letras"),
})

export const GuarantorSchema = z.object({
  nombre_completo: z.string()
    .min(3, "Obligatorio")
    .max(15, "Máximo 15 letras")
    .regex(LettersOnly, "Solo se permiten letras"),
  numero_documento: z.string()
    .min(6, "Mínimo 6 números")
    .max(10, "Máximo 10 números")
    .regex(/^\d+$/, "Solo números"),
  telefono: z.string().regex(PHONE_CO, "Debe tener 10 números e iniciar en 3"),
  ingresos_mensuales_aprox: z.enum(INGRESOS_OPTIONS as unknown as [string, ...string[]], { message: "Selecciona una opción" }),
  tiene_finca_raiz: z.boolean(),
})

export const ApplicationPayloadSchema = z.object({
  activo_id: z.string().uuid("Debes seleccionar una oportunidad"),
  video_token: z.string().uuid("Debes ver la presentación completa antes de postularte."),
  perfil_publicitario: z.enum(['GENERAL', 'CONDUCTOR', 'INDEPENDIENTE']).default('GENERAL'),
  nombres: z.string()
    .min(2, "Obligatorio")
    .max(111, "Máximo 111 letras")
    .regex(LettersOnly, "Solo se permiten letras"),
  apellidos: z.string()
    .min(2, "Obligatorio")
    .max(111, "Máximo 111 letras")
    .regex(LettersOnly, "Solo se permiten letras"),
  // Control de calidad del dato (18-60): distinto del rango de
  // elegibilidad interna (24-55), que se evalúa aparte -- ver
  // EDAD_MINIMA_ELEGIBLE/EDAD_MAXIMA_ELEGIBLE más abajo.
  edad: z.number({ message: "Ingresa tu edad" })
    .int("Ingresa un número entero")
    .min(18, "Mínimo 18 años")
    .max(60, "Máximo 60 años"),
  tipo_documento: z.enum(['CC', 'CE', 'PEP']),
  numero_documento: z.string()
    .min(7, "Mínimo 7 números")
    .max(10, "Máximo 10 números")
    .regex(/^\d+$/, "Solo números"),
  correo_electronico: z.string().email("Correo electrónico inválido").transform(s => s.trim().toLowerCase()),
  confirmacion_correo: z.string().email("Correo electrónico inválido").transform(s => s.trim().toLowerCase()),
  telefono: z.string().regex(PHONE_CO, "Debe tener 10 números e iniciar en 3"),
  ciudad_operacion_id: z.string().uuid("Selecciona una ciudad válida"),
  municipio_operacion_id: z.string().uuid("Selecciona un municipio válido"),
  genero: z.enum(GENEROS as unknown as [string, ...string[]], { message: "Selecciona una opción" }),
  barrio: z.string()
    .min(4, "Obligatorio (mínimo 4 letras)")
    .max(15, "Máximo 15 letras")
    .regex(LettersOnly, "Solo se permiten letras"),

  tipo_perfil: z.enum(['CONDUCTOR_PLATAFORMA', 'EMPLEADO']),
  // Exactamente uno de los dos, segun tipo_perfil -- validado con .refine() abajo.
  plataformas: z.array(z.string().min(2).max(15).regex(LettersOnly, "Solo se permiten letras")).optional(),
  categoria_actividad: z.string().min(2, "Obligatorio").max(15, "Máximo 15 letras").regex(LettersOnly, "Solo se permiten letras").optional(),


  anos_experiencia_declarados: z.number()
    .min(0, "Mínimo 0")
    .max(60, "Máximo 60 años"),
  licencia_declarada_vigente: z.boolean(),
  licencia_categorias: z.array(z.string()).default([]),
  cantidad_comparendos_declarados: z.number()
    .min(0, "Mínimo 0")
    .max(10, "Máximo 10"),
  // Fase 18 (2026-08-25): solo aplican -- y solo se validan como
  // obligatorios -- cuando cantidad_comparendos_declarados está entre 1 y
  // SIMIT_MAX_FINES_REQUIRING_VALIDATION (ver .superRefine debajo y
  // evaluateComparendosFilter). Son datos DECLARADOS por el candidato, no
  // verificados por Humania -- ver la distinción explícita en el nombre.
  paz_y_salvo_declarado: z.boolean().nullable().optional(),
  acuerdo_pago_declarado: z.boolean().nullable().optional(),

  fiador: GuarantorSchema.nullable(),
  referencias: z.array(ReferenceSchema).length(2, "Debes incluir exactamente 2 referencias"),

  policyVersion: z.string().min(1, "Debes consultar la Política de Tratamiento de Datos Personales."),
  dataAuthorization: z.literal(true, {
    message: "Debes autorizar el tratamiento de tus datos personales.",
  }),
}).refine(data => data.correo_electronico === data.confirmacion_correo, {
  message: "Los correos electrónicos no coinciden",
  path: ["confirmacion_correo"],
}).refine(data => {
  const hasFamiliar = data.referencias.some(r => r.tipo_referencia === 'FAMILIAR');
  const hasPersonal = data.referencias.some(r => r.tipo_referencia === 'PERSONAL');
  return hasFamiliar && hasPersonal;
}, {
  message: "Debes incluir 1 referencia Familiar y 1 Personal",
  path: ["referencias"],
}).refine(data => {
  if (data.tipo_perfil === 'CONDUCTOR_PLATAFORMA') return !!data.plataformas && data.plataformas.length > 0 && !data.categoria_actividad
  return !!data.categoria_actividad && !data.plataformas
}, {
  message: "Selecciona al menos una opción para tu perfil de actividad",
  path: ["plataformas"],
}).superRefine((data, ctx) => {
  // Fase 18: si el candidato declara entre 1 y SIMIT_MAX_FINES_REQUIRING_VALIDATION
  // comparendos, las preguntas de paz y salvo / acuerdo de pago pasan a ser
  // obligatorias -- exactamente el mismo rango que activa las preguntas en
  // el formulario (ver Paso 4 de /apply).
  const requierePazYSalvo = data.cantidad_comparendos_declarados >= 1
    && data.cantidad_comparendos_declarados <= SIMIT_MAX_FINES_REQUIRING_VALIDATION
  if (!requierePazYSalvo) return
  if (typeof data.paz_y_salvo_declarado !== 'boolean') {
    ctx.addIssue({ code: 'custom', path: ['paz_y_salvo_declarado'], message: 'Debes responder si tienes paz y salvo.' })
    return
  }
  if (data.paz_y_salvo_declarado === false && typeof data.acuerdo_pago_declarado !== 'boolean') {
    ctx.addIssue({ code: 'custom', path: ['acuerdo_pago_declarado'], message: 'Debes responder si tienes acuerdo de pago.' })
  }
})

export type ApplicationPayload = z.infer<typeof ApplicationPayloadSchema>

// ==========================================
// 2. REGLAS DE NEGOCIO Y EVALUACIÓN
// ==========================================

export type EligibilityResult = {
  // 'DESCARTADO' es el estado terminal vigente desde Fase 6 (candidatos_estado_check);
  // 'NO_ELEGIBLE' quedo consolidado en 'DESCARTADO' y ya no es un valor valido en BD.
  estado: 'REVISION_PRELIMINAR' | 'DESCARTADO'
  razones: string[]
}

// Rango de edad interno elegible (Fase 17, 2026-08-25): mayor a 23 y
// menor a 56, es decir 24-55 inclusive. Distinto del rango de calidad del
// dato (18-60) que ya valida el propio campo del formulario -- ver
// ApplicationPayloadSchema.edad más arriba.
export const EDAD_MINIMA_ELEGIBLE = 24
export const EDAD_MAXIMA_ELEGIBLE = 55

export function edadFueraDeRangoElegible(edad: number): boolean {
  return edad < EDAD_MINIMA_ELEGIBLE || edad > EDAD_MAXIMA_ELEGIBLE
}

export function evaluateInitialEligibility(data: ApplicationPayload): EligibilityResult {
  const razones: string[] = []

  if (!data.licencia_declarada_vigente) razones.push("LICENCIA_NO_VIGENTE_DECLARADA")
  // El filtro de comparendos (Fase 18) ya NO vive aquí -- se resuelve antes,
  // en /api/apply/route.ts, con evaluateComparendosFilter (abajo), porque
  // necesita el número real de SIMIT además de lo declarado. Si no pasa, la
  // postulación nunca llega a este punto (mismo patrón de descarte
  // silencioso que el filtro de edad, Fase 17).
  if (!data.fiador) razones.push("FIADOR_NO_PROPORCIONADO")
  // Fase 17: la finca raíz del fiador reemplaza el requisito de ingreso --
  // cualquiera de las dos condiciones alcanza, ya no solo el ingreso.
  else if (!data.fiador.tiene_finca_raiz && !INGRESOS_PASS.has(data.fiador.ingresos_mensuales_aprox)) razones.push("FIADOR_INGRESOS_INSUFICIENTES")

  if (razones.length > 0) {
    return { estado: 'DESCARTADO', razones }
  }

  return { estado: 'REVISION_PRELIMINAR', razones: [] }
}

export type ComparendosFilterResult = {
  pasa: boolean
  comparendosEfectivos: number
  fuenteComparendos: 'SIMIT' | 'DECLARADO'
  razon?: string
}

/**
 * Filtro de comparendos (Fase 18, 2026-08-25). Árbol de decisión:
 *   0 comparendos                              -> PASA
 *   1 a SIMIT_MAX_FINES_REQUIRING_VALIDATION    -> PASA solo con paz y salvo,
 *                                                   o si no, con acuerdo de pago
 *   más de SIMIT_MAX_FINES_REQUIRING_VALIDATION -> NO PASA, sin excepción
 *
 * El número real de SIMIT manda cuando la consulta fue exitosa (para
 * resolver el caso real que motivó esta fase: SIMIT no siempre está
 * actualizado, pero cuando SÍ responde, es la fuente más confiable). Si
 * SIMIT no se pudo consultar (fail-open, igual que el resto del sistema),
 * se usa el número declarado por el candidato junto con lo que haya
 * respondido en el formulario.
 *
 * Caso borde confirmado explícitamente por el usuario (2026-08-25): si
 * SIMIT reporta un número real en el rango 1-4 pero el candidato declaró 0
 * (por lo que el formulario nunca le mostró las preguntas), se trata como
 * si hubiera respondido "No" a ambas -> NO PASA. Nunca se aprueba a nadie
 * sin una respuesta afirmativa real a paz y salvo o acuerdo de pago.
 */
export function evaluateComparendosFilter(
  comparendosDeclarados: number,
  pazYSalvoDeclarado: boolean | null | undefined,
  acuerdoPagoDeclarado: boolean | null | undefined,
  simit: Pick<SimitQueryResult, 'consultado' | 'number_fines'>
): ComparendosFilterResult {
  const usarSimit = simit.consultado && simit.number_fines !== null
  const comparendosEfectivos = usarSimit ? (simit.number_fines as number) : comparendosDeclarados
  const fuenteComparendos: 'SIMIT' | 'DECLARADO' = usarSimit ? 'SIMIT' : 'DECLARADO'

  if (comparendosEfectivos === 0) {
    return { pasa: true, comparendosEfectivos, fuenteComparendos }
  }
  if (comparendosEfectivos > SIMIT_MAX_FINES_REQUIRING_VALIDATION) {
    return { pasa: false, comparendosEfectivos, fuenteComparendos, razon: 'COMPARENDOS_FUERA_DE_RANGO' }
  }
  if (pazYSalvoDeclarado === true) {
    return { pasa: true, comparendosEfectivos, fuenteComparendos }
  }
  if (acuerdoPagoDeclarado === true) {
    return { pasa: true, comparendosEfectivos, fuenteComparendos }
  }
  return { pasa: false, comparendosEfectivos, fuenteComparendos, razon: 'SIN_PAZ_Y_SALVO_NI_ACUERDO_PAGO' }
}

export type RequirementEvaluation = {
  requirement: string;
  status: 'PASS' | 'FAIL' | 'PENDING_VERIFICATION' | 'NA';
  label: string;
  reason: string;
}

export function evaluateCandidateRequirements(data: any): RequirementEvaluation[] {
  const evaluations: RequirementEvaluation[] = [];

  // Licencia
  if (data.licencia_declarada_vigente) {
    evaluations.push({ requirement: 'LICENCIA', status: 'PASS', label: 'Licencia vigente', reason: 'Declarada como vigente (requiere confirmación RUNT)' });
  } else {
    evaluations.push({ requirement: 'LICENCIA', status: 'FAIL', label: 'Licencia no vigente', reason: 'El candidato indicó no tener licencia vigente' });
  }

  // Comparendos (Fase 18): todo candidato que llega a existir en esta tabla
  // ya pasó el filtro (0, o 1-4 con paz y salvo/acuerdo de pago) -- ese
  // filtro corre antes de crear la fila, en /api/apply/route.ts. Lo que se
  // muestra aquí es CÓMO pasó, como contexto para el equipo humano.
  const comparendosEfectivos = data.simit_number_fines ?? data.cantidad_comparendos_declarados;
  if (comparendosEfectivos === 0) {
    evaluations.push({ requirement: 'COMPARENDOS', status: 'PASS', label: 'Sin comparendos', reason: '0 comparendos reportados' });
  } else if (data.paz_y_salvo_declarado) {
    evaluations.push({ requirement: 'COMPARENDOS', status: 'PASS', label: 'Comparendos con paz y salvo', reason: `${comparendosEfectivos} comparendos declarados, con paz y salvo declarado` });
  } else if (data.acuerdo_pago_declarado) {
    evaluations.push({ requirement: 'COMPARENDOS', status: 'PASS', label: 'Comparendos con acuerdo de pago', reason: `${comparendosEfectivos} comparendos declarados, con acuerdo de pago declarado (sin paz y salvo)` });
  } else {
    evaluations.push({ requirement: 'COMPARENDOS', status: 'PENDING_VERIFICATION', label: 'Comparendos', reason: `${comparendosEfectivos} comparendos reportados, sin paz y salvo ni acuerdo de pago registrados` });
  }

  // Comparendos vs. SIMIT: el candidato declara una cantidad en el
  // formulario; la API de SIMIT reporta la cantidad real al momento del
  // envío. Deben coincidir — una diferencia es una alerta para el equipo
  // humano (no un descarte automático, eso ya lo resuelve NUMBER_FINES
  // en /api/apply).
  if (data.simit_number_fines === null || data.simit_number_fines === undefined) {
    evaluations.push({ requirement: 'COMPARENDOS_SIMIT', status: 'NA', label: 'Comparendos vs. SIMIT', reason: 'No se pudo consultar SIMIT al momento del envío' });
  } else if (data.simit_number_fines === data.cantidad_comparendos_declarados) {
    evaluations.push({ requirement: 'COMPARENDOS_SIMIT', status: 'PASS', label: 'Comparendos vs. SIMIT', reason: `Coincide con lo declarado (${data.cantidad_comparendos_declarados})` });
  } else {
    evaluations.push({ requirement: 'COMPARENDOS_SIMIT', status: 'FAIL', label: 'Comparendos vs. SIMIT no coinciden', reason: `SIMIT reporta ${data.simit_number_fines}; el candidato declaró ${data.cantidad_comparendos_declarados}` });
  }

  // Referencias
  const refs = data.referencias || [];
  const hasFamiliar = refs.some((r: any) => r.tipo_referencia === 'FAMILIAR');
  const hasPersonal = refs.some((r: any) => r.tipo_referencia === 'PERSONAL');

  if (hasFamiliar) {
    evaluations.push({ requirement: 'REF_FAMILIAR', status: 'PASS', label: 'Referencia familiar', reason: 'Registrada correctamente' });
  } else {
    evaluations.push({ requirement: 'REF_FAMILIAR', status: 'FAIL', label: 'Falta referencia familiar', reason: 'No se encontró referencia de tipo familiar' });
  }

  if (hasPersonal) {
    evaluations.push({ requirement: 'REF_PERSONAL', status: 'PASS', label: 'Referencia personal', reason: 'Registrada correctamente' });
  } else {
    evaluations.push({ requirement: 'REF_PERSONAL', status: 'FAIL', label: 'Falta referencia personal', reason: 'No se encontró referencia de tipo personal' });
  }

  // Fiador
  const fiador = data.fiador; 
  if (fiador) {
    evaluations.push({ requirement: 'FIADOR', status: 'PASS', label: 'Fiador registrado', reason: 'Datos de respaldo completos' });
    
    // Filtro real (Documento 16, ajustado en Fase 17): el fiador solidario
    // cumple si declara ingresos desde $3.000.000 en adelante, O si tiene
    // finca raíz -- cualquiera de las dos alcanza. Si ninguna se cumple,
    // descarta al candidato desde el envio de /apply
    // (evaluateInitialEligibility) -- este FAIL es la explicacion visible
    // para el equipo humano de por que quedo DESCARTADO.
    const cumpleIngreso = INGRESOS_PASS.has(fiador.ingresos_mensuales_aprox);
    const cumpleFincaRaiz = fiador.tiene_finca_raiz === true;
    if (cumpleFincaRaiz || cumpleIngreso) {
      evaluations.push({
        requirement: 'FIADOR_INGRESOS',
        status: 'PASS',
        label: 'Ingresos o finca raíz del fiador',
        reason: cumpleFincaRaiz ? 'Cumple por finca raíz declarada (reemplaza el requisito de ingreso)' : 'Cumple por ingresos (fiador solvente, desde $3.000.000)',
      });
    } else {
      evaluations.push({
        requirement: 'FIADOR_INGRESOS',
        status: 'FAIL',
        label: 'Fiador no cumple ingreso ni finca raíz',
        reason: `Categoría de ingresos declarada: "${fiador.ingresos_mensuales_aprox}" (inferior al mínimo) y no declaró finca raíz`,
      });
    }

    if (fiador.tiene_finca_raiz) {
      evaluations.push({ requirement: 'FINCA_RAIZ', status: 'PENDING_VERIFICATION', label: 'Finca raíz del fiador', reason: 'Declarada por el candidato, pendiente de verificación documental' });
    } else {
      evaluations.push({ requirement: 'FINCA_RAIZ', status: 'NA', label: 'Finca raíz del fiador', reason: 'No declarada' });
    }
  } else {
    evaluations.push({ requirement: 'FIADOR', status: 'FAIL', label: 'Fiador faltante', reason: 'No se registró información del fiador' });
  }

  return evaluations;
}

/**
 * Completitud de INFORMACION AVANZADA (ENTREVISTA), campos exactos
 * renderizados hoy en EvaluacionForm.tsx. Debe coincidir exactamente
 * con la validacion en la RPC bulk_change_candidate_status (Fase 10).
 * Acepta el objeto o el array que puede devolver el join de Supabase.
 */
type EvaluacionAvanzada = {
  edad: number | null
  estado_civil: string | null
  tiene_hijos: boolean | null
  cantidad_hijos: number | null
  con_quien_vive: string | null
  personas_dependientes: number | null
  descripcion_responsabilidades: string | null
}

export function evaluacionAvanzadaCompleta(evaluacionRaw: EvaluacionAvanzada | EvaluacionAvanzada[] | null | undefined): boolean {
  const evaluacion = Array.isArray(evaluacionRaw) ? evaluacionRaw[0] : evaluacionRaw
  if (!evaluacion) return false
  if (evaluacion.edad === null || evaluacion.edad === undefined) return false
  if (!evaluacion.estado_civil?.trim()) return false
  if (evaluacion.tiene_hijos === null || evaluacion.tiene_hijos === undefined) return false
  if (evaluacion.tiene_hijos && (evaluacion.cantidad_hijos === null || evaluacion.cantidad_hijos === undefined)) return false
  if (!evaluacion.con_quien_vive?.trim()) return false
  if (evaluacion.personas_dependientes === null || evaluacion.personas_dependientes === undefined) return false
  if (!evaluacion.descripcion_responsabilidades?.trim()) return false
  return true
}

/**
 * Completitud de la visita domiciliaria (Fase 19, 2026-08-25). Debe
 * coincidir exactamente con la validación en la RPC
 * bulk_change_candidate_status (misma condición: realizada = true Y
 * calificación no nula -- las observaciones obligatorias cuando la
 * calificación es "Apto con reserva" ya las exige el CHECK de la propia
 * tabla, así que no hace falta repetir esa parte aquí). Función aparte de
 * `evaluacionAvanzadaCompleta` porque en la RPC también es una
 * precondición aparte (bloque `IF` propio), no parte del mismo chequeo.
 */
type VisitaDomiciliaria = {
  visita_domiciliaria_realizada: boolean | null
  visita_domiciliaria_calificacion: string | null
}

export function visitaDomiciliariaCompleta(evaluacionRaw: VisitaDomiciliaria | VisitaDomiciliaria[] | null | undefined): boolean {
  const evaluacion = Array.isArray(evaluacionRaw) ? evaluacionRaw[0] : evaluacionRaw
  if (!evaluacion) return false
  if (evaluacion.visita_domiciliaria_realizada !== true) return false
  if (!evaluacion.visita_domiciliaria_calificacion) return false
  return true
}
