/**
 * Playwright 기반 AntWiki 크롤러
 * CSR(클라이언트 사이드 렌더링) 페이지를 headless Chromium으로 실제 렌더링 후 텍스트 추출
 */
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { SECTION_KEYWORD_MAP } from './tools/beneficiary-logic'
import { ANTWIKI_BASE_URL } from './constants'

const ANTWIKI_BASE = ANTWIKI_BASE_URL

export interface AntWikiSubsection {
  numPart: string   // e.g., "9.1"
  title: string     // e.g., "현대엔지니어링"
  firstLine: string // 첫 번째 문장
}

export interface AntWikiSection {
  num: number
  title: string
  content: string
  subsections: AntWikiSubsection[]
}

export interface AntWikiPageData {
  stockCode: string
  stockName: string
  url: string
  sections: AntWikiSection[]
  themes: string[]
}

const WINDOWS_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME ?? '') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
]

async function getBrowser() {
  // 배포 환경 (Vercel/Linux): @sparticuz/chromium-min 사용
  if (process.env.NODE_ENV === 'production') {
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
    )
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath,
      headless: true,
    })
  }

  // 로컬 개발 환경: 설치된 Chrome 사용
  const fs = await import('fs')
  const localPath =
    process.env.CHROMIUM_EXECUTABLE_PATH ??
    WINDOWS_CHROME_PATHS.find((p) => fs.existsSync(p)) ??
    '/usr/bin/google-chrome' // Linux 로컬 폴백

  if (process.env.NODE_ENV === 'development') {
    console.log('[antwiki-browser] 로컬 Chrome:', localPath)
  }

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 },
    executablePath: localPath,
    headless: true,
  })
}

export async function crawlAntWikiBrowser(stockCode: string): Promise<AntWikiPageData | null> {
  const url = `${ANTWIKI_BASE}/wiki/${stockCode}`
  let browser

  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (['image', 'font', 'media'].includes(req.resourceType())) {
        req.abort()
      } else {
        req.continue()
      }
    })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
    await page.waitForSelector('h1, h2, h3', { timeout: 10000 }).catch(() => {})

    const data = await page.evaluate(() => {
      const stockName =
        document.querySelector('h1')?.textContent?.trim() ||
        document.title.split('|')[0].trim() ||
        ''

      const themes: string[] = []
      document.querySelectorAll('a[href*="/theme/"], [class*="theme"], [class*="tag"]').forEach((el) => {
        const text = el.textContent?.trim()
        if (text && text.length < 20) themes.push(text)
      })

      // ── DOM 워커: 구조를 보존하는 텍스트 추출 ────────────────────
      function nodeToText(node: ChildNode): string {
        if (node.nodeType === 3) return node.textContent ?? ''
        if (node.nodeType !== 1) return ''
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (['script', 'style', 'noscript', 'nav', 'header', 'footer'].includes(tag)) return ''
        // 버튼 전체 스킵 (h2 핸들러가 섹션 마커를 직접 생성하므로 불필요)
        if (tag === 'button') return ''
        const inner = Array.from(el.childNodes).map(nodeToText).join('')
        // 메인 섹션 헤딩 h2: 숫자 패턴으로 감지, 클래스 의존 없이 마커 보장
        if (tag === 'h2') {
          const titlePart = inner.replace(/히스토리편집/g, '').replace(/편집/g, '').replace(/\s+/g, ' ').trim()
          if (/^\d{1,2}\./.test(titlePart)) {
            return '\n' + titlePart + '⌂\n'
          }
          return '\n' + titlePart + '\n'
        }
        // 서브섹션 헤딩 (heading-node): data-heading-num 속성으로 번호 읽기
        if (tag === 'h3' || tag === 'h4' || tag === 'h5') {
          const headingNum = el.getAttribute('data-heading-num') ?? ''
          const prefix = headingNum ? headingNum + ' ' : ''
          return '\n\n### ' + prefix + inner.trim() + '\n\n'
        }
        if (tag === 'li') return '\n- ' + inner.trim()
        if (tag === 'ul' || tag === 'ol') return '\n\n' + inner + '\n'
        if (tag === 'br') return '\n'
        if (tag === 'p') return '\n\n' + inner.trim() + '\n\n'
        return inner
      }

      const bodyClone = document.body.cloneNode(true) as HTMLElement
      const rawFlat = Array.from(bodyClone.childNodes)
        .map(nodeToText)
        .join('')
        .replace(/[^\S\n]+/g, ' ')   // 수평 공백만 단일 스페이스로 압축
        .replace(/\n{3,}/g, '\n\n')  // 연속 줄바꿈 최대 2개로 제한
        .trim()

      // 상위 섹션 헤딩 패턴: "N.제목히스토리편집" 또는 "N.제목 히스토리편집"
      // - N: 1~2자리 정수
      // - 제목: 비숫자 문자로 시작, 최대 60자 (비탐욕적)
      // - 히스토리/편집: 섹션 경계 마커 (버튼 노이즈)
      const HEADING_RE = /(\d{1,2})\.([^\n⌂]+?)⌂/g

      const headings: Array<{
        num: number
        title: string
        matchStart: number
        contentStart: number
      }> = []
      const seenNums = new Set<number>()

      for (const m of rawFlat.matchAll(HEADING_RE)) {
        const num = parseInt(m[1])
        const title = m[2].trim()
        if (num < 1 || num > 30 || title.length < 2) continue
        if (seenNums.has(num)) continue // 중복 섹션 번호 제거 (티커 반복 등)
        seenNums.add(num)
        headings.push({
          num,
          title,
          matchStart: m.index!,
          contentStart: m.index! + m[0].length,
        })
      }

      const sections: {
        num: number
        title: string
        content: string
        subsections: { numPart: string; title: string; firstLine: string }[]
      }[] = []

      for (let i = 0; i < headings.length; i++) {
        const cur = headings[i]
        const next = headings[i + 1]
        const rawContent = (
          next
            ? rawFlat.slice(cur.contentStart, next.matchStart)
            : rawFlat.slice(cur.contentStart)
        )
          .replace(/\n\n###\s*다음에\s*뭐사지\?[\s\S]*/g, '')
          .replace(/UpAntDown더보기[\s\S]*/g, '')
          .trim()
        // 섹션 제목을 content 상단에 ## heading으로 삽입
        const content = `## ${cur.num}. ${cur.title}\n\n${rawContent}`

        sections.push({ num: cur.num, title: cur.title, content, subsections: [] })
      }

      return { stockName, themes: [...new Set(themes)], sections }
    })


    return {
      stockCode,
      stockName: data.stockName,
      url,
      sections: data.sections,
      themes: data.themes,
    }
  } catch (err) {
    console.error('[antwiki-browser] 크롤링 실패:', err)
    return null
  } finally {
    await browser?.close()
  }
}

