'use client'

import { useState } from 'react'
import { antWikiUrl } from '@/lib/constants'

// ── 상수 ──────────────────────────────────────────────────────
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

const SCORE_LABELS: Record<string, string> = {
  directness:          '직접성',
  profit_contribution: '이익 기여도',
  penetration_speed:   '침투 속도',
  sustainability:      '지속성',
  psychology_scarcity: '심리/희소성',
  financial_readiness: '재무 준비도',
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
  directness:          '직접적으로 매출/이익에 영향을 주는가?',
  profit_contribution: '실제 이익 기여도는 얼마나 되는가?',
  penetration_speed:   '얼마나 빠르게 시장에 침투하는가?',
  sustainability:      '장기적으로 지속 가능한 성장인가?',
  psychology_scarcity: '일회성 이슈인가, 아니면 구조적·장기적 변화인가?',
  financial_readiness: '재무 구조가 성장에 대응할 준비가 되었는가?',
}

// ── 타입 ──────────────────────────────────────────────────────
export interface ScoreBreakdown {
  directness:          number
  profit_contribution: number
  penetration_speed:   number
  sustainability:      number
  psychology_scarcity: number
  financial_readiness: number
}

export interface ScoredBeneficiary {
  name:            string
  code:            string
  short_score:     number
  long_score:      number
  score_breakdown: ScoreBreakdown
  narrative:       string
}

export interface BeneficiaryResultChunk {
  title:         string
  summary:       string
  beneficiaries: ScoredBeneficiary[]
  fromCache:     boolean
}

// ── 등급 ──────────────────────────────────────────────────────
function gradeInfo(score: number) {
  if (score >= 85) return { label: '매우 강함', color: 'text-red-400',    badge: 'bg-red-400/15 border-red-400/40 text-red-400' }
  if (score >= 70) return { label: '강함',      color: 'text-amber-400',  badge: 'bg-amber-400/15 border-amber-400/40 text-amber-400' }
  if (score >= 55) return { label: '보통',       color: 'text-blue-400',   badge: 'bg-blue-400/15 border-blue-400/40 text-blue-400' }
  return               { label: '약함',       color: 'text-zinc-400',   badge: 'bg-zinc-400/15 border-zinc-400/40 text-zinc-400' }
}

