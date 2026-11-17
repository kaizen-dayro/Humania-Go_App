'use client'

// Formularios de la analítica vehicular, Fase 1. Los textos que se muestran
// con números o fechas llegan ya formateados desde el servidor (evita el
// desajuste de hidratación #418 documentado en CLAUDE.md, regla 10).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { NUMBERS_ONLY, DESCRIPTIVE_TEXT, LETTERS_ONLY } from '@/lib/validation'
import {
  anularLectura, anularMantenimiento, anularViajeTranscrito, guardarParametro, guardarPlan, registrarFotoTablero,
  registrarLectura, registrarMantenimiento, registrarViajeTranscrito, retirarPlan,
} from './actions'

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO = 5 * 1024 * 1024

const CLASE_CAMPO = 'rounded-none border-neutral-300 h-11'
const CLASE_SELECT = 'flex h-11 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand'

function ErrorCaja({ mensaje }: { mensaje: string }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm flex gap-2 rounded-md">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{mensaje}</span>
    </div>
  )
}

/** Fecha y hora actuales de Bogotá en formato de input datetime-local. */
function ahoraBogotaLocal(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map(x => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** Colombia no tiene horario de verano: la hora local siempre es UTC-5. */
function localBogotaAIso(valor: string): string {
  return `${valor}:00-05:00`
}

function filtrarTexto(valor: string, anterior: string): string {
  return DESCRIPTIVE_TEXT.test(valor) ? valor : anterior
}

// ================= REGISTRAR LECTURA =================

export function RegistrarLecturaBoton({
  activoId, contratoVigenteId, tieneInicial,
}: { activoId: string; contratoVigenteId: string | null; tieneInicial: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'INICIAL' | 'PERIODICA' | 'MANTENIMIENTO' | 'DEVOLUCION'>(contratoVigenteId && !tieneInicial ? 'INICIAL' : 'PERIODICA')
  const [fecha, setFecha] = useState('')
  const [km, setKm] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [fotoId, setFotoId] = useState<string | null>(null)
  const [observacion, setObservacion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pideMotivo, setPideMotivo] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  function abrir() {
    setFecha(ahoraBogotaLocal())
    setKm(''); setArchivo(null); setVistaPrevia(null); setFotoId(null)
    setObservacion(''); setMotivo(''); setPideMotivo(false); setError('')
    setTipo(contratoVigenteId && !tieneInicial ? 'INICIAL' : 'PERIODICA')
    setAbierto(true)
  }

  function elegirArchivo(f: File | null) {
    setError('')
    if (!f) { setArchivo(null); setVistaPrevia(null); return }
    if (!TIPOS_PERMITIDOS.includes(f.type)) { setError('Solo se permiten imágenes JPG, PNG o WEBP.'); return }
    if (f.size > TAMANO_MAXIMO) { setError('La imagen no puede superar los 5MB.'); return }
    setArchivo(f)
    setVistaPrevia(URL.createObjectURL(f))
    setFotoId(null) // una foto nueva reemplaza la ya subida en un intento anterior
  }

  async function guardar() {
    setError('')
    if (!fecha) { setError('Indica la fecha y hora en que se tomó la fotografía.'); return }
    if (km === '') { setError('Escribe el kilometraje que marca el odómetro.'); return }
    if (!archivo && !fotoId && observacion.trim() === '') {
      setError('Sin fotografía, explica en la observación de dónde sale el valor (por ejemplo, el Anexo 1 del contrato).')
      return
    }
    if (pideMotivo && motivo.trim() === '') { setError('Escribe el motivo para confirmar esta lectura.'); return }

    setGuardando(true)
    let idFoto = fotoId
    if (archivo && !idFoto) {
      const supabase = createClient()
      const ext = archivo.name.split('.').pop() || 'jpg'
      const ruta = `${activoId}/tablero/${crypto.randomUUID()}.${ext}`
      const { error: errSubida } = await supabase.storage.from('activo-fotos-evidencia').upload(ruta, archivo, { contentType: archivo.type, upsert: false })
      if (errSubida) {
        setError(`No se pudo subir la fotografía: ${errSubida.message}`)
        setGuardando(false)
        return
      }
      const r = await registrarFotoTablero(activoId, ruta)
      if (!r.ok) { setError(r.error); setGuardando(false); return }
      idFoto = r.data!.fotoId
      setFotoId(idFoto) // si la lectura falla, el reintento usa la misma foto
    }

    const r = await registrarLectura({
      activoId,
      tipo,
      fechaCaptura: localBogotaAIso(fecha),
      valorKm: Number(km),
      fotoId: idFoto,
      contratoId: contratoVigenteId,
      motivoExcepcion: pideMotivo ? motivo : null,
      observacion,
    })
    setGuardando(false)
    if (!r.ok) {
      if (r.motivoRequerido) setPideMotivo(true)
      setError(r.error)
      return
    }
    setAbierto(false)
    router.refresh()
  }

  const tiposDisponibles: { valor: typeof tipo; etiqueta: string }[] = [
    ...(contratoVigenteId && !tieneInicial ? [{ valor: 'INICIAL' as const, etiqueta: 'Inicial (kilometraje de entrega)' }] : []),
    { valor: 'PERIODICA', etiqueta: 'Periódica' },
    { valor: 'MANTENIMIENTO', etiqueta: 'En un mantenimiento' },
    ...(contratoVigenteId ? [{ valor: 'DEVOLUCION' as const, etiqueta: 'Devolución del vehículo' }] : []),
  ]

  return (
    <>
      <Button onClick={abrir} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none">
        <Camera className="w-4 h-4 mr-2" />
        Registrar lectura del odómetro
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar lectura del odómetro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">
              Escribe el número que se ve en el tablero. La lectura queda confirmada a tu nombre y no se puede editar: si te equivocas, se anula con motivo y se registra otra.
            </p>
            {error && <ErrorCaja mensaje={error} />}
            <div className="space-y-2">
              <Label>Tipo de lectura</Label>
              <select className={CLASE_SELECT} value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
                {tiposDisponibles.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Fotografía del tablero</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp" className="rounded-none" onChange={e => elegirArchivo(e.target.files?.[0] ?? null)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {vistaPrevia && <img src={vistaPrevia} alt="Vista previa del tablero" className="max-h-56 w-full object-contain border border-neutral-200 bg-neutral-50" />}
              {fotoId && <p className="text-xs text-humania-gray">La fotografía ya quedó guardada; al reintentar se usa la misma.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha y hora de la foto</Label>
                <Input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} className={CLASE_CAMPO} />
              </div>
              <div className="space-y-2">
                <Label>Kilometraje (km)</Label>
                <Input inputMode="numeric" value={km} maxLength={7} placeholder="Ej. 31250"
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setKm(e.target.value) }} className={CLASE_CAMPO} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observación {archivo || fotoId ? '(opcional)' : '(obligatoria sin fotografía)'}</Label>
              <Textarea rows={2} maxLength={300} value={observacion} onChange={e => setObservacion(filtrarTexto(e.target.value, observacion))}
                placeholder="Ej. Valor tomado del Anexo 1 del contrato" className="rounded-none" />
            </div>
            {pideMotivo && (
              <div className="space-y-2">
                <Label>Motivo para confirmar esta lectura</Label>
                <Textarea rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(filtrarTexto(e.target.value, motivo))}
                  placeholder="Ej. Se cambió el tablero en el taller" className="rounded-none" />
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Confirmar lectura'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= ANULAR / RETIRAR CON MOTIVO =================

const ACCIONES = {
  lectura: { titulo: 'Anular lectura', boton: 'Anular', fn: anularLectura },
  mantenimiento: { titulo: 'Anular mantenimiento', boton: 'Anular', fn: anularMantenimiento },
  plan: { titulo: 'Retirar intervalo del plan', boton: 'Retirar', fn: retirarPlan },
  viaje: { titulo: 'Anular viaje transcrito', boton: 'Anular', fn: anularViajeTranscrito },
} as const

export function AccionConMotivo({ tipo, id, descripcion }: { tipo: keyof typeof ACCIONES; id: string; descripcion: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const accion = ACCIONES[tipo]

  async function confirmar() {
    if (motivo.trim() === '') { setError('El motivo es obligatorio.'); return }
    setGuardando(true)
    const r = await accion.fn(id, motivo)
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => { setMotivo(''); setError(''); setAbierto(true) }} className="text-xs text-red-700 hover:underline">
        {accion.boton}
      </button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{accion.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">{descripcion}. El registro no se borra: queda en el historial con tu nombre, la fecha y el motivo.</p>
            {error && <ErrorCaja mensaje={error} />}
            <Textarea rows={3} maxLength={300} value={motivo} onChange={e => setMotivo(filtrarTexto(e.target.value, motivo))} placeholder="Motivo (obligatorio)" className="rounded-none" />
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button className="bg-red-700 hover:bg-red-800 text-white rounded-none" disabled={guardando} onClick={confirmar}>
                {guardando ? 'Guardando...' : accion.boton}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= PLAN DE MANTENIMIENTO =================

export function PlanMantenimientoBoton({ activoId }: { activoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState({ concepto: '', intervaloKm: '', intervaloMeses: '', fuente: '', motivo: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (v.concepto.trim() === '') { setError('Escribe el concepto (por ejemplo, Cambio de aceite).'); return }
    if (v.intervaloKm === '' && v.intervaloMeses === '') { setError('Indica un intervalo en kilómetros, en meses o ambos.'); return }
    if (v.fuente.trim() === '') { setError('Indica la fuente del intervalo (por ejemplo, el manual del fabricante).'); return }
    setGuardando(true)
    const r = await guardarPlan({ activoId, ...v })
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" className="rounded-none" onClick={() => { setV({ concepto: '', intervaloKm: '', intervaloMeses: '', fuente: '', motivo: '' }); setError(''); setAbierto(true) }}>
        Agregar o cambiar intervalo
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Intervalo de mantenimiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">El sistema no trae intervalos por defecto. Usa los del manual del fabricante o los del taller, y deja escrita la fuente.</p>
            {error && <ErrorCaja mensaje={error} />}
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input value={v.concepto} maxLength={80} placeholder="Ej. Cambio de aceite" className={CLASE_CAMPO}
                onChange={e => setV({ ...v, concepto: filtrarTexto(e.target.value, v.concepto) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cada cuántos km</Label>
                <Input inputMode="numeric" value={v.intervaloKm} maxLength={6} placeholder="Ej. 5000" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, intervaloKm: e.target.value }) }} />
              </div>
              <div className="space-y-2">
                <Label>Cada cuántos meses</Label>
                <Input inputMode="numeric" value={v.intervaloMeses} maxLength={3} placeholder="Ej. 6" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, intervaloMeses: e.target.value }) }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fuente</Label>
              <Input value={v.fuente} maxLength={150} placeholder="Ej. Manual del propietario Chevrolet Spark" className={CLASE_CAMPO}
                onChange={e => setV({ ...v, fuente: filtrarTexto(e.target.value, v.fuente) })} />
            </div>
            <div className="space-y-2">
              <Label>Motivo del cambio (solo si el concepto ya tenía un intervalo)</Label>
              <Textarea rows={2} maxLength={300} value={v.motivo} className="rounded-none"
                onChange={e => setV({ ...v, motivo: filtrarTexto(e.target.value, v.motivo) })} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar intervalo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= MANTENIMIENTO REALIZADO =================

export type OpcionLectura = { id: string; etiqueta: string }

export function RegistrarMantenimientoBoton({
  activoId, conceptos, lecturas, hoy,
}: { activoId: string; conceptos: string[]; lecturas: OpcionLectura[]; hoy: string }) {
  const router = useRouter()
  const vacio = { fecha: hoy, concepto: '', descripcion: '', lecturaId: '', costo: '', responsablePago: '' }
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState(vacio)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (!v.fecha) { setError('Indica la fecha del mantenimiento.'); return }
    if (v.concepto.trim() === '') { setError('Escribe el concepto atendido.'); return }
    setGuardando(true)
    const r = await registrarMantenimiento({ activoId, ...v, lecturaId: v.lecturaId || null })
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" className="rounded-none" onClick={() => { setV(vacio); setError(''); setAbierto(true) }}>
        Registrar mantenimiento realizado
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mantenimiento realizado</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">Registra un concepto por vez. Para que cuente el kilometraje, primero registra la lectura del odómetro de tipo &quot;En un mantenimiento&quot; y elígela aquí.</p>
            {error && <ErrorCaja mensaje={error} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" max={hoy} value={v.fecha} onChange={e => setV({ ...v, fecha: e.target.value })} className={CLASE_CAMPO} />
              </div>
              <div className="space-y-2">
                <Label>Concepto</Label>
                <Input list="conceptos-plan" value={v.concepto} maxLength={80} placeholder="Ej. Cambio de aceite" className={CLASE_CAMPO}
                  onChange={e => setV({ ...v, concepto: filtrarTexto(e.target.value, v.concepto) })} />
                <datalist id="conceptos-plan">{conceptos.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Lectura del odómetro en el mantenimiento (opcional)</Label>
              <select className={CLASE_SELECT} value={v.lecturaId} onChange={e => setV({ ...v, lecturaId: e.target.value })}>
                <option value="">Sin lectura</option>
                {lecturas.map(l => <option key={l.id} value={l.id}>{l.etiqueta}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea rows={2} maxLength={300} value={v.descripcion} className="rounded-none"
                onChange={e => setV({ ...v, descripcion: filtrarTexto(e.target.value, v.descripcion) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Costo en pesos (opcional)</Label>
                <Input inputMode="numeric" value={v.costo} maxLength={9} className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, costo: e.target.value }) }} />
              </div>
              <div className="space-y-2">
                <Label>Quién lo pagó (opcional)</Label>
                <select className={CLASE_SELECT} value={v.responsablePago} onChange={e => setV({ ...v, responsablePago: e.target.value })}>
                  <option value="">Sin indicar</option>
                  <option value="ARRENDATARIO">Arrendatario</option>
                  <option value="ARRENDADOR">Arrendador</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Registrar mantenimiento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= VIAJE TRANSCRITO DE LA APP (adenda 1) =================

export function TranscribirViajeBoton({ activoId, hoy }: { activoId: string; hoy: string }) {
  const router = useRouter()
  const vacio = {
    capturaReferencia: '', fechaGrupo: hoy, horaInicio: '', horaFin: '', horas: '', minutos: '',
    velocidad: '', distancia: '', municipio: '', interpretacion: 'UTC' as 'UTC' | 'HORA_COLOMBIA',
  }
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState(vacio)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(seguir: boolean) {
    setError(''); setAviso('')
    if (v.capturaReferencia.trim() === '') { setError('Indica de qué captura sale el viaje (por ejemplo, Captura 16-11-2026 12:51).'); return }
    if (!v.fechaGrupo || !v.horaInicio || !v.horaFin) { setError('Completa la fecha del grupo y las horas de inicio y fin tal como las muestra la app.'); return }
    if (v.horas === '' && v.minutos === '') { setError('Escribe la duración que muestra la app.'); return }
    if (v.velocidad === '') { setError('Escribe la velocidad que muestra la app (0 si dice 0 km/h).'); return }
    if (v.municipio.trim() === '') { setError('Escribe el municipio (solo el municipio, sin la dirección).'); return }
    setGuardando(true)
    const r = await registrarViajeTranscrito({
      activoId,
      capturaReferencia: v.capturaReferencia,
      fechaGrupo: v.fechaGrupo,
      horaInicio: v.horaInicio,
      horaFin: v.horaFin,
      duracionMin: Number(v.horas || 0) * 60 + Number(v.minutos || 0),
      velocidadKmh: Number(v.velocidad),
      distanciaKm: v.distancia,
      municipio: v.municipio,
      interpretacion: v.interpretacion,
    })
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    router.refresh()
    if (seguir) {
      // Misma captura y misma fecha: lo normal es transcribir el siguiente viaje del grupo.
      setV({ ...vacio, capturaReferencia: v.capturaReferencia, fechaGrupo: v.fechaGrupo, interpretacion: v.interpretacion })
      setAviso('Viaje registrado. Puedes transcribir el siguiente.')
    } else {
      setAbierto(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="rounded-none" onClick={() => { setV(vacio); setError(''); setAviso(''); setAbierto(true) }}>
        Transcribir viaje de la app
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Transcribir viaje de la app del GPS</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">
              Copia los datos tal como los muestra la app; la hora real la calcula el sistema. No escribas la dirección: solo el municipio.
              Si la duración no cuadra con las horas, el registro se rechaza para que revises la transcripción.
            </p>
            {error && <ErrorCaja mensaje={error} />}
            {aviso && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-3">{aviso}</p>}
            <div className="space-y-2">
              <Label>Captura de la que sale</Label>
              <Input value={v.capturaReferencia} maxLength={200} placeholder="Ej. Captura 16-11-2026 12:51" className={CLASE_CAMPO}
                onChange={e => setV({ ...v, capturaReferencia: filtrarTexto(e.target.value, v.capturaReferencia) })} />
            </div>
            <div className="space-y-2">
              <Label>Fecha del grupo en la app (Hoy, Ayer o la fecha que muestre)</Label>
              <Input type="date" max={hoy} value={v.fechaGrupo} onChange={e => setV({ ...v, fechaGrupo: e.target.value })} className={CLASE_CAMPO} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hora de inicio mostrada</Label>
                <Input type="time" value={v.horaInicio} onChange={e => setV({ ...v, horaInicio: e.target.value })} className={CLASE_CAMPO} />
              </div>
              <div className="space-y-2">
                <Label>Hora de fin mostrada</Label>
                <Input type="time" value={v.horaFin} onChange={e => setV({ ...v, horaFin: e.target.value })} className={CLASE_CAMPO} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Duración: horas</Label>
                <Input inputMode="numeric" value={v.horas} maxLength={2} placeholder="Ej. 1" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, horas: e.target.value }) }} />
              </div>
              <div className="space-y-2">
                <Label>Minutos</Label>
                <Input inputMode="numeric" value={v.minutos} maxLength={2} placeholder="Ej. 53" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, minutos: e.target.value }) }} />
              </div>
              <div className="space-y-2">
                <Label>Velocidad (km/h)</Label>
                <Input inputMode="numeric" value={v.velocidad} maxLength={3} placeholder="Ej. 44" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, velocidad: e.target.value }) }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Municipio</Label>
                <Input value={v.municipio} maxLength={80} placeholder="Ej. La Estrella" className={CLASE_CAMPO}
                  onChange={e => { if (LETTERS_ONLY.test(e.target.value)) setV({ ...v, municipio: e.target.value }) }} />
              </div>
              <div className="space-y-2">
                <Label>Distancia en km (si la muestra)</Label>
                <Input inputMode="numeric" value={v.distancia} maxLength={4} className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setV({ ...v, distancia: e.target.value }) }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cómo leer la hora de la app</Label>
              <select className={CLASE_SELECT} value={v.interpretacion} onChange={e => setV({ ...v, interpretacion: e.target.value as 'UTC' | 'HORA_COLOMBIA' })}>
                <option value="UTC">Hora UTC (lectura confirmada para Ituran GO+)</option>
                <option value="HORA_COLOMBIA">Hora de Colombia</option>
              </select>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cerrar</Button>
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => guardar(true)}>
                {guardando ? 'Guardando...' : 'Registrar y transcribir otro'}
              </Button>
              <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none" disabled={guardando} onClick={() => guardar(false)}>
                {guardando ? 'Guardando...' : 'Registrar viaje'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= UMBRALES DE ALERTAS =================

export type FilaParametro = { clave: string; etiqueta: string; unidad: string; valorActual: string | null }

export function UmbralesBoton({ filas }: { filas: FilaParametro[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState(filas[0]?.clave ?? '')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (motivo.trim() === '') { setError('El motivo es obligatorio.'); return }
    setGuardando(true)
    const r = await guardarParametro(clave, valor, motivo)
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setValor(''); setMotivo('')
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" className="rounded-none" onClick={() => { setError(''); setAbierto(true) }}>Configurar umbrales</Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Umbrales de alertas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-humania-gray">Una alerta sin umbral no se calcula. Deja el valor vacío para desactivarla. Cada cambio queda registrado con su motivo.</p>
            <ul className="text-sm divide-y divide-neutral-100 border border-neutral-200">
              {filas.map(f => (
                <li key={f.clave} className="flex justify-between gap-3 px-3 py-2">
                  <span>{f.etiqueta}</span>
                  <span className="font-medium text-humania-blue whitespace-nowrap">{f.valorActual ? `${f.valorActual} ${f.unidad}` : 'Sin configurar'}</span>
                </li>
              ))}
            </ul>
            {error && <ErrorCaja mensaje={error} />}
            <div className="space-y-2">
              <Label>Umbral a cambiar</Label>
              <select className={CLASE_SELECT} value={clave} onChange={e => setClave(e.target.value)}>
                {filas.map(f => <option key={f.clave} value={f.clave}>{f.etiqueta}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nuevo valor ({filas.find(f => f.clave === clave)?.unidad})</Label>
                <Input inputMode="numeric" value={valor} maxLength={7} placeholder="Vacío = desactivar" className={CLASE_CAMPO}
                  onChange={e => { if (NUMBERS_ONLY.test(e.target.value)) setValor(e.target.value) }} />
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input value={motivo} maxLength={200} className={CLASE_CAMPO} onChange={e => setMotivo(filtrarTexto(e.target.value, motivo))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-none" disabled={guardando} onClick={() => setAbierto(false)}>Cerrar</Button>
              <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar umbral'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
