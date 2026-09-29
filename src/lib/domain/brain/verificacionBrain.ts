// Humania WhatsApp Brain (KAI-44) — verificación del contrato del Brain.
// Cubre los criterios de aceptación AC-01 a AC-31 de
// Documentos/SDD/whatsapp-brain/spec.md (AC-29/AC-30 también con la guardia real).
// Mismo mecanismo que presupuesto/ y seguros/: sin framework de pruebas; se
// compila con `tsc` y se ejecuta con node. Solo usa fixtures SINTÉTICOS.
//
//   npm run verificar:brain   (desde web/)

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evaluarExposicion } from './exposicion'
import { clonar, ficha, fichaEnEstado, version } from './fixtures'
import { consultarPublico, type DecisionPublica } from './publico'
import { CAMPOS_FICHA, ESTADOS_VERDAD, VISIBILIDADES, type FichaConocimiento, type ProblemaValidacion } from './tipos'
import { NIVEL_PUBLICO_NO_APROBADO, esFechaHoraIso, esFechaIso, separar, validarFicha, validarVersionBrain } from './validacion'
import { validarRutaContenido } from './validarContenido'
import { EXENTOS_IMPORTS, NUCLEO_BRAIN, revisarRepositorio } from './verificacionRepositorio'
import { compararVersiones, validarConjunto } from './versionado'

let casos = 0
function verificar(nombre: string, fn: () => void) {
  casos++
  try {
    fn()
    console.log(`OK   ${nombre}`)
  } catch (err) {
    console.error(`FAIL ${nombre}`)
    throw err
  }
}

const errores = (f: unknown) => separar(validarFicha(f)).errores
const tieneError = (problemas: ProblemaValidacion[], regla: string, campo?: string) =>
  problemas.some((p) => p.nivel === 'ERROR' && p.regla === regla && (campo === undefined || p.campo === campo))
const conActiva = (...fichas: FichaConocimiento[]) => [version(1, 'ACTIVA', fichas)]
const escala = (d: DecisionPublica, motivo: string) => {
  assert.deepEqual(d, { accion: 'ESCALAR', motivo })
  assert.deepEqual(Object.keys(d).sort(), ['accion', 'motivo'])
}

// ---------------------------------------------------------------- AC-01 a AC-10: formato y validación

verificar('AC-01 una ficha con todos los campos válidos no tiene errores ni advertencias', () => {
  assert.deepEqual(validarFicha(ficha()), [])
  assert.deepEqual(validarVersionBrain(version(1, 'ACTIVA', [ficha()])), { errores: [], advertencias: [] })
})

verificar('AC-02 cada campo obligatorio ausente es rechazado y el error nombra el campo', () => {
  for (const campo of CAMPOS_FICHA) {
    const f = ficha() as unknown as Record<string, unknown>
    delete f[campo]
    assert.ok(tieneError(errores(f), 'CAMPO_OBLIGATORIO', campo), `falta el error CAMPO_OBLIGATORIO en ${campo}`)
  }
})

verificar('AC-02 campos vacíos o con tipo incorrecto son rechazados con el nombre del campo', () => {
  assert.ok(tieneError(errores(ficha({ pregunta: '   ' })), 'TEXTO_VACIO', 'pregunta'))
  assert.ok(tieneError(errores(ficha({ versionNegocio: '' })), 'TEXTO_VACIO', 'versionNegocio'))
  assert.ok(tieneError(errores({ ...ficha(), pregunta: 5 }), 'TIPO_INVALIDO', 'pregunta'))
  assert.ok(tieneError(errores({ ...ficha(), respuesta: 7 }), 'TIPO_INVALIDO', 'respuesta'))
  assert.ok(tieneError(errores({ ...ficha(), requiereHumano: 'no' }), 'TIPO_INVALIDO', 'requiereHumano'))
  assert.ok(tieneError(errores({ ...ficha(), fuentes: 'Fuente de prueba' }), 'TIPO_INVALIDO', 'fuentes'))
  assert.ok(tieneError(errores({ ...ficha(), notasInternas: 3 }), 'TIPO_INVALIDO', 'notasInternas'))
  for (const campo of ['nivelConfianza', 'estadoVerdad', 'visibilidad'] as const) {
    assert.ok(tieneError(errores({ ...ficha(), [campo]: 'OTRO' }), 'VALOR_NO_PERMITIDO', campo), campo)
  }
})

verificar('AC-02 la validación nunca lanza, sin importar la forma de la entrada', () => {
  for (const entrada of [null, undefined, [], 'texto', 42, { id: 5 }, { fuentes: [null, 3] }]) {
    assert.ok(errores(entrada).length > 0)
  }
  for (const entrada of [null, [], 'x', { fichas: 'no' }, { fichas: [null] }]) {
    assert.ok(validarVersionBrain(entrada).errores.length > 0)
  }
})

verificar('AC-03 id, version, categoría e intención fuera de formato son rechazados', () => {
  for (const id of ['KB-1', 'kb-0001', 'KB-00001', 'XX-0001']) assert.ok(tieneError(errores(ficha({ id })), 'FORMATO_ID', 'id'), id)
  for (const v of [0, -1, 1.5]) assert.ok(tieneError(errores(ficha({ version: v })), 'VALOR_NO_PERMITIDO', 'version'), String(v))
  assert.ok(tieneError(errores({ ...ficha(), version: '1' }), 'VALOR_NO_PERMITIDO', 'version'))
  assert.ok(tieneError(errores({ ...ficha(), categoria: 'OTRA' }), 'VALOR_NO_PERMITIDO', 'categoria'))
  for (const intencion of ['modelo_negocio', 'Modelo', 'MODELO NEGOCIO', '_MODELO', 'MODELO__NEGOCIO', '']) {
    assert.ok(tieneError(errores(ficha({ intencion })), 'FORMATO_INTENCION', 'intencion'), intencion)
  }
  assert.deepEqual(errores(ficha({ intencion: 'MODELO_NEGOCIO_2' })), [])
})

