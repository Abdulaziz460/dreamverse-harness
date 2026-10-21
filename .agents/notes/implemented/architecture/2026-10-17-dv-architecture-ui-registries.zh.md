# Agent Note: DreamVerse UI 注册表——UI 核心绘制 UI 插件注册的内容

Status: implemented

[English](2026-10-17-dv-architecture-ui-registries.md) | 中文

## 问题

共用的浏览器端包直接点名插件名词，因此一个插件的界面无法单独添加或移除。`@dv/ui-canvas` 通过 `BibleKind` 和 `bibleItems`（`ui-canvas/src/client/graph.ts`）绘制故事设定节点，持有分镜计划编辑器（`PlanHeader`、`PlanShots`），并从 `@dv/ui-asset-pool` 深导入 `AssetsPanel` 和 `Preview`。`@dv/ui-history` 通过 `scheduledBy` 把渲染折叠在一次批准之下，而 `scheduledBy` 读取 `plan.approve` 的报告；它还在一个带 `plan.*` 分支的 `switch` 中为记录命名。`@dv/ui-composer` 读取 `state.components.timeline` 和 `state.components.bible` 来构建 `@` 菜单。`@dv/ui-shell` 深导入画布视图和时间线视图（`ui-shell/src/client/views.ts`）。`@dv/ui-kit` 把 `RENDER_OPERATION = 'shot.render'` 固定为唯一一个其记录算作版本（take）的操作。添加一个引用名词要改动 `ui-canvas`、`ui-history`、`ui-composer` 和 `ui-kit`；一个图像或音频操作在 kit 学会它的名字之前画不出任何版本。

## 决策

DreamVerse 的浏览器端分为 UI 核心和 UI 插件；[分层](2026-10-17-dv-architecture-layers.zh.md) 列出每一层的包和允许的导入。UI 核心是 `@dv/ui-kit`、`@dv/ui-canvas`、`@dv/ui-history`、`@dv/ui-shell` 和 `@dv/ui-composer`；它只绘制插件注册的内容，不点名任何插件名词（[R5](../process/2026-10-17-dv-architecture-fitness-test.zh.md)）。UI 插件是带 `./client` 入口的包 `packages/dv/ui-<name>`；宿主包 `<name>` 存在时，两者配对。

`@dv/ui-kit` 是一个库：它不注册任何东西，每个消费方打包自己导入的模块。它持有协议类型（`src/client/types.ts`）、注册表描述符类型和 `createRegistry`（`src/client/registries.ts`），以及所有视图以同一方式使用的纯函数辅助：`chainOf`、`versionRefOf`、`formatInputRef`、`isGenerationOperation`、`isGenerationRecord`、`operationLabel` 和 `taskLabel`。UI 半部如何为自己的 slice 定类型，见 [客户端状态类型](2026-10-17-dv-architecture-client-state-types.zh.md)。

每个注册表都是一个 Cordis 服务，由读取它的 UI 核心包在其 `apply` 的顶层通过 `ctx.reflect.provide` 提供，绝不在 effect 内提供，因为其他插件从各自的 fiber 向它注册：`@dv/ui-canvas` 提供 `dvCanvas`，`@dv/ui-history` 提供 `dvHistory`，`@dv/ui-composer` 提供 `dvMentions`。`createRegistry(keys)` 返回一个每个键只有一个所有者的描述符列表：当另一个描述符已占用其中某个键时 `register` 抛出异常，否则返回一个 disposer；`list()` 在变化之前返回同一个数组；`subscribe` 报告每次变化。

UI 半部在 `ctx.inject(['dvCanvas'], …)`（或 `dvHistory`、`dvMentions`、`slots`）内以 `scope.effect` 注册每个描述符，因此插件在服务缺席时也能加载，服务或插件离开时它的描述符随之离开。每个注册的包都测试 dispose（资源释放）会移除它的描述符，这是 `packages/AGENTS.md` 的要求。UI 半部只通过运行操作来改变项目数据（[数据流](2026-10-17-dv-architecture-data-flow.zh.md)）。

## 注册表与 slot

描述符类型和 `SlotMap` 合并都位于 `packages/dv/ui-kit/src/client/registries.ts`。三个引用名词各通过一次 `defineReferenceUi` 调用注册（[引用名词](2026-10-17-dv-architecture-reference-nouns.zh.md)）；表中把 `ui-character`、`ui-location` 和 `ui-style` 记作“名词包”。

