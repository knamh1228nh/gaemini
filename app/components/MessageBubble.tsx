import ReactMarkdown from 'react-markdown'
import { antWikiUrl } from '@/lib/constants'

interface StockLink {
  name: string
  code: string
}

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  stockLinks?: StockLink[]
  queriedStock?: StockLink | null
  comparisonStocks?: StockLink[]
}

// ── 마크다운 테이블 파서 (remark-gfm 없이 직접 처리) ────────────────────
interface TableSegment {
  type: 'table'
  headers: string[]
  rows: string[][]
}
interface MarkdownSegment {
  type: 'markdown'
  text: string
}
type ContentSegment = TableSegment | MarkdownSegment

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s\-:|]+\|\s*$/.test(line)
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|/.test(line)
}

function splitContentSegments(text: string): ContentSegment[] {
  const lines = text.split('\n')
  const segments: ContentSegment[] = []
  let mdBuffer: string[] = []
  let i = 0

  while (i < lines.length) {
    if (isTableRow(lines[i])) {
      // flush markdown buffer
      if (mdBuffer.length > 0) {
        segments.push({ type: 'markdown', text: mdBuffer.join('\n') })
        mdBuffer = []
      }
      // collect all consecutive table lines
      const tableLines: string[] = []
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      // parse: filter separator rows, first row = headers, rest = data rows
      const dataLines = tableLines.filter((l) => !isSeparatorRow(l))
      if (dataLines.length >= 2) {
        const [headerLine, ...bodyLines] = dataLines
        segments.push({
          type: 'table',
          headers: parseTableRow(headerLine),
          rows: bodyLines.map(parseTableRow),
        })
      } else if (dataLines.length === 1) {
        // single row — just treat as markdown
        mdBuffer.push(...tableLines)
      }
    } else {
      mdBuffer.push(lines[i])
      i++
    }
  }

  if (mdBuffer.length > 0) {
    segments.push({ type: 'markdown', text: mdBuffer.join('\n') })
  }

  return segments
}

// ── 커스텀 테이블 컴포넌트 ────────────────────────────────────────────────
function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-xs border-collapse border border-gray-300 rounded-lg overflow-hidden">
        <thead className="bg-orange-50">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-gray-600 border border-gray-200 align-top">
                  {cell.split(/<br\s*\/?>/gi).map((line, li) => {
                    const parts = line.split(/(\*\*[^*]+\*\*)/)
                    return (
                      <span key={li}>
                        {li > 0 && <br />}
                        {parts.map((part, pi) =>
                          /^\*\*[^*]+\*\*$/.test(part)
                            ? <strong key={pi} className="font-semibold">{part.slice(2, -2)}</strong>
                            : part
                        )}
                      </span>
                    )
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── ReactMarkdown 공통 컴포넌트 설정 ─────────────────────────────────────
const MD_COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-500 hover:underline"
    >
      {children}
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-gray-100 px-1 rounded text-xs font-mono text-gray-800">{children}</code>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-bold text-base mb-2 text-gray-900">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold text-sm mb-1.5 text-gray-800">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-medium text-sm mb-1 text-gray-700">{children}</p>
  ),
}

// ── 텍스트 전처리: stockLinks 반영 + queriedStock 처리 ──────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function processContent(
  text: string,
  stockLinks: StockLink[],
  queriedStock: StockLink | null | undefined,
  comparisonStocks?: StockLink[]
): string {
  // 기존 마크다운 링크 위치를 파악하여 plain 구간과 분리
  type Seg = { text: string; isLink: boolean }
  const mdLinkRegex = /\[([^\]]+)\]\([^)]+\)/g
  const segments: Seg[] = []
  let lastEnd = 0
  let m: RegExpExecArray | null

  while ((m = mdLinkRegex.exec(text)) !== null) {
    if (m.index > lastEnd) {
      segments.push({ text: text.slice(lastEnd, m.index), isLink: false })
    }
    segments.push({ text: m[0], isLink: true })
    lastEnd = m.index + m[0].length
  }
  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd), isLink: false })
  }

  // 각 stock → plain 구간에서 첫 번째 등장만 링크 치환 (queried stock 제외)
  const sorted = [...stockLinks].sort((a, b) => b.name.length - a.name.length)
  const seen = new Set<string>()

  for (const stock of sorted) {
    if (seen.has(stock.code)) continue
    if (queriedStock && stock.code === queriedStock.code) continue

    const url = antWikiUrl(stock.code)
    const re = new RegExp(
      `(?<![가-힣a-zA-Z0-9])${escapeRegex(stock.name)}(?![가-힣a-zA-Z0-9])`
    )

    for (const seg of segments) {
      if (seg.isLink) continue
      if (re.test(seg.text)) {
        seg.text = seg.text.replace(re, `[${stock.name}](${url})`)
        seen.add(stock.code)
        break
      }
    }
  }

  let result = segments.map((s) => s.text).join('')

  // queried stock 인라인 링크 제거 (Gemini가 실수로 추가한 경우)
  if (queriedStock?.code) {
    const cleanRegex = new RegExp(
      `\\[${escapeRegex(queriedStock.name)}\\]\\(https://www\\.ant\\.wiki/wiki/${queriedStock.code}\\)`,
      'g'
    )
    result = result.replace(cleanRegex, queriedStock.name)

    // 답변 끝에 바로가기 추가 (이미 있으면 스킵)
    const url = antWikiUrl(queriedStock.code)
    if (!result.includes(url)) {
      result = result.trimEnd()
      result += `\n\n---\n🔗 [AntWiki에서 자세히 보기 → ${queriedStock.name}](${url})`
    }
  }

  return result
}

