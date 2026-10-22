# Agent Note: DreamVerse 生成——模型目录、原语与 defineGeneration

Status: implemented

[English](2026-10-17-dv-architecture-generation.md) | 中文

## 问题

在 DreamVerse 模型目录和提供模型的提供方插件之间，曾按媒体类型各设一个插件：视频由 shot render 负责，另有 image generate 和 audio generate。这一层把一次模型调用变成一条项目记录：固定的参数、输入角色和输出，记录前的检查，GPU 确认，以及素材导入。但它按媒体类型切分，而模型之间真正变化的是一次调用的输入和输出签名。图像包和音频包几乎是彼此的副本：音频文件的 134 行中有 106 行与图像文件相同。

每增加一种媒体类型，还要修改共享包。图像生成的改动涉及 35 个文件，音频生成的改动涉及 37 个。两者都在 `@dv/models`（`packages/dv/models/src/types.ts`）内部声明自己的类型，尽管该文件自己的注释写明插件通过声明合并添加类型；两者也都修改了 `packages/dv/ui-kit/src/client/tool-labels.ts`。图像和音频操作从不请用户确认 GPU 用量，并记录 `gpu_seconds: 0`，因此一个 agent（智能体）轮次的 GPU 总量从未计入它们。两个提供方复制了同一段提示词 skill（技能）注册代码，提供方的 skill 文本还点名了 `dv_shot_render` 工具。任务标签放在只认识视频任务的 UI 分支里，因此中文界面显示 `<model> · t2i` 这样的原始名称。按项目负责人的估计，增加一个口型同步阶段需要修改七个包。

## 决策

生成由三部分组成（[分层 note](2026-10-17-dv-architecture-layers.zh.md) 负责层次图）：

- `@dv/models`（基础层）是模型目录，即 `dvModels` 服务，提供方插件向其中注册条目。它是一个[能力 seam](2026-06-13-capability-seams.zh.md)。
- `@dv/generation`（基础层）是一个库。`defineGeneration(spec)` 把一个原语的声明变成一个 Cordis 服务，该服务拥有一个组件键和一个操作。它不点名任何原语。
- 每个输入和输出签名对应一个原语包（领域层），它声明自己的类型并调用 `defineGeneration`。`@dv/shot-render` 是仓库中唯一的原语包。

*原语*是一次模型调用的一种输入和输出签名：一个包、一个组件键、一个操作和一次 `defineGeneration` 调用。*任务*指明模型使用哪些输入，每个任务运行在一个原语上。

### 按原语和任务索引的模型目录

`packages/dv/models/src/types.ts` 声明两个开放接口。`PrimitiveTypes` 为每个原语保存一行，含其 `modality`、构建请求所依据的 `facts`、`request`、`render` 的 `result`，以及只有该原语读取的 `entry` 字段。`TaskMap` 把每个任务映射到其原语。模型目录只声明 `video` 行（entry 字段 `gpuSecondsPerVideoSecond`）以及任务 `t2v` 和 `ref2v`；其他包通过 `declare module '@dv/models'` 添加行或任务。`ModelEntry<T>` 取任务 `T` 所用那一行的类型。

一个条目是一个提供方的一个模型服务一个任务，键为 `modality/task/provider/model`。Consumer 只通过自己的任务列表访问条目：`resolve(tasks, params)` 返回调用的键字段所指定的条目，否则抛出一个点名 `dv_models_list` 的拒绝；`whileServing(tasks, start)` 在有条目服务其中某个任务期间保持一项注册。模型目录不注册操作，也不写记录。

agent 用 `dv_models_list`（键、描述和提示词 skill 名称）和 `dv_models_get`（一个条目的键、描述和 `schema()`：限制、输入，以及 `extra` 的参数）读取模型目录。`packages/dv/models/tests/models.spec.ts` 检查两个工具都不点名媒体类型。

任务标签来自原语声明：`GenerationSpec.tasks` 为每个任务给出中文和英文标签，生成的服务用 `dvModels.labelTasks` 注册它们，`@dv/api` 在 `GET /api/dv/tasks` 提供它们，UI 包用 `packages/dv/ui-kit/src/client/tool-labels.ts` 的 `taskLabel` 显示它们。

