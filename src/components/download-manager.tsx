'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from './drawer';
import { Icon } from './icon';
import { useToast } from './toast';
import { db, type DownloadTaskEntry } from '@/lib/db';
import {
  clearDownloadChunks,
  runDownloadJob,
  supportsChunkCache,
  type DownloadProgress,
} from '@/lib/m3u8-downloader';
import { loadDownloadSettings, saveDownloadSettings } from '@/lib/download-settings';
import { detectSavingCapability, pickSaveTarget, UserCancelledError } from '@/lib/download-saver';
import { DownloadRuntime } from '@/lib/download-runtime';
import { Switch } from './settings-shared';

/**
 * 全局下载管理器（UI 采用本站 Drawer 模式）：
 * - 入口：header 下载图标 + 播放页「下载本集」（均派发 window 事件）；
 * - 并发：全局最多同时进行 3 个任务，其余排队（waiting）；
 * - 断点：已下载分片写入 Cache Storage（网络层断点）；
 *   保存目标（FS Access / 内存）活不过页面刷新，恢复时由用户点击「继续」重新选择。
 */

const MAX_CONCURRENT_DOWNLOADS = 3;
/** 进度落库节流间隔：整集动辄上千分片，逐片「写库 + 全量查询 + setState」会把长任务页面拖垮 */
const PROGRESS_PERSIST_INTERVAL_MS = 1000;
const ADD_TASK_EVENT = 'libretv:add-download';
const SHOW_MANAGER_EVENT = 'libretv:show-download-manager';
export const DOWNLOADS_UPDATED_EVENT = 'libretv:downloads-updated';

export interface AddDownloadPayload {
  url: string;
  title: string;
  format?: 'TS' | 'MP4';
}

