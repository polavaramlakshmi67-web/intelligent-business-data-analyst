import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  GoogleGenAI,
  FunctionDeclaration,
  Type,
  Content,
  Part,
  ThinkingLevel,
} from '@google/genai';
import {
  DataRow,
  ColumnRoleMapping,
  DataQualitySummary,
  BusinessAnalyticsResult,
  CompactAIContext,
  profileDataset,
  computeBusinessAnalytics,
  executeAnalyticsTool,
  computeDatasetHash,
  buildCompactAIContext,
  tryDeterministicAnswer,
} from './shared/analyticsEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const FAST_FLASH_MODEL = 'gemini-3.1-flash-lite';
const REPORT_FLASH_MODEL = 'gemini-4-hydrogen';

interface StoredDataset {
  hash: string;
  name: string;
  columns: string[];
  rows: DataRow[];
  mapping: ColumnRoleMapping;
  quality: DataQualitySummary;
  analytics: BusinessAnalyticsResult;
  compactContext: CompactAIContext;
  compactContextJson: string;
  updatedAt: number;
}

interface CachedAgentResponse {
  answer: string;
  toolTrace: { tool: string; args: Record<string, unknown>; summary: string }[];
  source: 'ai' | 'deterministic';
  createdAt: number;
}

interface CachedReportResponse {
  report: Record<string, unknown>;
  snapshot: CompactAIContext;
  generatedAt: string;
}

const datasetStore = new Map<string, StoredDataset>();
const aiResponseCache = new Map<string, CachedAgentResponse>();
const reportCache = new Map<string, CachedReportResponse>();

const MAX_AI_CACHE_ENTRIES = 100;
const MAX_REPORT_CACHE_ENTRIES = 20;

function setBoundedCache<T>(map: Map<string, T>, key: string, value: T, maxEntries: number) {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

function upsertStoredDataset(
  sessionId: string,
  name: string,
  columns: string[],
  rows: DataRow[],
  mapping: ColumnRoleMapping
): { stored: StoredDataset; cacheHit: boolean } {
  const hash = computeDatasetHash(name, columns, rows, mapping);
  const existing = datasetStore.get(sessionId);

  if (existing && existing.hash === hash) {
    existing.updatedAt = Date.now();
    return { stored: existing, cacheHit: true };
  }

  const quality = profileDataset(rows, columns);
  const analytics = computeBusinessAnalytics(rows, mapping);
  const compactContext = buildCompactAIContext(name, columns, mapping, quality, analytics, rows);
  const compactContextJson = JSON.stringify(compactContext);

  const stored: StoredDataset = {
    hash,
    name: name || 'Active Dataset',
    columns,
    rows,
    mapping,
    quality,
    analytics,
    compactContext,
    compactContextJson,
    updatedAt: Date.now(),
  };

  datasetStore.set(sessionId, stored);

  // Keep memory bounded on 4 GB RAM systems by pruning stale sessions (> 2h)
  const now = Date.now();
  for (const [k, v] of datasetStore.entries()) {
    if (now - v.updatedAt > 2 * 60 * 60 * 1000 && k !== sessionId) {
      datasetStore.delete(k);
    }
  }

  return { stored, cacheHit: false };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error(
        'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
      ),
      { statusCode: 401, code: 'API_KEY_MISSING' }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string; code: string } {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const statusMatch = rawMsg.match(/\b(400|401|403|404|429|500|503)\b/);
  const statusCode =
    (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status ??
    (statusMatch ? Number(statusMatch[1]) : 500);

  if (rawMsg.includes('API_KEY_MISSING')) {
    return {
      status: 401,
      code: 'API_KEY_MISSING',
      message:
        'GEMINI_API_KEY is not set. Please configure GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('API key not valid') ||
    (statusCode === 400 && rawMsg.toLowerCase().includes('api key'))
  ) {
    return {
      status: 400,
      code: 'API_KEY_INVALID',
      message:
        'The configured GEMINI_API_KEY appears invalid. Please verify your key in the Settings > Secrets panel.',
    };
  }
  if (rawMsg.includes('PERMISSION_DENIED') || statusCode === 403) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message:
        'Permission denied by Gemini API. Please check your GEMINI_API_KEY permissions in Settings > Secrets.',
    };
  }
  if (rawMsg.includes('RESOURCE_EXHAUSTED') || statusCode === 429) {
    return {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message:
        'Gemini API rate limit or quota exceeded. Please wait briefly or check your quota in Settings > Secrets.',
    };
  }
  if (rawMsg.includes('REQUEST_TIMEOUT') || statusCode === 408) {
    return {
      status: 408,
      code: 'REQUEST_TIMEOUT',
      message:
        'The AI report request timed out before completing. Please try again—your calculated metrics remain ready.',
    };
  }
  if (rawMsg.includes('NOT_FOUND') || statusCode === 404) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message: `Requested Gemini Flash model was not found or is unavailable for this key.`,
    };
  }
  return {
    status: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    code: 'GEMINI_ERROR',
    message: rawMsg || 'An unexpected error occurred while contacting Gemini AI.',
  };
}

