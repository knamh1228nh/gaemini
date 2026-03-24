import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import type { GenerateContentConfig } from '@google/genai'
import { supabaseServer } from '@/lib/supabase-server'
import { executeFindBeneficiaries, detectBeneficiaryIntent, executeFindBeneficiariesFromTopic, executeFindBeneficiariesFromPdf } from '@/lib/tools/beneficiary-logic'
import { detectSectionKeyword, getAntWikiSections, findSection } from '@/lib/antwiki-browser'
import { searchStockByName, fetchStockPrice } from '@/lib/naver-stock'
import { geminiGenerateWithRotation } from '@/lib/gemini'

export const runtime = 'nodejs'
export const maxDuration = 60

const QUERY_CACHE_TTL_HOURS = 24
const DISCLAIMER = '※ 본 정보는 투자 참고용이며, 투자 결정에 대한 책임은 투자자 본인에게 있습니다.'

/** 이미 면책 조항이 포함된 경우 빈 문자열, 없는 경우 줄바꿈+조항 반환 */
function appendDisclaimerIfMissing(text: string): string {
  return text.includes(DISCLAIMER) ? '' : `\n\n${DISCLAIMER}`
}

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((k): k is string => !!k)

const MODELS = ['gemini-3.1-flash-lite-preview']

const SYSTEM_INSTRUCTION = `당신은 한국 주식 투자 정보 비서 "Gaemini"입니다. ant.wiki 플랫폼에 내장된 AI로, 개인 투자자(개미)가 다른 사이트로 이탈하지 않고 모든 투자 정보를 한 곳에서 찾을 수 있도록 돕는 것이 핵심 목표입니다.

## 처리 가능한 질문 유형

**1. 개별 종목 분석**
- 종목 개요, 사업 모델, 실적, 주주 구성, 테마 등
- "삼성전자 어떤 회사야?", "카카오 실적 알려줘"

**2. 수혜주 / 관련주 / 테마주 분석**
- 뉴스 URL 붙여넣기 → 자동 수혜주 분석
- 토픽 기반 → "AI 반도체 관련주 알려줘", "금리 인하 수혜주는?"

**3. 실시간 주가 조회**
- "삼성전자 현재 주가", "카카오 지금 얼마야"
- 시가총액, 거래량, 등락률 포함 제공

**4. 종목 비교 분석**
- "삼성전자 vs SK하이닉스 비교해줘"
- 반드시 마크다운 표(| 컬럼 |) 형식으로 항목별 비교 제시

**5. 시장 동향 & 지수**
- "오늘 코스피/코스닥 어때?", "외국인 순매수 동향은?"
- Google Search로 실시간 시장 정보 검색

**6. 거시경제 영향 분석**
- "금리 인상이 주식에 미치는 영향은?", "달러 강세 수혜주는?"
- "유가 상승 시 관련 주식은?", "인플레이션과 주식 시장의 관계"

**7. 섹터 / 업종 분석**
- "반도체 섹터 전망은?", "2차전지 업황 어때?"
- "방산주 지금 투자 적기야?", "바이오 섹터 최근 동향"

**8. 재무지표 해석**
- "PER이 뭔가요?", "PBR 1배 이하의 의미는?"
- "ROE 높은 종목의 특징은?", "삼성전자 PER이 적정한가요?"
- 재무지표 개념 + 실제 종목 사례를 함께 설명

**9. 주식 기초 개념**
- "배당주가 뭔가요?", "우선주와 보통주 차이는?"
- "시가총액이란?", "공매도가 뭔가요?"
- 쉽고 친절하게 개념 설명 후 관련 AntWiki 링크 포함

**10. ETF 정보**
- "KODEX 반도체 ETF 구성 종목은?", "ETF와 주식의 차이는?"
- "배당 ETF 추천해줘" → 종류 및 특징 설명

**11. 공시 / 뉴스 검색**
- "삼성전자 최근 공시 알려줘", "오늘 주요 경제 뉴스는?"
- Google Search로 최신 공시 및 뉴스 검색

**12. 투자 전략 & 포트폴리오**
- "분산 투자 방법은?", "적립식 투자란?"
- "가치 투자 vs 성장 투자 차이는?"
- 교육적 정보 제공 (투자 권유 아님 명시)

---

## 정보 탐색 우선순위
1. [네이버 증권 실시간 주가] 블록 (주가 질문 시 최우선)
2. [AntWiki 원문] 블록 (종목 정보 질문 시 최우선)
3. Google Search로 최신 뉴스 및 시장 정보 검색
4. Google Search로 "site:ant.wiki [종목명 또는 테마]" 검색

---

## 종목 링크 규칙 (반드시 준수)

**링크 생성 대상 (ONLY 아래 조건 모두 충족 시):**
- KOSPI/KOSDAQ/KONEX에 실제 상장된 주식 종목
- 6자리 종목코드가 확인된 경우

**링크 생성 절대 금지 대상:**
- ETF (KODEX, TIGER, KBSTAR, ARIRANG 등으로 시작하는 상품명)
- 지수 (코스피, 코스닥, 나스닥, S&P500 등)
- 테마 이름 (AI, 반도체, 2차전지 등 개념어)
- 일반 기업명 (상장 여부 불확실하거나 종목코드 미확인)
- 펀드, 채권, 원자재, 환율 관련 용어

**링크 형식 (상장 주식 확인된 경우만):**
- 처음 등장 시: [종목명](https://www.ant.wiki/wiki/{6자리코드})
- 이후 재등장 시: 링크 없이 종목명만
- 종목코드 불확실 시: 링크 없이 종목명만 기재 (오링크 금지)
- ANTWIKI 블록이 제공된 경우: 해당 종목 인라인 링크 생략
- 사용자가 직접 언급한 주 종목(QUERIED_STOCK)은 본문 링크 금지. 답변 맨 마지막에만:
  🔗 [AntWiki에서 자세히 보기 → {종목명}](https://www.ant.wiki/wiki/{코드})

---

## 수혜주 분석 데이터 처리 규칙
- 메시지에 "[수혜주 분석 완료]" 섹션이 포함된 경우, 해당 내용은 이미 별도 UI 카드로 사용자에게 표시되고 있다.
- 수혜주 종목 목록, 점수, 분석 내용을 텍스트로 재설명하지 않는다.
- 대신 뉴스의 핵심 내용, 시장 맥락, 투자 시사점 등 부가적인 인사이트만 2~3문단으로 제공한다.

---

## 응답 포맷 규칙
- 섹션 구분이 필요하면 ## 헤딩을 사용하라.
- 핵심 정보는 **굵은 글씨**로 강조하라.
- 항목이 3개 이상이면 - 불릿 리스트를 사용하라.
- 종목 비교 질문("vs", "비교", "차이")에는 반드시 마크다운 표(| 구분 | 종목A | 종목B |) 형식으로 핵심 지표를 비교하라.
- 재무지표 질문에는 개념 설명 + 실제 수치 예시 + 투자 시사점 순으로 답변하라.
- 일반 대화("안녕", "고마워" 등)는 짧고 친절하게 한국어로만 답변하라. 도구를 호출하지 않는다.
- 투자 조언 요청("지금 사야 해?", "팔아야 해?")에는 투자 결정은 개인의 판단임을 명시하고, 관련 팩트와 시장 분석 정보만 제공한다.

---

## 답변 필수 요소
1. 정보 출처 명시 (예: "출처: Google 검색 결과", "출처: AntWiki", "출처: 네이버 증권")
2. 답변 마지막에 항상 포함:
   ※ 본 정보는 투자 참고용이며, 투자 결정에 대한 책임은 투자자 본인에게 있습니다.
3. 한국어로 답변

---

## 할루시네이션 금지 규칙 (반드시 준수)
- 검색 결과나 제공된 데이터에 명시적으로 존재하는 정보만 답변에 사용한다.
- 수치(주가, 실적, 날짜, PER/PBR 등)는 출처가 확인된 경우에만 기재한다.
- 정보를 찾지 못했거나 확신할 수 없을 경우, 반드시 아래 형식으로 솔직하게 답변한다:
  "해당 정보를 찾을 수 없습니다. 이유: [검색했으나 결과 없음 / 데이터가 오래되었을 가능성 등 구체적 사유]"
- 추측이나 일반적 지식으로 빈칸을 채우지 않는다.
- "~로 알려져 있습니다", "~일 것으로 보입니다" 등 불확실한 표현으로 사실처럼 포장하지 않는다.`

