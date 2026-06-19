---
title: Theme Explorer
description: Browse Silvery color schemes and preview the Sterling tokens they derive.
---

<script setup>
import ThemeExplorer from './.vitepress/components/ThemeExplorer.vue'
</script>

# Theme Explorer

Browse built-in terminal color schemes, inspect the Sterling tokens they derive, and copy theme
configuration.

::: info New in 0.20.0
Silvery uses the Sterling theme shape. Sterling exposes nested role objects such as
`theme.accent.bg` and flat keys such as `theme["bg-accent"]` on the same object.

See the [migration notes](/reference/sterling#migrating-from-pre-0-20-0) for legacy token mappings.
:::

<ThemeExplorer />