// Focused toolset only for custom filtered slices not already in compactContext
const customFilterTools: FunctionDeclaration[] = [
  {
    name: 'compute_aggregate_metric',
    description:
      'Compute sum, avg, median, min, max, count, or distinct_count on a column for a specific subset filter or date range not shown in the summary.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metric: { type: Type.STRING, description: 'sum, avg, median, min, max, count, or distinct_count.' },
        column: { type: Type.STRING, description: 'Exact column name.' },
        filter_column: { type: Type.STRING },
        filter_operator: { type: Type.STRING, description: 'eq, neq, contains, gt, gte, lt, lte.' },
        filter_value: { type: Type.STRING },
        date_start: { type: Type.STRING },
        date_end: { type: Type.STRING },
      },
      required: ['metric', 'column'],
    },
  },
  {
    name: 'group_by_dimension',
    description:
      'Group rows by a column (or date period) with optional filters, returning exact revenue, profit, margin %, and share %.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        group_by: { type: Type.STRING },
        metric_column: { type: Type.STRING },
        aggregation: { type: Type.STRING },
        sort_order: { type: Type.STRING },
        limit: { type: Type.NUMBER },
        time_granularity: { type: Type.STRING },
        filter_column: { type: Type.STRING },
        filter_operator: { type: Type.STRING },
        filter_value: { type: Type.STRING },
      },
      required: ['group_by', 'metric_column'],
    },
  },
  {
    name: 'inspect_rows',
    description: 'Inspect up to 15 matching rows for outliers, negative profit, or specific records.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filter_column: { type: Type.STRING },
        filter_operator: { type: Type.STRING },
        filter_value: { type: Type.STRING },
        sort_by: { type: Type.STRING },
        sort_order: { type: Type.STRING },
        limit: { type: Type.NUMBER },
      },
    },
  },
];

