import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RotateCcw,
  AlertCircle,
  ArrowRight,
  DollarSign,
  Wallet,
  Percent,
  ShoppingBag,
  Receipt,
  Package,
} from 'lucide-react';
import {
  DataRow,
  ColumnRoleMapping,
  computeBusinessAnalytics,
  parseDateString,
  buildCanonicalLabelMap,
  normalizeCategoricalKey,
} from '../../shared/analyticsEngine';
import { PlotlyChart } from '../components/PlotlyChart';
import { formatCurrency, formatNumber, formatPercent, formatPlainPercent } from '../lib/formatters';
import type { PageId } from '../components/Sidebar';

interface DashboardPageProps {
  datasetName: string;
  rows: DataRow[];
  columns: string[];
  mapping: ColumnRoleMapping;
  onNavigate: (page: PageId) => void;
}

export function DashboardPage({
  datasetName,
  rows,
  mapping,
  onNavigate,
}: DashboardPageProps) {
  const baseAnalytics = useMemo(() => computeBusinessAnalytics(rows, mapping), [rows, mapping]);

  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [productMetric, setProductMetric] = useState<'revenue' | 'profit'>('revenue');

  useEffect(() => {
    setDateStart('');
    setDateEnd('');
    setSelectedCategory('ALL');
    setSelectedRegion('ALL');
  }, [datasetName, mapping.dateCol, mapping.categoryCol, mapping.regionCol]);

  const categoryLabelMap = useMemo(
    () => buildCanonicalLabelMap(rows, mapping.categoryCol, 'Uncategorized'),
    [rows, mapping.categoryCol]
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(categoryLabelMap.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categoryLabelMap]
  );

  const regionLabelMap = useMemo(
    () => buildCanonicalLabelMap(rows, mapping.regionCol, 'Unspecified'),
    [rows, mapping.regionCol]
  );

  const regionOptions = useMemo(
    () =>
      Array.from(regionLabelMap.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [regionLabelMap]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (mapping.dateCol && (dateStart || dateEnd)) {
        const iso = parseDateString(row[mapping.dateCol]);
        if (!iso) return false;
        if (dateStart && iso < dateStart) return false;
        if (dateEnd && iso > dateEnd) return false;
      }
      if (mapping.categoryCol && selectedCategory !== 'ALL') {
        const normKey = normalizeCategoricalKey(row[mapping.categoryCol]);
        if (normKey !== selectedCategory) return false;
      }
      if (mapping.regionCol && selectedRegion !== 'ALL') {
        const normKey = normalizeCategoricalKey(row[mapping.regionCol]);
        if (normKey !== selectedRegion) return false;
      }
      return true;
    });
  }, [rows, mapping, dateStart, dateEnd, selectedCategory, selectedRegion]);

  const analytics = useMemo(
    () => computeBusinessAnalytics(filteredRows, mapping),
    [filteredRows, mapping]
  );

  const hasActiveFilters =
    Boolean(dateStart) ||
    Boolean(dateEnd) ||
    selectedCategory !== 'ALL' ||
    selectedRegion !== 'ALL';

  const resetFilters = () => {
    setDateStart('');
    setDateEnd('');
    setSelectedCategory('ALL');
    setSelectedRegion('ALL');
  };

  const kpiCards = [
    {
      label: 'Total Revenue',
      metric: analytics.kpis.totalRevenue,
      formatted: formatCurrency(analytics.kpis.totalRevenue.value),
      icon: DollarSign,
      growthMetric: analytics.kpis.salesGrowth,
    },
    {
      label: 'Total Profit',
      metric: analytics.kpis.totalProfit,
      formatted: formatCurrency(analytics.kpis.totalProfit.value),
      icon: Wallet,
    },
    {
      label: 'Profit Margin',
      metric: analytics.kpis.profitMargin,
      formatted: formatPlainPercent(analytics.kpis.profitMargin.value, 1),
      icon: Percent,
    },
    {
      label: 'Total Orders',
      metric: analytics.kpis.totalOrders,
      formatted: formatNumber(analytics.kpis.totalOrders.value),
      icon: ShoppingBag,
    },
    {
      label: 'Average Order Value',
      metric: analytics.kpis.averageOrderValue,
      formatted: formatCurrency(analytics.kpis.averageOrderValue.value),
      icon: Receipt,
    },
    {
      label: 'Total Quantity Sold',
      metric: analytics.kpis.totalQuantitySold,
      formatted: formatNumber(analytics.kpis.totalQuantitySold.value),
      icon: Package,
    },
  ];

  const availableKpis = kpiCards.filter((card) => card.metric.available);
  const unavailableKpis = kpiCards.filter((card) => !card.metric.available);

  // Prepare Plotly traces
  const hasMonthly = analytics.monthlySeries.length > 0;
  const periods = analytics.monthlySeries.map((m) => m.period);
  const monthlyRev = analytics.monthlySeries.map((m) => m.revenue ?? 0);
  const monthlyProf = analytics.monthlySeries.map((m) => m.profit ?? 0);
  const monthlyGrowth = analytics.monthlySeries.map((m) => m.momRevenueGrowthPct);

  const topProducts = useMemo(() => {
    const sorted = [...analytics.productBreakdown].sort((a, b) => {
      const va = productMetric === 'profit' ? (a.profit ?? -Infinity) : (a.revenue ?? -Infinity);
      const vb = productMetric === 'profit' ? (b.profit ?? -Infinity) : (b.revenue ?? -Infinity);
      return vb - va;
    });
    return sorted.slice(0, 8).reverse();
  }, [analytics.productBreakdown, productMetric]);

  return (
    <div className="space-y-6">
      {/* Page Header & Quick Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Intelligent Business Data Analysis &amp; Decision Support System
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Executive Performance Dashboard
            <span aria-hidden="true" className="mx-2 text-slate-300">·</span>
            {datasetName}
            <span aria-hidden="true" className="mx-2 text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-700">
              {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} records shown
            </span>
            {baseAnalytics.dateBounds.minDate && baseAnalytics.dateBounds.maxDate && (
              <>
                <span aria-hidden="true" className="mx-2 text-slate-300">·</span>
                <span className="font-mono text-xs text-slate-600">
                  {baseAnalytics.dateBounds.minDate} to {baseAnalytics.dateBounds.maxDate}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('ask-ai')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] transition-colors whitespace-nowrap"
          >
            AI Business Analyst
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive Filter Toolbar */}
      <section
        aria-label="Dashboard Filters"
        className="bg-white border border-slate-200 rounded-xl p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="dash-date-start" className="block text-xs font-medium text-slate-600 mb-1">
              Start Date
            </label>
            <input
              id="dash-date-start"
              type="date"
              disabled={!mapping.dateCol}
              value={dateStart}
              min={baseAnalytics.dateBounds.minDate ?? undefined}
              max={baseAnalytics.dateBounds.maxDate ?? undefined}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="dash-date-end" className="block text-xs font-medium text-slate-600 mb-1">
              End Date
            </label>
            <input
              id="dash-date-end"
              type="date"
              disabled={!mapping.dateCol}
              value={dateEnd}
              min={baseAnalytics.dateBounds.minDate ?? undefined}
              max={baseAnalytics.dateBounds.maxDate ?? undefined}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="dash-category" className="block text-xs font-medium text-slate-600 mb-1">
              Category {mapping.categoryCol ? `(${mapping.categoryCol})` : ''}
            </label>
            <select
              id="dash-category"
              disabled={!mapping.categoryCol}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dash-region" className="block text-xs font-medium text-slate-600 mb-1">
              Region {mapping.regionCol ? `(${mapping.regionCol})` : ''}
            </label>
            <select
              id="dash-region"
              disabled={!mapping.regionCol}
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Regions</option>
              {regionOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          </div>
        </div>
      </section>

      {/* Empty Filter Result Banner */}
      {filteredRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            No records match your current filter selection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Adjust the date range, category, or region filters to inspect your dataset.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 px-4 py-2 text-sm font-medium bg-[#0F294A] text-white rounded-lg hover:bg-[#173B69]"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <>
          {/* Read-Only BI KPI Cards (renders only available metrics) */}
          {availableKpis.length > 0 && (
            <section aria-label="Key Performance Indicators" className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableKpis.map((card) => {
                  const Icon = card.icon;
                  const hasGrowth = Boolean(card.growthMetric?.available);
                  const growthVal = card.growthMetric?.value ?? 0;
                  const isPositive = hasGrowth && growthVal >= 0;

                  return (
                    <div
                      key={card.label}
                      className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500 tracking-wide">
                            {card.label}
                          </p>
                          <p className="mt-2.5 text-2xl sm:text-[26px] font-display font-bold tabular-nums tracking-tight text-[#0B1933] leading-none">
                            {card.formatted}
                          </p>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-[#0F294A]/8 border border-[#0F294A]/12 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
                        </div>
                      </div>

                      <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 truncate" title={card.metric.note}>
                          {card.metric.note}
                        </span>
                        {hasGrowth && (
                          <span
                            className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums shrink-0 ${
                              isPositive ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            {formatPercent(growthVal, 1)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {unavailableKpis.length > 0 && (
                <p className="text-xs text-slate-500">
                  Unavailable for this dataset schema:{' '}
                  <span className="text-slate-700 font-medium">
                    {unavailableKpis.map((k) => k.label).join(', ')}
                  </span>{' '}
                  <span aria-hidden="true">·</span>{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('analytics')}
                    className="text-[#0F294A] font-medium hover:underline"
                  >
                    Configure column mapping
                  </button>
                </p>
              )}
            </section>
          )}

          {/* Row 1: Revenue & Profit Trend + Monthly Sales Analysis */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-base font-display font-semibold text-slate-900">
                    Revenue & Profit Trajectory
                  </h2>
                  <p className="text-xs text-slate-500">
                    Monthly cumulative performance over time
                  </p>
                </div>
              </div>
              {hasMonthly && (analytics.kpis.totalRevenue.available || analytics.kpis.totalProfit.available) ? (
                <PlotlyChart
                  height={310}
                  data={[
                    ...(analytics.kpis.totalRevenue.available
                      ? [
                          {
                            x: periods,
                            y: monthlyRev,
                            type: 'scatter' as const,
                            mode: 'lines+markers' as const,
                            name: 'Revenue',
                            line: { color: '#0F294A', width: 2.5 },
                            marker: { size: 6, color: '#0F294A' },
                            fill: 'tozeroy' as const,
                            fillcolor: 'rgba(15, 41, 74, 0.06)',
                          },
                        ]
                      : []),
                    ...(analytics.kpis.totalProfit.available
                      ? [
                          {
                            x: periods,
                            y: monthlyProf,
                            type: 'scatter' as const,
                            mode: 'lines+markers' as const,
                            name: 'Profit',
                            line: { color: '#2563EB', width: 2.5 },
                            marker: { size: 6, color: '#2563EB' },
                          },
                        ]
                      : []),
                  ]}
                  layout={{
                    legend: { orientation: 'h', y: 1.12, x: 0 },
                    xaxis: { showgrid: false, tickfont: { size: 11 } },
                    yaxis: { gridcolor: '#f1f5f9', tickprefix: '$', tickfont: { size: 11 } },
                  }}
                />
              ) : (
                <div className="h-[310px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  Requires a mapped Date column and Revenue/Profit numeric column.
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-base font-display font-semibold text-slate-900">
                    Monthly Sales & MoM Growth Rate
                  </h2>
                  <p className="text-xs text-slate-500">
                    {analytics.decliningMonths.length > 0
                      ? `${analytics.decliningMonths.length} month${analytics.decliningMonths.length === 1 ? '' : 's'} recorded a sequential decline`
                      : 'Monthly revenue bars with month-over-month % change'}
                  </p>
                </div>
              </div>
              {hasMonthly && analytics.kpis.totalRevenue.available ? (
                <PlotlyChart
                  height={310}
                  data={[
                    {
                      x: periods,
                      y: monthlyRev,
                      type: 'bar',
                      name: 'Monthly Revenue',
                      marker: {
                        color: analytics.monthlySeries.map((pt) =>
                          pt.momRevenueGrowthPct !== null && pt.momRevenueGrowthPct < 0
                            ? '#DC2626'
                            : '#1D4ED8'
                        ),
                      },
                    },
                    {
                      x: periods,
                      y: monthlyGrowth.map((g) => (g === null ? 0 : Number(g.toFixed(1)))),
                      type: 'scatter',
                      mode: 'lines+markers',
                      name: 'MoM Growth %',
                      yaxis: 'y2',
                      line: { color: '#0F172A', width: 2, dash: 'dot' },
                      marker: { size: 5, color: '#0F172A' },
                    },
                  ]}
                  layout={{
                    legend: { orientation: 'h', y: 1.12, x: 0 },
                    margin: { t: 24, r: 48, b: 44, l: 56 },
                    xaxis: { showgrid: false, tickfont: { size: 11 } },
                    yaxis: { gridcolor: '#f1f5f9', tickprefix: '$', tickfont: { size: 11 } },
                    yaxis2: {
                      overlaying: 'y',
                      side: 'right',
                      showgrid: false,
                      ticksuffix: '%',
                      tickfont: { size: 11 },
                    },
                  }}
                />
              ) : (
                <div className="h-[310px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  Monthly growth chart requires a mapped Date and Revenue column.
                </div>
              )}
            </section>
          </div>

          {/* Row 2: Category Share (Pie) + Regional Comparison (Grouped Bar) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="mb-2">
                <h2 className="text-base font-display font-semibold text-slate-900">
                  Category Performance Distribution
                </h2>
                <p className="text-xs text-slate-500">
                  {mapping.categoryCol
                    ? `Share of ${analytics.kpis.totalRevenue.available ? 'revenue' : 'records'} by ${mapping.categoryCol}`
                    : 'No Category column detected in dataset'}
                </p>
              </div>
              {analytics.categoryBreakdown.length > 0 ? (
                <PlotlyChart
                  height={300}
                  data={[
                    {
                      labels: analytics.categoryBreakdown.map((c) => c.name),
                      values: analytics.categoryBreakdown.map(
                        (c) => c.revenue ?? c.orders
                      ),
                      type: 'pie',
                      hole: 0.48,
                      marker: {
                        colors: ['#0F294A', '#1D4ED8', '#3B82F6', '#64748B', '#0284C7', '#94A3B8'],
                      },
                      textinfo: 'label+percent',
                      textposition: 'outside',
                    },
                  ]}
                  layout={{
                    margin: { t: 20, r: 20, b: 20, l: 20 },
                    showlegend: false,
                  }}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  Map a Category column in Business Analytics to view category breakdown.
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="mb-2">
                <h2 className="text-base font-display font-semibold text-slate-900">
                  Regional Comparative Performance
                </h2>
                <p className="text-xs text-slate-500">
                  {mapping.regionCol
                    ? `Revenue vs. Profit across ${mapping.regionCol}`
                    : 'No Region column detected in dataset'}
                </p>
              </div>
              {analytics.regionBreakdown.length > 0 ? (
                <PlotlyChart
                  height={300}
                  data={[
                    ...(analytics.kpis.totalRevenue.available
                      ? [
                          {
                            x: analytics.regionBreakdown.map((r) => r.name),
                            y: analytics.regionBreakdown.map((r) => r.revenue ?? 0),
                            type: 'bar' as const,
                            name: 'Revenue',
                            marker: { color: '#0F294A' },
                          },
                        ]
                      : []),
                    ...(analytics.kpis.totalProfit.available
                      ? [
                          {
                            x: analytics.regionBreakdown.map((r) => r.name),
                            y: analytics.regionBreakdown.map((r) => r.profit ?? 0),
                            type: 'bar' as const,
                            name: 'Profit',
                            marker: { color: '#2563EB' },
                          },
                        ]
                      : []),
                    ...(!analytics.kpis.totalRevenue.available && !analytics.kpis.totalProfit.available
                      ? [
                          {
                            x: analytics.regionBreakdown.map((r) => r.name),
                            y: analytics.regionBreakdown.map((r) => r.orders),
                            type: 'bar' as const,
                            name: 'Records',
                            marker: { color: '#0F294A' },
                          },
                        ]
                      : []),
                  ]}
                  layout={{
                    barmode: 'group',
                    legend: { orientation: 'h', y: 1.12, x: 0 },
                    xaxis: { showgrid: false },
                    yaxis: {
                      gridcolor: '#f1f5f9',
                      tickprefix: analytics.kpis.totalRevenue.available ? '$' : '',
                    },
                  }}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  Map a Region column in Business Analytics to compare territories.
                </div>
              )}
            </section>
          </div>

          {/* Row 3: Top-Performing Products */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-900">
                  Top Performing Products
                </h2>
                <p className="text-xs text-slate-500">
                  Ranked by total {productMetric === 'profit' ? 'profit contribution' : 'revenue generated'}
                </p>
              </div>
              {analytics.kpis.totalProfit.available && analytics.kpis.totalRevenue.available && (
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => setProductMetric('revenue')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      productMetric === 'revenue'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    By Revenue
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductMetric('profit')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      productMetric === 'profit'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    By Profit
                  </button>
                </div>
              )}
            </div>

            {topProducts.length > 0 ? (
              <PlotlyChart
                height={320}
                data={[
                  {
                    y: topProducts.map((p) => p.name),
                    x: topProducts.map((p) =>
                      productMetric === 'profit'
                        ? p.profit ?? 0
                        : p.revenue ?? p.orders
                    ),
                    type: 'bar',
                    orientation: 'h',
                    marker: {
                      color: productMetric === 'profit' ? '#2563EB' : '#0F294A',
                    },
                  },
                ]}
                layout={{
                  margin: { t: 10, r: 24, b: 36, l: 180 },
                  xaxis: {
                    gridcolor: '#f1f5f9',
                    tickprefix: analytics.kpis.totalRevenue.available ? '$' : '',
                  },
                  yaxis: { showgrid: false },
                }}
              />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                No Product column detected. Map a Product column in Business Analytics.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
