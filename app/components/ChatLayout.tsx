'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'

interface Conversation {
  id: string
  title: string
  created_at: string
}

export default function ChatLayout() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [chatKey, setChatKey] = useState(0)
  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    // 세션 확인 — 비로그인 시 로그인 페이지로 이동
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/auth/login')
      } else {
        setAuthChecked(true)
        setUserId(session.user.id)
        loadConversations(session.user.id)
      }
    })

    // 로그아웃 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/auth/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  async function loadConversations(uid: string) {
    const { data } = await supabase
      .from('conversations')
      .select('id, title, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(6)  // 6개 조회해서 5개 초과 여부 판단

    if (data) {
      setHasMoreConversations(data.length > 5)
      setConversations(data.slice(0, 5))
    }
  }

  function handleNew() {
    setCurrentId(null)
    setChatKey((k) => k + 1)  // ChatArea 강제 리셋
  }

  function handleSelect(id: string) {
    setCurrentId(id)
    setChatKey((k) => k + 1)  // ChatArea 강제 리마운트 → 선택한 대화 메시지 로드
  }

  function handleConversationCreated(id: string, title: string) {
    setCurrentId(id)
    // Supabase 클라이언트 조회 없이 직접 state 업데이트
    const newConv = { id, title, created_at: new Date().toISOString() }
    const already = conversations.some((c) => c.id === id)
    if (!already) {
      const next = [newConv, ...conversations].slice(0, 5)
      setConversations(next)
      setHasMoreConversations([newConv, ...conversations].length > 5)
    }
  }

  // 세션 확인 전 빈 화면 (깜빡임 방지)
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        conversations={conversations}
        hasMore={hasMoreConversations}
        currentId={currentId}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <main className="flex-1 overflow-hidden">
        <ChatArea
          key={chatKey}
          conversationId={currentId}
          onConversationCreated={handleConversationCreated}
        />
      </main>
    </div>
  )
}
