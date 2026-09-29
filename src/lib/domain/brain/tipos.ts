// Humania WhatsApp Brain (KAI-44) — contrato del conocimiento oficial.
// Ver Documentos/SDD/whatsapp-brain/spec.md (5.1-5.7, 6) y plan.md (5).
// Módulo de dominio puro: sin Next.js, sin Supabase, sin red, sin efectos.
// Este archivo NO contiene conocimiento de negocio: el contenido real vive
// fuera del repositorio (público), en Documentos/SDD/whatsapp-brain/contenido/.

/** Identificador del formato de archivo (no del contenido). */
export const FORMATO_BRAIN = 'HUMANIA_BRAIN_V1' as const

export const CATEGORIAS = [
  'MODELO_NEGOCIO',
  'VEHICULOS',
  'REQUISITOS',
  'REFERENCIAS_FIADOR',
  'PROCESO',
  'CONTRATO_PAGOS',
  'MANTENIMIENTO_SEGUROS',
  'FAQ_OBJECIONES',
  'FUERA_DE_ALCANCE',
] as const
export type Categoria = (typeof CATEGORIAS)[number]

/** Eje 1 — qué tan cierto es el dato (spec.md 5.2). */
export const ESTADOS_VERDAD = [
  'CONFIRMADO',
  'CONFIRMADO_APROBADO',
  'PENDIENTE_DE_DECISION',
  'PENDIENTE_DE_VALIDACION',
  'CONTRADICTORIO',
] as const
export type EstadoVerdad = (typeof ESTADOS_VERDAD)[number]

/** Eje 2 — quién puede verlo (spec.md 5.3). Estar en el Brain no implica poder enviarse. */
export const VISIBILIDADES = ['INTERNO', 'NO_AUTORIZADO_PARA_CLIENTE', 'PUBLICO_AUTORIZADO'] as const
export type Visibilidad = (typeof VISIBILIDADES)[number]

/** Informativo en v1: no participa en la regla de exposición (decisión del 29-09-2026). */
export const NIVELES_CONFIANZA = ['ALTO', 'MEDIO', 'BAJO'] as const
export type NivelConfianza = (typeof NIVELES_CONFIANZA)[number]

export const TIPOS_FUENTE = ['CONTRATO', 'DOCUMENTO', 'CODIGO', 'MIGRACION', 'PAGINA_PUBLICA', 'DECISION_NEGOCIO'] as const
export type TipoFuente = (typeof TIPOS_FUENTE)[number]

/**
 * Quién aprueba (D5, plan T8). Un solo valor en v1; para más aprobadores en el
 * futuro basta con agregar valores aquí, sin romper los archivos existentes.
 */
export const ROLES_APROBACION = ['PRODUCT_OWNER'] as const
export type RolAprobacion = (typeof ROLES_APROBACION)[number]

export const ESTADOS_BRAIN = ['BORRADOR', 'ACTIVA', 'HISTORICA'] as const
export type EstadoBrain = (typeof ESTADOS_BRAIN)[number]

export const PATRON_ID_FICHA = /^KB-\d{4}$/
export const PATRON_AUDIO = /^AUDIO-\d{3}$/
export const PATRON_INTENCION = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/

export interface Fuente {
  tipo: TipoFuente
  referencia: string
  /** ISO `YYYY-MM-DD`. */
  fecha?: string | null
}

export interface Contradiccion {
  descripcion: string
  decisionRequerida: string
}

export interface Aprobacion {
  aprobadoPor: string
  rol: RolAprobacion
  /** ISO `YYYY-MM-DD`. */
  fecha: string
}

/** Ficha de conocimiento (spec.md 5.1). */
export interface FichaConocimiento {
  id: string
  version: number
  categoria: Categoria
  intencion: string
  pregunta: string
  respuesta: string
  audioId: string | null
  fuentes: Fuente[]
  nivelConfianza: NivelConfianza
  estadoVerdad: EstadoVerdad
  visibilidad: Visibilidad
  requiereHumano: boolean
  motivoEscalamiento: string | null
  contradiccion: Contradiccion | null
  aprobacion: Aprobacion | null
  versionNegocio: string
  /** ISO `YYYY-MM-DD`. */
  fechaRevision: string
  /** Solo para el equipo. Nunca se expone. */
  notasInternas: string | null
}

