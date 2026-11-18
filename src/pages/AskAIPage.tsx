import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Send,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import type { DataRow, ColumnRoleMapping } from '../../shared/analyticsEngine';

interface ToolTraceItem {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolTraceItem[];
  error?: boolean;
  metaLabel?: string;
}

interface AskAIPageProps {
  sessionId: string;
  datasetHash: string;
  isDatasetSynced: boolean;
  onMarkSynced: () => void;
  datasetName: string;
  rows: DataRow[];
  columns: string[];
  mapping: ColumnRoleMapping;
  messages: ChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const SUGGESTED_QUESTIONS = [
  'What is the total revenue?',
  'Which product generates the highest profit?',
  'Which region has the lowest sales?',
  'What are the most profitable categories?',
  'Which months show declining revenue?',
  'What are the major business problems?',
  'How can management improve profitability?',
  'What are the important business opportunities?',
];

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;

    if (trimmed.startsWith('### ')) {
      return (
        <h4 key={i} className="font-display font-semibold text-slate-900 text-sm mt-3 mb-1">
          {renderInlineBold(trimmed.slice(4))}
        </h4>
      );
    }
    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={i} className="font-display font-bold text-[#0F294A] text-sm mt-3 mb-1">
          {renderInlineBold(trimmed.slice(3))}
        </h3>
      );
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <div key={i} className="flex items-start gap-2 pl-1 my-0.5 text-sm text-slate-800 leading-relaxed">
          <span className="text-slate-400 select-none mt-0.5">•</span>
          <span>{renderInlineBold(trimmed.slice(2))}</span>
        </div>
      );
    }
    const numMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
    if (numMatch) {
      return (
        <div key={i} className="flex items-start gap-2 pl-1 my-0.5 text-sm text-slate-800 leading-relaxed">
          <span className="font-mono text-xs text-slate-500 mt-0.5 shrink-0">{numMatch[1]}</span>
          <span>{renderInlineBold(numMatch[2])}</span>
        </div>
      );
    }
    return (
      <p key={i} className="text-sm text-slate-800 leading-relaxed my-1">
        {renderInlineBold(trimmed)}
      </p>
    );
  });
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono text-slate-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

interface AgentApiResponse {
  answer?: string;
  toolTrace?: ToolTraceItem[];
  cached?: boolean;
  source?: 'ai' | 'deterministic';
  elapsedMs?: number;
  error?: string;
  code?: string;
}