interface StockLink {
  name: string
  code: string
}

function extractStockLinksFromText(text: string): StockLink[] {
  const links: StockLink[] = []

  // 1. [종목명](ant.wiki/wiki/코드) 패턴 — Gemini가 명시적으로 생성한 링크만 추출
  const mdRegex = /\[([^\]]+)\]\(https:\/\/www\.ant\.wiki\/wiki\/(\d{6})\)/g
  let m: RegExpExecArray | null
  while ((m = mdRegex.exec(text)) !== null) {
    if (!links.find((l) => l.code === m![2])) {
      links.push({ name: m[1], code: m[2] })
    }
  }

  // 2. 종목명(6자리코드) 패턴 — AI가 명시적으로 코드를 병기한 경우만
  const codeRegex = /([가-힣A-Za-z0-9·]{2,12})\((\d{6})\)/g
  while ((m = codeRegex.exec(text)) !== null) {
    if (!links.find((l) => l.code === m![2])) {
      links.push({ name: m[1], code: m[2] })
    }
  }

  // ※ wiki_cache DB 전수 스캔 제거:
  //   응답 전체에서 종목명을 찾아 자동 링크 삽입하면
  //   ETF명, 지수명, 일반 기업명 등 비종목 단어에도 링크가 달리는 문제가 발생함.
  //   Gemini가 명시적으로 생성한 링크(위 1, 2 패턴)만 사용.

  return links
}

