# 网站部署配置

Cloudflare Pages 预览收口阶段使用以下配置：

- 生产分支：`main`
- 构建目录：`website`
- 构建命令：`npm ci && npm run build`
- 输出目录：`website/docs/.vitepress/dist`
- Node 版本：读取 `website/.node-version`

构建完成后，`/build-info.json` 会公开当前构建 SHA、时间和环境。线上冒烟测试通过 `WDZ_SMOKE_BASE_URL` 指向实际域名运行；GitHub Actions 中可将该值配置为 repository variable。

Cloudflare 控制台中的项目、域名、生产分支和输出目录绑定需要人工确认，仓库脚本不会自动修改外部设置。