verificar('AC-04 una ficha sin fuentes o con una fuente sin tipo válido o sin referencia es rechazada', () => {
  assert.ok(tieneError(errores(ficha({ fuentes: [] })), 'FUENTES', 'fuentes'))
  assert.ok(tieneError(errores({ ...ficha(), fuentes: [{ tipo: 'RUMOR', referencia: 'x' }] }), 'FUENTES', 'fuentes[0].tipo'))
  assert.ok(tieneError(errores({ ...ficha(), fuentes: [{ tipo: 'DOCUMENTO', referencia: ' ' }] }), 'FUENTES', 'fuentes[0].referencia'))
  assert.ok(tieneError(errores({ ...ficha(), fuentes: [{ tipo: 'DOCUMENTO' }] }), 'FUENTES', 'fuentes[0].referencia'))
  assert.ok(tieneError(errores({ ...ficha(), fuentes: ['texto'] }), 'FUENTES', 'fuentes[0]'))
  assert.ok(tieneError(errores(ficha({ fuentes: [{ tipo: 'DOCUMENTO', referencia: 'x', fecha: '29-09-2026' }] })), 'FECHA_ISO', 'fuentes[0].fecha'))
  assert.deepEqual(errores(ficha({ fuentes: [{ tipo: 'DOCUMENTO', referencia: 'x' }] })), [])
})

verificar('AC-05 contradicción: obligatoria si y solo si CONTRADICTORIO, y con al menos dos fuentes', () => {
  assert.deepEqual(errores(fichaEnEstado('CONTRADICTORIO')), [])
  assert.ok(tieneError(errores(fichaEnEstado('CONTRADICTORIO', { contradiccion: null })), 'CONTRADICCION', 'contradiccion'))
  assert.ok(tieneError(errores(fichaEnEstado('CONTRADICTORIO', { fuentes: [{ tipo: 'DOCUMENTO', referencia: 'única' }] })), 'CONTRADICCION', 'fuentes'))
  assert.ok(tieneError(errores(fichaEnEstado('CONTRADICTORIO', { contradiccion: { descripcion: '', decisionRequerida: 'x' } })), 'CONTRADICCION', 'contradiccion.descripcion'))
  assert.ok(tieneError(errores(fichaEnEstado('CONTRADICTORIO', { contradiccion: { descripcion: 'x', decisionRequerida: ' ' } })), 'CONTRADICCION', 'contradiccion.decisionRequerida'))
  const noContradictoria = fichaEnEstado('PENDIENTE_DE_DECISION', { contradiccion: { descripcion: 'x', decisionRequerida: 'y' }, fuentes: fichaEnEstado('CONTRADICTORIO').fuentes })
  assert.ok(tieneError(errores(noContradictoria), 'CONTRADICCION', 'contradiccion'))
})

verificar('AC-06 aprobación: obligatoria si y solo si CONFIRMADO_APROBADO, con rol PRODUCT_OWNER (D5)', () => {
  assert.ok(tieneError(errores(ficha({ aprobacion: null })), 'APROBACION', 'aprobacion'))
  assert.ok(tieneError(errores(fichaEnEstado('CONFIRMADO', { aprobacion: ficha().aprobacion })), 'APROBACION', 'aprobacion'))
  assert.ok(tieneError(errores({ ...ficha(), aprobacion: { aprobadoPor: 'x', rol: 'ADMIN', fecha: '2026-09-29' } }), 'APROBACION', 'aprobacion.rol'))
  assert.ok(tieneError(errores({ ...ficha(), aprobacion: { aprobadoPor: 'x', fecha: '2026-09-29' } }), 'APROBACION', 'aprobacion.rol'))
  assert.ok(tieneError(errores({ ...ficha(), aprobacion: { aprobadoPor: '', rol: 'PRODUCT_OWNER', fecha: '2026-09-29' } }), 'APROBACION', 'aprobacion.aprobadoPor'))
  assert.ok(tieneError(errores({ ...ficha(), aprobacion: { aprobadoPor: 'x', rol: 'PRODUCT_OWNER', fecha: '2026-13-01' } }), 'FECHA_ISO', 'aprobacion.fecha'))
})

verificar('AC-07 requiereHumano sin motivo de escalamiento es rechazado', () => {
  assert.ok(tieneError(errores(ficha({ requiereHumano: true, motivoEscalamiento: null })), 'ESCALAMIENTO', 'motivoEscalamiento'))
  assert.ok(tieneError(errores(ficha({ requiereHumano: true, motivoEscalamiento: '  ' })), 'ESCALAMIENTO', 'motivoEscalamiento'))
  assert.deepEqual(errores(ficha({ requiereHumano: true, motivoEscalamiento: 'Motivo de prueba' })), [])
})

verificar('AC-08 respuesta vacía: rechazada en estados confirmados, válida en pendientes o contradictorio', () => {
  assert.ok(tieneError(errores(fichaEnEstado('CONFIRMADO', { respuesta: '' })), 'RESPUESTA_VACIA', 'respuesta'))
  assert.ok(tieneError(errores(ficha({ respuesta: '   ' })), 'RESPUESTA_VACIA', 'respuesta'))
  for (const estado of ['PENDIENTE_DE_DECISION', 'PENDIENTE_DE_VALIDACION', 'CONTRADICTORIO'] as const) {
    assert.deepEqual(errores(fichaEnEstado(estado, { respuesta: '' })), [], estado)
  }
})

