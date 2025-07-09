## Github Action 部署

**配置 Github 仓库**

1. Fork 或克隆仓库 [https://github.com/eoao/cloud-mail](https://github.com/eoao/cloud-mail)
2. 进入您的 GitHub 仓库设置
3. 转到 Settings → Secrets and variables → Actions → New Repository secrets
4. 添加以下 Secrets：

| Secret 名称             | 必需 | 用途                                                  |
| ----------------------- | :--: | ----------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  |  ✅  | Cloudflare API 令牌（需要 Workers 和相关资源权限）    |
| `CLOUDFLARE_ACCOUNT_ID` |  ✅  | Cloudflare 账户 ID                                    |
| `D1_DATABASE_ID`        |  ✅  | 您的 D1 数据库的 ID                                     |
| `KV_NAMESPACE_ID`       |  ✅  | 您的 KV 命名空间的 ID                                   |
| `R2_BUCKET_NAME`        |  ✅  | 您的 R2 存储桶的名称                                    |
| `DOMAIN`                |  ✅  | 您要用于邮件服务的域名（例如 `["xx.xx"]，多域名用,分隔`）        |
| `ADMIN`                 |  ✅  | 您的管理员邮箱地址（例如 `admin@example.com`）      |
| `JWT_SECRET`            |  ✅  | 用于生成和验证 JWT 的随机长字符串                     |
| `INIT_URL`              |  ❌  | （可选）部署后用于初始化数据库的 Worker URL（格式参考下述手动初始化）           |

---

**获取 Cloudflare API 令牌**

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 创建新的 API 令牌
3. 选择"编辑 Cloudflare Workers"模板，并参照下表添加相应权限
   ![dc2e1dc8dcd217644759c46c6c705de1](https://i.miji.bid/2025/07/07/dc2e1dc8dcd217644759c46c6c705de1.png)
4. 保存令牌并复制到 GitHub Secrets 中的 `CLOUDFLARE_API_TOKEN`

**获取 Cloudflare 账户 ID**
1. 账户 ID 可以在 Cloudflare 仪表盘的账户设置中找到。
2. 复制到 GitHub Secrets 中的 `CLOUDFLARE_ACCOUNT_ID`

**运行工作流**
1. 然后在Action页面手动运行工作流，后续同步上游后会自动部署到 Cloudflare Workers。如未配置 `INIT_URL`，则需要手动访问 `https://你的项目域名/api/init/你的jwt_secret` 进行数据库初始化。
2. 自动同步上游可使用bot或者手动点击Sync Upstream按钮。