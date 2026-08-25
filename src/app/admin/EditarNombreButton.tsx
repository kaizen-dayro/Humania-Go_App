'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LETTERS_ONLY, capitalizarPalabras } from '@/lib/validation'
import { setMiNombre } from './actions'

/**
 * Cada administrador puede poner el nombre que quiera ver en su propia
 * vista (encabezado del panel) -- antes solo se fijaba una vez, al
 * invitar a la persona, y no había forma de corregirlo después (un
 * SUPER_ADMIN creado directo en Supabase, sin invitación, quedaba sin
 * nombre para siempre). Acotado a la propia cuenta -- nunca edita el
 * nombre de otro administrador, ni siquiera si quien lo usa es SUPER_ADMIN.
 */
export function EditarNombreButton({ nombreActual, correo }: { nombreActual: string | null; correo: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(nombreActual || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!LETTERS_ONLY.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setNombre(capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setNombre(nombreActual || '')
      setError('')
    }
  }

  async function handleGuardar() {
    const trimmed = nombre.trim()
    if (trimmed.length < 2) { setError('Debe tener al menos 2 letras.'); return }

    setLoading(true)
    setError('')
    const res = await setMiNombre(trimmed)
    setLoading(false)

    if (!res.success) { setError(res.error || 'No se pudo guardar.'); return }

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-right min-w-0 group cursor-pointer"
        title="Editar tu nombre"
      >
        <p className="text-sm font-semibold text-humania-blue leading-tight truncate flex items-center justify-end gap-1.5">
          {nombreActual || correo}
          <Pencil className="w-3 h-3 text-humania-gray/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </p>
        <p className="text-xs text-humania-gray leading-tight truncate">{correo}</p>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tu nombre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre a mostrar en tu vista</Label>
              <Input value={nombre} onChange={handleChange} maxLength={60} placeholder="Ej. Juan Pérez" autoFocus />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button onClick={handleGuardar} disabled={loading} className="w-full bg-humania-blue hover:bg-humania-blue/90">
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
