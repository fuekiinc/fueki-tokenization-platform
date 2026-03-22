import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadChartDrawings,
  saveChartDrawings,
} from '../../src/lib/chart/drawings';

describe('chart drawings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips persisted trendlines and horizontal levels', () => {
    saveChartDrawings('pair:421614:a:b', [
      {
        id: 'trend-1',
        type: 'trendline',
        start: { time: 1_700_000_000, price: 100 },
        end: { time: 1_700_000_600, price: 120 },
      },
      {
        id: 'level-1',
        type: 'horizontal',
        price: 115,
      },
    ]);

    expect(loadChartDrawings('pair:421614:a:b')).toEqual([
      {
        id: 'trend-1',
        type: 'trendline',
        start: { time: 1_700_000_000, price: 100 },
        end: { time: 1_700_000_600, price: 120 },
      },
      {
        id: 'level-1',
        type: 'horizontal',
        price: 115,
      },
    ]);
  });

  it('ignores malformed drawing payloads', () => {
    localStorage.setItem(
      'fueki:chart-drawings:pair:421614:a:b',
      JSON.stringify([{ nope: true }, { id: 'bad', type: 'horizontal', price: '123' }]),
    );

    expect(loadChartDrawings('pair:421614:a:b')).toEqual([]);
  });
});
