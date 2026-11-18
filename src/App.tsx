import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu, UploadCloud } from 'lucide-react';
import {
  DataRow,
  ColumnRoleMapping,
  inferColumnRoles,
  profileDataset,
  computeBusinessAnalytics,
  computeDatasetHash,
} from '../shared/analyticsEngine';
import { SAMPLE_DATASETS } from './data/sampleDatasets';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { BusinessAnalyticsPage } from './pages/BusinessAnalyticsPage';
import { AskAIPage, ChatMessage } from './pages/AskAIPage';
import {
  ExecutiveReportsPage,
  CachedExecutiveReport,
} from './pages/ExecutiveReportsPage';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Home / Dashboard',
  upload: 'Dataset Upload',
  quality: 'Data Quality Analysis',
  analytics: 'Business Analytics',
  'ask-ai': 'AI Business Analyst',
  reports: 'Executive Reports',
};

const MAPPING_STORAGE_PREFIX = 'ibdss_col_mapping_v1:';

function getMappingStorageKey(name: string, cols: string[]): string {
  return `${MAPPING_STORAGE_PREFIX}${name}::${cols.join('|')}`;
}

function sanitizeMapping(
  candidate: Partial<ColumnRoleMapping> | null | undefined,
  cols: string[],
  fallback: ColumnRoleMapping
): ColumnRoleMapping {
  const colSet = new Set(cols);
  const pick = (role: keyof ColumnRoleMapping): string | null => {
    if (!candidate || !(role in candidate)) return fallback[role];
    const val = candidate[role];
    if (val === null) return null;
    return typeof val === 'string' && colSet.has(val) ? val : fallback[role];
  };
  return {
    dateCol: pick('dateCol'),
    revenueCol: pick('revenueCol'),
    profitCol: pick('profitCol'),
    costCol: pick('costCol'),
    orderIdCol: pick('orderIdCol'),
    quantityCol: pick('quantityCol'),
    categoryCol: pick('categoryCol'),
    regionCol: pick('regionCol'),
    productCol: pick('productCol'),
  };
}

function resolveInitialMapping(name: string, cols: string[], rows: DataRow[]): ColumnRoleMapping {
  const inferred = inferColumnRoles(rows, cols);
  if (typeof window === 'undefined') return inferred;
  try {
    const raw = window.sessionStorage.getItem(getMappingStorageKey(name, cols));
    if (!raw) return inferred;
    const parsed = JSON.parse(raw) as Partial<ColumnRoleMapping>;
    return sanitizeMapping(parsed, cols, inferred);
  } catch {
    return inferred;
  }
}

