import type { DataRow } from '../../shared/analyticsEngine';

export interface SampleDatasetSpec {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  columns: string[];
  rows: DataRow[];
}

function generateGlobalRetailSales(): { columns: string[]; rows: DataRow[] } {
  const columns = [
    'Order_ID',
    'Order_Date',
    'Region',
    'Category',
    'Product',
    'Quantity',
    'Revenue',
    'Cost',
    'Profit',
    'Customer_Segment',
  ];

  const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
  const catalog: { category: string; product: string; unitPrice: number; marginRate: number }[] = [
    { category: 'Enterprise Software', product: 'Cloud Suite Pro', unitPrice: 1450, marginRate: 0.62 },
    { category: 'Enterprise Software', product: 'Analytics Core License', unitPrice: 980, marginRate: 0.58 },
    { category: 'Hardware', product: 'Edge Gateway X4', unitPrice: 760, marginRate: 0.29 },
    { category: 'Hardware', product: 'Rack Sensor Array', unitPrice: 420, marginRate: 0.24 },
    { category: 'Hardware', product: 'Industrial Tablet M2', unitPrice: 610, marginRate: 0.14 },
    { category: 'Managed Services', product: 'Annual Compliance Audit', unitPrice: 2200, marginRate: 0.48 },
    { category: 'Managed Services', product: '24/7 Infrastructure Support', unitPrice: 1650, marginRate: 0.44 },
    { category: 'Accessories', product: 'Thermal Mounting Kit', unitPrice: 145, marginRate: 0.18 },
  ];
  const segments = ['Enterprise', 'Mid-Market', 'SMB'];

  // Deterministic pseudo-random generator for reproducible numbers
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Monthly seasonality curve including deliberate dips in May & August so declining-month analysis is rich
  const monthlyMultipliers: Record<number, number> = {
    1: 0.92,
    2: 0.98,
    3: 1.12,
    4: 1.18,
    5: 0.84, // Dip
    6: 1.08,
    7: 1.15,
    8: 0.79, // Dip
    9: 1.14,
    10: 1.24,
    11: 1.32,
    12: 1.41,
  };

  const rows: DataRow[] = [];
  let orderNum = 1001;

  for (let month = 1; month <= 12; month++) {
    const ordersInMonth = month === 5 || month === 8 ? 8 : 11;
    const mult = monthlyMultipliers[month];

    for (let k = 0; k < ordersInMonth; k++) {
      const day = Math.min(28, Math.max(1, Math.floor(rand() * 28) + 1));
      const dateStr = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const regionIdx = Math.floor(rand() * regions.length);
      const itemIdx = Math.floor(rand() * catalog.length);
      const item = catalog[itemIdx];

      // Latin America + Hardware slightly tighter margins to create actionable regional/product findings
      const regionMult = regionIdx === 0 ? 1.25 : regionIdx === 1 ? 1.05 : regionIdx === 2 ? 0.95 : 0.72;
      const qty = Math.max(1, Math.round((rand() * 5 + 1) * mult));
      const revenue = Number((item.unitPrice * qty * regionMult).toFixed(2));
      const marginAdjust = regionIdx === 3 && item.category === 'Hardware' ? -0.18 : (rand() - 0.5) * 0.08;
      const effectiveMargin = item.marginRate + marginAdjust;
      const profit = Number((revenue * effectiveMargin).toFixed(2));
      const cost = Number((revenue - profit).toFixed(2));

      rows.push({
        Order_ID: `ORD-${orderNum++}`,
        Order_Date: dateStr,
        Region: regions[regionIdx],
        Category: item.category,
        Product: item.product,
        Quantity: qty,
        Revenue: revenue,
        Cost: cost,
        Profit: profit,
        Customer_Segment: segments[Math.floor(rand() * segments.length)],
      });
    }
  }

  // Inject realistic data quality anomalies to demonstrate Data Quality & Cleaning Workbench
  if (rows.length > 25) {
    rows[4].Region = ' north america ';
    rows[11].Region = 'EUROPE';
    rows[18].Category = 'enterprise software';
    rows[22].Quantity = null;
    rows[35].Profit = null;
    rows[44].Customer_Segment = '';
    // Add 2 exact duplicate rows
    rows.push({ ...rows[7] });
    rows.push({ ...rows[19] });
  }

  return { columns, rows };
}

function generateWorkforceOperations(): { columns: string[]; rows: DataRow[] } {
  const columns = ['Record_ID', 'Report_Date', 'Department', 'Office', 'Headcount', 'Operating_Cost', 'Projects_Delivered'];
  const depts = ['Engineering', 'Product Design', 'Customer Success', 'Finance', 'Operations'];
  const offices = ['New York', 'London', 'Singapore'];
  const rows: DataRow[] = [];
  let idx = 1;
  for (let m = 1; m <= 6; m++) {
    for (const dept of depts) {
      const office = offices[(idx + m) % offices.length];
      rows.push({
        Record_ID: `OPS-${200 + idx++}`,
        Report_Date: `2026-${String(m).padStart(2, '0')}-15`,
        Department: dept,
        Office: office,
        Headcount: 14 + ((idx * 3) % 22),
        Operating_Cost: 42000 + ((idx * 4750) % 68000),
        Projects_Delivered: 4 + ((idx + m) % 9),
      });
    }
  }
  return { columns, rows };
}

const retail = generateGlobalRetailSales();
const ops = generateWorkforceOperations();

export const SAMPLE_DATASETS: SampleDatasetSpec[] = [
  {
    id: 'global-retail-sales',
    name: 'Global B2B Commerce 2026',
    subtitle: `${retail.rows.length} rows · 10 columns · CSV`,
    description:
      'Full-year commercial sales ledger with orders, revenue, costs, profit, regions, categories, and intentional quality issues (duplicates, missing cells, casing variants) for testing.',
    columns: retail.columns,
    rows: retail.rows,
  },
  {
    id: 'workforce-operations',
    name: 'Departmental Operations Ledger',
    subtitle: `${ops.rows.length} rows · 7 columns · CSV`,
    description:
      'Cost & delivery dataset without Revenue or Profit columns—demonstrates adaptive metric detection and explicit explanations for unavailable KPIs.',
    columns: ops.columns,
    rows: ops.rows,
  },
];
