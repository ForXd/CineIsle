'use client';

import { useAuth } from '@/components/auth';

/** 独立项目的源码入口；来源署名不参与更新检测或版本发布。 */
export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-line py-4">
      <p className="text-center text-xs text-faint">
        <a
          href="https://github.com/ForXd/CineIsle"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent"
        >
          映屿 CineIsle{version ? ` v${version}` : ''}
        </a>
        {' · 代码来源于 '}
        <a
          href="https://github.com/LibreSpark/LibreTV"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent"
        >
          LibreTV
        </a>
        {' · AGPL-3.0-or-later'}
      </p>
    </footer>
  );
}
