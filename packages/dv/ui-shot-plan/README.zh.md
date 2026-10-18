---
description: "DreamVerse 分镜计划的浏览器半边：画布节点类别把每个分镜计划以最新版本画出，带每个镜头一个位置的画面网格；使用中版本描述符让分镜计划参考素材的产出记录留在画布上。"
kind: "package-reference"
---

# @dv/ui-shot-plan

[English](README.md) | 中文

## 概述

使用本包在画布上显示 `plan` 切片（`@dv/shot-plan`）中的分镜计划。它在 `@dv/ui-canvas` 的 `dvCanvas` 中注册一个节点类别和一个使用中版本描述符。画布核心用默认卡片把每个分镜计划以最新版本画成一个 `plan` 节点 `plan:<PlanId>`：`分镜计划 · 第 2 版` / `Plan · v2`，下面是每个镜头一个位置的画面网格和标题 `3 个镜头 · 0:12` / `3 shots · 0:12`。产出最新版本参考素材的记录留在画布上。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在叠加了 `dsh-web-app`、`@dv/api` 和 `@dv/ui-canvas` 的 profile 中挂载这个插件。先构建浏览器包：`pnpm run build` 写出 `lib/client.js`。

```yaml
- id: dv-ui-shot-plan
  name: '@dv/ui-shot-plan'
```

| 描述符 | 注册表 | 值 |
| --- | --- | --- |
| `planNodeKind` | `dvCanvas.nodeKinds` | `id: '@dv/ui-shot-plan'`、`kind: 'plan'`、标签 `分镜计划` / `Plan`、颜色 `var(--dv-kind-plan)`、第 1 列；每个有版本的分镜计划一个 seed：ID 为 `plan:<PlanId>`，`record` 是写下最新版本的记录，`records` 是写下较早版本的记录，副标题 `第 N 版` / `vN`，标题是镜头数，每个镜头都有时长时后接 ` · <总时长>`，没有媒体，`slots` 是镜头数 |
| `planReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-shot-plan'`；`uses` 给出每个分镜计划最新版本及其镜头的参考中每个素材的产出记录（`created_by`）；`c1@1` 这样的版本引用不对应记录 |

Host 半边不注册任何东西。浏览器半边在 `ctx.inject(['dvCanvas'], …)` 里注册两个描述符，所以没有 `dvCanvas` 时也能加载，每个描述符随服务或插件一起离开。文字跟随 `<html lang>` 的界面语言（`@dv/ui-kit/locale.ts` 的 `pickText`）；语言改变时画布重新读取 seed。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`@dv/ui-kit` 的客户端状态类型声明了 `plan` 切片（`PlanState`），所以这个包按类型读取它。画布核心按每个位置的锚定版本填充画面网格，在历史面板聚焦 `records` 中的记录时把 seed 移到中央，并为类别是 `plan` 的 seed 打开它自己的分镜计划编辑器。

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | 不做任何事的 Host Loader 入口 |
| [`src/client/index.ts`](src/client/index.ts) | `planNodeKind`、`planReferencesInUse` 及其注册 |

-----

<a id="further-exploration"></a>
## 进一步探索

- [`@dv/shot-plan`](../shot-plan/README.zh.md)：`plan.create`、`plan.update` 和 `plan` 切片。
- [`@dv/ui-canvas`](../ui-canvas/README.zh.md)：画布如何用默认卡片画 seed 并填充它的画面网格。
- [`@dv/ui-kit`](../ui-kit/README.zh.md)：`NodeKind`、`NodeSeed` 和 `TakesInUse` 描述符类型。

-----

<a id="model-experience"></a>
## 模型体验

无；这个包不向模型发送任何内容。

#### KV Cache 影响

无；这个包不向模型发送任何内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **分镜计划编辑器仍在画布核心** — `@dv/ui-canvas` 仍然绘制 `plan` seed 的编辑器（版本、批准状态、镜头）；这个包不注册 `dv.canvas.editor` 条目。
- **不显示分镜计划标题** — seed 的标题是镜头数和总时长，所以分镜计划自己的 `title` 不出现在任何卡片和编辑器标题栏中。
