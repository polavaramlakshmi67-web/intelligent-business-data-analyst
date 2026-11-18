import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout, Config } from 'plotly.js';

interface PlotlyChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  height?: number;
  className?: string;
}

export function PlotlyChart({
  data,
  layout = {},
  config = {},
  height = 320,
  className = '',
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const baseLayout: Partial<Layout> = {
      autosize: true,
      height,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        family: 'Public Sans, system-ui, sans-serif',
        size: 12,
        color: '#334155',
      },
      margin: { t: 24, r: 20, b: 44, l: 56 },
      hoverlabel: {
        bgcolor: '#0f172a',
        bordercolor: '#0f172a',
        font: { color: '#ffffff', family: 'JetBrains Mono, monospace', size: 12 },
      },
      ...layout,
    };

    const baseConfig: Partial<Config> = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
      ...config,
    };

    Plotly.react(el, data, baseLayout, baseConfig);

    const observer = new ResizeObserver(() => {
      if (el) {
        Plotly.Plots.resize(el);
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [data, layout, config, height]);

  return <div ref={containerRef} className={`w-full ${className}`} style={{ minHeight: height }} />;
}
