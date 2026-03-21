export const TOOL_NAMES = {
  FIND_BENEFICIARIES: 'find_beneficiaries',
  GET_ANTWIKI_DATA: 'get_antwiki_data',
} as const

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES]

export const toolDefinitions = [
  {
    name: TOOL_NAMES.FIND_BENEFICIARIES,
    description:
      '뉴스 URL을 분석하여 해당 뉴스의 수혜주(beneficiary stocks)를 찾아 반환합니다.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '분석할 뉴스 기사의 URL',
        },
      },
      required: ['url'],
    },
  },
  {
    name: TOOL_NAMES.GET_ANTWIKI_DATA,
    description:
      'AntWiki에서 종목 정보 또는 테마별 종목 목록을 조회합니다. Supabase 캐시를 우선 사용하고, 없으면 크롤링합니다.',
    parameters: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          enum: ['stock', 'theme', 'search'],
          description:
            'stock: 종목 코드로 조회, theme: 테마 태그로 종목 목록 조회, search: 키워드 검색',
        },
        keyword: {
          type: 'string',
          description: '종목 코드(6자리), 테마명, 또는 검색 키워드',
        },
        limit: {
          type: 'number',
          description: '반환할 최대 결과 수 (기본값: 10)',
        },
      },
      required: ['query_type', 'keyword'],
    },
  },
]
