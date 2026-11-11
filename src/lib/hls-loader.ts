import type HlsType from 'hls.js';
import type { HlsConfig } from 'hls.js';
import { stripAdGroups } from './m3u8';
import { buildSegmentCacheKey, readCachedSegment, touchMeta } from './video-cache';

/**
 * hls.js loader 工厂：在同一个 loader 里组合「广告过滤」与「片段缓存命中」。
 *
 * - manifest / level：走基类网络加载；blockAd 开启时在 onSuccess 里剔除
 *   片头插入的广告段（整段移除，保留 DISCONTINUITY 时间轴标记）；
 * - fragment：cache-first——本地缓存命中直接合成响应（不回源），未命中走基类。
 *   BYTERANGE 分片（原文件切片）不缓存、直接回源。
 *
 * 关键细节：缓存命中时用预取阶段记录的**真实耗时**（costMs）合成 hls.js 的
 * loader stats——如果让加载时长为 0，ABR 会把它当成无限带宽，错误地拉高码率。
 *
 * hls.js 对每次请求都会 new 一个 loader 实例，因此实例上的 destroyed 标记
 * 生命周期安全（abort/destroy 后不再回调，防孤儿 onSuccess）。
 */
interface LoaderOptions {
  blockAd?: boolean;
  /** 缓存命中探针（设置面板展示命中率用），可缺省 */
  onProbe?: (hit: boolean) => void;
}

type HlsLoaderCtor = HlsConfig['loader'];

export function createHlsLoader(
  HlsCtor: typeof HlsType,
  options: LoaderOptions = {}
): HlsLoaderCtor {
  const { blockAd = false, onProbe } = options;

  return class CacheFirstHlsLoader extends (HlsCtor.DefaultConfig.loader as HlsLoaderCtor) {
    private destroyed = false;

    constructor(config: HlsConfig) {
      super(config);
      const load = this.load.bind(this);

      this.load = (context, config, callbacks) => {
        const isPlaylist =
          'type' in context && (context.type === 'manifest' || context.type === 'level');

        // —— 播放列表：网络加载 + 可选广告过滤 ——
        if (isPlaylist) {
          if (blockAd) {
            const onSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
              if (response.data && typeof response.data === 'string') {
                response.data = stripAdGroups(response.data);
              }
              onSuccess(response, stats, ctx, networkDetails);
            };
          }
          load(context, config, callbacks);
          return;
        }

        // —— BYTERANGE 分片：整文件切片，无法独立缓存，直接回源 ——
        if (context.rangeStart || context.rangeEnd) {
          load(context, config, callbacks);
          return;
        }

        // —— 片段：cache-first ——
        const key = buildSegmentCacheKey(context.url);
        readCachedSegment(key).then((hit) => {
          if (this.destroyed) return;
          if (hit) {
            void touchMeta(key);
            onProbe?.(true);
            const now = performance.now();
            Object.assign(this.stats, {
              loading: { start: now - hit.costMs, first: now - hit.costMs + 1, end: now },
              total: hit.data.byteLength,
              loaded: hit.data.byteLength,
            });
            callbacks.onSuccess({ url: context.url, data: hit.data }, this.stats, context, null);
            return;
          }
          onProbe?.(false);

          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
            if (!this.destroyed) onSuccess(response, stats, ctx, networkDetails);
          };
          load(context, config, callbacks);
        });
      };
    }

    abort(): void {
      this.destroyed = true;
      super.abort();
    }

    destroy(): void {
      this.destroyed = true;
      super.destroy?.();
    }
  };
}