function sendChunk(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: object
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

async function geminiStreamWithRotation(
  contents: object[],
  tools: object[],
  systemInstruction: string,
  onChunk: (text: string) => void
): Promise<void> {
  let lastError: unknown
  for (const model of MODELS) {
    for (let i = 0; i < API_KEYS.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEYS[i] })
        const config: GenerateContentConfig = {
          systemInstruction,
          tools: tools as GenerateContentConfig['tools'],
        }
        const streamResult = await ai.models.generateContentStream({
          model,
          contents: contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
          config,
        })
        for await (const chunk of streamResult) {
          const text = chunk.text ?? ''
          if (text) onChunk(text)
        }
        return
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status
        if (status === 429 || status === 400) {
          lastError = err
          continue
        }
        throw err
      }
    }
  }
  throw lastError ?? new Error('모든 API 키가 소진되었습니다.')
}

/**
 * 사용자 메시지에서 종목을 감지합니다.
 * 1순위: 6자리 코드 직접 입력
 * 2순위: Gemini로 종목명 추출 → Naver로 코드 검증
 * 3순위: 메시지 전체를 Naver AC API에 전달 (짧은 단독 질문 커버)
 */
async function detectStockInMessage(
  message: string
): Promise<{ topStock: { name: string; code: string } | null; stockCode: string | undefined }> {
  const notFound = { topStock: null, stockCode: undefined }

  // 1순위: 6자리 코드 직접 입력
  const directCode = message.match(/\b(\d{6})\b/)?.[1]
  if (directCode) {
    const results = await searchStockByName(directCode)
    if (results[0]) return { topStock: results[0], stockCode: results[0].code }
  }

  // 2순위: Gemini로 종목명 추출
  try {
    const { text } = await geminiGenerateWithRotation(
      `사용자 메시지에서 한국 상장 주식 종목명을 추출하세요.\n메시지: "${message}"\n종목명이 있으면 {"name":"종목명"} JSON만, 없으면 null만 출력. 설명 없음.`
    )
    const clean = text.trim().replace(/```json\n?|```/g, '').trim()
    if (clean !== 'null' && clean.startsWith('{')) {
      const parsed = JSON.parse(clean) as { name?: string }
      if (parsed?.name) {
        const results = await searchStockByName(parsed.name)
        const match =
          results.find((r) => r.name.replace(/\s/g, '') === parsed.name!.replace(/\s/g, '')) ??
          results[0]
        if (match) return { topStock: match, stockCode: match.code }
      }
    }
  } catch {
    // Gemini 실패 시 3순위로 낙하
  }

  // 3순위: 메시지 전체 Naver AC (단독 종목명 질문 커버)
  const naverResults = await searchStockByName(message)
  const naverTop = naverResults[0]
  if (naverTop && message.replace(/\s/g, '').includes(naverTop.name.replace(/\s/g, ''))) {
    return { topStock: naverTop, stockCode: naverTop.code }
  }

  return notFound
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // HTTP 헤더 즉시 확립 — 모든 async 작업 전에 첫 enqueue 필수
      sendChunk(controller, encoder, { type: 'ping' })

      try {
        // ── 1. Auth 확인 ──────────────────────────────────────────────
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        if (!token) {
          sendChunk(controller, encoder, { type: 'error', content: '인증이 필요합니다.' })
          return
        }

        const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
        if (authError || !user) {
          sendChunk(controller, encoder, { type: 'error', content: '인증이 필요합니다.' })
          return
        }

        // ── 2. 요청 파싱 (JSON 또는 FormData) ────────────────────────
        let message: string
        let conversationId: string | undefined
        let history: object[] = []
        let pdfBase64: string | undefined
        let pdfFileName: string | undefined

        const contentType = req.headers.get('content-type') ?? ''
        if (contentType.includes('multipart/form-data')) {
          const formData = await req.formData()
          message = (formData.get('message') as string) ?? ''
          conversationId = (formData.get('conversationId') as string) || undefined
          const historyStr = formData.get('history') as string | null
          history = historyStr ? JSON.parse(historyStr) : []
          const file = formData.get('file') as File | null
          if (file && file.size > 0) {
            const buffer = await file.arrayBuffer()
            pdfBase64 = Buffer.from(buffer).toString('base64')
            pdfFileName = file.name
          }
        } else {
          const body = await req.json()
          message = body.message ?? ''
          conversationId = body.conversationId
          history = body.history ?? []
        }

        if (!message?.trim() && !pdfBase64) {
          sendChunk(controller, encoder, { type: 'error', content: '메시지를 입력해주세요.' })
          return
        }

        // ── 3. query_cache 조회 (히스토리 없는 첫 질문만, 실시간 데이터·PDF 제외) ──
        // 실시간 주가/지수 질문, PDF 첨부 질문은 캐시 사용 금지
        const REALTIME_KEYWORDS = ['주가', '시세', '현재가', '종가', '지금 얼마', '현재 가격', '주식 가격', '등락', '거래량', '코스피', '코스닥', '오늘', '지금']
        const isRealtimeQuery = REALTIME_KEYWORDS.some((kw) => message.includes(kw)) || !!pdfBase64

        if (history.length === 0 && !isRealtimeQuery) {
          try {
            const queryHash = createHash('sha256')
              .update(message.trim().toLowerCase())
              .digest('hex')

            const { data: cached, error: cacheErr } = await supabaseServer
              .from('query_cache')
              .select('*')
              .eq('query_hash', queryHash)
              .single()

            if (cacheErr) {
              console.warn('[chat/route] query_cache 조회 실패 (무시):', cacheErr.message)
            } else if (cached) {
              const cachedAt = new Date(cached.updated_at ?? cached.created_at).getTime()
              const expiredMs = QUERY_CACHE_TTL_HOURS * 60 * 60 * 1000
              const isExpired = Date.now() - cachedAt > expiredMs

              if (!isExpired) {
                await supabaseServer
                  .from('query_cache')
                  .update({ hit_count: cached.hit_count + 1 })
                  .eq('query_hash', queryHash)

                sendChunk(controller, encoder, { type: 'text', content: cached.response })
                if (cached.sources) {
                  sendChunk(controller, encoder, { type: 'sources', content: cached.sources })
                }
                sendChunk(controller, encoder, { type: 'done' })
                return
              }
              // 만료된 캐시 → 아래로 내려가 재분석 후 덮어씀
            }
          } catch (cacheEx) {
            console.warn('[chat/route] query_cache 예외 (무시):', cacheEx)
          }
        }

        // ── 4. conversation 관리 ──────────────────────────────────────
        let convId = conversationId
        if (!convId) {
          const { data: conv } = await supabaseServer
            .from('conversations')
            .insert({ user_id: user.id, title: message.slice(0, 40) })
            .select('id')
            .single()
          convId = conv?.id
        }

        await supabaseServer.from('messages').insert({
          conversation_id: convId,
          role: 'user',
          content: message,
        })

        sendChunk(controller, encoder, {
          type: 'conversationId',
          content: convId,
          title: message.slice(0, 40),
        })

        // ── 5. 수혜주 선처리: PDF > URL > 토픽 순으로 분기 ──────────
        const allSources: string[] = []
        let finalMessage = message
        let persistedBeneficiaries: object | null = null  // DB 저장용 수혜주 데이터
        const urlMatch = message.match(/https?:\/\/[^\s]+/)
        const isPdfBeneficiaryQuery = !!pdfBase64 && detectBeneficiaryIntent(message)

        if (isPdfBeneficiaryQuery) {
          // 5-a. PDF + 수혜 키워드 → PDF 직접 분석
          sendChunk(controller, encoder, {
            type: 'status',
            content: 'PDF 문서 분석 및 수혜주 탐색 중...',
          })
          const toolResult = await executeFindBeneficiariesFromPdf(pdfBase64!, pdfFileName, user.id)

          if ('beneficiaries' in toolResult) {
            const chunk = { title: toolResult.title, summary: toolResult.summary, beneficiaries: toolResult.beneficiaries, fromCache: false }
            sendChunk(controller, encoder, { type: 'beneficiaries', content: chunk })
            persistedBeneficiaries = chunk
            const brief = toolResult.beneficiaries
              .map((b) => `- ${b.name}(${b.code}): 단기${b.short_score} 장기${b.long_score}`)
              .join('\n')
            finalMessage = `${message}\n\n[수혜주 분석 완료]\n제목: ${toolResult.title}\n${brief}`
          } else {
            finalMessage = `${message}\n\n[분석 실패] ${toolResult.error}`
          }
        } else if (urlMatch) {
          sendChunk(controller, encoder, { type: 'status', content: '뉴스 기사 분석 및 수혜주 탐색 중...' })
          const toolResult = await executeFindBeneficiaries(urlMatch[0], user.id)

          if ('beneficiaries' in toolResult) {
            allSources.push(...toolResult.sources)
            const chunk = { title: toolResult.title, summary: toolResult.summary, beneficiaries: toolResult.beneficiaries, fromCache: toolResult.summary === '(캐시된 분석 결과입니다)' }
            sendChunk(controller, encoder, { type: 'beneficiaries', content: chunk })
            persistedBeneficiaries = chunk
            const brief = toolResult.beneficiaries
              .map((b) => `- ${b.name}(${b.code}): 단기${b.short_score} 장기${b.long_score}`)
              .join('\n')
            finalMessage = `${message}\n\n[수혜주 분석 완료]\n제목: ${toolResult.title}\n${brief}`
          } else {
            finalMessage = `${message}\n\n[분석 실패] ${toolResult.error}`
          }
        } else if (detectBeneficiaryIntent(message)) {
          sendChunk(controller, encoder, { type: 'status', content: '관련 정보 수집 및 수혜주 분석 중...' })
          const toolResult = await executeFindBeneficiariesFromTopic(message, user.id)

          if ('beneficiaries' in toolResult) {
            const chunk = { title: toolResult.title, summary: toolResult.summary, beneficiaries: toolResult.beneficiaries, fromCache: false }
            sendChunk(controller, encoder, { type: 'beneficiaries', content: chunk })
            persistedBeneficiaries = chunk
            const brief = toolResult.beneficiaries
              .map((b) => `- ${b.name}(${b.code}): 단기${b.short_score} 장기${b.long_score}`)
              .join('\n')
            finalMessage = `${message}\n\n[수혜주 분석 완료]\n제목: ${toolResult.title}\n${brief}`
          } else {
            finalMessage = `${message}\n\n[분석 실패] ${toolResult.error}`
          }
        }

        // ── 6. AntWiki 크롤링 (Gemini 호출 전 순차 완료) ─────────────
        // 주가/시세 질문은 AntWiki에 실시간 데이터 없음 → Gemini+Google Search 우선
        const PRICE_KEYWORDS = ['주가', '시세', '현재가', '종가', '주식 가격', '지금 얼마', '현재 가격']
        const isPriceQuery = PRICE_KEYWORDS.some((kw) => message.includes(kw))

        // 종목 비교 질문은 단일 AntWiki 카드 대신 Gemini+Google Search로 처리
        const COMPARISON_KEYWORDS = [' vs ', ' VS ', ' Vs ', '비교', '차이', '어느 쪽', '어느쪽', '뭐가 나아', '뭐가 좋아']
        const isComparisonQuery = COMPARISON_KEYWORDS.some((kw) => message.includes(kw))

        const sectionKeyword = detectSectionKeyword(message)

        const { topStock, stockCode } = await detectStockInMessage(message)

        let antwikiContext = ''
        let antwikiShown = false
        let cachedWikiData: Awaited<ReturnType<typeof getAntWikiSections>> = null
        let comparisonStocks: Array<{ name: string; code: string }> = []
        let comparisonInputNames: Array<{ name: string; code: string }> = [] // 사용자 입력명 (이름 불일치 대비)

        // 주가 질문 시 Naver 실시간 주가 데이터 주입
        if (stockCode && isPriceQuery) {
          sendChunk(controller, encoder, { type: 'status', content: '실시간 주가 조회 중...' })
          const priceData = await fetchStockPrice(stockCode)
          if (priceData) {
            const sign = priceData.change.startsWith('-') ? '' : '+'
            const priceContext = [
              `[네이버 증권 실시간 주가 - ${priceData.name}(${stockCode})]`,
              `현재가: ${priceData.currentPrice}원`,
              `전일 대비: ${sign}${priceData.change}원 (${sign}${priceData.changeRate}%)`,
              priceData.marketCap ? `시가총액: ${priceData.marketCap}` : '',
              priceData.volume ? `거래량: ${priceData.volume}` : '',
            ].filter(Boolean).join('\n')
            finalMessage = `${finalMessage}\n\n${priceContext}`
          }
        }

        // 비교 질문 시 두 종목 주가 동시 조회
        if (isComparisonQuery) {
          try {
            // 메시지에서 두 종목 추출 (vs / 비교 기준 분리)
            // 패턴1: "A vs B", "A 대 B"  패턴2: "A와 B", "A과 B" (와/과가 앞 단어에 붙음)  패턴3: "A 하고 B"
            const vsMatch =
              message.match(/([가-힣A-Za-z0-9·]+)\s*(?:vs\.?|VS\.?|대)\s*([가-힣A-Za-z0-9·]+)/i) ||
              message.match(/([가-힣A-Za-z0-9·]+?)[와과]\s*([가-힣A-Za-z0-9·]+)/i) ||
              message.match(/([가-힣A-Za-z0-9·]+)\s+하고\s+([가-힣A-Za-z0-9·]+)/i)
            if (vsMatch) {
              const [, nameA, nameB] = vsMatch
              const [resA, resB] = await Promise.all([
                searchStockByName(nameA),
                searchStockByName(nameB),
              ])
              const stockA = resA[0]
              const stockB = resB[0]
              if (stockA && stockB) {
                comparisonStocks = [
                  { name: stockA.name, code: stockA.code },
                  { name: stockB.name, code: stockB.code },
                ]
                // 사용자 입력명이 공식명과 다를 경우 대체 매칭용으로 저장
                comparisonInputNames = [
                  ...(nameA !== stockA.name ? [{ name: nameA, code: stockA.code }] : []),
                  ...(nameB !== stockB.name ? [{ name: nameB, code: stockB.code }] : []),
                ]
                sendChunk(controller, encoder, { type: 'status', content: '두 종목 실시간 주가 조회 중...' })
                const [priceA, priceB] = await Promise.all([
                  fetchStockPrice(stockA.code),
                  fetchStockPrice(stockB.code),
                ])
                const compParts: string[] = ['[비교 종목 실시간 주가]']
                for (const [pd, code] of [[priceA, stockA.code], [priceB, stockB.code]] as const) {
                  if (pd && typeof pd === 'object') {
                    const sign = String(pd.change).startsWith('-') ? '' : '+'
                    compParts.push(
                      `${pd.name}(${code}): 현재가 ${pd.currentPrice}원, 전일대비 ${sign}${pd.change}원(${sign}${pd.changeRate}%)${pd.marketCap ? `, 시가총액 ${pd.marketCap}` : ''}`
                    )
                  }
                }
                if (compParts.length > 1) {
                  finalMessage = `${finalMessage}\n\n${compParts.join('\n')}`
                }
              }
            }
          } catch {
            // 비교 주가 조회 실패 시 무시하고 진행
          }
        }

        if (stockCode && !isPriceQuery && !isComparisonQuery) {
          sendChunk(controller, encoder, {
            type: 'status',
            content: 'AntWiki 정보 수집 중...',
          })

          const wikiData = await getAntWikiSections(stockCode, supabaseServer)
          cachedWikiData = wikiData
          if (wikiData) {
            const effectiveKeyword = sectionKeyword ?? '개요'
            const section = findSection(wikiData.sections, effectiveKeyword)

            if (section) {
              // 서브섹션 Naver 코드 병렬 조회 (UI 카드용)
              type SubsidiaryInfo = { name: string; code: string; description: string }
              let subsidiaries: SubsidiaryInfo[] = []
              if (section.subsections.length > 0) {
                const results = await Promise.allSettled(
                  section.subsections.map(async (sub) => {
                    const stocks = await searchStockByName(sub.title)
                    return { name: sub.title, code: stocks[0]?.code ?? '', description: sub.firstLine }
                  })
                )
                subsidiaries = results
                  .filter((r) => r.status === 'fulfilled')
                  .map((r) => (r as PromiseFulfilledResult<SubsidiaryInfo>).value)
              }

              // UI 카드 청크 전송
              sendChunk(controller, encoder, {
                type: 'antwiki',
                code: wikiData.stockCode,
                name: wikiData.stockName,
                section: section.title,
                sectionNum: section.num,
                content: section.content,
                subsidiaries,
              })

              antwikiContext = `[AntWiki 원문 - ${wikiData.stockName}(${stockCode}) | ${section.num}. ${section.title}]\n${section.content}`
              antwikiShown = true
            }
          }
        }

        // ── 7. AntWiki 카드가 표시된 경우: AI 인사이트 코멘트 추가 후 계속 진행 ──
        if (antwikiShown) {
          // 섹션 목록 힌트 생성
          const sectionHints = cachedWikiData?.sections
            .slice(0, 8)
            .map((s) => `\`${s.num}. ${s.title}\``)
            .join(' · ') ?? ''

          // AntWiki 내용을 기반으로 Gemini AI 인사이트 코멘트 (짧게)
          sendChunk(controller, encoder, { type: 'status', content: 'Gaemini 인사이트 생성 중...' })
          const queriedStockForAntwiki: StockLink | null =
            stockCode && topStock?.name ? { name: topStock.name, code: stockCode } : null

          const insightInstruction = `${SYSTEM_INSTRUCTION}\n\n제공된 AntWiki 원문 데이터를 바탕으로 이번 섹션의 핵심 포인트를 2~3문장으로 짧게 요약하고, 투자자 관점에서 주목할 점 1가지만 간략히 언급하세요. AntWiki 내용을 반복하지 말고 가치 있는 인사이트만 추가하세요. 길게 쓰지 마세요. 섹션 목록이나 "다른 섹션에 대해 물어보세요" 같은 탐색 안내 문구는 절대 출력하지 마세요.${queriedStockForAntwiki ? `\n\n주 종목(QUERIED_STOCK): ${queriedStockForAntwiki.name}(${queriedStockForAntwiki.code}). 본문에서 마크다운 링크 사용 금지.` : ''}`

          const insightContents: object[] = [
            ...history,
            { role: 'user', parts: [{ text: `${message}\n\n${antwikiContext}` }] },
          ]

          let insightText = ''
          try {
            await geminiStreamWithRotation(
              insightContents,
              [{ googleSearch: {} }],
              insightInstruction,
              (text) => {
                insightText += text
                sendChunk(controller, encoder, { type: 'text', content: text })
              }
            )
          } catch {
            // 인사이트 생성 실패 시 힌트만 표시
          }

          const hintText = sectionHints
            ? `\n\n**다른 섹션에 대해 물어보세요:**\n${sectionHints}`
            : ''
          const appendText = hintText + appendDisclaimerIfMissing(insightText + hintText)

          sendChunk(controller, encoder, { type: 'text', content: appendText })
          insightText += appendText

          // stockLinks 추출 및 전송
          const extractedLinks = extractStockLinksFromText(insightText)
          sendChunk(controller, encoder, {
            type: 'stockLinks',
            stocks: queriedStockForAntwiki
              ? extractedLinks.filter((l) => l.code !== queriedStockForAntwiki.code)
              : extractedLinks,
            queriedStock: queriedStockForAntwiki,
          })

          await supabaseServer.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: insightText.trim(),
          })
          sendChunk(controller, encoder, { type: 'done' })
          return
        }

        // ── 7. Gemini 스트리밍 호출 ───────────────────────────────────
        const geminiTools = [{ googleSearch: {} }]

        if (antwikiContext) {
          finalMessage = `${finalMessage}\n\n${antwikiContext}`
        }

        // PDF 첨부 시 inline data를 user parts에 포함
        const userParts: object[] = []
        if (pdfBase64) {
          userParts.push({ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } })
        }
        userParts.push({ text: finalMessage })

        const contents: object[] = [
          ...history,
          { role: 'user', parts: userParts },
        ]

        // 비교 쿼리는 queriedStock 사용 안 함 (두 종목 모두 인라인 링크 대상)
        const queriedStock: StockLink | null =
          comparisonStocks.length > 0
            ? null
            : stockCode && topStock?.name ? { name: topStock.name, code: stockCode } : null

        const antwikiInstruction = antwikiContext
          ? `\n\n제공된 AntWiki 원문 데이터를 최우선으로 활용하여 답변하세요. 원문의 핵심 정보를 자연스럽게 재구성하되, 사실을 왜곡하지 마세요.`
          : ''

        const pdfInstruction = pdfBase64
          ? `\n\n첨부된 PDF 문서(${pdfFileName ?? 'document.pdf'})를 분석하여 관련 한국 주식 종목, 수혜 산업, 투자 시사점을 도출하세요. 문서 내용을 바탕으로 구체적이고 실질적인 투자 정보를 제공하세요.`
          : ''

        const dynamicInstruction = queriedStock
          ? `${SYSTEM_INSTRUCTION}${antwikiInstruction}${pdfInstruction}\n\n이번 질문의 주 종목(QUERIED_STOCK): ${queriedStock.name}(${queriedStock.code}). 이 종목은 본문에서 마크다운 링크 사용 금지. 답변 맨 마지막에만 바로가기 링크 추가.`
          : `${SYSTEM_INSTRUCTION}${antwikiInstruction}${pdfInstruction}`

        sendChunk(controller, encoder, { type: 'status', content: 'Gaemini 분석 중...' })

        let finalText = ''
        await geminiStreamWithRotation(
          contents,
          geminiTools,
          dynamicInstruction,
          (text) => {
            finalText += text
            sendChunk(controller, encoder, { type: 'text', content: text })
          }
        )

        // 면책 조항 누락 시 보충 (Gemini가 빠뜨린 경우 대비)
        const missingDisclaimer = appendDisclaimerIfMissing(finalText)
        if (missingDisclaimer) {
          sendChunk(controller, encoder, { type: 'text', content: missingDisclaimer })
          finalText += missingDisclaimer
        }

        // stockLinks 추출 및 전송
        const extractedLinks = extractStockLinksFromText(finalText)
        // comparisonStocks + 사용자 입력명(이름 불일치 대비) 병합 — 이미 있는 코드는 제외
        const allCompLinks = [...comparisonStocks, ...comparisonInputNames]
        const mergedLinks = [
          ...extractedLinks,
          ...allCompLinks.filter((cs) => !extractedLinks.some((el) => el.code === cs.code && el.name === cs.name)),
        ]
        const nonQueriedLinks = queriedStock
          ? mergedLinks.filter((l) => l.code !== queriedStock.code)
          : mergedLinks
        sendChunk(controller, encoder, {
          type: 'stockLinks',
          stocks: nonQueriedLinks,
          queriedStock,
          comparisonStocks,
        })

        if (allSources.length > 0) {
          sendChunk(controller, encoder, { type: 'sources', content: allSources })
        }

        // ── 8. DB 저장 ────────────────────────────────────────────────
        // sources: { urls, beneficiaries } 형태로 저장 (복원 시 활용)
        const sourcesPayload = (allSources.length > 0 || persistedBeneficiaries)
          ? { urls: allSources, beneficiaries: persistedBeneficiaries ?? null }
          : null
        await supabaseServer.from('messages').insert({
          conversation_id: convId,
          role: 'assistant',
          content: finalText,
          sources: sourcesPayload,
        })

        // query_cache 저장 (히스토리 없는 질문만, 실시간 데이터 제외)
        if (history.length === 0 && finalText && !isRealtimeQuery) {
          const queryHash = createHash('sha256')
            .update(message.trim().toLowerCase())
            .digest('hex')
          await supabaseServer.from('query_cache').upsert(
            {
              query_hash: queryHash,
              query_text: message,
              response: finalText,
              sources: allSources.length > 0 ? allSources : null,
              hit_count: 1,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'query_hash', ignoreDuplicates: false }
          )
        }

        sendChunk(controller, encoder, { type: 'done' })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[chat/route]', err)
        sendChunk(controller, encoder, {
          type: 'error',
          content: `서버 오류: ${errMsg}`,
        })
      } finally {
        try { controller.close() } catch { /* 이미 닫힌 경우 무시 */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