| 注册表或 slot                           | 提供方或声明方                       | 键            | 一个描述符或条目给出的内容                         | 注册方                                                     |
| --------------------------------------- | ------------------------------------ | ------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `dvCanvas.nodeTypes`                    | `ui-canvas`                          | `id`          | 一种画布节点类型及其条目，从插件自己的 slice 读取  | `ui-shot-plan`（`plan`）、名词包                           |
| `dvCanvas.chainAnchors`                 | `ui-canvas`                          | `starter`     | 一个起始操作的记录所挂的节点，以及其已批准的版本号 | `ui-workflow-story`（`story.approve`）                     |
| `dvCanvas.takesInUse`                   | `ui-canvas`                          | `id`          | 插件数据使用其产出的记录，以及素材节点上的标记     | `ui-timeline`、`ui-shot-plan`、名词包                      |
| `dvCanvas.versionKinds`                 | `ui-canvas`                          | `kind`        | 一种引用种类的版本、名称、参考素材和节点 ID        | 名词包                                                     |
| `dvHistory.rows`                        | `ui-history`                         | `match`       | 一个操作或组件键的历史行的主语和中心聚焦           | `ui-workflow-story`、`ui-timeline`、`ui-shot-plan`、名词包 |
| `dvMentions.kinds`                      | `ui-composer`                        | `id`          | `@` 菜单的一个分区                                 | `ui-timeline`（`clip`）、名词包                            |
| `dv.canvas.editor`（keyed slot）        | ui-canvas 的 `dv.center.view` 条目   | `NodeType.id` | 一个节点条目的编辑器主体                           | `ui-shot-plan`、名词包                                     |
| `dv.canvas.picker`、`dv.canvas.preview` | ui-canvas 的 `dv.center.view` 条目   | `assets`      | 素材选择器中的素材库面板，以及一个素材的预览       | `ui-asset-pool`                                            |
| `dv.center.view`（list slot）           | ui-shell 的 `main.conversation` 条目 | 条目 `id`     | 工作区中心里打开项目的一个视图                     | `ui-canvas`（`canvas`）、`ui-timeline`（`timeline`）       |

编辑器条目只导入 `@dv/ui-kit`，因此画布借给它一个 `EntryEditorHost`：`run` 以画布写入的身份、用画布的项目和聊天会话运行一个操作，`pickAssets` 打开画布的素材选择器，`preview` 打开画布的素材预览。一个 slot 只由一个条目声明：ui-canvas 的中心视图声明三个画布 slot，画布的右侧边栏标签页主体（`CanvasBody.tsx`）不声明任何 slot。

## 画布、历史和提及规则

**版本。** 当 `isGenerationRecord(record, op, mimeOf)` 成立时，一条记录是版本（take）。当 `/api/dv/operations` 列出该记录的操作时，由声明决定（非确定性、资源为 `gpu`、有图像、视频或音频输出），因此一个待处理的版本在有产出之前就会绘制；否则由记录自身的事实决定。

**链与锚点。** 记录的链由 `chainOf` 给出：它自己的 `started_by`，没有时取其 `based_on` 根记录的 `started_by`，因此重拍保留它的镜头。当链的起始记录已加载、且为起始记录的操作注册了 `ChainAnchor` 时，这条链是锚定链。锚定链按位置（slot）和分支（lane）为版本命名，用一条 `chain` 边把版本挂在锚点节点上，为版本分组并编号，并填充带 `slots` 的条目的帧网格；其他版本是自由版本，以操作标签作为标题。一个节点的已批准版本是所有锚点的 `approvedVersions` 的并集；`story.approve` 写入的链归 [工作流](2026-10-17-dv-architecture-workflows.zh.md) 笔记所有。

**条目卡片。** 核心用同一种卡片绘制每个 `NodeEntry`：以 `NodeType.color` 着色的类型圆点、`NodeType.label()`，然后是 ` · <subtitle>`。带 `slots` 的条目显示帧网格；其他条目显示第一项媒体，更多媒体显示为 `+N`。

**历史。** `started_by.record` 等于某行记录的已加载记录折叠在该行之下。一行显示 `operationLabel` 加上与操作匹配的已注册 `HistoryRow` 的主语，先匹配精确名称，再匹配 `'<key>.'`；匹配行绝不回落到另一行。没有匹配行的记录显示它的链位置和分支，例如 渲染镜头 1 · 9:16。选中一行时运行该行的 `focus`；没有 `focus` 时，`proj` 记录不聚焦任何内容，其他记录把它的画布节点居中。

**提及。** ui-composer 的 `@` 来源按 `order` 在各自的 `section()` 下列出每个 `MentionKind` 的条目，然后列出最新的 40 个图像和视频。选中一项会插入 `@[<label>](dv:<kind>/<id>)`，`@dv/chat-references` 为 `dvProject.listReferenceKinds()` 中的每个种类展开它。

## NodeType 与 NodeEntry 这两个名称

