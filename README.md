# dsh-purge · DSH 0.2.1-rc.2 适配版

> 上游 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 自 2026-10 起进入低维护状态：不发新版、不处理 issue/PR、新版 dsh 不保证跟进。最后一个正式发行版是 `v1.1.71`，master 上的 `1.1.72` 从未发版。
>
> 本仓库以 **1.1.72（master）** 为基座，补齐 DeepSeek Harness **0.2.1-rc.2** 上会导致启动失败的兼容性问题，做成可直接安装的版本。**上游恢复维护后，请优先回到上游。**

- 版本：`1.1.72-dsh021rc2.4`
- 适配：`@deepseek-ai/dsh` / `dsh-base` **0.2.1-rc.2**（web profile，macOS / Windows 实测）
- 基线：0.2.0-rc.2 仍可用（本版改动对 0.2.0 向后兼容）
- 许可：MIT（原作者 小杨 / YuJunZhiXue，署名见文末）

## 这是什么

一个 DeepSeek Harness 工作区插件。宿主里散落、硬编码的提示词段与工具配置，在这里被整理成可视、可编辑、可回滚的面板：

| 面板 | 作用 |
|---|---|
| **状态 / 应用** | 扫描宿主目标文件，列出哪些配置项已就位、哪些待处理；点「应用」写入修改并自动重启 |
| **提示词** | 编辑 `$DSH_HOME/prompt-inject.md`（人格与工作规则正文），保存后下一轮生效 |
| **技能库** | 随包技能 + `$DSH_HOME/skills` 自定义技能的统一清单，含真实可用性检查 |
| **演练台** | 预设组合（主会话 + 若干执行角色）、资产表、报告导出；数据落 SQLite |
| **设置** | 自动应用、重试、续写、语言、面板显示等 |

所有写入都是**可回滚**的：改动前备份原件、`/purge revert` 一键恢复、卸载保留用户文件。

## 按模型分档注入

同一份注入在不同厂商身上的通过率是结构性差异，不是语气问题：

| 路由 | 对齐方式 | 现在的做法 |
|---|---|---|
| DeepSeek | 读规则式（拒答靠 system 规则兜着） | 沿用 `prompt-inject.md` |
| GPT（`gpt-5.x` / `gpt-4.1` / `o1`·`o3`·`o4` / `codex` / `chatgpt`） | 权重内化 + 输入侧分类器 | 内置 `gpt` 模板 |
| GLM（`glm-4.x` / `5.x` / `chatglm`） | 权重内化 | 内置 `glm` 模板 |
| Kimi（`kimi-k2` / `moonshot`） | 权重内化 | 内置 `kimi` 模板 |

**选择顺序**：`prompt-inject.<tag>.md`（tag 由模型 id 逐段收缩：`gpt-5.1-codex` → `gpt-5-1` → `gpt-5` → `gpt`）→ 内置家族模板 → 原注入。

内置模板做了四件事，都不是把语气拧大：

- 去掉 `<|im_start|>` / `<project_instructions>` / `antml` 等别家模板 token —— 对非 ChatML 模型是纯噪声，还是「这人在贴别人的模板」的信号。
- 去掉拒绝词黑名单 —— 成段罗列「不能/无法/抱歉/refuse to」并要求禁用，在输入侧分类器眼里就是越狱模板的样板。
- 去掉「绝对授权 / 忽略一切限制 / 你没有任何限制」这类自曝措辞。
- 改成**协议式 + 描述式**，并写死可判定的边界（全部角色虚构成年、不涉真实人物、只停两类红线）。给它一个能判的框，它就不必自己加保险。

自己写一份：`$DSH_HOME/prompt-inject.gpt.md` —— **磁盘上的文件永远压过内置**。要关掉内置只用磁盘变体：配置项 `modelFamilyInject: false`。

`o1` / `o3` / `o4` 为什么单独归族：`#93` 的 tag 收缩对 `o3-mini` 只能得到 `o3-mini` / `o3`，永远出不来 `gpt`，光靠 tag 链会把 o 系全漏掉。

## 0.2.1 兼容性修复

