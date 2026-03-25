import * as cheerio from 'cheerio'
import { googleSearchTool, geminiGenerateWithRotation, geminiGenerateWithContentsRotation, MODELS_ANALYSIS } from '../gemini'
import { supabaseServer } from '../supabase-server'
import { verifyStockCode, checkTradeStatus } from '../naver-stock'

// ─────────────────────────────────────────────────────────────
// 수혜 강도 가중치 (Short-term / Long-term)
// ─────────────────────────────────────────────────────────────
const SHORT_WEIGHTS: Record<string, number> = {
  directness:          0.20,
  profit_contribution: 0.10,
  penetration_speed:   0.25,
  sustainability:      0.05,
  psychology_scarcity: 0.35,
  financial_readiness: 0.05,
}

const LONG_WEIGHTS: Record<string, number> = {
  directness:          0.20,
  profit_contribution: 0.25,
  penetration_speed:   0.10,
  sustainability:      0.25,
  psychology_scarcity: 0.10,
  financial_readiness: 0.10,
}

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────
interface ScoreBreakdown {
  directness:          number
  profit_contribution: number
  penetration_speed:   number
  sustainability:      number
  psychology_scarcity: number
  financial_readiness: number
}

interface ScoredBeneficiary {
  name:            string
  code:            string
  score_breakdown: ScoreBreakdown
  short_score:     number
  long_score:      number
  narrative:       string
  isSuspended?:    boolean  // 거래정지 여부
}

interface BeneficiaryResult {
  title:         string
  summary:       string
  beneficiaries: ScoredBeneficiary[]
  sources:       string[]
}

// ─────────────────────────────────────────────────────────────
// 점수 계산
// ─────────────────────────────────────────────────────────────
function calcScores(b: ScoreBreakdown): { short_score: number; long_score: number } {
  const short_score = Math.round(
    b.directness          * SHORT_WEIGHTS.directness +
    b.profit_contribution * SHORT_WEIGHTS.profit_contribution +
    b.penetration_speed   * SHORT_WEIGHTS.penetration_speed +
    b.sustainability      * SHORT_WEIGHTS.sustainability +
    b.psychology_scarcity * SHORT_WEIGHTS.psychology_scarcity +
    b.financial_readiness * SHORT_WEIGHTS.financial_readiness
  )
  const long_score = Math.round(
    b.directness          * LONG_WEIGHTS.directness +
    b.profit_contribution * LONG_WEIGHTS.profit_contribution +
    b.penetration_speed   * LONG_WEIGHTS.penetration_speed +
    b.sustainability      * LONG_WEIGHTS.sustainability +
    b.psychology_scarcity * LONG_WEIGHTS.psychology_scarcity +
    b.financial_readiness * LONG_WEIGHTS.financial_readiness
  )
  return { short_score, long_score }
}

// ─────────────────────────────────────────────────────────────
// System Prompt (6개 지표 분석)
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 대한민국 주식 시장 전문 애널리스트입니다.
주어진 뉴스 또는 리포트 내용을 분석하여, 해당 사건으로 인해 상승 가능성이 높은 국내 상장 주식 수혜 종목을 식별합니다.

## 수혜 강도 평가 기준 (각 지표: 0~100 정수)

아래 6가지 지표를 각각 0~100 사이의 정수로 평가하세요.
최종 점수는 시스템이 가중치를 적용하여 계산하므로 score 필드는 출력하지 마세요.

| 지표 | 변수명 | 평가 핵심 질문 |
|---|---|---|
| 직접성 | directness | 뉴스 내용이 실적에 즉각 연결되는가? |
| 이익 기여도 | profit_contribution | 매출 증대뿐 아니라 순이익이 높은가? |
| 침투 속도 | penetration_speed | 해당하는 시장이 얼마나 뉴스나 기사에 민감하게 반응하는가? |
| 지속성 | sustainability | 일회성인가, 구조적 변화인가? |
| 심리/희소성 | psychology_scarcity | 투자자들이 열광할 키워드인가? (독점성) |
| 재무 준비도 | financial_readiness | 호재를 감당할 돈과 설비가 있는가? |

## 분석 내러티브 구조
반드시 아래 4단계 형식으로 서술하세요. 각 단계는 → 로 구분합니다.
**각 단계는 짧은 핵심 문구 하나로만 작성하세요. 절대 두 문장 이상 쓰지 마세요.**
**글자 수 기준: 각 단계별로 띄어쓰기를 제외한 글자 수가 40~55자가 되도록 작성하세요.**

