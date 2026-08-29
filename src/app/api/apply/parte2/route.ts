import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ApplicationPart2PayloadSchema } from '@/lib/domain/eligibility'

// Endpoint de la Parte 2 de /apply (KAI-9/KAI-14, 2026-08-27): Fiador +
// Referencias, solo accesible con el candidato_id + token que RRHH le
// entrega manualmente al candidato después de la entrevista humana ("Apto,
// esperando Parte 2"). Espejo de /api/apply/route.ts, pero sin los filtros
// de edad/comparendos (ya se resolvieron en la Parte 1).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  const requestId = randomUUID()

  try {
    const body = await req.json()

    const parsed = ApplicationPart2PayloadSchema.safeParse(body)
    if (!parsed.success) {
      const primerError = parsed.error.issues[0]
      return NextResponse.json({
        success: false,
        error: "VALIDATION_ERROR",
        message: primerError ? `${primerError.path.join('.')}: ${primerError.message}` : "Revisa los datos ingresados.",
        details: parsed.error.format()
      }, { status: 400 })
    }

    const data = parsed.data

    const { error: rpcError } = await supabaseAdmin.rpc('submit_application_parte2', {
      p_candidato_id: data.candidato_id,
      p_token: data.token,
      p_fiador: {
        nombre_completo: data.fiador.nombre_completo,
        numero_documento: data.fiador.numero_documento,
        telefono: data.fiador.telefono,
        ingresos_mensuales_aprox: data.fiador.ingresos_mensuales_aprox,
        tiene_finca_raiz: data.fiador.tiene_finca_raiz
      },
      p_referencias: data.referencias,
      p_referencia_laboral: {
        contacto_nombre: data.referenciaLaboral.contacto_nombre,
        contacto_empresa: data.referenciaLaboral.contacto_empresa,
        contacto_cargo: data.referenciaLaboral.contacto_cargo,
        contacto_relacion: data.referenciaLaboral.contacto_relacion,
        contacto_telefono: data.referenciaLaboral.contacto_telefono
      },
      p_autorizacion: {
        policy_version: data.policyVersion,
        authorized: data.dataAuthorization,
        authorization_channel: 'WEB_APPLY_PARTE2',
        request_id: requestId
      }
    })

    if (rpcError) {
      console.error(`RPC Error (Parte 2) [request_id=${requestId}]:`, rpcError)

      if (rpcError.message.includes('CANDIDATO_NO_EXISTE') || rpcError.message.includes('TOKEN_INVALIDO')) {
        return NextResponse.json({
          success: false,
          error: "TOKEN_INVALIDO",
          message: "Este enlace no es válido. Verifica que lo copiaste completo, o comunícate con nuestro equipo."
        }, { status: 400 })
      }
      if (rpcError.message.includes('CANDIDATO_DESCARTADO')) {
        return NextResponse.json({
          success: false,
          error: "CANDIDATO_DESCARTADO",
          message: "Este proceso ya no está activo. Si tienes dudas, comunícate con nuestro equipo."
        }, { status: 400 })
      }
      if (rpcError.message.includes('PARTE2_YA_ENVIADA')) {
        return NextResponse.json({
          success: false,
          error: "PARTE2_YA_ENVIADA",
          message: "Ya recibimos esta información anteriormente. Si crees que esto es un error, comunícate con nuestro equipo."
        }, { status: 409 })
      }
      if (rpcError.message.includes('AUTORIZACION_REQUERIDA') || rpcError.message.includes('VERSION_POLITICA_INVALIDA')) {
        return NextResponse.json({
          success: false,
          error: "AUTHORIZATION_REQUIRED",
          message: "Para enviar tu información debes leer la Política de Tratamiento de Datos Personales y autorizar expresamente el tratamiento de tus datos."
        }, { status: 400 })
      }
      return NextResponse.json({
        success: false,
        error: "DATABASE_ERROR",
        message: "Ocurrió un error al guardar tu información. Intenta más tarde."
      }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })

  } catch (err) {
    console.error("Unhandled API Error (Parte 2):", err)
    return NextResponse.json({
      success: false,
      error: "SERVER_ERROR",
      message: "Ocurrió un error inesperado."
    }, { status: 500 })
  }
}