verificar('AC-09 fechas: solo ISO reales (YYYY-MM-DD; fecha y hora con zona en la versión)', () => {
  for (const f of ['2026-09-29', '2024-02-29', '2000-02-29']) assert.ok(esFechaIso(f), f)
  for (const f of ['2026-02-30', '2026-02-29', '1900-02-29', '29-09-2026', '2026-9-29', '2026-09-29T10:00:00Z', '', null, 20260929]) {
    assert.ok(!esFechaIso(f), String(f))
  }
  for (const f of ['2026-09-29T10:30:00-05:00', '2026-09-29T10:30Z', '2026-09-29T10:30:00.123+00:00']) assert.ok(esFechaHoraIso(f), f)
  for (const f of ['2026-09-29T10:30:00', '2026-09-29 10:30:00-05:00', '2026-09-29T25:00:00-05:00', '2026-02-30T10:00:00Z', '2026-09-29T10:60Z', '29-09-2026 10:30']) {
    assert.ok(!esFechaHoraIso(f), f)
  }
  assert.ok(tieneError(errores(ficha({ fechaRevision: '2026-02-30' })), 'FECHA_ISO', 'fechaRevision'))
  assert.ok(tieneError(validarVersionBrain(version(1, 'BORRADOR', [], { creadaEn: '2026-09-29T09:00:00' })).errores, 'FECHA_ISO', 'creadaEn'))
  assert.ok(tieneError(validarVersionBrain(version(1, 'ACTIVA', [], { activadaEn: '29-09-2026 10:30' })).errores, 'FECHA_ISO', 'activadaEn'))
})

verificar('AC-10 una versión con dos fichas del mismo id es rechazada', () => {
  const r = validarVersionBrain(version(1, 'ACTIVA', [ficha(), ficha({ pregunta: 'Pregunta de prueba 2' })]))
  assert.ok(r.errores.some((p) => p.regla === 'ID_DUPLICADO' && p.fichaId === 'KB-9001' && p.brainVersion === 1))
})

verificar('Versión del Brain: formato, campos obligatorios y coherencia del estado', () => {
  assert.ok(tieneError(validarVersionBrain({ ...version(1, 'BORRADOR', []), formato: 'OTRO' }).errores, 'VALOR_NO_PERMITIDO', 'formato'))
  const sinCampo = version(1, 'BORRADOR', []) as unknown as Record<string, unknown>
  delete sinCampo.descripcionCambios
  assert.ok(tieneError(validarVersionBrain(sinCampo).errores, 'CAMPO_OBLIGATORIO', 'descripcionCambios'))
  assert.ok(tieneError(validarVersionBrain(version(1, 'ACTIVA', [], { aprobadaPor: null })).errores, 'ESTADO_BRAIN', 'estado'))
  assert.ok(tieneError(validarVersionBrain(version(1, 'HISTORICA', [], { activadaEn: null })).errores, 'ESTADO_BRAIN', 'estado'))
  assert.ok(tieneError(validarVersionBrain(version(0, 'BORRADOR', [])).errores, 'VERSION_BRAIN', 'version'))
  assert.ok(tieneError(validarVersionBrain({ ...version(1, 'BORRADOR', []), estado: 'PUBLICADA' }).errores, 'VALOR_NO_PERMITIDO', 'estado'))
  const conError = validarVersionBrain(version(7, 'BORRADOR', [ficha({ respuesta: '' })]))
  assert.ok(conError.errores.every((p) => p.brainVersion === 7 && p.fichaId === 'KB-9001'), 'cada problema lleva la versión y la ficha')
})

// ---------------------------------------------------------------- AC-11 a AC-19: exposición

verificar('AC-11 ficha publicable → RESPONDER con exactamente fichaId, version, respuesta y audioId', () => {
  const d = consultarPublico(conActiva(ficha({ audioId: 'AUDIO-001' })), { fichaId: 'KB-9001' })
  assert.deepEqual(d, {
    accion: 'RESPONDER',
    brainVersion: 1,
    fichas: [{ fichaId: 'KB-9001', version: 1, respuesta: ficha().respuesta, audioId: 'AUDIO-001' }],
  })
  assert.equal(d.accion, 'RESPONDER')
  if (d.accion === 'RESPONDER') {
    assert.deepEqual(Object.keys(d).sort(), ['accion', 'brainVersion', 'fichas'])
    assert.deepEqual(Object.keys(d.fichas[0]).sort(), ['audioId', 'fichaId', 'respuesta', 'version'])
  }
})

verificar('AC-12 a AC-16 las 15 combinaciones estado de verdad × visibilidad: solo CONFIRMADO_APROBADO + PUBLICO_AUTORIZADO responde', () => {
  // Motivo de la regla de exposición (independiente de la validación).
  const motivoExposicion = (estado: string, visibilidad: string): string => {
    if (estado === 'CONTRADICTORIO') return 'CONTRADICTORIO'
    if (estado.startsWith('PENDIENTE')) return 'PENDIENTE'
    if (estado === 'CONFIRMADO_APROBADO' && visibilidad === 'PUBLICO_AUTORIZADO') return 'RESPONDER'
    return 'NO_AUTORIZADO'
  }
  let combinaciones = 0
  let invalidas = 0
  for (const estado of ESTADOS_VERDAD) {
    for (const visibilidad of VISIBILIDADES) {
      combinaciones++
      const f = fichaEnEstado(estado, { visibilidad })
      const d = consultarPublico(conActiva(f), { fichaId: f.id })
      const obtenido = d.accion === 'RESPONDER' ? 'RESPONDER' : d.motivo
      const ev = evaluarExposicion(f)
      // La regla de exposición sigue decidiendo igual para las 15 combinaciones (ejes independientes).
      assert.equal(ev.publicable ? 'RESPONDER' : ev.motivo, motivoExposicion(estado, visibilidad), `exposición ${estado} + ${visibilidad}`)
      if (visibilidad === 'PUBLICO_AUTORIZADO' && estado !== 'CONFIRMADO_APROBADO') {
        // Combinación incompatible con la política de publicación: ERROR del Brain (decisión del 29-09-2026).
        invalidas++
        assert.ok(tieneError(errores(f), 'PUBLICO_NO_APROBADO', 'visibilidad'), `${estado} + ${visibilidad} debe ser un ERROR`)
        assert.equal(obtenido, 'BRAIN_INVALIDO', `${estado} + ${visibilidad}`)
      } else {
        assert.deepEqual(validarVersionBrain(version(1, 'ACTIVA', [f])).errores, [], `${estado}/${visibilidad} debe ser una ficha válida`)
        assert.equal(obtenido, motivoExposicion(estado, visibilidad), `${estado} + ${visibilidad}`)
      }
    }
  }
  assert.equal(combinaciones, 15)
  assert.equal(invalidas, 4)
})

