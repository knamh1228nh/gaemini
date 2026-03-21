-- 유저별 대화 세션
create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  title        text,
  created_at   timestamptz default now()
);

-- 대화 내 메시지 (user / assistant)
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  role             text check (role in ('user', 'assistant')),
  content          text,
  sources          jsonb,
  created_at       timestamptz default now()
);

-- 질문 캐시 (SHA-256 해시 매칭)
create table if not exists query_cache (
  id          uuid primary key default gen_random_uuid(),
  query_hash  text unique,
  query_text  text,
  response    text,
  sources     jsonb,
  hit_count   int default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- AntWiki 종목 위키 크롤링 캐시 (TTL: 24시간)
create table if not exists wiki_cache (
  id          uuid primary key default gen_random_uuid(),
  stock_code  text unique,
  stock_name  text,
  content     text,
  url         text,
  cached_at   timestamptz default now()
);

-- 종목-테마 매핑
create table if not exists stock_themes (
  stock_code  text,
  theme_tag   text,
  stock_name  text,
  primary key (stock_code, theme_tag)
);

-- find_beneficiaries 분석 결과
create table if not exists analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),
  news_url      text,
  news_title    text,
  beneficiaries jsonb,
  created_at    timestamptz default now()
);
