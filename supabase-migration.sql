-- wiki_cache에 sections(구조화 데이터), themes 컬럼 추가
alter table wiki_cache
  add column if not exists sections jsonb,
  add column if not exists themes   jsonb;
