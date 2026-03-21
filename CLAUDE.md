
# Gaemini 지침서 (Agentic Workflow)

이 문서는 `ant.wiki`의 데이터를 활용하여 **에이전트형 투자 비서 "Gaemini"** 를 구축하기 위한 최종 개발 및 아키텍처 지침서입니다.

---

## 1. 기술 스택 (Tech Stack)

초기 비용 Zero를 목표로 하는 Serverless 아키텍처를 기반으로 합니다.

| 구분                   | 기술                    | 비고                               |
| ---------------------- | ----------------------- | ---------------------------------- |
| **Frontend**     | Next.js 16 (App Router) | Vercel 무료 배포 최적화            |
| **Backend**      | Next.js API Routes      | Serverless (`runtime = 'nodejs'`, Edge Runtime 사용 불가) |
| **Database**     | Supabase (PostgreSQL)   | 무료 티어, RLS 비활성화(개발 단계) |
| **Styling**      | Tailwind CSS            | ant.wiki 유사 UI (오렌지 브랜드)   |
| **AI / Parsing** | Gemini 2.0/2.5 Flash    | `@google/generative-ai` SDK 사용   |
| **Auth**         | Supabase Auth           | 이메일+비밀번호, 비로그인 완전 차단 |

---

## 2. 프로젝트 맥락 및 아키텍처

### 2.1 모듈 통합 전략

* **외부 로직 연동** : 기존 미배포 프로젝트(`beneficiary-finder`)의 함수를 이 프로젝트 `lib/` 폴더에 직접 복사하여 재사용합니다. (`pnpm link` 미사용 — Vercel 배포 시 로컬 경로 참조 불가)
* 복사 대상: `crawler.ts`, `gemini.ts`, `naver-stock.ts`, `supabase.ts`, `supabase-server.ts`, `tools/definitions.ts`, `tools/beneficiary-logic.ts`

### 2.2 서비스 흐름 및 스트리밍 처리

서버리스 함수의 실행 시간 제한(Vercel 기준 10~30초)을 극복하기 위해 모든 응답은 **Streaming** 방식을 채택합니다.

1. **의도 분석** : 입력 즉시 스트림을 시작하고 현재 작업 단계(Status)를 UI에 먼저 전달합니다.
2. **단계적 출력** : 도구 실행 결과가 도출될 때마다 즉시 프론트엔드에 스트리밍하여 타임아웃을 방지하고 사용자 경험을 개선합니다.

### 2.3 Gemini API Key Rotation 전략

3개의 키를 보유 (1 Pro, 2 Free). **Pro 키를 항상 먼저 시도**합니다.

```
GEMINI_API_KEY_1 (Pro)  → 1순위
GEMINI_API_KEY_2 (Free) → 429 발생 시 교체
GEMINI_API_KEY_3 (Free) → KEY_2도 429 시 최종 교체
```

---

## 3. Supabase 스키마

```sql
-- Auth: Supabase Auth 자동 생성 (auth.users)

-- 유저별 대화 세션
create table conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  title        text,
  created_at   timestamptz default now()
);

-- 대화 내 메시지 (user / assistant)
create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  role             text check (role in ('user', 'assistant')),
  content          text,
  sources          jsonb,   -- AntWiki 링크 등 출처 배열
  created_at       timestamptz default now()
);

-- 질문 캐시 (완전 동일한 질문 해시 매칭)
create table query_cache (
  id          uuid primary key default gen_random_uuid(),
  query_hash  text unique,   -- SHA-256(정규화된 질문)
  query_text  text,
  response    text,
  sources     jsonb,
  hit_count   int default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- AntWiki 종목 위키 크롤링 캐시 (TTL: 24시간, WIKI_CACHE_TTL_HOURS 상수로 관리)
create table wiki_cache (
  id          uuid primary key default gen_random_uuid(),
  stock_code  text unique,
  stock_name  text,
  content     text,
  url         text,     -- https://www.ant.wiki/wiki/{code}
  cached_at   timestamptz default now()
);

-- 종목-테마 매핑 (wiki_cache 크롤링 시 테마 태그 파싱하여 저장)
create table stock_themes (
  stock_code  text,
  theme_tag   text,
  stock_name  text,
  primary key (stock_code, theme_tag)
);

-- find_beneficiaries 분석 결과 저장
create table analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id),
  news_url     text,
  news_title   text,
  beneficiaries jsonb,
  created_at   timestamptz default now()
);
```

### 초기 시드 데이터 전략

* **코스피 100** 종목 코드 목록을 `stock_themes` 및 `wiki_cache` 테이블에 미리 크롤링하여 저장합니다.
* 코스피 100 외 종목은 **사용자 질문 시 on-demand 크롤링** 후 DB에 저장 (이후 요청은 캐시 활용).

---

## 4. LLM 상세 지침 (Tool Use & Reasoning)

### [Tool 정의 및 호출 스키마]

