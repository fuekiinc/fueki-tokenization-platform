import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import {
  BarChart3,
  Loader2,
  Minus,
  Move,
  Ruler,
  TrendingUp,
} from 'lucide-react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import type {
  CandlestickData,
  ChartOptions,
  DeepPartial,
  HistogramData,
  IChartApi,
  ISeriesApi,
  LineData,
  LogicalRange,
  Time,
} from 'lightweight-charts';
import { useTheme } from '../../hooks/useTheme';
import { usePriceHistory } from '../../hooks/usePriceHistory';
import { useWalletStore } from '../../store/walletStore';
import type { ChartCandle } from '../../lib/chart/dataFeed';
import {
  type BollingerBandPoint,
  computeBollingerBands,
  computeMacd,
  computeRsi,
  computeSma,
  type IndicatorPoint,
} from '../../lib/chart/indicators';
import {
  type ChartAnchorPoint,
  loadChartDrawings,
  type PersistedChartDrawing,
  saveChartDrawings,
} from '../../lib/chart/drawings';

interface TradingViewChartProps {
  tokenSell: string;
  tokenBuy: string;
  height?: number;
}

type TimeInterval = Parameters<typeof usePriceHistory>[2];
type ToolMode = 'pan' | 'trendline' | 'horizontal' | 'measure';

interface IndicatorVisibilityState {
  sma20: boolean;
  sma50: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
}