export default function App() {
  const defaultSample = SAMPLE_DATASETS[0];

  const [sessionId] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  });

  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [datasetName, setDatasetName] = useState<string>(defaultSample.name);
  const [columns, setColumns] = useState<string[]>(defaultSample.columns);
  const [originalRows, setOriginalRows] = useState<DataRow[]>(defaultSample.rows);
  const [activeRows, setActiveRows] = useState<DataRow[]>(defaultSample.rows);
  const [isCleaned, setIsCleaned] = useState<boolean>(false);

  const [mapping, setMapping] = useState<ColumnRoleMapping>(() =>
    resolveInitialMapping(defaultSample.name, defaultSample.columns, defaultSample.rows)
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [syncedHash, setSyncedHash] = useState<string | null>(null);
  const [cachedReports, setCachedReports] = useState<Record<string, CachedExecutiveReport>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.sessionStorage.getItem('ibdss_report_cache_v1');
      return raw ? (JSON.parse(raw) as Record<string, CachedExecutiveReport>) : {};
    } catch {
      return {};
    }
  });

  const handleCacheReport = useCallback((cacheKey: string, entry: CachedExecutiveReport) => {
    setCachedReports((prev) => {
      const entries = Object.entries(prev).filter(([k]) => k !== cacheKey);
      // Keep at most 6 cached reports in memory/sessionStorage for low RAM footprint
      const trimmed = entries.slice(-5);
      const next = Object.fromEntries([...trimmed, [cacheKey, entry]]);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('ibdss_report_cache_v1', JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
      }
      return next;
    });
  }, []);

  // Persist selected column mappings in browser session state per dataset schema
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        getMappingStorageKey(datasetName, columns),
        JSON.stringify(mapping)
      );
    } catch {
      // Ignore storage quota or privacy-mode restrictions
    }
  }, [datasetName, columns, mapping]);

  const datasetHash = useMemo(
    () => computeDatasetHash(datasetName, columns, activeRows, mapping),
    [datasetName, columns, activeRows, mapping]
  );

  const qualitySummary = useMemo(
    () => profileDataset(activeRows, columns),
    [activeRows, columns]
  );

  const baseAnalytics = useMemo(
    () => computeBusinessAnalytics(activeRows, mapping),
    [activeRows, mapping]
  );

  // Sync active dataset snapshot to server once per datasetHash change
  useEffect(() => {
    if (syncedHash === datasetHash) return;
    const controller = new AbortController();
    fetch('/api/dataset/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        name: datasetName,
        columns,
        rows: activeRows,
        mapping,
      }),
      signal: controller.signal,
    })
      .then((res) => {
        if (res.ok) setSyncedHash(datasetHash);
      })
      .catch(() => {
        // Fallback payload is sent only on retry if sync didn't complete
      });
    return () => controller.abort();
  }, [sessionId, datasetName, columns, activeRows, mapping, datasetHash, syncedHash]);

  const handleLoadDataset = useCallback(
    (name: string, nextCols: string[], nextRows: DataRow[]) => {
      setDatasetName(name);
      setColumns(nextCols);
      setOriginalRows(nextRows);
      setActiveRows(nextRows);
      setIsCleaned(false);
      setMapping(resolveInitialMapping(name, nextCols, nextRows));
      setChatMessages([]);
    },
    []
  );

  const handleApplyCleaning = useCallback(
    (cleanedRows: DataRow[]) => {
      setActiveRows(cleanedRows);
      setIsCleaned(true);
      setMapping((prev) => sanitizeMapping(prev, columns, inferColumnRoles(cleanedRows, columns)));
    },
    [columns]
  );

  const handleResetToOriginal = useCallback(() => {
    setActiveRows(originalRows);
    setIsCleaned(false);
    setMapping((prev) => sanitizeMapping(prev, columns, inferColumnRoles(originalRows, columns)));
  }, [originalRows, columns]);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        datasetName={datasetName}
        rowCount={activeRows.length}
        columnCount={columns.length}
        isCleaned={isCleaned}
        issueCount={qualitySummary.issues.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Context Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Workspace
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {PAGE_TITLES[activePage]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('upload')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#0F294A]" />
              Upload Dataset
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activePage === 'dashboard' && (
            <DashboardPage
              datasetName={datasetName}
              rows={activeRows}
              columns={columns}
              mapping={mapping}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'upload' && (
            <UploadPage
              datasetName={datasetName}
              originalRows={originalRows}
              columns={columns}
              onLoadDataset={handleLoadDataset}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'quality' && (
            <DataQualityPage
              datasetName={datasetName}
              originalRows={originalRows}
              activeRows={activeRows}
              columns={columns}
              isCleaned={isCleaned}
              onApplyCleaning={handleApplyCleaning}
              onResetToOriginal={handleResetToOriginal}
            />
          )}

          {activePage === 'analytics' && (
            <BusinessAnalyticsPage
              rows={activeRows}
              columns={columns}
              mapping={mapping}
              onUpdateMapping={setMapping}
            />
          )}

          {activePage === 'ask-ai' && (
            <AskAIPage
              sessionId={sessionId}
              datasetHash={datasetHash}
              isDatasetSynced={syncedHash === datasetHash}
              onMarkSynced={() => setSyncedHash(datasetHash)}
              datasetName={datasetName}
              rows={activeRows}
              columns={columns}
              mapping={mapping}
              messages={chatMessages}
              onMessagesChange={setChatMessages}
            />
          )}

          {activePage === 'reports' && (
            <ExecutiveReportsPage
              sessionId={sessionId}
              datasetHash={datasetHash}
              isDatasetSynced={syncedHash === datasetHash}
              onMarkSynced={() => setSyncedHash(datasetHash)}
              datasetName={datasetName}
              rows={activeRows}
              columns={columns}
              mapping={mapping}
              precomputedQuality={qualitySummary}
              precomputedAnalytics={baseAnalytics}
              cachedReports={cachedReports}
              onCacheReport={handleCacheReport}
            />
          )}
        </main>
      </div>
    </div>
  );
}
