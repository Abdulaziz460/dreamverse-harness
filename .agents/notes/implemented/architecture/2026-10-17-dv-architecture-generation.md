# Agent Note: DreamVerse generation — model catalog, primitives and defineGeneration

Status: implemented

English | [中文](2026-10-17-dv-architecture-generation.zh.md)

## Problem

Between the DreamVerse model catalog and the provider plugins that serve models sat one plugin per media type: shot render for video, plus image generate and audio generate. That layer turned one model call into one project record, with fixed params, input roles and outputs, a check before the record, a GPU confirmation and the asset import. But it was cut by media type, while what varies between models is the input and output signature of a call. The image and audio packages were near copies: the audio file matched the image file in 106 of its 134 lines.

Each added media type also edited shared packages. The image-generation change touched 35 files and the audio-generation change 37. Both declared their types inside `@dv/models` (`packages/dv/models/src/types.ts`), although that file's own comment said a plugin adds its types by declaration merging, and both edited `packages/dv/ui-kit/src/client/tool-labels.ts`. The image and audio operations never asked the user to confirm GPU use and recorded `gpu_seconds: 0`, so the GPU sum of an agent turn never counted them. Two providers copied the same prompt-skill registration code, and provider skill text named the `dv_shot_render` tool. Task labels lived in UI switches that knew only the video tasks, so the Chinese interface showed raw names such as `<model> · t2i`. By the project owner's estimate, adding one lip-sync stage meant changing seven packages.

## Decision

Generation has three parts (the [layers note](2026-10-17-dv-architecture-layers.md) owns the layer map):

- `@dv/models` (base layer) is the model catalog, the `dvModels` service, into which provider plugins register entries. It is a [capability seam](2026-06-13-capability-seams.md).
- `@dv/generation` (base layer) is a library. `defineGeneration(spec)` turns the declaration of one primitive into a Cordis service with one component key and one operation. It names no primitive.
- One primitive package (domain layer) per input and output signature declares its types and calls `defineGeneration`. `@dv/shot-render` is the only primitive package in the repository.

A *primitive* is one input and output signature of a model call: one package, one component key, one operation and one `defineGeneration` call. A *task* names which inputs a model uses, and each task runs on one primitive.

### The catalog keyed by primitive and task

`packages/dv/models/src/types.ts` declares two open interfaces. `PrimitiveTypes` holds one row per primitive with its `modality`, the `facts` a request is built from, the `request`, the `result` of `render`, and the `entry` fields that only this primitive reads. `TaskMap` maps each task to its primitive. The catalog declares only the `video` row (entry field `gpuSecondsPerVideoSecond`) and the tasks `t2v` and `ref2v`; another package adds a row or a task through `declare module '@dv/models'`. `ModelEntry<T>` takes the types of the row that task `T` runs on.

One entry is one model of one provider serving one task, keyed `modality/task/provider/model`. A Consumer reaches entries only through its task list: `resolve(tasks, params)` returns the entry that the call's key fields name, or throws a refusal that names `dv_models_list`; `whileServing(tasks, start)` keeps a registration alive while an entry serves one of the tasks. The catalog registers no operation and writes no record.