export function findSection(sections: AntWikiSection[], keyword: string): AntWikiSection | null {
  const lower = keyword.toLowerCase()
  return (
    sections.find((s) => s.title.toLowerCase().includes(lower)) ||
    sections.find((s) => s.content.toLowerCase().includes(lower)) ||
    null
  )
}

export function detectSectionKeyword(message: string): string | null {
  for (const { keywords, section } of SECTION_KEYWORD_MAP) {
    if (keywords.some((kw) => message.includes(kw))) return section
  }
  return null
}

export async function getAntWikiSections(
  stockCode: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<AntWikiPageData | null> {
  const CACHE_TTL_HOURS = 24

  const { data: cached } = await db
    .from('wiki_cache')
    .select('*')
    .eq('stock_code', stockCode)
    .maybeSingle()

  if (cached?.sections) {
    const expired =
      new Date(cached.cached_at).getTime() + CACHE_TTL_HOURS * 3600 * 1000 < Date.now()
    if (!expired) {
      return {
        stockCode: cached.stock_code,
        stockName: cached.stock_name,
        url: cached.url,
        sections: cached.sections as AntWikiSection[],
        themes: cached.themes ?? [],
      }
    }
  }

  const fresh = await crawlAntWikiBrowser(stockCode)
  if (!fresh) return null

  await db.from('wiki_cache').upsert(
    {
      stock_code: fresh.stockCode,
      stock_name: fresh.stockName,
      content: fresh.sections.map((s: AntWikiSection) => `${s.num}. ${s.title}\n${s.content}`).join('\n\n'),
      url: fresh.url,
      sections: fresh.sections,
      themes: fresh.themes,
      cached_at: new Date().toISOString(),
    },
    { onConflict: 'stock_code' }
  )

  return fresh
}
