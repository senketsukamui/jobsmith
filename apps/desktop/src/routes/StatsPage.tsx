import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Cell,
  LabelList,
} from 'recharts'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

const SOURCES = ['linkedin', 'lever', 'greenhouse', 'manual', 'other'] as const
const WEEK_OPTIONS = [4, 8, 12, 26] as const

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  format,
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  format?: (v: T) => string
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden text-xs">
      {options.map((opt) => (
        <button
          key={String(opt)}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'px-2.5 py-1 transition-colors',
            value === opt
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          {format ? format(opt) : String(opt)}
        </button>
      ))}
    </div>
  )
}

function ChartTooltipStyle() {
  return (
    <style>{`
      .recharts-tooltip-wrapper .recharts-default-tooltip {
        background: hsl(var(--card)) !important;
        border: 1px solid hsl(var(--border)) !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        color: hsl(var(--foreground)) !important;
      }
      .recharts-default-tooltip .recharts-tooltip-label {
        color: hsl(var(--muted-foreground)) !important;
        margin-bottom: 2px;
      }
    `}</style>
  )
}

export function StatsPage() {
  const [weekCount, setWeekCount] = useState<number>(8)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [source, setSource] = useState('')
  const [weeklyChartType, setWeeklyChartType] = useState<'area' | 'bar'>('area')

  const { data, isLoading } = trpc.stats.get.useQuery(
    { weekCount, includeArchived, source: source || undefined },
    { staleTime: 30_000, keepPreviousData: true }
  )

  const funnelData = (data?.funnel ?? []).map((f) => ({
    name: f.status_name,
    Applications: f.count,
    pct: f.pct,
    color: f.status_color,
  }))

  const weeklyData = (data?.weeklyBuckets ?? []).map((b) => ({
    week: b.week.slice(5),
    Applications: b.count,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChartTooltipStyle />

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-base font-semibold">Stats</h1>
      </div>

      {/* Settings toolbar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2.5 border-b border-border bg-muted/20 shrink-0">
        {/* Time range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range</span>
          <SegmentedControl
            value={weekCount}
            options={WEEK_OPTIONS}
            onChange={setWeekCount}
            format={(w) => `${w}W`}
          />
        </div>

        {/* Source */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-7 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Include archived */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-xs text-muted-foreground">Include archived</span>
        </label>

        {/* Weekly chart type */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Weekly</span>
          <SegmentedControl
            value={weeklyChartType}
            options={['area', 'bar'] as const}
            onChange={setWeeklyChartType}
            format={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading && !data ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            Loading…
          </div>
        ) : data ? (
          <div className="space-y-8 max-w-3xl">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total" value={data.total} />
              <StatCard label="Active" value={data.totalActive} />
              <StatCard label="Archived" value={data.totalArchived} />
              <StatCard
                label="Interview rate"
                value={data.responseRate !== null ? `${data.responseRate}%` : '—'}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 -mt-5">
              <StatCard
                label="Offer rate"
                value={data.offerRate !== null ? `${data.offerRate}%` : '—'}
              />
              <StatCard
                label="Rejection rate"
                value={data.rejectionRate !== null ? `${data.rejectionRate}%` : '—'}
              />
              <StatCard
                label="Still active"
                value={data.total > 0 ? `${Math.round((data.totalActive / (data.total + data.totalArchived)) * 100)}%` : '—'}
              />
            </div>

            {/* Funnel — horizontal bar chart */}
            <div>
              <h2 className="text-sm font-semibold mb-4">Applications by status</h2>
              <ResponsiveContainer width="100%" height={funnelData.length * 36 + 16}>
                <BarChart
                  data={funnelData}
                  layout="vertical"
                  margin={{ top: 0, right: 52, bottom: 0, left: 80 }}
                  barSize={18}
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    formatter={(value) => [value, 'Applications']}
                  />
                  <Bar dataKey="Applications" radius={[0, 4, 4, 0]}>
                    {funnelData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="pct"
                      position="right"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => (v > 0 ? `${v}%` : '')}
                      style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly trend */}
            <div>
              <h2 className="text-sm font-semibold mb-4">
                Weekly applications (last {weekCount} weeks)
              </h2>
              <ResponsiveContainer width="100%" height={160}>
                {weeklyChartType === 'area' ? (
                  <AreaChart data={weeklyData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="weeklyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ stroke: 'hsl(var(--border))' }}
                      formatter={(value) => [value, 'Applications']}
                    />
                    <Area
                      type="monotone"
                      dataKey="Applications"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#weeklyGradient)"
                      dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={weeklyData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                      formatter={(value) => [value, 'Applications']}
                    />
                    <Bar dataKey="Applications" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Source breakdown */}
            {Object.keys(data.bySource).length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-3">By source</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.bySource)
                    .sort((a, b) => b[1] - a[1])
                    .map(([src, cnt]) => (
                      <span
                        key={src}
                        className="px-3 py-1 rounded-full border border-border text-xs font-medium bg-card"
                      >
                        {src}: {cnt}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Time metrics */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Time metrics (days)</h2>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Avg days to rejection"
                  value={data.avgDaysToRejection !== null ? data.avgDaysToRejection : '—'}
                />
                <StatCard
                  label="Avg days to first interview"
                  value={data.avgDaysToFirstInterview !== null ? data.avgDaysToFirstInterview : '—'}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