The agent reads the catalog with `dv_models_list` (keys, descriptions and prompt-skill names) and `dv_models_get` (one entry's key, description and `schema()`: limits, inputs, and the params of `extra`). `packages/dv/models/tests/models.spec.ts` checks that neither tool names a media type.

Task labels come from the primitive declarations: `GenerationSpec.tasks` gives each task a Chinese and an English label, the generated service registers them with `dvModels.labelTasks`, `@dv/api` serves them at `GET /api/dv/tasks`, and UI packages show them with `taskLabel` of `packages/dv/ui-kit/src/client/tool-labels.ts`.

### `defineGeneration` and `GenerationApi`

`defineGeneration` (`packages/dv/generation/src/index.ts`) fixes everything that does not depend on the signature. The service registers the component and the task labels, and registers the operation through `whileServing`, so the operation and its agent tool exist only while a model serves one of its tasks. The params are the four key fields and `prompt`, the declaration's params, then `seed` (unless the declaration sets `seed: false`) and `extra`. Every generation operation has `deterministic: false`, `resource: 'gpu'`, `confirm: 'over_gpu_budget'` and version `1`. `estimate` is required, and a record without a reported cost keeps the estimate. Before any record, the precondition refuses a call with every reason of `check`; `execute` validates the request again before the model runs.

The declaration supplies only the code that differs: `toRequest` builds the request from the model's facts, params, inputs and seed; `toOutputs` imports the result (`importOne` imports one output); `estimate`, `summarize`, and the optional `confirmText`, `toolParams` and `prepareToolCall`.

The service also implements `GenerationApi` for workflows: `render`, `check(call, state, chained?)`, `estimate`, `findTake(state, call, where)` and `parseInputs`. A chained role reaches `toRequest` with `ref: null`, so role counts and prompt citations see it while the model check waits for `execute`; the render path passes no chained role. `findTake` compares only the declared params and the inputs. The [workflows note](2026-10-17-dv-architecture-workflows.md) owns how `@dv/workflow-kit` uses these methods.

### `shot.render` on the helper

`@dv/shot-render` is `class DvShotRender extends defineGeneration(RENDER_DECLARATION)`: component `shot`, operation `shot.render`, primitive `video`, tasks `t2v` (文字生成 / From text) and `ref2v` (参考图生成 / From references). Its tool-only argument `continue_from` becomes a `first_frame` input in `prepareToolCall`; `toOutputs` stores the video and its last still; `estimate` multiplies the duration by the entry's `gpuSecondsPerVideoSecond`.

### Model-line skills

The catalog owns the skill `video-model-selection`. A provider ships a prompt skill per model and task as `ModelEntry.promptSkill`; `dvModels` registers it while the entry lives, for the agent only, and the provider registers no skill itself. A prompt skill's description names the model and the task and no tool. Catalog and provider skills use only the catalog's words and never name a consumer's operation or tool, such as `shot.render` or `dv_shot_render`, nor a workflow word such as `plan`. The [fitness test note](../process/2026-10-17-dv-architecture-fitness-test.md) owns the checks that enforce this.

### Adding a primitive

A primitive package adds a primitive without editing any other package:

1. Declare the row and the tasks in the package's own source, such as `declare module '@dv/models' { interface PrimitiveTypes { image: {…} } interface TaskMap { t2i: 'image' } }`, with entry fields such as `gpuSecondsPerCall`.
2. Default-export `defineGeneration({...})` with the tasks and their labels, the input roles, the outputs, `toRequest`, `toOutputs`, `estimate` and `summarize`.
3. A provider imports the request type from the primitive package with `import type`, the only import of a domain package that a provider may make, fills the entry fields from a required config field, and registers its entries.
4. The bundle mounts the primitive package and the provider.

Input roles that no primitive has require their own primitive: lip sync produces video from input roles that `shot.render` lacks, so it is its own primitive package. A task with known roles edits its provider, the `tasks` record of its primitive's declaration, and the task rules of `@dv/shot-plan` (`takesReferences`, `takesFirstFrame`). Video-only test fakes outside `@dv/models` type their tasks as `TaskOfPrimitive<'video'>`, so an added `TaskMap` row breaks no other package's test. The [UI registries note](2026-10-17-dv-architecture-ui-registries.md) owns how the canvas shows the records of any generation operation.

## Alternatives considered

**One plugin and one catalog row per media type, all rows declared in `@dv/models`.** It lost because lip sync is video out with other input roles, so a modality key forces a second breaking change, and rows in the catalog make every primitive edit `@dv/models`. One operation per signature adds one package and touches no other.

**One generic `generate` operation.** It lost because the kernel fixes `inputs`, `outputs` and `confirm` when an operation registers. Video has two outputs and image one, so one operation needs a union of roles, and every reader branches on params.

**Operations registered by providers.** It lost because a plan keeps the model key as data, and each provider would copy the record code.

**The helper inside `@dv/models`.** It lost because the catalog would then write records.

**An `estimate(params)` method on each entry in place of entry fields.** It lost because `OperationSpec.estimate` must be synchronous, and providers would read primitive param names such as `duration_sec`.

**A `kind: 'generation'` field on `OperationSpec`.** It lost because it puts a layer noun into the kernel; the UI reads `deterministic`, `resource` and the output types instead.

**An optional `confirm` and an optional `estimate` per declaration.** It lost because image and audio then skipped the GPU confirmation and recorded no cost.

**Providers that register their own prompt skills.** It lost because two providers copied the registration, and the shared `prompt` description promised a skill that one task lacked.

**Task labels in UI switches.** It lost because a creator read raw task names in the Chinese interface while every test passed. The labels travel through the catalog because `OperationSpec.label` holds one label per operation.

**Renaming `shot.render`.** It lost because `findTake` matches `record.operation` and the take editor reruns `record.operation`, so a rename renders every stored shot again.

**A `pending` field on `GenerationCall` for chained roles.** It lost because a `check` argument cannot reach `render`, by type, and "pending" already names a record status in the kernel.

**A partial model check before the record for chained roles.** It lost because the model check reads each asset's media type, so it would need a placeholder asset or a second check method in every provider.

## Consequences

The shared code is paid once: `packages/dv/generation/src/index.ts` has 309 lines, and `packages/dv/shot-render/src/index.ts` has 357 lines, against 488 before it used `defineGeneration`. Image and audio generation, rebuilt as primitive packages to measure this design, changed no file of `@dv/models` (the earlier changes edited six and four), with `defineGeneration` calls of about 20 lines. Image generation went from 7 edited files in two outside packages to 2 test files with type lines only, and audio generation from three edited packages to one, its provider. A lip-sync primitive edited no other package, and a lip-sync step in the story workflow edited `@dv/workflow-story` and 21 source lines of `@dv/shot-plan`, against the project owner's estimate of seven packages.

Every generation operation asks for confirmation past the turn's GPU limit and needs an estimate, even for a cheap model, and has version `1`, so a declaration cannot mark a change of its params. The model checks an unfinished or chained input only in `execute`, so that refusal fails the record instead of refusing the call. The operation and its tool appear with the first entry of its tasks and leave with the last, which changes the tool list the agent sees. A second declaration that labels an already labeled task fails to start.

Video is the only primitive in the repository, so `RenderRequest`, `RenderModelFacts` and the `video-model-selection` skill are video-specific and live in the catalog that owns the video row. A task with known roles still edits the task rules of `@dv/shot-plan`, and another value type, such as a 3D mesh, also edits the kernel, because `OperationValueType` in `packages/dv/project/src/types.ts` is a closed union.
