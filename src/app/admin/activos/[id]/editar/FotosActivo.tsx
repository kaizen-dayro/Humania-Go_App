'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { AlertCircle, ImageIcon, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { registrarActivoFoto, getActivoFotos, eliminarActivoFoto } from '../../../actions'

const CATEGORIAS_EVIDENCIA: { value: string, label: string }[] = [
  { value: 'FRONTAL', label: 'Frontal' },
  { value: 'TRASERA', label: 'Trasera' },
  { value: 'LATERAL_IZQUIERDO', label: 'Lateral Izquierdo' },
  { value: 'LATERAL_DERECHO', label: 'Lateral Derecho' },
  { value: 'TABLERO', label: 'Tablero' },
  { value: 'LLANTAS', label: 'Llantas' },
  { value: 'RAYONES_DANOS', label: 'Rayones/Daños' },
  { value: 'OTRO', label: 'Otro' },
]

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO = 5 * 1024 * 1024 // 5MB

type Foto = {
  id: string
  storage_path: string
  categoria: string
  descripcion: string | null
  usuario_email: string
  activo: boolean
  created_at: string
  url: string | null
}

type PendienteEvidencia = {
  id: string
  file: File
  categoria: string
  descripcion: string
  previewUrl: string
}

export type FotosActivoHandle = {
  hayPendientes: () => boolean
  confirmarPendientes: (activoIdOverride?: string) => Promise<{ success: boolean; error?: string }>
}

function labelCategoria(cat: string) {
  return CATEGORIAS_EVIDENCIA.find(c => c.value === cat)?.label || cat
}

function validarArchivo(file: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return 'Solo se permiten imágenes JPG, PNG o WEBP.'
  }
  if (file.size > TAMANO_MAXIMO) {
    return 'La imagen no puede superar los 5MB.'
  }
  return null
}

/**
 * Sube un archivo ya validado a Storage y lo registra en BD. No toca
 * estado de React: es el paso final compartido entre subida inmediata
 * (modo solo lectura) y confirmacion de pendientes (modo diferido).
 */
async function subirYRegistrar(
  activoId: string,
  file: File,
  bucket: 'activo-fotos-publicas' | 'activo-fotos-evidencia',
  categoria: string,
  descripcion: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${activoId}/${categoria.toLowerCase()}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (uploadError) {
    console.error('Error subiendo a Storage:', uploadError)
    return { success: false, error: 'No se pudo subir la fotografía. Intenta nuevamente.' }
  }

  const res = await registrarActivoFoto(activoId, bucket, path, categoria, descripcion)
  if (!res.success) {
    return { success: false, error: res.error || 'No se pudo registrar la fotografía.' }
  }

  return { success: true }
}

/**
 * diferir=false (por defecto): comportamiento anterior, sube y registra
 * de inmediato al seleccionar el archivo (usado en modo solo lectura,
 * donde no existe boton Guardar/Cancelar que pueda dar la falsa
 * impresion de revertir algo).
 *
 * diferir=true: el archivo se queda en memoria del navegador (con
 * vista previa) hasta que el formulario padre llama a
 * confirmarPendientes() via ref, tipicamente despues de que los demas
 * campos del activo se guardaron con exito. Cancelar en el formulario
 * padre simplemente descarta este componente sin dejar ningun rastro
 * en Storage ni en base de datos.
 *
 * activoId=null: modo creacion -- el activo todavia no existe (no tiene
 * ID). Solo tiene sentido junto con diferir=true: no se cargan fotos
 * existentes (no puede haberlas), y confirmarPendientes() debe recibir
 * el ID real como argumento una vez el formulario padre crea el activo.
 */
