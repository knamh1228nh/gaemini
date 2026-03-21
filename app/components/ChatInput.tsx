'use client'

import { useState, useRef } from 'react'

interface ChatInputProps {
  onSend: (message: string, file?: File) => void
  disabled?: boolean
  onStop?: () => void
}

export default function ChatInput({ onSend, disabled, onStop }: ChatInputProps) {
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUrl = /^https?:\/\//.test(text.trim())

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if ((!trimmed && !selectedFile) || disabled) return
    onSend(trimmed || 'PDF 문서를 분석해주세요.', selectedFile ?? undefined)
    setText('')
    setSelectedFile(null)
    textareaRef.current?.focus()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('PDF 파일은 10MB 이하만 업로드 가능합니다.')
      return
    }
    setSelectedFile(file)
    e.target.value = ''
  }

  const canSend = (text.trim() || selectedFile) && !disabled

  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      {isUrl && !selectedFile && (
        <div className="mb-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
          💡 뉴스 URL이 감지되었습니다. 자동으로 수혜주를 분석합니다.
        </div>
      )}
      {selectedFile && (
        <div className="mb-2 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
          </svg>
          <span className="truncate max-w-[260px] font-medium">{selectedFile.name}</span>
          <span className="text-orange-400">({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)</span>
          <button
            onClick={() => setSelectedFile(null)}
            className="ml-auto text-orange-400 hover:text-orange-600"
            aria-label="파일 제거"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="PDF 파일 첨부"
          className="flex-shrink-0 w-10 h-10 mb-0.5 flex items-center justify-center rounded-xl border border-gray-300 text-gray-500 hover:text-orange-500 hover:border-orange-400 transition-colors disabled:opacity-40"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          placeholder={selectedFile ? '추가 질문을 입력하세요. (없으면 바로 전송)' : '질문을 입력하거나 뉴스 URL을 붙여넣으세요.(Enter: 전송)'}
          className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
        />
        {disabled ? (
          <button
            onClick={onStop}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 h-[60px]"
          >
            <svg className="w-4 h-4" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
            중지
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1 h-[60px]"
          >
            <svg className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            전송
          </button>
        )}
      </div>
    </div>
  )
}
