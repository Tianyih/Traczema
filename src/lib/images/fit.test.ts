import { describe, expect, it } from 'vitest';
import { fitWithin } from './fit';

describe('fitWithin', () => {
  it('downscales the long edge to the max and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('extreme aspect ratios stay at least 1px; invalid sizes degrade safely', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
    expect(fitWithin(0, 100, 1600)).toEqual({ width: 1, height: 1 });
  });
});
