'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { aprobarRecuperacionAction, rechazarRecuperacionAction } from './actions'

type Solicitud = {
  id: string
  correo: string
  solicitado_en: string
  admin_users: { nombre: string | null } | { nombre: string | null }[] | null
}

function nombreAdmin(s: Solicitud) {
  const row = Array.isArray(s.admin_users) ? s.admin_users[0] : s.admin_users
  return row?.nombre || s.correo
}

/**
 * Notificación sutil de solicitudes de recuperación pendientes, visible
 * solo para SUPER_ADMIN (Documento 17 sección 9.3, Documento 18 sección
 * 16.3). Esquina superior derecha del panel, siguiendo el estilo visual
 * ya existente (cabecera de admin/layout.tsx).
 */
export function RecuperacionNotificacion({ solicitudesIniciales }: { solicitudesIniciales: Solicitud[] }) {
  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales)
  const [abierto, setAbierto] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})

  if (solicitudes.length === 0) return null

  async function handleAprobar(id: string) {
    setProcesando(id)
    setError(prev => ({ ...prev, [id]: '' }))
    const res = await aprobarRecuperacionAction(id)
    setProcesando(null)
    if (!res.success) {
      setError(prev => ({ ...prev, [id]: res.error || 'No se pudo aprobar.' }))
      return
    }
    setSolicitudes(prev => prev.filter(s => s.id !== id))
  }

  async function handleRechazar(id: string) {
    setProcesando(id)
    setError(prev => ({ ...prev, [id]: '' }))
    const res = await rechazarRecuperacionAction(id)
    setProcesando(null)
    if (!res.success) {
      setError(prev => ({ ...prev, [id]: res.error || 'No se pudo rechazar.' }))
      return
    }
    setSolicitudes(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
        aria-label="Solicitudes de recuperación de contraseña"
      >
        <KeyRound className="w-5 h-5 text-humania-blue" />
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
          {solicitudes.length}
        </span>
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-neutral-100">
            <p className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest">Recuperación de contraseña</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {solicitudes.map(s => (
              <div key={s.id} className="p-3 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-humania-blue">{nombreAdmin(s)}</p>
                  <p className="text-xs text-humania-gray">{s.correo}</p>
                  <p className="text-xs text-humania-gray/70">{new Date(s.solicitado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                {error[s.id] && <p className="text-xs text-red-600">{error[s.id]}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={procesando === s.id}
                    onClick={() => handleAprobar(s.id)}
                    className="flex-1 bg-humania-blue hover:bg-humania-blue/90 text-xs h-8"
                  >
                    {procesando === s.id ? '...' : 'Aprobar recuperación'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={procesando === s.id}
                    onClick={() => handleRechazar(s.id)}
                    className="text-xs h-8"
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