verificar('AC-12 una ficha INTERNO nunca responde, ni aprobada ni por intención', () => {
  const f = ficha({ visibilidad: 'INTERNO' })
  escala(consultarPublico(conActiva(f), { fichaId: f.id }), 'NO_AUTORIZADO')
  escala(consultarPublico(conActiva(f), { intencion: f.intencion }), 'SIN_CONOCIMIENTO')
})

verificar('AC-16 una ficha CONFIRMADO (sin aprobar) nunca responde: sin visibilidad pública escala NO_AUTORIZADO', () => {
  const f = fichaEnEstado('CONFIRMADO')
  assert.equal(f.visibilidad, 'NO_AUTORIZADO_PARA_CLIENTE')
  escala(consultarPublico(conActiva(f), { fichaId: f.id }), 'NO_AUTORIZADO')
  assert.deepEqual(separar(validarFicha(f)), { errores: [], advertencias: [] })
})

verificar('Pública sin aprobar (1-2): PUBLICO_AUTORIZADO sin CONFIRMADO_APROBADO es ERROR y la validación falla', () => {
  assert.equal(NIVEL_PUBLICO_NO_APROBADO, 'ERROR', 'decisión del Product Owner (29-09-2026): error bloqueante')
  for (const estado of ['CONFIRMADO', 'PENDIENTE_DE_DECISION', 'PENDIENTE_DE_VALIDACION', 'CONTRADICTORIO'] as const) {
    const f = fichaEnEstado(estado, { id: 'KB-9010', visibilidad: 'PUBLICO_AUTORIZADO' })
    const problema = separar(validarFicha(f)).errores.find((p) => p.regla === 'PUBLICO_NO_APROBADO')
    assert.ok(problema, `${estado}: se esperaba el ERROR PUBLICO_NO_APROBADO`)
    assert.equal(problema.nivel, 'ERROR')
    assert.equal(problema.fichaId, 'KB-9010')
    assert.equal(problema.campo, 'visibilidad')
    assert.ok(problema.motivo.includes('PUBLICO_AUTORIZADO') && problema.motivo.includes(estado), problema.motivo)
    assert.ok(validarVersionBrain(version(1, 'ACTIVA', [f])).errores.some((p) => p.regla === 'PUBLICO_NO_APROBADO'))
    assert.ok(validarConjunto([version(1, 'ACTIVA', [ficha(), f])]).errores.some((p) => p.regla === 'PUBLICO_NO_APROBADO'))
    // Fallo cerrado: el Brain completo deja de ser consultable, incluida la ficha que sí era publicable.
    escala(consultarPublico([version(1, 'ACTIVA', [ficha(), f])], { fichaId: 'KB-9001' }), 'BRAIN_INVALIDO')
  }
})

verificar('Pública sin aprobar (5): INTERNO y NO_AUTORIZADO_PARA_CLIENTE son válidos en cualquier estado de verdad', () => {
  for (const estado of ESTADOS_VERDAD) {
    for (const visibilidad of ['INTERNO', 'NO_AUTORIZADO_PARA_CLIENTE'] as const) {
      assert.deepEqual(separar(validarFicha(fichaEnEstado(estado, { visibilidad }))), { errores: [], advertencias: [] }, `${estado} + ${visibilidad}`)
    }
  }
  assert.deepEqual(separar(validarFicha(ficha())), { errores: [], advertencias: [] }, 'CONFIRMADO_APROBADO + PUBLICO_AUTORIZADO es válida')
})

verificar('Pública sin aprobar (6): la regla de exposición sigue decidiendo sola, sin depender de la validación', () => {
  const publicaSinAprobar = fichaEnEstado('CONFIRMADO', { visibilidad: 'PUBLICO_AUTORIZADO' })
  assert.deepEqual(evaluarExposicion(publicaSinAprobar), { publicable: false, motivo: 'NO_AUTORIZADO' })
  assert.deepEqual(evaluarExposicion(fichaEnEstado('PENDIENTE_DE_DECISION', { visibilidad: 'PUBLICO_AUTORIZADO' })), { publicable: false, motivo: 'PENDIENTE' })
  assert.deepEqual(evaluarExposicion(fichaEnEstado('CONTRADICTORIO', { visibilidad: 'PUBLICO_AUTORIZADO' })), { publicable: false, motivo: 'CONTRADICTORIO' })
  assert.deepEqual(evaluarExposicion(ficha()), { publicable: true })
})

verificar('AC-17 ficha publicable con requiereHumano → ESCALAR REQUIERE_HUMANO sin texto de la ficha (D4)', () => {
  const f = ficha({ requiereHumano: true, motivoEscalamiento: 'Motivo de prueba' })
  escala(consultarPublico(conActiva(f), { fichaId: f.id }), 'REQUIERE_HUMANO')
  escala(consultarPublico(conActiva(f), { intencion: f.intencion }), 'SIN_CONOCIMIENTO')
})

