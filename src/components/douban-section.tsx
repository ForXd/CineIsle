'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';
import { DiscoveryShowcase } from './discovery-showcase';

const MOVIE_TAGS = [
  '热门',
  '最新',
  '经典',
  '豆瓣高分',
  '冷门佳片',
  '华语',
  '欧美',
  '韩国',
  '日本',
  '动画',
];
const TV_TAGS = [
  '热门',
  '美剧',
  '英剧',
  '韩剧',
  '日剧',
  '国产剧',
  '港剧',
  '日本动画',
  '综艺',
  '纪录片',
];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 首页推荐区：数据源由设置决定（豆瓣热门 / Bangumi 新番放送 / 影视热榜），二选一展示 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);

  if (!doubanEnabled) return <DiscoveryShowcase items={[]} onPick={onPick} />;
  if (recommendSource === 'bangumi') return <BangumiView onPick={onPick} />;
  if (recommendSource === 'hot-list') return <HotListView onPick={onPick} />;
  return <DoubanView onPick={onPick} />;
}

/**
 * 豆瓣推荐：影视切换 + 标签筛选。
 * 一次性渲染全部条目：数据本就一次拉全（50 条），卡片图片又是 lazy 加载，
 * 视口外的图不会请求，因此不需要「加载更多」这类本地切片分页来打断浏览。
 */
function DoubanView({ onPick }: { onPick: (title: string) => void }) {
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [tag, setTag] = useState('热门');

  const query = useQuery({
    queryKey: ['douban', type, tag],
    queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
  });

  const tags = type === 'movie' ? MOVIE_TAGS : TV_TAGS;
  const items = query.data?.items ?? [];

  const switchType = (t: 'movie' | 'tv') => {
    if (t === type) return;
    setType(t);
    setTag('热门');
  };

  return (
    <section aria-label="影视推荐" className="discovery-section">
      <DiscoveryShowcase items={items} onPick={onPick} />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-chip rounded-lg p-0.5">
            <TypeButton active={type === 'movie'} onClick={() => switchType('movie')}>
              电影
            </TypeButton>
            <TypeButton active={type === 'tv'} onClick={() => switchType('tv')}>
              剧集
            </TypeButton>
          </div>
        </div>
      </div>

      <div className="discovery-filters">
        {tags.map((t) => (
          <ToggleButton
            key={t}
            label={t}
            className="discovery-chip"
            isPressed={t === tag}
            onPressedChange={() => setTag(t)}
          />
        ))}
      </div>

      <div className="section-heading collection-heading">
        <div>
          <h2>发现好故事</h2>
        </div>
        <span className="collection-count">
          {items.length > 0 ? `${items.length} 部精选作品` : '电影 · 剧集 · 生活的另一面'}
        </span>
      </div>
      {query.isError ? (
        <div className="recommend-empty">
          <p>暂时无法加载推荐内容</p>
          <span>可以重试，或通过顶部搜索寻找影片。</span>
          <Button label="重新加载" clickAction={() => query.refetch().then(() => {})} />
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-8">该分类暂无推荐内容</p>
      ) : (
        <div className="poster-grid">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Bangumi 每日放送：星期筛选，一次拉全量无分页 */
function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });

  let items: DoubanItem[] = [];
  if (query.data) {
    items =
      weekday === 'all'
        ? query.data.days.flatMap((d) => d.items)
        : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  }

  return (
    <section aria-label="新番放送推荐" className="discovery-section">
      <DiscoveryShowcase items={items} onPick={onPick} />
      <div className="discovery-filters">
        <ChipButton active={weekday === 'all'} onClick={() => setWeekday('all')}>
          全部
        </ChipButton>
        {WEEKDAYS.map((name, i) => (
          <ChipButton key={name} active={weekday === i + 1} onClick={() => setWeekday(i + 1)}>
            {name}
          </ChipButton>
        ))}
      </div>

      <div className="section-heading collection-heading">
        <div>
          <h2>发现好故事</h2>
        </div>
        <span className="collection-count">
          {items.length > 0 ? `${items.length} 部精选作品` : '电影 · 剧集 · 生活的另一面'}
        </span>
      </div>
      {query.isError ? (
        <div className="recommend-empty">
          <p>暂时无法加载推荐内容</p>
          <span>可以重试，或通过顶部搜索寻找影片。</span>
          <Button label="重新加载" clickAction={() => query.refetch().then(() => {})} />
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="poster-grid">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

/** 影视热榜（60s API）：豆瓣五个周榜 + 百度热播剧，chips 切换 */
function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="影视榜单推荐" className="discovery-section">
      <DiscoveryShowcase items={items} onPick={onPick} />
      <div className="discovery-filters">
        {HOT_LISTS.map((l) => (
          <ChipButton key={l.id} active={listId === l.id} onClick={() => setListId(l.id)}>
            {l.label}
          </ChipButton>
        ))}
      </div>

      <div className="section-heading collection-heading">
        <div>
          <h2>发现好故事</h2>
        </div>
        <span className="collection-count">
          {items.length > 0 ? `${items.length} 部精选作品` : '电影 · 剧集 · 生活的另一面'}
        </span>
      </div>
      {query.isError ? (
        <div className="recommend-empty">
          <p>暂时无法加载推荐内容</p>
          <span>可以重试，或通过顶部搜索寻找影片。</span>
          <Button label="重新加载" clickAction={() => query.refetch().then(() => {})} />
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="poster-grid">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="poster-grid">
      {Array.from({ length: 16 }, (_, index) => `skeleton-${index}`).map((id) => (
        <div key={id}>
          <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <ToggleButton
      label={children}
      className="discovery-chip"
      isPressed={active}
      onPressedChange={onClick}
    />
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return <ToggleButton label={children} isPressed={active} onPressedChange={onClick} />;
}
