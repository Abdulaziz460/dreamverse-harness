---
description: "DreamVerse 的故事工作流：dvStory 服务及其只读操作 story.preview，在不写入的情况下报告批准分镜计划某个版本会渲染什么、其 GPU 估算以及每条渲染拒绝；修改分镜计划版本的预览方式时打开本页。"
kind: "package-reference"
---

# @dv/workflow-story

[English](README.md) | 中文

## 概述

在用户批准分镜计划的某个版本之前，用本包预览它。只读操作 `story.preview`（工具 `dv_story_preview`）把每个镜头列为渲染或保留，统计需要渲染的镜头数，求它们的 GPU 估算之和，并列出渲染会被拒绝的每条原因。它不写入任何东西。镜头来自 `dvShotPlan.shots`，`@dv/workflow-kit` 的镜头遍历选出每个镜头保留的成片，`dvShotRender` 为每个需要渲染的镜头估算并检查。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 `@dv/project`、`@dv/shot-plan`、`@dv/shot-render` 和 `@dv/timeline` 之后挂载本插件。它没有配置，注册组件键 `story`。

```yaml
- id: dv-story
  name: '@dv/workflow-story'
```

| 操作 | 工具 | 参数 | 报告 |
| --- | --- | --- | --- |
| `story.preview` | `dv_story_preview` | `plan`（必填，PlanId），`version`（默认：最新版本） | `{plan, version, shots, rendered, gpu_seconds, problems}`：每个镜头一行，需要渲染的镜头数，它们的 `dvShotRender.estimate` 之和，以及每条拒绝的 `Shot <n>: <reason>` |

该操作的标签为 预览分镜计划 / Preview plan。需要渲染的镜头一行为 `shot <n> (<modality>/<task>/<provider>/<model>, <d> s, continues from the previous shot): <提示词的前 80 个字符>`；保留成片的镜头一行为 `shot <n>: keeps its take`。未知的计划或版本使调用以 `invalid_params` 失败；无法解析的参考使调用以 `dvShotRender.parseInputs` 的错误失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`story.preview` 用 `walkShot` 把 `dvShotPlan.shots` 的每个镜头映射为渲染参数，并以 `dvShotRender` 和 `takeFilter` 调用 `planShots`。一条已完成的渲染是该计划的成片，条件是其链的起始记录（`chainStarter`：它自己的 `started_by`，否则为其 `based_on` 根记录的 `started_by`）为该计划的 `story.approve` 记录。所以自由成片、其他计划的成片和 `plan.approve` 的成片从不被保留。每个需要渲染的镜头都经过 `checkShots`：接在保留成片之后的接续镜头以该成片的最后一帧静帧作为 `first_frame`；接在需要渲染的镜头之后时，角色 `first_frame` 标为链上提供，模型检查等到那次渲染再做。每一行来自 `shotLine`，`gpu_seconds` 是需要渲染的镜头的 `dvShotRender.estimate` 之和。

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | `dvStory`：`story.preview`、计划遍历、预览行和问题 |

-----

<a id="further-exploration"></a>
## 进一步探索

- [`@dv/workflow-kit`](../workflow-kit/README.zh.md)：`walkShot`、`planShots`、`takeFilter`、`checkShots` 和 `shotLine`。
- [`@dv/shot-plan`](../shot-plan/README.zh.md)：计划、版本和 `dvShotPlan.shots`。
- [`@dv/shot-render`](../shot-render/README.zh.md)：`dvShotRender` 的 `check`、`estimate` 和 `findTake`。

-----

<a id="model-experience"></a>
## 模型体验

### 工具定义

#### 模型看到什么

一个工具 `dv_story_preview`，采用 `@dv/project` 为每个操作工具提供的格式，带提示 "A read that writes no record."。描述说明该调用在不渲染的情况下预览批准计划某个版本会渲染什么，列出报告字段，要求智能体把这些行和 `gpu_seconds` 展示给用户，并在 `problems` 不为空时用 `dv_plan_update` 更新计划后再次预览。

#### Token 影响

定义约 200 个 token，插件挂载期间固定不变。

#### KV Cache 影响

定义位于每次智能体请求的稳定工具段；挂载或移除插件会改变工具列表，使工具段及其后的缓存前缀失效。

### 工具结果

#### 模型看到什么

一个文本块：`done: dv_story_preview answered`、参数和报告。

#### Token 影响

约 60 个 token，每个镜头行和每条问题另加约 30 个。

#### KV Cache 影响

每个结果在调用之后追加到对话；缓存前缀保持不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只有预览** — 本包不注册批准操作，也没有 reducer；批准的版本由 `@dv/shot-plan` 的 `plan.approve` 渲染，而预览把 `plan.approve` 已渲染的镜头列为需要再次渲染。DreamVerse 套件不挂载本包，所以没有智能体看到 `dv_story_preview`。