// ── 가중치 breakdown 패널 ────────────────────────────────────
function WeightBreakdown({
  breakdown,
  type,
}: {
  breakdown: ScoreBreakdown
  type: 'short' | 'long'
}) {
  const weights = type === 'short' ? SHORT_WEIGHTS : LONG_WEIGHTS
  const raw = breakdown as unknown as Record<string, number>
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  return (
    <div className="px-3 py-2.5 bg-zinc-950/80 border-t border-zinc-700/40">
      <p className="text-[10px] text-zinc-500 mb-2">
        {type === 'short' ? '단기 투자형' : '장기 투자형'} 가중치 적용 로직
      </p>
      <div className="space-y-1.5">
        {Object.keys(weights).map((key) => {
          const score        = raw[key] ?? 0
          const wPct         = Math.round(weights[key] * 100)
          const contribution = Math.round(score * weights[key])
          const isHovered    = hoveredKey === key

          return (
            <div
              key={key}
              className="relative flex items-center gap-2 group/metric"
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              {/* 툴팁 */}
              {isHovered && (
                <div className="absolute bottom-full left-0 mb-1.5 z-20 bg-zinc-800 border border-zinc-600 text-[10px] text-zinc-200 px-2 py-1 rounded-md whitespace-nowrap shadow-lg pointer-events-none">
                  {METRIC_DESCRIPTIONS[key]}
                </div>
              )}
              <span className="text-[10px] text-zinc-400 w-28 shrink-0 cursor-default">
                {SCORE_LABELS[key]}
                <span className="text-amber-400/80 ml-1">({wPct}%)</span>
              </span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-300 w-16 text-right shrink-0">
                {score} → <span className="text-amber-400">{contribution}pt</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 단일 종목 행 ───────────────────────────────────────────────
function BeneficiaryRow({ b }: { b: ScoredBeneficiary }) {
  const [expanded, setExpanded] = useState<'short' | 'long' | null>(null)
  const shortGrade = gradeInfo(b.short_score)
  const longGrade  = gradeInfo(b.long_score)

  return (
    <div className="border-b border-zinc-800/60 last:border-b-0">
      {/* 메인 행 */}
      <div className="grid grid-cols-[minmax(110px,_1.2fr)_90px_90px_minmax(180px,_2.5fr)] gap-0 items-start">

        {/* 종목명 */}
        <div className="px-3 py-2.5">
          <a
            href={antWikiUrl(b.code)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white hover:text-amber-400 transition-colors text-sm"
          >
            {b.name}
          </a>
          <p className="text-[11px] text-zinc-500 mt-0.5">{b.code}</p>
        </div>

        {/* Short 점수 */}
        <div
          className={`flex flex-col items-center justify-center px-2 py-2.5 cursor-pointer transition-colors border-l border-zinc-800/60 ${
            expanded === 'short'
              ? 'bg-orange-500/10 border-orange-500/20'
              : 'hover:bg-zinc-800/40'
          }`}
          onClick={() => setExpanded(expanded === 'short' ? null : 'short')}
        >
          <span className={`text-2xl font-bold leading-none ${shortGrade.color}`}>
            {b.short_score}
          </span>
          <span className={`text-[9px] mt-1 px-1.5 py-0.5 rounded-full border ${shortGrade.badge}`}>
            {shortGrade.label}
          </span>
        </div>

        {/* Long 점수 */}
        <div
          className={`flex flex-col items-center justify-center px-2 py-2.5 cursor-pointer transition-colors border-l border-zinc-800/60 ${
            expanded === 'long'
              ? 'bg-blue-500/10 border-blue-500/20'
              : 'hover:bg-zinc-800/40'
          }`}
          onClick={() => setExpanded(expanded === 'long' ? null : 'long')}
        >
          <span className={`text-2xl font-bold leading-none ${longGrade.color}`}>
            {b.long_score}
          </span>
          <span className={`text-[9px] mt-1 px-1.5 py-0.5 rounded-full border ${longGrade.badge}`}>
            {longGrade.label}
          </span>
        </div>

        {/* 내러티브 */}
        <div className="px-3 py-2.5 border-l border-zinc-800/60">
          <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-4">
            {b.narrative}
          </p>
        </div>
      </div>

      {/* Breakdown 패널 (클릭 시 펼침) */}
      {expanded && (
        <WeightBreakdown breakdown={b.score_breakdown} type={expanded} />
      )}
    </div>
  )
}

// ── 전체 결과 패널 ─────────────────────────────────────────────
export default function BeneficiaryResultPanel({ data }: { data: BeneficiaryResultChunk }) {
  return (
    <div className="my-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-orange-400">수혜주 분석</span>
        {data.fromCache && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-400/30 rounded-full">
            캐시
          </span>
        )}
        <span className="text-xs text-zinc-500 truncate">{data.title}</span>
      </div>


      {/* 테이블 */}
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        {/* 컬럼 헤더 */}
        <div className="grid grid-cols-[minmax(110px,_1.2fr)_90px_90px_minmax(180px,_2.5fr)] gap-0 bg-zinc-800/60 border-b border-zinc-700/60">
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-medium text-zinc-400">종목</span>
          </div>
          <div className="px-2 py-1.5 text-center border-l border-zinc-700/60">
            <span className="text-[10px] font-medium text-zinc-400 block">Short-term</span>
            <span className="text-[9px] text-zinc-600">단기 투자형</span>
          </div>
          <div className="px-2 py-1.5 text-center border-l border-zinc-700/60">
            <span className="text-[10px] font-medium text-zinc-400 block">Long-term</span>
            <span className="text-[9px] text-zinc-600">장기 투자형</span>
          </div>
          <div className="px-3 py-1.5 border-l border-zinc-700/60">
            <span className="text-[10px] font-medium text-zinc-400">내러티브</span>
          </div>
        </div>

        {/* 종목 행 목록 */}
        {data.beneficiaries.map((b) => (
          <BeneficiaryRow key={b.code} b={b} />
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 mt-1.5 text-right">
        점수 칸 클릭 시 가중치 로직 표시
      </p>
    </div>
  )
}
