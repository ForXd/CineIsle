'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Theme, defineTheme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from './theme';

/** Astryx owns control styling; the cinema layout keeps its existing geometry. */
const cinemaTheme = defineTheme({
  name: 'libretv',
  extends: neutralTheme,
  tokens: {
    '--color-accent': ['#265b48', '#00b8e6'],
    '--color-accent-muted': ['#265b481a', '#00b8e61a'],
    '--color-background-body': ['#f6f8f7', '#0b101a'],
    '--color-background-surface': ['#ffffff', '#141c29'],
    '--color-text-primary': ['#19231f', '#e6f2ff'],
    '--color-text-secondary': ['#596861', '#8599b2'],
    '--font-family-body':
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    '--font-family-heading':
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
});

export function DesignSystemProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  return (
    <Theme theme={cinemaTheme} mode={resolved}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
