'use client'

import React, { useState } from 'react'
import { Search, MapPin, Filter, X, ShieldCheck, BadgeCheck, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterState = {
  search?: string
  location?: string
  roleType?: string
  remoteType?: string
  salaryMin?: string
  salaryMax?: string
  stack?: string[]
  postedWithin?: string
  seniority?: string
  isWeb3?: boolean
  isEscrowFunded?: boolean
  isVerifiedPayer?: boolean
  page?: number
  limit?: number
}

interface FilterBarProps {
  filters: FilterState
  onChange: (f: FilterState) => void
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleChip({
  active,
  onClick,
  children,
  activeClassName,
  id,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  activeClassName?: string
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-150 select-none whitespace-nowrap',
        active
          ? (activeClassName ?? 'border-primary bg-primary text-primary-foreground')
          : 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function StackTagInput({
  tags,
  onTagsChange,
}: {
  tags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  function addTag(raw: string) {
    const trimmed = raw.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed])
    }
    setInputValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onTagsChange(tags.slice(0, -1))
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (val.endsWith(',')) {
      addTag(val.slice(0, -1))
    } else {
      setInputValue(val)
    }
  }

  return (
    <div
      className="flex min-h-[2rem] w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-xs transition-colors focus-within:border-primary/60"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTagsChange(tags.filter((t) => t !== tag))
            }}
            className="ml-0.5 text-primary/60 hover:text-primary"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? 'e.g. React, Go…' : ''}
        className="min-w-[5rem] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function Sep() {
  return <div className="h-5 w-px shrink-0 bg-border/60" />
}

