---
description: "Browser half of the DreamVerse shot render: the chat card of a dv_shot_render call, with the model and task, the prompt, the status, the rendered video, and a Show in history link."
kind: "package-reference"
---

# @dv/ui-shot-render

English | [中文](README.zh.md)

## Summary

Use this package to show the calls of the shot render tool `dv_shot_render` (operation `shot.render` of `@dv/shot-render`) as cards in the DSH chat. A card shows the tool's name 渲染镜头 / Render shot, the model and the generation task of the call, the prompt, the status, the rendered video, and, once the call settled, the link 在历史中查看 / Show in history.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a profile that stacks `dsh-web-app` (which provides the chat and the UI slots) and `@dv/api` (which serves `GET /api/dv/operations` and `GET /api/dv/tasks`). Build the browser bundle first: `pnpm run build` writes `lib/client.js`.

```yaml
- id: dv-ui-shot-render
  name: '@dv/ui-shot-render'
```

The Host half registers nothing. The browser half registers one `tool.call.toolview` entry with key `dv_shot_render` at the default priority 0. `@dv/ui-composer` registers a row for every operation tool at priority 1 and a row for every `DV_TOOL_LABELS` tool at priority 0.5, so the card renders in their place; without this package a `dv_shot_render` call shows the composer's plain tool row.

| Card part | Value |
| --- | --- |
| Title | `operationLabel('shot.render', …)` of `@dv/ui-kit`: the operation's label in `GET /api/dv/operations` (渲染镜头 / Render shot), else `shot.render` |
| Model line (`data-testid="dv-composer-render-model"`) | The call's `model` and its `task` by its label in `GET /api/dv/tasks`, else by its name, joined by ` · ` (for example `fasth3 · 参考图生成` / `fasth3 · From references` for task `ref2v`) |
| Prompt | The call's `prompt` |
| Status | 渲染中… / Rendering… until the call settles, then 已渲染 / Rendered, or 未渲染 / Not rendered for a failed call |
| Video | The first video output in the result's presentation metadata, with controls and muted |
| 在历史中查看 / Show in history (`data-testid="dv-composer-open-history"`) | On a settled call; dispatches `dv:history-focus` `{session, toolCall}`, and the History panel selects the record that the call wrote |

The card shows what it has while the arguments stream. Until the two lists load, or when a read fails, the title falls back as the table says and the model line shows the task name.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Each mounted card reads `GET /api/dv/operations` and `GET /api/dv/tasks` once, through `useOperations` and `useTaskLabels` of `@dv/ui-kit`. The parsed arguments, the outputs and the history link come from `@dv/ui-kit/tool-rows.tsx`, which the tool rows of `@dv/ui-composer` share.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The inert Host Loader entry |
| [`src/css-modules.d.ts`](src/css-modules.d.ts) | The type of the CSS Module imports |
| [`src/client/index.ts`](src/client/index.ts) | The `tool.call.toolview` entry of `dv_shot_render` and the label reads |
| [`src/client/RenderCard.tsx`](src/client/RenderCard.tsx) | `RenderCard` |
| [`src/client/render-card.module.css`](src/client/render-card.module.css) | Styles of the card and of its history link |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/shot-render`](../shot-render/README.md): the `shot.render` operation and its agent tool.
- [`@dv/ui-composer`](../ui-composer/README.md): the tool rows and the tool names in the chat.
- [`@dv/ui-kit`](../ui-kit/README.md): `operationLabel`, `taskLabel` and the tool-row helpers.

-----

<a id="model-experience"></a>
## Model Experience

None; the package sends nothing to a model.

#### KV Cache effect

None; the package sends nothing to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Composer test IDs** — the model line keeps the test ID `dv-composer-render-model` from `@dv/ui-composer`, and the history link is the shared `HistoryLink` of `@dv/ui-kit`, whose test ID `dv-composer-open-history` the e2e story `history.e2e.ts` selects on tool rows.
