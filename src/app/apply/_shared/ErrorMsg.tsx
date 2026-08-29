import { AlertCircle } from 'lucide-react'

// Extraído de apply/page.tsx (KAI-9/KAI-13) para reutilizarse también en
// apply/parte2/page.tsx -- mismo componente, sin cambios de comportamiento.
export function ErrorMsg({ name, errors }: { name: string; errors: Record<string, string> }) {
  if (!errors[name]) return null
  return (
    <p className="flex items-center gap-1.5 text-red-600 text-sm mt-1.5 font-medium animate-in slide-in-from-top-1">
      <AlertCircle className="w-4 h-4" />
      {errors[name]}
    </p>
  )
}

export function inputClass(name: string, errors: Record<string, string>) {
  return `rounded-none border-neutral-300 focus-visible:ring-humania-sand h-12 transition-colors ${errors[name] ? 'border-red-500 focus-visible:ring-red-500 bg-red-50/30' : ''}`
}
