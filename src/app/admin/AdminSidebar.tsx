'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutDashboard, Users, Car, Tag, Layers, ShieldCheck, LogOut, PlayCircle, MapPin, Menu, X } from 'lucide-react'

/**
 * Menú lateral del panel administrativo. Antes vivía embebido directo en
 * admin/layout.tsx como un <aside> siempre fijo de 256px -- en celular
 * (QA, 2026-08-25) eso dejaba casi toda la pantalla ocupada por el menú,
 * sin espacio real para ver ningún módulo. Se extrae a un componente
 * cliente aparte porque necesita estado (abierto/cerrado) que
 * admin/layout.tsx, un Server Component, no puede tener.
 *
 * Desktop (md+): exactamente el mismo comportamiento de siempre, fijo y
 * siempre visible. Celular: oculto por defecto, se abre como un panel
 * lateral (drawer) con una barra superior + botón de menú.
 */
export function AdminSidebar({ esSuperAdmin }: { esSuperAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const cerrar = () => setOpen(false)

  return (
    <>
      {/* Barra superior -- solo en celular, reemplaza el logo que en escritorio va dentro del sidebar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-humania-blue text-white flex items-center justify-between px-4 z-40">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" className="p-2 -ml-2">
          <Menu className="w-6 h-6" />
        </button>
        <Link href="/admin" className="text-lg font-bold tracking-tight" onClick={cerrar}>
          Humania <span className="font-normal text-humania-sand">Go</span>
        </Link>
        <span className="w-10" aria-hidden="true" />
      </div>

      {/* Fondo oscuro detrás del menú abierto -- solo en celular */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={cerrar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 bg-humania-blue text-white flex flex-col fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/10">
          <Link href="/admin" className="text-xl font-bold tracking-tight" onClick={cerrar}>
            Humania <span className="font-normal text-humania-sand">Go</span>
          </Link>
          <button type="button" onClick={cerrar} aria-label="Cerrar menú" className="md:hidden p-1 -mr-1 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <Link href="/admin" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <LayoutDashboard className="w-5 h-5 text-humania-sand" />
            Dashboard
          </Link>
          <Link href="/admin/candidatos" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Users className="w-5 h-5 text-humania-sand" />
            Candidatos
          </Link>
          <Link href="/admin/activos" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Car className="w-5 h-5 text-humania-sand" />
            Activos
          </Link>
          <Link href="/admin/marcas" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Tag className="w-5 h-5 text-humania-sand" />
            Marcas
          </Link>
          <Link href="/admin/modelos" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Layers className="w-5 h-5 text-humania-sand" />
            Modelos
          </Link>
          {esSuperAdmin && (
            <Link href="/admin/administradores" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
              <ShieldCheck className="w-5 h-5 text-humania-sand" />
              Administradores
            </Link>
          )}
          {esSuperAdmin && (
            <Link href="/admin/ciudades" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
              <MapPin className="w-5 h-5 text-humania-sand" />
              Ciudades
            </Link>
          )}
          {esSuperAdmin && (
            <Link href="/admin/presentacion" onClick={cerrar} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
              <PlayCircle className="w-5 h-5 text-humania-sand" />
              Video de presentación
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <form action="/auth/signout" method="post">
            <button className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium text-white/80 hover:text-white">
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
