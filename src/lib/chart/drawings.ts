export interface ChartAnchorPoint {
  time: number;
  price: number;
}

export interface TrendlineDrawing {
  id: string;
  type: 'trendline';
  start: ChartAnchorPoint;
  end: ChartAnchorPoint;
}

export interface HorizontalLevelDrawing {
  id: string;
  type: 'horizontal';
  price: number;
}

export type PersistedChartDrawing = TrendlineDrawing | HorizontalLevelDrawing;

const STORAGE_PREFIX = 'fueki:chart-drawings';

function getStorageKey(scopeKey: string): string {
  return `${STORAGE_PREFIX}:${scopeKey}`;
}

export function loadChartDrawings(scopeKey: string): PersistedChartDrawing[] {
  try {
    const raw = localStorage.getItem(getStorageKey(scopeKey));
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is PersistedChartDrawing => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const candidate = entry as Partial<PersistedChartDrawing>;
      if (candidate.type === 'horizontal') {
        return typeof candidate.id === 'string' && typeof candidate.price === 'number';
      }

      if (candidate.type === 'trendline') {
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.start?.time === 'number' &&
          typeof candidate.start?.price === 'number' &&
          typeof candidate.end?.time === 'number' &&
          typeof candidate.end?.price === 'number'
        );
      }

      return false;
    });
  } catch {
    return [];
  }
}

export function saveChartDrawings(
  scopeKey: string,
  drawings: PersistedChartDrawing[],
): void {
  try {
    localStorage.setItem(getStorageKey(scopeKey), JSON.stringify(drawings));
  } catch {
    // Storage is best-effort for chart annotations.
  }
}
