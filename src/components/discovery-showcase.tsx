'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAppStore, resolveSource } from '@/lib/store';
import { buildWatchUrl, formatTime } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

/** Real recommendations and local playback progress share the discovery stage. */
export function DiscoveryShowcase({
  items,
  onPick,
}: {
  items: DoubanItem[];
  onPick: (title: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const mode = useAppStore((s) => s.imageProxyMode);
  const ratingSource = useAppStore((s) => (s.recommendSource === 'bangumi' ? 'Bangumi' : '豆瓣'));
  const customProxy = useAppStore((s) => s.customImageProxy);
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(3).toArray());
  const featured = items.slice(0, 5);
  const current = featured[selected % Math.max(featured.length, 1)];

  return (
    <div className="discovery-stage">
      <section className="feature-film" aria-label="精选推荐">
        {current && (
          <SmartImage
            key={current.cover}
            url={current.cover}
            mode={mode}
            customProxy={customProxy}
            alt=""
            loading="eager"
            className="feature-art"
          />
        )}
        <div className="feature-shade" />
        <div className="feature-topline">
          <span>LIBRETV 精选</span>
          <span>为好故事留一点时间</span>
        </div>
        <div className="feature-copy" key={current?.id ?? 'empty'}>
          <p className="feature-eyebrow">{current ? '今日精选' : '你的私人放映时光'}</p>
          <h1>{current?.title || '下一段好故事，\n从这里开始。'}</h1>
          <p className="feature-meta">
            {current?.rating ? `${ratingSource} ${current.rating} 分 · ` : ''}
            {current ? '发现值得一看的作品' : '搜索喜欢的电影与剧集，找到属于你的片刻。'}
          </p>
          <Button
            label={current ? '查找片源' : '探索影片'}
            className="feature-action"
            icon={<Icon name="search" className="w-4 h-4" />}
            endContent={
              <span className="feature-arrow" aria-hidden>
                ↗
              </span>
            }
            onClick={() =>
              current
                ? onPick(current.title)
                : document.querySelector<HTMLInputElement>('input[aria-label="搜索影片"]')?.focus()
            }
          />
        </div>
        {featured.length > 1 && (
          <fieldset className="feature-pagination" aria-label="切换精选影片">
            {featured.map((item, i) => (
              <button
                type="button"
                key={item.id}
                aria-label={`精选 ${i + 1}：${item.title}`}
                aria-pressed={current?.id === item.id}
                onClick={() => setSelected(i)}
              />
            ))}
          </fieldset>
        )}
      </section>
      <aside className="watch-sidebar" aria-label={history?.length ? '继续观看' : '值得一看'}>
        <div className="section-heading">
          <h2>{history?.length ? '继续观看' : '值得一看'}</h2>
          <Icon name="clock" className="w-4 h-4 text-muted" />
        </div>
        {history?.length
          ? history.map((item) => {
              const source = resolveSource({ customAPIs, envSources }, item.sourceKey);
              const progress =
                item.duration > 0
                  ? Math.min(100, Math.max(0, (item.playbackPosition / item.duration) * 100))
                  : 0;
              return (
                <Link
                  key={item.id}
                  className="watch-row"
                  href={buildWatchUrl({
                    sourceKey: item.sourceKey,
                    vodId: item.vodId,
                    index: item.episodeIndex,
                    title: item.title,
                    sourceUrl: source?.url || item.sourceUrl,
                    detail: source?.detail,
                  })}
                >
                  <div className="watch-cover">
                    <SmartImage url={item.pic} mode={mode} customProxy={customProxy} alt="" />
                    <span className="mini-play" aria-hidden>
                      ▷
                    </span>
                    <span className="watch-progress" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="watch-copy">
                    <h3>{item.title}</h3>
                    <span className="watch-tag">第 {item.episodeIndex + 1} 集</span>
                    <p>已观看 {formatTime(item.playbackPosition)}</p>
                  </div>
                </Link>
              );
            })
          : items.slice(1, 4).map((item, i) => (
              <button
                type="button"
                key={item.id}
                className="watch-row"
                onClick={() => onPick(item.title)}
              >
                <div className="watch-cover">
                  <SmartImage url={item.cover} mode={mode} customProxy={customProxy} alt="" />
                  <span className="mini-play" aria-hidden>
                    ↗
                  </span>
                </div>
                <div className="watch-copy">
                  <h3>{item.title}</h3>
                  <span className="watch-tag">精选 {String(i + 1).padStart(2, '0')}</span>
                  <p>{item.rating ? `☆ ${item.rating} ${ratingSource}评分` : '发现更多好故事'}</p>
                </div>
              </button>
            ))}
        {!history?.length && items.length === 0 && (
          <div className="watch-empty">
            <Icon name="clock" className="w-8 h-8" />
            <h3>好故事，随时继续</h3>
            <p>开始播放后，最近观看的影片会出现在这里。</p>
          </div>
        )}
      </aside>
    </div>
  );
}