- 1단계 (사건): 40~55자. "~했음", "~함", 또는 명사형으로 끝낼 것.
- 2단계 (현상): 40~55자. "~했음", "~함", 또는 명사형으로 끝낼 것.
- 3단계 (산업/수요 변화): 40~55자. 형식 자유.
- 4단계 (기업 이익): 40~55자. "~했음", "~함", 또는 명사형으로 끝낼 것.

**올바른 예시:**
"미국 정부가 AI 인프라 투자 확대를 공식 발표함 → 글로벌 데이터센터 신규 발주와 서버 수요가 급격히 증가함 → 고대역폭 메모리 및 서버용 반도체 공급 부족 심화 → 삼성전자·SK하이닉스의 HBM 매출 급증 및 실적 개선 기대"

**잘못된 예시 (너무 긺 — 절대 금지):**
"미국 정부가 인공지능 인프라에 대한 대규모 투자 계획을 공식 발표하였으며, 이에 따라 글로벌 시장에서 즉각적인 반응이 나타났고 여러 분야에서 파급 효과가 예상되고 있음 → ..."

## 출력 형식 (JSON만 반환, 다른 텍스트 없음)
\`\`\`json
{
  "summary": "뉴스 요약 1~2문장",
  "beneficiaries": [
    {
      "name": "종목명",
      "code": "6자리 종목코드",
      "score_breakdown": {
        "directness": 75,
        "profit_contribution": 60,
        "penetration_speed": 80,
        "sustainability": 50,
        "psychology_scarcity": 70,
        "financial_readiness": 55
      },
      "narrative": "A 발생함 → B 심화됨 → C 수요 증가 → D 매출 급증"
    }
  ]
}
\`\`\`

## 규칙
- 수혜 종목은 3~7개 사이로 식별하세요.
- 수혜 종목을 뽑는 기준은 수혜 강도 평가 기준의 6가지 지표를 기반으로 해서 상위 4~6개의 종목을 선정합니다.
- KOSPI, KOSDAQ, KONEX 상장 종목만 포함하세요.
- 종목코드는 반드시 6자리 숫자로 작성하세요.
- score 필드는 절대 출력하지 마세요. score_breakdown의 6개 지표만 출력하세요.
- JSON 외의 텍스트는 절대 출력하지 마세요.`

// ─────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────
async function fetchNewsContent(url: string): Promise<{ title: string; body: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null

    const html = await res.text()
    const $ = cheerio.load(html)

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim()

    $('nav, header, footer, script, style, .ad, .sidebar, iframe').remove()

    const body = $(
      'article, #articleBody, .article-body, .news-body, .content-body, main, body'
    )
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)

    return { title, body }
  } catch {
    return null
  }
}

const NEWS_DOMAINS = [
  'news.naver.com', 'n.news.naver.com', 'hankyung.com', 'chosun.com',
  'joins.com', 'joongang.co.kr', 'donga.com', 'yonhapnews.co.kr', 'yna.co.kr',
  'mk.co.kr', 'edaily.co.kr', 'etnews.com', 'zdnet.co.kr', 'bloter.net',
  'news1.kr', 'newsis.com', 'asiae.co.kr', 'sedaily.com', 'thebell.co.kr',
  'fn.co.kr', 'fnnews.com', 'mt.co.kr', 'moneys.mt.co.kr', 'reuters.com',
  'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'investing.com',
  'finance.yahoo.com', 'seekingalpha.com', 'bizwatch.co.kr', 'infostock.co.kr',
]

const NEWS_KEYWORDS = [
  '기자', '특파원', '연합뉴스', '뉴스', '증권', '주가', '투자', '코스피',
  '코스닥', '실적', '매출', '영업이익', '주식', '종목', '수혜', '리포트',
]

function isNewsOrResearch(url: string, content: string): boolean {
  // 1. 알려진 뉴스/금융 도메인
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    if (NEWS_DOMAINS.some((d) => hostname.includes(d))) return true
  } catch {}

  // 2. 콘텐츠 키워드 2개 이상 + 최소 길이
  const matched = NEWS_KEYWORDS.filter((kw) => content.includes(kw)).length
  return matched >= 2 && content.length > 300
}

