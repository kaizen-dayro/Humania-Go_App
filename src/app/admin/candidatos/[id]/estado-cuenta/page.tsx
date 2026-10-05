// KAI-127 — Estado de cuenta del conductor (SDD `estado-cuenta-conductor`).
//
// - Documento para entregar al conductor (D1): no muestra datos internos (R3):
//   observaciones, quién registró, correcciones, comprobantes ni la finalidad
//   del depósito.
// - Solo lectura (R2): mismos datos que la ficha y `calcularPlazo` para el
//   resumen. Acumulado para la compra y saldo con `calcularCompra` (KAI-128,
//   migración 00083), solo si el contrato tiene sus valores de compra.
// - El PDF lo genera el navegador con "Guardar como PDF" (D5).

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { fechaHoyBogota, formatearFechaAdmin, formatearSoloFecha } from '@/lib/format'
import { calcularPlazo, type TipoPagoSemanal } from '@/lib/domain/contrato/plazo'
import { calcularCompra } from '@/lib/domain/contrato/compra'
import { filtrarEstadoCuenta, type AbonoEstadoCuenta, type PagoEstadoCuenta } from '@/lib/domain/contrato/estadoCuenta'
import { BotonImprimir } from './BotonImprimir'

const ETIQUETA_TIPO: Record<TipoPagoSemanal, string> = {
  NORMAL: 'Ordinaria',
  APLAZATORIA: 'Aplazatoria',
  NO_PAGO: 'Sin pago',
}

const pesos = (valor: number) => `$${valor.toLocaleString('es-CO')}`

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid-page">
      <h2 className="text-xs font-bold text-humania-gray/60 tracking-widest uppercase border-b border-neutral-200 pb-2 mb-3">{titulo}</h2>
      {children}
    </section>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] text-humania-gray/60 font-bold tracking-widest uppercase">{etiqueta}</p>
      <p className="text-sm font-medium text-humania-blue">{valor}</p>
    </div>
  )
}

function Aviso({ texto, idCandidato }: { texto: string; idCandidato: string }) {
  return (
    <div className="max-w-3xl mx-auto bg-white border border-neutral-200 rounded-lg shadow-sm p-8 text-center space-y-4">
      <p className="text-humania-gray">{texto}</p>
      <Link href={`/admin/candidatos/${idCandidato}`}>
        <Button variant="outline" className="rounded-none">Volver a la ficha</Button>
      </Link>
    </div>
  )
}

