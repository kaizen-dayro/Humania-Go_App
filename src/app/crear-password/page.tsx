"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function CrearPassword() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [sessionValida, setSessionValida] = useState(false)
  const [correo, setCorreo] = useState('')
  // Fase 13 (Documento 17 sección 9, Documento 18 sección 16.4): Supabase
  // dispara el evento 'PASSWORD_RECOVERY' específicamente cuando la sesión
  // vino de un enlace de recuperación (auth.resetPasswordForEmail), a
  // diferencia de 'SIGNED_IN' para una invitación normal -- mismo mecanismo
  // técnico de sesión en el fragmento de URL, pero el evento sí distingue
  // el caso, sin necesidad de parsear la URL a mano.
  const [esRecuperacion, setEsRecuperacion] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    // Los enlaces de invitación de Supabase entregan la sesión en el
    // fragmento de la URL (#access_token=...&type=invite), que el
    // cliente de navegador procesa de forma asíncrona al montar. Un
    // solo getSession() inmediato puede ganarle esa carrera, así que
    // también escuchamos onAuthStateChange para capturarla en cuanto
    // quede lista.
    let mounted = true
    let resolved = false

    const finish = (session: Session | null, event?: string) => {
      if (!mounted || resolved) return
      resolved = true
      setSessionValida(!!session)
      setCorreo(session?.user?.email || '')
      if (event === 'PASSWORD_RECOVERY') setEsRecuperacion(true)
      setChecking(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) finish(session, event)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session)
    })

    const timeout = setTimeout(() => finish(null), 4000)

    return () => { mounted = false; subscription.unsubscribe(); clearTimeout(timeout) }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('La contraseña debe incluir mayúsculas, minúsculas y números.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setListo(true)
    setTimeout(() => {
      router.push('/admin')
      router.refresh()
    }, 1500)
  }

  if (checking) {
    return <div className="min-h-screen bg-neutral-50" />
  }

  if (!sessionValida) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Humania Go</CardTitle>
            <CardDescription>{esRecuperacion ? 'Enlace de recuperación inválido o expirado' : 'Enlace de invitación inválido o expirado'}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-humania-gray text-center mb-4">
              {esRecuperacion
                ? 'Solicita una nueva recuperación de contraseña desde la pantalla de inicio de sesión.'
                : 'Solicita a un SUPER_ADMIN que te envíe una nueva invitación.'}
            </p>
            <Button className="w-full" onClick={() => router.push('/admin/login')}>
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Humania Go</CardTitle>
          <CardDescription>
            {listo
              ? 'Contraseña creada'
              : esRecuperacion
                ? `Restablece tu contraseña${correo ? ` — ${correo}` : ''}`
                : `Crea tu contraseña${correo ? ` — ${correo}` : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listo ? (
            <p className="text-sm text-green-700 text-center">Redirigiendo al panel administrativo...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md font-medium text-center">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <p className="text-xs text-humania-gray/70">Mínimo 8 caracteres, con mayúsculas, minúsculas y números.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar">Confirmar contraseña</Label>
                <Input
                  id="confirmar"
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Guardando...' : 'Guardar y continuar'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
