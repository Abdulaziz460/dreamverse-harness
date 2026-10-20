# Character

A character is a reference kind that keeps reference images, and a shot names a version of it as the input `<id>@<version>`, such as `c1@1`. Create characters during project setup, after `dv_asset_import` of the user's reference images and before any render.

## Create

- `dv_character_create` for every person who must stay the same across shots: `character` (short ID such as `c1`), `name`, `description` (wardrobe and mood only, never facial features), `inputs.reference` (the imported asset IDs).

## Update

`dv_character_update` writes the next version: `character` = the character ID, and `inputs.reference` = [new asset ID] for a new image. Every record that used the old version becomes stale. Nothing is redone by itself: list the stale shots, ask in bold which to redo, and redo only the agreed ones as retakes with `inputs.reference` = `c1@<new version>`.
