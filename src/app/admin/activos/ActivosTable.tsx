'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const ESTADOS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  RESERVADO: 'Reservado',
  ASIGNADO: 'Asignado',
  EN_MANTENIMIENTO: 'En Mantenimiento',
  NO_DISPONIBLE: 'No Disponible',
  TRANSFERIDO: 'Transferido',
}

export function ActivosTable({ activos }: { activos: any[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [tipo, setTipo] = useState(searchParams.get('tipo') || '')
  const [estado, setEstado] = useState(searchParams.get('estado') || '')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (tipo) params.set('tipo', tipo)
      if (estado) params.set('estado', estado)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, tipo, estado, pathname, router])

  const tiposDisponibles = useMemo(() => {
    const set = new Set<string>()
    activos.forEach((a: any) => {
      const nombre = a.modelos_vehiculo?.tipos_vehiculo?.nombre
      if (nombre) set.add(nombre)
    })
    return Array.from(set).sort()
  }, [activos])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DISPONIBLE': return <Badge className="bg-green-500 hover:bg-green-600">DISPONIBLE</Badge>
      case 'ASIGNADO': return <Badge className="bg-blue-500 hover:bg-blue-600">ASIGNADO</Badge>
      case 'RESERVADO': return <Badge className="bg-yellow-500 hover:bg-yellow-600">RESERVADO</Badge>
      case 'EN_MANTENIMIENTO': return <Badge className="bg-orange-500 hover:bg-orange-600">MANTENIMIENTO</Badge>
      case 'NO_DISPONIBLE': return <Badge variant="destructive">NO DISPONIBLE</Badge>
      case 'TRANSFERIDO': return <Badge className="bg-humania-sand text-humania-blue hover:bg-humania-sand/90">TRANSFERIDO</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredActivos = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activos.filter((a: any) => {
      const modelo = a.modelos_vehiculo
      if (q) {
        const matches =
          a.codigo_interno?.toLowerCase().includes(q) ||
          modelo?.marcas_vehiculo?.nombre?.toLowerCase().includes(q) ||
          modelo?.nombre?.toLowerCase().includes(q) ||
          a.placa?.toLowerCase().includes(q) ||
          a.color?.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (tipo && modelo?.tipos_vehiculo?.nombre !== tipo) return false
      if (estado && a.estado !== estado) return false
      return true
    })
  }, [activos, search, tipo, estado])

  const hayFiltrosActivos = !!(search.trim() || tipo || estado)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código, marca, modelo, placa o color..."
          className="max-w-sm rounded-none border-neutral-300 h-10"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Tipo: Todos</option>
          {tiposDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Estado: Todos</option>
          {Object.entries(ESTADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        {hayFiltrosActivos && (
          <>
            <span className="text-xs text-humania-gray/70">
              {filteredActivos.length} resultado{filteredActivos.length === 1 ? '' : 's'} encontrado{filteredActivos.length === 1 ? '' : 's'}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(''); setTipo(''); setEstado('') }}>
              Limpiar filtros
            </Button>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead className="w-24">Imagen</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Vehículo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado Actual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredActivos.map((activo: any) => {
              const modelo = activo.modelos_vehiculo
              return (
                <TableRow key={activo.id}>
                  <TableCell>
                    <div className="w-16 h-10 bg-neutral-100 rounded flex items-center justify-center overflow-hidden">
                      {activo.imagenResuelta ? (
                        <img
                          src={activo.imagenResuelta}
                          alt="Activo"
                          className="w-full h-full object-cover mix-blend-multiply"
                        />
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-medium uppercase">Sin Img</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-humania-blue">
                    {activo.codigo_interno}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-humania-blue">{modelo?.marcas_vehiculo?.nombre} {modelo?.nombre}</div>
                  </TableCell>
                  <TableCell className="text-sm text-humania-gray">
                    {modelo?.tipos_vehiculo?.nombre}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(activo.estado)}
                  </TableCell>
                  <TableCell className="text-right">
                    {activo.estado === 'TRANSFERIDO' ? null : (
                      <Link href={`/admin/activos/${activo.id}/editar`}>
                        <Button variant="outline" size="sm" className="rounded-sm">
                          {activo.estado === 'ASIGNADO' ? 'Ver Detalle' : 'Editar Estado'}
                        </Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}

            {activos.length > 0 && filteredActivos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-neutral-500">
                  No se encontraron activos que coincidan con la búsqueda o los filtros aplicados.
                </TableCell>
              </TableRow>
            )}

            {(!activos || activos.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-neutral-500">
                  No hay activos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
