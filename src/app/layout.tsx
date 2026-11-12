import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: '映屿 CineIsle - 免费在线视频搜索与观看平台',
    template: '%s - 映屿 CineIsle',
  },
  description:
    '映屿 CineIsle 是一个免费的在线视频搜索平台，无广告、安全，提供来自多个视频源的内容搜索与观看服务，无需注册即可使用。',
  manifest: '/manifest.webmanifest',
  // CineIsle 独立品牌图标，包含 PWA 与浏览器所需尺寸。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/cineisle.ico', sizes: '48x48' },
      { url: '/icons/cineisle-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/cineisle-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/cineisle-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/cineisle-apple-touch.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#14110e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁 */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static theme bootstrap contains no user input.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('libretv-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