export function AskAIPage({
  sessionId,
  datasetHash,
  isDatasetSynced,
  onMarkSynced,
  datasetName,
  rows,
  columns,
  mapping,
  messages,
  onMessagesChange,
}: AskAIPageProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clientCacheRef = useRef<Map<string, { answer: string; toolTrace?: ToolTraceItem[]; source?: string }>>(
    new Map()
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Number(((Date.now() - started) / 1000).toFixed(1)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancelPendingRequest = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    onMessagesChange((prev) => [...prev, userMsg]);
    setInput('');

    // Client-side instant cache check for unchanged dataset + question
    const cacheKey = `${datasetHash}::${trimmed.toLowerCase().replace(/\s+/g, ' ')}`;
    const localCached = clientCacheRef.current.get(cacheKey);
    if (localCached) {
      onMessagesChange((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: localCached.answer,
          toolTrace: localCached.toolTrace,
          metaLabel: 'Cached response · <1ms',
        },
      ]);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const reqStart = performance.now();

    const callAgent = async (includeDatasetFallback: boolean): Promise<{ ok: boolean; data: AgentApiResponse }> => {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          question: trimmed,
          history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          ...(includeDatasetFallback
            ? {
                datasetFallback: {
                  name: datasetName,
                  columns,
                  rows,
                  mapping,
                },
              }
            : {}),
        }),
      });
      const data = (await response.json()) as AgentApiResponse;
      return { ok: response.ok, data };
    };

    try {
      // Avoid sending full dataset when already synced; fallback only if server session expired
      let result = await callAgent(!isDatasetSynced);
      if (!result.ok && result.data.code === 'DATASET_NOT_SYNCED' && isDatasetSynced) {
        result = await callAgent(true);
      }

      const { ok, data } = result;
      const clientMs = Math.round(performance.now() - reqStart);

      if (!ok) {
        onMessagesChange((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: data.error || 'Failed to generate AI analysis. Please try again.',
            error: true,
          },
        ]);
      } else {
        if (!isDatasetSynced) onMarkSynced();
        const answer = data.answer || 'No response returned.';
        const metaParts: string[] = [];
        if (data.cached) metaParts.push('Cached');
        else if (data.source === 'deterministic') metaParts.push('Instant calculation');
        else metaParts.push('AI synthesis');
        metaParts.push(`${data.elapsedMs ?? clientMs}ms`);

        if (clientCacheRef.current.size >= 50) {
          const oldest = clientCacheRef.current.keys().next().value;
          if (oldest !== undefined) clientCacheRef.current.delete(oldest);
        }
        clientCacheRef.current.set(cacheKey, {
          answer,
          toolTrace: data.toolTrace,
          source: data.source,
        });

        onMessagesChange((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: answer,
            toolTrace: data.toolTrace,
            metaLabel: metaParts.join(' · '),
          },
        ]);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        onMessagesChange((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: 'Request cancelled by user.',
            error: true,
          },
        ]);
      } else {
        onMessagesChange((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Network error contacting the AI Business Analyst service: ${
              err instanceof Error ? err.message : String(err)
            }`,
            error: true,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const toggleTrace = (id: string) => {
    setExpandedTraces((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] min-h-[540px] gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            AI Business Analyst
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Tool-grounded AI Business Analyst querying <span className="font-medium text-slate-800">{datasetName}</span> ({rows.length.toLocaleString()} rows) with cached summaries and deterministic calculations.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => onMessagesChange([])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Conversation
          </button>
        )}
      </div>

      {/* Main Chat Container */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        {/* Scrollable Message Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="max-w-3xl mx-auto py-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-[#0F294A] flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-display font-semibold text-slate-900">
                    Verified Dataset Q&amp;A Agent
                  </h2>
                  <p className="text-xs text-slate-500">
                    Numerical lookups execute instantaneously; strategic insights synthesize pre-computed summaries via Gemini Flash.
                  </p>
                </div>
              </div>

              <p className="text-xs font-medium text-slate-600 mb-2.5">
                Select an executive question or ask your own below:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendQuestion(q)}
                    className="text-left p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-blue-50/50 hover:border-blue-300 text-sm text-slate-800 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-2xl px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div
                    className={`max-w-3xl w-full rounded-xl p-4 border ${
                      msg.error
                        ? 'bg-red-50 border-red-200'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {msg.error ? (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-700">
                        {msg.error ? 'Analyst Error' : 'AI Business Analyst'}
                      </span>
                      {msg.metaLabel && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-xs text-slate-500 font-mono">
                            {msg.metaLabel}
                          </span>
                        </>
                      )}
                      {msg.toolTrace && msg.toolTrace.length > 0 && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-xs text-slate-500 font-mono">
                            {msg.toolTrace.length} verified check{msg.toolTrace.length === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </div>

                    <div className={msg.error ? 'text-sm text-red-800' : ''}>
                      {msg.error ? msg.content : renderFormattedText(msg.content)}
                    </div>

                    {msg.toolTrace && msg.toolTrace.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => toggleTrace(msg.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          {expandedTraces[msg.id] ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          Inspect Verified Analytical Context ({msg.toolTrace.length})
                        </button>

                        {expandedTraces[msg.id] && (
                          <div className="mt-2 space-y-2">
                            {msg.toolTrace.map((t, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono"
                              >
                                <p className="font-semibold text-[#0F294A]">
                                  {t.tool}({JSON.stringify(t.args)})
                                </p>
                                <p className="mt-1 text-slate-600 break-all">{t.summary}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-sm text-slate-700">
                <Loader2 className="w-4 h-4 animate-spin text-blue-700 shrink-0" />
                <span>Analyzing pre-computed metrics ({elapsedSec.toFixed(1)}s)...</span>
                <button
                  type="button"
                  onClick={cancelPendingRequest}
                  className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center gap-2.5 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask a business question about revenue, profit, trends, risks, or segments..."
            className="flex-1 h-10 px-3.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-lg text-sm font-medium bg-[#0F294A] text-white hover:bg-[#173B69] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            Ask Analyst
          </button>
        </form>
      </div>
    </div>
  );
}
