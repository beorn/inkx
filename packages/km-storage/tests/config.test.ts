/**
 * Config Tests
 *
 * Tests for km configuration loading and caching:
 * - loadConfig: finding and loading config files
 * - getConfigPath: getting the loaded config path
 * - clearConfigCache: clearing cached config
 * - getBeadsConfig: beads-specific config with defaults
 * - getTuiConfig: TUI-specific config with defaults
 * - getOriginalBeadsConfig: loading .beads/config.yaml
 * - getOriginalBeadsConfigPath: getting .beads/config.yaml path
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";

import {
  loadConfig,
  getConfigPath,
  clearConfigCache,
  getBeadsConfig,
  getTuiConfig,
  getOriginalBeadsConfig,
  getOriginalBeadsConfigPath,
} from "../src/config.ts";

const TEST_DIR = "/tmp/km-test-config";

describe.serial("loadConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns empty object when no config exists", () => {
    const config = loadConfig(TEST_DIR);
    expect(config).toEqual({});
  });

  test("loads config from .km/config.yaml", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  board: "@issues"
  prefix: "test"
tui:
  watch: false
`,
    );

    const config = loadConfig(TEST_DIR);
    expect(config.beads?.board).toBe("@issues");
    expect(config.beads?.prefix).toBe("test");
    expect(config.tui?.watch).toBe(false);
  });

  test("loads config from .kmrc.yaml", () => {
    writeFileSync(
      join(TEST_DIR, ".kmrc.yaml"),
      `beads:
  parent: "bugs/"
`,
    );

    const config = loadConfig(TEST_DIR);
    expect(config.beads?.parent).toBe("bugs/");
  });

  test("caches config across calls", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  prefix: "first"
`,
    );

    const config1 = loadConfig(TEST_DIR);
    expect(config1.beads?.prefix).toBe("first");

    // Modify the file - should NOT be reflected due to caching
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  prefix: "second"
`,
    );

    const config2 = loadConfig(TEST_DIR);
    expect(config2.beads?.prefix).toBe("first");
  });
});

describe.serial("getConfigPath", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns undefined when no config loaded", () => {
    loadConfig(TEST_DIR);
    expect(getConfigPath()).toBeUndefined();
  });

  test("returns path when config exists", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    const configPath = join(TEST_DIR, ".km/config.yaml");
    writeFileSync(configPath, "beads: {}\n");

    loadConfig(TEST_DIR);
    expect(getConfigPath()).toBe(configPath);
  });
});

describe.serial("clearConfigCache", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("clears cached config so new config is loaded", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  prefix: "first"
`,
    );

    const config1 = loadConfig(TEST_DIR);
    expect(config1.beads?.prefix).toBe("first");

    // Modify the file
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  prefix: "second"
`,
    );

    // Clear cache
    clearConfigCache();

    // Now should load the new value
    const config2 = loadConfig(TEST_DIR);
    expect(config2.beads?.prefix).toBe("second");
  });
});

describe.serial("getBeadsConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns defaults when no config exists", () => {
    const config = getBeadsConfig(TEST_DIR);
    expect(config.board).toBe("issue");
    expect(config.parent).toBe("issue/");
    expect(config.prefix).toBe("km");
  });

  test("merges config with defaults", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  board: "@bugs"
`,
    );

    const config = getBeadsConfig(TEST_DIR);
    expect(config.board).toBe("@bugs");
    expect(config.parent).toBe("issue/"); // default
    expect(config.prefix).toBe("km"); // default
  });

  test("overrides all defaults when fully specified", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `beads:
  board: "@custom"
  parent: "tickets/"
  prefix: "proj"
`,
    );

    const config = getBeadsConfig(TEST_DIR);
    expect(config.board).toBe("@custom");
    expect(config.parent).toBe("tickets/");
    expect(config.prefix).toBe("proj");
  });
});

describe.serial("getTuiConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns defaults when no config exists", () => {
    const config = getTuiConfig(TEST_DIR);
    expect(config.watch).toBe(true);
    expect(config.watchWorker).toBe(true);
  });

  test("allows disabling watch", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `tui:
  watch: false
`,
    );

    const config = getTuiConfig(TEST_DIR);
    expect(config.watch).toBe(false);
    expect(config.watchWorker).toBe(true); // default
  });

  test("allows disabling watchWorker", () => {
    mkdirSync(join(TEST_DIR, ".km"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".km/config.yaml"),
      `tui:
  watchWorker: false
`,
    );

    const config = getTuiConfig(TEST_DIR);
    expect(config.watch).toBe(true); // default
    expect(config.watchWorker).toBe(false);
  });
});

describe.serial("getOriginalBeadsConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns null when no .beads/config.yaml exists", () => {
    const config = getOriginalBeadsConfig(TEST_DIR);
    expect(config).toBeNull();
  });

  test("loads .beads/config.yaml", () => {
    mkdirSync(join(TEST_DIR, ".beads"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".beads/config.yaml"),
      `issue-prefix: "proj"
no-db: true
actor: "test-user"
`,
    );

    const config = getOriginalBeadsConfig(TEST_DIR);
    expect(config).not.toBeNull();
    expect(config!["issue-prefix"]).toBe("proj");
    expect(config!["no-db"]).toBe(true);
    expect(config!.actor).toBe("test-user");
  });

  test("searches parent directories", () => {
    mkdirSync(join(TEST_DIR, ".beads"), { recursive: true });
    mkdirSync(join(TEST_DIR, "nested/deep"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".beads/config.yaml"),
      `issue-prefix: "parent"
`,
    );

    const config = getOriginalBeadsConfig(join(TEST_DIR, "nested/deep"));
    expect(config).not.toBeNull();
    expect(config!["issue-prefix"]).toBe("parent");
  });

  test("caches result across calls", () => {
    mkdirSync(join(TEST_DIR, ".beads"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".beads/config.yaml"),
      `issue-prefix: "first"
`,
    );

    const config1 = getOriginalBeadsConfig(TEST_DIR);
    expect(config1!["issue-prefix"]).toBe("first");

    // Modify the file - should NOT be reflected due to caching
    writeFileSync(
      join(TEST_DIR, ".beads/config.yaml"),
      `issue-prefix: "second"
`,
    );

    const config2 = getOriginalBeadsConfig(TEST_DIR);
    expect(config2!["issue-prefix"]).toBe("first");
  });
});

describe.serial("getOriginalBeadsConfigPath", () => {
  beforeEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    clearConfigCache();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns undefined before loading", () => {
    expect(getOriginalBeadsConfigPath()).toBeUndefined();
  });

  test("returns path after loading", () => {
    mkdirSync(join(TEST_DIR, ".beads"), { recursive: true });
    const configPath = join(TEST_DIR, ".beads/config.yaml");
    writeFileSync(configPath, "actor: test\n");

    getOriginalBeadsConfig(TEST_DIR);
    expect(getOriginalBeadsConfigPath()).toBe(configPath);
  });
});