verificar('AC-18 ESCALAR no lleva texto de la ficha y RESPONDER no lleva fuentes, notas, contradicción, aprobación, estado ni visibilidad', () => {
  const bloqueadas = [
    fichaEnEstado('CONTRADICTORIO'),
    fichaEnEstado('PENDIENTE_DE_DECISION'),
    fichaEnEstado('PENDIENTE_DE_VALIDACION'),
    fichaEnEstado('CONFIRMADO'),
    ficha({ visibilidad: 'NO_AUTORIZADO_PARA_CLIENTE' }),
    ficha({ requiereHumano: true, motivoEscalamiento: 'Motivo de prueba' }),
  ]
  for (const f of bloqueadas) {
    const texto = JSON.stringify(consultarPublico(conActiva(f), { fichaId: f.id }))
    for (const secreto of [f.respuesta, f.pregunta, 'NOTA INTERNA', 'Fuente de prueba', 'Motivo de prueba', 'Contradicción de prueba']) {
      assert.ok(!texto.includes(secreto), `ESCALAR filtró "${secreto}" (${f.estadoVerdad}/${f.visibilidad})`)
    }
  }
  const texto = JSON.stringify(consultarPublico(conActiva(ficha()), { fichaId: 'KB-9001' }))
  for (const prohibido of ['NOTA INTERNA', 'Fuente de prueba', 'Aprobador de prueba', 'CONFIRMADO_APROBADO', 'PUBLICO_AUTORIZADO', 'Pregunta de prueba', 'Versión de negocio']) {
    assert.ok(!texto.includes(prohibido), `RESPONDER filtró "${prohibido}"`)
  }
})

verificar('AC-19 una propiedad inyectada (publicable: true) no cambia la decisión ni sale en la respuesta', () => {
  const interna = { ...ficha({ visibilidad: 'INTERNO' }), publicable: true, exponer: 'si' } as FichaConocimiento
  escala(consultarPublico(conActiva(interna), { fichaId: interna.id }), 'NO_AUTORIZADO')
  const r = separar(validarFicha(interna))
  assert.equal(r.errores.length, 0, 'una propiedad extra no invalida el Brain (la decisión debe ser la misma)')
  assert.ok(r.advertencias.some((p) => p.regla === 'PROPIEDAD_DESCONOCIDA' && p.campo === 'publicable'))
  const publica = { ...ficha(), secreto: 'SECRETO INYECTADO' } as FichaConocimiento
  const d = consultarPublico(conActiva(publica), { fichaId: publica.id })
  assert.equal(d.accion, 'RESPONDER')
  assert.ok(!JSON.stringify(d).includes('SECRETO INYECTADO'))
  assert.deepEqual(d, consultarPublico(conActiva(ficha()), { fichaId: 'KB-9001' }))
})

verificar('Precedencia del motivo: CONTRADICTORIO > PENDIENTE > NO_AUTORIZADO > REQUIERE_HUMANO', () => {
  const humano = { requiereHumano: true, motivoEscalamiento: 'Motivo de prueba' } as const
  assert.deepEqual(evaluarExposicion(fichaEnEstado('CONTRADICTORIO', { visibilidad: 'INTERNO', ...humano })), { publicable: false, motivo: 'CONTRADICTORIO' })
  assert.deepEqual(evaluarExposicion(fichaEnEstado('PENDIENTE_DE_VALIDACION', { visibilidad: 'INTERNO', ...humano })), { publicable: false, motivo: 'PENDIENTE' })
  assert.deepEqual(evaluarExposicion(ficha({ visibilidad: 'INTERNO', ...humano })), { publicable: false, motivo: 'NO_AUTORIZADO' })
  assert.deepEqual(evaluarExposicion(ficha({ ...humano })), { publicable: false, motivo: 'REQUIERE_HUMANO' })
  assert.deepEqual(evaluarExposicion(ficha()), { publicable: true })
})

verificar('El nivel de confianza es informativo: una ficha publicable con confianza BAJO responde igual', () => {
  const d = consultarPublico(conActiva(ficha({ nivelConfianza: 'BAJO' })), { fichaId: 'KB-9001' })
  assert.equal(d.accion, 'RESPONDER')
})

// ---------------------------------------------------------------- AC-20 y AC-21: audio

verificar('AC-20 audio válido se devuelve; sin audio es válido y devuelve null', () => {
  const con = consultarPublico(conActiva(ficha({ audioId: 'AUDIO-007' })), { fichaId: 'KB-9001' })
  assert.ok(con.accion === 'RESPONDER' && con.fichas[0].audioId === 'AUDIO-007')
  const sin = consultarPublico(conActiva(ficha({ audioId: null })), { fichaId: 'KB-9001' })
  assert.ok(sin.accion === 'RESPONDER' && sin.fichas[0].audioId === null)
})

verificar('AC-21 audio mal formado o fuera del catálogo invalida el Brain (fallo cerrado)', () => {
  for (const audioId of ['audio-001', 'AUDIO-1', 'AUDIO-0001', 'https://ejemplo/audio.mp3', '']) {
    assert.ok(tieneError(errores(ficha({ audioId })), 'AUDIO_FORMATO', 'audioId'), audioId)
    escala(consultarPublico(conActiva(ficha({ audioId })), { fichaId: 'KB-9001' }), 'BRAIN_INVALIDO')
  }
  const catalogo = new Set(['AUDIO-001'])
  assert.ok(separar(validarFicha(ficha({ audioId: 'AUDIO-002' }), { catalogoAudios: catalogo })).errores.some((p) => p.regla === 'AUDIO_DESCONOCIDO'))
  escala(consultarPublico(conActiva(ficha({ audioId: 'AUDIO-002' })), { fichaId: 'KB-9001' }, { catalogoAudios: catalogo }), 'BRAIN_INVALIDO')
  assert.equal(consultarPublico(conActiva(ficha({ audioId: 'AUDIO-001' })), { fichaId: 'KB-9001' }, { catalogoAudios: catalogo }).accion, 'RESPONDER')
})

