# LibreTV · ForXd

独立维护的影视发现、聚合搜索与播放项目。界面采用 Astryx 设计系统，支持桌面与移动端、明暗主题、影片推荐、观看历史和直播。

本仓库不是 GitHub Fork，使用独立的提交历史、版本和发布流程，不自动同步上游。

## 来源与许可证

本项目的代码基础来源于 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)，在此基础上进行了界面重设计、工具链升级和代码修复。感谢 LibreTV 原作者和贡献者。本项目由 ForXd 独立维护，不代表 LibreTV 官方发布。

保留原作者版权声明，并遵循 [AGPL-3.0-or-later](LICENSE)。独立仓库不改变已有代码的许可证义务。设计系统来自 [Meta Astryx](https://github.com/meta/astryx)，第三方依赖遵循各自许可证。

## 本地运行

环境：Node.js **24**、pnpm **12**。精确依赖版本记录在 `package.json` 和 `pnpm-lock.yaml`。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
# 编辑 .env.local，设置 PASSWORD
pnpm check
pnpm format:check
pnpm build
pnpm start
```

访问 [http://localhost:8080](http://localhost:8080)，使用配置的密码登录。无需 Docker。开发时运行 `pnpm dev`。

安装后在页面右上角“设置”中添加自己的点播源或直播订阅；项目不预置视频源，也不存储视频文件。

## 功能

- 影片发现：大幅精选海报、分类筛选、推荐列表、观看历史续播。
- 聚合搜索：跨源同名影片合并、画质探测和来源测速。
- 视频播放：ArtPlayer + hls.js，支持进度恢复、跳过片段、连播、快捷键和移动端手势。
- 直播：M3U 订阅、频道筛选、收藏与 XMLTV 节目单。
- 下载管理：任务队列、暂停恢复和 MP4 转封装。
- 本地数据：设置、搜索历史与观看进度保存在浏览器中。

## 技术栈与检查

| 工具 | 版本 |
| --- | --- |
| Node.js | 24 |
| pnpm | 12.18.0 |
| TypeScript | 7.0.2 |
| Next.js | 16.4.6 |
| React | 19.3.1 |
| Astryx | 0.7.13 |
| Tailwind CSS | 4.3.5 |
| Biome | 2.6.6 |
| Vitest | 5.1.0 |

```bash
pnpm check          # 静态检查、类型检查、单元测试
pnpm format:check   # 格式检查
pnpm format         # 格式化
pnpm build          # Turbopack 生产构建
```

Biome 启用推荐规则，警告也会使检查失败。少量有意的生命周期触发依赖、含独立重试按钮的复合卡片，以及播放器注入样式的覆盖均附有局部豁免原因。项目不使用 ESLint、旧版 TypeScript 兼容层或 Tailwind 3 配置。

`src/components/design-system.tsx` 统一 Astryx 主题和路由适配。组件用法可通过 `pnpm astryx component Button` 查询。

GitHub Actions 独立执行检查、测试和构建。发布使用本仓库版本与产物，不引用上游发布镜像。

## 配置

基本配置见 `.env.example`。可选环境变量：

- `PASSWORD`：访问密码，必填。
- `PROXY_SECRET`：会话和代理签名密钥，多实例建议显式配置。
- `DEFAULT_SOURCES` / `DEFAULT_LIVE_SOURCES`：预置点播源或直播订阅 JSON 数组。
- `DEFAULT_SUBSCRIPTIONS`：SourceList 订阅配置。
- `DEFAULT_RECOMMEND_SOURCE`：`douban`、`bangumi` 或 `hot-list`。
- `60S_API_BASE`：影视榜单 API 实例地址。
- `REQUEST_TIMEOUT` / `MAX_RETRIES`：上游请求超时与重试。

如需容器部署，可自行运行 `docker compose up -d --build`；默认只使用本地构建的镜像。

## 内容说明

本项目不制作、不存储视频内容，仅提供第三方接口的聚合和播放能力。请使用有权访问的内容与数据源，并尊重内容版权。