export default async function EstadoCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: candidato } = await supabase
    .from('candidatos')
    .select(`
      id, nombres, apellidos, tipo_documento, numero_documento, estado, estatus_contractual,
      activos ( placa, color, modelos_vehiculo ( nombre, marcas_vehiculo ( nombre ) ) )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!candidato) return <Aviso texto="Candidato no encontrado." idCandidato={id} />

  const { data: asignacion, error: errAsignacion } = await supabase
    .from('asset_assignment_history')
    .select('id, fecha_asignacion, semanas_pactadas, valor_venta, aporte_ahorro_semanal, aporte_bono_semanal')
    .eq('candidato_id', id)
    .order('fecha_asignacion', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errAsignacion) {
    console.error('Error cargando el contrato para el estado de cuenta:', errAsignacion)
    return <Aviso texto={`No se pudo cargar el estado de cuenta: ${errAsignacion.message}`} idCandidato={id} />
  }

  // R1: solo SELECCIONADO con activo y una asignación registrada.
  if (candidato.estado !== 'SELECCIONADO' || !candidato.estatus_contractual || !asignacion) {
    return <Aviso texto="El estado de cuenta solo está disponible para candidatos seleccionados con un vehículo asignado." idCandidato={id} />
  }

  const [{ data: pagosData, error: errPagos }, { data: abonosData, error: errAbonos }, { data: deposito, error: errDeposito }] = await Promise.all([
    supabase
      .from('pagos_semanales')
      .select('numero_semana, tipo_pago, monto_pagado, fecha_pago')
      .eq('asset_assignment_history_id', asignacion.id)
      .order('numero_semana', { ascending: true }),
    supabase
      .from('abonos_extraordinarios')
      .select('fecha_abono, valor_abono')
      .eq('asset_assignment_history_id', asignacion.id)
      .order('fecha_abono', { ascending: true }),
    supabase
      .from('depositos_contrato')
      .select('valor, fecha_pago')
      .eq('asset_assignment_history_id', asignacion.id)
      .maybeSingle(),
  ])

  const errorCarga = errPagos || errAbonos || errDeposito
  if (errorCarga) {
    console.error('Error cargando el estado de cuenta:', errorCarga)
    return <Aviso texto={`No se pudo cargar el estado de cuenta: ${errorCarga.message}`} idCandidato={id} />
  }

  const pagos = (pagosData ?? []) as PagoEstadoCuenta[]
  const abonos = (abonosData ?? []) as AbonoEstadoCuenta[]

  // R5: rango por defecto desde la entrega hasta hoy (Bogotá).
  const {
    entrega, desde, hasta, rangoInvalido,
    pagos: pagosPeriodo, abonos: abonosPeriodo, totalPagos, totalAbonos,
  } = filtrarEstadoCuenta({ fechaAsignacion: asignacion.fecha_asignacion, hoy: fechaHoyBogota(), desde: sp.desde, hasta: sp.hasta, pagos, abonos })

  // R6: resumen del contrato a la fecha (no del rango).
  const plazo = calcularPlazo({ semanasPactadas: asignacion.semanas_pactadas, fechaAsignacion: asignacion.fecha_asignacion, pagos })

  // KAI-128: acumulado para la compra y saldo, a la fecha (todos los abonos, no solo los del rango).
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const compra = calcularCompra({
    valorVenta: num(asignacion.valor_venta),
    aporteAhorroSemanal: num(asignacion.aporte_ahorro_semanal),
    aporteBonoSemanal: num(asignacion.aporte_bono_semanal),
    ordinariasPagadas: plazo.ordinariasPagadas,
    totalAbonos: abonos.reduce((s, a) => s + Number(a.valor_abono || 0), 0),
  })

  const activo = candidato.activos as unknown as { placa: string | null; color: string | null; modelos_vehiculo: { nombre: string | null; marcas_vehiculo: { nombre: string | null } | null } | null } | null
  const vehiculo = [activo?.modelos_vehiculo?.marcas_vehiculo?.nombre, activo?.modelos_vehiculo?.nombre].filter(Boolean).join(' ') || 'No especificado'
  const nombre = `${candidato.nombres ?? ''} ${candidato.apellidos ?? ''}`.trim()

  return (
    <div className="max-w-3xl mx-auto print:max-w-none">
      {/* Controles (no se imprimen) */}
      <div className="print:hidden mb-6 bg-white border border-neutral-200 rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/admin/candidatos/${id}`}>
            <Button variant="ghost" size="sm" className="text-humania-gray hover:text-humania-blue -ml-3">&larr; Volver a la ficha</Button>
          </Link>
          <BotonImprimir />
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-humania-gray space-y-1">
            <span className="block text-[11px] font-bold tracking-widest uppercase">Desde</span>
            <input type="date" name="desde" defaultValue={desde} className="border border-neutral-300 rounded-none px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm text-humania-gray space-y-1">
            <span className="block text-[11px] font-bold tracking-widest uppercase">Hasta</span>
            <input type="date" name="hasta" defaultValue={hasta} className="border border-neutral-300 rounded-none px-2 py-1.5 text-sm" />
          </label>
          <Button type="submit" variant="outline" className="rounded-none">Aplicar</Button>
        </form>
        {rangoInvalido && (
          <p className="text-sm text-amber-700">La fecha &quot;Desde&quot; es posterior a &quot;Hasta&quot;; se muestra el periodo completo del contrato.</p>
        )}
      </div>

      {/* Documento */}
      <article className="bg-white border border-neutral-200 rounded-lg shadow-sm p-8 md:p-10 print:border-0 print:shadow-none print:rounded-none print:p-0 text-humania-gray">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-humania-sand pb-5">
          <div>
            <p className="text-sm font-bold tracking-widest text-humania-blue">HUMANIA GO</p>
            <h1 className="text-3xl font-bold text-humania-blue mt-1">Estado de cuenta</h1>
            <p className="text-sm mt-1">Contrato de arrendamiento con opción de compra</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-[11px] font-bold tracking-widest uppercase text-humania-gray/60">Generado</p>
            <p>{formatearFechaAdmin(new Date())}</p>
          </div>
        </header>

        <Bloque titulo="Conductor">
          <div className="grid grid-cols-2 gap-4">
            <Dato etiqueta="Nombre" valor={nombre || 'No especificado'} />
            <Dato etiqueta="Documento" valor={`${candidato.tipo_documento ?? ''} ${candidato.numero_documento ?? ''}`.trim() || 'No especificado'} />
          </div>
        </Bloque>

        <Bloque titulo="Vehículo">
          <div className="grid grid-cols-3 gap-4">
            <Dato etiqueta="Vehículo" valor={vehiculo} />
            <Dato etiqueta="Placa" valor={activo?.placa || 'No especificado'} />
            <Dato etiqueta="Fecha de entrega" valor={formatearSoloFecha(entrega) ?? 'No especificado'} />
          </div>
        </Bloque>

        <Bloque titulo="Periodo">
          <p className="text-sm">Del {formatearSoloFecha(desde)} al {formatearSoloFecha(hasta)}</p>
        </Bloque>

        <Bloque titulo="Resumen del contrato a la fecha">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Dato
              etiqueta="Semanas cumplidas"
              valor={asignacion.semanas_pactadas ? `${plazo.ordinariasPagadas} de ${asignacion.semanas_pactadas}` : String(plazo.ordinariasPagadas)}
            />
            <Dato etiqueta="Semanas aplazatorias" valor={String(plazo.aplazatorias)} />
            <Dato etiqueta="Semanas sin pago" valor={String(plazo.sinPago)} />
            {plazo.restantes !== null && <Dato etiqueta="Semanas por cumplir" valor={String(plazo.restantes)} />}
            {plazo.fechaEstimadaFin && <Dato etiqueta="Finalización estimada" valor={formatearSoloFecha(plazo.fechaEstimadaFin) ?? ''} />}
          </div>
        </Bloque>

        {compra && (
          <Bloque titulo="Compra del vehículo a la fecha">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Dato etiqueta="Valor de venta" valor={pesos(compra.valorVenta)} />
              <Dato etiqueta="Acumulado para la compra" valor={pesos(compra.acumulado)} />
              <Dato etiqueta="Saldo del valor de venta" valor={pesos(compra.saldo)} />
              <Dato etiqueta="Ahorro acumulado" valor={pesos(compra.acumuladoAhorro)} />
              <Dato etiqueta="Bono contractual acumulado" valor={pesos(compra.acumuladoBono)} />
              <Dato etiqueta="Abonos extraordinarios" valor={pesos(compra.abonos)} />
            </div>
            <p className="text-xs text-humania-gray/70 mt-3">
              El acumulado suma las semanas ordinarias pagadas y los abonos extraordinarios. El bono contractual de compra solo se reconoce si se cumple el contrato y no se devuelve si el contrato termina sin compra; el ahorro sí se liquida a tu favor en ese caso.
            </p>
          </Bloque>
        )}

        <Bloque titulo="Pagos semanales">
          {pagosPeriodo.length === 0 ? (
            <p className="text-sm text-humania-gray/70">No hay pagos registrados en este periodo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-widest uppercase text-humania-gray/60 border-b border-neutral-200">
                  <th className="py-2 pr-3 font-bold">Semana</th>
                  <th className="py-2 pr-3 font-bold">Fecha de pago</th>
                  <th className="py-2 pr-3 font-bold">Tipo</th>
                  <th className="py-2 font-bold text-right">Valor pagado</th>
                </tr>
              </thead>
              <tbody>
                {pagosPeriodo.map(p => (
                  <tr key={p.numero_semana} className="border-b border-neutral-100 break-inside-avoid">
                    <td className="py-1.5 pr-3 font-semibold">{p.numero_semana}</td>
                    <td className="py-1.5 pr-3">{p.fecha_pago ? formatearSoloFecha(p.fecha) : '—'}</td>
                    <td className="py-1.5 pr-3">{ETIQUETA_TIPO[p.tipo_pago]}</td>
                    <td className="py-1.5 text-right tabular-nums">{pesos(Number(p.monto_pagado || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-humania-blue">
                  <td className="pt-2 pr-3" colSpan={3}>Total pagado en el periodo</td>
                  <td className="pt-2 text-right tabular-nums">{pesos(totalPagos)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Bloque>

        <Bloque titulo="Abonos extraordinarios">
          {abonosPeriodo.length === 0 ? (
            <p className="text-sm text-humania-gray/70">No hay abonos extraordinarios en este periodo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-widest uppercase text-humania-gray/60 border-b border-neutral-200">
                  <th className="py-2 pr-3 font-bold">Fecha</th>
                  <th className="py-2 font-bold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {abonosPeriodo.map((a, i) => (
                  <tr key={i} className="border-b border-neutral-100 break-inside-avoid">
                    <td className="py-1.5 pr-3">{formatearSoloFecha(a.fecha)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pesos(Number(a.valor_abono || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-humania-blue">
                  <td className="pt-2 pr-3">Total de abonos en el periodo</td>
                  <td className="pt-2 text-right tabular-nums">{pesos(totalAbonos)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Bloque>

        <Bloque titulo="Depósito inicial">
          {deposito ? (
            <div className="grid grid-cols-2 gap-4">
              <Dato etiqueta="Valor" valor={pesos(Number(deposito.valor || 0))} />
              <Dato etiqueta="Fecha de pago" valor={formatearSoloFecha(deposito.fecha_pago) ?? 'No especificado'} />
            </div>
          ) : (
            <p className="text-sm text-humania-gray/70">No hay depósito inicial registrado.</p>
          )}
        </Bloque>

        <p className="mt-10 pt-4 border-t border-neutral-200 text-xs text-humania-gray/70">
          Este estado de cuenta se generó con los registros vigentes a la fecha de generación. Si encuentras alguna diferencia, comunícate con nosotros.
        </p>
      </article>
    </div>
  )
}