// ── 면책사항 분리 유틸 ────────────────────────────────────────────────────
const DISCLAIMER_TEXT = '※ 본 정보는 투자 참고용이며, 투자 결정에 대한 책임은 투자자 본인에게 있습니다.'

function extractDisclaimer(text: string): { main: string; hasDisclaimer: boolean } {
  const idx = text.lastIndexOf(DISCLAIMER_TEXT)
  if (idx === -1) return { main: text, hasDisclaimer: false }
  const main = text.slice(0, idx).replace(/[\n\s]+$/, '')
  return { main, hasDisclaimer: true }
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function MessageBubble({ role, content, stockLinks, queriedStock, comparisonStocks }: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-orange-500 text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
          {content}
        </div>
      </div>
    )
  }

  const rawProcessed =
    stockLinks && stockLinks.length > 0
      ? processContent(content, stockLinks, queriedStock, comparisonStocks)
      : queriedStock
        ? processContent(content, [], queriedStock, comparisonStocks)
        : comparisonStocks && comparisonStocks.length > 0
          ? processContent(content, [], null, comparisonStocks)
          : content

  const { main: mainContent, hasDisclaimer } = extractDisclaimer(rawProcessed)
  const segments = splitContentSegments(mainContent)

  // 비교 종목 바로가기 링크 (면책 조항 뒤에 별도 렌더링)
  const comparisonFooterLinks = (comparisonStocks ?? []).map((s) => ({
    name: s.name,
    url: antWikiUrl(s.code),
  }))

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm text-sm leading-relaxed shadow-sm text-gray-900">
        {segments.map((seg, i) =>
          seg.type === 'table' ? (
            <MarkdownTable key={i} headers={seg.headers} rows={seg.rows} />
          ) : (
            <ReactMarkdown key={i} components={MD_COMPONENTS}>
              {seg.text}
            </ReactMarkdown>
          )
        )}
        {hasDisclaimer && (
          <p className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400 leading-relaxed">
            {DISCLAIMER_TEXT}
          </p>
        )}
        {comparisonFooterLinks.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-col gap-1">
            {comparisonFooterLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-500 hover:text-orange-600 hover:underline"
              >
                🔗 AntWiki에서 자세히 보기 → {link.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