### `defineGeneration` 与 `GenerationApi`

`defineGeneration`（`packages/dv/generation/src/index.ts`）固定所有不依赖签名的部分。该服务注册组件和任务标签，并通过 `whileServing` 注册操作，因此操作及其 agent 工具只在有模型服务其某个任务期间存在。参数依次是四个键字段和 `prompt`、声明自己的参数，然后是 `seed`（除非声明设置 `seed: false`）和 `extra`。每个生成操作都有 `deterministic: false`、`resource: 'gpu'`、`confirm: 'over_gpu_budget'` 和版本 `1`。`estimate` 是必需的，没有报告成本的记录以估计值作为成本。在任何记录之前，前置条件用 `check` 的每条理由拒绝调用；`execute` 在模型运行前再次校验请求。

声明只提供不同的代码：`toRequest` 由模型的事实、参数、输入和种子构建请求；`toOutputs` 导入结果（`importOne` 导入一个输出）；`estimate`、`summarize`，以及可选的 `confirmText`、`toolParams` 和 `prepareToolCall`。

该服务还为工作流实现 `GenerationApi`：`render`、`check(call, state, chained?)`、`estimate`、`findTake(state, call, where)` 和 `parseInputs`。链式角色以 `ref: null` 到达 `toRequest`，因此角色计数和提示词引用能看到它，而模型检查等到 `execute` 才运行；渲染路径不传入链式角色。`findTake` 只比较已声明的参数和输入。[工作流 note](2026-10-17-dv-architecture-workflows.zh.md) 负责 `@dv/workflow-kit` 如何使用这些方法。

### 基于辅助库的 `shot.render`

`@dv/shot-render` 是 `class DvShotRender extends defineGeneration(RENDER_DECLARATION)`：组件 `shot`、操作 `shot.render`、原语 `video`、任务 `t2v`（文字生成 / From text）和 `ref2v`（参考图生成 / From references）。其仅限工具的参数 `continue_from` 在 `prepareToolCall` 中变为 `first_frame` 输入；`toOutputs` 存储视频及其最后一帧静帧；`estimate` 用时长乘以条目的 `gpuSecondsPerVideoSecond`。

### 模型线 skill

模型目录拥有 skill `video-model-selection`。提供方以 `ModelEntry.promptSkill` 为每个模型和任务提供一个提示词 skill；`dvModels` 在条目存续期间注册它，仅供 agent 使用，提供方自己不注册任何 skill。提示词 skill 的描述写明模型和任务，不提及任何工具。模型目录和提供方的 skill 只使用模型目录的词，从不点名消费方的操作或工具（例如 `shot.render` 或 `dv_shot_render`），也不使用 `plan` 这类工作流词。[适应度测试 note](../process/2026-10-17-dv-architecture-fitness-test.zh.md) 负责执行这些规则的检查。

### 添加原语

原语包添加一个原语时不修改任何其他包：

1. 在包自己的源码中声明行和任务，例如 `declare module '@dv/models' { interface PrimitiveTypes { image: {…} } interface TaskMap { t2i: 'image' } }`，并带上 `gpuSecondsPerCall` 这类 entry 字段。
2. 默认导出 `defineGeneration({...})`，其中包含任务及其标签、输入角色、输出、`toRequest`、`toOutputs`、`estimate` 和 `summarize`。
3. 提供方用 `import type` 从原语包导入请求类型（这是提供方唯一允许的对领域包的导入），从一个必需的配置字段填入 entry 字段，并注册自己的条目。
4. bundle 挂载该原语包和提供方。

没有任何原语具备的输入角色需要自己的原语：口型同步由 `shot.render` 所没有的输入角色生成视频，因此它是独立的原语包。输入角色已知的任务需要修改其提供方、其原语声明中的 `tasks` 记录，以及 `@dv/shot-plan` 的任务规则（`takesReferences`、`takesFirstFrame`）。`@dv/models` 之外只服务视频任务的测试 fake 用 `TaskOfPrimitive<'video'>` 为任务定型，因此添加一行 `TaskMap` 不会破坏其他包的测试。[UI 注册表 note](2026-10-17-dv-architecture-ui-registries.zh.md) 负责画布如何显示任意生成操作的记录。

