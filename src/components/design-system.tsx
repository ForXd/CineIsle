'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Theme, defineTheme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from './theme';

/** Astryx owns control styling; the cinema layout keeps its existing geometry. */
const cinemaTheme = defineTheme({
  name: 'cineisle',
  extends: neutralTheme,
  tokens: {
    '--color-accent': ['#265b48', '#e8dac0'],
    '--color-accent-muted': ['#265b481a', '#e8dac01a'],
    '--color-background-body': ['#f6f8f7', '#0d0c0a'],
    '--color-background-surface': ['#ffffff', '#171512'],
    '--color-text-primary': ['#19231f', '#f6f4ef'],
    '--color-text-secondary': ['#596861', '#b9b5ad'],
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
