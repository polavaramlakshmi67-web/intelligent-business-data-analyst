import { useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  DataRow,
  CleaningOptions,
  profileDataset,
  cleanDataset,
  isEmptyCell,
} from '../../shared/analyticsEngine';
import { downloadCSV, downloadExcel } from '../lib/formatters';

interface DataQualityPageProps {
  datasetName: string;
  originalRows: DataRow[];
  activeRows: DataRow[];
  columns: string[];
  isCleaned: boolean;
  onApplyCleaning: (cleanedRows: DataRow[]) => void;
  onResetToOriginal: () => void;
}

const DEFAULT_OPTIONS: CleaningOptions = {
  removeDuplicates: true,
  trimWhitespace: true,
  standardizeCasing: 'title',
  missingStrategy: 'fill_median_mode',
  coerceTypes: true,
};

export function DataQualityPage({
  datasetName,
  originalRows,
  activeRows,
  columns,
  isCleaned,
  onApplyCleaning,
  onResetToOriginal,
}: DataQualityPageProps) {
  const [options, setOptions] = useState<CleaningOptions>(DEFAULT_OPTIONS);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profileDataset(activeRows, columns),
    [activeRows, columns]
  );

  // Preview always calculates impact on the current working dataset (or original if user wants)
  const preview = useMemo(
    () => cleanDataset(activeRows, columns, options),
    [activeRows, columns, options]
  );

  const handleApply = () => {
    onApplyCleaning(preview.cleanedRows);
    setAppliedBanner(
      `Cleaning applied to working copy: ${preview.stats.duplicatesRemoved} duplicates removed, ${preview.stats.valuesStandardized} values standardized, ${preview.stats.missingCellsFilled} missing cells filled.`
    );
  };

  const baseFilename = datasetName.replace(/\.(csv|xlsx|xls)$/i, '');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Data Quality Analysis & Cleaning Workbench
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect data quality anomalies, preview cleaning operations, and export the cleaned dataset without altering your original source.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isCleaned && (
            <button
              type="button"
              onClick={() => {
                onResetToOriginal();
                setAppliedBanner(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Original ({originalRows.length} rows)
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadCSV(`${baseFilename}_cleaned.csv`, columns, activeRows)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => downloadExcel(`${baseFilename}_cleaned.xlsx`, columns, activeRows)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
        </div>
      </div>

      {appliedBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{appliedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setAppliedBanner(null)}
            className="text-xs font-medium text-emerald-800 hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quality Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Active Working Rows</p>
          <p className="mt-1.5 text-xl font-display font-bold text-slate-900 tabular-nums">
            {activeProfile.rowCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Original: {originalRows.length.toLocaleString()} rows
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Missing Values</p>
          <p
            className={`mt-1.5 text-xl font-display font-bold tabular-nums ${
              activeProfile.totalMissingCells > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {activeProfile.totalMissingCells.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {activeProfile.missingCellPct.toFixed(2)}% of total cells
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Duplicate Records</p>
          <p
            className={`mt-1.5 text-xl font-display font-bold tabular-nums ${
              activeProfile.duplicateRowCount > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {activeProfile.duplicateRowCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Full-row exact matches</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Identified Issues</p>
          <p
            className={`mt-1.5 text-xl font-display font-bold tabular-nums ${
              activeProfile.issues.length > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {activeProfile.issues.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {activeProfile.issues.length === 0 ? 'Dataset passed all checks' : 'Review diagnostics below'}
          </p>
        </div>
      </section>

      {/* Diagnostics + Cleaning Workbench */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Quality Diagnostics */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-[#0F294A]" />
            <h2 className="text-base font-display font-semibold text-slate-900">
              Data Quality Diagnostics
            </h2>
          </div>

          {activeProfile.issues.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-200 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <p className="mt-2 text-sm font-semibold text-slate-900">
                No quality issues detected
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                All columns have consistent formatting, zero duplicate records, and zero missing values.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activeProfile.issues.map((issue) => (
                <li key={issue.id} className="py-3 flex items-start gap-3">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      issue.severity === 'high'
                        ? 'text-red-600'
                        : issue.severity === 'medium'
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wide text-slate-700">
                        {issue.severity}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{issue.category}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800">{issue.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right: Cleaning Operations Review & Preview */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-base font-display font-semibold text-slate-900">
              Configure & Preview Cleaning Operations
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review the exact impact of each rule before applying changes to your working dataset.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clean-missing" className="block text-xs font-medium text-slate-700 mb-1.5">
                Missing Value Strategy
              </label>
              <select
                id="clean-missing"
                value={options.missingStrategy}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    missingStrategy: e.target.value as CleaningOptions['missingStrategy'],
                  }))
                }
                className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="none">Leave missing values unchanged</option>
                <option value="fill_median_mode">Fill numeric with Median & text with Mode</option>
                <option value="fill_mean_mode">Fill numeric with Mean & text with Mode</option>
                <option value="fill_zero_unknown">Fill numeric with 0 & text with &quot;Unknown&quot;</option>
                <option value="drop_rows">Drop rows containing any missing value</option>
              </select>
            </div>

            <div>
              <label htmlFor="clean-casing" className="block text-xs font-medium text-slate-700 mb-1.5">
                Standardize Text Casing
              </label>
              <select
                id="clean-casing"
                value={options.standardizeCasing}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    standardizeCasing: e.target.value as CleaningOptions['standardizeCasing'],
                  }))
                }
                className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="none">Preserve original casing</option>
                <option value="title">Title Case (e.g. &quot;North America&quot;)</option>
                <option value="upper">UPPERCASE</option>
                <option value="lower">lowercase</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/60 cursor-pointer">
              <input
                type="checkbox"
                checked={options.removeDuplicates}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, removeDuplicates: e.target.checked }))
                }
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">Remove Duplicates</p>
                <p className="text-[11px] text-slate-500">Drop identical rows</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/60 cursor-pointer">
              <input
                type="checkbox"
                checked={options.trimWhitespace}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, trimWhitespace: e.target.checked }))
                }
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">Trim Whitespace</p>
                <p className="text-[11px] text-slate-500">Strip extra spaces</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/60 cursor-pointer">
              <input
                type="checkbox"
                checked={options.coerceTypes}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, coerceTypes: e.target.checked }))
                }
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">Correct Data Types</p>
                <p className="text-[11px] text-slate-500">Parse numbers & ISO dates</p>
              </div>
            </label>
          </div>

          {/* Live Dry-Run Preview Impact */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-3">
              Dry-Run Cleaning Preview (Before Applying)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div>
                <p className="text-[11px] text-slate-500">Resulting Rows</p>
                <p className="text-base font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                  {preview.stats.resultingRows.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Duplicates Removed</p>
                <p className="text-base font-mono font-bold text-red-700 tabular-nums mt-0.5">
                  {preview.stats.duplicatesRemoved}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Missing Filled</p>
                <p className="text-base font-mono font-bold text-blue-700 tabular-nums mt-0.5">
                  {preview.stats.missingCellsFilled}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Values Standardized</p>
                <p className="text-base font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                  {preview.stats.valuesStandardized}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Types Coerced</p>
                <p className="text-base font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                  {preview.stats.typesCoerced}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500">
              Original dataset ({originalRows.length.toLocaleString()} rows) remains untouched.
            </p>
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0F294A] text-white rounded-lg hover:bg-[#173B69] transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Apply Cleaning to Working Dataset
            </button>
          </div>
        </section>
      </div>

      {/* Column Statistical Summary & Working Data Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-slate-900">
            Column Statistical & Quality Summary
          </h2>
          <span className="text-xs text-slate-500">Reflects active working dataset</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-4 py-2.5">Column</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Missing</th>
                <th className="px-4 py-2.5 text-right">Unique</th>
                <th className="px-4 py-2.5 text-right">Min</th>
                <th className="px-4 py-2.5 text-right">Median</th>
                <th className="px-4 py-2.5 text-right">Mean</th>
                <th className="px-4 py-2.5 text-right">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeProfile.columns.map((c) => (
                <tr key={c.name} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{c.detectedType}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                      c.missingCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    {c.missingCount}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {c.uniqueCount}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {c.min !== null ? c.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {c.median !== null ? c.median.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {c.mean !== null ? c.mean.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {c.max !== null ? c.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cleaned Working Data Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-slate-900">
            Working Dataset Preview (First 10 Rows)
          </h2>
          <span className="text-xs text-slate-500">
            {isCleaned ? 'Cleaned working copy' : 'Unmodified source'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-3 py-2.5 font-mono text-slate-400">#</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2.5 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeRows.slice(0, 10).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-mono text-slate-400 tabular-nums">{idx + 1}</td>
                  {columns.map((c) => {
                    const val = row[c];
                    const empty = isEmptyCell(val);
                    return (
                      <td
                        key={c}
                        className={`px-3 py-2 whitespace-nowrap font-mono tabular-nums ${
                          empty ? 'text-amber-600 italic' : 'text-slate-700'
                        }`}
                      >
                        {empty ? 'null' : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