## 曾考虑的替代方案

**每种媒体类型一个插件和一行模型目录，所有行都声明在 `@dv/models` 中。** 它落选，因为口型同步是用其他输入角色输出视频，所以按模态作键会导致第二次破坏性变更，而行放在模型目录中会让每个原语都修改 `@dv/models`。每个签名一个操作只增加一个包，不触及其他包。

**一个通用的 `generate` 操作。** 它落选，因为内核在操作注册时就固定 `inputs`、`outputs` 和 `confirm`。视频有两个输出而图像只有一个，所以一个操作需要角色的联合，每个读取方都要按参数分支。

**由提供方注册操作。** 它落选，因为计划把模型键当作数据保存，而且每个提供方都要复制记录代码。

**把辅助库放进 `@dv/models`。** 它落选，因为模型目录随之就要写记录。

**每个条目上的 `estimate(params)` 方法取代 entry 字段。** 它落选，因为 `OperationSpec.estimate` 必须是同步的，而且提供方将要读取 `duration_sec` 这类原语参数名。

**`OperationSpec` 上的 `kind: 'generation'` 字段。** 它落选，因为它把一个层名词放进内核；UI 改为读取 `deterministic`、`resource` 和输出类型。

**每个声明可选的 `confirm` 和可选的 `estimate`。** 它落选，因为图像和音频随之跳过 GPU 确认，也不记录成本。

**由提供方自己注册提示词 skill。** 它落选，因为两个提供方复制了注册代码，而共享的 `prompt` 描述承诺了一个某任务并不具备的 skill。

**UI 分支中的任务标签。** 它落选，因为在每项测试都通过的同时，创作者在中文界面中看到了原始任务名称。标签经由模型目录传递，因为 `OperationSpec.label` 每个操作只有一个标签。

**重命名 `shot.render`。** 它落选，因为 `findTake` 匹配 `record.operation`，take 编辑器也重新运行 `record.operation`，所以重命名会让每个已存储的镜头重新渲染。

**为链式角色在 `GenerationCall` 上加 `pending` 字段。** 它落选，因为 `check` 的参数从类型上就无法到达 `render`，而且「pending」在内核中已经指一种记录状态。

**在记录之前为链式角色做部分模型检查。** 它落选，因为模型检查读取每个素材的媒体类型，所以它需要一个占位素材，或在每个提供方中增加第二个检查方法。

## 后果

共享代码只需付出一次：`packages/dv/generation/src/index.ts` 有 309 行，`packages/dv/shot-render/src/index.ts` 有 357 行，而在使用 `defineGeneration` 之前为 488 行。为衡量这一设计而把图像和音频生成重建为原语包时，没有修改 `@dv/models` 的任何文件（此前的改动分别修改了六个和四个），`defineGeneration` 调用约 20 行。图像生成修改的外部文件从两个包中的 7 个降到 2 个只改类型行的测试文件，音频生成修改的包从三个降到一个，即其提供方。一个口型同步原语没有修改其他包，而故事工作流中的一个口型同步步骤修改了 `@dv/workflow-story` 和 `@dv/shot-plan` 的 21 行源码，项目负责人此前估计要修改七个包。

每个生成操作在超出轮次 GPU 限额时都要求确认并需要估计值，即使模型很便宜也是如此；它的版本固定为 `1`，所以声明无法标记其参数的变化。模型只在 `execute` 中检查未完成或链式的输入，因此该拒绝会让记录失败，而不是拒绝调用。操作及其工具随其任务的第一个条目出现、随最后一个条目离开，这会改变 agent 看到的工具列表。为已有标签的任务再加标签的第二个声明无法启动。

视频是仓库中唯一的原语，所以 `RenderRequest`、`RenderModelFacts` 和 `video-model-selection` skill 都是视频专用的，并位于拥有视频行的模型目录中。输入角色已知的任务仍要修改 `@dv/shot-plan` 的任务规则，而另一种值类型（例如 3D 网格）还要修改内核，因为 `packages/dv/project/src/types.ts` 中的 `OperationValueType` 是封闭的联合类型。