// ---------------------------------------------------------------- AC-22 y AC-23: escalamiento

verificar('AC-22 sin conocimiento suficiente → SIN_CONOCIMIENTO (fichaId inexistente, intención sin publicables)', () => {
  escala(consultarPublico(conActiva(ficha()), { fichaId: 'KB-9999' }), 'SIN_CONOCIMIENTO')
  escala(consultarPublico(conActiva(ficha()), { intencion: 'OTRA_INTENCION' }), 'SIN_CONOCIMIENTO')
  escala(consultarPublico(conActiva(fichaEnEstado('PENDIENTE_DE_DECISION')), { intencion: 'PRUEBA_SINTETICA' }), 'SIN_CONOCIMIENTO')
  escala(consultarPublico(conActiva(ficha()), {} as never), 'SIN_CONOCIMIENTO')
})

verificar('AC-22 por intención responde con todas las publicables, ordenadas por id, sin las bloqueadas', () => {
  const d = consultarPublico(
    conActiva(ficha({ id: 'KB-9003' }), ficha({ id: 'KB-9001' }), fichaEnEstado('CONTRADICTORIO', { id: 'KB-9002' })),
    { intencion: 'PRUEBA_SINTETICA' },
  )
  assert.ok(d.accion === 'RESPONDER')
  if (d.accion === 'RESPONDER') assert.deepEqual(d.fichas.map((f) => f.fichaId), ['KB-9001', 'KB-9003'])
})

verificar('AC-23 un Brain inválido hace que toda consulta escale BRAIN_INVALIDO', () => {
  const rota = ficha() as unknown as Record<string, unknown>
  delete rota.fuentes
  const conjunto = [version(1, 'ACTIVA', [ficha({ id: 'KB-9002' }), rota as unknown as FichaConocimiento])]
  escala(consultarPublico(conjunto, { fichaId: 'KB-9002' }), 'BRAIN_INVALIDO')
  escala(consultarPublico(conjunto, { intencion: 'PRUEBA_SINTETICA' }), 'BRAIN_INVALIDO')
  escala(consultarPublico('no es una lista' as never, { fichaId: 'KB-9001' }), 'BRAIN_INVALIDO')
  escala(consultarPublico([null], { fichaId: 'KB-9001' }), 'BRAIN_INVALIDO')
})

// ---------------------------------------------------------------- AC-24 a AC-28: versionado

verificar('AC-24 solo una versión puede estar ACTIVA', () => {
  const r = validarConjunto([version(1, 'ACTIVA', [ficha()]), version(2, 'ACTIVA', [ficha()])])
  assert.ok(r.errores.some((p) => p.regla === 'VERSIONES_ACTIVAS'))
  escala(consultarPublico([version(1, 'ACTIVA', [ficha()]), version(2, 'ACTIVA', [ficha()])], { fichaId: 'KB-9001' }), 'BRAIN_INVALIDO')
})

verificar('AC-25 solo se consulta la versión ACTIVA; versión inexistente o distinta → VERSION_DESCONOCIDA', () => {
  const soloHistorica = [version(1, 'HISTORICA', [ficha({ id: 'KB-9005' })]), version(2, 'ACTIVA', [ficha()])]
  escala(consultarPublico(soloHistorica, { fichaId: 'KB-9005' }), 'SIN_CONOCIMIENTO')
  const soloBorrador = [version(1, 'ACTIVA', [ficha()]), version(2, 'BORRADOR', [ficha(), ficha({ id: 'KB-9006' })])]
  escala(consultarPublico(soloBorrador, { fichaId: 'KB-9006' }), 'SIN_CONOCIMIENTO')
  escala(consultarPublico([version(1, 'BORRADOR', [ficha()])], { fichaId: 'KB-9001' }), 'VERSION_DESCONOCIDA')
  escala(consultarPublico([], { fichaId: 'KB-9001' }), 'VERSION_DESCONOCIDA')
  escala(consultarPublico(soloHistorica, { fichaId: 'KB-9001' }, { version: 1 }), 'VERSION_DESCONOCIDA')
  escala(consultarPublico(soloHistorica, { fichaId: 'KB-9001' }, { version: 9 }), 'VERSION_DESCONOCIDA')
  const d = consultarPublico(soloHistorica, { fichaId: 'KB-9001' }, { version: 2 })
  assert.ok(d.accion === 'RESPONDER' && d.brainVersion === 2)
})

verificar('AC-26 la comparación reporta fichas nuevas, modificadas, retiradas y sin cambio', () => {
  const v1 = version(1, 'HISTORICA', [ficha({ id: 'KB-9001' }), ficha({ id: 'KB-9002' }), ficha({ id: 'KB-9003' })])
  const v2 = version(2, 'ACTIVA', [
    ficha({ id: 'KB-9001' }),
    ficha({ id: 'KB-9002', version: 2, respuesta: 'Respuesta de prueba modificada' }),
    ficha({ id: 'KB-9004' }),
  ])
  const c = compararVersiones(v1, v2)
  assert.deepEqual(c, { nuevas: ['KB-9004'], modificadas: [{ id: 'KB-9002', desde: 1, hasta: 2 }], retiradas: ['KB-9003'], sinCambio: ['KB-9001'], errores: [] })
  assert.deepEqual(validarConjunto([v1, v2]).errores, [])
})

