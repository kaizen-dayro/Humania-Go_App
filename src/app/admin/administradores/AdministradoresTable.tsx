'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle } from 'lucide-react'
import { inviteAdminUser, setAdminRole, setAdminActivo } from '../actions'
import { LETTERS_ONLY, capitalizarPalabras } from '@/lib/validation'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AdminUsuario = {
  id: string
  nombre: string | null
  role: string
  activo: boolean
  created_at: string
  correo: string
}

export function AdministradoresTable({ usuarios, currentUserId }: { usuarios: AdminUsuario[]; currentUserId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Invitar
  const [inviteOpen, setInviteOpen] = useState(false)
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [role, setRole] = useState('ADMIN')

  // Cambiar rol / activar-desactivar (dialogo compartido, con motivo obligatorio)
  const [accion, setAccion] = useState<{ tipo: 'ROL' | 'ACTIVO'; target: AdminUsuario; nuevoValor: string | boolean } | null>(null)
  const [motivo, setMotivo] = useState('')

  const cantidadSuperAdminsActivos = usuarios.filter(u => u.role === 'SUPER_ADMIN' && u.activo).length

  async function handleInvite() {
    setError('')
    if (!correo.trim() || !nombre.trim()) {
      setError('Correo y nombre son obligatorios.')
      return
    }
    if (!EMAIL_REGEX.test(correo.trim())) {
      setError('Ingresa un correo electrónico válido (ej. nombre@dominio.com).')
      return
    }
    setLoading(true)
    const res = await inviteAdminUser(correo.trim(), nombre.trim(), role)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'No se pudo invitar al administrador.')
      return
    }
    setInviteOpen(false)
    setCorreo(''); setNombre(''); setRole('ADMIN')
    router.refresh()
  }

  async function confirmarAccion() {
    if (!accion) return
    if (!motivo.trim()) {
      setError('El motivo es obligatorio.')
      return
    }
    setLoading(true)
    setError('')
    const res = accion.tipo === 'ROL'
      ? await setAdminRole(accion.target.id, accion.nuevoValor as string, motivo.trim())
      : await setAdminActivo(accion.target.id, accion.nuevoValor as boolean, motivo.trim())
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'No se pudo completar la operación.')
      return
    }
    setAccion(null)
    setMotivo('')
    router.refresh()
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={() => { setInviteOpen(true); setError('') }} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6">
          + Invitar Administrador
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map(u => {
              const esUltimoSuperAdminActivo = u.role === 'SUPER_ADMIN' && u.activo && cantidadSuperAdminsActivos <= 1
              const esUnoMismo = u.id === currentUserId
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-humania-blue">{u.nombre || '—'}</TableCell>
                  <TableCell className="text-sm text-humania-gray">{u.correo}</TableCell>
                  <TableCell>
                    <Badge className={u.role === 'SUPER_ADMIN' ? 'bg-humania-blue hover:bg-humania-blue/90' : 'bg-neutral-500 hover:bg-neutral-600'}>
                      {u.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'ADMIN'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.activo ? (
                      <Badge className="bg-green-500 hover:bg-green-600">Activo</Badge>
                    ) : (
                      <Badge variant="destructive">Desactivado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline" size="sm" className="rounded-sm"
                      disabled={esUltimoSuperAdminActivo}
                      title={esUltimoSuperAdminActivo ? 'No puedes degradar al último SUPER_ADMIN activo' : undefined}
                      onClick={() => { setAccion({ tipo: 'ROL', target: u, nuevoValor: u.role === 'SUPER_ADMIN' ? 'ADMIN' : 'SUPER_ADMIN' }); setMotivo(''); setError('') }}
                    >
                      {u.role === 'SUPER_ADMIN' ? 'Bajar a ADMIN' : 'Subir a SUPER_ADMIN'}
                    </Button>
                    <Button
                      variant={u.activo ? 'destructive' : 'outline'} size="sm" className="rounded-sm"
                      disabled={esUnoMismo || esUltimoSuperAdminActivo}
                      title={esUnoMismo ? 'No puedes desactivarte a ti mismo' : esUltimoSuperAdminActivo ? 'No puedes desactivar al último SUPER_ADMIN activo' : undefined}
                      onClick={() => { setAccion({ tipo: 'ACTIVO', target: u, nuevoValor: !u.activo }); setMotivo(''); setError('') }}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}

            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-neutral-500">
                  No hay administradores registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invitar administrador */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setError('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar Administrador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {error && (
              <p className="flex items-center gap-1.5 text-red-600 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>
            )}
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Correo electrónico</Label>
              <Input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="admin@humaniago.com" className="rounded-none border-neutral-300 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Nombre</Label>
              <Input
                value={nombre}
                onChange={(e) => { if (LETTERS_ONLY.test(e.target.value)) setNombre(capitalizarPalabras(e.target.value)) }}
                maxLength={60}
                placeholder="Nombre completo"
                className="rounded-none border-neutral-300 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Rol</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="flex h-11 w-full rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand">
                <option value="ADMIN">ADMIN</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </div>
            <p className="text-xs text-humania-gray/70">Se envía una invitación por correo para que la persona defina su contraseña — no se genera ninguna contraseña desde aquí.</p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={loading} className="flex-1 rounded-none">Cancelar</Button>
              <Button onClick={handleInvite} disabled={loading} className="flex-1 bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none">
                {loading ? 'Invitando...' : 'Enviar Invitación'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cambiar rol / activar-desactivar */}
      <Dialog open={!!accion} onOpenChange={(open) => { if (!open) { setAccion(null); setError('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accion?.tipo === 'ROL'
                ? `Cambiar rol de ${accion.target.nombre || accion.target.correo}`
                : `${accion?.nuevoValor ? 'Activar' : 'Desactivar'} a ${accion?.target.nombre || accion?.target.correo}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {accion?.tipo === 'ROL' && (
              <p className="text-sm text-humania-gray">
                Nuevo rol: <span className="font-semibold text-humania-blue">{accion.nuevoValor === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'}</span>
              </p>
            )}
            {accion?.tipo === 'ACTIVO' && !accion.nuevoValor && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                Esta persona no podrá volver a iniciar sesión ni continuar usando una sesión ya abierta.
              </p>
            )}
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Motivo (obligatorio)</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explica brevemente el motivo de este cambio" rows={3} />
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-red-600 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setAccion(null)} disabled={loading} className="flex-1 rounded-none">Cancelar</Button>
              <Button onClick={confirmarAccion} disabled={loading} className="flex-1 bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none">
                {loading ? 'Guardando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
