# Story bible

Characters, locations and styles are the reference kinds of the story bible. Each one keeps reference images, and a shot names a version of it as the input `<id>@<version>`, such as `c1@1`. Create them during project setup, after `dv_asset_import` of the user's reference images and before any render.

## Create

- `dv_bible_character_create` for every person who must stay the same across shots: `character` (short ID such as `c1`), `name`, `description` (wardrobe and mood only, never facial features), `inputs.reference` (the imported asset IDs).
- `dv_bible_style_create` only when the user named a look (film grain, palette, lens): `style` (such as `s1`), `name`, `description`.
- `dv_bible_location_create` only when one place must stay identical across shots.

## Update

`dv_bible_character_update` (or a style or location update) writes the next version: `character` = the character ID, and `inputs.reference` = [new asset ID] for a new image. Every record that used the old version becomes stale. Nothing is redone by itself: list the stale shots, ask in bold which to redo, and redo only the agreed ones as retakes with `inputs.reference` = `c1@<new version>`.

When the user asks for a look later (换风格 / 加胶片感), call `dv_bible_style_create` (or `dv_bible_style_update`), then propose retakes that add `s1@1` to `inputs.reference`; retakes need the user's agreement, asked in bold.
