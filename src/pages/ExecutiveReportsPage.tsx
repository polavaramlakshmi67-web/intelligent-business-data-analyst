import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import {
  FileText,
  Download,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  DataRow,
  ColumnRoleMapping,
  DataQualitySummary,
  BusinessAnalyticsResult,
  computeBusinessAnalytics,
  profileDataset,
  buildCompactAIContext,
  buildCanonicalLabelMap,
  filterRowsForScope,
} from '../../shared/analyticsEngine';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatPlainPercent,
  triggerBlobDownload,
} from '../lib/formatters';

export interface GeneratedReport {
  executiveSummary: string;
  datasetOverview: string;
  importantFindings: string[];
  trendAnalysis: string;
  potentialRisks: string[];
  growthOpportunities: string[];
  recommendations: {
    action: string;
    rationale: string;
    expectedImpact: string;
    priority: string;
  }[];
  managementActions: string[];
}

export interface CachedExecutiveReport {
  report: GeneratedReport;
  generatedAt: string;
  elapsedMs?: number;
  cachedOnServer?: boolean;
}

type ReportStage =
  | 'idle'
  | 'retrieving_metrics'
  | 'aggregating_analytics'
  | 'generating_ai'
  | 'combining_report';

const STAGE_MESSAGES: Record<Exclude<ReportStage, 'idle'>, string> = {
  retrieving_metrics: 'Step 1 of 4: Retrieving already-calculated business KPIs...',
  aggregating_analytics:
    'Step 2 of 4: Collecting aggregated category, regional, product, and monthly statistics...',
  generating_ai:
    'Step 3 of 4: Generating AI interpretation and recommendations via Gemini Flash...',
  combining_report:
    'Step 4 of 4: Combining verified metrics and AI insights into the executive report...',
};

interface ExecutiveReportsPageProps {
  sessionId: string;
  datasetHash: string;
  isDatasetSynced: boolean;
  onMarkSynced: () => void;
  datasetName: string;
  rows: DataRow[];
  columns: string[];
  mapping: ColumnRoleMapping;
  precomputedQuality: DataQualitySummary;
  precomputedAnalytics: BusinessAnalyticsResult;
  cachedReports: Record<string, CachedExecutiveReport>;
  onCacheReport: (cacheKey: string, entry: CachedExecutiveReport) => void;
}

