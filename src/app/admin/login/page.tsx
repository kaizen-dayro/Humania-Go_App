"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loginAdmin, solicitarRecuperacion } from './actions'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mostrarRecuperacion, setMostrarRecuperacion] = useState(false)
  const [solicitandoRecuperacion, setSolicitandoRecuperacion] = useState(false)
  const [recuperacionSolicitada, setRecuperacionSolicitada] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const res = await loginAdmin(email, password)

    if (!res.success) {
      setError(res.error || 'No se pudo iniciar sesión.')
      setMostrarRecuperacion(!!res.mostrarRecuperacion)
      setIsLoading(false)
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  const handleSolicitarRecuperacion = async () => {
    setSolicitandoRecuperacion(true)
    await solicitarRecuperacion(email)
    setSolicitandoRecuperacion(false)
    setRecuperacionSolicitada(true)
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Humania Go</CardTitle>
          <CardDescription>Acceso al Panel Administrativo</CardDescription>
        </CardHeader>
        <CardContent>
          {recuperacionSolicitada ? (
            <div className="p-3 bg-humania-blue/5 border border-humania-blue/30 text-humania-blue text-sm rounded-md text-center">
              Tu solicitud de recuperación de contraseña será revisada por Humania Go. Una vez aprobada, recibirás un enlace en el correo electrónico registrado para cambiar tu contraseña.
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md font-medium text-center">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Ingresando...' : 'Ingresar'}
              </Button>
              {mostrarRecuperacion && (
                <button
                  type="button"
                  onClick={handleSolicitarRecuperacion}
                  disabled={solicitandoRecuperacion}
                  className="w-full text-center text-sm text-humania-blue hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {solicitandoRecuperacion ? 'Enviando solicitud...' : '¿Olvidaste tu contraseña?'}
                </button>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
