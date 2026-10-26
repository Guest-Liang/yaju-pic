# yaju-pic

地址：  
https://yaju-pic-tool.guestliang.icu/

鸦居老师图片查询与维护工具。前端使用 Vue 3 + TypeScript，后端使用 Cloudflare Worker + TypeScript；静态资源、API、D1 与 R2 由同一个 Worker 提供。

## 目录

```text
src/                    Vue 前端
  components/           日期、关键词和站点导航组件
  config/               原站作者主页超链接
  views/                查询页和上传页
  lib/                  API 与格式化工具
worker/                 Cloudflare Worker API 与 Access JWT 校验
shared/tags.json        人工维护的关键词建议
migrations/             D1 迁移
wrangler.jsonc          Worker、域名、Access、D1、R2 与静态资源配置
vite.config.ts          Vue + Cloudflare Vite 构建配置
```

上传页的“退出登录”会访问同域 `/cdn-cgi/access/logout`，主动撤销当前 Cloudflare Access 会话。

## 查询与预览

查询每页返回 10 张，使用上一页、下一页浏览。仅选择开始或结束日期也可查询；起止顺序和真实日历日期会在前后端校验。快捷范围为最近 7 天、15 天和一个月（含今天的 30 天，按北京时间计算）。最多同时使用 5 个关键词，保留现有文件名匹配与 AND 规则。

结果按原始宽高比例排列为瀑布流，直接懒加载数据库记录中的原图地址，完整展示构图。点击卡片打开原图，可使用浏览器保存原始文件。

## Cloudflare Workers Builds

项目使用 Node.js `24.22.1` 构建；允许的 Node.js 版本为 `^24.22.1 || ^26.12.1`，npm 要求 `>=12.0.0`。构建使用的 Node.js 版本由 `.node-version` 指定，当前为 `24.22.1`；npm 版本由 `package.json` 的 `packageManager` 指定，当前为 `npm@12.2.0`。

项目通过 `.npmrc` 的 `engine-strict=true` 在安装依赖时检查 Node.js 和 npm 版本，拒绝不符合上述范围的工具链。

Worker 的 `compatibility_date` 在 `wrangler.jsonc` 中设为 `2026-10-06`。它控制 Cloudflare 运行时的兼容行为，与构建时使用的 Node.js 版本分别配置。

Cloudflare 构建镜像自带的 npm 版本可能较旧，因此以下命令会先读取仓库中的 `packageManager`，再通过 `npx` 使用指定版本的 npm。`packageManager` 字段本身不会替换构建镜像中的 npm。

### 后台配置一次

在 Worker 的「设置 → 构建」中设置：

| 配置项 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 根目录 | `/` |
| 构建变量 | `SKIP_DEPENDENCY_INSTALL=1` |

构建命令：

```sh
npx --yes "$(node -p "require('./package.json').packageManager")" run ci:build
```

部署命令：

```sh
npx --yes "$(node -p "require('./package.json').packageManager")" run deploy
```

### 仓库中维护

| 要修改的内容 | 修改位置 |
| --- | --- |
| npm 版本 | `package.json` → `packageManager` |
| Node.js 构建版本 | `.node-version`（后台如有 `NODE_VERSION` 覆盖值，也需同步或移除） |
| 安装、检查和构建步骤 | `package.json` → `scripts.ci:build` 及其调用的脚本 |
| 部署命令或参数 | `package.json` → `scripts.deploy` |
| 应用依赖 | `package.json` 和 `package-lock.json` |
| Worker、域名及 D1/R2 绑定 | `wrangler.jsonc` |