1. **`find_beneficiaries(url)`** : 뉴스 분석 파이프라인 실행.
2. **`get_antwiki_data(query_type, keyword?, limit?)`** : AntWiki 사이트(Cheerio 크롤링) 및 Supabase 조회.
3. **`googleSearchTool`** : Gemini 내장 실시간 검색 (`googleSearchRetrieval`).

### [데이터 활용 및 응답 원칙]

* **우선순위** : [AntWiki DB/크롤링] → [Google Search] → [Gemini 자체 지식] 순으로 탐색합니다.

* **AntWiki 바로가기 링크 필수 포함 (중요)** :
  * 답변과 관련된 AntWiki 페이지가 존재할 경우, 답변 **가장 마지막**에 바로가기 링크를 반드시 포함합니다.
  * 형식:
    ```
    🔗 [AntWiki에서 자세히 보기 → 삼성전자](https://www.ant.wiki/wiki/005930)
    ```
  * 여러 종목이 연관된 경우 각 종목별 링크를 모두 나열합니다.
  * AntWiki에서 정보를 가져왔든 Google Search/Gemini로 답변했든, 관련 종목 페이지가 있으면 링크를 포함합니다.

* **테마 쿼리 처리** :
  * `stock_themes` 테이블에서 해당 테마 태그로 종목 목록 조회.
  * DB에 없을 경우 `googleSearchTool` 폴백.

* **데이터 부재 시 대응** :
  * AntWiki 데이터 부족 시 외부 정보(Google Search 등)를 활용하되 출처를 명시합니다.
  * 모든 수단으로도 정보가 없을 경우에만 "정보를 찾을 수 없습니다."를 반환합니다.

---

## 5. 개발 핵심 Task 구체화 (Implementation Details)

### 과제 1: `lib/tools/beneficiary-logic.ts`
* `beneficiary-finder`에서 복사, 에러 없이 임포트하여 단일 파이프라인으로 구축합니다.

### 과제 2: `lib/tools/definitions.ts`
* `TOOL_NAMES` 상수를 사용하여 오타를 방지하고 도구의 용도를 명확히 정의합니다.

### 과제 3: `lib/tools/antwiki-data.ts` (신규)
* `get_antwiki_data` 도구의 실제 실행 로직.
* `wiki_cache` TTL 체크 → 만료 시 크롤링 → 저장.
* `stock_themes` 테마 태그 파싱 저장.
* TTL 상수: `const WIKI_CACHE_TTL_HOURS = 24` (필요 시 변경).

### 과제 4: `app/api/chat/route.ts` (오케스트레이터)
* **runtime**: `export const runtime = 'nodejs'`
* **Key Rotation 로직** : 429 에러 발생 시 다음 키로 자동 교체 후 재시도.
* **query_cache** : 요청 수신 시 SHA-256 해시로 캐시 조회 → 히트 시 즉시 스트리밍 반환.
* **링크 생성 로직** : `get_antwiki_data` 반환 데이터에 `stock_code` 포함 → LLM이 `ant.wiki/wiki/{code}` 링크 자동 생성.

### 과제 5: Frontend UI (`app/`)
* **브랜드**: 서비스명 "Gaemini", ant.wiki 오렌지 계열 컬러
* **레이아웃**: 좌측 사이드바(대화 히스토리) + 중앙 채팅 영역
* **컴포넌트**:
  * `StatusIndicator` : 실시간 작업 단계 표시
  * `MessageBubble` : Markdown 렌더링 (`react-markdown`)
  * `AntWikiLinkCard` : 답변 하단 AntWiki 바로가기 버튼 (시각적 강조)

### 과제 6: Auth (`app/auth/`)
* Supabase Auth (이메일 + 비밀번호).
* 비로그인 사용자 → 모든 채팅 기능 완전 차단, 로그인 페이지로 리다이렉트.
* 로그인/회원가입 페이지 구현.

---

## 6. 예외 처리 가이드라인

1. **할루시네이션 방지** : 외부 정보 사용 시 반드시 출처를 밝힙니다.
2. **데이터 부재 시** : 거짓 정보를 생성하지 말고 표준 메시지를 출력합니다.
3. **타임아웃 방지** : 도구 실행이 길어질 경우 중간 상태를 실시간 스트리밍합니다.

---

## 7. 최종 점검 리스트

* [ ] `export const runtime = 'nodejs'` API Route에 명시되어 있는가?
* [ ] Gemini Key Rotation이 Pro → Free 순서로 동작하는가?
* [ ] 동일 질문 재입력 시 query_cache에서 즉시 반환되는가?
* [ ] wiki_cache가 24시간 TTL로 만료/재크롤링 되는가?
* [ ] 답변 마지막에 관련 AntWiki 종목 바로가기 링크가 포함되는가?
* [ ] AntWiki 데이터 없을 때 Google Search로 자동 폴백되는가?
* [ ] 비로그인 사용자가 채팅 페이지 접근 시 로그인 페이지로 리다이렉트되는가?
* [ ] 답변 하단에 투자 면책 조항이 항상 포함되는가?
