---
description: "Story workflow of DreamVerse: the dvStory service with the read story.preview, which reports what approving a shot plan version renders, its GPU estimate and every render refusal, without writing; open it to change how a plan version is previewed."
kind: "package-reference"
---

# @dv/workflow-story

English | [中文](README.zh.md)

## Summary

Use this package to preview a shot plan version before the user approves it. Its read `story.preview` (tool `dv_story_preview`) lists each shot as rendered or kept, counts the shots that render, sums their GPU estimate, and lists every reason a render would be refused. It writes nothing. The shots come from `dvShotPlan.shots`, the shot walk of `@dv/workflow-kit` picks the take each shot keeps, and `dvShotRender` estimates and checks each shot that renders.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after `@dv/project`, `@dv/shot-plan`, `@dv/shot-render` and `@dv/timeline`. It has no configuration and registers the component key `story`.

```yaml
- id: dv-story
  name: '@dv/workflow-story'
```

| Operation | Tool | Params | Report |
| --- | --- | --- | --- |
| `story.preview` | `dv_story_preview` | `plan` (required, the PlanId), `version` (default: the latest) | `{plan, version, shots, rendered, gpu_seconds, problems}`: one line per shot, the number of shots that render, the sum of their `dvShotRender.estimate`, and `Shot <n>: <reason>` per refusal |

The operation's label is 预览分镜计划 / Preview plan. A rendered shot's line is `shot <n> (<modality>/<task>/<provider>/<model>, <d> s, continues from the previous shot): <first 80 characters of the prompt>`; a kept shot's line is `shot <n>: keeps its take`. An unknown plan or version fails the call with `invalid_params`; a reference that does not parse fails it with the error of `dvShotRender.parseInputs`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`story.preview` maps each shot of `dvShotPlan.shots` to render params with `walkShot` and calls `planShots` with `dvShotRender` and `takeFilter`. A done render is a take of the plan when the starter of its chain (`chainStarter`: its own `started_by`, else that of its `based_on` root) is a `story.approve` record of the plan. So a free take, a take of another plan and a take of `plan.approve` are never kept. Each shot that renders goes through `checkShots`: a continuing shot after a kept take carries that take's last still as `first_frame`; after a shot that renders, the role `first_frame` is chained, so the model check waits for that render. Each line comes from `shotLine`, and `gpu_seconds` is the sum of `dvShotRender.estimate` over the shots that render.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | `dvStory`: `story.preview`, the plan walk, the preview lines and the problems |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/workflow-kit`](../workflow-kit/README.md): `walkShot`, `planShots`, `takeFilter`, `checkShots` and `shotLine`.
- [`@dv/shot-plan`](../shot-plan/README.md): plans, versions and `dvShotPlan.shots`.
- [`@dv/shot-render`](../shot-render/README.md): `check`, `estimate` and `findTake` of `dvShotRender`.

-----

<a id="model-experience"></a>
## Model Experience

### Tool definitions

#### What the model sees

One tool, `dv_story_preview`, in the format `@dv/project` gives every operation tool, with the hint "A read that writes no record." The description says that the call previews what approving a plan version renders without rendering, names the report fields, tells the agent to show the lines and `gpu_seconds` to the user, and to update the plan with `dv_plan_update` and preview again when `problems` is not empty.

#### Token effect

About 200 tokens for the definition, fixed while the plugin is mounted.

#### KV Cache effect

The definition sits in the stable tool section of every agent request; mounting or removing the plugin changes the tool list and invalidates the cached prefix from the tool section on.

### Tool results

#### What the model sees

One text block: `done: dv_story_preview answered`, the params, and the report.

#### Token effect

About 60 tokens, plus about 30 per shot line and per problem.

#### KV Cache effect

Each result is appended to the conversation after its call; the cached prefix stays intact.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Preview only** — the package registers no approval operation and no reducer; `plan.approve` of `@dv/shot-plan` renders an approved version, and the preview lists a shot that `plan.approve` rendered as rendering again. The DreamVerse bundle does not mount the package, so no agent sees `dv_story_preview`.
