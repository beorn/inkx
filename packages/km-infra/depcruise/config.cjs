/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // --- No upward imports: packages/ cannot import from apps/ ---
    {
      name: "no-packages-to-apps",
      comment: "Packages must not import from app layer",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },

    // --- Layer order: @km/commands sits above @km/board ---
    {
      name: "no-board-to-commands",
      comment: "@km/board cannot import from @km/commands (higher layer)",
      severity: "error",
      from: { path: "^packages/km-board/" },
      to: { path: "^packages/km-commands/" },
    },

    // --- Layer order: @km/tree cannot import from @km/board or @km/commands ---
    {
      name: "no-tree-to-board",
      comment: "@km/tree cannot import from @km/board (higher layer)",
      severity: "error",
      from: { path: "^packages/km-tree/" },
      to: { path: "^packages/km-board/" },
    },
    {
      name: "no-tree-to-commands",
      comment: "@km/tree cannot import from @km/commands (higher layer)",
      severity: "error",
      from: { path: "^packages/km-tree/" },
      to: { path: "^packages/km-commands/" },
    },

    // --- Layer order: @km/storage cannot import from @km/board or @km/commands ---
    {
      name: "no-storage-to-board",
      comment: "@km/storage cannot import from @km/board (higher layer)",
      severity: "error",
      from: { path: "^packages/km-storage/" },
      to: { path: "^packages/km-board/" },
    },
    {
      name: "no-storage-to-commands",
      comment: "@km/storage cannot import from @km/commands (higher layer)",
      severity: "error",
      from: { path: "^packages/km-storage/" },
      to: { path: "^packages/km-commands/" },
    },

    // --- Layer order: @km/markdown cannot import from anything above @km/core ---
    {
      name: "no-markdown-to-tree",
      comment: "@km/markdown cannot import from @km/tree (higher layer)",
      severity: "error",
      from: { path: "^packages/km-markdown/" },
      to: { path: "^packages/km-tree/" },
    },
    {
      name: "no-markdown-to-storage",
      comment: "@km/markdown cannot import from @km/storage (peer/higher layer)",
      severity: "error",
      from: { path: "^packages/km-markdown/" },
      to: { path: "^packages/km-storage/" },
    },
    {
      name: "no-markdown-to-board",
      comment: "@km/markdown cannot import from @km/board (higher layer)",
      severity: "error",
      from: { path: "^packages/km-markdown/" },
      to: { path: "^packages/km-board/" },
    },
    {
      name: "no-markdown-to-commands",
      comment: "@km/markdown cannot import from @km/commands (higher layer)",
      severity: "error",
      from: { path: "^packages/km-markdown/" },
      to: { path: "^packages/km-commands/" },
    },

    // --- @km/core cannot import from any other @km/* package ---
    {
      name: "no-core-to-km",
      comment: "@km/core is the bottom layer - cannot import from any @km/* package",
      severity: "error",
      from: { path: "^packages/km-core/" },
      to: {
        path: "^packages/km-(tree|storage|board|commands|markdown|agent|beads|connector)/",
      },
    },

    // --- Peer isolation: @km/tree and @km/storage cannot import from each other ---
    {
      name: "no-tree-to-storage",
      comment: "@km/tree and @km/storage are peer layers - no cross-imports",
      severity: "error",
      from: { path: "^packages/km-tree/" },
      to: { path: "^packages/km-storage/" },
    },
    {
      name: "no-storage-to-tree",
      comment: "@km/tree and @km/storage are peer layers - no cross-imports",
      severity: "error",
      from: { path: "^packages/km-storage/" },
      to: { path: "^packages/km-tree/" },
    },

    // --- No cross-package circular dependencies ---
    {
      name: "no-circular",
      comment: "No circular dependency chains across package boundaries",
      severity: "warn",
      from: { path: "^(packages|apps)/" },
      to: { circular: true },
    },

    // --- Vendor independence: vendor/ packages cannot import from @km/* or apps/ ---
    {
      name: "no-vendor-to-km",
      comment: "Vendor packages must not import from @km/* packages",
      severity: "error",
      from: { path: "^vendor/" },
      to: { path: "^(packages/km-|apps/)" },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules", "vendor/", "\\.d\\.ts$"],
    },
    exclude: {
      path: [
        "node_modules",
        "vendor/",
        "\\.test\\.",
        "\\.spec\\.",
        "\\.slow\\.",
        "__tests__",
        "/tests?/",
        "\\.d\\.ts$",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
