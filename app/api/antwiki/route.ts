import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { crawlAntWikiBrowser } from '@/lib/antwiki-browser'

export const runtime = 'nodejs'
export const maxDuration = 60

const CACHE_TTL_HOURS = 24

function isCacheExpired(cachedAt: string): boolean {
  return new Date(cachedAt).getTime() + CACHE_TTL_HOURS * 3600 * 1000 < Date.now()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim()

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '유효한 6자리 종목코드가 필요합니다.' }, { status: 400 })
  }

  // 1. DB 캐시 조회
  const { data: cached } = await supabaseServer
    .from('wiki_cache')
    .select('*')
    .eq('stock_code', code)
    .maybeSingle()

  if (cached && !isCacheExpired(cached.cached_at) && cached.sections) {
    return NextResponse.json({
      stockCode: cached.stock_code,
      stockName: cached.stock_name,
      url: cached.url,
      sections: cached.sections,
      themes: cached.themes ?? [],
      fromCache: true,
    })
  }

  // 2. Playwright 크롤링
  const fresh = await crawlAntWikiBrowser(code)
  if (!fresh) {
    return NextResponse.json({ error: '페이지를 가져올 수 없습니다.' }, { status: 502 })
  }

  // 3. DB 저장
  await supabaseServer.from('wiki_cache').upsert(
    {
      stock_code: fresh.stockCode,
      stock_name: fresh.stockName,
      content: fresh.sections.map((s) => `${s.num}. ${s.title}\n${s.content}`).join('\n\n'),
      url: fresh.url,
      sections: fresh.sections,
      themes: fresh.themes,
      cached_at: new Date().toISOString(),
    },
    { onConflict: 'stock_code' }
  )

  // 테마 저장
  if (fresh.themes.length > 0) {
    await supabaseServer.from('stock_themes').upsert(
      fresh.themes.map((tag) => ({
        stock_code: fresh.stockCode,
        theme_tag: tag,
        stock_name: fresh.stockName,
      })),
      { onConflict: 'stock_code,theme_tag', ignoreDuplicates: true }
    )
  }

  return NextResponse.json({ ...fresh, fromCache: false })
}