// ---------------------------------------------------------------------------
// Main FilterBar
// ---------------------------------------------------------------------------

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const stack = filters.stack ?? []

  function patch(partial: Partial<FilterState>) {
    onChange({ ...filters, ...partial })
  }

  function clearAll() {
    onChange({ page: filters.page, limit: filters.limit })
  }

  // ── Active filter count (excl. pagination) ──────────────────────────────
  const primaryActive = [
    filters.search,
    filters.location,
    filters.roleType && filters.roleType !== 'all',
    filters.remoteType && filters.remoteType !== 'all',
    filters.seniority && filters.seniority !== 'all',
  ].filter(Boolean).length

  const secondaryActive = [
    filters.salaryMin,
    filters.salaryMax,
    stack.length > 0,
    filters.postedWithin && filters.postedWithin !== 'any',
    filters.isEscrowFunded,
    filters.isVerifiedPayer,
  ].filter(Boolean).length

  const totalActive = primaryActive + secondaryActive
  const isAnyActive = totalActive > 0

  // ── Primary row (always visible on desktop) ─────────────────────────────
  const primaryRow = (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-thin">
        {/* Keyword search */}
        <div className="relative shrink-0 w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filter-search"
            value={filters.search ?? ''}
            onChange={(e) => patch({ search: e.target.value || undefined })}
            placeholder="Search jobs…"
            className="h-8 w-full rounded-lg border-border bg-transparent pl-8 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
          />
        </div>

        {/* Location */}
        <div className="relative shrink-0 w-36">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filter-location"
            value={filters.location ?? ''}
            onChange={(e) => patch({ location: e.target.value || undefined })}
            placeholder="Location"
            className="h-8 w-full rounded-lg border-border bg-transparent pl-8 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
          />
        </div>

        <Sep />

        {/* Role type */}
        <Select
          value={filters.roleType ?? 'all'}
          onValueChange={(v) => patch({ roleType: v === 'all' ? undefined : v })}
        >
          <SelectTrigger
            id="filter-role-type"
            className="h-8 w-36 shrink-0 rounded-lg border-border bg-transparent text-xs"
          >
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="BACKEND">Backend</SelectItem>
            <SelectItem value="FRONTEND">Frontend</SelectItem>
            <SelectItem value="FULLSTACK">Full-stack</SelectItem>
            <SelectItem value="INFRASTRUCTURE">Infrastructure</SelectItem>
            <SelectItem value="DATA_ML">Data / ML</SelectItem>
            <SelectItem value="SMART_CONTRACT">Smart Contract</SelectItem>
            <SelectItem value="WEB3_BACKEND">Web3 Backend</SelectItem>
            <SelectItem value="WEB3_FRONTEND">Web3 Frontend</SelectItem>
            <SelectItem value="SECURITY">Security</SelectItem>
            <SelectItem value="GENERALIST">Generalist</SelectItem>
          </SelectContent>
        </Select>

        {/* Seniority */}
        <Select
          value={filters.seniority ?? 'all'}
          onValueChange={(v) => patch({ seniority: v === 'all' ? undefined : v })}
        >
          <SelectTrigger
            id="filter-seniority"
            className="h-8 w-32 shrink-0 rounded-lg border-border bg-transparent text-xs"
          >
            <SelectValue placeholder="Seniority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any level</SelectItem>
            <SelectItem value="JUNIOR">Junior</SelectItem>
            <SelectItem value="MID">Mid</SelectItem>
            <SelectItem value="SENIOR">Senior</SelectItem>
            <SelectItem value="LEAD">Lead</SelectItem>
          </SelectContent>
        </Select>

        <Sep />

        {/* Work arrangement chips */}
        <div className="flex shrink-0 items-center gap-1">
          {(['Remote', 'Hybrid', 'Onsite'] as const).map((opt) => {
            const val = opt.toLowerCase()
            const active = (filters.remoteType ?? '') === val
            return (
              <ToggleChip
                key={opt}
                id={`filter-remote-${val}`}
                active={active}
                onClick={() => patch({ remoteType: active ? undefined : val })}
              >
                {opt}
              </ToggleChip>
            )
          })}
        </div>

        <Sep />

        {/* More filters toggle */}
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-150 select-none',
            expanded || secondaryActive > 0
              ? 'border-primary/50 bg-primary/8 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More
          {secondaryActive > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 min-w-4 rounded-full bg-primary px-1 py-0 text-[10px] text-primary-foreground"
            >
              {secondaryActive}
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-3 w-3 opacity-60" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </button>

        {/* Clear all */}
        {isAnyActive && (
          <Button
            id="filter-clear-all"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
    </TooltipProvider>
  )

  // ── Secondary / expanded panel ──────────────────────────────────────────
  const secondaryPanel = expanded && (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/60 py-3 pb-4">
        {/* Salary range */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Salary</span>
          <Input
            id="filter-salary-min"
            value={filters.salaryMin ?? ''}
            onChange={(e) => patch({ salaryMin: e.target.value || undefined })}
            placeholder="Min ($)"
            className="h-8 w-24 rounded-lg border-border bg-transparent text-xs placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
          />
          <span className="text-xs text-muted-foreground/50">–</span>
          <Input
            id="filter-salary-max"
            value={filters.salaryMax ?? ''}
            onChange={(e) => patch({ salaryMax: e.target.value || undefined })}
            placeholder="Max ($)"
            className="h-8 w-24 rounded-lg border-border bg-transparent text-xs placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
          />
        </div>

        <Sep />

        {/* Stack */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Stack</span>
          <div className="w-52">
            <StackTagInput
              tags={stack}
              onTagsChange={(tags) => patch({ stack: tags.length ? tags : undefined })}
            />
          </div>
        </div>

        <Sep />

        {/* Posted within */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Posted</span>
          <Select
            value={filters.postedWithin ?? 'any'}
            onValueChange={(v) => patch({ postedWithin: v === 'any' ? undefined : v })}
          >
            <SelectTrigger
              id="filter-posted-within"
              className="h-8 w-32 rounded-lg border-border bg-transparent text-xs"
            >
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Sep />

        {/* Trust badges */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Trust</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleChip
                id="filter-deposit-paid"
                active={!!filters.isEscrowFunded}
                onClick={() => patch({ isEscrowFunded: filters.isEscrowFunded ? undefined : true })}
                activeClassName="border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Fund secured
              </ToggleChip>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Only show jobs with on-chain escrow locked by employer.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleChip
                id="filter-verified-payer"
                active={!!filters.isVerifiedPayer}
                onClick={() =>
                  patch({ isVerifiedPayer: filters.isVerifiedPayer ? undefined : true })
                }
                activeClassName="border-blue-500/50 bg-blue-500/15 text-blue-400"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified employer
              </ToggleChip>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Employer has a track record of releasing deposits after hiring.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )

  // ── Mobile collapsed trigger ────────────────────────────────────────────
  const mobileTrigger = (
    <div className="flex items-center gap-2 py-3 md:hidden">
      <Button
        id="filter-mobile-toggle"
        variant="outline"
        size="sm"
        onClick={() => setMobileOpen((o) => !o)}
        className="h-8 gap-1.5 rounded-lg text-xs"
      >
        <Filter className="h-3.5 w-3.5" />
        Filters
        {totalActive > 0 && (
          <Badge
            variant="secondary"
            className="ml-0.5 h-4 min-w-4 rounded-full bg-primary px-1 py-0 text-[10px] text-primary-foreground"
          >
            {totalActive}
          </Badge>
        )}
      </Button>

      {isAnyActive && !mobileOpen && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-8 px-2 text-xs text-muted-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  )

  return (
    <div className="border-b border-border">
      {/* Desktop layout */}
      <div className="hidden md:block">
        {primaryRow}
        {secondaryPanel}
      </div>

      {/* Mobile layout */}
      {mobileTrigger}
      {mobileOpen && (
        <div className="flex flex-col gap-3 border-t border-border pb-4 pt-3 md:hidden">
          {/* Primary filters stacked */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search ?? ''}
                onChange={(e) => patch({ search: e.target.value || undefined })}
                placeholder="Search jobs…"
                className="h-9 w-full rounded-lg border-border bg-transparent pl-8 text-xs focus-visible:ring-primary/40"
              />
            </div>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.location ?? ''}
                onChange={(e) => patch({ location: e.target.value || undefined })}
                placeholder="Location"
                className="h-9 w-full rounded-lg border-border bg-transparent pl-8 text-xs focus-visible:ring-primary/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={filters.roleType ?? 'all'}
                onValueChange={(v) => patch({ roleType: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 rounded-lg border-border bg-transparent text-xs">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="BACKEND">Backend</SelectItem>
                  <SelectItem value="FRONTEND">Frontend</SelectItem>
                  <SelectItem value="FULLSTACK">Full-stack</SelectItem>
                  <SelectItem value="INFRASTRUCTURE">Infrastructure</SelectItem>
                  <SelectItem value="DATA_ML">Data / ML</SelectItem>
                  <SelectItem value="SMART_CONTRACT">Smart Contract</SelectItem>
                  <SelectItem value="SECURITY">Security</SelectItem>
                  <SelectItem value="GENERALIST">Generalist</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.seniority ?? 'all'}
                onValueChange={(v) => patch({ seniority: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 rounded-lg border-border bg-transparent text-xs">
                  <SelectValue placeholder="Seniority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any level</SelectItem>
                  <SelectItem value="JUNIOR">Junior</SelectItem>
                  <SelectItem value="MID">Mid</SelectItem>
                  <SelectItem value="SENIOR">Senior</SelectItem>
                  <SelectItem value="LEAD">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Work arrangement */}
          <div className="flex flex-wrap gap-1.5">
            {(['Remote', 'Hybrid', 'Onsite'] as const).map((opt) => {
              const val = opt.toLowerCase()
              const active = (filters.remoteType ?? '') === val
              return (
                <ToggleChip
                  key={opt}
                  active={active}
                  onClick={() => patch({ remoteType: active ? undefined : val })}
                >
                  {opt}
                </ToggleChip>
              )
            })}
          </div>

          {/* Secondary */}
          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Advanced</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={filters.salaryMin ?? ''}
                onChange={(e) => patch({ salaryMin: e.target.value || undefined })}
                placeholder="Min salary"
                className="h-9 rounded-lg border-border bg-transparent text-xs focus-visible:ring-primary/40"
              />
              <Input
                value={filters.salaryMax ?? ''}
                onChange={(e) => patch({ salaryMax: e.target.value || undefined })}
                placeholder="Max salary"
                className="h-9 rounded-lg border-border bg-transparent text-xs focus-visible:ring-primary/40"
              />
            </div>
            <StackTagInput
              tags={stack}
              onTagsChange={(tags) => patch({ stack: tags.length ? tags : undefined })}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <ToggleChip
                active={!!filters.isEscrowFunded}
                onClick={() => patch({ isEscrowFunded: filters.isEscrowFunded ? undefined : true })}
                activeClassName="border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Fund secured
              </ToggleChip>
              <ToggleChip
                active={!!filters.isVerifiedPayer}
                onClick={() => patch({ isVerifiedPayer: filters.isVerifiedPayer ? undefined : true })}
                activeClassName="border-blue-500/50 bg-blue-500/15 text-blue-400"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified employer
              </ToggleChip>
            </div>
          </div>

          {isAnyActive && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 self-start px-2 text-xs text-muted-foreground">
              <X className="mr-1 h-3 w-3" />
              Clear all filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
