# Elysia brand assets

`elysia/wordmark.svg` is the supplied company logo. `elysia/symbol.svg` is its cropped symbol, used for provider and application icons.

Run `vp run icons:export` to regenerate desktop, web and mobile icon assets from the SVG. Run `vp run icons:check` to compare the generated files with their source. Run `vp run icons:export:android` to generate Android foreground and splash images within the platform's safe area.

The upstream Icon Composer projects in `dev`, `nightly` and `prod` remain dormant for compatibility with upstream changes. Elysia uses the same company symbol across build variants.
