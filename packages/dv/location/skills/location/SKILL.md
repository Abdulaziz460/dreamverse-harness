# Location

A location is a reference kind that keeps reference images, and a shot names a version of it as the input `<id>@<version>`, such as `l1@1`. Create locations during project setup, after `dv_asset_import` of the user's reference images and before any render.

## Create

- `dv_location_create` only when one place must stay identical across shots.

## Update

`dv_location_update` writes the next version: `location` = the location ID, and `inputs.reference` = [new asset ID] for a new image. Every record that used the old version becomes stale. Nothing is redone by itself: list the stale shots, ask in bold which to redo, and redo only the agreed ones as retakes with `inputs.reference` = `l1@<new version>`.
