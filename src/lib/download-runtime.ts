import type { SaveTarget } from './download-saver';
import { PauseResumeController } from './m3u8-downloader';

interface RunningDownload {
  abort: AbortController;
  pause: PauseResumeController;
  target: SaveTarget;
}

/** Owns per-task file handles and atomically reserves download slots across async scheduling. */
export class DownloadRuntime {
  private readonly targets = new Map<string, SaveTarget>();
  private readonly active = new Map<string, RunningDownload>();

  constructor(private readonly limit = 3) {}

  get size(): number {
    return this.active.size;
  }

  get(id: string): RunningDownload | undefined {
    return this.active.get(id);
  }

  hasTarget(id: string): boolean {
    return this.targets.has(id);
  }

  async prepare(id: string, target: SaveTarget): Promise<void> {
    const previous = this.targets.get(id);
    this.targets.set(id, target);
    if (previous && previous !== target) await previous.abort();
  }

  start(id: string): RunningDownload | undefined {
    if (this.active.has(id) || this.active.size >= this.limit) return undefined;
    const target = this.targets.get(id);
    if (!target) return undefined;
    this.targets.delete(id);
    const handle = { abort: new AbortController(), pause: new PauseResumeController(), target };
    this.active.set(id, handle);
    return handle;
  }

  finish(id: string, handle: RunningDownload): void {
    // A late finalizer must never remove a newer attempt for the same task.
    if (this.active.get(id) === handle) this.active.delete(id);
  }

  async cancel(id: string): Promise<void> {
    const handle = this.active.get(id);
    if (handle) {
      handle.abort.abort();
      handle.pause.destroy();
      // Keep the slot reserved until the old worker settles.
      await handle.target.abort().catch(() => {});
    }
    const pending = this.targets.get(id);
    this.targets.delete(id);
    if (pending) await pending.abort().catch(() => {});
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...new Set([...this.active.keys(), ...this.targets.keys()])].map((id) => this.cancel(id))
    );
  }
}
