"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Oportunidad = {
  id: string; codigo_interno: string; tipo: string; marca: string; modelo: string; imagen: string;
}

type YTPlayerState = -1 | 0 | 1 | 2 | 3 | 5

interface YTPlayer {
  playVideo: () => void
  getCurrentTime: () => number
  getDuration: () => number
}

interface YTNamespace {
  Player: new (elementId: string, options: {
    videoId: string
    playerVars?: Record<string, number>
    events?: {
      onReady?: (event: { target: YTPlayer }) => void
      onStateChange?: (event: { target: YTPlayer; data: YTPlayerState }) => void
    }
  }) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const PLAYER_ELEMENT_ID = 'humania-presentacion-player'

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss < 10 ? '0' : ''}${ss}`
}

function PresentacionView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activoId = searchParams.get('activo_id')

  const [oportunidad, setOportunidad] = useState<Oportunidad | null>(null)
  const [loadingOportunidad, setLoadingOportunidad] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null)
  const [perfilResuelto, setPerfilResuelto] = useState<string>('GENERAL')
  const [loadingVideo, setLoadingVideo] = useState(true)
  // Modo demo temporal (Fase 16b): administrado por el SUPER_ADMIN desde
  // /admin/presentacion (nunca una variable de entorno -- el plan gratuito
  // de Vercel del usuario no permite agregar más). null = apagado.
  const [demoSegundos, setDemoSegundos] = useState<number | null>(null)
  // Video desactivado por completo (nuevo): administrado por el
  // SUPER_ADMIN para tráfico puntual ya filtrado personalmente que no
  // necesita ver la presentación. true = comportamiento normal (por
  // defecto). Cuando es false, esta vista nunca llega a mostrar el
  // reproductor -- registra la visualización igual (misma función que si
  // el video hubiera terminado de verdad) y pasa directo a /apply.
  const [videoRequerido, setVideoRequerido] = useState(true)
  const bypasseandoRef = useRef(false)

  const [apiReady, setApiReady] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [videoToken, setVideoToken] = useState<string | null>(null)

  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)

  const playerRef = useRef<YTPlayer | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const registrandoRef = useRef(false)

  // 1. Resuelve la oportunidad (para mostrar marca/modelo y validar que el id es real).
  useEffect(() => {
    fetch('/api/oportunidades')
      .then(res => res.json())
      .then(res => {
        const match = activoId && res.success ? (res.data as Oportunidad[]).find(o => o.id === activoId) : null
        if (match) setOportunidad(match)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingOportunidad(false))
  }, [activoId])

  // 1b. Video vigente -- lo decide el SUPER_ADMIN desde /admin/presentacion,
  // nunca una variable de entorno (Fase 15b).
  useEffect(() => {
    fetch('/api/presentacion/video-actual')
      .then(res => res.json())
      .then(res => {
        setYoutubeVideoId(res.success && res.data ? res.data.youtubeVideoId : null)
        setPerfilResuelto(res.success && res.data ? res.data.perfil : 'GENERAL')
        setDemoSegundos(res.success ? res.demoSegundos ?? null : null)
        setVideoRequerido(res.success ? res.videoRequerido !== false : true)
      })
      .catch(() => setYoutubeVideoId(null))
      .finally(() => setLoadingVideo(false))
  }, [])

  // 1c. Video desactivado por completo -- registra la visualización sin
  // mostrar nada y pasa directo a /apply, en vez de esperar a que la
  // persona interactúe con un reproductor que nunca aparece.
  useEffect(() => {
    if (loadingVideo || videoRequerido || !activoId || bypasseandoRef.current) return
    bypasseandoRef.current = true
    fetch('/api/presentacion/completar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo_id: activoId }),
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          router.replace(`/apply?activo_id=${activoId}&video_token=${res.token}&perfil=${perfilResuelto}`)
        }
      })
      .catch(() => {})
  }, [loadingVideo, videoRequerido, activoId, perfilResuelto, router])

  // 2. Carga el script de la API de YouTube una sola vez.
  useEffect(() => {
    const markReady = () => setApiReady(true)
    if (window.YT && window.YT.Player) {
      const id = setTimeout(markReady, 0)
      return () => clearTimeout(id)
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(tag)
    }
    window.onYouTubeIframeAPIReady = markReady
  }, [])

  // 3. Crea el reproductor (controles nativos ocultos, sin teclado, sin pantalla completa propia).
  useEffect(() => {
    if (!apiReady || !youtubeVideoId || playerRef.current || !window.YT) return
    playerRef.current = new window.YT.Player(PLAYER_ELEMENT_ID, {
      videoId: youtubeVideoId,
      playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, autoplay: 0 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (event) => {
          if (!window.YT) return
          if (event.data === window.YT.PlayerState.ENDED) {
            setPlaying(false)
            setEnded(true)
          } else if (event.data === window.YT.PlayerState.PLAYING) {
            setPlaying(true)
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            // No hay controles visibles para pausar -- si igual ocurre
            // (teclas multimedia del sistema operativo, Picture-in-Picture),
            // se reanuda automáticamente. El video no se detiene hasta ENDED.
            playerRef.current?.playVideo()
          }
        },
      },
    })
  }, [apiReady, youtubeVideoId])

  // 4. Sondea el progreso mientras reproduce (no hay barra nativa que leer).
  // En modo demo (demoSegundos, administrado por el SUPER_ADMIN), ignora
  // el tiempo real del video y cuenta hasta demoSegundos -- el video real
  // sigue de fondo, con todas sus restricciones, solo cambia cuándo se
  // marca "terminado".
  useEffect(() => {
    if (!playing) return

    if (demoSegundos) {
      pollRef.current = setInterval(() => {
        setDuration(demoSegundos)
        setElapsed(prev => {
          const next = prev + 0.4
          if (next >= demoSegundos) {
            if (pollRef.current) clearInterval(pollRef.current)
            setPlaying(false)
            setEnded(true)
            return demoSegundos
          }
          return next
        })
      }, 400)
    } else {
      pollRef.current = setInterval(() => {
        const p = playerRef.current
        if (!p) return
        setElapsed(p.getCurrentTime())
        setDuration(p.getDuration())
      }, 400)
    }

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [playing, demoSegundos])

  // 5. Registra la visualización completa en el servidor -- esta llamada
  // es la que realmente importa; el resto de la vista es solo UX.
  useEffect(() => {
    if (!ended || !activoId || videoToken || registrandoRef.current) return
    registrandoRef.current = true
    fetch('/api/presentacion/completar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo_id: activoId }),
    })
      .then(res => res.json())
      .then(res => { if (res.success) setVideoToken(res.token) })
      .catch(() => {})
      .finally(() => { registrandoRef.current = false })
  }, [ended, activoId, videoToken])

  // 6. Advertencia nativa al intentar cerrar/recargar antes de terminar.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (ended) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [ended])

  // 7. Desalienta el botón "Atrás" del navegador mientras no ha terminado.
  useEffect(() => {
    if (ended) return
    window.history.pushState(null, '', window.location.href)
    const onPopState = () => {
      if (!ended) window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [ended])

  const handlePlay = useCallback(() => {
    playerRef.current?.playVideo()
  }, [])

  const handlePostularme = useCallback(() => {
    if (!activoId || !videoToken) return
    router.push(`/apply?activo_id=${activoId}&video_token=${videoToken}&perfil=${perfilResuelto}`)
  }, [activoId, videoToken, perfilResuelto, router])

  if (loadingOportunidad || loadingVideo) {
    return <div className="min-h-screen bg-[#0B0E10] flex items-center justify-center text-white/60 text-sm">Cargando…</div>
  }

  if (notFound || !activoId) {
    return (
      <div className="min-h-screen bg-[#0B0E10] flex flex-col items-center justify-center text-center px-6 gap-4">
        <p className="text-white text-lg font-semibold">Esta oportunidad ya no está disponible.</p>
        <Link href="/" className="text-humania-sand text-sm font-semibold underline underline-offset-4">Volver al inicio</Link>
      </div>
    )
  }

  if (!videoRequerido) {
    return <div className="min-h-screen bg-[#0B0E10] flex items-center justify-center text-white/60 text-sm">Cargando…</div>
  }

  return (
    <div className="min-h-screen bg-[#0B0E10] text-white flex flex-col items-center justify-center px-6 py-10 relative font-sans">
      <div className="absolute top-5 left-6 right-6 flex items-center justify-between text-[11.5px] font-semibold text-white/55">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Presentación del modelo de negocio
        </span>
        {oportunidad && <span>{oportunidad.marca} {oportunidad.modelo}</span>}
      </div>

      {demoSegundos && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 text-[10.5px] font-bold uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
          Modo demo temporal — se habilita a los {demoSegundos}s
        </div>
      )}

      <div className="w-full max-w-2xl aspect-video rounded-lg overflow-hidden relative shadow-[0_30px_80px_rgba(0,0,0,0.5)] bg-black">
        <div id={PLAYER_ELEMENT_ID} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Capa que absorbe todo clic/clic-derecho sobre el iframe -- sin esto,
            un clic derecho abriría el menú propio de YouTube ("Ver en YouTube"),
            que sí tiene controles completos. */}
        <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />

        {!playing && !ended && youtubeVideoId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <button
              type="button"
              onClick={handlePlay}
              disabled={!playerReady}
              aria-label="Reproducir presentación"
              className="w-[74px] h-[74px] rounded-full bg-humania-sand flex items-center justify-center shadow-[0_8px_28px_rgba(217,196,161,0.35)] hover:scale-105 transition-transform disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" className="fill-[#0B0E10] ml-1"><path d="M6 4l15 8-15 8V4z" /></svg>
            </button>
          </div>
        )}

        {!youtubeVideoId && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs text-center px-8">
            Video pendiente de configuración por el equipo de Humania Go.
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl mt-6">
        <div className="flex justify-between text-xs text-white/50 mb-2 tabular-nums">
          <span>{ended ? fmt(duration) : fmt(elapsed)} / {duration ? fmt(duration) : '6:00'}</span>
          <span>{duration ? Math.floor((elapsed / duration) * 100) : 0}%</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-humania-sand rounded-full transition-[width] duration-150"
            style={{ width: duration ? `${Math.min(100, (elapsed / duration) * 100)}%` : (ended ? '100%' : '0%') }}
          />
        </div>
      </div>

      {!ended ? (
        <p className="flex items-center gap-2 mt-6 text-xs text-white/40 text-center max-w-sm">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          No se puede adelantar, pausar ni cerrar esta vista hasta que el video termine.
        </p>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="flex items-center gap-2 text-sm font-bold text-emerald-400">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
            Presentación completa
          </span>
          <button
            type="button"
            onClick={handlePostularme}
            disabled={!videoToken}
            className="bg-humania-sand text-[#0B0E10] font-extrabold text-[15px] px-8 py-4 rounded-full flex items-center gap-2.5 shadow-[0_10px_30px_rgba(217,196,161,0.3)] hover:-translate-y-0.5 transition-transform disabled:opacity-50"
          >
            {videoToken ? 'Quiero postularme' : 'Confirmando…'}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default function PresentacionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0E10] flex items-center justify-center text-white/60 text-sm">Cargando…</div>}>
      <PresentacionView />
    </Suspense>
  )
}
