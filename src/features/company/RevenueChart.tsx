import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTip } from '@/components/common/ChartTip';
import { formatDate } from '@/utils/format';
import type { DailyFigures } from '@/types/report';

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/** Doanh thu theo ngày trên Tổng quan: một đường, nền nhạt dưới đường */
export function RevenueChart({ items }: { items: DailyFigures[] }) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Chưa có số liệu trong khoảng này</p>;
  }
  return (
    <div className="h-56 w-full" data-testid="home-revenue-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={items} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="home-revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDate(d, 'DD/MM')}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
            content={({ active, payload, label }) => (
              <ChartTip
                active={active}
                label={label ? formatDate(String(label), 'DD/MM/YYYY') : undefined}
                rows={(payload ?? []).map((p) => ({ name: 'Doanh thu', value: Number(p.value) }))}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#home-revenue-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