/** Campos del formato de la ficha, en orden. Todo lo demás es una propiedad desconocida. */
export const CAMPOS_FICHA = [
  'id',
  'version',
  'categoria',
  'intencion',
  'pregunta',
  'respuesta',
  'audioId',
  'fuentes',
  'nivelConfianza',
  'estadoVerdad',
  'visibilidad',
  'requiereHumano',
  'motivoEscalamiento',
  'contradiccion',
  'aprobacion',
  'versionNegocio',
  'fechaRevision',
  'notasInternas',
] as const satisfies readonly (keyof FichaConocimiento)[]

/** Una versión del Brain: un archivo `brain-vNNNN.json` (spec.md 6.1, plan.md 5.2). */
export interface VersionBrain {
  formato: typeof FORMATO_BRAIN
  version: number
  estado: EstadoBrain
  /** ISO 8601 con zona horaria. */
  creadaEn: string
  /** ISO 8601 con zona horaria; obligatoria en ACTIVA e HISTORICA. */
  activadaEn: string | null
  /** Obligatorio en ACTIVA e HISTORICA. */
  aprobadaPor: string | null
  descripcionCambios: string
  fichas: FichaConocimiento[]
}

export const CAMPOS_VERSION = [
  'formato',
  'version',
  'estado',
  'creadaEn',
  'activadaEn',
  'aprobadaPor',
  'descripcionCambios',
  'fichas',
] as const satisfies readonly (keyof VersionBrain)[]

/** Códigos de regla de los problemas de validación (plan.md 5.3). */
export const CODIGOS_REGLA = [
  'CAMPO_OBLIGATORIO',
  'TIPO_INVALIDO',
  'VALOR_NO_PERMITIDO',
  'FORMATO_ID',
  'FORMATO_INTENCION',
  'FECHA_ISO',
  'TEXTO_VACIO',
  'RESPUESTA_VACIA',
  'FUENTES',
  'CONTRADICCION',
  'APROBACION',
  'ESCALAMIENTO',
  'AUDIO_FORMATO',
  'AUDIO_DESCONOCIDO',
  'ID_DUPLICADO',
  'VERSION_BRAIN',
  'ESTADO_BRAIN',
  'VERSIONES_ACTIVAS',
  'INMUTABILIDAD',
  'VERSION_REGRESIVA',
  'NOMBRE_ARCHIVO',
  'JSON_INVALIDO',
  'PROPIEDAD_DESCONOCIDA',
  'PUBLICO_NO_APROBADO',
] as const
export type CodigoRegla = (typeof CODIGOS_REGLA)[number]

export interface ProblemaValidacion {
  /** ERROR bloquea; ADVERTENCIA se muestra pero no bloquea (plan T3). */
  nivel: 'ERROR' | 'ADVERTENCIA'
  archivo?: string
  brainVersion?: number
  fichaId?: string
  campo?: string
  regla: CodigoRegla
  /** Qué se esperaba y qué se recibió. */
  motivo: string
}

export interface ResultadoValidacion {
  errores: ProblemaValidacion[]
  advertencias: ProblemaValidacion[]
}

/** Opciones de validación. `catalogoAudios` es opcional hasta que exista el catálogo real (KAI-74). */
export interface OpcionesValidacion {
  catalogoAudios?: ReadonlySet<string>
}

/** Motivos de escalamiento de la consulta pública (spec.md 5.5). Lista cerrada. */
export const MOTIVOS_ESCALAMIENTO = [
  'SIN_CONOCIMIENTO',
  'NO_AUTORIZADO',
  'PENDIENTE',
  'CONTRADICTORIO',
  'REQUIERE_HUMANO',
  'BRAIN_INVALIDO',
  'VERSION_DESCONOCIDA',
] as const
export type MotivoEscalamiento = (typeof MOTIVOS_ESCALAMIENTO)[number]
