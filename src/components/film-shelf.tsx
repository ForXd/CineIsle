'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';

/** A horizontal shelf preserves every result, including touch and keyboard access. */
export function FilmShelf({
  title,
  items,
  onPick,
}: {
  title: string;
  items: DoubanItem[];
  onPick: (title: string) => void;
}) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  useEffect(() => {
    const node = rail.current;
    if (!node || items.length === 0) return;
    const update = () => {
      setAtStart(node.scrollLeft < 2);
      setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 2);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', update);
    };
  }, [items]);
  const move = (direction: number) => {
    const node = rail.current;
    if (!node) return;
    node.scrollBy({
      left: direction * node.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  if (!items.length) return null;
  return (
    <section className="film-shelf" aria-labelledby={`${id}-title`}>
      <div className="section-heading collection-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <div className="collection-tools">
          <button
            type="button"
            className="shelf-arrow"
            aria-label={`${title}：上一页`}
            aria-controls={id}
            disabled={atStart}
            onClick={() => move(-1)}
          >
            <CaretLeft size={17} weight="fill" />
          </button>
          <button
            type="button"
            className="shelf-arrow"
            disabled={atEnd}
            aria-label={`${title}：下一页`}
            aria-controls={id}
            onClick={() => move(1)}
          >
            <CaretRight size={17} weight="fill" />
          </button>
        </div>
      </div>
      <div id={id} ref={rail} className="poster-shelf">
        {items.map((item) => (
          <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
        ))}
      </div>
    </section>
  );
}
