/**
 * scripts/seed-kospi100.ts
 *
 * 코스피 100 주요 종목을 wiki_cache 및 stock_themes 테이블에 초기 적재합니다.
 * 실행: npx ts-node scripts/seed-kospi100.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 시드 작업은 service role 키 사용
)

// ─────────────────────────────────────────────────────────────
// 코스피 100 종목 목록 (코드 : 종목명)
// ─────────────────────────────────────────────────────────────
export const KOSPI100: { code: string; name: string }[] = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '207940', name: '삼성바이오로직스' },
  { code: '005380', name: '현대차' },
  { code: '000270', name: '기아' },
  { code: '068270', name: '셀트리온' },
  { code: '051910', name: 'LG화학' },
  { code: '005490', name: 'POSCO홀딩스' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '055550', name: '신한지주' },
  { code: '105560', name: 'KB금융' },
  { code: '086790', name: '하나금융지주' },
  { code: '032830', name: '삼성생명' },
  { code: '138040', name: '메리츠금융지주' },
  { code: '316140', name: '우리금융지주' },
  { code: '024110', name: '기업은행' },
  { code: '000810', name: '삼성화재' },
  { code: '088350', name: '한화생명' },
  { code: '003550', name: 'LG' },
  { code: '034730', name: 'SK' },
  { code: '066570', name: 'LG전자' },
  { code: '009150', name: '삼성전기' },
  { code: '006400', name: '삼성SDI' },
  { code: '003670', name: '포스코퓨처엠' },
  { code: '042700', name: '한미반도체' },
  { code: '402340', name: 'SK스퀘어' },
  { code: '017670', name: 'SK텔레콤' },
  { code: '030200', name: 'KT' },
  { code: '032640', name: 'LG유플러스' },
  { code: '096770', name: 'SK이노베이션' },
  { code: '010950', name: 'S-Oil' },
  { code: '009830', name: '한화솔루션' },
  { code: '011170', name: '롯데케미칼' },
  { code: '011780', name: '금호석유' },
  { code: '012330', name: '현대모비스' },
  { code: '086280', name: '현대글로비스' },
  { code: '018880', name: '한온시스템' },
  { code: '064350', name: '현대로템' },
  { code: '028260', name: '삼성물산' },
  { code: '000720', name: '현대건설' },
  { code: '006360', name: 'GS건설' },
  { code: '028050', name: '삼성엔지니어링' },
  { code: '047040', name: '대우건설' },
  { code: '009540', name: 'HD한국조선해양' },
  { code: '329180', name: 'HD현대중공업' },
  { code: '010620', name: '현대미포조선' },
  { code: '042660', name: '한화오션' },
  { code: '034020', name: '두산에너빌리티' },
  { code: '012450', name: '한화에어로스페이스' },
  { code: '079550', name: 'LIG넥스원' },
  { code: '047810', name: '한국항공우주' },
  { code: '018260', name: '삼성에스디에스' },
  { code: '015760', name: '한국전력' },
  { code: '036460', name: '한국가스공사' },
  { code: '010130', name: '고려아연' },
  { code: '004020', name: '현대제철' },
  { code: '326030', name: 'SK바이오팜' },
  { code: '003490', name: '대한항공' },
  { code: '180640', name: '한진칼' },
  { code: '000120', name: 'CJ대한통운' },
  { code: '097950', name: 'CJ제일제당' },
  { code: '033780', name: 'KT&G' },
  { code: '271560', name: '오리온' },
  { code: '282330', name: 'BGF리테일' },
  { code: '139480', name: '이마트' },
  { code: '023530', name: '롯데쇼핑' },
  { code: '004370', name: '농심' },
  { code: '007070', name: 'GS리테일' },
  { code: '000080', name: '하이트진로' },
  { code: '035250', name: '강원랜드' },
  { code: '030000', name: '제일기획' },
  { code: '259960', name: '크래프톤' },
  { code: '036570', name: '엔씨소프트' },
  { code: '251270', name: '넷마블' },
  { code: '263750', name: '펄어비스' },
  { code: '047050', name: '포스코인터내셔널' },
  { code: '011200', name: 'HMM' },
  { code: '000990', name: 'DB하이텍' },
  { code: '030610', name: '교보증권' },
  { code: '071050', name: '한국금융지주' },
  { code: '039490', name: '키움증권' },
  { code: '016360', name: '삼성증권' },
  { code: '006800', name: '미래에셋증권' },
  { code: '001450', name: '현대해상' },
  { code: '000370', name: '한화손해보험' },
  { code: '002790', name: '아모레퍼시픽그룹' },
  { code: '090430', name: '아모레퍼시픽' },
  { code: '051900', name: 'LG생활건강' },
  { code: '008770', name: '호텔신라' },
  { code: '004170', name: '신세계' },
  { code: '069960', name: '현대백화점' },
  { code: '018830', name: '삼성에스디아이' },
  { code: '014680', name: '한화비전' },
  { code: '003230', name: '삼양식품' },
  { code: '005180', name: '빙그레' },
  { code: '000100', name: '유한양행' },
  { code: '128940', name: '한미약품' },
]

// ─────────────────────────────────────────────────────────────
// wiki_cache에 종목 기본 정보만 먼저 적재 (content는 빈 값)
// 실제 크롤링은 사용자 질문 시 on-demand로 수행됩니다.
// ─────────────────────────────────────────────────────────────
async function seedWikiCache() {
  console.log(`📦 wiki_cache 시드 시작 (${KOSPI100.length}개 종목)`)

  const rows = KOSPI100.map(({ code, name }) => ({
    stock_code: code,
    stock_name: name,
    content: '',           // on-demand 크롤링 전까지 빈 값
    url: `https://www.ant.wiki/wiki/${code}`,
    cached_at: new Date(0).toISOString(), // 즉시 만료 → 첫 질문 시 크롤링 트리거
  }))

  const { error } = await supabase
    .from('wiki_cache')
    .upsert(rows, { onConflict: 'stock_code' })

  if (error) {
    console.error('❌ wiki_cache 적재 실패:', error.message)
  } else {
    console.log(`✅ wiki_cache 적재 완료: ${rows.length}개`)
  }
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  await seedWikiCache()
  console.log('\n🎉 시드 완료. 이후 크롤링은 사용자 질문 시 자동 수행됩니다.')
}

main().catch(console.error)
