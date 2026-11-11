import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveCache, setLiveCache } from './live-cache';
afterEach(() => vi.useRealTimers());
describe('bounded live cache', () => {
  it('expires precisely at TTL and refuses individually oversized values', () => {
    vi.useFakeTimers();
    setLiveCache('ttl', 'value', 1000);
    vi.advanceTimersByTime(1000);
    expect(getLiveCache('ttl')).toBeUndefined();
    setLiveCache('huge', 'value', 1000, 257 * 1024 * 1024);
    expect(getLiveCache('huge')).toBeUndefined();
  });
  it('does not evict another entry when replacing an existing key at capacity', () => {
    for (let i = 0; i < 10; i++) setLiveCache(`entry-${i}`, i, 60_000);
    setLiveCache('entry-9', 'updated', 60_000);
    expect(getLiveCache('entry-0')).toBe(0);
    expect(getLiveCache('entry-9')).toBe('updated');
  });
});