verificar('AC-27 contenido cambiado sin subir versión, o versión que baja, son errores de integridad', () => {
  const v1 = version(1, 'HISTORICA', [ficha({ version: 2 })])
  const mismoNumero = version(2, 'ACTIVA', [ficha({ version: 2, respuesta: 'Respuesta de prueba cambiada en silencio' })])
  assert.ok(compararVersiones(v1, mismoNumero).errores.some((p) => p.regla === 'INMUTABILIDAD' && p.fichaId === 'KB-9001'))
  assert.ok(validarConjunto([v1, mismoNumero]).errores.some((p) => p.regla === 'INMUTABILIDAD'))
  const baja = version(2, 'ACTIVA', [ficha({ version: 1 })])
  assert.ok(compararVersiones(v1, baja).errores.some((p) => p.regla === 'VERSION_REGRESIVA'))
  // Una propiedad desconocida no cuenta como cambio de contenido.
  const conExtra = version(2, 'ACTIVA', [{ ...ficha({ version: 2 }), extra: 1 } as FichaConocimiento])
  assert.deepEqual(compararVersiones(v1, conExtra).errores, [])
})

verificar('AC-27 integridad contra la última aparición: una ficha retirada que reaparece cambiada o con versión menor', () => {
  const v1 = version(1, 'HISTORICA', [ficha({ version: 3 })])
  const v2 = version(2, 'HISTORICA', [])
  const v3 = version(3, 'ACTIVA', [ficha({ version: 2, respuesta: 'Respuesta de prueba reaparecida' })])
  assert.ok(validarConjunto([v1, v2, v3]).errores.some((p) => p.regla === 'VERSION_REGRESIVA' && p.brainVersion === 3))
  const v3b = version(3, 'ACTIVA', [ficha({ version: 3, respuesta: 'Respuesta de prueba reaparecida' })])
  assert.ok(validarConjunto([v1, v2, v3b]).errores.some((p) => p.regla === 'INMUTABILIDAD'))
  const v3c = version(3, 'ACTIVA', [ficha({ version: 4, respuesta: 'Respuesta de prueba reaparecida' })])
  assert.deepEqual(validarConjunto([v1, v2, v3c]).errores, [])
})

verificar('Conjunto: versiones repetidas e histórica posterior a la activa son errores', () => {
  assert.ok(validarConjunto([version(1, 'BORRADOR', []), version(1, 'BORRADOR', [])]).errores.some((p) => p.regla === 'VERSION_BRAIN'))
  assert.ok(validarConjunto([version(1, 'ACTIVA', []), version(2, 'HISTORICA', [])]).errores.some((p) => p.regla === 'ESTADO_BRAIN' && p.brainVersion === 2))
})

verificar('AC-28 ninguna función modifica sus entradas; la ficha retirada sigue intacta en la versión anterior', () => {
  const v1 = version(1, 'HISTORICA', [ficha({ id: 'KB-9001' }), ficha({ id: 'KB-9002' })])
  const v2 = version(2, 'ACTIVA', [ficha({ id: 'KB-9001' })])
  const antes = clonar([v1, v2])
  compararVersiones(v1, v2)
  validarConjunto([v1, v2])
  consultarPublico([v1, v2], { fichaId: 'KB-9001' })
  consultarPublico([v1, v2], { intencion: 'PRUEBA_SINTETICA' })
  assert.deepEqual([v1, v2], antes)
  assert.ok(v1.fichas.some((f) => f.id === 'KB-9002'), 'la ficha retirada sigue en la versión histórica')
})

// ---------------------------------------------------------------- AC-29 a AC-31: repositorio y validador

const raizWeb = process.cwd()
const carpetaBrain = path.join(raizWeb, 'src', 'lib', 'domain', 'brain')

function conCarpetaTemporal(fn: (carpeta: string) => void) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'humania-brain-'))
  try {
    fn(carpeta)
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true })
  }
}
const escribirJson = (archivo: string, datos: unknown) => fs.writeFileSync(archivo, JSON.stringify(datos, null, 2))

verificar('AC-29 y AC-30 guardia sobre el repositorio real: sin contenido del Brain y núcleo sin imports prohibidos', () => {
  assert.ok(fs.existsSync(carpetaBrain), `se esperaba ejecutar desde web/ (no existe ${carpetaBrain})`)
  assert.deepEqual(revisarRepositorio(raizWeb, carpetaBrain), [])
})

verificar('AC-29 y AC-30 la guardia detecta contenido del Brain y imports prohibidos (caso negativo)', () => {
  conCarpetaTemporal((raiz) => {
    const brain = path.join(raiz, 'src', 'lib', 'domain', 'brain')
    fs.mkdirSync(brain, { recursive: true })
    fs.writeFileSync(
      path.join(brain, 'malo.ts'),
      [
        "import fs from 'node:fs'",
        "import { createClient } from '@supabase/supabase-js'",
        "import os from 'os'",
        "import { redirect } from 'next/navigation'",
        "const r = await fetch('https://ejemplo.invalid')",
        "import dns from 'node:dns'",
      ].join('\n'),
    )
    fs.writeFileSync(path.join(brain, 'bueno.ts'), "import { ficha } from './fixtures'\n")
    // Un archivo exento (el CLI) sí puede usar fs.
    fs.writeFileSync(path.join(brain, 'validarContenido.ts'), "import fs from 'node:fs'\n")
    escribirJson(path.join(raiz, 'brain-v0001.json'), version(1, 'BORRADOR', []))
    escribirJson(path.join(raiz, 'datos.json'), { id: 'KB-0001' })
    fs.mkdirSync(path.join(raiz, 'node_modules'))
    escribirJson(path.join(raiz, 'node_modules', 'ignorado.json'), { id: 'KB-0002' })
    const hallazgos = revisarRepositorio(raiz, brain)
    assert.deepEqual(
      hallazgos.map((h) => `${h.regla} ${h.archivo}`).sort(),
      [
        'CONTENIDO_BRAIN_EN_REPOSITORIO brain-v0001.json',
        'CONTENIDO_BRAIN_EN_REPOSITORIO datos.json',
        ...[1, 2, 3, 4, 5, 6].map((n) => `IMPORT_PROHIBIDO malo.ts:${n}`),
      ].sort(),
    )
  })
})

