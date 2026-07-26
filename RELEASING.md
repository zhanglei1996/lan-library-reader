# 发布说明

## 首次发布

首次发布需要在本机登录 npm，并从干净的 `main` 分支执行：

```bash
npm login
npm run release -- --dry-run
npm run release
```

发布脚本会检查分支和工作区状态，运行测试、代码检查、生产依赖审计，预览 npm 包内容，确认版本未被占用，然后发布公开包并推送对应的 Git 标签。

## 后续版本

先更新版本并推送代码：

```bash
npm version patch
git push origin main --follow-tags
```

也可以使用 `minor` 或 `major`。然后在 GitHub 上用对应标签创建 Release，例如 `v0.1.1`。发布 Release 后，`.github/workflows/publish.yml` 会再次验证版本、测试并发布到 npm。

## GitHub Actions 认证

推荐在 npm 包设置中配置 Trusted Publisher：

- Provider：GitHub Actions
- Organization or user：`zhanglei1996`
- Repository：`lan-library-reader`
- Workflow filename：`publish.yml`
- Allowed actions：`npm publish`

工作流使用 npm OIDC 临时凭证，不需要在 GitHub 保存长期有效的 npm 发布令牌。

Trusted Publisher 只能在 npm 包首次发布后配置。
