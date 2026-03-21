'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')

    if (code) {
      // PKCE flow: code → session (브라우저에서 처리 → 쿠키 자동 저장)
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError(error.message)
        } else {
          router.replace('/')
          router.refresh()
        }
      })
    } else {
      // Implicit flow: URL 해시에 토큰이 있는 경우 (onAuthStateChange가 자동 처리)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/')
          router.refresh()
        } else {
          // 세션이 없으면 잠시 기다린 후 재확인 (해시 처리 지연)
          setTimeout(() => {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session) {
                router.replace('/')
              } else {
                router.replace('/auth/login')
              }
              router.refresh()
            })
          }, 1000)
        }
      })
    }
  }, [router, searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <p className="text-red-500 mb-4">인증 오류: {error}</p>
          <a href="/auth/login" className="text-orange-500 hover:underline text-sm">
            로그인 페이지로
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">인증 처리 중...</p>
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  )
}
