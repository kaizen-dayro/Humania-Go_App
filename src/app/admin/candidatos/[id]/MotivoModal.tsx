'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { LETTERS_WITH_PUNCTUATION, DESCRIPTIVE_TEXT, capitalizarPalabras } from '@/lib/validation'

/**
 * Modal de motivo (Fase 13, Documento 17/18): reemplaza el window.prompt()
 * nativo que usaba CandidateActions para el motivo de un cambio de estado
 * individual. Un prompt() no permite aplicar limpieza en vivo -- este
 * modal si: solo letras/espacios, capitalizacion en vivo (mismo mecanismo
 * que el resto del sistema), minimo 10 / maximo 111 caracteres, igual que
 * la validacion ya aplicada dentro de bulk_change_candidate_status
 * (supabase/00029).
 *
 * KAI-38 (2026-09-16): ampliado con props opcionales para reutilizarlo en
 * "Continuar proceso" (nota opcional, permite dígitos, hasta 500
 * caracteres, sin mínimo) en vez de duplicar el componente -- mismo
 * mecanismo, reglas distintas por caso de uso.
 */
export function MotivoModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
  required = true,
  initialValue = '',
  label = 'Motivo (obligatorio)',
  placeholder = 'Escribe el motivo... (mínimo 10 caracteres)',
  minLength = 10,
  maxLength = 111,
  allowDigits = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  loading: boolean
  onConfirm: (motivo: string) => void
  required?: boolean
  initialValue?: string
  label?: string
  placeholder?: string
  minLength?: number
  maxLength?: number
  allowDigits?: boolean
}) {
  const [motivo, setMotivo] = useState(initialValue)
  const [error, setError] = useState('')
  const pattern = allowDigits ? DESCRIPTIVE_TEXT : LETTERS_WITH_PUNCTUATION

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!pattern.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setMotivo(capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setMotivo(initialValue)
      setError('')
    }
  }

  function handleConfirmClick() {
    const trimmed = motivo.trim()
    if (required && trimmed.length < minLength) {
      setError(`El motivo debe tener al menos ${minLength} caracteres.`)
      return
    }
    if (!required && trimmed.length > 0 && trimmed.length < minLength) {
      setError(`Si escribes una nota, debe tener al menos ${minLength} caracteres.`)
      return
    }
    setError('')
    onConfirm(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-neutral-600">{description}</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">{label}</label>
            <Textarea
              placeholder={placeholder}
              value={motivo}
              onChange={handleChange}
              maxLength={maxLength}
              rows={3}
              autoFocus
            />
            <p className="text-xs text-neutral-400 text-right">{motivo.length}/{maxLength}</p>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button onClick={handleConfirmClick} disabled={loading} className="w-full bg-humania-blue hover:bg-humania-blue/90">
            {loading ? 'Guardando...' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