async function generateWithFastFlash(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string,
  withTools: boolean
) {
  try {
    return await ai.models.generateContent({
      model: FAST_FLASH_MODEL,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 700,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        ...(withTools ? { tools: [{ functionDeclarations: customFilterTools }] } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Graceful fallback to gemini-4-hydrogen (LOW thinking) if flash-lite is unavailable
    if (msg.includes('NOT_FOUND') || msg.includes('404')) {
      return await ai.models.generateContent({
        model: REPORT_FLASH_MODEL,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 700,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          ...(withTools ? { tools: [{ functionDeclarations: customFilterTools }] } : {}),
        },
      });
    }
    throw err;
  }
}

const REPORT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: { type: Type.STRING },
    datasetOverview: { type: Type.STRING },
    importantFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
    trendAnalysis: { type: Type.STRING },
    potentialRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
    growthOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          rationale: { type: Type.STRING },
          expectedImpact: { type: Type.STRING },
          priority: { type: Type.STRING },
        },
        required: ['action', 'rationale', 'expectedImpact', 'priority'],
      },
    },
    managementActions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'executiveSummary',
    'datasetOverview',
    'importantFindings',
    'trendAnalysis',
    'potentialRisks',
    'growthOpportunities',
    'recommendations',
    'managementActions',
  ],
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('REQUEST_TIMEOUT: Gemini request exceeded timeout.'), { statusCode: 408 }));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function generateReportWithFastFlash(
  ai: GoogleGenAI,
  contents: string,
  systemInstruction: string,
  detailLevel: 'concise' | 'standard'
) {
  const maxTokensPrimary = detailLevel === 'concise' ? 850 : 1200;
  const maxTokensFallback = detailLevel === 'concise' ? 950 : 1350;

  const invokeModel = async (model: string) => {
    const isLite = model === FAST_FLASH_MODEL;
    return withTimeout(
      ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: isLite ? maxTokensPrimary : maxTokensFallback,
          thinkingConfig: {
            thinkingLevel: isLite ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: REPORT_RESPONSE_SCHEMA,
        },
      }),
      25000
    );
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await invokeModel(FAST_FLASH_MODEL);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NOT_FOUND') || msg.includes('404')) {
        return await invokeModel(REPORT_FLASH_MODEL);
      }
      const isTransient = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503');
      if (isTransient && attempt === 0) {
        await new Promise((r) => setTimeout(r, 650));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      ok: true,
      aiConfigured: hasKey,
      fastModel: FAST_FLASH_MODEL,
      reportModel: REPORT_FLASH_MODEL,
    });
  });

  app.post('/api/dataset/sync', (req: Request, res: Response) => {
    const { sessionId, name, columns, rows, mapping } = req.body as {
      sessionId?: string;
      name?: string;
      columns?: string[];
      rows?: DataRow[];
      mapping?: ColumnRoleMapping;
    };

    if (!sessionId || !Array.isArray(columns) || !Array.isArray(rows) || !mapping) {
      res.status(400).json({ error: 'Invalid dataset payload.' });
      return;
    }

    const { stored, cacheHit } = upsertStoredDataset(
      sessionId,
      name || 'Active Dataset',
      columns,
      rows,
      mapping
    );

    res.json({
      ok: true,
      hash: stored.hash,
      cacheHit,
      rowCount: rows.length,
      columnCount: columns.length,
    });
  });

  app.post('/api/ai/agent', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const { sessionId, question, history, datasetFallback } = req.body as {
        sessionId: string;
        question: string;
        history?: { role: 'user' | 'assistant'; content: string }[];
        datasetFallback?: {
          name: string;
          columns: string[];
          rows: DataRow[];
          mapping: ColumnRoleMapping;
        };
      };

      if (!question || !question.trim()) {
        res.status(400).json({ error: 'Question cannot be empty.' });
        return;
      }

      let active = datasetStore.get(sessionId);
      if (!active && datasetFallback) {
        active = upsertStoredDataset(
          sessionId,
          datasetFallback.name || 'Active Dataset',
          datasetFallback.columns,
          datasetFallback.rows,
          datasetFallback.mapping
        ).stored;
      }

      if (!active) {
        res.status(404).json({
          error: 'No active dataset found in session. Please reload or upload a dataset.',
          code: 'DATASET_NOT_SYNCED',
        });
        return;
      }

      const normalizedQuestion = question.trim().toLowerCase().replace(/\s+/g, ' ');
      const lastHistoryTurn =
        Array.isArray(history) && history.length > 0
          ? history[history.length - 1].content.slice(0, 80)
          : '';
      const cacheKey = `${active.hash}::${normalizedQuestion}::${lastHistoryTurn}`;

      // 1. Check Response Cache
      const cached = aiResponseCache.get(cacheKey);
      if (cached) {
        res.json({
          answer: cached.answer,
          toolTrace: cached.toolTrace,
          cached: true,
          source: cached.source,
          elapsedMs: Date.now() - startMs,
        });
        return;
      }

      // 2. Instant Deterministic Fast-Path for pure numerical/lookup questions (0 Gemini calls)
      const deterministic = tryDeterministicAnswer(
        question,
        active.name,
        active.mapping,
        active.quality,
        active.analytics
      );
      if (deterministic) {
        setBoundedCache(
          aiResponseCache,
          cacheKey,
          {
            answer: deterministic.answer,
            toolTrace: deterministic.toolTrace,
            source: 'deterministic',
            createdAt: Date.now(),
          },
          MAX_AI_CACHE_ENTRIES
        );
        res.json({
          answer: deterministic.answer,
          toolTrace: deterministic.toolTrace,
          cached: false,
          source: 'deterministic',
          elapsedMs: Date.now() - startMs,
        });
        return;
      }

      // 3. Single-Pass Grounded Gemini Flash Synthesis using compact pre-computed context
      const ai = getGeminiClient();

      const systemInstruction = `You are a concise, accurate AI Business Analyst.
Answer ONLY using the pre-computed dataset summary below (never invent figures or columns).
If a required column is missing, state which column is missing.
For interpretive/strategic questions, keep sections brief and clear:
- **Observed Data** (exact numbers from summary)
- **Possible Explanations** (concise hypotheses)
- **Recommended Actions** (prioritized next steps)
For straightforward lookups, give the exact answer concisely without writing a full report.
Call a tool ONLY if the user asks for a specific filter/slice NOT present in the summary below.

DATASET SUMMARY:
${active.compactContextJson}`;

      const contents: Content[] = [];
      if (Array.isArray(history)) {
        // Keep only the last 4 turns to minimize input tokens
        for (const msg of history.slice(-4)) {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content.slice(0, 600) }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: question.trim() }],
      });

      const toolTrace: {
        tool: string;
        args: Record<string, unknown>;
        summary: string;
      }[] = [
        {
          tool: 'cached_dataset_summary',
          args: { datasetHash: active.hash, rows: active.rows.length },
          summary: `Pre-computed KPIs, monthly series, quality issues, and top/bottom breakdowns (${active.compactContextJson.length} bytes)`,
        },
      ];

      // Allow at most 2 iterations (1 optional custom filter tool call + final answer)
      const MAX_ITERATIONS = 2;
      let finalAnswer = '';

      for (let step = 0; step < MAX_ITERATIONS; step++) {
        const allowTools = step === 0;
        const response = await generateWithFastFlash(ai, contents, systemInstruction, allowTools);

        const modelContent = response.candidates?.[0]?.content;
        const functionCalls = response.functionCalls;

        if (allowTools && functionCalls && functionCalls.length > 0 && modelContent) {
          contents.push(modelContent);
          const responseParts: Part[] = [];

          for (const fc of functionCalls) {
            const toolName = fc.name ?? '';
            const toolArgs = (fc.args ?? {}) as Record<string, unknown>;
            const result = executeAnalyticsTool(
              active.rows,
              active.columns,
              active.mapping,
              toolName,
              toolArgs
            );

            toolTrace.push({
              tool: toolName,
              args: toolArgs,
              summary: JSON.stringify(result).slice(0, 260),
            });

            responseParts.push({
              functionResponse: {
                id: fc.id,
                name: toolName,
                response: { result },
              },
            });
          }

          contents.push({
            role: 'user',
            parts: responseParts,
          });
        } else {
          finalAnswer = (response.text ?? '').trim();
          break;
        }
      }

      if (!finalAnswer) {
        finalAnswer =
          'Unable to synthesize a narrative summary for this query. Please try rephrasing your question.';
      }

      setBoundedCache(
        aiResponseCache,
        cacheKey,
        {
          answer: finalAnswer,
          toolTrace,
          source: 'ai',
          createdAt: Date.now(),
        },
        MAX_AI_CACHE_ENTRIES
      );

      res.json({
        answer: finalAnswer,
        toolTrace,
        cached: false,
        source: 'ai',
        elapsedMs: Date.now() - startMs,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
      });
    }
  });

  app.post('/api/ai/report', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const {
        sessionId,
        cacheKey: clientCacheKey,
        forceRefresh,
        detailLevel: rawDetailLevel,
        compactSummary,
        datasetFallback,
      } = req.body as {
        sessionId: string;
        cacheKey?: string;
        forceRefresh?: boolean;
        detailLevel?: 'concise' | 'standard';
        compactSummary?: CompactAIContext;
        datasetFallback?: {
          name: string;
          columns: string[];
          rows: DataRow[];
          mapping: ColumnRoleMapping;
        };
      };

      const detailLevel: 'concise' | 'standard' =
        rawDetailLevel === 'concise' ? 'concise' : 'standard';

      let summaryContext: CompactAIContext | null = null;
      let resolvedCacheKey = clientCacheKey;

      if (compactSummary && typeof compactSummary === 'object' && compactSummary.kpis) {
        // Strip sampleRows so ZERO raw rows ever reach Gemini for executive reports
        summaryContext = { ...compactSummary, sampleRows: [] };
        if (!resolvedCacheKey) {
          resolvedCacheKey = `${compactSummary.datasetName}::${compactSummary.rowCount}::${detailLevel}`;
        }
      } else {
        let active = datasetStore.get(sessionId);
        if (!active && datasetFallback) {
          active = upsertStoredDataset(
            sessionId,
            datasetFallback.name || 'Active Dataset',
            datasetFallback.columns,
            datasetFallback.rows,
            datasetFallback.mapping
          ).stored;
        }
        if (!active) {
          res.status(404).json({
            error: 'No active dataset found in session. Please upload or load a dataset first.',
            code: 'DATASET_NOT_SYNCED',
          });
          return;
        }
        summaryContext = { ...active.compactContext, sampleRows: [] };
        if (!resolvedCacheKey) {
          resolvedCacheKey = `${active.hash}::${detailLevel}`;
        }
      }

      if (!forceRefresh && resolvedCacheKey) {
        const cachedReport = reportCache.get(resolvedCacheKey);
        if (cachedReport) {
          res.json({
            report: cachedReport.report,
            snapshot: cachedReport.snapshot,
            generatedAt: cachedReport.generatedAt,
            cached: true,
            elapsedMs: Date.now() - startMs,
          });
          return;
        }
      }

      const ai = getGeminiClient();
      const summaryJson = JSON.stringify(summaryContext);

      const lengthDirective =
        detailLevel === 'concise'
          ? 'Keep each paragraph to 2 crisp sentences, lists to 3 short bullets, and recommendations to 3 items.'
          : 'Keep paragraphs to 2-3 crisp executive sentences, lists to 3-5 focused bullets, and recommendations to 3-4 prioritized items.';

      const systemInstruction = `Principal BI Consultant. Ground every insight strictly in the pre-calculated JSON summary. Never invent numbers, percentages, or missing KPIs. ${lengthDirective}`;

      const promptContents = `Generate the AI narrative sections for an Executive Business Report from this verified summary (all totals and KPIs are already calculated):
${summaryJson}

Return JSON only:
- executiveSummary: high-level performance synthesis citing exact KPI values
- datasetOverview: data coverage, date range, and data quality summary
- importantFindings: key category, regional, and product observations
- trendAnalysis: revenue/profit trajectory and declining-month commentary
- potentialRisks: risks evidenced by margin pressure, concentration, declines, or quality gaps
- growthOpportunities: expansion or margin opportunities grounded in top/bottom segments
- recommendations: prioritized actions (priority High/Medium/Low, action, rationale, expectedImpact)
- managementActions: immediate 30-90 day operational steps`;

      const response = await generateReportWithFastFlash(
        ai,
        promptContents,
        systemInstruction,
        detailLevel
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      const generatedAt = new Date().toISOString();

      if (resolvedCacheKey) {
        setBoundedCache(
          reportCache,
          resolvedCacheKey,
          {
            report: parsed,
            snapshot: summaryContext,
            generatedAt,
          },
          MAX_REPORT_CACHE_ENTRIES
        );
      }

      res.json({
        report: parsed,
        snapshot: summaryContext,
        generatedAt,
        cached: false,
        elapsedMs: Date.now() - startMs,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Intelligent Business Data Analysis & Decision Support System server running on http://localhost:${PORT}`
    );
  });
}

startServer();
