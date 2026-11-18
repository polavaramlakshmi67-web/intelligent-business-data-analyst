import {
  LayoutDashboard,
  UploadCloud,
  ShieldCheck,
  BarChart3,
  Bot,
  FileSpreadsheet,
  X,
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'upload'
  | 'quality'
  | 'analytics'
  | 'ask-ai'
  | 'reports';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  datasetName: string;
  rowCount: number;
  columnCount: number;
  isCleaned: boolean;
  issueCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Home / Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Dataset Upload', icon: UploadCloud },
  { id: 'quality', label: 'Data Quality Analysis', icon: ShieldCheck },
  { id: 'analytics', label: 'Business Analytics', icon: BarChart3 },
  { id: 'ask-ai', label: 'AI Business Analyst', icon: Bot },
  { id: 'reports', label: 'Executive Reports', icon: FileSpreadsheet },
];

export function Sidebar({
  activePage,
  onNavigate,
  datasetName,
  rowCount,
  columnCount,
  isCleaned,
  issueCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleSelect = (id: PageId) => {
    onNavigate(id);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B1933] text-slate-100 flex flex-col border-r border-slate-800/80 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-xs leading-snug tracking-tight text-white">
              Intelligent Business Data Analysis &amp; Decision Support System
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          <p className="px-3 pb-2 text-[11px] font-medium text-slate-400 tracking-wide">
            Workspace Modules
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/8'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'quality' && issueCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isActive ? 'text-blue-100' : 'text-amber-400'
                    }`}
                  >
                    {issueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Active Dataset Summary Footer */}
        <div className="p-4 border-t border-white/10 bg-[#081226] shrink-0">
          <p className="text-[11px] font-medium text-slate-400">Active Dataset</p>
          <p className="mt-1 text-sm font-semibold text-white truncate" title={datasetName}>
            {datasetName}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-300 font-mono tabular-nums">
            <span>{rowCount.toLocaleString()} rows</span>
            <span aria-hidden="true">·</span>
            <span>{columnCount} cols</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {isCleaned ? 'Cleaned working copy' : 'Original dataset active'}
          </p>
        </div>
      </aside>
    </>
  );
}
