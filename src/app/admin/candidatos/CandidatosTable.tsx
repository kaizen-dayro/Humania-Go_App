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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { BulkStatusModal } from './BulkStatusModal'
import { Download } from 'lucide-react'
import writeExcelFile from 'write-excel-file/universal'

const GENEROS: Record<string, string> = {
  MASCULINO: 'Masculino',
  FEMENINO: 'Femenino',
  OTRO: 'Otro',
  PREFIERO_NO_DECIR: 'Prefiero no decir',
}

const TIPOS_PERFIL: Record<string, string> = {
  CONDUCTOR_PLATAFORMA: 'Conductor de Plataforma',
  EMPLEADO: 'Empleado',
}

const ESTATUS_CONTRACTUALES: Record<string, string> = {
  ACTIVO: 'Activo',
  'INCUMPLIÓ CONTRATO': 'Incumplió contrato',
  'TERMINACIÓN POR MUTUO ACUERDO': 'Terminación por mutuo acuerdo',
  'FINALIZÓ CONTRATO EXITOSAMENTE': 'Finalizó contrato exitosamente',
}

type ActivoFiltro = { id: string, label: string }

export function CandidatosTable({
  candidatos,
  currentFilter,
  activosParaFiltro
}: {
  candidatos: any[],
  currentFilter: string,
  activosParaFiltro: ActivoFiltro[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [exportando, setExportando] = useState(false)

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [genero, setGenero] = useState(searchParams.get('genero') || '')
  const [tipoPerfil, setTipoPerfil] = useState(searchParams.get('perfil') || '')
  const [estatusContractual, setEstatusContractual] = useState(searchParams.get('estatus_contractual') || '')
  const [activoId, setActivoId] = useState(searchParams.get('activo_id') || '')

  // Sincroniza los filtros con la URL (compartible/recargable), sin perder el filtro de estado.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search.trim()) { params.set('q', search.trim()) } else { params.delete('q') }
      if (genero) { params.set('genero', genero) } else { params.delete('genero') }
      if (tipoPerfil) { params.set('perfil', tipoPerfil) } else { params.delete('perfil') }
      if (estatusContractual) { params.set('estatus_contractual', estatusContractual) } else { params.delete('estatus_contractual') }
      if (activoId) { params.set('activo_id', activoId) } else { params.delete('activo_id') }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, genero, tipoPerfil, estatusContractual, activoId])

  // Construye el href de los botones de Estado preservando busqueda/filtros activos.
  const hrefEstado = (estado: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (estado) { params.set('estado', estado) } else { params.delete('estado') }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // Href hacia el detalle de un candidato, llevando consigo la busqueda/
  // filtros/estado actuales (codificados en `volverA`) para que el
  // boton "Volver" del detalle regrese exactamente a esta misma vista
  // filtrada, en vez de siempre a /admin/candidatos sin filtros.
  const hrefDetalle = (candidatoId: string) => {
    const qsActual = searchParams.toString()
    return qsActual ? `/admin/candidatos/${candidatoId}?volverA=${encodeURIComponent(qsActual)}` : `/admin/candidatos/${candidatoId}`
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectedCandidatos = candidatos
    .filter(c => selectedIds.includes(c.id))
    .map(c => ({ id: c.id, estado: c.estado }))

  const handleCompare = () => {
    if (selectedIds.length < 2) {
      alert("Selecciona al menos 2 candidatos para comparar.")
      return
    }
    const query = selectedIds.map(id => `id=${id}`).join('&')
    router.push(`/admin/candidatos/comparar?${query}`)
  }

  const getStatusBadge = (status: string, estatusContractualValor?: string | null) => {
    switch (status) {
      case 'DESCARTADO': return <Badge variant="destructive">Descartado</Badge>
      case 'REVISION_PRELIMINAR': return <Badge className="bg-yellow-500 hover:bg-yellow-600">Revisión</Badge>
      case 'ENTREVISTA': return <Badge className="bg-blue-500 hover:bg-blue-600">Entrevista</Badge>
      case 'BACKUP': return <Badge className="bg-neutral-500 hover:bg-neutral-600">Backup</Badge>
      case 'DESISTE': return <Badge className="bg-amber-200 text-humania-blue hover:bg-amber-300">Desiste</Badge>
      case 'SELECCIONADO':
        if (estatusContractualValor === 'INCUMPLIÓ CONTRATO' || estatusContractualValor === 'TERMINACIÓN POR MUTUO ACUERDO') {
          return <Badge className="bg-neutral-200 text-humania-gray hover:bg-neutral-300">Seleccionado</Badge>
        }
        if (estatusContractualValor === 'FINALIZÓ CONTRATO EXITOSAMENTE') {
          return <Badge className="bg-green-200 text-green-800 hover:bg-green-300">Seleccionado</Badge>
        }
        if (!estatusContractualValor) {
          return (
            <div className="flex flex-col gap-1 items-start">
              <Badge className="bg-humania-blue hover:bg-humania-blue/90">Seleccionado</Badge>
              <span className="text-[9px] font-bold text-humania-gray/50 tracking-widest uppercase">Sin activo</span>
            </div>
          )
        }
        return <Badge className="bg-humania-blue hover:bg-humania-blue/90">Seleccionado</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  // KAI-38 (2026-09-16): badge adicional, independiente del badge de
  // estado -- no es un estado nuevo, es una marca aparte (ver
  // Documentos/SDD/revision-manual-comparendos/). Solo se muestra
  // mientras está PENDIENTE (ya resuelto no necesita destacarse en la
  // lista, el detalle del candidato sigue mostrando el historial).
  const getComparendosPendienteBadge = (requiereRevision: boolean, resultado: string | null) => {
    if (!requiereRevision || resultado) return null
    return <Badge className="bg-amber-500 hover:bg-amber-600">⚠ Revisar comparendos</Badge>
  }

  const filteredCandidatos = useMemo(() => {
    const q = search.trim().toLowerCase()
    return candidatos.filter(c => {
      if (q) {
        const matches =
          c.nombres?.toLowerCase().includes(q) ||
          c.apellidos?.toLowerCase().includes(q) ||
          c.numero_documento?.toLowerCase().includes(q) ||
          c.correo_electronico?.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (genero && c.genero !== genero) return false
      if (tipoPerfil && c.tipo_perfil !== tipoPerfil) return false
      if (estatusContractual) {
        if (estatusContractual === 'SIN_ESTATUS' ? !!c.estatus_contractual : c.estatus_contractual !== estatusContractual) return false
      }
      if (activoId && c.activo_id !== activoId) return false
      return true
    })
  }, [candidatos, search, genero, tipoPerfil, estatusContractual, activoId])

  const hayFiltrosActivos = !!(search.trim() || genero || tipoPerfil || estatusContractual || activoId)

  // Exporta exactamente los candidatos visibles con los filtros actuales
  // (busqueda + filtros avanzados + pestana de estado, ya combinados en
  // filteredCandidatos arriba) -- pedido explicito para el proceso
  // interno de actualizar datos durante entrevistas y otros usos con
  // Excel. write-excel-file/universal (sin Web Workers, a diferencia de
  // la variante /browser) para no complicar el bundling de Next.js --
  // solo necesitamos un Blob, la descarga se dispara a mano.
  const handleExportarExcel = async () => {
    if (filteredCandidatos.length === 0) return
    setExportando(true)
    try {
      const encabezados = [
        'Nombres', 'Apellidos', 'Documento', 'Correo', 'Telefono', 'Genero', 'Perfil',
        'Ciudad', 'Municipio', 'Barrio', 'Estado', 'Estatus Contractual', 'Fecha de Postulacion',
      ]

      const filas = filteredCandidatos.map(c => [
        { value: c.nombres || '' },
        { value: c.apellidos || '' },
        { value: c.numero_documento || '' },
        { value: c.correo_electronico || '' },
        { value: c.telefono || '' },
        { value: GENEROS[c.genero] || c.genero || '' },
        { value: TIPOS_PERFIL[c.tipo_perfil] || c.tipo_perfil || '' },
        { value: c.ciudades_operacion?.nombre_oficial || '' },
        { value: c.municipios_operacion?.nombre_oficial || '' },
        { value: c.barrio || '' },
        { value: c.estado || '' },
        { value: ESTATUS_CONTRACTUALES[c.estatus_contractual] || c.estatus_contractual || '' },
        { value: c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : '' },
      ])

      const encabezado = encabezados.map(texto => ({ value: texto, fontWeight: 'bold' as const }))
      const blob = await writeExcelFile([encabezado, ...filas]).toBlob()

      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `candidatos_humania_go_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      URL.revokeObjectURL(url)
    } finally {
      setExportando(false)
    }
  }

  const idsResultadoActual = filteredCandidatos.map(c => c.id)
  const todosSeleccionados = idsResultadoActual.length > 0 && idsResultadoActual.every(id => selectedIds.includes(id))
  const algunosSeleccionados = idsResultadoActual.some(id => selectedIds.includes(id)) && !todosSeleccionados

  const toggleSelectAll = () => {
    if (todosSeleccionados) {
      setSelectedIds(prev => prev.filter(id => !idsResultadoActual.includes(id)))
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...idsResultadoActual])])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b pb-4">
        <Link href={hrefEstado(null)}>
          <Button variant={!currentFilter ? 'default' : 'outline'} size="sm" className={!currentFilter ? 'bg-humania-blue' : ''}>Todos</Button>
        </Link>
        <Link href={hrefEstado('REVISION_PRELIMINAR')}>
          <Button variant={currentFilter === 'REVISION_PRELIMINAR' ? 'default' : 'outline'} size="sm" className={currentFilter === 'REVISION_PRELIMINAR' ? 'bg-humania-blue' : ''}>En revisión</Button>
        </Link>
        <Link href={hrefEstado('ENTREVISTA')}>
          <Button variant={currentFilter === 'ENTREVISTA' ? 'default' : 'outline'} size="sm" className={currentFilter === 'ENTREVISTA' ? 'bg-humania-blue' : ''}>Entrevista</Button>
        </Link>
        <Link href={hrefEstado('BACKUP')}>
          <Button variant={currentFilter === 'BACKUP' ? 'default' : 'outline'} size="sm" className={currentFilter === 'BACKUP' ? 'bg-humania-blue' : ''}>Backup</Button>
        </Link>
        <Link href={hrefEstado('DESISTE')}>
          <Button variant={currentFilter === 'DESISTE' ? 'default' : 'outline'} size="sm" className={currentFilter === 'DESISTE' ? 'bg-humania-blue' : ''}>Desiste</Button>
        </Link>
        <Link href={hrefEstado('SELECCIONADO')}>
          <Button variant={currentFilter === 'SELECCIONADO' ? 'default' : 'outline'} size="sm" className={currentFilter === 'SELECCIONADO' ? 'bg-humania-blue' : ''}>Seleccionado</Button>
        </Link>

        <div className="ml-auto flex gap-2">
          <Button
            onClick={handleCompare}
            disabled={selectedIds.length < 2}
            className="bg-humania-blue hover:bg-humania-blue/90"
          >
            Comparar ({selectedIds.length})
          </Button>
          <BulkStatusModal selectedCandidatos={selectedCandidatos} onSuccess={() => setSelectedIds([])} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido, documento o correo..."
            className="max-w-sm rounded-none border-neutral-300 h-10"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMostrarFiltros(v => !v)}
          >
            {mostrarFiltros ? 'Ocultar filtros avanzados' : 'Filtros avanzados'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarExcel}
            disabled={exportando || filteredCandidatos.length === 0}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            {exportando ? 'Exportando...' : `Exportar a Excel (${filteredCandidatos.length})`}
          </Button>
          {hayFiltrosActivos && (
            <span className="text-xs text-humania-gray/70">
              {filteredCandidatos.length} resultado{filteredCandidatos.length === 1 ? '' : 's'} encontrado{filteredCandidatos.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {mostrarFiltros && (
          <div className="flex flex-wrap gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
            <select
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
              className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
            >
              <option value="">Género: Todos</option>
              {Object.entries(GENEROS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>

            <select
              value={tipoPerfil}
              onChange={(e) => setTipoPerfil(e.target.value)}
              className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
            >
              <option value="">Perfil: Todos</option>
              {Object.entries(TIPOS_PERFIL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>

            <select
              value={estatusContractual}
              onChange={(e) => setEstatusContractual(e.target.value)}
              className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
            >
              <option value="">Estatus Contractual: Todos</option>
              <option value="SIN_ESTATUS">Sin estatus</option>
              {Object.entries(ESTATUS_CONTRACTUALES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>

            <select
              value={activoId}
              onChange={(e) => setActivoId(e.target.value)}
              className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
            >
              <option value="">Activo Asignado: Todos</option>
              {activosParaFiltro.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>

            {hayFiltrosActivos && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setGenero(''); setTipoPerfil(''); setEstatusContractual(''); setActivoId('') }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Escritorio/tablet: tabla completa. Oculta en celular -- ver las tarjetas apiladas debajo. */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={todosSeleccionados}
                  indeterminate={algunosSeleccionados}
                  onCheckedChange={toggleSelectAll}
                  disabled={filteredCandidatos.length === 0}
                  aria-label="Seleccionar todos los candidatos del resultado actual"
                />
              </TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Candidato</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCandidatos?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(c.id)}
                    onCheckedChange={() => toggleSelection(c.id)}
                  />
                </TableCell>
                <TableCell className="font-medium text-neutral-600">
                  {new Date(c.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-humania-blue">{c.nombres} {c.apellidos}</div>
                  <div className="text-xs text-humania-gray">{c.numero_documento}</div>
                </TableCell>
                <TableCell className="text-sm">{c.tipo_perfil}</TableCell>
                <TableCell className="text-sm">{c.ciudades_operacion?.nombre_oficial}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 items-start">
                    {getStatusBadge(c.estado, c.estatus_contractual)}
                    {getComparendosPendienteBadge(c.comparendos_requiere_revision, c.comparendos_revision_resultado)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={hrefDetalle(c.id)} className="text-sm font-bold text-humania-blue hover:underline">
                    Ver Detalles
                  </Link>
                </TableCell>
              </TableRow>
            ))}

            {candidatos.length > 0 && filteredCandidatos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-neutral-500">
                  No se encontraron candidatos que coincidan con la búsqueda o los filtros aplicados.
                </TableCell>
              </TableRow>
            )}

            {(!candidatos || candidatos.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-neutral-500">
                  No hay candidatos registrados en esta categoría.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Celular: tarjetas apiladas en vez de la tabla -- misma información, sin scroll horizontal. */}
      <div className="md:hidden space-y-3">
        {filteredCandidatos.length > 0 && (
          <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-neutral-200 p-3">
            <Checkbox
              checked={todosSeleccionados}
              indeterminate={algunosSeleccionados}
              onCheckedChange={toggleSelectAll}
              aria-label="Seleccionar todos los candidatos del resultado actual"
            />
            <span className="text-sm text-humania-gray">Seleccionar todos ({filteredCandidatos.length})</span>
          </div>
        )}
        {filteredCandidatos?.map((c) => (
          <div key={c.id} className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Checkbox
                  checked={selectedIds.includes(c.id)}
                  onCheckedChange={() => toggleSelection(c.id)}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-medium text-humania-blue text-sm truncate">{c.nombres} {c.apellidos}</p>
                  <p className="text-xs text-humania-gray">{c.numero_documento}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 items-end">
                {getStatusBadge(c.estado, c.estatus_contractual)}
                {getComparendosPendienteBadge(c.comparendos_requiere_revision, c.comparendos_revision_resultado)}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-humania-gray pl-6">
              <span>{c.tipo_perfil}</span>
              {c.ciudades_operacion?.nombre_oficial && <span>{c.ciudades_operacion.nombre_oficial}</span>}
              <span>{new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            <div className="pl-6">
              <Link href={hrefDetalle(c.id)} className="text-sm font-bold text-humania-blue hover:underline">
                Ver Detalles
              </Link>
            </div>
          </div>
        ))}

        {candidatos.length > 0 && filteredCandidatos.length === 0 && (
          <div className="text-center py-12 text-neutral-500 bg-white rounded-lg border border-neutral-200">
            No se encontraron candidatos que coincidan con la búsqueda o los filtros aplicados.
          </div>
        )}

        {(!candidatos || candidatos.length === 0) && (
          <div className="text-center py-12 text-neutral-500 bg-white rounded-lg border border-neutral-200">
            No hay candidatos registrados en esta categoría.
          </div>
        )}
      </div>
    </div>
  )
}
