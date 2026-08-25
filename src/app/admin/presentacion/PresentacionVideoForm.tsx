'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, AlertCircle, PlayCircle } from 'lucide-react'
import { LETTERS_WITH_PUNCTUATION, capitalizarPalabras } from '@/lib/validation'
import { extractYouTubeVideoId } from '@/lib/youtube'
import { setPresentacionVideo } from '../actions'

type VersionRow = {
  id: string
  youtube_video_id: string
  youtube_url_original: string
  titulo: string | null
  motivo: string
  is_current: boolean
  creado_en: string
  admin_users: { nombre: string }[] | null
}

function textoConLimpieza(setter: (v: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!LETTERS_WITH_PUNCTUATION.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setter(capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }
}

export function PresentacionVideoForm({ historial }: { historial: VersionRow[] }) {
  const router = useRouter()
  const [urlInput, setUrlInput] = useState('')
  const [titulo, setTitulo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const parsedId = useMemo(() => (urlInput.trim() ? extractYouTubeVideoId(urlInput) : null), [urlInput])
  const urlInvalida = urlInput.trim().length > 0 && !parsedId

  const actual = historial.find(v => v.is_current)
  const anteriores = historial.filter(v => !v.is_current)

  async function handleSubmit() {
    setError('')
    setSuccess(false)
    if (!parsedId) { setError('Pega un enlace de YouTube válido o el ID del video.'); return }
    if (motivo.trim().length < 10) { setError('El motivo debe tener al menos 10 caracteres.'); return }

    setSubmitting(true)
    const res = await setPresentacionVideo(parsedId, urlInput.trim(), titulo.trim(), motivo.trim())
    setSubmitting(false)

    if (!res.success) { setError(res.error || 'No se pudo actualizar el video.'); return }

    setUrlInput('')
    setTitulo('')
    setMotivo('')
    setSuccess(true)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {actual && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm overflow-hidden">
          <p className="text-[11px] font-bold text-humania-gray/50 uppercase tracking-widest px-6 pt-5">Video vigente ahora</p>
          <div className="flex flex-col sm:flex-row gap-5 p-6">
            <div className="w-full sm:w-56 aspect-video rounded-md overflow-hidden bg-neutral-100 shrink-0 relative">
              <img src={`https://img.youtube.com/vi/${actual.youtube_video_id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
              <PlayCircle className="w-8 h-8 text-white absolute inset-0 m-auto drop-shadow" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-humania-blue">{actual.titulo || 'Sin título'}</p>
              <p className="text-xs text-humania-gray/70 mt-1">ID: {actual.youtube_video_id}</p>
              <p className="text-xs text-humania-gray/70">Puesto por {actual.admin_users?.[0]?.nombre || '—'} · {new Date(actual.creado_en).toLocaleString()}</p>
              <p className="text-sm text-humania-gray mt-2">{actual.motivo}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6 space-y-5">
        <p className="text-[11px] font-bold text-humania-gray/50 uppercase tracking-widest">Cambiar el video</p>

        <div className="space-y-2">
          <Label>Enlace de YouTube</Label>
          <Input
            placeholder="https://youtu.be/… o https://www.youtube.com/watch?v=…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={urlInvalida ? 'border-red-500' : ''}
          />
          {urlInvalida && <p className="text-red-600 text-sm">No se reconoce un video de YouTube válido en ese enlace.</p>}
          {parsedId && (
            <div className="flex items-center gap-3 pt-1">
              <div className="w-28 aspect-video rounded overflow-hidden bg-neutral-100 shrink-0">
                <img src={`https://img.youtube.com/vi/${parsedId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Video reconocido — ID {parsedId}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Título (opcional, solo para identificarlo en la lista de abajo)</Label>
          <Input placeholder="Ej. Presentación agosto 2026" value={titulo} maxLength={60} onChange={textoConLimpieza(setTitulo)} />
          <p className="text-xs text-neutral-400 text-right">{titulo.length}/60</p>
        </div>

        <div className="space-y-2">
          <Label>Motivo del cambio (obligatorio)</Label>
          <Textarea placeholder="Escribe el motivo… (mínimo 10 caracteres)" value={motivo} maxLength={111} rows={3} onChange={textoConLimpieza(setMotivo)} />
          <p className="text-xs text-neutral-400 text-right">{motivo.length}/111</p>
        </div>

        {error && <p className="text-red-600 text-sm flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}
        {success && <p className="text-green-700 text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Video actualizado — ya es el que verán los próximos candidatos.</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting || !parsedId || motivo.trim().length < 10}
          className="bg-humania-blue hover:bg-humania-blue/90"
        >
          {submitting ? 'Guardando…' : 'Publicar este video'}
        </Button>
      </div>

      {anteriores.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6">
          <p className="text-[11px] font-bold text-humania-gray/50 uppercase tracking-widest mb-4">Videos anteriores</p>
          <div className="space-y-3">
            {anteriores.map(v => (
              <div key={v.id} className="border border-neutral-100 rounded-md p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-humania-blue">{v.titulo || 'Sin título'} <span className="font-normal text-humania-gray/60">— {v.youtube_video_id}</span></p>
                  <p className="text-xs text-humania-gray/70 mt-0.5">Puesto por {v.admin_users?.[0]?.nombre || '—'} · {new Date(v.creado_en).toLocaleString()}</p>
                  <p className="text-xs text-humania-gray mt-1">{v.motivo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
