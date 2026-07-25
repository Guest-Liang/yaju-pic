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

## Cloudflare Workers Builds

项目要求 Node.js `>=24.18.0`、npm `>=12.0.0`，并用 `packageManager` 固定 npm `12.0.1`。Cloudflare 构建镜像自带的 npm 版本可能较旧，因此 Worker 构建设置使用：

```text
构建变量
SKIP_DEPENDENCY_INSTALL=1

构建命令
npx --yes npm@12.0.1 clean-install --progress=false && npx --yes npm@12.0.1 run format:check && npx --yes npm@12.0.1 run build

部署命令
npx --yes npm@12.0.1 exec -- wrangler deploy
```