export const FotosActivo = forwardRef<FotosActivoHandle, { activoId: string | null; diferir?: boolean }>(
  function FotosActivo({ activoId, diferir = false }, ref) {
    const [principales, setPrincipales] = useState<Foto[]>([])
    const [evidencia, setEvidencia] = useState<Foto[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [subiendoPrincipal, setSubiendoPrincipal] = useState(false)
    const [categoriaEvidencia, setCategoriaEvidencia] = useState('FRONTAL')
    const [descripcionEvidencia, setDescripcionEvidencia] = useState('')
    const [subiendoEvidencia, setSubiendoEvidencia] = useState(false)

    const [pendientePrincipal, setPendientePrincipal] = useState<{ file: File; previewUrl: string } | null>(null)
    const [pendientesEvidencia, setPendientesEvidencia] = useState<PendienteEvidencia[]>([])

    const [fotoAEliminar, setFotoAEliminar] = useState<Foto | null>(null)
    const [motivoEliminacion, setMotivoEliminacion] = useState('')
    const [eliminando, setEliminando] = useState(false)
    const [errorEliminacion, setErrorEliminacion] = useState('')

    const cargarFotos = useCallback(async () => {
      if (!activoId) {
        setLoading(false)
        return
      }
      setLoading(true)
      const res = await getActivoFotos(activoId)
      if (res.success) {
        setPrincipales(res.principales as Foto[])
        setEvidencia(res.evidencia as Foto[])
      } else {
        setError(res.error || 'No se pudieron cargar las fotografías')
      }
      setLoading(false)
    }, [activoId])

    useEffect(() => {
      cargarFotos()
    }, [cargarFotos])

    useImperativeHandle(ref, () => ({
      hayPendientes: () => !!pendientePrincipal || pendientesEvidencia.length > 0,
      confirmarPendientes: async (activoIdOverride?: string) => {
        const id = activoIdOverride || activoId
        if (!id) return { success: false, error: 'Falta el ID del activo para subir las fotografías.' }

        if (pendientePrincipal) {
          const res = await subirYRegistrar(id, pendientePrincipal.file, 'activo-fotos-publicas', 'PRINCIPAL', '')
          if (!res.success) return res
          URL.revokeObjectURL(pendientePrincipal.previewUrl)
          setPendientePrincipal(null)
        }

        for (const item of pendientesEvidencia) {
          const res = await subirYRegistrar(id, item.file, 'activo-fotos-evidencia', item.categoria, item.descripcion)
          if (!res.success) return res
          URL.revokeObjectURL(item.previewUrl)
        }
        setPendientesEvidencia([])

        if (id === activoId) await cargarFotos()
        return { success: true }
      },
    }), [pendientePrincipal, pendientesEvidencia, activoId, cargarFotos])

    async function subirInmediata(
      file: File,
      bucket: 'activo-fotos-publicas' | 'activo-fotos-evidencia',
      categoria: string,
      descripcion: string,
      setSubiendo: (v: boolean) => void
    ) {
      if (!activoId) return // Modo creacion (activoId=null) siempre usa diferir=true, nunca llega aqui.

      setError('')
      const errorValidacion = validarArchivo(file)
      if (errorValidacion) {
        setError(errorValidacion)
        return
      }

      setSubiendo(true)
      const res = await subirYRegistrar(activoId, file, bucket, categoria, descripcion)
      setSubiendo(false)

      if (!res.success) {
        setError(res.error || 'No se pudo subir la fotografía.')
        return
      }

      if (bucket === 'activo-fotos-evidencia') setDescripcionEvidencia('')
      await cargarFotos()
    }

    function seleccionarPrincipal(file: File) {
      setError('')
      const errorValidacion = validarArchivo(file)
      if (errorValidacion) {
        setError(errorValidacion)
        return
      }
      if (pendientePrincipal) URL.revokeObjectURL(pendientePrincipal.previewUrl)
      setPendientePrincipal({ file, previewUrl: URL.createObjectURL(file) })
    }

    function seleccionarEvidencia(file: File) {
      setError('')
      const errorValidacion = validarArchivo(file)
      if (errorValidacion) {
        setError(errorValidacion)
        return
      }
      setPendientesEvidencia(prev => [
        ...prev,
        { id: crypto.randomUUID(), file, categoria: categoriaEvidencia, descripcion: descripcionEvidencia, previewUrl: URL.createObjectURL(file) },
      ])
      setDescripcionEvidencia('')
    }

    function quitarPendientePrincipal() {
      if (pendientePrincipal) URL.revokeObjectURL(pendientePrincipal.previewUrl)
      setPendientePrincipal(null)
    }

    function quitarPendienteEvidencia(id: string) {
      setPendientesEvidencia(prev => {
        const item = prev.find(p => p.id === id)
        if (item) URL.revokeObjectURL(item.previewUrl)
        return prev.filter(p => p.id !== id)
      })
    }

    async function confirmarEliminacion() {
      if (!fotoAEliminar || !activoId) return
      if (!motivoEliminacion.trim()) {
        setErrorEliminacion('Debes indicar el motivo de la eliminación.')
        return
      }

      setEliminando(true)
      setErrorEliminacion('')
      const res = await eliminarActivoFoto(activoId, fotoAEliminar.id, motivoEliminacion.trim())
      setEliminando(false)

      if (!res.success) {
        setErrorEliminacion(res.error || 'No se pudo eliminar la fotografía.')
        return
      }

      setFotoAEliminar(null)
      setMotivoEliminacion('')
      await cargarFotos()
    }

    if (loading) {
      return <p className="text-sm text-humania-gray">Cargando fotografías...</p>
    }

    const principalVigente = principales.find(f => f.activo)
    const principalesHistoricas = principales.filter(f => !f.activo)
    const hayPendientes = !!pendientePrincipal || pendientesEvidencia.length > 0

    return (
      <div className="space-y-8">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {diferir && hayPendientes && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md">
            Tienes fotografías pendientes de guardar. Se subirán únicamente cuando presiones <span className="font-semibold">Guardar Cambios</span>; si presionas Cancelar, se descartan sin dejar rastro.
          </div>
        )}

        {/* FOTOGRAFIA PRINCIPAL */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm space-y-4">
          <div>
            <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Fotografía Principal</h4>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mt-2">
              Esta fotografía es pública (puede mostrarse en oportunidades y tarjetas del sitio). No debe contener información sensible, documentos, personas identificables ni evidencia interna del estado del vehículo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {pendientePrincipal ? (
              <div className="relative w-full sm:w-48 h-32 shrink-0">
                <img src={pendientePrincipal.previewUrl} alt="Foto principal pendiente de guardar" className="w-full h-full object-cover rounded-lg border-2 border-dashed border-amber-400 shadow-sm" />
                <span className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">PENDIENTE</span>
                <button type="button" onClick={quitarPendientePrincipal} className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow cursor-pointer" aria-label="Quitar fotografía pendiente">
                  <X className="w-3.5 h-3.5 text-humania-gray" />
                </button>
              </div>
            ) : principalVigente ? (
              <img
                src={principalVigente.url || ''}
                alt="Foto principal vigente"
                className="w-full sm:w-48 h-32 object-cover rounded-lg border border-neutral-200 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-full sm:w-48 h-32 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-neutral-400 shrink-0">
                <ImageIcon className="w-7 h-7" />
              </div>
            )}

            <div className="flex-1 space-y-3 w-full">
              {pendientePrincipal ? (
                <p className="text-xs text-amber-700">Reemplazará la fotografía principal actual al guardar los cambios.</p>
              ) : principalVigente ? (
                <div className="text-xs text-humania-gray space-y-1">
                  <p>Vigente desde {new Date(principalVigente.created_at).toLocaleString()}</p>
                  <p>Registrada por: {principalVigente.usuario_email}</p>
                  <button
                    type="button"
                    onClick={() => { setFotoAEliminar(principalVigente); setMotivoEliminacion(''); setErrorEliminacion('') }}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar fotografía principal
                  </button>
                </div>
              ) : null}

              <div>
                <input
                  id="input-foto-principal"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={subiendoPrincipal}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (diferir) seleccionarPrincipal(file)
                      else subirInmediata(file, 'activo-fotos-publicas', 'PRINCIPAL', '', setSubiendoPrincipal)
                    }
                    e.target.value = ''
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="input-foto-principal"
                  className={`inline-flex items-center gap-2 px-4 py-2.5 bg-humania-blue text-white text-sm font-semibold rounded-md shadow-sm transition-colors ${
                    subiendoPrincipal ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-humania-blue/90'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  {subiendoPrincipal ? 'Subiendo...' : pendientePrincipal || principalVigente ? 'Reemplazar fotografía principal' : 'Subir fotografía principal'}
                </label>
              </div>
            </div>
          </div>

          {principalesHistoricas.length > 0 && (
            <details className="text-xs text-humania-gray pt-2 border-t border-neutral-100">
              <summary className="cursor-pointer font-medium py-2">Historial de fotografías principales ({principalesHistoricas.length})</summary>
              <ul className="mt-1 space-y-2">
                {principalesHistoricas.map(f => (
                  <li key={f.id} className="flex items-center gap-3">
                    <img src={f.url || ''} alt="Foto principal histórica" className="w-16 h-10 object-cover rounded border border-neutral-200 opacity-70" />
                    <span>{new Date(f.created_at).toLocaleString()} — {f.usuario_email}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* EVIDENCIA */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm space-y-4">
          <div>
            <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Evidencia Fotográfica del Estado</h4>
            <p className="text-xs text-humania-gray/70 mt-1">Información interna. No se expone públicamente. Puede haber varias fotografías por categoría.</p>
          </div>

          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-4">
            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Categoría</label>
                <select
                  value={categoriaEvidencia}
                  onChange={(e) => setCategoriaEvidencia(e.target.value)}
                  className="h-10 w-full rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
                >
                  {CATEGORIAS_EVIDENCIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Descripción (opcional)</label>
                <Textarea
                  value={descripcionEvidencia}
                  onChange={(e) => setDescripcionEvidencia(e.target.value)}
                  placeholder="Ej. Rayón lateral derecho"
                  rows={1}
                  className="min-h-10 h-10 resize-none"
                />
              </div>
            </div>

            <div>
              <input
                id="input-foto-evidencia"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={subiendoEvidencia}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (diferir) seleccionarEvidencia(file)
                    else subirInmediata(file, 'activo-fotos-evidencia', categoriaEvidencia, descripcionEvidencia, setSubiendoEvidencia)
                  }
                  e.target.value = ''
                }}
                className="sr-only"
              />
              <label
                htmlFor="input-foto-evidencia"
                className={`inline-flex items-center justify-center gap-2 px-4 h-10 border border-humania-blue text-humania-blue text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                  subiendoEvidencia ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-humania-blue hover:text-white'
                }`}
              >
                <Upload className="w-4 h-4" />
                {subiendoEvidencia ? 'Subiendo...' : 'Subir fotografía'}
              </label>
            </div>
          </div>

          {evidencia.length === 0 && pendientesEvidencia.length === 0 ? (
            <p className="text-sm text-neutral-400">No hay fotografías de evidencia registradas.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {pendientesEvidencia.map(item => (
                <div key={item.id} className="relative group border-2 border-dashed border-amber-400 rounded-lg overflow-hidden">
                  <img src={item.previewUrl} alt={labelCategoria(item.categoria)} className="w-full h-24 object-cover" />
                  <span className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">PENDIENTE</span>
                  <button type="button" onClick={() => quitarPendienteEvidencia(item.id)} className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow cursor-pointer" aria-label="Quitar fotografía pendiente">
                    <X className="w-3.5 h-3.5 text-humania-gray" />
                  </button>
                  <div className="p-2">
                    <p className="text-xs font-bold text-humania-blue">{labelCategoria(item.categoria)}</p>
                    {item.descripcion && <p className="text-xs text-humania-gray">{item.descripcion}</p>}
                  </div>
                </div>
              ))}
              {evidencia.map(f => (
                <div key={f.id} className="relative group border border-neutral-200 rounded-lg overflow-hidden hover:shadow-md hover:border-neutral-300 transition-all">
                  {f.url ? (
                    <img src={f.url} alt={labelCategoria(f.categoria)} className="w-full h-24 object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : (
                    <div className="w-full h-24 bg-neutral-100 flex items-center justify-center text-neutral-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setFotoAEliminar(f); setMotivoEliminacion(''); setErrorEliminacion('') }}
                    className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Eliminar fotografía"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                  <div className="p-2">
                    <p className="text-xs font-bold text-humania-blue">{labelCategoria(f.categoria)}</p>
                    {f.descripcion && <p className="text-xs text-humania-gray">{f.descripcion}</p>}
                    <p className="text-[10px] text-humania-gray/60 mt-1">{new Date(f.created_at).toLocaleDateString()} — {f.usuario_email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog open={!!fotoAEliminar} onOpenChange={(open) => { if (!open) { setFotoAEliminar(null); setErrorEliminacion('') } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar fotografía</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {fotoAEliminar?.url && (
                <img src={fotoAEliminar.url} alt="Fotografía a eliminar" className="w-full h-40 object-cover rounded-md border border-neutral-200" />
              )}
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                Esta acción no se puede deshacer desde el panel: el archivo se eliminará de forma permanente. Quedará un registro de quién y cuándo la eliminó.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-humania-gray">Motivo de la eliminación (obligatorio)</label>
                <Textarea
                  value={motivoEliminacion}
                  onChange={(e) => setMotivoEliminacion(e.target.value)}
                  placeholder="Ej. Se subió por error, foto duplicada, foto incorrecta..."
                  rows={3}
                />
              </div>
              {errorEliminacion && <p className="text-red-600 text-sm">{errorEliminacion}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => { setFotoAEliminar(null); setErrorEliminacion('') }} disabled={eliminando} className="flex-1 rounded-none">
                  Cancelar
                </Button>
                <Button type="button" onClick={confirmarEliminacion} disabled={eliminando} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-none">
                  {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
)