export function ExecutiveReportsPage({
  sessionId,
  datasetHash,
  isDatasetSynced,
  onMarkSynced,
  datasetName,
  rows,
  columns,
  mapping,
  precomputedQuality,
  precomputedAnalytics,
  cachedReports,
  onCacheReport,
}: ExecutiveReportsPageProps) {
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [detailLevel, setDetailLevel] = useState<'standard' | 'concise'>('standard');

  const [stage, setStage] = useState<ReportStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDateStart('');
    setDateEnd('');
    setSelectedCategory('ALL');
    setSelectedRegion('ALL');
    setError(null);
  }, [datasetHash]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const map = buildCanonicalLabelMap(rows, mapping.categoryCol, 'Uncategorized');
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, mapping.categoryCol]);

  const regionOptions = useMemo(() => {
    const map = buildCanonicalLabelMap(rows, mapping.regionCol, 'Unspecified');
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, mapping.regionCol]);

  const hasScopeFilters =
    Boolean(dateStart) ||
    Boolean(dateEnd) ||
    selectedCategory !== 'ALL' ||
    selectedRegion !== 'ALL';

  // Step 1 & Step 2: Reuse precomputed metrics & analytics when unfiltered; compute scoped slice only when filtered
  const scopedRows = useMemo(() => {
    if (!hasScopeFilters) return rows;
    return filterRowsForScope(rows, mapping, {
      dateStart: dateStart || undefined,
      dateEnd: dateEnd || undefined,
      categoryKey: selectedCategory,
      regionKey: selectedRegion,
    });
  }, [rows, mapping, hasScopeFilters, dateStart, dateEnd, selectedCategory, selectedRegion]);

  const analytics = useMemo(() => {
    if (!hasScopeFilters) return precomputedAnalytics;
    return computeBusinessAnalytics(scopedRows, mapping);
  }, [hasScopeFilters, precomputedAnalytics, scopedRows, mapping]);

  const quality = useMemo(() => {
    if (!hasScopeFilters) return precomputedQuality;
    return profileDataset(scopedRows, columns);
  }, [hasScopeFilters, precomputedQuality, scopedRows, columns]);

  const reportCacheKey = useMemo(() => {
    const scopePart = `${dateStart || '*'}|${dateEnd || '*'}|${selectedCategory}|${selectedRegion}|${detailLevel}`;
    return `${datasetHash}::${scopePart}`;
  }, [datasetHash, dateStart, dateEnd, selectedCategory, selectedRegion, detailLevel]);

  const cachedEntry = cachedReports[reportCacheKey] ?? null;
  const report = cachedEntry?.report ?? null;
  const generatedAt = cachedEntry?.generatedAt ?? null;
  const loading = stage !== 'idle';

  const resetScopeFilters = () => {
    setDateStart('');
    setDateEnd('');
    setSelectedCategory('ALL');
    setSelectedRegion('ALL');
  };

  const handleGenerateReport = async (forceRefresh = false) => {
    if (scopedRows.length === 0) {
      setError('No records match the selected report filters. Adjust or reset filters first.');
      return;
    }

    // Immediate client cache hit when unchanged and not forcing regeneration
    if (!forceRefresh && cachedEntry) {
      setLoadedFromCache(true);
      setLastElapsedMs(0);
      setError(null);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setLoadedFromCache(false);

    try {
      // Step 1: Retrieve already calculated business metrics
      setStage('retrieving_metrics');
      await new Promise((r) => setTimeout(r, 40));
      if (controller.signal.aborted) return;

      // Step 2: Retrieve existing dashboard analytics & prepare compact aggregated summary (no raw rows)
      setStage('aggregating_analytics');
      const compactSummary = buildCompactAIContext(
        datasetName,
        columns,
        mapping,
        quality,
        analytics,
        scopedRows,
        { includeSampleRows: false }
      );
      await new Promise((r) => setTimeout(r, 40));
      if (controller.signal.aborted) return;

      // Step 3: Single structured Gemini Flash request using only compact pre-aggregated summary
      setStage('generating_ai');
      const reqStart = performance.now();
      const response = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          cacheKey: reportCacheKey,
          forceRefresh,
          detailLevel,
          compactSummary,
        }),
      });

      const data = (await response.json()) as {
        report?: GeneratedReport;
        generatedAt?: string;
        cached?: boolean;
        elapsedMs?: number;
        error?: string;
      };

      if (!response.ok || !data.report) {
        setError(data.error || 'Failed to generate executive report.');
        setStage('idle');
        return;
      }

      // Step 4: Combine calculated metrics and AI insights into executive report & cache
      setStage('combining_report');
      if (!isDatasetSynced) onMarkSynced();
      const totalMs = Math.round(data.elapsedMs ?? performance.now() - reqStart);
      setLastElapsedMs(totalMs);
      setLoadedFromCache(Boolean(data.cached));

      onCacheReport(reportCacheKey, {
        report: data.report,
        generatedAt: data.generatedAt || new Date().toISOString(),
        elapsedMs: totalMs,
        cachedOnServer: Boolean(data.cached),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        `Network error generating executive report: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setStage('idle');
    }
  };

  const kpiSummaryRows = [
    [
      'Total Revenue',
      analytics.kpis.totalRevenue.available
        ? formatCurrency(analytics.kpis.totalRevenue.value)
        : `Unavailable (${analytics.kpis.totalRevenue.reasonIfUnavailable})`,
    ],
    [
      'Total Profit',
      analytics.kpis.totalProfit.available
        ? formatCurrency(analytics.kpis.totalProfit.value)
        : `Unavailable (${analytics.kpis.totalProfit.reasonIfUnavailable})`,
    ],
    [
      'Profit Margin',
      analytics.kpis.profitMargin.available
        ? formatPlainPercent(analytics.kpis.profitMargin.value, 2)
        : 'Unavailable',
    ],
    [
      'Total Orders',
      analytics.kpis.totalOrders.available
        ? formatNumber(analytics.kpis.totalOrders.value)
        : 'Unavailable',
    ],
    [
      'Average Order Value',
      analytics.kpis.averageOrderValue.available
        ? formatCurrency(analytics.kpis.averageOrderValue.value)
        : 'Unavailable',
    ],
    [
      'Total Quantity Sold',
      analytics.kpis.totalQuantitySold.available
        ? formatNumber(analytics.kpis.totalQuantitySold.value)
        : 'Unavailable',
    ],
    [
      'Net Sales Growth',
      analytics.kpis.salesGrowth.available
        ? formatPercent(analytics.kpis.salesGrowth.value, 2)
        : `Unavailable (${analytics.kpis.salesGrowth.reasonIfUnavailable})`,
    ],
  ];

  // Step 5: Lightweight PDF Download (direct vector tables, low memory)
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(11, 25, 51);
    doc.rect(0, 0, pageWidth, 78, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text('Intelligent Business Data Analysis & Decision Support System', 40, 28);
    doc.setFontSize(11);
    doc.setTextColor(226, 232, 240);
    doc.text('Executive Business Report', 40, 46);
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    const scopeLabel = hasScopeFilters ? 'Filtered Scope' : 'Full Dataset';
    doc.text(
      `Dataset: ${datasetName} (${scopeLabel}: ${scopedRows.length.toLocaleString()} rows)  |  Generated: ${new Date(
        generatedAt || Date.now()
      ).toLocaleDateString()}`,
      40,
      64
    );

    let cursorY = 96;
    const ensureSpace = (needed = 44) => {
      if (cursorY + needed > 770) {
        doc.addPage();
        cursorY = 48;
      }
    };

    const addSectionTitle = (title: string) => {
      ensureSpace(40);
      doc.setFontSize(11.5);
      doc.setTextColor(15, 41, 74);
      doc.text(title, 40, cursorY);
      cursorY += 15;
    };

    const addBodyParagraph = (text: string) => {
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      const wrapped = doc.splitTextToSize(text, pageWidth - 80);
      ensureSpace(wrapped.length * 13 + 10);
      doc.text(wrapped, 40, cursorY);
      cursorY += wrapped.length * 13 + 10;
    };

    const addBulletList = (items: string[]) => {
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      for (const item of items) {
        const wrapped = doc.splitTextToSize(`• ${item}`, pageWidth - 88);
        ensureSpace(wrapped.length * 13 + 4);
        doc.text(wrapped, 44, cursorY);
        cursorY += wrapped.length * 13 + 4;
      }
      cursorY += 6;
    };

    const getLastTableY = (fallbackOffset = 100) =>
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
        cursorY + fallbackOffset) + 18;

    // 1. Executive Summary
    addSectionTitle('1. Executive Summary (AI-Synthesized)');
    addBodyParagraph(
      report?.executiveSummary ||
        `Verified KPI report for ${datasetName} covering ${scopedRows.length.toLocaleString()} records.`
    );

    // 2. Business Performance Overview
    addSectionTitle('2. Business Performance Overview');
    addBodyParagraph(
      report?.datasetOverview ||
        `${scopedRows.length.toLocaleString()} rows across ${columns.length} columns. Duplicate rows: ${quality.duplicateRowCount}; Missing cells: ${quality.totalMissingCells} (${quality.missingCellPct.toFixed(1)}%).`
    );

    // 3. Key Performance Indicators
    addSectionTitle('3. Key Performance Indicators (Verified Metrics)');
    autoTable(doc, {
      startY: cursorY,
      head: [['Metric', 'Verified Value']],
      body: kpiSummaryRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
      margin: { left: 40, right: 40 },
    });
    cursorY = getLastTableY();

    // 4. Revenue and Profit Analysis
    addSectionTitle('4. Revenue and Profit Analysis');
    if (report?.trendAnalysis) addBodyParagraph(report.trendAnalysis);
    if (analytics.monthlySeries.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        head: [['Month', 'Orders', 'Revenue', 'Profit', 'MoM Growth %']],
        body: analytics.monthlySeries.slice(-12).map((m) => [
          m.period,
          formatNumber(m.orders),
          m.revenue !== null ? formatCurrency(m.revenue) : '—',
          m.profit !== null ? formatCurrency(m.profit) : '—',
          m.momRevenueGrowthPct !== null ? formatPercent(m.momRevenueGrowthPct, 1) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        margin: { left: 40, right: 40 },
      });
      cursorY = getLastTableY();
    }

    // 5. Category Performance
    if (analytics.categoryBreakdown.length > 0) {
      addSectionTitle('5. Category Performance (Verified Breakdown)');
      autoTable(doc, {
        startY: cursorY,
        head: [['Category', 'Orders', 'Revenue', 'Share %', 'Profit', 'Margin %']],
        body: analytics.categoryBreakdown.slice(0, 12).map((c) => [
          c.name,
          formatNumber(c.orders),
          c.revenue !== null ? formatCurrency(c.revenue) : '—',
          c.revenueSharePct !== null ? formatPlainPercent(c.revenueSharePct, 1) : '—',
          c.profit !== null ? formatCurrency(c.profit) : '—',
          c.profitMarginPct !== null ? formatPlainPercent(c.profitMarginPct, 1) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        margin: { left: 40, right: 40 },
      });
      cursorY = getLastTableY();
    }

    // 6. Regional Performance
    if (analytics.regionBreakdown.length > 0) {
      addSectionTitle('6. Regional Performance (Verified Breakdown)');
      autoTable(doc, {
        startY: cursorY,
        head: [['Region', 'Orders', 'Revenue', 'Share %', 'Profit', 'Margin %']],
        body: analytics.regionBreakdown.slice(0, 12).map((r) => [
          r.name,
          formatNumber(r.orders),
          r.revenue !== null ? formatCurrency(r.revenue) : '—',
          r.revenueSharePct !== null ? formatPlainPercent(r.revenueSharePct, 1) : '—',
          r.profit !== null ? formatCurrency(r.profit) : '—',
          r.profitMarginPct !== null ? formatPlainPercent(r.profitMarginPct, 1) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        margin: { left: 40, right: 40 },
      });
      cursorY = getLastTableY();
    }

    // 7. Product Performance
    if (analytics.productBreakdown.length > 0) {
      addSectionTitle('7. Product Performance (Top Verified Products)');
      autoTable(doc, {
        startY: cursorY,
        head: [['Product', 'Orders', 'Qty', 'Revenue', 'Profit', 'Margin %']],
        body: analytics.productBreakdown.slice(0, 12).map((p) => [
          p.name,
          formatNumber(p.orders),
          p.quantity !== null ? formatNumber(p.quantity) : '—',
          p.revenue !== null ? formatCurrency(p.revenue) : '—',
          p.profit !== null ? formatCurrency(p.profit) : '—',
          p.profitMarginPct !== null ? formatPlainPercent(p.profitMarginPct, 1) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        margin: { left: 40, right: 40 },
      });
      cursorY = getLastTableY();
    }

    if (report) {
      addSectionTitle('8. Important Business Trends (Observed & AI Insights)');
      addBulletList(report.importantFindings);

      addSectionTitle('9. Potential Business Risks (AI Risk Audit)');
      addBulletList(report.potentialRisks);

      addSectionTitle('10. Growth Opportunities (AI Insights)');
      addBulletList(report.growthOpportunities);

      addSectionTitle('11. AI-Generated Recommendations');
      autoTable(doc, {
        startY: cursorY,
        head: [['Priority', 'Action', 'Rationale', 'Expected Impact']],
        body: report.recommendations.map((r) => [
          r.priority,
          r.action,
          r.rationale,
          r.expectedImpact,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 41, 74], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        margin: { left: 40, right: 40 },
      });
      cursorY = getLastTableY();

      addSectionTitle('12. Suggested Management Actions');
      addBulletList(report.managementActions);
    }

    const baseName = datasetName.replace(/\.(csv|xlsx|xls)$/i, '');
    doc.save(`${baseName}_executive_report.pdf`);
  };

  const handleDownloadCSV = () => {
    const csvRows: { Section: string; Item: string; Value_or_Detail: string }[] = [];

    for (const [metric, val] of kpiSummaryRows) {
      csvRows.push({ Section: 'Key Performance Indicators', Item: metric, Value_or_Detail: val });
    }
    analytics.categoryBreakdown.forEach((c) =>
      csvRows.push({
        Section: 'Category Performance',
        Item: c.name,
        Value_or_Detail: `Revenue: ${c.revenue !== null ? formatCurrency(c.revenue) : 'N/A'} | Profit: ${
          c.profit !== null ? formatCurrency(c.profit) : 'N/A'
        } | Margin: ${c.profitMarginPct !== null ? formatPlainPercent(c.profitMarginPct, 1) : 'N/A'} | Orders: ${
          c.orders
        }`,
      })
    );
    analytics.regionBreakdown.forEach((r) =>
      csvRows.push({
        Section: 'Regional Performance',
        Item: r.name,
        Value_or_Detail: `Revenue: ${r.revenue !== null ? formatCurrency(r.revenue) : 'N/A'} | Profit: ${
          r.profit !== null ? formatCurrency(r.profit) : 'N/A'
        } | Margin: ${r.profitMarginPct !== null ? formatPlainPercent(r.profitMarginPct, 1) : 'N/A'} | Orders: ${
          r.orders
        }`,
      })
    );
    analytics.productBreakdown.slice(0, 15).forEach((p) =>
      csvRows.push({
        Section: 'Product Performance',
        Item: p.name,
        Value_or_Detail: `Revenue: ${p.revenue !== null ? formatCurrency(p.revenue) : 'N/A'} | Profit: ${
          p.profit !== null ? formatCurrency(p.profit) : 'N/A'
        } | Margin: ${p.profitMarginPct !== null ? formatPlainPercent(p.profitMarginPct, 1) : 'N/A'} | Orders: ${
          p.orders
        }`,
      })
    );

    if (report) {
      csvRows.push({
        Section: 'Executive Summary',
        Item: 'AI Synthesis',
        Value_or_Detail: report.executiveSummary,
      });
      csvRows.push({
        Section: 'Business Performance Overview',
        Item: 'Scope & Quality',
        Value_or_Detail: report.datasetOverview,
      });
      csvRows.push({
        Section: 'Revenue and Profit Analysis',
        Item: 'Trajectory',
        Value_or_Detail: report.trendAnalysis,
      });
      report.importantFindings.forEach((f, idx) =>
        csvRows.push({ Section: 'Important Business Trends', Item: `Trend ${idx + 1}`, Value_or_Detail: f })
      );
      report.potentialRisks.forEach((r, idx) =>
        csvRows.push({ Section: 'Potential Business Risks', Item: `Risk ${idx + 1}`, Value_or_Detail: r })
      );
      report.growthOpportunities.forEach((g, idx) =>
        csvRows.push({ Section: 'Growth Opportunities', Item: `Opportunity ${idx + 1}`, Value_or_Detail: g })
      );
      report.recommendations.forEach((rec) =>
        csvRows.push({
          Section: 'AI-Generated Recommendations',
          Item: `[${rec.priority}] ${rec.action}`,
          Value_or_Detail: `${rec.rationale} | Expected Impact: ${rec.expectedImpact}`,
        })
      );
      report.managementActions.forEach((a, idx) =>
        csvRows.push({ Section: 'Suggested Management Actions', Item: `Action ${idx + 1}`, Value_or_Detail: a })
      );
    }

    const csv = Papa.unparse(csvRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const baseName = datasetName.replace(/\.(csv|xlsx|xls)$/i, '');
    triggerBlobDownload(blob, `${baseName}_executive_report.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Executive Business Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Combines pre-calculated business metrics with fast Gemini Flash narrative synthesis into downloadable PDF and CSV briefings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          {report ? (
            <button
              type="button"
              onClick={() => handleGenerateReport(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate Report
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleGenerateReport(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generate AI Executive Report
            </button>
          )}
        </div>
      </div>

      {/* Report Scope & Settings Bar (Cache-Aware) */}
      <section
        aria-label="Report Scope and Settings"
        className="bg-white border border-slate-200 rounded-xl p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label htmlFor="rep-date-start" className="block text-xs font-medium text-slate-600 mb-1">
              Start Date
            </label>
            <input
              id="rep-date-start"
              type="date"
              disabled={!mapping.dateCol}
              value={dateStart}
              min={precomputedAnalytics.dateBounds.minDate ?? undefined}
              max={precomputedAnalytics.dateBounds.maxDate ?? undefined}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="rep-date-end" className="block text-xs font-medium text-slate-600 mb-1">
              End Date
            </label>
            <input
              id="rep-date-end"
              type="date"
              disabled={!mapping.dateCol}
              value={dateEnd}
              min={precomputedAnalytics.dateBounds.minDate ?? undefined}
              max={precomputedAnalytics.dateBounds.maxDate ?? undefined}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="rep-category" className="block text-xs font-medium text-slate-600 mb-1">
              Category
            </label>
            <select
              id="rep-category"
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
            <label htmlFor="rep-region" className="block text-xs font-medium text-slate-600 mb-1">
              Region
            </label>
            <select
              id="rep-region"
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

          <div>
            <label htmlFor="rep-depth" className="block text-xs font-medium text-slate-600 mb-1">
              Report Depth
            </label>
            <select
              id="rep-depth"
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as 'standard' | 'concise')}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="standard">Standard Executive</option>
              <option value="concise">Concise Brief</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={resetScopeFilters}
              disabled={!hasScopeFilters}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Scope
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Staged Loading Progress Banner (Non-Blocking) */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="bg-white border border-blue-200 rounded-xl p-5 flex items-center gap-3.5"
        >
          <Loader2 className="w-5 h-5 animate-spin text-[#0F294A] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{STAGE_MESSAGES[stage]}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Sending pre-aggregated KPIs and dimensional summaries only—all numeric totals remain verified locally.
            </p>
          </div>
        </div>
      )}

      {/* Verified Quantitative Core Sections (Always Immediately Ready — Source of Truth) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">
              Verified Business Performance &amp; KPIs — {datasetName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              {scopedRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
              <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span>
              {columns.length} columns
              <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span>
              {analytics.dateBounds.minDate && analytics.dateBounds.maxDate
                ? `${analytics.dateBounds.minDate} to ${analytics.dateBounds.maxDate}`
                : 'No date bounds'}
            </p>
          </div>
          {generatedAt && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {loadedFromCache || cachedEntry?.cachedOnServer ? 'Cached briefing' : 'Generated'}{' '}
                {new Date(generatedAt).toLocaleTimeString()}
                {lastElapsedMs !== null && lastElapsedMs > 0 ? ` (${(lastElapsedMs / 1000).toFixed(1)}s)` : ''}
              </span>
            </span>
          )}
        </div>

        {/* 03. Key Performance Indicators */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="text-sm font-display font-semibold text-[#0F294A]">
              Key Performance Indicators
            </h3>
            <span className="text-xs text-slate-500">Observed Data · Matches Dashboard KPIs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Key Performance Indicator</th>
                  <th className="px-4 py-2.5 text-right">Verified Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpiSummaryRows.map(([label, val]) => (
                  <tr key={label} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {val}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Prompt Banner if AI Narrative hasn't been generated yet */}
      {!report && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <FileText className="w-8 h-8 text-[#0F294A] mx-auto" />
          <h2 className="mt-3 text-base font-display font-semibold text-slate-900">
            Generate AI-Synthesized Executive Briefing
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-xl mx-auto">
            Click &quot;Generate AI Executive Report&quot; to synthesize Executive Summary, Business Trends, Risk Audit, Growth Opportunities, and Management Actions from your compact pre-aggregated metrics.
          </p>
        </div>
      )}

      {/* AI Narrative + Verified Breakdown Sections (All 12 Required Sections) */}
      {report && (
        <div className="space-y-5">
          {/* 01. Executive Summary & 02. Business Performance Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-[#0F294A]">
                  01. Executive Summary
                </h3>
                <span className="text-[11px] text-slate-500">AI Interpretation</span>
              </div>
              <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">
                {report.executiveSummary}
              </p>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-[#0F294A]">
                  02. Business Performance Overview
                </h3>
                <span className="text-[11px] text-slate-500">Observed Scope + AI Summary</span>
              </div>
              <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">
                {report.datasetOverview}
              </p>
              <p className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 font-mono tabular-nums">
                Quality check: {quality.duplicateRowCount} duplicate rows · {quality.totalMissingCells} missing cells ({quality.missingCellPct.toFixed(1)}%)
              </p>
            </section>
          </div>

          {/* 04. Revenue and Profit Analysis */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <h3 className="text-base font-display font-semibold text-[#0F294A]">
                04. Revenue and Profit Analysis
              </h3>
              <span className="text-[11px] text-slate-500">
                Observed Monthly Metrics &amp; AI Trajectory Narrative
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{report.trendAnalysis}</p>
            {analytics.monthlySeries.length > 0 && (
              <div className="overflow-x-auto border-t border-slate-100 pt-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2 text-right">MoM Growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.monthlySeries.slice(-12).map((m) => (
                      <tr key={m.period} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-mono font-medium text-slate-900">{m.period}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                          {formatNumber(m.orders)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-slate-900">
                          {m.revenue !== null ? formatCurrency(m.revenue) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {m.profit !== null ? formatCurrency(m.profit) : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${
                            m.momRevenueGrowthPct === null
                              ? 'text-slate-400'
                              : m.momRevenueGrowthPct < 0
                              ? 'text-red-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {m.momRevenueGrowthPct !== null
                            ? formatPercent(m.momRevenueGrowthPct, 1)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 05. Category Performance & 06. Regional Performance (Verified Calculations) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-[#0F294A]">
                  05. Category Performance
                </h3>
                <span className="text-[11px] text-slate-500">Observed Data</span>
              </div>
              {analytics.categoryBreakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5 text-right">Revenue</th>
                        <th className="px-4 py-2.5 text-right">Share</th>
                        <th className="px-4 py-2.5 text-right">Profit</th>
                        <th className="px-4 py-2.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.categoryBreakdown.map((c) => (
                        <tr key={c.name} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {c.revenue !== null ? formatCurrency(c.revenue) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {c.revenueSharePct !== null ? formatPlainPercent(c.revenueSharePct, 1) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {c.profit !== null ? formatCurrency(c.profit) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {c.profitMarginPct !== null ? formatPlainPercent(c.profitMarginPct, 1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500">
                  No Category column mapped for this dataset.
                </p>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-[#0F294A]">
                  06. Regional Performance
                </h3>
                <span className="text-[11px] text-slate-500">Observed Data</span>
              </div>
              {analytics.regionBreakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Region</th>
                        <th className="px-4 py-2.5 text-right">Revenue</th>
                        <th className="px-4 py-2.5 text-right">Share</th>
                        <th className="px-4 py-2.5 text-right">Profit</th>
                        <th className="px-4 py-2.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.regionBreakdown.map((r) => (
                        <tr key={r.name} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {r.revenue !== null ? formatCurrency(r.revenue) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {r.revenueSharePct !== null ? formatPlainPercent(r.revenueSharePct, 1) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {r.profit !== null ? formatCurrency(r.profit) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {r.profitMarginPct !== null ? formatPlainPercent(r.profitMarginPct, 1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500">
                  No Region column mapped for this dataset.
                </p>
              )}
            </section>
          </div>

          {/* 07. Product Performance */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-base font-display font-semibold text-[#0F294A]">
                07. Product Performance
              </h3>
              <span className="text-[11px] text-slate-500">
                Observed Top Products ({analytics.productBreakdown.length} total)
              </span>
            </div>
            {analytics.productBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5 text-right">Orders</th>
                      <th className="px-4 py-2.5 text-right">Quantity</th>
                      <th className="px-4 py-2.5 text-right">Revenue</th>
                      <th className="px-4 py-2.5 text-right">Share</th>
                      <th className="px-4 py-2.5 text-right">Profit</th>
                      <th className="px-4 py-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.productBreakdown.slice(0, 10).map((p) => (
                      <tr key={p.name} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {formatNumber(p.orders)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {p.quantity !== null ? formatNumber(p.quantity) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                          {p.revenue !== null ? formatCurrency(p.revenue) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                          {p.revenueSharePct !== null ? formatPlainPercent(p.revenueSharePct, 1) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                          {p.profit !== null ? formatCurrency(p.profit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {p.profitMarginPct !== null ? formatPlainPercent(p.profitMarginPct, 1) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-slate-500">
                No Product column mapped for this dataset.
              </p>
            )}
          </section>

          {/* 08. Important Business Trends */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-display font-semibold text-[#0F294A]">
                08. Important Business Trends
              </h3>
              <span className="text-[11px] text-slate-500">AI Findings from Observed Metrics</span>
            </div>
            <ul className="mt-3 space-y-2">
              {report.importantFindings.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="font-mono text-xs text-slate-400 mt-0.5 tabular-nums">
                    {idx + 1}.
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 09. Potential Business Risks & 10. Growth Opportunities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-red-800">
                  09. Potential Business Risks
                </h3>
                <span className="text-[11px] text-slate-500">AI Risk Analysis</span>
              </div>
              <ul className="mt-3 space-y-2">
                {report.potentialRisks.map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                    <span className="text-red-600 select-none">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-semibold text-emerald-800">
                  10. Growth Opportunities
                </h3>
                <span className="text-[11px] text-slate-500">AI Opportunity Analysis</span>
              </div>
              <ul className="mt-3 space-y-2">
                {report.growthOpportunities.map((opp, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 select-none">•</span>
                    <span>{opp}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 11. AI-Generated Recommendations */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-base font-display font-semibold text-[#0F294A]">
                11. AI-Generated Recommendations
              </h3>
              <span className="text-[11px] text-slate-500">AI Strategic Guidance</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Priority</th>
                    <th className="px-4 py-2.5">Recommended Action</th>
                    <th className="px-4 py-2.5">Observed Rationale</th>
                    <th className="px-4 py-2.5">Expected Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.recommendations.map((rec, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {rec.priority}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{rec.action}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs leading-relaxed">
                        {rec.rationale}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs leading-relaxed">
                        {rec.expectedImpact}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 12. Suggested Management Actions */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-display font-semibold text-[#0F294A]">
                12. Suggested Management Actions
              </h3>
              <span className="text-[11px] text-slate-500">Next 30–90 Days</span>
            </div>
            <ol className="mt-3 space-y-2">
              {report.managementActions.map((act, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="font-mono text-xs font-semibold text-[#0F294A] mt-0.5 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  <span>{act}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
