'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import MessageBubble from './MessageBubble'
import StatusIndicator from './StatusIndicator'
import ChatInput from './ChatInput'
import BeneficiaryResultPanel, { BeneficiaryResultChunk } from './BeneficiaryCard'
import AntWikiPanel, { AntWikiChunk } from './AntWikiPanel'

interface StockLink {
  name: string
  code: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  beneficiaries?: BeneficiaryResultChunk
  antwiki?: AntWikiChunk
  stockLinks?: StockLink[]
  queriedStock?: StockLink | null
  comparisonStocks?: StockLink[]
  attachmentName?: string // PDF 첨부 파일명
}

interface ChatAreaProps {
  conversationId: string | null
  onConversationCreated: (id: string, title: string) => void
}

const SAMPLE_CATEGORIES = [
  {
    label: '📈 종목 분석',
    questions: [
      '삼성전자 사업 모델 알려줘',
      'SK하이닉스 최근 실적 어때?',
      '카카오 주주 구성 알려줘',
    ],
  },
  {
    label: '🔥 수혜주 탐색',
    questions: [
      'AI 반도체 관련주 알려줘',
      '금리 인하 수혜주는 어떤 게 있어?',
      '방산 테마주 분석해줘',
    ],
  },
  {
    label: '💰 주가 & 시장',
    questions: [
      '삼성전자 현재 주가 알려줘',
      '삼성전자 vs SK하이닉스 비교해줘',
      '오늘 코스피 동향 어때?',
    ],
  },
  {
    label: '📚 투자 기초',
    questions: [
      'PER이 뭔가요? 어떻게 활용하나요?',
      '배당주 투자 장단점이 뭐야?',
      '분산 투자 방법을 알려줘',
    ],
  },
]

