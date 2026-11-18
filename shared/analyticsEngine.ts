export type CellValue = string | number | boolean | null;
export type DataRow = Record<string, CellValue>;

export type ColumnType = 'numeric' | 'categorical' | 'date';

export interface QualityIssue {
  id: string;
  severity: 'high' | 'medium' | 'low';
  category: 'missing' | 'duplicates' | 'inconsistency' | 'type' | 'anomaly';
  column?: string;
  description: string;
  affectedCount: number;
}

export interface ColumnProfile {
  name: string;
  detectedType: ColumnType;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  inconsistentGroups: number;
  inconsistentExamples: string[];
  nonNumericInNumericCol: number;
  negativeCount: number;
  sampleValues: string[];
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  sum: number | null;
}

export interface DataQualitySummary {
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  duplicateRowIndices: number[];
  totalMissingCells: number;
  missingCellPct: number;
  inconsistentCellCount: number;
  columns: ColumnProfile[];
  issues: QualityIssue[];
}

export interface CleaningOptions {
  removeDuplicates: boolean;
  trimWhitespace: boolean;
  standardizeCasing: 'none' | 'title' | 'lower' | 'upper';
  missingStrategy: 'none' | 'drop_rows' | 'fill_mean_mode' | 'fill_median_mode' | 'fill_zero_unknown';
  coerceTypes: boolean;
}

export interface CleaningPreviewStats {
  originalRows: number;
  resultingRows: number;
  duplicatesRemoved: number;
  missingCellsFilled: number;
  rowsDroppedForMissing: number;
  valuesStandardized: number;
  typesCoerced: number;
}

export interface ColumnRoleMapping {
  dateCol: string | null;
  revenueCol: string | null;
  profitCol: string | null;
  costCol: string | null;
  orderIdCol: string | null;
  quantityCol: string | null;
  categoryCol: string | null;
  regionCol: string | null;
  productCol: string | null;
}

export interface MetricResult {
  available: boolean;
  value: number | null;
  note?: string;
  reasonIfUnavailable?: string;
}

export interface MonthlyPoint {
  period: string;
  revenue: number | null;
  profit: number | null;
  orders: number;
  quantity: number | null;
  momRevenueGrowthPct: number | null;
  momRevenueDelta: number | null;
  momProfitDelta: number | null;
}

export interface DimensionBreakdown {
  name: string;
  revenue: number | null;
  profit: number | null;
  profitMarginPct: number | null;
  orders: number;
  quantity: number | null;
  revenueSharePct: number | null;
}

export interface BusinessAnalyticsResult {
  rowCount: number;
  dateBounds: { minDate: string | null; maxDate: string | null };
  kpis: {
    totalRevenue: MetricResult;
    totalProfit: MetricResult;
    profitMargin: MetricResult;
    totalOrders: MetricResult;
    averageOrderValue: MetricResult;
    totalQuantitySold: MetricResult;
    salesGrowth: MetricResult;
  };
  monthlySeries: MonthlyPoint[];
  decliningMonths: {
    period: string;
    revenue: number;
    previousPeriod: string;
    previousRevenue: number;
    delta: number;
    deltaPct: number;
  }[];
  categoryBreakdown: DimensionBreakdown[];
  regionBreakdown: DimensionBreakdown[];
  productBreakdown: DimensionBreakdown[];
}

export function isEmptyCell(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'number') return Number.isNaN(val);
  if (typeof val === 'string') {
    const t = val.trim().toLowerCase();
    return t === '' || t === 'null' || t === 'na' || t === 'n/a' || t === 'nan' || t === 'none' || t === '-';
  }
  return false;
}