verificar('AC-29 la excepción de imports (T-23) se limita al CLI y a las suites; ningún archivo del núcleo está exento', () => {
  assert.deepEqual([...EXENTOS_IMPORTS].sort(), ['validarContenido.ts', 'verificacionBrain.ts', 'verificacionRepositorio.ts'])
  for (const archivo of NUCLEO_BRAIN) {
    assert.ok(!EXENTOS_IMPORTS.has(archivo), `${archivo} es núcleo y no puede estar exento`)
    assert.ok(fs.existsSync(path.join(carpetaBrain, archivo)), `${archivo} debe existir`)
  }
  // Todo .ts de la carpeta es núcleo o exento: no puede aparecer un archivo nuevo sin clasificar.
  const clasificados = new Set<string>([...NUCLEO_BRAIN, ...EXENTOS_IMPORTS])
  for (const nombre of fs.readdirSync(carpetaBrain).filter((n) => n.endsWith('.ts'))) {
    assert.ok(clasificados.has(nombre), `${nombre} no está clasificado como núcleo ni como exento`)
  }
})

verificar('AC-31 el validador acepta una carpeta válida (función y línea de comandos, código 0)', () => {
  conCarpetaTemporal((carpeta) => {
    escribirJson(path.join(carpeta, 'brain-v0001.json'), version(1, 'HISTORICA', [ficha()]))
    escribirJson(path.join(carpeta, 'brain-v0002.json'), version(2, 'ACTIVA', [ficha({ version: 2, respuesta: 'Respuesta de prueba v2' })]))
    const r = validarRutaContenido(carpeta)
    assert.deepEqual([r.archivos, r.errores], [['brain-v0001.json', 'brain-v0002.json'], []])
    const cli = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js'), carpeta], { encoding: 'utf8' })
    assert.equal(cli.status, 0, cli.stderr)
    assert.ok(cli.stdout.includes('RESULTADO: contenido válido.'))
  })
})

verificar('AC-31 el validador rechaza contenido inválido (código ≠ 0) e identifica archivo, ficha, campo, regla y motivo', () => {
  conCarpetaTemporal((carpeta) => {
    escribirJson(path.join(carpeta, 'brain-v0001.json'), version(1, 'ACTIVA', [ficha({ respuesta: '' })]))
    escribirJson(path.join(carpeta, 'brain-v0002.json'), version(3, 'BORRADOR', []))
    fs.writeFileSync(path.join(carpeta, 'brain-v0004.json'), '{ esto no es JSON')
    fs.writeFileSync(path.join(carpeta, 'notas.json'), '{}')
    const r = validarRutaContenido(carpeta)
    assert.ok(r.errores.some((p) => p.archivo === 'brain-v0001.json' && p.fichaId === 'KB-9001' && p.campo === 'respuesta' && p.regla === 'RESPUESTA_VACIA' && p.motivo.length > 0))
    assert.ok(r.errores.some((p) => p.archivo === 'brain-v0002.json' && p.regla === 'NOMBRE_ARCHIVO'))
    assert.ok(r.errores.some((p) => p.archivo === 'brain-v0004.json' && p.regla === 'JSON_INVALIDO'))
    assert.ok(r.advertencias.some((p) => p.archivo === 'notas.json' && p.regla === 'NOMBRE_ARCHIVO'))
    const cli = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js'), carpeta], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    const linea = cli.stderr.split(/\r?\n/).find((l) => l.includes('RESPUESTA_VACIA')) ?? ''
    for (const parte of ['ERROR', 'archivo: brain-v0001.json', 'Brain: v1', 'ficha: KB-9001', 'campo: respuesta', 'regla: RESPUESTA_VACIA', 'motivo: ']) {
      assert.ok(linea.includes(parte), `la línea del error debe incluir "${parte}": ${linea}`)
    }
    assert.ok(cli.stderr.includes('RESULTADO: contenido INVÁLIDO'))
  })
})

verificar('Pública sin aprobar (3-4): brain:validar termina con código ≠ 0 e identifica ficha, campo, regla y motivo', () => {
  conCarpetaTemporal((carpeta) => {
    escribirJson(path.join(carpeta, 'brain-v0001.json'), version(1, 'BORRADOR', [ficha(), fichaEnEstado('CONFIRMADO', { id: 'KB-9011', visibilidad: 'PUBLICO_AUTORIZADO' })]))
    const r = validarRutaContenido(carpeta)
    assert.equal(r.errores.length, 1, 'el único problema del archivo es la ficha pública sin aprobar')
    const cli = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js'), carpeta], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    const linea = cli.stderr.split(/\r?\n/).find((l) => l.includes('PUBLICO_NO_APROBADO')) ?? ''
    for (const parte of ['ERROR', 'archivo: brain-v0001.json', 'ficha: KB-9011', 'campo: visibilidad', 'regla: PUBLICO_NO_APROBADO', 'motivo: una ficha PUBLICO_AUTORIZADO debe estar CONFIRMADO_APROBADO']) {
      assert.ok(linea.includes(parte), `la línea del error debe incluir "${parte}": ${linea}`)
    }
    assert.ok(cli.stderr.includes('RESULTADO: contenido INVÁLIDO'))
  })
})

verificar('AC-31 carpeta vacía es válida (estado de KAI-44) y una ruta inexistente es un error', () => {
  conCarpetaTemporal((carpeta) => {
    const vacia = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js'), carpeta], { encoding: 'utf8' })
    assert.equal(vacia.status, 0)
    const inexistente = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js'), path.join(carpeta, 'no-existe')], { encoding: 'utf8' })
    assert.equal(inexistente.status, 1)
    const sinArgumento = spawnSync(process.execPath, [path.join(__dirname, 'validarContenido.js')], { encoding: 'utf8' })
    assert.equal(sinArgumento.status, 1)
  })
})

console.log(`\n${casos} casos verificados, todos OK.`)