export default function ChatArea({ conversationId, onConversationCreated }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [pendingBeneficiaries, setPendingBeneficiaries] = useState<BeneficiaryResultChunk | null>(null)
  const [pendingAntwiki, setPendingAntwiki] = useState<AntWikiChunk | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const isStreamingRef = useRef(false)

  // 대화 변경 시 메시지 로드
  useEffect(() => {
    if (isStreamingRef.current) return  // 스트리밍 중 conversationId 변경은 무시
    setMessages([])
    setStreamingText('')
    setPendingBeneficiaries(null)
    setPendingAntwiki(null)
    setStatus(null)
    if (!conversationId) return

    supabase
      .from('messages')
      .select('role, content, sources')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) {
          console.error('[ChatArea] 메시지 로드 실패:', error)
          return
        }
        if (data) {
          setMessages(data.map((msg) => ({
            role: msg.role as Message['role'],
            content: msg.content,
            beneficiaries: msg.sources?.beneficiaries ?? undefined,
          })))
        }
      })
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, status])

  // 컴포넌트 언마운트 시 스트림 중단
  useEffect(() => {
    return () => {
      readerRef.current?.cancel()
    }
  }, [])

  function handleStop() {
    readerRef.current?.cancel()
    isStreamingRef.current = false
    setLoading(false)
    setStatus(null)
    // 지금까지 스트리밍된 텍스트가 있으면 메시지로 확정
    setStreamingText((prev) => {
      if (prev.trim()) {
        setMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: prev.trim() + '\n\n*(중단됨)*' },
        ])
      }
      return ''
    })
    setPendingBeneficiaries(null)
    setPendingAntwiki(null)
  }

  async function handleSend(message: string, file?: File) {
    isStreamingRef.current = true
    setLoading(true)
    setStatus(null)
    setStreamingText('')
    setPendingBeneficiaries(null)
    setPendingAntwiki(null)

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: message, attachmentName: file?.name },
    ]
    setMessages(newMessages)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      isStreamingRef.current = false
      setLoading(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ 로그인 세션이 만료되었습니다. 새로고침 후 다시 시도해주세요.' }])
      return
    }

    const history = newMessages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    let convId = conversationId
    let accText = ''
    let localBeneficiaries: BeneficiaryResultChunk | null = null
    let localAntwiki: AntWikiChunk | null = null
    let localStockLinks: StockLink[] = []
    let localQueriedStock: StockLink | null = null
    let localComparisonStocks: StockLink[] = []

    let res: Response
    try {
      let body: BodyInit
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }

      if (file) {
        const fd = new FormData()
        fd.append('message', message)
        fd.append('history', JSON.stringify(history))
        if (convId) fd.append('conversationId', convId)
        fd.append('file', file)
        body = fd
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({ message, conversationId: convId, history })
      }

      res = await fetch('/api/chat', { method: 'POST', headers, body })
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      console.error('[ChatArea] fetch() 자체 실패:', msg)
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ 연결 실패: ${msg}` }])
      setStreamingText('')
      isStreamingRef.current = false
      setLoading(false)
      setStatus(null)
      return
    }

    try {
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const chunk = JSON.parse(line.slice(6))

            if (chunk.type === 'conversationId' && !convId) {
              convId = chunk.content
              onConversationCreated(chunk.content, chunk.title ?? '')
            } else if (chunk.type === 'status') {
              setStatus(chunk.content)
            } else if (chunk.type === 'beneficiaries') {
              localBeneficiaries = chunk.content
              setPendingBeneficiaries(chunk.content)
            } else if (chunk.type === 'antwiki') {
              localAntwiki = chunk
              setPendingAntwiki(chunk)
            } else if (chunk.type === 'stockLinks') {
              localStockLinks = chunk.stocks ?? []
              localQueriedStock = chunk.queriedStock ?? null
              localComparisonStocks = chunk.comparisonStocks ?? []
            } else if (chunk.type === 'text') {
              setStatus(null)
              accText += chunk.content
              // 스트리밍 중 ANTWIKI 마커 숨김
              const displayText = accText
                .replace(/\[ANTWIKI:[^\]]*\][\s\S]*?\[\/ANTWIKI\]/g, '')
                .replace(/\[ANTWIKI:[^\]]*\][\s\S]*/g, '')
                .trim()
              setStreamingText(displayText)
            } else if (chunk.type === 'done') {
              // ANTWIKI 마커 제거한 최종 텍스트
              const cleanText = accText
                .replace(/\[ANTWIKI:[^\]]*\][\s\S]*?\[\/ANTWIKI\]/g, '')
                .trim()
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: cleanText,
                  beneficiaries: localBeneficiaries ?? undefined,
                  antwiki: localAntwiki ?? undefined,
                  stockLinks: localStockLinks,
                  queriedStock: localQueriedStock,
                  comparisonStocks: localComparisonStocks,
                },
              ])
              setPendingBeneficiaries(null)
              setPendingAntwiki(null)
              setStreamingText('')
            } else if (chunk.type === 'error') {
              setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${chunk.content}` }])
              setStreamingText('')
            }
          } catch {}
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[ChatArea] stream read 오류:', errMsg)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ 스트림 오류: ${errMsg}` },
      ])
      setStreamingText('')
    } finally {
      isStreamingRef.current = false
      setLoading(false)
      setStatus(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-2">
            <div>
              <p className="text-4xl font-bold text-orange-500">Gaemini</p>
              <p className="text-gray-400 text-sm mt-1">AI 기반 한국 주식 투자 비서 · ant.wiki</p>
            </div>
            <div className="w-full max-w-2xl grid grid-cols-2 gap-3">
              {SAMPLE_CATEGORIES.map((cat) => (
                <div key={cat.label} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-500 mb-1">{cat.label}</p>
                  {cat.questions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="text-left px-3 py-2 bg-gray-50 hover:bg-orange-50 hover:border-orange-200 border border-gray-100 rounded-lg text-xs text-gray-700 transition-colors leading-snug"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.beneficiaries && <BeneficiaryResultPanel data={msg.beneficiaries} />}
            {msg.antwiki && <AntWikiPanel data={msg.antwiki} />}
            {msg.role === 'user' && msg.attachmentName && (
              <div className="flex justify-end mb-1">
                <div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 max-w-[75%]">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                  </svg>
                  <span className="truncate">{msg.attachmentName}</span>
                </div>
              </div>
            )}
            {msg.content && (
              <MessageBubble
                role={msg.role}
                content={msg.content}
                stockLinks={msg.stockLinks}
                queriedStock={msg.queriedStock}
                comparisonStocks={msg.comparisonStocks}
              />
            )}
          </div>
        ))}

        {status && (
          <div className="flex justify-start">
            <StatusIndicator status={status} />
          </div>
        )}

        {pendingBeneficiaries && <BeneficiaryResultPanel data={pendingBeneficiaries} />}
        {pendingAntwiki && <AntWikiPanel data={pendingAntwiki} />}

        {streamingText && (
          <MessageBubble role="assistant" content={streamingText + ' ▌'} />
        )}

        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={loading} onStop={handleStop} />
    </div>
  )
}
