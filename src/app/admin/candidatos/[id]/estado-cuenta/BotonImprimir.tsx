'use client'

// KAI-127 — "Descargar PDF": abre el diálogo de impresión del navegador, donde
// se elige "Guardar como PDF" (spec D5: sin dependencias nuevas).

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BotonImprimir() {
  return (
    <Button type="button" onClick={() => window.print()} className="rounded-none">
      <Download className="w-4 h-4 mr-2" aria-hidden="true" />
      Descargar PDF
    </Button>
  )
}
