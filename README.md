# Intelligent Business Data Analysis & Decision Support System

AI-powered business data analytics and decision support application for CSV/Excel profiling, automated business metrics, interactive Plotly dashboards, natural language Q&A, and executive reports powered by Google Gemini.

## Key Capabilities

1. **Dataset Upload & Schema Profiling**: Upload `.csv`, `.xlsx`, or `.xls` files (including multi-sheet Excel workbooks) or load built-in sample datasets. Automatically detects dimensions, numerical/categorical/date columns, missing values, duplicates, and inconsistent values.
2. **Data Quality Analysis & Cleaning Workbench**: Preview dry-run cleaning impact (missing value imputation/dropping, duplicate removal, whitespace trimming, casing standardization, type coercion) before applying changes. Preserves the original uploaded dataset untouched and exports cleaned `.csv` or `.xlsx`.
3. **Automated Business Analytics**: Dynamically maps business columns and computes Total Revenue, Total Profit, Profit Margin, Total Orders, Average Order Value, Total Quantity Sold, Monthly Revenue, Sales Growth, and Category/Regional/Product breakdowns—explaining explicitly when a metric cannot be calculated due to missing columns.
4. **Interactive Plotly Dashboard**: Filterable by Date Range, Category, and Region with dynamically updated Revenue & Profit Trend, Monthly Sales & MoM Growth, Category Distribution, Regional Comparison, and Top Products charts.
5. **AI Business Analyst (Tool-Grounded Agent)**: Multi-turn Gemini Function Calling agent (`gemini-4-hydrogen`) that executes deterministic queries (`get_dataset_summary`, `compute_aggregate_metric`, `group_by_dimension`, `analyze_time_trends`, `inspect_rows`) against your active dataset so every cited figure is mathematically exact.
6. **Executive Reports**: Generates structured executive briefings (Executive Summary, Dataset Overview, KPIs, Findings, Trend Analysis, Risks, Growth Opportunities, Strategic Recommendations, Management Actions) with PDF and CSV export.

## Configuration & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `GEMINI_API_KEY`:
   - **In Google AI Studio**: Open **Settings > Secrets** and add `GEMINI_API_KEY`.
   - **Locally**: Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
3. Start the full-stack server on port 3000:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   npm start
   ```
