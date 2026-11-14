# 映屿 · CineIsle

映屿（CineIsle）是独立维护的影视发现、聚合搜索与播放项目。界面采用 Astryx 设计系统，默认暖黑影院主题，提供大幅精选、七列横向海报片单和移动端触控浏览；支持明暗主题、影片推荐、观看历史和直播。

本仓库不是 GitHub Fork，使用独立的提交历史、版本和发布流程，不自动同步上游。

## 来源与许可证

本项目的代码基础来源于 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)，在此基础上进行了界面重设计、工具链升级和代码修复。感谢 LibreTV 原作者和贡献者。本项目由 ForXd 独立维护，不代表 LibreTV 官方发布。

保留原作者版权声明，并遵循 [AGPL-3.0-or-later](LICENSE)。独立仓库不改变已有代码的许可证义务。设计系统来自 [Meta Astryx](https://github.com/meta/astryx)，第三方依赖遵循各自许可证。

## 本地运行

环境：**Bun 1.4.4**（包管理器与运行时）。版本固定在 `.bun-version`，精确依赖记录在 `bun.lock`。

```bash
bun --version
bun install --frozen-lockfile
cp .env.example .env.local
# 编辑 .env.local，设置 PASSWORD
bun run check
bun run format:check
bun run build
bun run start
```

访问 [http://localhost:8080](http://localhost:8080)，使用配置的密码登录。无需 Docker。开发时运行 `bun run dev`。

安装后在页面右上角“设置”中添加自己的点播源或直播订阅；项目不预置视频源，也不存储视频文件。

## Nginx 局域网部署

生产应用监听 `127.0.0.1:8081`，Nginx 在 `8080` 端口对外提供访问：

```bash
bun run build
bun --bun next start --hostname 127.0.0.1 -p 8081
```

将 `deploy/nginx/cineisle.conf` 加入 Nginx 的 HTTP 配置，并移除默认站点对 `8080` 的占用。执行 `nginx -t` 验证后启动或重载 Nginx。同一局域网设备访问 `http://<服务器局域网 IP>:8080`，使用原有登录密码。

当前 macOS 部署由 `local.cineisle` LaunchAgent 管理应用，Homebrew 服务管理 Nginx，两者均在登录后自动启动。Homebrew 配置位置为 `/opt/homebrew/etc/nginx/servers/cineisle.conf`。应用启动参数使用内部端口 `8081`，不要同时运行占用 `8080` 的 `bun run start` 或 `bun run dev`。

```bash
# 修改 Nginx 配置后
nginx -t && nginx -s reload
# 重启 Nginx
brew services restart nginx
# 重新构建并重启应用
bun run build && launchctl kickstart -k gui/$(id -u)/local.cineisle
```

## Windows 部署

目录布局：`D:\CineIsle\app` 存放代码，`runtime\bun\bin\bun.exe` 存放 Bun 1.4.4，`runtime\nginx-1.31.8` 存放 Nginx，`logs` 存放服务日志。全局 Node 不是运行依赖。

1. 在 `app` 目录设置 `.env.local` 中的 `PASSWORD`。
2. 使用上述 Bun 执行 `install --frozen-lockfile`、`run check`、`run build`。
3. 在管理员 PowerShell 执行 `app\deploy\windows\install-services.ps1`。

脚本创建 `CineIsle-App` 与 `CineIsle-Nginx` 开机计划任务，以 Local Service 账号运行，异常退出一分钟后重试。Nginx 对局域网开放 8080，应用仅监听 `127.0.0.1:8081`。任务无需交互登录；首次安装脚本遇到同名任务会拒绝覆盖。

更新时先构建，再使用 `Stop-ScheduledTask` / `Start-ScheduledTask` 重启 `CineIsle-App`。Nginx 配置位于 `runtime\nginx-1.31.8\conf\nginx.conf`，修改后先 `nginx -t` 再重载。

## 功能

- 影片发现：大幅精选海报、分类筛选、推荐列表、观看历史续播。
- 聚合搜索：跨源同名影片合并、画质探测和来源测速。
- 视频播放：ArtPlayer + hls.js，支持进度恢复、跳过片段、连播、快捷键和移动端手势。
- 直播：M3U 订阅、频道筛选、收藏与 XMLTV 节目单。
- 下载管理：独立文件句柄、受控并发、暂停恢复和基于 Mediabunny 的流式 MP4 转封装。
- 本地数据：设置、搜索历史与观看进度保存在浏览器中。

## 技术栈与检查

项目使用 Bun 安装依赖并运行 Next.js。前端使用 React、TypeScript、Astryx 与 Tailwind CSS，使用 Biome 检查代码、Vitest 运行测试。Bun 版本见 [.bun-version](.bun-version)，直接依赖见 [package.json](package.json)，各平台的安装版本由 [bun.lock](bun.lock) 锁定。

```bash
bun run check          # 静态检查、类型检查、单元测试
bun run format:check   # 格式检查
bun run format         # 格式化
bun run build          # Turbopack 生产构建
bun run smoke          # Bun 生产运行时、认证、流式响应验证
bun run audit          # 完整依赖树安全审计
```

Biome 启用推荐规则，警告也会使检查失败。少量有意的生命周期触发依赖、含独立重试按钮的复合卡片，以及播放器注入样式的覆盖均附有局部豁免原因。项目不使用 ESLint、旧版 TypeScript 兼容层或 Tailwind 3 配置。

`src/components/design-system.tsx` 统一 Astryx 主题和路由适配。组件用法可通过 `bun run astryx component Button` 查询。

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

## 实现约定

- 下载任务的运行时句柄与并发配额由 `DownloadRuntime` 统一管理，不写入全局对象或持久化存储。
- MP4 转封装按需加载 Mediabunny，以背压限制内存，不重新编码；不支持的编码显式提示改用 TS。
- 异步请求必须传播取消信号；每次网络重试使用独立超时，换集后的旧回调不得操作新播放器。
- hls.js 使用当前 `LoadPolicy` 配置，不使用废弃的重试参数。
- 安装和安全审计使用 npm 官方注册表；`bun run audit` 检查整个依赖树。

品牌、仓库与发布产物统一使用 CineIsle；为保留已有用户设置和观看记录，浏览器持久化键及 LibreTV 配置交换格式沿用原有标识。
