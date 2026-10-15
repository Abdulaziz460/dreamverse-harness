# Agent Note: Prompt media citations

Status: proposed

English | [中文](2026-10-15-prompt-media-citations.zh.md)

## Problem

A render call takes a `prompt` and a separate `reference` list. The prompt names each reference with a MiniMax H3 token, such as `<Picture 1>`. This design has three problems:

1. The agent writes two inputs, and the two inputs can disagree.
2. The tokens work for one model only. Other video models use a different syntax.
3. A person who reads the prompt cannot see which media each token names.

## Proposal

The prompt cites media directly. The harness reads the send list from the citations. Each model plugin changes the citations to the syntax of its model. Existing prompts and projects do not need migration.

### Terms

- **Citation**: text in a prompt that names one project item, written as `@[<label>](dv:<kind>/<id>)`.
- **Element**: a named group of reference media in a project, with versions. An element is a harness concept for people and the agent. A video model does not know elements.
- **Send list**: the assets that one render sends to the model plugin.
- **Reference area**: the list of media beside the prompt in the take editor.
- **Staged item**: an item in the reference area that the prompt does not cite.

### Ownership

| Step                                                        | Owner                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| Define the citation syntax and parse citations              | `@dv/project`                                              |
| Insert and show citations in the UI                         | `@dv/ui-composer` and `@dv/ui-canvas`, after `@dv/project` |
| Read the send list, expand elements, and return warnings    | `@dv/shot-render`                                          |
| Declare the reference limits and change the citation syntax | Each model plugin, for example `@dv/fastvideo`             |

`@dv/project` owns the citation syntax because the project holds the records and the history that the citations name. `@dv/models` is only the catalog of the registered models.

### Rules

1. A prompt can cite an asset, the first frame, or one version of an element.
2. `shot.render` has no `reference` parameter. The send list is the cited assets in the order of their first citation. A plan shot uses the same rule.
3. The reference area holds cited items and staged items. If a user deletes an item that the prompt cites, then the UI refuses the deletion and highlights each citation of the item. If a user deletes a citation, then the item stays as a staged item.
4. If the reference area holds staged items, then `shot.render` does not render and returns a warning. The agent or the user must choose to send the staged items or not.
5. The first frame stays in the `continue_from` field. If the prompt cites the first frame and the field is empty, then `shot.render` returns an error.
6. An element citation includes the element version. At render time, the harness expands each element citation into citations of the element media. The agent and the model plugins do not expand elements.
7. Each take keeps the source prompt and the expanded prompt. The `shot.render` result includes the expanded prompt.
8. Each model plugin declares the maximum number of references. If the expanded prompt cites more references, then `shot.render` does not render and returns a warning.

### Delivery

- Each pull request depends only on merged pull requests. Open the next pull request after its base merges.
- Each pull request changes at most about 300 lines outside tests.
- After each merge, `main` works.

The pull requests come in this order:

1. This Agent Note.
2. The citation parser in `@dv/project`, and the change to `<Picture N>` in `@dv/fastvideo`. A prompt without citations renders as before.
3. The send list from the prompt in `shot.render` and in plan shots, with the tool descriptions and the skills.
4. The citation thumbnails in the take editor and the plan view.
5. The reference area and the staged-item warning.
6. The first-frame citation.
7. Element citations and their expansion.
8. Video citations.
9. Audio citations.

## Alternatives considered

**Separate reference list.** The two inputs can disagree. A prompt that is the only source of the send list prevents this error.

**Model tokens in the prompt.** Each video model uses a different syntax. Positional tokens also change their numbers when the reference order changes.

**Send staged items automatically.** This decides for the agent or the user. The harness returns a warning instead.

**Delete a cited item after a warning.** The deletion leaves a citation without a target.

**Cite only single media of an element.** The user must select each medium every time. Video products that group reference media insert one citation for the group.

**Expand elements in the agent.** The agent must find the media of each element, and the prompt loses the group.

**Expand elements in each model plugin.** Each plugin must know elements, and each plugin repeats the same code.

**Drop the media over the limit.** The harness removes media silently and decides for the agent or the user.

## Acceptance criteria

1. `shot.render` has no `reference` parameter, and the send list comes from the prompt.
2. For a prompt that cites one image, `@dv/fastvideo` sends `<Picture 1>` and that image.
3. A render with staged items, or with more references than the model maximum, returns a warning and does not render.
4. An element citation expands into the media of that element version, and the take keeps both prompts.

## Risks

1. The agent tool contract changes. Prompts that use `<Picture N>` tokens do not work after the change.
2. The harness sets the text of an expanded element. A model can follow this text less well than text that its plugin writes.
