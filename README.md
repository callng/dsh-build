# dsh-build

自动从 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tags) 最新的 `dsh-v*` tag 构建 Windows x64 桌面客户端安装包，并发布到[本仓库 Releases](https://github.com/callng/dsh-build/releases)。

- 首次推送工作流到 `main` 即触发检查和构建，也可在 Actions 中手动运行。
- 每 3 小时检查一次上游；支持 alpha、beta、rc 等预发布 tag。首次从当时的最新 tag 开始，不补建历史版本。
- 本仓库已发布同一 tag 的安装包时跳过构建；构建失败或只留下草稿时，下次检查继续尝试。
- Release 的 tag、标题、预发布状态和完整更新日志原样取自上游，包含中文、英文、作者和完整 Changelog 链接。
- 先构建并完成上游运行时校验，再上传 EXE，最后发布 Release；构建日志及 Actions 产物保留 14 天，Release 附件不受此期限影响。

Release 安装包按 `<版本>-<系统>-<架构>.exe` 命名，例如 `0.2.3-alpha.2-win-x64.exe`。版本取自上游 tag，去掉 `dsh-v` 前缀。没有 Windows 代码签名，使用上游的 **DSH Local Build** 标识，也不提供应用内自动更新；更新时从 Releases 下载新安装包。

Windows 未签名打包在上游仍要求其强制更新策略服务。构建脚本仅调整两处判断，使未签名 Windows 包与未签名 macOS 包一样省略该服务；其余打包、运行时完整性和 smoke 校验继续使用上游实现。若上游改变相关语句，构建会停止并提示检查适配。

无需配置额外密钥。读取公开上游及发布本仓库版本使用 GitHub 自动提供的 `GITHUB_TOKEN`；工作流仅为发布任务声明 `contents: write`。构建使用 GitHub 托管的 `windows-2022` runner、上游声明的 Node.js 和 pnpm 版本，以及 Python 3.12。

工作流使用 `17 */3 * * *`，在 UTC 每隔 3 小时的第 17 分钟检查；北京时间为每天 02:17、05:17、08:17、11:17、14:17、17:17、20:17 和 23:17。推送和手动运行立即检查。GitHub 定时任务可能延迟或丢弃，公开仓库连续 60 天没有活动时定时任务会被 GitHub 停用。

本地验证：

```powershell
node --test scripts/*.test.cjs
```
