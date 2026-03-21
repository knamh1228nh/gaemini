'use client'

import ReactMarkdown from 'react-markdown'
import { antWikiUrl } from '@/lib/constants'

export interface AntWikiSubsidiary {
  name: string
  code: string
  description: string
}

export interface AntWikiChunk {
  code: string
  name: string
  section: string
  sectionNum: number
  content: string
  subsidiaries?: AntWikiSubsidiary[]
}

export default function AntWikiPanel({ data }: { data: AntWikiChunk }) {
  const hasSubsidiaries = data.subsidiaries && data.subsidiaries.length > 0

  return (
    <div className="my-3 rounded-xl border border-gray-300 bg-gray-50 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-100">
        <span className="text-xs font-semibold text-orange-500">📖 AntWiki</span>
        <span className="text-xs text-gray-600">
          {data.sectionNum}. {data.section}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {data.name} ({data.code})
        </span>
      </div>

      {/* 서브섹션(계열사 등) 목록 */}
      {hasSubsidiaries ? (
        <div className="divide-y divide-gray-200">
          {data.subsidiaries!.map((sub) => (
            <div key={sub.name} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{sub.name}</p>
                {sub.description && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sub.description}</p>
                )}
              </div>
              {sub.code ? (
                <a
                  href={antWikiUrl(sub.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs px-2.5 py-1 bg-white hover:bg-orange-50 text-gray-500 hover:text-orange-500 border border-gray-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  AntWiki →
                </a>
              ) : (
                <span className="shrink-0 text-xs px-2.5 py-1 text-gray-300 border border-gray-200 rounded-lg">
                  미상장
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-600 leading-relaxed">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
              h2: ({ children }) => {
                const text = String(children)
                const match = text.match(/^(\d{1,2}\.)(.*)/)
                return match ? (
                  <p className="font-bold text-base mb-2">
                    <span className="text-orange-600">{match[1]}</span>
                    <span className="text-gray-900">{match[2]}</span>
                  </p>
                ) : (
                  <p className="font-bold text-gray-900 text-base mb-2">{children}</p>
                )
              },
              h3: ({ children }) => <p className="font-semibold text-orange-600 mt-3 mb-1">{children}</p>,
              h4: ({ children }) => <p className="font-medium text-gray-700 mt-2 mb-0.5">{children}</p>,
            }}
          >
            {data.content}
          </ReactMarkdown>
        </div>
      )}

      {/* 푸터 링크 */}
      <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-100 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">
          더 자세한 내용 → 페이지 열린 후 왼쪽 목차에서{' '}
          <span className="text-gray-500 font-medium">{data.sectionNum}. {data.section}</span>
          을 클릭하세요
        </span>
        <a
          href={antWikiUrl(data.code)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium"
        >
          {data.name} ant.wiki →
        </a>
      </div>
    </div>
  )
}
