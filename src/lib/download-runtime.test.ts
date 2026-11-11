import { describe, expect, it, vi } from 'vitest';
import { DownloadRuntime } from './download-runtime';
import type { SaveTarget } from './download-saver';

const target = (): SaveTarget => ({
  kind: 'memory',
  write: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  abort: vi.fn(async () => {}),
});

describe('download task ownership', () => {
  it('keeps separate output handles and reserves slots synchronously', async () => {
    const runtime = new DownloadRuntime(2);
    const a = target(),
      b = target(),
      c = target();
    await runtime.prepare('a', a);
    await runtime.prepare('b', b);
    await runtime.prepare('c', c);
    expect(runtime.start('a')?.target).toBe(a);
    expect(runtime.start('b')?.target).toBe(b);
    expect(runtime.start('a')).toBeUndefined();
    expect(runtime.start('c')).toBeUndefined();
    expect(runtime.hasTarget('c')).toBe(true);
    await runtime.dispose();
  });
  it('resumes the same paused task and writer without requesting another target', async () => {
    const runtime = new DownloadRuntime();
    const file = target();
    await runtime.prepare('a', file);
    const job = runtime.start('a');
    if (!job) throw new Error('Missing job');
    job.pause.pause();
    const wait = job.pause.waitIfPaused(job.abort.signal);
    job.pause.resume();
    await wait;
    expect(runtime.get('a')?.target).toBe(file);
    expect(file.abort).not.toHaveBeenCalled();
    await runtime.dispose();
  });
  it('cancels paused and queued tasks and does not release slots before workers finish', async () => {
    const runtime = new DownloadRuntime(1);
    const file = target(),
      queued = target();
    await runtime.prepare('a', file);
    await runtime.prepare('b', queued);
    const job = runtime.start('a');
    if (!job) throw new Error('Missing job');
    job.pause.pause();
    const wait = job.pause.waitIfPaused(job.abort.signal);
    const rejected = expect(wait).rejects.toMatchObject({ name: 'AbortError' });
    await runtime.cancel('a');
    await rejected;
    expect(runtime.start('b')).toBeUndefined();
    runtime.finish('a', job);
    expect(runtime.start('b')?.target).toBe(queued);
    await runtime.dispose();
    expect(file.abort).toHaveBeenCalledOnce();
    expect(queued.abort).toHaveBeenCalledOnce();
  });
  it('rejects restored tasks without a valid handle and releases replaced pending handles', async () => {
    const runtime = new DownloadRuntime();
    expect(runtime.start('restored')).toBeUndefined();
    const old = target(),
      fresh = target();
    await runtime.prepare('a', old);
    await runtime.prepare('a', fresh);
    expect(old.abort).toHaveBeenCalledOnce();
    expect(runtime.start('a')?.target).toBe(fresh);
    await runtime.dispose();
  });
});