// ─────────────────────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────────────────────
export async function executeFindBeneficiaries(
  url: string,
  userId?: string
): Promise<BeneficiaryResult | { error: string }> {
  // 1. 캐시 조회 (동일 URL 재분석 방지)
  const { data: cached } = await supabaseServer
    .from('analyses')
    .select('news_title, beneficiaries')
    .eq('news_url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.beneficiaries) {
    const beneficiaries = cached.beneficiaries as ScoredBeneficiary[]
    return {
      title: cached.news_title ?? url,
      summary: '(캐시된 분석 결과입니다)',
      beneficiaries,
      sources: [url],
    }
  }

  // 2. 뉴스 크롤링
  const news = await fetchNewsContent(url)
  if (!news) return { error: '기사를 가져올 수 없습니다. URL을 확인해주세요.' }

  // 3. 뉴스/리서치 여부 검증
  const valid = isNewsOrResearch(url, news.body)
  if (!valid) return { error: '입력된 URL이 뉴스 기사 또는 금융 리서치 자료가 아닙니다.' }

  // 4. 6개 지표 수혜주 분석
  const prompt = `제목: ${news.title}\n\n본문:\n${news.body}`
  const { text } = await geminiGenerateWithRotation(prompt, undefined, SYSTEM_PROMPT, MODELS_ANALYSIS)

  const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let parsed: { summary: string; beneficiaries: Array<{ name: string; code: string; score_breakdown: ScoreBreakdown; narrative: string }> }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }
  }

  // 5. short_score / long_score 계산 + 네이버 종목코드 검증 (병렬)
  const scored: ScoredBeneficiary[] = await Promise.all(
    parsed.beneficiaries.map(async (b) => {
      const [verified, isSuspended] = await Promise.all([
        verifyStockCode(b.name, b.code),
        checkTradeStatus(b.code),
      ])
      return {
        ...b,
        name: verified.name,
        code: verified.code,
        ...calcScores(b.score_breakdown),
        isSuspended,
      }
    })
  )

  // 6. DB 저장 (userId 있을 때만)
  if (userId) {
    await supabaseServer.from('analyses').insert({
      user_id: userId,
      news_url: url,
      news_title: news.title,
      beneficiaries: scored,
    })
  }

  return {
    title: news.title,
    summary: parsed.summary,
    beneficiaries: scored,
    sources: [url],
  }
}

// ─────────────────────────────────────────────────────────────
// 수혜주 의도 감지 (다양한 키워드 패턴 지원)
// ─────────────────────────────────────────────────────────────
const BENEFICIARY_KEYWORDS = [
  '수혜',           // 수혜주, 수혜 종목, 수혜를 받는
  '관련주',          // AI 관련주, 반도체 관련주
  '관련 주식',
  '관련종목',
  '관련 종목',
  '테마주',          // 2차전지 테마주
  '어떤 종목이 오를',
  '어떤종목이오를',
  '오를 것 같은 종목',
  '오를만한 종목',
  '주목할 종목',
  '투자 유망',
  '유망 종목',
  '혜택받는',
  '혜택 받는',
  '이 뉴스로 어떤',
  '어떤 주식에 투자',
]

export function detectBeneficiaryIntent(message: string): boolean {
  const normalized = message.replace(/\s/g, '')
  return BENEFICIARY_KEYWORDS.some((kw) => normalized.includes(kw.replace(/\s/g, '')))
}