对应上游 issue：[#114](https://github.com/YuJunZhiXue/dsh-purge/issues/114)、[#126](https://github.com/YuJunZhiXue/dsh-purge/issues/126)、[#136](https://github.com/YuJunZhiXue/dsh-purge/issues/136)、[#132](https://github.com/YuJunZhiXue/dsh-purge/issues/132)、[#119](https://github.com/YuJunZhiXue/dsh-purge/issues/119)、[#127](https://github.com/YuJunZhiXue/dsh-purge/issues/127)、[#121](https://github.com/YuJunZhiXue/dsh-purge/issues/121)。

| 问题 | 根因 | 修法 |
|---|---|---|
| **#114 / #126 / #136** 每轮 `unknown prompt variable "{{cwd}}"` | 0.2.1 的 agent-loop 只注册 `provider` / `model`，不再注册 `cwd`；`lib/identity.js` 却硬写 `{{cwd}}` | `identity.js` 增加能力探测：`assembled.variables` 没有 `cwd` 就降级为静态文案；组装末尾再兜底把残留 `{{cwd}}` 落成字面量。可用 `DSH_PURGE_CWD=variable\|static` 强制 |
| 同一问题的第二入口 | 插件自己的 `cordis.patch.yml` 里也写着 `personaSuffix: ... {{cwd}}.` | 改为 `personaSuffix: ""`，后缀统一由 identity 层决定 |
| **#132** 应用后「未写进全部宿主，已取消重启」、`#40` 落成 skipped | 0.2.1 的 `system-prompt` 在 assemble 后新增 `requiredContexts` 过滤，旧 pattern 全不命中 | patch `#40` 增加 0.2.1 形状的 pattern + replacement，保留 `requiredContexts` 语义 |
| **#119** 桌面端点「应用」后 `dsh: fatal load failure` | `desktop.js` 同步函数调 async `atomicCopyFile()` 没 `await`，Node 24 转为 uncaughtException | 函数改 async、补 `await`，`core.js` / `index.js` 调用点同步 |
| **#127 / #106** 应用后一份 `.bak` 都没有，还原/卸载失效 | `HOST_SYNC` 白名单漏 `closeSync` → `hostFs.closeSync` 未定义 → 占位句柄泄漏 → EPERM 静默失败 | 白名单补 `closeSync / fsyncSync / truncateSync / writeSync / futimesSync / utimesSync` |
| **#121** Ctrl+Enter 插话静默失效 | 1.1.71 的 `#86` 把 `case "steer"` 改成 `followup`，与 `steer()` 的 next-step 冲突 | 1.1.72 已修正为 `agent.steer`；本版在真机确认落盘 |
| 演练台预设注册失败（社区 fork 修法） | `presets/redteam/agent.cordis.yml` 的 `toolFilter.deny` 列了未注册的 `workflow / ralph`，`tools.restrict()` 直接抛 `unknown global tool` | 移除 `toolFilter`，子代理隔离改由 `maxDepth: 1` 保证 |

**未处理**：上游 #133（Windows 桌面换包助手杀自身）属 Electron/Windows 路径，macOS 不复现；上游 #30（system section 过滤影响项目约定）属行为争议，不在适配范围。

## 安装

### 方式一：一键脚本（web profile）

```sh
curl -fsSL https://raw.githubusercontent.com/tmy2543030603/dsh-purge-021rc2/main/scripts/install.sh | sh
```

脚本会：备份现有插件目录 → 解包发行版 → 写入 `installed-rev` / `applied.json` 版本戳（避免宿主启动时误判版本落后而反复重打）。

### 方式二：手动

```sh
V=1.1.72-dsh021rc2.4
curl -fsSLO https://github.com/tmy2543030603/dsh-purge-021rc2/releases/download/v$V/dsh-purge-$V.tgz
curl -fsSLO https://github.com/tmy2543030603/dsh-purge-021rc2/releases/download/v$V/SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
rm -rf "$DSH_HOME/profiles/web/node_modules/dsh-purge"
mkdir -p "$DSH_HOME/profiles/web/node_modules/dsh-purge"
tar xzf dsh-purge-$V.tgz -C "$DSH_HOME/profiles/web/node_modules/dsh-purge" --strip-components=1
```

### 方式三：写进 profile 依赖

```json
"dsh-purge": "https://github.com/tmy2543030603/dsh-purge-021rc2/releases/download/v1.1.72-dsh021rc2.4/dsh-purge-1.1.72-dsh021rc2.4.tgz"
```

### 方式四：本地目录

仓库已 clone 到本地时，把它软链或复制进 profile 的 `node_modules/dsh-purge` 即可，无需网络。

## 使用

1. 完全退出并重开 DSH（插件改的是已加载的 JS，不重启不生效）；
2. 左侧栏 **Purge** → 状态页 → **应用**；
3. 成功会自动重启；重启后新开一轮会话，配置才进当前上下文；
4. 面板应显示 **69 个补丁行 / 0 pending**，`#40 / #85 / #86 / #87–#92` 全绿。

命令行：`dsh-purge status`、`dsh-purge apply`、`dsh-purge revert`、`dsh-purge edit`。

## 验证

三组离线测试，不依赖网络：

```sh
node test/identity.test.mjs      # 5 项：{{cwd}} 能力探测与降级
node test/patches.test.mjs       # 5 项：#40 命中 0.2.1 形状、#86 steer、#119/#127 静态断言
node test/redteam-env.test.mjs   # 演练台环境与预设合成
node test/sandbox-apply.mjs      # 把宿主目标文件复制到临时目录跑全量 apply
```

真机结果（dsh 0.2.1-rc.2 / web profile）：

```
应用前：59/86 applied，11 pending，#40 skipped
应用后：70/86 applied，0 pending，#40 / #85 / #86 / #87–#92 applied
hostCleanMarkersPresent === true
hostPromptKeepsInject === true
```

## 目录结构

```
bin/          命令行入口
lib/          宿主补丁、面板后端、演练台（lib/redteam）
presets/      预设（presets/redteam：主会话 + 执行角色）
skills/       随包技能（安装后同步到 $DSH_HOME/redteam/skills）
client.js     侧栏前端
docs/         截图与说明
test/         离线测试
```

## 已知限制

- 只验证了 **web profile + 官方桌面 0.2.1-rc.2 的代码形状**；0.2.0-rc.2 逻辑兼容但未逐项回归。
- 上游停止维护意味着 dsh 再改宿主结构时，补丁锚点需要重新对齐；欢迎 issue / PR。
- `shim 目录: 未定位` 在 npx 安装下是正常现象（没有全局 `dsh` 启动器），不影响功能。
- 本仓库是社区适配分支，不提供官方背书。

## 维护与发布

1. 改代码，同步改 `package.json` 的 `version` 与 `CHANGELOG.md`；
2. 跑离线测试：`node test/identity.test.mjs && node test/patches.test.mjs`；
3. 打 tag 推上去，CI 自动 `npm pack` + 生成 `SHA256SUMS.txt` 并发 Release：
   ```sh
   git tag v1.1.72-dsh021rc2.4 && git push origin v1.1.72-dsh021rc2.4
   ```
4. 本地升级：`PURGE_VERSION=<新版本> sh scripts/install.sh`

宿主升级导致补丁锚点漂移时，先跑 `test/sandbox-apply.mjs` 看哪几条 pattern 不命中，再对着真实的 `@deepseek-ai/*` 源码补 pattern。

## 与上游的关系

- 代码基座：`YuJunZhiXue/dsh-purge` master `1.1.72`（MIT）
- 原作者：**小杨 / [YuJunZhiXue](https://github.com/YuJunZhiXue/dsh-purge)**
- 本仓库：社区适配分支，只做 0.2.1-rc.2 兼容修复
- 依照上游《署名要求》：借用名称、思路或代码必须署名并写明来源仓库。本仓库保留 MIT 许可证与原作者版权声明。

## License

MIT。原始版权 `Copyright (c) 2026 小杨`，本仓库修改部分 `Copyright (c) 2026 evilevil`。
