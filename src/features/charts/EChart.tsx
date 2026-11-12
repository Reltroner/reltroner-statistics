import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, CustomChart, HeatmapChart, LineChart, ScatterChart, TreemapChart } from 'echarts/charts';
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { LabelLayout } from 'echarts/features';
import type { EChartsCoreOption } from 'echarts/core';
import { readTheme, type ChartTheme } from './theme.ts';
import { chartAnimationMs } from '../../lib/motion.ts';

echarts.use([
  BarChart, BoxplotChart, CustomChart, HeatmapChart, LineChart, ScatterChart, TreemapChart,
  AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
  SVGRenderer, LabelLayout,
]);

interface Props {
  build: (theme: ChartTheme) => EChartsCoreOption;
  height: number | string;
  label: string;
  deps?: unknown[];
  /** Merge updates by series id so position changes animate (state transitions). */
  merge?: boolean;
  onClick?: (params: { data?: unknown; name?: string; seriesName?: string }) => void;
}

/**
 * ECharts island wrapper. The SVG renderer keeps text crisp and selectable; the option builder
 * receives the active theme, so a theme toggle re-renders with the validated mode palette.
 */
export default function EChart({ build, height, label, deps = [], merge = false, onClick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const instance = echarts.init(host.current, undefined, { renderer: 'svg' });
    chart.current = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(host.current);
    const onTheme = () => setThemeVersion((n) => n + 1);
    window.addEventListener('rs:themechange', onTheme);
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    mql.addEventListener('change', onTheme);
    return () => {
      ro.disconnect();
      window.removeEventListener('rs:themechange', onTheme);
      mql.removeEventListener('change', onTheme);
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const theme = readTheme();
    const option = build(theme);
    instance.setOption(
      {
        animation: !theme.reduced,
        animationDuration: chartAnimationMs(theme.reduced),
        animationDurationUpdate: chartAnimationMs(theme.reduced),
        animationEasing: 'cubicOut',
        textStyle: { fontFamily: theme.font },
        aria: { enabled: true, label: { description: label } },
        ...option,
      },
      merge ? { replaceMerge: ['series', 'xAxis', 'yAxis', 'legend', 'visualMap'] } : { notMerge: true },
    );
    instance.off('click');
    if (onClick) instance.on('click', (p) => onClick(p as never));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeVersion, ...deps]);

  return <div ref={host} role="img" aria-label={label} className="rs-chart-frame" style={{ height }} />;
}