export function parseNumericValue(val: unknown): number | null {
  if (isEmptyCell(val)) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return null;
  const str = String(val).trim();
  // Strip currency symbols, commas, spaces, trailing %
  const cleaned = str.replace(/[$€£¥,\s]/g, '').replace(/%$/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cleaned)) {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseDateString(val: unknown): string | null {
  if (isEmptyCell(val) || typeof val === 'number' || typeof val === 'boolean') return null;
  const str = String(val).trim();
  if (str.length < 6 || str.length > 32) return null;
  // Reject pure numbers
  if (/^\d+(\.\d+)?$/.test(str)) return null;

  // Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Match MM/DD/YYYY or DD/MM/YYYY or MM/DD/YY (with optional time suffix)
  const usMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (usMatch) {
    const a = Number(usMatch[1]);
    const b = Number(usMatch[2]);
    let y = Number(usMatch[3]);
    if (usMatch[3].length === 2) {
      y = y >= 70 ? 1900 + y : 2000 + y;
    }
    if (y >= 1900 && y <= 2100) {
      let m = a;
      let d = b;
      if (a > 12 && b <= 12) {
        d = a;
        m = b;
      }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // Match YYYY-MM
  const ymMatch = str.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch) {
    const y = Number(ymMatch[1]);
    const m = Number(ymMatch[2]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}-01`;
    }
  }

  // Fallback Date.parse for textual dates like "Jan 15, 2025" or "15-Jan-2026"
  if (/[a-zA-Z]{3}/.test(str)) {
    const parsed = Date.parse(str);
    if (!Number.isNaN(parsed)) {
      const dt = new Date(parsed);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (y >= 1900 && y <= 2100) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function toTitleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeCategoricalKey(val: unknown): string {
  if (isEmptyCell(val)) return '';
  return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function pickPreferredDisplayLabel(variants: Iterable<string>, fallback = 'Uncategorized'): string {
  let mixedCaseCandidate: string | null = null;
  let anyCandidate: string | null = null;
  for (const raw of variants) {
    const cleaned = raw.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    if (!anyCandidate) anyCandidate = cleaned;
    const isAllLower = cleaned === cleaned.toLowerCase();
    const isAllUpper = cleaned === cleaned.toUpperCase();
    if (!isAllLower && !isAllUpper) {
      mixedCaseCandidate = cleaned;
      break;
    }
  }
  if (mixedCaseCandidate) return mixedCaseCandidate;
  if (anyCandidate) return toTitleCase(anyCandidate);
  return fallback;
}

export function buildCanonicalLabelMap(rows: DataRow[], col: string | null, fallback = 'Uncategorized'): Map<string, string> {
  const variantsByKey = new Map<string, Set<string>>();
  if (!col) return new Map();
  for (const row of rows) {
    const val = row[col];
    if (isEmptyCell(val)) continue;
    const cleaned = String(val).trim().replace(/\s+/g, ' ');
    const key = cleaned.toLowerCase();
    if (!variantsByKey.has(key)) variantsByKey.set(key, new Set());
    variantsByKey.get(key)!.add(cleaned);
  }
  const resolved = new Map<string, string>();
  for (const [key, variants] of variantsByKey.entries()) {
    resolved.set(key, pickPreferredDisplayLabel(variants, fallback));
  }
  return resolved;
}

export function detectColumnTypes(rows: DataRow[], columns: string[]): Record<string, ColumnType> {
  const result: Record<string, ColumnType> = {};
  const sampleLimit = Math.min(rows.length, 500);

  for (const col of columns) {
    let nonEmpty = 0;
    let numericHits = 0;
    let dateHits = 0;

    for (let i = 0; i < sampleLimit; i++) {
      const val = rows[i]?.[col];
      if (isEmptyCell(val)) continue;
      nonEmpty++;
      if (parseNumericValue(val) !== null) numericHits++;
      else if (parseDateString(val) !== null) dateHits++;
    }

    if (nonEmpty === 0) {
      result[col] = 'categorical';
      continue;
    }

    const colLower = col.trim().toLowerCase().replace(/[\s\-]+/g, '_');
    const looksLikeId = /(^|_)id$|order_id|invoice|sku|zip|postal|code/.test(colLower);

    if (dateHits / nonEmpty >= 0.6) {
      result[col] = 'date';
    } else if (!looksLikeId && numericHits / nonEmpty >= 0.65) {
      result[col] = 'numeric';
    } else if (looksLikeId && numericHits / nonEmpty >= 0.65) {
      result[col] = /amount|price|revenue|sales|profit|cost|qty|quantity|total/.test(colLower)
        ? 'numeric'
        : 'categorical';
    } else {
      result[col] = 'categorical';
    }
  }
  return result;
}

export function profileDataset(rows: DataRow[], columns: string[]): DataQualitySummary {
  const rowCount = rows.length;
  const columnCount = columns.length;
  const colTypes = detectColumnTypes(rows, columns);

  // Duplicate detection
  const seen = new Set<string>();
  const duplicateRowIndices: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i];
    const signature = columns.map((c) => {
      const v = row?.[c];
      return isEmptyCell(v) ? '__NULL__' : String(v).trim();
    }).join('\u0001');
    if (seen.has(signature)) {
      duplicateRowIndices.push(i);
    } else {
      seen.add(signature);
    }
  }

  let totalMissingCells = 0;
  let inconsistentCellCount = 0;
  const issues: QualityIssue[] = [];
  const columnProfiles: ColumnProfile[] = [];

  if (duplicateRowIndices.length > 0) {
    issues.push({
      id: 'dup-rows',
      severity: duplicateRowIndices.length > 5 ? 'high' : 'medium',
      category: 'duplicates',
      description: `${duplicateRowIndices.length} exact duplicate record${duplicateRowIndices.length === 1 ? '' : 's'} detected across all columns.`,
      affectedCount: duplicateRowIndices.length,
    });
  }

  for (const col of columns) {
    const detectedType = colTypes[col];
    let missingCount = 0;
    let nonNumericInNumericCol = 0;
    let negativeCount = 0;
    const uniqueSet = new Set<string>();
    const samples: string[] = [];
    const numericVals: number[] = [];
    // Track normalized form -> distinct raw variants (for inconsistency detection)
    const variantMap = new Map<string, Set<string>>();

    for (let i = 0; i < rowCount; i++) {
      const val = rows[i]?.[col];
      if (isEmptyCell(val)) {
        missingCount++;
        continue;
      }
      const rawStr = String(val);
      const trimmedLower = rawStr.trim().replace(/\s+/g, ' ').toLowerCase();
      uniqueSet.add(rawStr);
      if (samples.length < 4 && !samples.includes(rawStr)) {
        samples.push(rawStr);
      }

      if (detectedType === 'categorical') {
        if (!variantMap.has(trimmedLower)) {
          variantMap.set(trimmedLower, new Set());
        }
        variantMap.get(trimmedLower)!.add(rawStr);
      } else if (detectedType === 'numeric') {
        const num = parseNumericValue(val);
        if (num === null) {
          nonNumericInNumericCol++;
        } else {
          numericVals.push(num);
          if (num < 0) negativeCount++;
        }
      } else if (detectedType === 'date') {
        const dt = parseDateString(val);
        if (dt === null) {
          nonNumericInNumericCol++;
        }
      }
    }

    totalMissingCells += missingCount;

    const inconsistentExamples: string[] = [];
    let inconsistentGroups = 0;
    if (detectedType === 'categorical') {
      for (const [, variants] of variantMap.entries()) {
        if (variants.size > 1) {
          inconsistentGroups++;
          inconsistentCellCount += variants.size;
          if (inconsistentExamples.length < 3) {
            inconsistentExamples.push(Array.from(variants).slice(0, 3).map((v) => `"${v}"`).join(' vs '));
          }
        } else {
          const single = Array.from(variants)[0];
          if (single !== single.trim()) {
            inconsistentGroups++;
            inconsistentCellCount++;
            if (inconsistentExamples.length < 3) {
              inconsistentExamples.push(`Leading/trailing whitespace in "${single}"`);
            }
          }
        }
      }
    }

    numericVals.sort((a, b) => a - b);
    const sum = numericVals.length > 0 ? numericVals.reduce((a, b) => a + b, 0) : null;
    const mean = sum !== null ? sum / numericVals.length : null;
    const min = numericVals.length > 0 ? numericVals[0] : null;
    const max = numericVals.length > 0 ? numericVals[numericVals.length - 1] : null;
    const median =
      numericVals.length > 0
        ? numericVals.length % 2 === 1
          ? numericVals[(numericVals.length - 1) / 2]
          : (numericVals[numericVals.length / 2 - 1] + numericVals[numericVals.length / 2]) / 2
        : null;

    const missingPct = rowCount > 0 ? (missingCount / rowCount) * 100 : 0;

    if (missingCount > 0) {
      issues.push({
        id: `missing-${col}`,
        severity: missingPct > 15 ? 'high' : missingPct > 3 ? 'medium' : 'low',
        category: 'missing',
        column: col,
        description: `Column "${col}" has ${missingCount} missing value${missingCount === 1 ? '' : 's'} (${missingPct.toFixed(1)}%).`,
        affectedCount: missingCount,
      });
    }

    if (inconsistentGroups > 0) {
      issues.push({
        id: `inconsistent-${col}`,
        severity: 'medium',
        category: 'inconsistency',
        column: col,
        description: `Column "${col}" contains ${inconsistentGroups} casing or whitespace inconsistenc${inconsistentGroups === 1 ? 'y' : 'ies'} (${inconsistentExamples.join('; ')}).`,
        affectedCount: inconsistentGroups,
      });
    }

    if (nonNumericInNumericCol > 0) {
      issues.push({
        id: `type-${col}`,
        severity: 'high',
        category: 'type',
        column: col,
        description: `Column "${col}" (${detectedType}) has ${nonNumericInNumericCol} unparseable value${nonNumericInNumericCol === 1 ? '' : 's'}.`,
        affectedCount: nonNumericInNumericCol,
      });
    }

    const colLower = col.toLowerCase();
    if (negativeCount > 0 && /revenue|sales|price|qty|quantity|units/.test(colLower)) {
      issues.push({
        id: `neg-${col}`,
        severity: 'medium',
        category: 'anomaly',
        column: col,
        description: `Column "${col}" contains ${negativeCount} negative value${negativeCount === 1 ? '' : 's'} (potential returns or data entry errors).`,
        affectedCount: negativeCount,
      });
    }

    columnProfiles.push({
      name: col,
      detectedType,
      missingCount,
      missingPct,
      uniqueCount: uniqueSet.size,
      inconsistentGroups,
      inconsistentExamples,
      nonNumericInNumericCol,
      negativeCount,
      sampleValues: samples,
      min,
      max,
      mean,
      median,
      sum,
    });
  }

  const totalCells = rowCount * columnCount;
  const missingCellPct = totalCells > 0 ? (totalMissingCells / totalCells) * 100 : 0;

  return {
    rowCount,
    columnCount,
    duplicateRowCount: duplicateRowIndices.length,
    duplicateRowIndices,
    totalMissingCells,
    missingCellPct,
    inconsistentCellCount,
    columns: columnProfiles,
    issues,
  };
}

export function cleanDataset(
  originalRows: DataRow[],
  columns: string[],
  options: CleaningOptions
): { cleanedRows: DataRow[]; stats: CleaningPreviewStats } {
  const profile = profileDataset(originalRows, columns);
  const colTypeMap = new Map<string, ColumnProfile>(profile.columns.map((c) => [c.name, c]));

  // Compute mode for categorical columns for fill_mean_mode / fill_median_mode
  const modeMap = new Map<string, string>();
  for (const col of columns) {
    const counts = new Map<string, number>();
    for (const row of originalRows) {
      const val = row[col];
      if (isEmptyCell(val)) continue;
      let normalized = String(val);
      if (options.trimWhitespace) normalized = normalized.trim().replace(/\s+/g, ' ');
      if (options.standardizeCasing === 'title') normalized = toTitleCase(normalized);
      else if (options.standardizeCasing === 'lower') normalized = normalized.toLowerCase();
      else if (options.standardizeCasing === 'upper') normalized = normalized.toUpperCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    let bestVal = 'Unknown';
    let bestCount = -1;
    for (const [k, v] of counts.entries()) {
      if (v > bestCount) {
        bestCount = v;
        bestVal = k;
      }
    }
    modeMap.set(col, bestVal);
  }

  let valuesStandardized = 0;
  let typesCoerced = 0;
  let missingCellsFilled = 0;
  let rowsDroppedForMissing = 0;
  let duplicatesRemoved = 0;

  let workingRows: DataRow[] = [];

  for (const rawRow of originalRows) {
    const newRow: DataRow = {};
    let rowHasMissing = false;

    for (const col of columns) {
      let val = rawRow[col];
      const colInfo = colTypeMap.get(col)!;

      if (isEmptyCell(val)) {
        rowHasMissing = true;
        newRow[col] = null;
        continue;
      }

      if (typeof val === 'string') {
        let updated = val;
        if (options.trimWhitespace) {
          const trimmed = updated.trim().replace(/\s+/g, ' ');
          if (trimmed !== updated) valuesStandardized++;
          updated = trimmed;
        }

        if (colInfo.detectedType === 'categorical' && options.standardizeCasing !== 'none') {
          let cased = updated;
          if (options.standardizeCasing === 'title') cased = toTitleCase(updated);
          else if (options.standardizeCasing === 'lower') cased = updated.toLowerCase();
          else if (options.standardizeCasing === 'upper') cased = updated.toUpperCase();
          if (cased !== updated) valuesStandardized++;
          updated = cased;
        }

        if (options.coerceTypes) {
          if (colInfo.detectedType === 'numeric') {
            const parsed = parseNumericValue(updated);
            if (parsed !== null) {
              typesCoerced++;
              newRow[col] = parsed;
              continue;
            }
          } else if (colInfo.detectedType === 'date') {
            const parsedDate = parseDateString(updated);
            if (parsedDate !== null) {
              if (parsedDate !== updated) typesCoerced++;
              newRow[col] = parsedDate;
              continue;
            }
          }
        }
        newRow[col] = updated;
      } else {
        newRow[col] = val;
      }
    }

    if (options.missingStrategy === 'drop_rows' && rowHasMissing) {
      rowsDroppedForMissing++;
      continue;
    }

    if (options.missingStrategy !== 'none' && options.missingStrategy !== 'drop_rows') {
      for (const col of columns) {
        if (newRow[col] === null) {
          const colInfo = colTypeMap.get(col)!;
          if (colInfo.detectedType === 'numeric') {
            if (options.missingStrategy === 'fill_mean_mode') {
              newRow[col] = colInfo.mean !== null ? Number(colInfo.mean.toFixed(2)) : 0;
            } else if (options.missingStrategy === 'fill_median_mode') {
              newRow[col] = colInfo.median !== null ? Number(colInfo.median.toFixed(2)) : 0;
            } else {
              newRow[col] = 0;
            }
            missingCellsFilled++;
          } else if (colInfo.detectedType === 'categorical') {
            newRow[col] =
              options.missingStrategy === 'fill_zero_unknown'
                ? 'Unknown'
                : modeMap.get(col) ?? 'Unknown';
            missingCellsFilled++;
          }
        }
      }
    }

    workingRows.push(newRow);
  }

  if (options.removeDuplicates) {
    const seen = new Set<string>();
    const deduped: DataRow[] = [];
    for (const row of workingRows) {
      const sig = columns.map((c) => (row[c] === null ? '__NULL__' : String(row[c]).trim())).join('\u0001');
      if (seen.has(sig)) {
        duplicatesRemoved++;
      } else {
        seen.add(sig);
        deduped.push(row);
      }
    }
    workingRows = deduped;
  }

  return {
    cleanedRows: workingRows,
    stats: {
      originalRows: originalRows.length,
      resultingRows: workingRows.length,
      duplicatesRemoved,
      missingCellsFilled,
      rowsDroppedForMissing,
      valuesStandardized,
      typesCoerced,
    },
  };
}

export function inferColumnRoles(rows: DataRow[], columns: string[]): ColumnRoleMapping {
  const types = detectColumnTypes(rows, columns);

  const normalizeHeader = (col: string): string =>
    col.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s\-]+/g, '_');

  const hasValidValues = (col: string, expectedType: ColumnType): boolean => {
    if (types[col] === expectedType) return true;
    const sampleLimit = Math.min(rows.length, 100);
    for (let i = 0; i < sampleLimit; i++) {
      const v = rows[i]?.[col];
      if (isEmptyCell(v)) continue;
      if (expectedType === 'numeric' && parseNumericValue(v) !== null) return true;
      if (expectedType === 'date' && parseDateString(v) !== null) return true;
      if (expectedType === 'categorical') return true;
    }
    return false;
  };

  const findMatch = (
    allowedTypes: ColumnType[],
    patterns: RegExp[],
    excludePatterns: RegExp[] = []
  ): string | null => {
    // Pass 1: strict match with detected type
    for (const pat of patterns) {
      for (const col of columns) {
        if (!allowedTypes.includes(types[col])) continue;
        const norm = normalizeHeader(col);
        if (excludePatterns.some((ex) => ex.test(norm))) continue;
        if (pat.test(norm)) return col;
      }
    }
    // Pass 2: header name match validated against actual parseable values
    for (const pat of patterns) {
      for (const col of columns) {
        const norm = normalizeHeader(col);
        if (excludePatterns.some((ex) => ex.test(norm))) continue;
        if (pat.test(norm) && allowedTypes.some((t) => hasValidValues(col, t))) {
          return col;
        }
      }
    }
    return null;
  };

  const dateCol =
    findMatch(['date'], [/^order_date$/, /^transaction_date$/, /^date$/, /^sale_date$/, /order_date/, /transaction_date/, /sale_date/, /_date$/, /^date_/, /date/]) ??
    columns.find((c) => types[c] === 'date') ??
    null;

  const revenueCol = findMatch(
    ['numeric'],
    [/^revenue$/, /^total_revenue$/, /^sales$/, /^total_sales$/, /^net_sales$/, /revenue/, /sales/, /amount/, /mrr/, /arr/, /turnover/, /income/],
    [/cost/, /profit/, /margin/, /qty/, /quantity/, /discount/, /tax/, /date/]
  );

  const profitCol = findMatch(
    ['numeric'],
    [/^profit$/, /^net_profit$/, /^gross_profit$/, /profit/, /margin_amount/, /net_income/],
    [/margin_pct/, /margin_percent/, /margin_rate/]
  );

  const costCol = findMatch(
    ['numeric'],
    [/^cost$/, /^total_cost$/, /^cogs$/, /^expense$/, /cost/, /expense/],
    [/customer/]
  );

  const orderIdCol = findMatch(
    ['categorical', 'numeric'],
    [/^order_id$/, /^transaction_id$/, /^invoice_id$/, /order_id/, /order_no/, /order_num/, /invoice/, /transaction/],
    [/date/]
  );

  const quantityCol = findMatch(
    ['numeric'],
    [/^quantity$/, /^qty$/, /^units$/, /^units_sold$/, /quantity/, /qty/, /units/, /seats/]
  );

  const categoryCol = findMatch(
    ['categorical'],
    [/^category$/, /^product_category$/, /^item_category$/, /category/, /department/, /vertical/, /^segment$/, /^plan$/]
  );

  const regionCol = findMatch(
    ['categorical'],
    [/^region$/, /^market$/, /^territory$/, /^country$/, /^state$/, /region/, /country/, /territory/, /zone/, /city/]
  );

  const productCol = findMatch(
    ['categorical'],
    [/^product$/, /^product_name$/, /^item$/, /^item_name$/, /^sku_name$/, /product/, /item/, /service/, /sku/],
    [/category/, /_id$/]
  );

  return {
    dateCol,
    revenueCol,
    profitCol,
    costCol,
    orderIdCol,
    quantityCol,
    categoryCol,
    regionCol,
    productCol,
  };
}

export interface MappingValidationIssue {
  role: keyof ColumnRoleMapping;
  column: string;
  message: string;
}

export function validateColumnMapping(
  rows: DataRow[],
  columns: string[],
  mapping: ColumnRoleMapping
): MappingValidationIssue[] {
  const issues: MappingValidationIssue[] = [];
  if (rows.length === 0) return issues;

  const colSet = new Set(columns);
  const sampleLimit = Math.min(rows.length, 250);

  const countParseable = (col: string, kind: 'numeric' | 'date'): { nonEmpty: number; valid: number } => {
    let nonEmpty = 0;
    let valid = 0;
    for (let i = 0; i < sampleLimit; i++) {
      const v = rows[i]?.[col];
      if (isEmptyCell(v)) continue;
      nonEmpty++;
      if (kind === 'numeric' && parseNumericValue(v) !== null) valid++;
      if (kind === 'date' && parseDateString(v) !== null) valid++;
    }
    return { nonEmpty, valid };
  };

  const checkRole = (role: keyof ColumnRoleMapping, kind: 'numeric' | 'date', label: string) => {
    const col = mapping[role];
    if (!col) return;
    if (!colSet.has(col)) {
      issues.push({ role, column: col, message: `Mapped column "${col}" is not in the active dataset.` });
      return;
    }
    const { nonEmpty, valid } = countParseable(col, kind);
    if (nonEmpty > 0 && valid === 0) {
      issues.push({
        role,
        column: col,
        message: `"${col}" has no valid ${label} values for this role.`,
      });
    } else if (nonEmpty > 0 && valid / nonEmpty < 0.5) {
      issues.push({
        role,
        column: col,
        message: `Only ${Math.round((valid / nonEmpty) * 100)}% of values in "${col}" are valid ${label} values.`,
      });
    }
  };

  checkRole('dateCol', 'date', 'date');
  checkRole('revenueCol', 'numeric', 'numeric');
  checkRole('profitCol', 'numeric', 'numeric');
  checkRole('costCol', 'numeric', 'numeric');
  checkRole('quantityCol', 'numeric', 'numeric');

  return issues;
}

export function computeBusinessAnalytics(
  rows: DataRow[],
  mapping: ColumnRoleMapping
): BusinessAnalyticsResult {
  const rowCount = rows.length;

  let totalRev = 0;
  let revCount = 0;
  let totalProf = 0;
  let profCount = 0;
  let derivedProfitUsed = false;
  let totalQty = 0;
  let qtyCount = 0;
  const orderIds = new Set<string>();

  let minDate: string | null = null;
  let maxDate: string | null = null;

  interface Bucket {
    revenue: number;
    hasRevenue: boolean;
    profit: number;
    hasProfit: boolean;
    orders: Set<string>;
    rowCount: number;
    quantity: number;
    hasQuantity: boolean;
  }

  const newBucket = (): Bucket => ({
    revenue: 0,
    hasRevenue: false,
    profit: 0,
    hasProfit: false,
    orders: new Set<string>(),
    rowCount: 0,
    quantity: 0,
    hasQuantity: false,
  });

  const monthlyMap = new Map<string, Bucket>();
  const categoryMap = new Map<string, Bucket>();
  const regionMap = new Map<string, Bucket>();
  const productMap = new Map<string, Bucket>();

  // Build canonical display labels so casing/whitespace variants group cleanly without mutating original rows
  const categoryLabels = buildCanonicalLabelMap(rows, mapping.categoryCol, 'Uncategorized');
  const regionLabels = buildCanonicalLabelMap(rows, mapping.regionCol, 'Unspecified');
  const productLabels = buildCanonicalLabelMap(rows, mapping.productCol, 'Unnamed Product');

  const canDeriveProfit = !mapping.profitCol && Boolean(mapping.revenueCol && mapping.costCol);
  if (canDeriveProfit) derivedProfitUsed = true;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const rev = mapping.revenueCol ? parseNumericValue(row[mapping.revenueCol]) : null;
    if (rev !== null) {
      totalRev += rev;
      revCount++;
    }

    let prof: number | null = null;
    if (mapping.profitCol) {
      prof = parseNumericValue(row[mapping.profitCol]);
    } else if (canDeriveProfit && mapping.costCol && rev !== null) {
      const cost = parseNumericValue(row[mapping.costCol]);
      if (cost !== null) prof = rev - cost;
    }
    if (prof !== null) {
      totalProf += prof;
      profCount++;
    }

    const qty = mapping.quantityCol ? parseNumericValue(row[mapping.quantityCol]) : null;
    if (qty !== null) {
      totalQty += qty;
      qtyCount++;
    }

    const orderKey = mapping.orderIdCol
      ? isEmptyCell(row[mapping.orderIdCol])
        ? `row_${i}`
        : String(row[mapping.orderIdCol]).trim()
      : `row_${i}`;
    orderIds.add(orderKey);

    let monthKey: string | null = null;
    if (mapping.dateCol) {
      const iso = parseDateString(row[mapping.dateCol]);
      if (iso) {
        if (!minDate || iso < minDate) minDate = iso;
        if (!maxDate || iso > maxDate) maxDate = iso;
        monthKey = iso.slice(0, 7); // YYYY-MM
      }
    }

    const addToBucket = (map: Map<string, Bucket>, key: string) => {
      if (!map.has(key)) map.set(key, newBucket());
      const b = map.get(key)!;
      b.rowCount++;
      b.orders.add(orderKey);
      if (rev !== null) {
        b.revenue += rev;
        b.hasRevenue = true;
      }
      if (prof !== null) {
        b.profit += prof;
        b.hasProfit = true;
      }
      if (qty !== null) {
        b.quantity += qty;
        b.hasQuantity = true;
      }
    };

    if (monthKey) addToBucket(monthlyMap, monthKey);

    if (mapping.categoryCol) {
      const normKey = normalizeCategoricalKey(row[mapping.categoryCol]);
      const k = normKey ? categoryLabels.get(normKey) ?? 'Uncategorized' : 'Uncategorized';
      addToBucket(categoryMap, k);
    }
    if (mapping.regionCol) {
      const normKey = normalizeCategoricalKey(row[mapping.regionCol]);
      const k = normKey ? regionLabels.get(normKey) ?? 'Unspecified' : 'Unspecified';
      addToBucket(regionMap, k);
    }
    if (mapping.productCol) {
      const normKey = normalizeCategoricalKey(row[mapping.productCol]);
      const k = normKey ? productLabels.get(normKey) ?? 'Unnamed Product' : 'Unnamed Product';
      addToBucket(productMap, k);
    }
  }

  const hasRev = Boolean(mapping.revenueCol && revCount > 0);
  const hasProf = Boolean((mapping.profitCol || canDeriveProfit) && profCount > 0);
  const totalOrderCount = mapping.orderIdCol ? orderIds.size : rowCount;

  const sortedPeriods = Array.from(monthlyMap.keys()).sort();
  const monthlySeries: MonthlyPoint[] = [];
  const decliningMonths: BusinessAnalyticsResult['decliningMonths'] = [];

  for (let i = 0; i < sortedPeriods.length; i++) {
    const period = sortedPeriods[i];
    const b = monthlyMap.get(period)!;
    const revVal = b.hasRevenue ? b.revenue : null;
    const profVal = b.hasProfit ? b.profit : null;

    let momRevenueGrowthPct: number | null = null;
    let momRevenueDelta: number | null = null;
    let momProfitDelta: number | null = null;

    if (i > 0) {
      const prevPeriod = sortedPeriods[i - 1];
      const prevB = monthlyMap.get(prevPeriod)!;
      if (revVal !== null && prevB.hasRevenue) {
        momRevenueDelta = revVal - prevB.revenue;
        if (prevB.revenue !== 0) {
          momRevenueGrowthPct = ((revVal - prevB.revenue) / Math.abs(prevB.revenue)) * 100;
        }
        if (momRevenueDelta < 0) {
          decliningMonths.push({
            period,
            revenue: revVal,
            previousPeriod: prevPeriod,
            previousRevenue: prevB.revenue,
            delta: momRevenueDelta,
            deltaPct: momRevenueGrowthPct ?? 0,
          });
        }
      }
      if (profVal !== null && prevB.hasProfit) {
        momProfitDelta = profVal - prevB.profit;
      }
    }

    monthlySeries.push({
      period,
      revenue: revVal,
      profit: profVal,
      orders: mapping.orderIdCol ? b.orders.size : b.rowCount,
      quantity: b.hasQuantity ? b.quantity : null,
      momRevenueGrowthPct,
      momRevenueDelta,
      momProfitDelta,
    });
  }

  // Overall sales growth: first vs last comparable period with revenue when >= 2 periods exist
  const revPeriods = monthlySeries.filter((m) => m.revenue !== null);
  let salesGrowthMetric: MetricResult;
  if (!mapping.dateCol || !hasRev) {
    salesGrowthMetric = {
      available: false,
      value: null,
      reasonIfUnavailable: !mapping.dateCol
        ? 'Requires a valid Date column to measure period-over-period growth.'
        : mapping.revenueCol
        ? `Mapped Revenue column "${mapping.revenueCol}" has no valid numeric values.`
        : 'Requires a Revenue/Sales column to compute sales growth.',
    };
  } else if (revPeriods.length < 2) {
    salesGrowthMetric = {
      available: false,
      value: null,
      reasonIfUnavailable: 'Requires at least 2 distinct months with valid dates and revenue in the filtered range.',
    };
  } else {
    const first = revPeriods[0];
    const last = revPeriods[revPeriods.length - 1];
    if (first.revenue !== null && last.revenue !== null && first.revenue !== 0) {
      const growth = ((last.revenue - first.revenue) / Math.abs(first.revenue)) * 100;
      salesGrowthMetric = {
        available: true,
        value: growth,
        note: `${first.period} to ${last.period} net change`,
      };
    } else {
      salesGrowthMetric = {
        available: false,
        value: null,
        reasonIfUnavailable: 'Baseline starting month revenue is zero or missing.',
      };
    }
  }

  const toBreakdown = (map: Map<string, Bucket>): DimensionBreakdown[] => {
    const list: DimensionBreakdown[] = [];
    for (const [name, b] of map.entries()) {
      const rev = b.hasRevenue ? b.revenue : null;
      const prof = b.hasProfit ? b.profit : null;
      const margin = rev !== null && rev !== 0 && prof !== null ? (prof / rev) * 100 : null;
      const share = rev !== null && totalRev !== 0 ? (rev / totalRev) * 100 : null;
      list.push({
        name,
        revenue: rev,
        profit: prof,
        profitMarginPct: margin,
        orders: mapping.orderIdCol ? b.orders.size : b.rowCount,
        quantity: b.hasQuantity ? b.quantity : null,
        revenueSharePct: share,
      });
    }
    return list.sort((a, b) => (b.revenue ?? b.profit ?? b.orders) - (a.revenue ?? a.profit ?? a.orders));
  };

  return {
    rowCount,
    dateBounds: { minDate, maxDate },
    kpis: {
      totalRevenue: hasRev
        ? { available: true, value: totalRev, note: `Sum of ${mapping.revenueCol}` }
        : {
            available: false,
            value: null,
            reasonIfUnavailable: mapping.revenueCol
              ? `Mapped column "${mapping.revenueCol}" contains no valid numeric values.`
              : 'No Revenue or Sales numeric column mapped in this dataset.',
          },
      totalProfit: hasProf
        ? {
            available: true,
            value: totalProf,
            note: derivedProfitUsed
              ? `Derived (${mapping.revenueCol} - ${mapping.costCol})`
              : `Sum of ${mapping.profitCol}`,
          }
        : {
            available: false,
            value: null,
            reasonIfUnavailable: mapping.profitCol
              ? `Mapped column "${mapping.profitCol}" contains no valid numeric values.`
              : 'Requires a Profit column (or both Revenue and Cost columns).',
          },
      profitMargin:
        hasRev && hasProf && totalRev !== 0
          ? { available: true, value: (totalProf / totalRev) * 100, note: 'Total Profit / Total Revenue' }
          : {
              available: false,
              value: null,
              reasonIfUnavailable: 'Requires non-zero Revenue and valid Profit values to calculate margin.',
            },
      totalOrders:
        rowCount > 0
          ? {
              available: true,
              value: totalOrderCount,
              note: mapping.orderIdCol
                ? `Distinct values in ${mapping.orderIdCol}`
                : 'Transaction row count (no Order ID column mapped)',
            }
          : {
              available: false,
              value: null,
              reasonIfUnavailable: 'Dataset has zero rows matching current filters.',
            },
      averageOrderValue:
        hasRev && totalOrderCount > 0
          ? { available: true, value: totalRev / totalOrderCount, note: 'Total Revenue / Total Orders' }
          : {
              available: false,
              value: null,
              reasonIfUnavailable: 'Requires valid Revenue and at least 1 order.',
            },
      totalQuantitySold:
        mapping.quantityCol && qtyCount > 0
          ? { available: true, value: totalQty, note: `Sum of ${mapping.quantityCol}` }
          : {
              available: false,
              value: null,
              reasonIfUnavailable: mapping.quantityCol
                ? `Mapped column "${mapping.quantityCol}" contains no valid numeric values.`
                : 'No Quantity / Units Sold numeric column mapped.',
            },
      salesGrowth: salesGrowthMetric,
    },
    monthlySeries,
    decliningMonths,
    categoryBreakdown: toBreakdown(categoryMap),
    regionBreakdown: toBreakdown(regionMap),
    productBreakdown: toBreakdown(productMap),
  };
}

// ============================================================================
// DETERMINISTIC TOOL EXECUTOR FOR GEMINI AI BUSINESS ANALYST AGENT
// ============================================================================

function filterRowsByCriteria(
  rows: DataRow[],
  mapping: ColumnRoleMapping,
  args: {
    filter_column?: string;
    filter_operator?: string;
    filter_value?: string;
    date_start?: string;
    date_end?: string;
  }
): DataRow[] {
  return rows.filter((row) => {
    if ((args.date_start || args.date_end) && mapping.dateCol) {
      const iso = parseDateString(row[mapping.dateCol]);
      if (!iso) return false;
      if (args.date_start && iso < args.date_start) return false;
      if (args.date_end && iso > args.date_end) return false;
    }

    if (args.filter_column && args.filter_value !== undefined) {
      const cell = row[args.filter_column];
      const op = (args.filter_operator ?? 'eq').toLowerCase();
      const targetNum = parseNumericValue(args.filter_value);
      const cellNum = parseNumericValue(cell);

      if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
        if (cellNum === null || targetNum === null) return false;
        if (op === 'gt') return cellNum > targetNum;
        if (op === 'gte') return cellNum >= targetNum;
        if (op === 'lt') return cellNum < targetNum;
        if (op === 'lte') return cellNum <= targetNum;
      }

      const cellStr = isEmptyCell(cell) ? '' : String(cell).trim().toLowerCase();
      const targetStr = String(args.filter_value).trim().toLowerCase();
      if (op === 'neq') return cellStr !== targetStr;
      if (op === 'contains') return cellStr.includes(targetStr);
      return cellStr === targetStr;
    }
    return true;
  });
}

export function executeAnalyticsTool(
  rows: DataRow[],
  columns: string[],
  mapping: ColumnRoleMapping,
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (toolName === 'get_dataset_summary') {
    const quality = profileDataset(rows, columns);
    const analytics = computeBusinessAnalytics(rows, mapping);
    return {
      rowCount: rows.length,
      columns: quality.columns.map((c) => ({
        name: c.name,
        type: c.detectedType,
        missingCount: c.missingCount,
        uniqueCount: c.uniqueCount,
        inconsistentGroups: c.inconsistentGroups,
        min: c.min,
        max: c.max,
        sum: c.sum,
        mean: c.mean !== null ? Number(c.mean.toFixed(2)) : null,
      })),
      duplicateRowCount: quality.duplicateRowCount,
      totalMissingCells: quality.totalMissingCells,
      columnMappings: mapping,
      dateBounds: analytics.dateBounds,
      kpis: analytics.kpis,
      topIssues: quality.issues.slice(0, 8),
    };
  }

  if (toolName === 'compute_aggregate_metric') {
    const metric = String(args.metric ?? 'sum').toLowerCase();
    const col = String(args.column ?? '');
    if (!col || !columns.includes(col)) {
      return { error: `Column "${col}" does not exist. Available columns: ${columns.join(', ')}` };
    }
    const filtered = filterRowsByCriteria(rows, mapping, {
      filter_column: args.filter_column ? String(args.filter_column) : undefined,
      filter_operator: args.filter_operator ? String(args.filter_operator) : undefined,
      filter_value: args.filter_value !== undefined ? String(args.filter_value) : undefined,
      date_start: args.date_start ? String(args.date_start) : undefined,
      date_end: args.date_end ? String(args.date_end) : undefined,
    });

    if (metric === 'count') {
      return { column: col, metric, matchingRows: filtered.length, value: filtered.length };
    }
    if (metric === 'distinct_count') {
      const s = new Set<string>();
      for (const r of filtered) {
        if (!isEmptyCell(r[col])) s.add(String(r[col]).trim());
      }
      return { column: col, metric, matchingRows: filtered.length, value: s.size };
    }

    const nums: number[] = [];
    for (const r of filtered) {
      const n = parseNumericValue(r[col]);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0) {
      return { error: `No valid numeric values found in column "${col}" for the specified filter.` };
    }
    nums.sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const min = nums[0];
    const max = nums[nums.length - 1];
    const median =
      nums.length % 2 === 1
        ? nums[(nums.length - 1) / 2]
        : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;

    const valMap: Record<string, number> = { sum, avg, mean: avg, min, max, median };
    const resultVal = valMap[metric] ?? sum;
    return {
      column: col,
      metric,
      matchingRows: filtered.length,
      numericCount: nums.length,
      value: Number(resultVal.toFixed(4)),
      sum: Number(sum.toFixed(4)),
      avg: Number(avg.toFixed(4)),
      min,
      max,
      median: Number(median.toFixed(4)),
    };
  }

  if (toolName === 'group_by_dimension') {
    const groupBy = String(args.group_by ?? '');
    const metricCol = args.metric_column ? String(args.metric_column) : mapping.revenueCol ?? '';
    const agg = String(args.aggregation ?? 'sum').toLowerCase();
    const sortOrder = String(args.sort_order ?? 'desc').toLowerCase();
    const limit = Math.min(Math.max(Number(args.limit ?? 15), 1), 50);
    const timeGranularity = args.time_granularity ? String(args.time_granularity).toLowerCase() : null;

    if (!groupBy || !columns.includes(groupBy)) {
      return { error: `Group-by column "${groupBy}" not found. Available columns: ${columns.join(', ')}` };
    }

    const filtered = filterRowsByCriteria(rows, mapping, {
      filter_column: args.filter_column ? String(args.filter_column) : undefined,
      filter_operator: args.filter_operator ? String(args.filter_operator) : undefined,
      filter_value: args.filter_value !== undefined ? String(args.filter_value) : undefined,
      date_start: args.date_start ? String(args.date_start) : undefined,
      date_end: args.date_end ? String(args.date_end) : undefined,
    });

    interface GroupAccum {
      key: string;
      rowCount: number;
      metricSum: number;
      metricVals: number[];
      revenueSum: number;
      profitSum: number;
    }

    const groups = new Map<string, GroupAccum>();
    let grandMetricTotal = 0;

    const canonicalGroupLabels = buildCanonicalLabelMap(filtered, groupBy, 'Missing');

    for (const r of filtered) {
      let keyVal = 'Missing';
      if (timeGranularity && (groupBy === mapping.dateCol || parseDateString(r[groupBy]))) {
        const iso = parseDateString(r[groupBy]);
        if (!iso) continue;
        if (timeGranularity === 'year') keyVal = iso.slice(0, 4);
        else if (timeGranularity === 'quarter') {
          const m = Number(iso.slice(5, 7));
          keyVal = `${iso.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
        } else {
          keyVal = iso.slice(0, 7);
        }
      } else {
        const normKey = normalizeCategoricalKey(r[groupBy]);
        keyVal = normKey ? canonicalGroupLabels.get(normKey) ?? 'Missing' : 'Missing';
      }

      if (!groups.has(keyVal)) {
        groups.set(keyVal, {
          key: keyVal,
          rowCount: 0,
          metricSum: 0,
          metricVals: [],
          revenueSum: 0,
          profitSum: 0,
        });
      }
      const g = groups.get(keyVal)!;
      g.rowCount++;

      if (metricCol && columns.includes(metricCol)) {
        const n = parseNumericValue(r[metricCol]);
        if (n !== null) {
          g.metricSum += n;
          g.metricVals.push(n);
          grandMetricTotal += n;
        }
      }
      if (mapping.revenueCol) {
        const rv = parseNumericValue(r[mapping.revenueCol]);
        if (rv !== null) g.revenueSum += rv;
      }
      if (mapping.profitCol) {
        const pv = parseNumericValue(r[mapping.profitCol]);
        if (pv !== null) g.profitSum += pv;
      } else if (mapping.revenueCol && mapping.costCol) {
        const rv = parseNumericValue(r[mapping.revenueCol]);
        const cv = parseNumericValue(r[mapping.costCol]);
        if (rv !== null && cv !== null) g.profitSum += rv - cv;
      }
    }

    const rowsOut = Array.from(groups.values()).map((g) => {
      let metricValue = g.rowCount;
      if (agg === 'sum') metricValue = g.metricSum;
      else if (agg === 'avg' || agg === 'mean') {
        metricValue = g.metricVals.length > 0 ? g.metricSum / g.metricVals.length : 0;
      } else if (agg === 'min') {
        metricValue = g.metricVals.length > 0 ? Math.min(...g.metricVals) : 0;
      } else if (agg === 'max') {
        metricValue = g.metricVals.length > 0 ? Math.max(...g.metricVals) : 0;
      }

      return {
        group: g.key,
        rowCount: g.rowCount,
        metricValue: Number(metricValue.toFixed(2)),
        revenue: mapping.revenueCol ? Number(g.revenueSum.toFixed(2)) : undefined,
        profit: mapping.profitCol || (mapping.revenueCol && mapping.costCol) ? Number(g.profitSum.toFixed(2)) : undefined,
        profitMarginPct:
          mapping.revenueCol && g.revenueSum !== 0 && (mapping.profitCol || mapping.costCol)
            ? Number(((g.profitSum / g.revenueSum) * 100).toFixed(2))
            : undefined,
        sharePct: grandMetricTotal !== 0 ? Number(((g.metricSum / grandMetricTotal) * 100).toFixed(2)) : undefined,
      };
    });

    rowsOut.sort((a, b) =>
      sortOrder === 'asc' ? a.metricValue - b.metricValue : b.metricValue - a.metricValue
    );

    return {
      groupBy,
      metricColumn: metricCol || 'rowCount',
      aggregation: agg,
      totalGroups: rowsOut.length,
      results: rowsOut.slice(0, limit),
    };
  }

  if (toolName === 'analyze_time_trends') {
    const analytics = computeBusinessAnalytics(rows, mapping);
    if (!mapping.dateCol) {
      return { error: 'No Date column exists or is mapped in the dataset.' };
    }
    const series = analytics.monthlySeries;
    let peakMonth = null;
    let lowestMonth = null;
    for (const pt of series) {
      if (pt.revenue !== null) {
        if (!peakMonth || pt.revenue > (peakMonth.revenue ?? -Infinity)) peakMonth = pt;
        if (!lowestMonth || pt.revenue < (lowestMonth.revenue ?? Infinity)) lowestMonth = pt;
      }
    }
    return {
      dateColumn: mapping.dateCol,
      revenueColumn: mapping.revenueCol,
      profitColumn: mapping.profitCol,
      totalMonths: series.length,
      peakMonth,
      lowestMonth,
      decliningMonths: analytics.decliningMonths,
      monthlySeries: series.map((s) => ({
        period: s.period,
        revenue: s.revenue !== null ? Number(s.revenue.toFixed(2)) : null,
        profit: s.profit !== null ? Number(s.profit.toFixed(2)) : null,
        orders: s.orders,
        momRevenueDelta: s.momRevenueDelta !== null ? Number(s.momRevenueDelta.toFixed(2)) : null,
        momRevenueGrowthPct: s.momRevenueGrowthPct !== null ? Number(s.momRevenueGrowthPct.toFixed(2)) : null,
      })),
    };
  }

  if (toolName === 'inspect_rows') {
    const filtered = filterRowsByCriteria(rows, mapping, {
      filter_column: args.filter_column ? String(args.filter_column) : undefined,
      filter_operator: args.filter_operator ? String(args.filter_operator) : undefined,
      filter_value: args.filter_value !== undefined ? String(args.filter_value) : undefined,
      date_start: args.date_start ? String(args.date_start) : undefined,
      date_end: args.date_end ? String(args.date_end) : undefined,
    });
    const sortBy = args.sort_by ? String(args.sort_by) : null;
    const sortOrder = String(args.sort_order ?? 'desc').toLowerCase();
    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 25);

    const sorted = [...filtered];
    if (sortBy && columns.includes(sortBy)) {
      sorted.sort((a, b) => {
        const na = parseNumericValue(a[sortBy]);
        const nb = parseNumericValue(b[sortBy]);
        if (na !== null && nb !== null) {
          return sortOrder === 'asc' ? na - nb : nb - na;
        }
        const sa = String(a[sortBy] ?? '');
        const sb = String(b[sortBy] ?? '');
        return sortOrder === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    return {
      totalMatchingRows: filtered.length,
      returnedRows: sorted.slice(0, limit),
    };
  }

  return { error: `Unknown tool "${toolName}"` };
}

// ============================================================================
// COMPACT CONTEXT BUILDER & INSTANT DETERMINISTIC QUESTION SOLVER
// ============================================================================

export function computeDatasetHash(
  name: string,
  columns: string[],
  rows: DataRow[],
  mapping: ColumnRoleMapping
): string {
  const firstRow = rows[0] ? JSON.stringify(rows[0]) : '';
  const midRow = rows[Math.floor(rows.length / 2)] ? JSON.stringify(rows[Math.floor(rows.length / 2)]) : '';
  const lastRow = rows[rows.length - 1] ? JSON.stringify(rows[rows.length - 1]) : '';
  const raw = `${name}|${rows.length}|${columns.join(',')}|${JSON.stringify(mapping)}|${firstRow}|${midRow}|${lastRow}`;
  // Fast 32-bit FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${rows.length}_${columns.length}_${(hash >>> 0).toString(36)}`;
}

export interface CompactAIContext {
  datasetName: string;
  rowCount: number;
  columnCount: number;
  dateBounds: { minDate: string | null; maxDate: string | null };
  columns: { name: string; type: ColumnType; missing: number; unique: number }[];
  columnMappings: ColumnRoleMapping;
  quality: {
    duplicateRowCount: number;
    totalMissingCells: number;
    missingCellPct: number;
    topIssues: string[];
  };
  kpis: BusinessAnalyticsResult['kpis'];
  monthlySeries: {
    period: string;
    revenue: number | null;
    profit: number | null;
    orders: number;
    momPct: number | null;
  }[];
  decliningMonths: BusinessAnalyticsResult['decliningMonths'];
  topCategories: DimensionBreakdown[];
  topRegions: DimensionBreakdown[];
  topProducts: DimensionBreakdown[];
  bottomProducts: DimensionBreakdown[];
  sampleRows: DataRow[];
}

export interface ReportScopeFilter {
  dateStart?: string;
  dateEnd?: string;
  categoryKey?: string;
  regionKey?: string;
}

export function filterRowsForScope(
  rows: DataRow[],
  mapping: ColumnRoleMapping,
  scope: ReportScopeFilter
): DataRow[] {
  const hasDate = Boolean(mapping.dateCol && (scope.dateStart || scope.dateEnd));
  const hasCat = Boolean(mapping.categoryCol && scope.categoryKey && scope.categoryKey !== 'ALL');
  const hasReg = Boolean(mapping.regionCol && scope.regionKey && scope.regionKey !== 'ALL');
  if (!hasDate && !hasCat && !hasReg) return rows;

  return rows.filter((row) => {
    if (hasDate && mapping.dateCol) {
      const iso = parseDateString(row[mapping.dateCol]);
      if (!iso) return false;
      if (scope.dateStart && iso < scope.dateStart) return false;
      if (scope.dateEnd && iso > scope.dateEnd) return false;
    }
    if (hasCat && mapping.categoryCol) {
      if (normalizeCategoricalKey(row[mapping.categoryCol]) !== scope.categoryKey) return false;
    }
    if (hasReg && mapping.regionCol) {
      if (normalizeCategoricalKey(row[mapping.regionCol]) !== scope.regionKey) return false;
    }
    return true;
  });
}

export function buildCompactAIContext(
  datasetName: string,
  columns: string[],
  mapping: ColumnRoleMapping,
  quality: DataQualitySummary,
  analytics: BusinessAnalyticsResult,
  rows: DataRow[],
  options?: { includeSampleRows?: boolean }
): CompactAIContext {
  const includeSampleRows = options?.includeSampleRows ?? true;
  const round2 = (n: number | null): number | null =>
    n === null || Number.isNaN(n) ? null : Number(n.toFixed(2));

  const compactBreakdown = (items: DimensionBreakdown[]) =>
    items.map((d) => ({
      name: d.name,
      revenue: round2(d.revenue),
      profit: round2(d.profit),
      profitMarginPct: round2(d.profitMarginPct),
      orders: d.orders,
      quantity: d.quantity,
      revenueSharePct: round2(d.revenueSharePct),
    }));

  // Limit sample rows to 3 and truncate large text fields to keep token count minimal
  const sampleRows = includeSampleRows
    ? rows.slice(0, 3).map((r) => {
        const out: DataRow = {};
        for (const col of columns.slice(0, 14)) {
          const v = r[col];
          if (typeof v === 'string' && v.length > 60) {
            out[col] = `${v.slice(0, 57)}...`;
          } else {
            out[col] = v ?? null;
          }
        }
        return out;
      })
    : [];

  return {
    datasetName,
    rowCount: quality.rowCount,
    columnCount: quality.columnCount,
    dateBounds: analytics.dateBounds,
    columns: quality.columns.slice(0, 25).map((c) => ({
      name: c.name,
      type: c.detectedType,
      missing: c.missingCount,
      unique: c.uniqueCount,
    })),
    columnMappings: mapping,
    quality: {
      duplicateRowCount: quality.duplicateRowCount,
      totalMissingCells: quality.totalMissingCells,
      missingCellPct: Number(quality.missingCellPct.toFixed(2)),
      topIssues: quality.issues.slice(0, 5).map((i) => i.description),
    },
    kpis: analytics.kpis,
    monthlySeries: analytics.monthlySeries.slice(-18).map((m) => ({
      period: m.period,
      revenue: round2(m.revenue),
      profit: round2(m.profit),
      orders: m.orders,
      momPct: round2(m.momRevenueGrowthPct),
    })),
    decliningMonths: analytics.decliningMonths.map((d) => ({
      ...d,
      revenue: Number(d.revenue.toFixed(2)),
      previousRevenue: Number(d.previousRevenue.toFixed(2)),
      delta: Number(d.delta.toFixed(2)),
      deltaPct: Number(d.deltaPct.toFixed(2)),
    })),
    topCategories: compactBreakdown(analytics.categoryBreakdown.slice(0, 8)),
    topRegions: compactBreakdown(analytics.regionBreakdown.slice(0, 8)),
    topProducts: compactBreakdown(analytics.productBreakdown.slice(0, 8)),
    bottomProducts: compactBreakdown([...analytics.productBreakdown].reverse().slice(0, 5)),
    sampleRows,
  };
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

export interface DeterministicAnswerResult {
  answer: string;
  toolTrace: { tool: string; args: Record<string, unknown>; summary: string }[];
}

export function tryDeterministicAnswer(
  question: string,
  datasetName: string,
  mapping: ColumnRoleMapping,
  quality: DataQualitySummary,
  analytics: BusinessAnalyticsResult
): DeterministicAnswerResult | null {
  const q = question.trim().toLowerCase();

  // Never intercept interpretive, strategic, root-cause, or multi-part questions
  const requiresInterpretation =
    /\b(why|explain|reason|problem|issue|risk|opportunit|recommend|improve|suggest|strategy|action|forecast|summarize|summary|overview|insight|compare|versus|vs\b|trend)\b/.test(
      q
    );
  if (requiresInterpretation) return null;

  // Never intercept custom filter queries (e.g., "in Europe", "for Q2", "above 1000")
  const hasCustomFilter =
    /\b(in|for|from|between|above|below|greater|less|under|over|during|only)\b/.test(q) &&
    !/\b(which months show declining revenue|which region has the lowest|which product generates the highest)\b/.test(q);
  if (hasCustomFilter) return null;

  // 1. Total Revenue / Sales
  if (/^(what is|show|get|calculate|tell me)?\s*(the\s*)?(total\s+)?(revenue|sales)\??$/.test(q)) {
    const kpi = analytics.kpis.totalRevenue;
    if (!kpi.available) {
      return {
        answer: `**Observed Data**\n- **Total Revenue** cannot be calculated for **${datasetName}**: ${kpi.reasonIfUnavailable}`,
        toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'totalRevenue' }, summary: JSON.stringify(kpi) }],
      };
    }
    const marginNote = analytics.kpis.profitMargin.available
      ? ` with a profit margin of **${analytics.kpis.profitMargin.value!.toFixed(2)}%**`
      : '';
    return {
      answer: `**Observed Data**\n- **Total Revenue**: **${fmtMoney(kpi.value)}** across **${fmtInt(analytics.kpis.totalOrders.value)}** orders (${kpi.note})${marginNote}.`,
      toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'totalRevenue' }, summary: JSON.stringify(kpi) }],
    };
  }

  // 2. Total Profit
  if (/^(what is|show|get|calculate|tell me)?\s*(the\s*)?(total\s+)?profit\??$/.test(q)) {
    const kpi = analytics.kpis.totalProfit;
    if (!kpi.available) {
      return {
        answer: `**Observed Data**\n- **Total Profit** cannot be calculated for **${datasetName}**: ${kpi.reasonIfUnavailable}`,
        toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'totalProfit' }, summary: JSON.stringify(kpi) }],
      };
    }
    return {
      answer: `**Observed Data**\n- **Total Profit**: **${fmtMoney(kpi.value)}** (${kpi.note}).`,
      toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'totalProfit' }, summary: JSON.stringify(kpi) }],
    };
  }

  // 3. Profit Margin
  if (/^(what is|show|get|calculate)?\s*(the\s*)?(overall\s*)?profit\s*margin\??$/.test(q)) {
    const kpi = analytics.kpis.profitMargin;
    if (!kpi.available) {
      return {
        answer: `**Observed Data**\n- **Profit Margin** cannot be calculated: ${kpi.reasonIfUnavailable}`,
        toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'profitMargin' }, summary: JSON.stringify(kpi) }],
      };
    }
    return {
      answer: `**Observed Data**\n- **Overall Profit Margin**: **${kpi.value!.toFixed(2)}%** (Total Profit ${fmtMoney(analytics.kpis.totalProfit.value)} / Total Revenue ${fmtMoney(analytics.kpis.totalRevenue.value)}).`,
      toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'profitMargin' }, summary: JSON.stringify(kpi) }],
    };
  }

  // 4. Average Order Value / Total Orders / Quantity Sold
  if (/^(what is|show|get)?\s*(the\s*)?(average\s+order\s+value|aov)\??$/.test(q)) {
    const kpi = analytics.kpis.averageOrderValue;
    return {
      answer: kpi.available
        ? `**Observed Data**\n- **Average Order Value (AOV)**: **${fmtMoney(kpi.value)}** across **${fmtInt(analytics.kpis.totalOrders.value)}** orders.`
        : `**Observed Data**\n- **Average Order Value** cannot be calculated: ${kpi.reasonIfUnavailable}`,
      toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'averageOrderValue' }, summary: JSON.stringify(kpi) }],
    };
  }

  if (/^(how many|what is the total)\s+(orders|rows|records)\??$/.test(q)) {
    return {
      answer: `**Observed Data**\n- **Total Orders**: **${fmtInt(analytics.kpis.totalOrders.value)}** (${analytics.kpis.totalOrders.note}) across **${fmtInt(quality.rowCount)}** dataset rows.`,
      toolTrace: [{ tool: 'deterministic_kpi_lookup', args: { metric: 'totalOrders' }, summary: JSON.stringify(analytics.kpis.totalOrders) }],
    };
  }

  // 5. Highest profit product
  if (/which\s+product\s+(generates|has|makes)\s+the\s+highest\s+profit/.test(q)) {
    if (!mapping.productCol || !analytics.kpis.totalProfit.available) {
      return {
        answer: `**Observed Data**\n- Unable to rank products by profit because ${!mapping.productCol ? 'no Product column is mapped' : analytics.kpis.totalProfit.reasonIfUnavailable}.`,
        toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: 'product', metric: 'profit' }, summary: 'Missing required columns' }],
      };
    }
    const sorted = [...analytics.productBreakdown].sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
    const top = sorted.slice(0, 5);
    const lines = top.map(
      (p, idx) =>
        `${idx + 1}. **${p.name}** — Profit: **${fmtMoney(p.profit)}** (Revenue: ${fmtMoney(p.revenue)}, Margin: ${p.profitMarginPct !== null ? `${p.profitMarginPct.toFixed(1)}%` : 'N/A'})`
    );
    return {
      answer: `**Observed Data**\n- Top profit-generating product in **${datasetName}**: **${top[0].name}** (**${fmtMoney(top[0].profit)}**).\n\n### Top Products by Profit\n${lines.join('\n')}`,
      toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: mapping.productCol, metric: 'profit', limit: 5 }, summary: JSON.stringify(top) }],
    };
  }

  // 6. Lowest sales/revenue region
  if (/which\s+region\s+(has|generates)\s+the\s+lowest\s+(sales|revenue)/.test(q)) {
    if (!mapping.regionCol || !analytics.kpis.totalRevenue.available) {
      return {
        answer: `**Observed Data**\n- Unable to rank regions by sales because ${!mapping.regionCol ? 'no Region column is mapped' : analytics.kpis.totalRevenue.reasonIfUnavailable}.`,
        toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: 'region', metric: 'revenue' }, summary: 'Missing required columns' }],
      };
    }
    const sorted = [...analytics.regionBreakdown].sort((a, b) => (a.revenue ?? Infinity) - (b.revenue ?? Infinity));
    const lines = sorted.map(
      (r, idx) =>
        `${idx + 1}. **${r.name}** — Revenue: **${fmtMoney(r.revenue)}** (${r.revenueSharePct !== null ? `${r.revenueSharePct.toFixed(1)}%` : 'N/A'} share, Profit: ${fmtMoney(r.profit)})`
    );
    return {
      answer: `**Observed Data**\n- Lowest-revenue region in **${datasetName}**: **${sorted[0].name}** with **${fmtMoney(sorted[0].revenue)}** across **${fmtInt(sorted[0].orders)}** orders.\n\n### Regional Revenue Ranking (Lowest to Highest)\n${lines.join('\n')}`,
      toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: mapping.regionCol, metric: 'revenue', order: 'asc' }, summary: JSON.stringify(sorted) }],
    };
  }

  // 7. Most profitable categories
  if (/what\s+are\s+the\s+most\s+profitable\s+categories|which\s+categor(y|ies)\s+(is|are)\s+(the\s+)?most\s+profitable/.test(q)) {
    if (!mapping.categoryCol || !analytics.kpis.totalProfit.available) {
      return {
        answer: `**Observed Data**\n- Unable to rank categories by profit because ${!mapping.categoryCol ? 'no Category column is mapped' : analytics.kpis.totalProfit.reasonIfUnavailable}.`,
        toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: 'category', metric: 'profit' }, summary: 'Missing required columns' }],
      };
    }
    const sorted = [...analytics.categoryBreakdown].sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
    const lines = sorted.map(
      (c, idx) =>
        `${idx + 1}. **${c.name}** — Profit: **${fmtMoney(c.profit)}** (Revenue: ${fmtMoney(c.revenue)}, Margin: ${c.profitMarginPct !== null ? `${c.profitMarginPct.toFixed(1)}%` : 'N/A'})`
    );
    return {
      answer: `**Observed Data**\n- Most profitable category: **${sorted[0].name}** generating **${fmtMoney(sorted[0].profit)}** profit.\n\n### Categories Ranked by Total Profit\n${lines.join('\n')}`,
      toolTrace: [{ tool: 'deterministic_ranking', args: { dimension: mapping.categoryCol, metric: 'profit' }, summary: JSON.stringify(sorted) }],
    };
  }

  // 8. Declining revenue months
  if (/which\s+months\s+show\s+declining\s+revenue|declining\s+months/.test(q)) {
    if (!mapping.dateCol || !analytics.kpis.totalRevenue.available) {
      return {
        answer: `**Observed Data**\n- Unable to evaluate monthly revenue declines because ${!mapping.dateCol ? 'no Date column is mapped' : analytics.kpis.totalRevenue.reasonIfUnavailable}.`,
        toolTrace: [{ tool: 'deterministic_trend_audit', args: { metric: 'decliningMonths' }, summary: 'Missing required columns' }],
      };
    }
    if (analytics.decliningMonths.length === 0) {
      return {
        answer: `**Observed Data**\n- **No declining months** were observed across the **${analytics.monthlySeries.length}** recorded months.`,
        toolTrace: [{ tool: 'deterministic_trend_audit', args: { metric: 'decliningMonths' }, summary: '0 declining months' }],
      };
    }
    const lines = analytics.decliningMonths.map(
      (d) =>
        `- **${d.period}**: **${fmtMoney(d.revenue)}** (down **${fmtMoney(Math.abs(d.delta))}** / **${d.deltaPct.toFixed(1)}%** vs. ${d.previousPeriod} at ${fmtMoney(d.previousRevenue)})`
    );
    return {
      answer: `**Observed Data**\n- **${analytics.decliningMonths.length} month${analytics.decliningMonths.length === 1 ? '' : 's'}** recorded sequential month-over-month revenue declines:\n${lines.join('\n')}`,
      toolTrace: [{ tool: 'deterministic_trend_audit', args: { metric: 'decliningMonths' }, summary: JSON.stringify(analytics.decliningMonths) }],
    };
  }

  return null;
}

