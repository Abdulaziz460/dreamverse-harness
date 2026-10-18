---
description: "DreamVerse 镜头渲染的浏览器半边：一次 dv_shot_render 调用在对话里的卡片，显示模型和生成任务、提示词、状态、渲染出的视频，以及在历史中查看链接。"
kind: "package-reference"
---

# @dv/ui-shot-render

[English](README.md) | 中文

## 概述

使用本包把镜头渲染工具 `dv_shot_render`（`@dv/shot-render` 的操作 `shot.render`）的调用显示为 DSH 对话里的卡片。卡片显示工具名 渲染镜头 / Render shot、调用的模型和生成任务、提示词、状态、渲染出的视频，调用结束后还有链接 在历史中查看 / Show in history。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在叠了 `dsh-web-app`（提供对话和 UI 插槽）和 `@dv/api`（提供 `GET /api/dv/operations` 和 `GET /api/dv/tasks`）的 profile 里挂载插件，先用 `pnpm run build` 构建浏览器 bundle（写出 `lib/client.js`）。

```yaml
- id: dv-ui-shot-render
  name: '@dv/ui-shot-render'
```

Host 半边不注册任何东西。浏览器半边以默认优先级 0 注册一个键为 `dv_shot_render` 的 `tool.call.toolview` 条目。`@dv/ui-composer` 以优先级 1 为每个操作工具注册一行，以优先级 0.5 为 `DV_TOOL_LABELS` 里的每个工具注册一行，所以卡片取代这些行显示；没有本包时，`dv_shot_render` 调用显示输入框插件的普通工具行。

| 卡片部分 | 值 |
| --- | --- |
| 标题 | `@dv/ui-kit` 的 `operationLabel('shot.render', …)`：操作在 `GET /api/dv/operations` 里的标签（渲染镜头 / Render shot），没有时用 `shot.render` |
| 模型行（`data-testid="dv-composer-render-model"`） | 调用的 `model`，和按 `GET /api/dv/tasks` 里的标签显示的 `task`（没有标签时显示任务名），用 ` · ` 连接（例如任务 `ref2v` 显示 `fasth3 · 参考图生成` / `fasth3 · From references`） |
| 提示词 | 调用的 `prompt` |
| 状态 | 调用结束前为 渲染中… / Rendering…，之后为 已渲染 / Rendered；失败的调用为 未渲染 / Not rendered |
| 视频 | 结果展示元数据里的第一个视频产出，带控件，静音 |
| 在历史中查看 / Show in history（`data-testid="dv-composer-open-history"`） | 出现在已结束的调用上；派发 `dv:history-focus` `{session, toolCall}`，历史面板选中这次调用写出的记录 |

参数还在流式到达时，卡片显示已有的部分。两个列表加载完成前，或读取失败时，标题按上表回退，模型行显示任务名。

-----

<a id="understand-the-implementation"></a>
## 理解实现

每张已挂载的卡片通过 `@dv/ui-kit` 的 `useOperations` 和 `useTaskLabels` 各读取一次 `GET /api/dv/operations` 和 `GET /api/dv/tasks`。解析后的参数、产出和历史链接来自 `@dv/ui-kit/tool-rows.tsx`，`@dv/ui-composer` 的工具行也共用它。

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | 不做任何事的 Host Loader 入口 |
| [`src/css-modules.d.ts`](src/css-modules.d.ts) | CSS Module 导入的类型 |
| [`src/client/index.ts`](src/client/index.ts) | `dv_shot_render` 的 `tool.call.toolview` 条目和标签读取 |
| [`src/client/RenderCard.tsx`](src/client/RenderCard.tsx) | `RenderCard` |
| [`src/client/render-card.module.css`](src/client/render-card.module.css) | 卡片和其历史链接的样式 |

-----

<a id="further-exploration"></a>
## 进一步探索

- [`@dv/shot-render`](../shot-render/README.zh.md)：`shot.render` 操作和它的智能体工具。
- [`@dv/ui-composer`](../ui-composer/README.zh.md)：对话里的工具行和工具名。
- [`@dv/ui-kit`](../ui-kit/README.zh.md)：`operationLabel`、`taskLabel` 和工具行的共用部分。

-----

<a id="model-experience"></a>
## 模型体验

无；本包不向模型发送任何内容。

#### KV Cache 影响

无；本包不向模型发送任何内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **输入框的测试 ID** — 模型行保留来自 `@dv/ui-composer` 的测试 ID `dv-composer-render-model`；历史链接是 `@dv/ui-kit` 共用的 `HistoryLink`，e2e 故事 `history.e2e.ts` 在工具行上按它的测试 ID `dv-composer-open-history` 选取。
