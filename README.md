# yaju-pic

鸦居老师图片查询工具。前端使用 Vue 3 + TypeScript，后端使用Cloudflare Worker + TypeScript，静态资源、API、D1 与 R2 由同一个 Worker部署。

## 目录

```text
src/                    Vue 前端
  components/           关键词选择、上传验证等组件
  config/               原站作者主页超链接
  views/                查询页和上传页
  lib/                  API、Turnstile、格式化工具
worker/                 Cloudflare Worker API
shared/tags.json        人工维护的关键词建议
migrations/             D1 迁移
wrangler.jsonc          Worker、域名、D1、R2、变量与静态资源配置
vite.config.ts          Vue + Cloudflare Vite 构建配置
```