“type”指画布节点类型，“kind”指内核的引用种类或提及种类。`NodeType.type` 是卡片的 `data-node-type` 值，例如 `plan` 或 `character`；`VersionKind.kind` 是一个引用种类；`MentionKind.kind` 是 `dv:<kind>/<id>` 中的 `<kind>`。`NodeEntry` 是 `NodeType` 绘制的一个节点，没有自己的标签：卡片显示 `NodeType.label()`。“entry”一词也把绘制出的节点与生成参数 `seed` 区分开。在 ui-canvas 内部，绘制出的节点类型是 `CanvasNodeType = 'asset' | 'take' | 'entry'`。

## 曾考虑的替代方案

**由 `@dv/ui-kit` 中的一个 `DvUi` 服务持有所有注册表。** 它被否决，因为 ui-kit 没有客户端插件入口，而 DSH 客户端注册表是由某个插件在 `apply` 顶层提供的服务。把 slot 类型放在 ui-shell 或 ui-canvas 中也被否决，因为那会让一个 UI 核心包导入另一个 UI 核心包。

**ui-kit 中的模块级注册表对象。** 它被否决，因为每个导入 ui-kit 的打包产物都有自己的副本，shell 绘制的画布副本因此够不到插件填充的注册表。

**把插件的 UI 半部作为其宿主包的 `./client` 入口。** 它输给了独立的 `ui-<name>` 包，因为同时带宿主面和客户端面的包需要三个 tsconfig 文件。

**只按 `started_by.record` 分组版本，不用链锚点。** 它在两次批准各自开启版本时仍把所有版本挂在同一个分镜计划节点上，并且在第四版计划复用第一次批准的版本后隐藏了第二次批准开启的第 4 镜版本。只有工作流知道哪些起始记录属于同一个分镜计划节点，所以由工作流注册锚点。

**把在用版本作为节点类型的一个可选方法。** 时间线报告在用版本，但不绘制任何节点，而节点类型的每个字段都是必需的，所以 `takesInUse` 是独立的注册表。

**按插件提供卡片的 slot（`dv.canvas.node`）和节点认领。** 没有插件注册卡片或认领，所以这个 slot 是一个无人使用、无测试覆盖的扩展点。

**按记录产出或内核记录上的 `resource` 字段区分版本。** 按产出判断会把待处理的版本隐藏到它完成为止。内核字段只对其加入之后写入的记录有效，而已存储的记录中没有一条带它（0/2178），所以由操作声明决定，记录事实作为回退。

**只有 `{ node, state }` 的编辑器 slot 所有者。** 只导入 ui-kit 的条目那样就得去掉 添加素材 和素材预览，或复制选择器和预览；`EntryEditorHost` 借出回调，不借出 React 节点。

**把 `VersionKind` 和 `MentionKind` 改名为 `…Type`。** `VersionType.kind` 会混用两个词，保留原名让改名少改约 130 行。

**每张卡片上的 `data-node-owner` 属性。** [适应度测试](../process/2026-10-17-dv-architecture-fitness-test.zh.md) 的所有者列表把 `data-node-type` 值映射到它的包，而该属性会增加一个 DOM 字段和若干测试行，没有任何用户目标需要它们。

## 后果

插件的界面随它自己的包添加或移除。一个手写的 UI 半部为 `prop` 名词注册一个节点类型、一个版本种类、在用版本、一个历史行和一个提及种类，实测 179 个计数行，没有修改任何 UI 核心文件；一个广告工作流的 UI 半部把第二条链挂在同一个分镜计划节点上，实测 79 个计数行，没有修改自身包以外的任何文件。基于 `defineReferenceUi` 构建的名词成本更低，见 [引用名词](2026-10-17-dv-architecture-reference-nouns.zh.md) 笔记。

注册表带来间接层和运行时失败方式：

- 键冲突是运行时错误：当两个插件声明同一个节点类型 `id`、起始操作、引用种类或历史 `match` 时，`register` 抛出异常，类型检查发现不了它。
- 画布只通过描述符读取插件数据，因此分镜计划只有通过一个带 `approvedVersions` 的已注册 `ChainAnchor` 才会显示为已批准。
- 右侧边栏中的画布标签页主体不渲染任何 slot：在那里条目编辑器只显示标题栏，素材选择器只列出版本条目，素材标签点开后没有预览。
- `@dv/ui-kit/src/client/types.ts` 手写复制宿主的协议类型，因此宿主上新增的字段要手动加到 kit 中。
- 三个名词的节点类型共用颜色 `var(--dv-kind-character)`，因为 ui-shell 主题（`ui-shell/src/client/theme.ts`）没有定义场景或风格的颜色变量。
- `ui-canvas/src/client/locales.ts` 中的语言键 `node.takeKind` 在版本卡片的标签中保留了 “kind” 一词。