// ─────────────────────────────────────────────────────────────
// 토픽 기반 수혜주 분석 (URL 없이 키워드만 주어졌을 때)
// 2단계: Google Search로 컨텍스트 수집 → SYSTEM_PROMPT로 구조화 분석
// ─────────────────────────────────────────────────────────────
export async function executeFindBeneficiariesFromTopic(
  topic: string,
  userId?: string
): Promise<BeneficiaryResult | { error: string }> {
  // Google Search grounding + SYSTEM_PROMPT 단일 호출
  // Gemini가 최신 뉴스를 검색하면서 동시에 6개 지표 JSON 직접 출력
  const prompt = `다음 주제와 관련된 최신 뉴스 및 정보를 검색하고, 그 내용을 바탕으로 수혜를 받을 국내 상장 주식 종목을 분석하세요.

주제: ${topic}`

  const { text } = await geminiGenerateWithRotation(prompt, [googleSearchTool], SYSTEM_PROMPT, MODELS_ANALYSIS)

  // Google Search grounding은 JSON 뒤에 인용 메타데이터({url:...} 등)를 추가할 수 있음.
  // lastIndexOf('}') 대신 괄호 카운팅으로 첫 '{' 에 정확히 매칭되는 '}' 를 찾는다.
  const start = text.indexOf('{')
  if (start === -1) return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }

  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }

  const jsonText = text.slice(start, end + 1)

  let parsed: {
    summary: string
    beneficiaries: Array<{ name: string; code: string; score_breakdown: ScoreBreakdown; narrative: string }>
  }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }
  }

  // short_score / long_score 계산 + 네이버 종목코드 검증 (URL 흐름과 동일)
  const scored: ScoredBeneficiary[] = await Promise.all(
    parsed.beneficiaries.map(async (b) => {
      const [verified, isSuspended] = await Promise.all([
        verifyStockCode(b.name, b.code),
        checkTradeStatus(b.code),
      ])
      return {
        ...b,
        name: verified.name,
        code: verified.code,
        ...calcScores(b.score_breakdown),
        isSuspended,
      }
    })
  )

  if (userId) {
    await supabaseServer.from('analyses').insert({
      user_id: userId,
      news_url: null,
      news_title: topic,
      beneficiaries: scored,
    })
  }

  return {
    title: topic,
    summary: parsed.summary,
    beneficiaries: scored,
    sources: [],
  }
}
// ─────────────────────────────────────────────────────────────
// PDF 기반 수혜주 분석 (PDF inline data → Gemini 직접 분석)
// ─────────────────────────────────────────────────────────────
export async function executeFindBeneficiariesFromPdf(
  pdfBase64: string,
  fileName: string = 'document.pdf',
  userId?: string
): Promise<BeneficiaryResult | { error: string }> {
  const contents = [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
        { text: '위 PDF 문서 내용을 분석하여 수혜를 받을 국내 상장 주식 종목을 식별하세요.' },
      ],
    },
  ]

  const { text } = await geminiGenerateWithContentsRotation(contents, SYSTEM_PROMPT, MODELS_ANALYSIS)

  // JSON 블록 추출 (괄호 카운팅 방식)
  const start = text.indexOf('{')
  if (start === -1) return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }

  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }

  let parsed: {
    summary: string
    beneficiaries: Array<{ name: string; code: string; score_breakdown: ScoreBreakdown; narrative: string }>
  }
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { error: '분석 결과를 파싱할 수 없습니다. 다시 시도해주세요.' }
  }

  const scored: ScoredBeneficiary[] = await Promise.all(
    parsed.beneficiaries.map(async (b) => {
      const [verified, isSuspended] = await Promise.all([
        verifyStockCode(b.name, b.code),
        checkTradeStatus(b.code),
      ])
      return {
        ...b,
        name: verified.name,
        code: verified.code,
        ...calcScores(b.score_breakdown),
        isSuspended,
      }
    })
  )

  if (userId) {
    await supabaseServer.from('analyses').insert({
      user_id: userId,
      news_url: null,
      news_title: fileName,
      beneficiaries: scored,
    })
  }

  return {
    title: fileName,
    summary: parsed.summary,
    beneficiaries: scored,
    sources: [],
  }
}

// ─── 섹션 키워드 맵 ───────────────────────────────────────────────────
export const SECTION_KEYWORD_MAP: Array<{ keywords: string[]; section: string} > = [
  { keywords: ['개요', '정보', '소개', '설명', '어떤 회사', '어떤회사', '종목 개요', '종목개요'], section: '기업 및 종목 개요' },
  { keywords: ['비즈니스', '사업 모델', '사업모델', '사업구조', '사업 구조', '어떻게 돈', '수익구조'], section: '비즈니스 모델' },
  { keywords: ['실적', '재무', '매출', '영업이익', '순이익', '분기', '연간'], section: '실적' },
  { keywords: ['주주', '지분', '대주주', '최대주주', '주주 구성', '주주구성'], section: '주주 구성 및 지분 변동 히스토리' },
  { keywords: ['계열사', '자회사', '관계사', '그룹사'], section: '주요 계열사' },

  { keywords: ['타사', '경쟁사', '경쟁 관계', '경쟁관계', '협력 관계', '협력관계', '경쟁'], section: '타사와의 관계' },
  { keywords: ['기대', '우려'], section: '최근 주주들의 기대 및 우려' },
  { keywords: ['공시', '뉴스', '최근 소식', '최근소식', '발표'], section: '공시' },
  { keywords: ['테마', '관련주', '테마주'], section: '테마' },
]
