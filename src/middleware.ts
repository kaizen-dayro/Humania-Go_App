import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Fase 16: captura el parametro ?perfil= del enlace del anuncio (Facebook,
// Instagram, TikTok, YouTube Ads) en cualquier pagina del sitio -- no solo
// la portada, por si algun dia una campana apunta directo a /presentacion
// o a otra ruta. Se guarda en una cookie de 48h para que el perfil se
// recuerde aunque la persona navegue varias paginas antes de llegar a
// /presentacion. No toca la base de datos (corre en el borde, en cada
// solicitud, tiene que ser liviano).
const SLUG_A_PERFIL: Record<string, string> = {
  conductor: 'CONDUCTOR',
  independiente: 'INDEPENDIENTE',
}

const COOKIE_NAME = 'humania_perfil'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 48 // 48 horas

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const slug = request.nextUrl.searchParams.get('perfil')
  const perfil = slug ? SLUG_A_PERFIL[slug.toLowerCase()] : undefined

  if (perfil) {
    response.cookies.set(COOKIE_NAME, perfil, {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
