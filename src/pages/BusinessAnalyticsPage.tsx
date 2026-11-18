import { useMemo, useState } from 'react';
import { SlidersHorizontal, CheckCircle2, Info, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  DataRow,
  ColumnRoleMapping,
  computeBusinessAnalytics,
  inferColumnRoles,
  detectColumnTypes,
  validateColumnMapping,
  DimensionBreakdown,
} from '../../shared/analyticsEngine';
import { formatCurrency, formatNumber, formatPercent, formatPlainPercent } from '../lib/formatters';

interface BusinessAnalyticsPageProps {
  rows: DataRow[];
  columns: string[];
  mapping: ColumnRoleMapping;
  onUpdateMapping: (next: ColumnRoleMapping) => void;
}

type DimensionTab = 'category' | 'region' | 'product' | 'monthly';

export function BusinessAnalyticsPage({
  rows,
  columns,
  mapping,
  onUpdateMapping,
}: BusinessAnalyticsPageProps) {
  const [activeTab, setActiveTab] = useState<DimensionTab>('category');
  const [searchTerm, setSearchTerm] = useState('');

  const analytics = useMemo(() => computeBusinessAnalytics(rows, mapping), [rows, mapping]);
  const columnTypes = useMemo(() => detectColumnTypes(rows, columns), [rows, columns]);
  const autoDetected = useMemo(() => inferColumnRoles(rows, columns), [rows, columns]);
  const validationIssues = useMemo(
    () => validateColumnMapping(rows, columns, mapping),
    [rows, columns, mapping]
  );
  const issueByRole = useMemo(
    () => new Map(validationIssues.map((issue) => [issue.role, issue])),
    [validationIssues]
  );

  const roleFields: { key: keyof ColumnRoleMapping; label: string }[] = [
    { key: 'dateCol', label: 'Date / Period' },
    { key: 'revenueCol', label: 'Revenue / Sales' },
    { key: 'profitCol', label: 'Profit / Net Income' },
    { key: 'costCol', label: 'Cost / Expense' },
    { key: 'orderIdCol', label: 'Order / Invoice ID' },
    { key: 'quantityCol', label: 'Quantity / Units' },
    { key: 'categoryCol', label: 'Category / Segment' },
    { key: 'regionCol', label: 'Region / Territory' },
    { key: 'productCol', label: 'Product / Item' },
  ];

  const metricRows = [
    {
      name: 'Total Revenue',
      result: analytics.kpis.totalRevenue,
      formatted: formatCurrency(analytics.kpis.totalRevenue.value),
    },
    {
      name: 'Total Profit',
      result: analytics.kpis.totalProfit,
      formatted: formatCurrency(analytics.kpis.totalProfit.value),
    },
    {
      name: 'Profit Margin',
      result: analytics.kpis.profitMargin,
      formatted: formatPlainPercent(analytics.kpis.profitMargin.value, 2),
    },
    {
      name: 'Total Orders',
      result: analytics.kpis.totalOrders,
      formatted: formatNumber(analytics.kpis.totalOrders.value),
    },
    {
      name: 'Average Order Value',
      result: analytics.kpis.averageOrderValue,
      formatted: formatCurrency(analytics.kpis.averageOrderValue.value),
    },
    {
      name: 'Total Quantity Sold',
      result: analytics.kpis.totalQuantitySold,
      formatted: formatNumber(analytics.kpis.totalQuantitySold.value),
    },
    {
      name: 'Monthly Revenue',
      result:
        analytics.monthlySeries.length > 0 && analytics.kpis.totalRevenue.available
          ? {
              available: true,
              value: analytics.monthlySeries.length,
              note: `${analytics.monthlySeries.length} monthly periods analyzed`,
            }
          : {
              available: false,
              value: null,
              reasonIfUnavailable: 'Requires both a Date column and a Revenue column.',
            },
      formatted: `${analytics.monthlySeries.length} months`,
    },
    {
      name: 'Sales Growth',
      result: analytics.kpis.salesGrowth,
      formatted: formatPercent(analytics.kpis.salesGrowth.value, 2),
    },
    {
      name: 'Category Performance',
      result: mapping.categoryCol
        ? {
            available: true,
            value: analytics.categoryBreakdown.length,
            note: `${analytics.categoryBreakdown.length} categories in ${mapping.categoryCol}`,
          }
        : {
            available: false,
            value: null,
            reasonIfUnavailable: 'No Category column mapped in this dataset.',
          },
      formatted: `${analytics.categoryBreakdown.length} groups`,
    },
    {
      name: 'Regional Performance',
      result: mapping.regionCol
        ? {
            available: true,
            value: analytics.regionBreakdown.length,
            note: `${analytics.regionBreakdown.length} regions in ${mapping.regionCol}`,
          }
        : {
            available: false,
            value: null,
            reasonIfUnavailable: 'No Region column mapped in this dataset.',
          },
      formatted: `${analytics.regionBreakdown.length} regions`,
    },
    {
      name: 'Product Performance',
      result: mapping.productCol
        ? {
            available: true,
            value: analytics.productBreakdown.length,
            note: `${analytics.productBreakdown.length} products in ${mapping.productCol}`,
          }
        : {
            available: false,
            value: null,
            reasonIfUnavailable: 'No Product column mapped in this dataset.',
          },
      formatted: `${analytics.productBreakdown.length} products`,
    },
  ];

  const renderDimensionTable = (items: DimensionBreakdown[], emptyMsg: string) => {
    const filtered = items.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
    );
    if (items.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-slate-500">{emptyMsg}</div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
            <tr>
              <th className="px-4 py-2.5">Segment / Name</th>
              <th className="px-4 py-2.5 text-right">Orders</th>
              <th className="px-4 py-2.5 text-right">Quantity</th>
              <th className="px-4 py-2.5 text-right">Revenue</th>
              <th className="px-4 py-2.5 text-right">Share %</th>
              <th className="px-4 py-2.5 text-right">Profit</th>
              <th className="px-4 py-2.5 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <tr key={item.name} className="hover:bg-slate-50/70">
                <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                  {formatNumber(item.orders)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                  {item.quantity !== null ? formatNumber(item.quantity) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 font-medium">
                  {item.revenue !== null ? formatCurrency(item.revenue) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">
                  {item.revenueSharePct !== null ? formatPlainPercent(item.revenueSharePct, 1) : '—'}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${
                    (item.profit ?? 0) < 0 ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {item.profit !== null ? formatCurrency(item.profit) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                  {item.profitMarginPct !== null ? formatPlainPercent(item.profitMarginPct, 1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
          Automated Business Analytics & Metric Engine
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Automatically detects business columns and computes only metrics supported by your dataset schema.
        </p>
      </div>

      {/* Transparent Column Role Mapping */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#0F294A]" />
            <h2 className="text-base font-display font-semibold text-slate-900">
              Business Column Mapping
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onUpdateMapping(inferColumnRoles(rows, columns))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Auto-Detect Columns
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {roleFields.map((field) => {
            const currentCol = mapping[field.key];
            const autoCol = autoDetected[field.key];
            const issue = issueByRole.get(field.key);
            const isAutoMatch = currentCol !== null && currentCol === autoCol;
            const isManual = currentCol !== autoCol;

            return (
              <div key={field.key}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor={`map-${field.key}`}
                    className="block text-xs font-medium text-slate-700"
                  >
                    {field.label}
                  </label>
                  <span
                    className={`text-[11px] font-medium ${
                      issue
                        ? 'text-amber-700'
                        : isAutoMatch
                        ? 'text-emerald-700'
                        : isManual && currentCol
                        ? 'text-blue-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {issue
                      ? 'Check type'
                      : isAutoMatch
                      ? 'Auto-detected'
                      : currentCol
                      ? 'Manual override'
                      : 'Unmapped'}
                  </span>
                </div>
                <select
                  id={`map-${field.key}`}
                  value={currentCol ?? ''}
                  onChange={(e) =>
                    onUpdateMapping({
                      ...mapping,
                      [field.key]: e.target.value || null,
                    })
                  }
                  className={`w-full h-9 px-3 text-xs bg-slate-50 border rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                    issue ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200'
                  }`}
                >
                  <option value="">Not available / Unmapped</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c} ({columnTypes[c]})
                    </option>
                  ))}
                </select>
                {issue && (
                  <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{issue.message}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Automated Metric Availability & Computed Values */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-display font-semibold text-slate-900">
            Calculated Business Metrics & Availability Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every metric is calculated deterministically from your dataset—missing columns are explicitly explained rather than fabricated.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Business Metric</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Calculated Value</th>
                <th className="px-4 py-2.5">Calculation Basis / Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metricRows.map((m) => (
                <tr key={m.name} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{m.name}</td>
                  <td className="px-4 py-2.5">
                    {m.result.available ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Calculated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <Info className="w-3.5 h-3.5" />
                        Unavailable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                    {m.result.available ? m.formatted : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {m.result.available ? m.result.note : m.result.reasonIfUnavailable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dimension Performance Breakdown Tabs */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'category', label: 'Category' },
                { id: 'region', label: 'Region' },
                { id: 'product', label: 'Product' },
                { id: 'monthly', label: 'Monthly Trends' },
              ] as { id: DimensionTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchTerm('');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'monthly' && (
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Filter ${activeTab}...`}
              className="h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          )}
        </div>

        {activeTab === 'category' &&
          renderDimensionTable(
            analytics.categoryBreakdown,
            'No Category column mapped. Select a Category column above to view performance.'
          )}
        {activeTab === 'region' &&
          renderDimensionTable(
            analytics.regionBreakdown,
            'No Region column mapped. Select a Region column above to view performance.'
          )}
        {activeTab === 'product' &&
          renderDimensionTable(
            analytics.productBreakdown,
            'No Product column mapped. Select a Product column above to view performance.'
          )}
        {activeTab === 'monthly' &&
          (analytics.monthlySeries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No Date column mapped or no valid dates detected.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Month</th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                    <th className="px-4 py-2.5 text-right">Quantity</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right">Profit</th>
                    <th className="px-4 py-2.5 text-right">MoM Change ($)</th>
                    <th className="px-4 py-2.5 text-right">MoM Growth (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.monthlySeries.map((pt) => (
                    <tr key={pt.period} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-900">
                        {pt.period}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                        {formatNumber(pt.orders)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                        {pt.quantity !== null ? formatNumber(pt.quantity) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 font-medium">
                        {pt.revenue !== null ? formatCurrency(pt.revenue) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">
                        {pt.profit !== null ? formatCurrency(pt.profit) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${
                          pt.momRevenueDelta === null
                            ? 'text-slate-400'
                            : pt.momRevenueDelta < 0
                            ? 'text-red-700 font-medium'
                            : 'text-emerald-700'
                        }`}
                      >
                        {pt.momRevenueDelta !== null ? formatCurrency(pt.momRevenueDelta) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${
                          pt.momRevenueGrowthPct === null
                            ? 'text-slate-400'
                            : pt.momRevenueGrowthPct < 0
                            ? 'text-red-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {pt.momRevenueGrowthPct !== null
                          ? formatPercent(pt.momRevenueGrowthPct, 1)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  );
}
