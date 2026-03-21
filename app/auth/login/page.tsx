'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed': '이메일 인증이 완료되지 않았습니다. 아래 버튼으로 재전송하세요.',
  'User not found': '등록되지 않은 이메일입니다.',
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const isUnconfirmed = error.includes('인증이 완료되지 않았습니다')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(ERROR_MESSAGES[error.message] ?? error.message)
        return
      }
      const redirectTo = searchParams.get('redirectTo') || '/'
      router.replace(redirectTo)
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendEmail() {
    if (!email) {
      setError('이메일을 먼저 입력해주세요.')
      return
    }
    setResendLoading(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setResendLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setResendSent(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          이메일
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="example@email.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="space-y-2">
          <p className="text-red-500 text-sm">{error}</p>
          {isUnconfirmed && !resendSent && (
            <button
              type="button"
              onClick={handleResendEmail}
              disabled={resendLoading}
              className="text-sm text-orange-500 hover:underline disabled:opacity-50"
            >
              {resendLoading ? '전송 중...' : '인증 이메일 재전송'}
            </button>
          )}
          {resendSent && (
            <p className="text-green-600 text-sm">인증 이메일을 재전송했습니다. 받은편지함을 확인해주세요.</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
      >
        {loading ? '로그인 중...' : '로그인'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-orange-500">Gaemini</h1>
          <p className="text-gray-500 mt-1 text-sm">AI 기반 주식 투자 비서</p>
        </div>

        <Suspense fallback={<div className="text-center text-sm text-gray-400">로딩 중...</div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-gray-500 mt-6">
          계정이 없으신가요?{' '}
          <Link href="/auth/signup" className="text-orange-500 hover:underline font-medium">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