export function DownloadManager({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<DownloadTaskEntry[]>([]);
  const [capability, setCapability] = useState<'fs-access' | 'memory'>('memory');
  const [chunkCache, setChunkCache] = useState(true);
  const [proxy, setProxy] = useState(false);
  const scheduleNextRef = useRef<() => void>(() => {});
  const [runtime] = useState(() => new DownloadRuntime(MAX_CONCURRENT_DOWNLOADS));
  useEffect(
    () => () => {
      void runtime.dispose();
    },
    [runtime]
  );

  const refresh = useCallback(() => {
    void db.downloads
      .orderBy('createdAt')
      .reverse()
      .toArray()
      .then(setTasks)
      .catch(() => toast('无法读取下载记录', 'error'));
  }, [toast]);

  const updateEntry = useCallback(
    async (id: string, patch: Partial<DownloadTaskEntry>) => {
      await db.downloads.update(id, { ...patch, updatedAt: Date.now() });
      refresh();
    },
    [refresh]
  );

  // 下载设置在挂载时读取：抽屉关闭时 header / 播放页也会派发入队事件，
  // 若只在打开抽屉时才读，关闭状态下加入的任务会漏掉用户的中转偏好
  useEffect(() => {
    setProxy(loadDownloadSettings().proxy);
  }, []);

  // —— 任务启动：选目标 → runDownloadJob ——
  const startTask = useCallback(
    async (entry: DownloadTaskEntry) => {
      const handle = runtime.start(entry.id);
      if (!handle) return;
      const { abort, pause, target } = handle;
      try {
        await updateEntry(entry.id, { status: 'downloading' });
      } catch (err) {
        await runtime.cancel(entry.id);
        runtime.finish(entry.id, handle);
        toast(err instanceof Error ? err.message : '无法保存任务状态', 'error');
        return;
      }

      // 进度：UI 走本地 state 实时刷新，落库按固定间隔节流。整集动辄上千分片，
      // 逐片 updateEntry（写库 + 全量查询 + setState）会让页面越下越卡，
      // 极端情况下长任务被浏览器判定为无响应
      let lastPersistAt = 0;
      const onProgress = (p: DownloadProgress) => {
        if (abort.signal.aborted) return;
        const status = pause.getPaused()
          ? 'paused'
          : p.status === 'done'
            ? 'completed'
            : p.status === 'error'
              ? 'error'
              : 'downloading';
        setTasks((prev) =>
          prev.map((t) =>
            t.id === entry.id ? { ...t, finished: p.current, total: p.total, status } : t
          )
        );
        const now = Date.now();
        // 状态切换（完成/失败/处理中）必须立刻持久化，纯进度才节流
        if (p.status === 'downloading' && now - lastPersistAt < PROGRESS_PERSIST_INTERVAL_MS)
          return;
        lastPersistAt = now;
        void db.downloads
          .update(entry.id, {
            finished: p.current,
            total: p.total,
            status,
            updatedAt: now,
          })
          .catch(() => {
            /* Progress persistence is best effort; terminal state writes are awaited. */
          });
      };

      const job = runDownloadJob({
        taskId: entry.id,
        url: entry.url,
        title: entry.title,
        format: entry.format,
        signal: abort.signal,
        pause,
        // 中转开关在任务启动时取当前值：切换只影响之后开始的任务，
        // 已在跑的任务保持原有链路，不会下到一半换源
        proxy,
        onProgress,
        target,
      });

      void job
        .then(async () => {
          if (abort.signal.aborted) return;
          await updateEntry(entry.id, { status: 'completed' });
          void clearDownloadChunks(entry.id);
          toast(`《${entry.title}》下载完成`, 'success');
        })
        .catch(async (err: Error) => {
          await target.abort().catch(() => {});
          if (abort.signal.aborted) return; // 用户取消：状态已在取消处理里写好
          await updateEntry(entry.id, { status: 'error' });
          toast(`《${entry.title}》下载失败：${err.message}`, 'error');
        })
        .finally(() => {
          runtime.finish(entry.id, handle);
          scheduleNextRef.current();
        })
        .catch(() => toast('无法保存下载结果，请重试', 'error'));
    },
    [toast, updateEntry, proxy, runtime]
  );

  // —— 全局并发调度 ——
  const scheduleNext = useCallback(() => {
    void (async () => {
      if (runtime.size >= MAX_CONCURRENT_DOWNLOADS) return;
      const all = await db.downloads.orderBy('createdAt').toArray();
      for (const entry of all) {
        if (runtime.get(entry.id)) continue;
        if (entry.status === 'downloading') {
          await updateEntry(entry.id, { status: 'paused' });
          continue;
        }
        if (entry.status !== 'waiting') continue;
        if (!runtime.hasTarget(entry.id)) {
          // File handles cannot survive page reloads; ask for a new destination before starting.
          await updateEntry(entry.id, { status: 'paused' });
          continue;
        }
        if (runtime.size >= MAX_CONCURRENT_DOWNLOADS) break;
        void startTask(entry);
      }
    })().catch((err: unknown) =>
      toast(err instanceof Error ? err.message : '下载队列读取失败', 'error')
    );
  }, [toast, startTask, runtime, updateEntry]);
  scheduleNextRef.current = scheduleNext;

  // —— 事件：新增任务（用户手势内触发，可安全弹文件选择器） ——
  // 监听器必须常驻：播放页「下载本集」在抽屉关闭时也会派发事件，
  // 若仅 isOpen 时注册，事件会凭空丢失——toast 提示了入队，实际什么都没发生
  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent<AddDownloadPayload>).detail;
      if (!detail?.url || !detail?.title) return;
      void (async () => {
        const format = detail.format ?? 'MP4';
        const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const entry: DownloadTaskEntry = {
          id,
          url: detail.url,
          title: detail.title,
          format,
          status: 'waiting',
          finished: 0,
          total: 0,
          errorNum: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        // 用户手势内预选保存目标（FS Access 弹窗必须在手势内）
        try {
          const target = await pickSaveTarget(`${detail.title}.${format.toLowerCase()}`);
          await runtime.prepare(id, target);
        } catch (err) {
          toast(err instanceof UserCancelledError ? '已取消下载' : '无法选择保存位置', 'info');
          return;
        }
        try {
          await db.downloads.put(entry);
        } catch (err) {
          await runtime.cancel(id);
          throw err;
        }
        refresh();
        scheduleNext();
        toast(`《${detail.title}》已加入下载队列`, 'success');
      })().catch((err: unknown) =>
        toast(err instanceof Error ? err.message : '下载任务创建失败', 'error')
      );
    };

    window.addEventListener(ADD_TASK_EVENT, onAdd);
    return () => {
      window.removeEventListener(ADD_TASK_EVENT, onAdd);
    };
  }, [refresh, scheduleNext, toast, runtime]);

  // 抽屉打开时：刷新保存能力与任务列表，并启动排队中的任务
  useEffect(() => {
    if (!isOpen) return;
    setCapability(detectSavingCapability());
    setChunkCache(supportsChunkCache());
    // 顺带重读下载设置：多标签页下另一处改了开关也能同步过来
    setProxy(loadDownloadSettings().proxy);
    refresh();
    scheduleNext();
  }, [isOpen, refresh, scheduleNext]);

  const onToggleProxy = (next: boolean) => {
    // 以落库结果为准回写 state：存储不可用（隐私模式）时 UI 不能假装已保存
    setProxy(saveDownloadSettings({ proxy: next }).proxy);
    toast(next ? '已开启下载中转，新任务经服务器转发' : '已关闭下载中转，新任务直连源站', 'info');
  };

  const onPauseResume = async (entry: DownloadTaskEntry) => {
    const handle = runtime.get(entry.id);
    if (handle && entry.status === 'downloading') {
      handle.pause.pause();
      await updateEntry(entry.id, { status: 'paused' });
      return;
    }
    if (handle && entry.status === 'paused') {
      handle.pause.resume();
      await updateEntry(entry.id, { status: 'downloading' });
      return;
    }
    if (handle) return;
    if (
      entry.status === 'paused' ||
      entry.status === 'waiting' ||
      entry.status === 'error' ||
      entry.status === 'downloading'
    ) {
      try {
        const target = await pickSaveTarget(`${entry.title}.${entry.format.toLowerCase()}`);
        await runtime.prepare(entry.id, target);
        await updateEntry(entry.id, { status: 'waiting' });
        scheduleNext();
      } catch (err) {
        await runtime.cancel(entry.id);
        toast(err instanceof UserCancelledError ? '已取消' : '恢复下载失败，请重试', 'info');
      }
    }
  };

  const onCancel = async (entry: DownloadTaskEntry) => {
    await runtime.cancel(entry.id);
    await clearDownloadChunks(entry.id);
    await db.downloads.delete(entry.id);
    refresh();
    scheduleNext();
    toast(`《${entry.title}》已移除下载任务`, 'info');
  };

  const statusLabel: Record<DownloadTaskEntry['status'], string> = {
    waiting: '排队中',
    downloading: '下载中',
    paused: '已暂停',
    completed: '已完成',
    error: '失败',
  };

  return (
    <Drawer open={isOpen} onClose={onClose} title="下载管理" width="max-w-lg">
      <div className="space-y-3">
        <div className="card p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-content">经服务器中转下载</p>
            <p className="text-xs text-faint">
              直连被跨域 / 防盗链 / 混合内容拦下时开启：整集流量（含分片与密钥）经服务器转发，
              带宽由部署者承担。仅对之后开始的任务生效。
            </p>
          </div>
          <Switch checked={proxy} onChange={onToggleProxy} label="经服务器中转下载" />
        </div>
        <p className="text-xs text-faint">
          保存能力：
          {capability === 'fs-access' ? '磁盘直写（边下边存）' : '内存聚合（完成后浏览器下载）'}
          {chunkCache ? ' · 支持断点续传' : ' · 当前环境无断点缓存（需 HTTPS 访问）'} · 同时进行{' '}
          {Math.min(runtime.size, MAX_CONCURRENT_DOWNLOADS)}/{MAX_CONCURRENT_DOWNLOADS} 个任务
        </p>
        {tasks.length === 0 && (
          <div className="py-10 text-center text-sm text-faint">
            暂无下载任务。在播放页点击「下载本集」开始。
          </div>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-content truncate">{t.title}</p>
                <p className="text-xs text-faint">
                  {t.format.toUpperCase()} · {statusLabel[t.status]}
                  {t.status === 'downloading' && t.total > 0
                    ? ` · ${t.finished}/${t.total} 分片`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {t.status === 'downloading' && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-chip hover:bg-hover text-xs text-content transition-colors"
                    onClick={() =>
                      void onPauseResume(t).catch(() => toast('无法更新下载状态，请重试', 'error'))
                    }
                  >
                    暂停
                  </button>
                )}
                {(t.status === 'paused' || t.status === 'waiting' || t.status === 'error') && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-chip hover:bg-hover text-xs text-content transition-colors"
                    onClick={() =>
                      void onPauseResume(t).catch(() => toast('无法更新下载状态，请重试', 'error'))
                    }
                  >
                    继续
                  </button>
                )}
                <button
                  type="button"
                  aria-label="删除下载任务"
                  className="p-1.5 rounded bg-chip hover:bg-hover text-content transition-colors"
                  onClick={() =>
                    void onCancel(t).catch(() => toast('无法移除下载任务，请重试', 'error'))
                  }
                >
                  <Icon name="close" className="w-4 h-4" />
                </button>
              </div>
            </div>
            {(t.status === 'downloading' || t.status === 'paused' || t.status === 'completed') &&
              t.total > 0 && (
                <div className="h-1.5 rounded-full bg-chip overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${t.total > 0 ? Math.min(100, Math.round((t.finished / t.total) * 100)) : 0}%`,
                    }}
                  />
                </div>
              )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/** 播放页等处调用：把一集加入下载队列（必须在用户手势内调用） */
export function enqueueDownload(payload: AddDownloadPayload): void {
  window.dispatchEvent(new CustomEvent(ADD_TASK_EVENT, { detail: payload }));
}

/** header 等处调用：打开下载管理器 */
export function requestShowDownloadManager(): void {
  window.dispatchEvent(new CustomEvent(SHOW_MANAGER_EVENT));
}

/** 全局挂载点：根布局渲染一次，监听打开事件 */
export function GlobalDownloadManager() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onShow = () => setOpen(true);
    window.addEventListener(SHOW_MANAGER_EVENT, onShow);
    return () => window.removeEventListener(SHOW_MANAGER_EVENT, onShow);
  }, []);
  return <DownloadManager isOpen={open} onClose={() => setOpen(false)} />;
}
