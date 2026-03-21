'use client'

import { supabase } from '@/lib/supabase'

interface Conversation {
  id: string
  title: string
  created_at: string
}

interface SidebarProps {
  conversations: Conversation[]
  hasMore: boolean
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export default function Sidebar({ conversations, hasMore, currentId, onSelect, onNew }: SidebarProps) {
  async function handleLogout() {
    await supabase.auth.signOut()
    // ChatLayout의 onAuthStateChange(SIGNED_OUT)가 리다이렉트 처리
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white w-64 shrink-0">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-orange-400">Gaemini</h1>
        <p className="text-xs text-gray-400 mt-0.5">AI 주식 투자 비서</p>
      </div>

      {/* 새 대화 버튼 */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          + 새 대화
        </button>
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-4 text-center">대화 기록이 없습니다</p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
              currentId === conv.id
                ? 'bg-orange-500 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {conv.title || '새 대화'}
          </button>
        ))}
        {hasMore && (
          <p className="text-[11px] text-gray-600 px-2 pt-2 pb-1 text-center leading-tight">
            저장공간 문제로 이전 기록은<br />볼 수 없습니다.
          </p>
        )}
      </div>

      {/* 로그아웃 */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