interface LegendState {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MeasurementState {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface OverlayGeometryState {
  bollingerPath: string;
  drawings: RenderedDrawing[];
  pendingTrendlineMarker: { x: number; y: number } | null;
}

interface RenderedHorizontalDrawing {
  id: string;
  type: 'horizontal';
  coordinates: { y: number };
}

interface RenderedTrendlineDrawing {
  id: string;
  type: 'trendline';
  coordinates: { x1: number; y1: number; x2: number; y2: number };
}

type RenderedDrawing = RenderedHorizontalDrawing | RenderedTrendlineDrawing;

interface SeriesBundle {
  candle: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
  sma20: ISeriesApi<'Line'>;
  sma50: ISeriesApi<'Line'>;
  bollingerUpper: ISeriesApi<'Line'>;
  bollingerLower: ISeriesApi<'Line'>;
  bollingerMiddle: ISeriesApi<'Line'>;
}

interface IndicatorSeriesBundle {
  line: ISeriesApi<'Line'>;
  signal?: ISeriesApi<'Line'>;
  histogram?: ISeriesApi<'Histogram'>;
}

const TIME_INTERVALS: Array<{ value: TimeInterval; label: string }> = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const DEFAULT_VISIBILITY: IndicatorVisibilityState = {
  sma20: true,
  sma50: true,
  bollinger: false,
  rsi: true,
  macd: true,
};

const UP_COLOR = '#16a34a';
const DOWN_COLOR = '#dc2626';
const SMA20_COLOR = '#38bdf8';
const SMA50_COLOR = '#f97316';
const BOLLINGER_COLOR = '#a855f7';
const RSI_COLOR = '#facc15';
const MACD_COLOR = '#22c55e';
const SIGNAL_COLOR = '#60a5fa';

function getChartOptions(isDark: boolean): DeepPartial<ChartOptions> {
  return isDark
    ? {
        layout: {
          background: { type: ColorType.Solid, color: '#0D0F14' },
          textColor: '#9CA3AF',
          fontFamily: "'Sora', 'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(255,255,255,0.16)',
            labelBackgroundColor: '#1F2937',
          },
          horzLine: {
            color: 'rgba(255,255,255,0.16)',
            labelBackgroundColor: '#1F2937',
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
      }
    : {
        layout: {
          background: { type: ColorType.Solid, color: '#FFFFFF' },
          textColor: '#4B5563',
          fontFamily: "'Sora', 'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: 'rgba(15,23,42,0.06)' },
          horzLines: { color: 'rgba(15,23,42,0.06)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(15,23,42,0.14)',
            labelBackgroundColor: '#E5E7EB',
          },
          horzLine: {
            color: 'rgba(15,23,42,0.14)',
            labelBackgroundColor: '#E5E7EB',
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(15,23,42,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(15,23,42,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
      };
}

function formatLegendTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.0000';
}

function isMobileViewport(width: number): boolean {
  return width < 768;
}

function createLineData(points: IndicatorPoint[]): Array<LineData<Time>> {
  return points.map((point) => ({
    time: point.time as unknown as Time,
    value: point.value,
  }));
}

function createBollingerLineData(
  points: BollingerBandPoint[],
  key: 'upper' | 'middle' | 'lower',
): Array<LineData<Time>> {
  return points.map((point) => ({
    time: point.time as unknown as Time,
    value: point[key],
  }));
}

function getTimeRangeSyncHandler(targetCharts: Array<React.MutableRefObject<IChartApi | null>>) {
  return (range: LogicalRange | null) => {
    if (!range) {
      return;
    }

    for (const targetChartRef of targetCharts) {
      targetChartRef.current?.timeScale().setVisibleLogicalRange(range);
    }
  };
}

function toTimestamp(time: Time | null): number | null {
  if (typeof time === 'number') {
    return Math.floor(time);
  }

  if (!time || typeof time !== 'object') {
    return null;
  }

  const businessDay = time as { year?: number; month?: number; day?: number };
  if (
    typeof businessDay.year !== 'number' ||
    typeof businessDay.month !== 'number' ||
    typeof businessDay.day !== 'number'
  ) {
    return null;
  }

  return Math.floor(
    Date.UTC(businessDay.year, businessDay.month - 1, businessDay.day) / 1000,
  );
}

function buildDrawingScopeKey(
  chainId: number | null,
  tokenSell: string,
  tokenBuy: string,
): string | null {
  if (!chainId || !tokenSell || !tokenBuy) {
    return null;
  }

  const pairKey = [tokenSell.toLowerCase(), tokenBuy.toLowerCase()].sort().join(':');
  return `amm-pair:${chainId}:${pairKey}`;
}

function buildBollingerPolygonPath(
  points: BollingerBandPoint[],
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null,
): string {
  if (!chart || !series || points.length === 0) {
    return '';
  }

  const upperCoordinates: string[] = [];
  const lowerCoordinates: string[] = [];

  for (const point of points) {
    const x = chart.timeScale().timeToCoordinate(point.time as unknown as Time);
    const upperY = series.priceToCoordinate(point.upper);
    const lowerY = series.priceToCoordinate(point.lower);

    if (x == null || upperY == null || lowerY == null) {
      continue;
    }

    upperCoordinates.push(`${x},${upperY}`);
    lowerCoordinates.unshift(`${x},${lowerY}`);
  }

  const allPoints = [...upperCoordinates, ...lowerCoordinates];
  return allPoints.length >= 4 ? allPoints.join(' ') : '';
}

export default function TradingViewChart({
  tokenSell,
  tokenBuy,
  height = 560,
}: TradingViewChartProps) {
  const chainId = useWalletStore((state) => state.wallet.chainId);
  const { isDark } = useTheme();
  const [interval, setInterval] = useState<TimeInterval>('1h');
  const [indicatorVisibility, setIndicatorVisibility] =
    useState<IndicatorVisibilityState>(DEFAULT_VISIBILITY);
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  const [chartError, setChartError] = useState<string | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : isMobileViewport(window.innerWidth),
  );
  const [drawings, setDrawings] = useState<PersistedChartDrawing[]>([]);
  const [pendingTrendlineStart, setPendingTrendlineStart] = useState<ChartAnchorPoint | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementState | null>(null);
  const [measurementLabel, setMeasurementLabel] = useState<string | null>(null);
  const [overlayGeometry, setOverlayGeometry] = useState<OverlayGeometryState>({
    bollingerPath: '',
    drawings: [],
    pendingTrendlineMarker: null,
  });
  const [overlayRevision, setOverlayRevision] = useState(0);

  const hasDistinctPair =
    Boolean(tokenSell) &&
    Boolean(tokenBuy) &&
    tokenSell.toLowerCase() !== tokenBuy.toLowerCase();
  const drawingScopeKey = buildDrawingScopeKey(chainId, tokenSell, tokenBuy);

  const { data, isLoading, source } = usePriceHistory(tokenSell, tokenBuy, interval);
  const dataRef = useRef<ChartCandle[]>(data);

  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<SeriesBundle | null>(null);
  const rsiSeriesRef = useRef<IndicatorSeriesBundle | null>(null);
  const macdSeriesRef = useRef<IndicatorSeriesBundle | null>(null);

  const totalHeight = Math.max(height, isMobile ? 460 : 620);
  const mainChartHeight = indicatorVisibility.rsi || indicatorVisibility.macd
    ? Math.max(320, Math.floor(totalHeight * 0.58))
    : totalHeight;
  const indicatorChartHeight = isMobile ? 110 : 140;

  const sma20 = useMemo(() => computeSma(data, 20), [data]);
  const sma50 = useMemo(() => computeSma(data, 50), [data]);
  const bollingerBands = useMemo(() => computeBollingerBands(data), [data]);
  const rsi = useMemo(() => computeRsi(data), [data]);
  const macd = useMemo(() => computeMacd(data), [data]);

  useEffect(() => {
    if (!drawingScopeKey) {
      setDrawings([]);
      return;
    }

    setDrawings(loadChartDrawings(drawingScopeKey));
  }, [drawingScopeKey]);

  useEffect(() => {
    if (!drawingScopeKey) {
      return;
    }

    saveChartDrawings(drawingScopeKey, drawings);
  }, [drawingScopeKey, drawings]);

  useEffect(() => {
    if (isMobile) {
      setToolMode('pan');
    }
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setIsMobile(isMobileViewport(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const themeOptions = getChartOptions(isDark);
    const mainContainer = mainContainerRef.current;
    if (!mainContainer) {
      return undefined;
    }

    setChartError(null);

    const width = Math.max(mainContainer.clientWidth, 320);
    const mainChart = createChart(mainContainer, {
      ...themeOptions,
      width,
      height: mainChartHeight,
      handleScale: {
        axisDoubleClickReset: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    const candle = mainChart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
    });

    const volume = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    const sma20Series = mainChart.addSeries(LineSeries, {
      color: SMA20_COLOR,
      lineWidth: 2,
      visible: indicatorVisibility.sma20,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const sma50Series = mainChart.addSeries(LineSeries, {
      color: SMA50_COLOR,
      lineWidth: 2,
      visible: indicatorVisibility.sma50,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const bollingerUpperSeries = mainChart.addSeries(LineSeries, {
      color: BOLLINGER_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      visible: indicatorVisibility.bollinger,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const bollingerLowerSeries = mainChart.addSeries(LineSeries, {
      color: BOLLINGER_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      visible: indicatorVisibility.bollinger,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const bollingerMiddleSeries = mainChart.addSeries(LineSeries, {
      color: '#c084fc',
      lineWidth: 1,
      visible: indicatorVisibility.bollinger,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    mainChart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
      visible: false,
    });

    mainSeriesRef.current = {
      candle,
      volume,
      sma20: sma20Series,
      sma50: sma50Series,
      bollingerUpper: bollingerUpperSeries,
      bollingerLower: bollingerLowerSeries,
      bollingerMiddle: bollingerMiddleSeries,
    };
    mainChartRef.current = mainChart;

    const syncTargets = [rsiChartRef, macdChartRef];
    const syncHandler = getTimeRangeSyncHandler(syncTargets);
    const overlaySyncHandler = () => {
      setOverlayRevision((currentRevision) => currentRevision + 1);
    };
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncHandler);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(overlaySyncHandler);

    const crosshairHandler = (param: {
      time?: Time;
      seriesData: Map<unknown, unknown>;
    }) => {
      if (!mainSeriesRef.current) {
        return;
      }

      const point = param.seriesData.get(mainSeriesRef.current.candle) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;

      const latestData = dataRef.current;

      if (!point?.open || !point.high || !point.low || !point.close) {
        setLegend(latestData.length > 0 ? {
          timeLabel: formatLegendTime(latestData[latestData.length - 1].time),
          open: latestData[latestData.length - 1].open,
          high: latestData[latestData.length - 1].high,
          low: latestData[latestData.length - 1].low,
          close: latestData[latestData.length - 1].close,
          volume: latestData[latestData.length - 1].volume,
        } : null);
        return;
      }

      const hoveredTimestamp = toTimestamp(param.time ?? null)
        ?? latestData[latestData.length - 1]?.time;
      const hoveredCandle = latestData.find((candleData) => candleData.time === hoveredTimestamp);
      setLegend({
        timeLabel: formatLegendTime(hoveredTimestamp ?? latestData[latestData.length - 1]?.time ?? 0),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: hoveredCandle?.volume ?? 0,
      });
    };

    mainChart.subscribeCrosshairMove(crosshairHandler);

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.max(entries[0]?.contentRect.width ?? 0, 320);
      mainChart.applyOptions({ width: nextWidth, height: mainChartHeight });
      rsiChartRef.current?.applyOptions({ width: nextWidth, height: indicatorChartHeight });
      macdChartRef.current?.applyOptions({ width: nextWidth, height: indicatorChartHeight });
      setOverlayRevision((currentRevision) => currentRevision + 1);
    });
    resizeObserver.observe(mainContainer);

    let rsiChart: IChartApi | null = null;
    if (indicatorVisibility.rsi && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        ...themeOptions,
        width,
        height: indicatorChartHeight,
        handleScale: false,
        handleScroll: false,
        rightPriceScale: {
          ...themeOptions.rightPriceScale,
          scaleMargins: { top: 0.15, bottom: 0.1 },
        },
      });

      const rsiLine = rsiChart.addSeries(LineSeries, {
        color: RSI_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      rsiLine.createPriceLine({
        price: 70,
        color: 'rgba(239,68,68,0.55)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: '70',
      });
      rsiLine.createPriceLine({
        price: 30,
        color: 'rgba(34,197,94,0.55)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: '30',
      });
      rsiChartRef.current = rsiChart;
      rsiSeriesRef.current = { line: rsiLine };
    }

    let macdChart: IChartApi | null = null;
    if (indicatorVisibility.macd && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        ...themeOptions,
        width,
        height: indicatorChartHeight,
        handleScale: false,
        handleScroll: false,
      });

      const macdHistogram = macdChart.addSeries(HistogramSeries, {
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        priceLineVisible: false,
      });
      const macdLine = macdChart.addSeries(LineSeries, {
        color: MACD_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const signalLine = macdChart.addSeries(LineSeries, {
        color: SIGNAL_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      macdChartRef.current = macdChart;
      macdSeriesRef.current = {
        line: macdLine,
        signal: signalLine,
        histogram: macdHistogram,
      };
    }

    return () => {
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(overlaySyncHandler);
      mainChart.unsubscribeCrosshairMove(crosshairHandler);
      mainChart.remove();
      rsiChart?.remove();
      macdChart?.remove();
      mainChartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
      mainSeriesRef.current = null;
      rsiSeriesRef.current = null;
      macdSeriesRef.current = null;
    };
  }, [indicatorVisibility.bollinger, indicatorVisibility.macd, indicatorVisibility.rsi, indicatorVisibility.sma20, indicatorVisibility.sma50, indicatorChartHeight, isDark, mainChartHeight]);

  useEffect(() => {
    if (!mainSeriesRef.current || !mainChartRef.current) {
      return;
    }

    const mainSeries = mainSeriesRef.current;
    const candleData: Array<CandlestickData<Time>> = data.map((candle) => ({
      time: candle.time as unknown as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    const volumeData: Array<HistogramData<Time>> = data.map((candle) => ({
      time: candle.time as unknown as Time,
      value: candle.volume,
      color: candle.close >= candle.open
        ? 'rgba(22,163,74,0.32)'
        : 'rgba(220,38,38,0.32)',
    }));

    mainSeries.candle.setData(candleData);
    mainSeries.volume.setData(volumeData);
    mainSeries.sma20.applyOptions({ visible: indicatorVisibility.sma20 });
    mainSeries.sma50.applyOptions({ visible: indicatorVisibility.sma50 });
    mainSeries.bollingerUpper.applyOptions({ visible: indicatorVisibility.bollinger });
    mainSeries.bollingerLower.applyOptions({ visible: indicatorVisibility.bollinger });
    mainSeries.bollingerMiddle.applyOptions({ visible: indicatorVisibility.bollinger });
    mainSeries.sma20.setData(createLineData(sma20));
    mainSeries.sma50.setData(createLineData(sma50));
    mainSeries.bollingerUpper.setData(createBollingerLineData(bollingerBands, 'upper'));
    mainSeries.bollingerLower.setData(createBollingerLineData(bollingerBands, 'lower'));
    mainSeries.bollingerMiddle.setData(createBollingerLineData(bollingerBands, 'middle'));
    mainChartRef.current.timeScale().fitContent();

    if (rsiSeriesRef.current?.line) {
      rsiSeriesRef.current.line.setData(createLineData(rsi));
    }

    if (macdSeriesRef.current?.line && macdSeriesRef.current.signal && macdSeriesRef.current.histogram) {
      macdSeriesRef.current.line.setData(
        macd.map((point) => ({
          time: point.time as unknown as Time,
          value: point.macd,
        })),
      );
      macdSeriesRef.current.signal.setData(
        macd.map((point) => ({
          time: point.time as unknown as Time,
          value: point.signal,
        })),
      );
      macdSeriesRef.current.histogram.setData(
        macd.map((point) => ({
          time: point.time as unknown as Time,
          value: point.histogram,
          color: point.histogram >= 0
            ? 'rgba(34,197,94,0.35)'
            : 'rgba(220,38,38,0.35)',
        })),
      );
    }

    if (data.length > 0) {
      const lastCandle = data[data.length - 1];
      setLegend({
        timeLabel: formatLegendTime(lastCandle.time),
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        volume: lastCandle.volume,
      });
    } else {
      setLegend(null);
    }

    setOverlayRevision((currentRevision) => currentRevision + 1);
  }, [bollingerBands, data, indicatorVisibility.bollinger, indicatorVisibility.sma20, indicatorVisibility.sma50, macd, rsi, sma20, sma50]);

  useEffect(() => {
    setPendingTrendlineStart(null);
    setMeasurement(null);
  }, [interval, tokenBuy, tokenSell]);

  const handleIndicatorToggle = useCallback((key: keyof IndicatorVisibilityState) => {
    setIndicatorVisibility((currentVisibility) => ({
      ...currentVisibility,
      [key]: !currentVisibility[key],
    }));
  }, []);

  const resolveAnchorFromPointer = useCallback((clientX: number, clientY: number): ChartAnchorPoint | null => {
    if (!overlayRef.current || !mainChartRef.current || !mainSeriesRef.current?.candle) {
      return null;
    }

    const bounds = overlayRef.current.getBoundingClientRect();
    const x = clamp(clientX - bounds.left, 0, bounds.width);
    const y = clamp(clientY - bounds.top, 0, bounds.height);
    const time = toTimestamp(mainChartRef.current.timeScale().coordinateToTime(x) ?? null);
    const price = mainSeriesRef.current.candle.coordinateToPrice(y);

    if (time == null || price == null || !Number.isFinite(price)) {
      return null;
    }

    return { time, price };
  }, []);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile || toolMode === 'pan') {
      return;
    }

    const anchor = resolveAnchorFromPointer(event.clientX, event.clientY);
    if (!anchor) {
      return;
    }

    if (toolMode === 'horizontal') {
      setDrawings((currentDrawings) => [
        ...currentDrawings,
        {
          id: `horizontal:${Date.now()}`,
          type: 'horizontal',
          price: anchor.price,
        },
      ]);
      return;
    }

    if (toolMode === 'trendline') {
      if (!pendingTrendlineStart) {
        setPendingTrendlineStart(anchor);
        return;
      }

      setDrawings((currentDrawings) => [
        ...currentDrawings,
        {
          id: `trendline:${Date.now()}`,
          type: 'trendline',
          start: pendingTrendlineStart,
          end: anchor,
        },
      ]);
      setPendingTrendlineStart(null);
    }
  }, [isMobile, pendingTrendlineStart, resolveAnchorFromPointer, toolMode]);

  const handleMeasurementStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile || toolMode !== 'measure' || !overlayRef.current) {
      return;
    }

    const bounds = overlayRef.current.getBoundingClientRect();
    setMeasurement({
      start: {
        x: clamp(event.clientX - bounds.left, 0, bounds.width),
        y: clamp(event.clientY - bounds.top, 0, bounds.height),
      },
      end: {
        x: clamp(event.clientX - bounds.left, 0, bounds.width),
        y: clamp(event.clientY - bounds.top, 0, bounds.height),
      },
    });
  }, [isMobile, toolMode]);

  const handleMeasurementMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'measure' || !measurement || !overlayRef.current) {
      return;
    }

    const bounds = overlayRef.current.getBoundingClientRect();
    setMeasurement({
      start: measurement.start,
      end: {
        x: clamp(event.clientX - bounds.left, 0, bounds.width),
        y: clamp(event.clientY - bounds.top, 0, bounds.height),
      },
    });
  }, [measurement, toolMode]);

  const handleMeasurementEnd = useCallback(() => {
    if (toolMode === 'measure') {
      setTimeout(() => setMeasurement(null), 1200);
    }
  }, [toolMode]);

  useEffect(() => {
    const chart = mainChartRef.current;
    const candleSeries = mainSeriesRef.current?.candle;
    if (!chart || !candleSeries) {
      setOverlayGeometry({
        bollingerPath: '',
        drawings: [],
        pendingTrendlineMarker: null,
      });
      return;
    }

    const projectedDrawings: RenderedDrawing[] = [];
    for (const drawing of drawings) {
      if (drawing.type === 'horizontal') {
        const y = candleSeries.priceToCoordinate(drawing.price);
        if (y != null) {
          projectedDrawings.push({
            id: drawing.id,
            type: drawing.type,
            coordinates: { y },
          });
        }
        continue;
      }

      const x1 = chart.timeScale().timeToCoordinate(drawing.start.time as unknown as Time);
      const y1 = candleSeries.priceToCoordinate(drawing.start.price);
      const x2 = chart.timeScale().timeToCoordinate(drawing.end.time as unknown as Time);
      const y2 = candleSeries.priceToCoordinate(drawing.end.price);
      if (x1 != null && y1 != null && x2 != null && y2 != null) {
        projectedDrawings.push({
          id: drawing.id,
          type: drawing.type,
          coordinates: { x1, y1, x2, y2 },
        });
      }
    }

    let pendingTrendlineMarker: { x: number; y: number } | null = null;
    if (pendingTrendlineStart) {
      const x = chart.timeScale().timeToCoordinate(pendingTrendlineStart.time as unknown as Time);
      const y = candleSeries.priceToCoordinate(pendingTrendlineStart.price);
      if (x != null && y != null) {
        pendingTrendlineMarker = { x, y };
      }
    }

    setOverlayGeometry({
      bollingerPath: indicatorVisibility.bollinger
        ? buildBollingerPolygonPath(bollingerBands, chart, candleSeries)
        : '',
      drawings: projectedDrawings,
      pendingTrendlineMarker,
    });
  }, [bollingerBands, drawings, indicatorVisibility.bollinger, overlayRevision, pendingTrendlineStart]);

  useEffect(() => {
    const candleSeries = mainSeriesRef.current?.candle;
    if (!measurement || !candleSeries) {
      setMeasurementLabel(null);
      return;
    }

    const startPrice = candleSeries.coordinateToPrice(measurement.start.y);
    const endPrice = candleSeries.coordinateToPrice(measurement.end.y);
    if (startPrice == null || endPrice == null || !Number.isFinite(startPrice) || !Number.isFinite(endPrice)) {
      setMeasurementLabel(null);
      return;
    }

    const delta = endPrice - startPrice;
    const percent = startPrice === 0 ? 0 : (delta / startPrice) * 100;
    setMeasurementLabel(
      `${delta >= 0 ? '+' : ''}${formatNumber(delta, 4)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`,
    );
  }, [measurement, overlayRevision]);

  const mainOverlayHeight = mainChartHeight;

  if (!tokenSell || !tokenBuy) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 px-4 text-center"
        style={{ height: Math.max(320, height) }}
      >
        <BarChart3 className="mb-3 h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">Select a trading pair to view the chart</p>
      </div>
    );
  }

  if (!hasDistinctPair) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 px-4 text-center"
        style={{ height: Math.max(320, height) }}
      >
        <BarChart3 className="mb-3 h-8 w-8 text-amber-500/70" />
        <p className="text-sm text-gray-400">Select two different tokens to view the chart</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {TIME_INTERVALS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                interval === value
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
                  : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([
            ['sma20', 'SMA 20'],
            ['sma50', 'SMA 50'],
            ['bollinger', 'Bollinger'],
            ['rsi', 'RSI'],
            ['macd', 'MACD'],
          ] as Array<[keyof IndicatorVisibilityState, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleIndicatorToggle(key)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                indicatorVisibility[key]
                  ? 'bg-indigo-500/18 text-indigo-300 ring-1 ring-indigo-400/25'
                  : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!isMobile && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['pan', 'Pan / Zoom', Move],
            ['trendline', 'Trendline', TrendingUp],
            ['horizontal', 'Price Level', Minus],
            ['measure', 'Measure', Ruler],
          ] as const).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setPendingTrendlineStart(null);
                setMeasurement(null);
                setToolMode(mode);
              }}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition',
                toolMode === mode
                  ? 'bg-rose-500/18 text-rose-200 ring-1 ring-rose-400/25'
                  : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-[28px] border border-white/[0.06] bg-[#080B12] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="rounded-full bg-white/[0.04] px-2.5 py-1">
              {source === 'backend' ? 'Backend candles' : source === 'rpc' ? 'Live on-chain aggregation' : 'No market data'}
            </span>
            {pendingTrendlineStart && toolMode === 'trendline' && (
              <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-amber-300">
                Select the second point for your trendline
              </span>
            )}
          </div>

          {legend && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
              <span className="font-medium text-white">{legend.timeLabel}</span>
              <span>O {formatNumber(legend.open)}</span>
              <span>H {formatNumber(legend.high)}</span>
              <span>L {formatNumber(legend.low)}</span>
              <span>C {formatNumber(legend.close)}</span>
              <span>V {formatNumber(legend.volume, 2)}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/25 backdrop-blur-sm">
                <div className="flex items-center gap-2.5 text-gray-200">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading market structure...</span>
                </div>
              </div>
            )}

            {!isLoading && data.length === 0 && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#080B12]/90 text-center">
                <BarChart3 className="mb-3 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-300">No trading data available</p>
                <p className="mt-1 text-xs text-gray-500">
                  This market has not produced enough swaps or fills to build a chart yet.
                </p>
              </div>
            )}

            {chartError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#080B12]/90 text-center">
                <BarChart3 className="mb-3 h-8 w-8 text-red-400/70" />
                <p className="text-sm text-gray-200">{chartError}</p>
              </div>
            )}

            <div ref={mainContainerRef} className="w-full overflow-hidden rounded-2xl" />

            <div
              ref={overlayRef}
              className={clsx(
                'absolute inset-0 z-20 rounded-2xl',
                toolMode === 'pan' || isMobile ? 'pointer-events-none' : 'pointer-events-auto',
              )}
              style={{ height: mainOverlayHeight }}
              onClick={handleOverlayClick}
              onMouseDown={handleMeasurementStart}
              onMouseMove={handleMeasurementMove}
              onMouseUp={handleMeasurementEnd}
              onMouseLeave={handleMeasurementEnd}
            >
              <svg className="h-full w-full">
                {indicatorVisibility.bollinger && overlayGeometry.bollingerPath && (
                  <polygon
                    points={overlayGeometry.bollingerPath}
                    fill="rgba(168,85,247,0.10)"
                    stroke="none"
                  />
                )}

                {overlayGeometry.drawings.map((drawing) => (
                  drawing.type === 'horizontal' ? (
                    <line
                      key={drawing.id}
                      x1="0"
                      x2="100%"
                      y1={drawing.coordinates.y}
                      y2={drawing.coordinates.y}
                      stroke="rgba(248,113,113,0.8)"
                      strokeDasharray="6 4"
                      strokeWidth="1.5"
                    />
                  ) : (
                    <line
                      key={drawing.id}
                      x1={drawing.coordinates.x1}
                      y1={drawing.coordinates.y1}
                      x2={drawing.coordinates.x2}
                      y2={drawing.coordinates.y2}
                      stroke="rgba(59,130,246,0.85)"
                      strokeWidth="2"
                    />
                  )
                ))}

                {overlayGeometry.pendingTrendlineMarker && (
                  <circle
                    cx={overlayGeometry.pendingTrendlineMarker.x}
                    cy={overlayGeometry.pendingTrendlineMarker.y}
                    r={5}
                    fill="rgba(96,165,250,0.9)"
                  />
                )}

                {measurement && (
                  <rect
                    x={Math.min(measurement.start.x, measurement.end.x)}
                    y={Math.min(measurement.start.y, measurement.end.y)}
                    width={Math.abs(measurement.end.x - measurement.start.x)}
                    height={Math.abs(measurement.end.y - measurement.start.y)}
                    fill="rgba(34,197,94,0.12)"
                    stroke="rgba(34,197,94,0.7)"
                    strokeDasharray="4 3"
                  />
                )}
              </svg>

              {measurement && measurementLabel && (
                <div
                  className="absolute rounded-full bg-[#111827]/90 px-3 py-1 text-[11px] font-medium text-emerald-200 shadow-lg"
                  style={{
                    left: Math.min(measurement.start.x, measurement.end.x) + 8,
                    top: Math.min(measurement.start.y, measurement.end.y) + 8,
                  }}
                >
                  {measurementLabel}
                </div>
              )}
            </div>
          </div>

          {indicatorVisibility.rsi && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.05]">
              <div className="border-b border-white/[0.05] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                RSI (14)
              </div>
              <div ref={rsiContainerRef} className="w-full" />
            </div>
          )}

          {indicatorVisibility.macd && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.05]">
              <div className="border-b border-white/[0.05] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                MACD (12, 26, 9)
              </div>
              <div ref={macdContainerRef} className="w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
