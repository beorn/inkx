---
layout: page
title: Theme Explorer
---

<script setup>
import ThemeExplorer from './.vitepress/components/ThemeExplorer.vue'
</script>

# Theme Explorer

Browse 84 color schemes, preview how they look, or generate a custom theme from any color. Every theme on this page is a [Sterling](/reference/sterling) Theme — silvery's canonical design system as of 0.20.0.

Letting users pick one of these from your CLI? [`withTheme`](/reference/commander#theme-selection-withtheme) adds a `--theme` flag (named scheme, palette file, or terminal `detect`). Its default is non-probing — full OSC palette detection is opt-in (`--theme detect`), because probing costs ~450 ms and isn't 100% reliable across terminals.

::: tip New in 0.20.0 — Sterling is THE Theme
silvery 0.20.0 ships [Sterling](/reference/sterling) as the one-and-only Theme shape. Nested role objects (`theme.accent.bg`) plus flat hyphen-keys (`theme["bg-accent"]`) on the same frozen object. Full migration map for the legacy `$tokens` is in the [Sterling primer](/reference/sterling#migrating-from-pre-0-20-0).
:::

<ThemeExplorer />
