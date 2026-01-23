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
 *
 * Uses isolated temp directories for cleaner test setup.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { ulid } from "ulid";

import {
  loadConfig,
  getConfigPath,
  clearConfigCache,
  getBeadsConfig,
  getTuiConfig,
  getOriginalBeadsConfig,
  getOriginalBeadsConfigPath,
} from "../src/config.ts";

// Track created directories for cleanup
const createdDirs: string[] = [];

/** Create an isolated test directory */
function createTestDir(): string {
  const dir = join("/tmp", `kmtest-config-${ulid()}`);
  mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

// Current test directory (set in beforeEach)
let testDir: string;

describe.serial("loadConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns empty object when no config exists", () => {
    const config = loadConfig(testDir);
    expect(config).toEqual({});
  });

  test("loads config from .km/config.yaml", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  board: "@issues"
  prefix: "test"
tui:
  watch: false
`,
    );

    const config = loadConfig(testDir);
    expect(config.beads?.board).toBe("@issues");
    expect(config.beads?.prefix).toBe("test");
    expect(config.tui?.watch).toBe(false);
  });

  test("loads config from .kmrc.yaml", () => {
    writeFileSync(
      join(testDir, ".kmrc.yaml"),
      `beads:
  parent: "bugs/"
`,
    );

    const config = loadConfig(testDir);
    expect(config.beads?.parent).toBe("bugs/");
  });

  test("caches config across calls", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  prefix: "first"
`,
    );

    const config1 = loadConfig(testDir);
    expect(config1.beads?.prefix).toBe("first");

    // Modify the file - should NOT be reflected due to caching
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  prefix: "second"
`,
    );

    const config2 = loadConfig(testDir);
    expect(config2.beads?.prefix).toBe("first");
  });
});

describe.serial("getConfigPath", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns undefined when no config loaded", () => {
    loadConfig(testDir);
    expect(getConfigPath()).toBeUndefined();
  });

  test("returns path when config exists", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    const configPath = join(testDir, ".km/config.yaml");
    writeFileSync(configPath, "beads: {}\n");

    loadConfig(testDir);
    expect(getConfigPath()).toBe(configPath);
  });
});

describe.serial("clearConfigCache", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("clears cached config so new config is loaded", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  prefix: "first"
`,
    );

    const config1 = loadConfig(testDir);
    expect(config1.beads?.prefix).toBe("first");

    // Modify the file
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  prefix: "second"
`,
    );

    // Clear cache
    clearConfigCache();

    // Now should load the new value
    const config2 = loadConfig(testDir);
    expect(config2.beads?.prefix).toBe("second");
  });
});

describe.serial("getBeadsConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns defaults when no config exists", () => {
    const config = getBeadsConfig(testDir);
    expect(config.board).toBe("issue");
    expect(config.parent).toBe("issue/");
    expect(config.prefix).toBe("km");
  });

  test("merges config with defaults", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  board: "@bugs"
`,
    );

    const config = getBeadsConfig(testDir);
    expect(config.board).toBe("@bugs");
    expect(config.parent).toBe("issue/"); // default
    expect(config.prefix).toBe("km"); // default
  });

  test("overrides all defaults when fully specified", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `beads:
  board: "@custom"
  parent: "tickets/"
  prefix: "proj"
`,
    );

    const config = getBeadsConfig(testDir);
    expect(config.board).toBe("@custom");
    expect(config.parent).toBe("tickets/");
    expect(config.prefix).toBe("proj");
  });
});

describe.serial("getTuiConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns defaults when no config exists", () => {
    const config = getTuiConfig(testDir);
    expect(config.watch).toBe(true);
    expect(config.watchWorker).toBe(true);
  });

  test("allows disabling watch", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `tui:
  watch: false
`,
    );

    const config = getTuiConfig(testDir);
    expect(config.watch).toBe(false);
    expect(config.watchWorker).toBe(true); // default
  });

  test("allows disabling watchWorker", () => {
    mkdirSync(join(testDir, ".km"), { recursive: true });
    writeFileSync(
      join(testDir, ".km/config.yaml"),
      `tui:
  watchWorker: false
`,
    );

    const config = getTuiConfig(testDir);
    expect(config.watch).toBe(true); // default
    expect(config.watchWorker).toBe(false);
  });
});

describe.serial("getOriginalBeadsConfig", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns null when no .beads/config.yaml exists", () => {
    const config = getOriginalBeadsConfig(testDir);
    expect(config).toBeNull();
  });

  test("loads .beads/config.yaml", () => {
    mkdirSync(join(testDir, ".beads"), { recursive: true });
    writeFileSync(
      join(testDir, ".beads/config.yaml"),
      `issue-prefix: "proj"
no-db: true
actor: "test-user"
`,
    );

    const config = getOriginalBeadsConfig(testDir);
    expect(config).not.toBeNull();
    expect(config!["issue-prefix"]).toBe("proj");
    expect(config!["no-db"]).toBe(true);
    expect(config!.actor).toBe("test-user");
  });

  test("searches parent directories", () => {
    mkdirSync(join(testDir, ".beads"), { recursive: true });
    mkdirSync(join(testDir, "nested/deep"), { recursive: true });
    writeFileSync(
      join(testDir, ".beads/config.yaml"),
      `issue-prefix: "parent"
`,
    );

    const config = getOriginalBeadsConfig(join(testDir, "nested/deep"));
    expect(config).not.toBeNull();
    expect(config!["issue-prefix"]).toBe("parent");
  });

  test("caches result across calls", () => {
    mkdirSync(join(testDir, ".beads"), { recursive: true });
    writeFileSync(
      join(testDir, ".beads/config.yaml"),
      `issue-prefix: "first"
`,
    );

    const config1 = getOriginalBeadsConfig(testDir);
    expect(config1!["issue-prefix"]).toBe("first");

    // Modify the file - should NOT be reflected due to caching
    writeFileSync(
      join(testDir, ".beads/config.yaml"),
      `issue-prefix: "second"
`,
    );

    const config2 = getOriginalBeadsConfig(testDir);
    expect(config2!["issue-prefix"]).toBe("first");
  });
});

describe.serial("getOriginalBeadsConfigPath", () => {
  beforeEach(() => {
    clearConfigCache();
    testDir = createTestDir();
  });

  afterEach(() => {
    clearConfigCache();
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs.length = 0;
  });

  test("returns undefined before loading", () => {
    expect(getOriginalBeadsConfigPath()).toBeUndefined();
  });

  test("returns path after loading", () => {
    mkdirSync(join(testDir, ".beads"), { recursive: true });
    const configPath = join(testDir, ".beads/config.yaml");
    writeFileSync(configPath, "actor: test\n");

    getOriginalBeadsConfig(testDir);
    expect(getOriginalBeadsConfigPath()).toBe(configPath);
  });
});
