import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 인증 없이 접근 가능한 경로
const PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/auth/callback']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 공개 경로 및 내부 경로는 통과
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next()
  }

  // 모든 요청 통과 — 클라이언트 사이드에서 세션 체크
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
