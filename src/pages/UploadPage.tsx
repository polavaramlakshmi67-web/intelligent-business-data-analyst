import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Table as TableIcon,
} from 'lucide-react';
import {
  DataRow,
  profileDataset,
  isEmptyCell,
} from '../../shared/analyticsEngine';
import { SAMPLE_DATASETS } from '../data/sampleDatasets';
import type { PageId } from '../components/Sidebar';

interface UploadPageProps {
  datasetName: string;
  originalRows: DataRow[];
  columns: string[];
  onLoadDataset: (name: string, columns: string[], rows: DataRow[]) => void;
  onNavigate: (page: PageId) => void;
}

export function UploadPage({
  datasetName,
  originalRows,
  columns,
  onLoadDataset,
  onNavigate,
}: UploadPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [pendingWorkbook, setPendingWorkbook] = useState<{
    filename: string;
    workbook: XLSX.WorkBook;
  } | null>(null);

  const profile = useMemo(
    () => profileDataset(originalRows, columns),
    [originalRows, columns]
  );

  const numericCols = profile.columns.filter((c) => c.detectedType === 'numeric');
  const categoricalCols = profile.columns.filter((c) => c.detectedType === 'categorical');
  const dateCols = profile.columns.filter((c) => c.detectedType === 'date');

  const finalizeRows = (filename: string, rawObjects: Record<string, unknown>[]) => {
    if (!rawObjects || rawObjects.length === 0) {
      setUploadError('The uploaded file appears empty or contains no data rows.');
      return;
    }

    const parsedCols: string[] = [];
    const rawKeysByCleanCol = new Map<string, string[]>();

    for (const row of rawObjects.slice(0, 100)) {
      for (const rawKey of Object.keys(row)) {
        const cleanKey = rawKey.replace(/^\uFEFF/, '').trim();
        if (!cleanKey) continue;
        if (!rawKeysByCleanCol.has(cleanKey)) {
          parsedCols.push(cleanKey);
          rawKeysByCleanCol.set(cleanKey, [rawKey]);
        } else {
          const existing = rawKeysByCleanCol.get(cleanKey)!;
          if (!existing.includes(rawKey)) existing.push(rawKey);
        }
      }
    }

    if (parsedCols.length === 0) {
      setUploadError('No valid column headers could be identified.');
      return;
    }

    const normalizedRows: DataRow[] = rawObjects.map((r) => {
      const out: DataRow = {};
      for (const col of parsedCols) {
        const rawKeys = rawKeysByCleanCol.get(col) ?? [col];
        let val: unknown = undefined;
        for (const rk of rawKeys) {
          if (Object.prototype.hasOwnProperty.call(r, rk) && r[rk] !== undefined && r[rk] !== null && r[rk] !== '') {
            val = r[rk];
            break;
          }
        }
        if (val === undefined) {
          val = r[rawKeys[0]];
        }
        if (val === undefined || val === null || val === '') {
          out[col] = null;
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          out[col] = val;
        } else {
          out[col] = String(val);
        }
      }
      return out;
    });

    setUploadError(null);
    setPendingWorkbook(null);
    setSheetNames([]);
    onLoadDataset(filename, parsedCols, normalizedRows);
  };

  const handleFile = async (file: File) => {
    setUploadError(null);
    setPendingWorkbook(null);
    setSheetNames([]);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header: string) => header.replace(/^\uFEFF/, '').trim(),
        complete: (results) => {
          if (results.errors && results.errors.length > 0 && results.data.length === 0) {
            setUploadError(`CSV parse error: ${results.errors[0].message}`);
            return;
          }
          finalizeRows(file.name, results.data);
        },
        error: (err) => {
          setUploadError(`Failed to read CSV file: ${err.message}`);
        },
      });
      return;
    }

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          setUploadError('The Excel workbook has no readable worksheets.');
          return;
        }
        if (workbook.SheetNames.length === 1) {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: null,
            raw: false,
          });
          finalizeRows(file.name, json);
        } else {
          setPendingWorkbook({ filename: file.name, workbook });
          setSheetNames(workbook.SheetNames);
        }
      } catch (err) {
        setUploadError(
          `Failed to read Excel file: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }

    setUploadError('Unsupported file format. Please upload a .csv, .xlsx, or .xls file.');
  };

  const handleSelectExcelSheet = (sheetName: string) => {
    if (!pendingWorkbook) return;
    const sheet = pendingWorkbook.workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });
    finalizeRows(`${pendingWorkbook.filename} (${sheetName})`, json);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Dataset Upload & Schema Profiling
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload CSV or Excel workbooks. Your original dataset is preserved untouched; all cleaning happens on a separate working copy.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('quality')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] transition-colors whitespace-nowrap"
          >
            Review Data Quality
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Upload Zone + Sample Datasets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-600 bg-blue-50/60'
                : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
            }`}
          >
            <UploadCloud className="w-10 h-10 text-[#0F294A] mx-auto" />
            <h2 className="mt-3 text-base font-display font-semibold text-slate-900">
              Drop your CSV or Excel file here
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Supports .csv, .xlsx, and .xls files processed directly in memory
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-5 py-2.5 text-sm font-medium bg-[#0F294A] text-white rounded-lg hover:bg-[#173B69] transition-colors"
            >
              Browse Files
            </button>
          </div>

          {uploadError && (
            <div className="mt-4 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{uploadError}</span>
            </div>
          )}

          {pendingWorkbook && sheetNames.length > 1 && (
            <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-sm font-semibold text-slate-900">
                Select worksheet from {pendingWorkbook.filename}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {sheetNames.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    onClick={() => handleSelectExcelSheet(sheet)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:border-blue-600 hover:text-blue-700"
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Built-in Sample Datasets */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-slate-900">
              Sample Business Datasets
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Load a pre-built dataset to verify profiling, cleaning, dashboards, and AI Q&A.
            </p>
            <div className="mt-4 space-y-3">
              {SAMPLE_DATASETS.map((sample) => {
                const isActive = datasetName === sample.name;
                return (
                  <div
                    key={sample.id}
                    className={`p-3.5 rounded-lg border transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-50/40'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{sample.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{sample.subtitle}</p>
                      </div>
                      {isActive && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                    </div>
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">{sample.description}</p>
                    <button
                      type="button"
                      onClick={() => onLoadDataset(sample.name, sample.columns, sample.rows)}
                      className="mt-3 w-full py-1.5 px-3 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 transition-colors"
                    >
                      {isActive ? 'Reload Original Sample' : 'Load Dataset'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Automatic Dataset Profile Overview */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Dimensions</p>
          <p className="mt-1.5 text-lg font-display font-bold text-slate-900 tabular-nums">
            {profile.rowCount.toLocaleString()} × {profile.columnCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Rows by columns</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Column Breakdown</p>
          <p className="mt-1.5 text-lg font-display font-bold text-slate-900 tabular-nums">
            {numericCols.length}N · {categoricalCols.length}C · {dateCols.length}D
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Numeric · Cat · Date</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Missing Cells</p>
          <p
            className={`mt-1.5 text-lg font-display font-bold tabular-nums ${
              profile.totalMissingCells > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {profile.totalMissingCells.toLocaleString()} ({profile.missingCellPct.toFixed(1)}%)
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Across all fields</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Duplicate Records</p>
          <p
            className={`mt-1.5 text-lg font-display font-bold tabular-nums ${
              profile.duplicateRowCount > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {profile.duplicateRowCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Exact full-row matches</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Inconsistent Values</p>
          <p
            className={`mt-1.5 text-lg font-display font-bold tabular-nums ${
              profile.inconsistentCellCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {profile.inconsistentCellCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Casing & whitespace drift</p>
        </div>
      </section>

      {/* Column Schema & Data Types Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0F294A]" />
            <h2 className="text-base font-display font-semibold text-slate-900">
              Detected Columns & Data Types
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {columns.length} columns identified
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Column Name</th>
                <th className="px-4 py-2.5">Detected Type</th>
                <th className="px-4 py-2.5 text-right">Missing</th>
                <th className="px-4 py-2.5 text-right">Unique</th>
                <th className="px-4 py-2.5 text-right">Inconsistencies</th>
                <th className="px-4 py-2.5">Sample Values</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.columns.map((col) => (
                <tr key={col.name} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-medium text-slate-900 font-mono text-xs">
                    {col.name}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 capitalize">
                    {col.detectedType}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${
                      col.missingCount > 0 ? 'text-amber-700 font-medium' : 'text-slate-600'
                    }`}
                  >
                    {col.missingCount} ({col.missingPct.toFixed(1)}%)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                    {col.uniqueCount.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${
                      col.inconsistentGroups > 0 ? 'text-amber-700 font-medium' : 'text-slate-500'
                    }`}
                  >
                    {col.inconsistentGroups}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs truncate">
                    {col.sampleValues.join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* First Rows Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-[#0F294A]" />
            <h2 className="text-base font-display font-semibold text-slate-900">
              Original Dataset Preview (First 15 Rows)
            </h2>
          </div>
          <span className="text-xs text-slate-500">Read-only source snapshot</span>
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
              {originalRows.slice(0, 15).map((row, idx) => (
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
