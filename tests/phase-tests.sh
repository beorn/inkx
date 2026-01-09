#!/bin/bash
# Phase Tests - Verify each implementation phase
# Run with: bash tests/phase-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}→${NC} $1"; }

# Phase 0: Setup
test_phase0() {
  echo "=== Phase 0: Project Setup ==="

  # Check package.json exists and has required fields
  [ -f package.json ] || fail "package.json not found"
  pass "package.json exists"

  grep -q '"name": "km"' package.json || fail "package.json missing name"
  pass "package.json has name"

  grep -q '"bin"' package.json || fail "package.json missing bin"
  pass "package.json has bin entry"

  # Check directories exist
  [ -d src/node ] || fail "src/node directory missing"
  [ -d src/md ] || fail "src/md directory missing"
  [ -d src/watch ] || fail "src/watch directory missing"
  [ -d src/cli ] || fail "src/cli directory missing"
  [ -d src/cli/commands ] || fail "src/cli/commands directory missing"
  pass "All source directories exist"

  # Check dependencies are installed
  [ -d node_modules ] || fail "node_modules not found"
  [ -d node_modules/commander ] || fail "commander not installed"
  [ -d node_modules/chokidar ] || fail "chokidar not installed"
  pass "Dependencies installed"

  echo ""
}

# Phase 1: Node Data Model
test_phase1() {
  echo "=== Phase 1: Node Data Model ==="

  # Check files exist
  [ -f src/node/types.ts ] || fail "types.ts not found"
  [ -f src/node/emit.ts ] || fail "emit.ts not found"
  [ -f src/node/db.ts ] || fail "db.ts not found"
  [ -f src/node/cas.ts ] || fail "cas.ts not found"
  [ -f src/node/rebuild.ts ] || fail "rebuild.ts not found"
  [ -f src/node/index.ts ] || fail "node/index.ts not found"
  pass "All node module files exist"

  # Check types.ts exports
  grep -q "export type NodeType" src/node/types.ts || fail "types.ts missing NodeType"
  grep -q "export type TaskStatus" src/node/types.ts || fail "types.ts missing TaskStatus"
  grep -q "export interface Node" src/node/types.ts || fail "types.ts missing Node interface"
  grep -q "export interface Event" src/node/types.ts || fail "types.ts missing Event interface"
  pass "types.ts has required exports"

  # Check emit.ts functions
  grep -q "export function emit" src/node/emit.ts || fail "emit.ts missing emit function"
  grep -q "export function emitNodeCreated" src/node/emit.ts || fail "emit.ts missing emitNodeCreated"
  pass "emit.ts has required functions"

  # Check db.ts functions
  grep -q "export function getDb" src/node/db.ts || fail "db.ts missing getDb"
  grep -q "export function applyEvent" src/node/db.ts || fail "db.ts missing applyEvent"
  grep -q "export function getNode" src/node/db.ts || fail "db.ts missing getNode"
  grep -q "export function search" src/node/db.ts || fail "db.ts missing search"
  pass "db.ts has required functions"

  # Check cas.ts functions
  grep -q "export function storeContent" src/node/cas.ts || fail "cas.ts missing storeContent"
  grep -q "export function loadContent" src/node/cas.ts || fail "cas.ts missing loadContent"
  pass "cas.ts has required functions"

  # Check rebuild.ts functions
  grep -q "export function rebuildState" src/node/rebuild.ts || fail "rebuild.ts missing rebuildState"
  grep -q "export function ensureState" src/node/rebuild.ts || fail "rebuild.ts missing ensureState"
  pass "rebuild.ts has required functions"

  # TypeScript compile check
  info "Running TypeScript check on node module..."
  if bun build src/node/index.ts --outfile /tmp/km-test-node.js --target bun 2>&1 | grep -qi "error"; then
    fail "node module TypeScript error"
  fi
  pass "node module compiles"

  echo ""
}

# Phase 2: Markdown Parsing
test_phase2() {
  echo "=== Phase 2: Markdown Parsing ==="

  # Check files exist
  [ -f src/md/parser.ts ] || fail "parser.ts not found"
  [ -f src/md/ast2nodes.ts ] || fail "ast2nodes.ts not found"
  [ -f src/md/nodes2md.ts ] || fail "nodes2md.ts not found"
  [ -f src/md/index.ts ] || fail "md/index.ts not found"
  pass "All md module files exist"

  # Check parser.ts functions
  grep -q "export function parseMarkdown" src/md/parser.ts || fail "parser.ts missing parseMarkdown"
  grep -q "export function extractFrontmatter" src/md/parser.ts || fail "parser.ts missing extractFrontmatter"
  grep -q "export function parseWikiLinks" src/md/parser.ts || fail "parser.ts missing parseWikiLinks"
  grep -q "export function slugify" src/md/parser.ts || fail "parser.ts missing slugify"
  pass "parser.ts has required functions"

  # Check ast2nodes.ts functions
  grep -q "export function parseMarkdownToNodes" src/md/ast2nodes.ts || fail "ast2nodes.ts missing parseMarkdownToNodes"
  grep -q "export function buildNodeTree" src/md/ast2nodes.ts || fail "ast2nodes.ts missing buildNodeTree"
  pass "ast2nodes.ts has required functions"

  # Check nodes2md.ts functions
  grep -q "export function nodesToMarkdown" src/md/nodes2md.ts || fail "nodes2md.ts missing nodesToMarkdown"
  pass "nodes2md.ts has required functions"

  # TypeScript compile check
  info "Running TypeScript check on md module..."
  if bun build src/md/index.ts --outfile /tmp/km-test-md.js --target bun 2>&1 | grep -qi "error"; then
    fail "md module TypeScript error"
  fi
  pass "md module compiles"

  echo ""
}

# Phase 3: Filesystem Watch
test_phase3() {
  echo "=== Phase 3: Filesystem Watch ==="

  # Check files exist
  [ -f src/watch/watcher.ts ] || fail "watcher.ts not found"
  [ -f src/watch/reconcile.ts ] || fail "reconcile.ts not found"
  [ -f src/watch/writequeue.ts ] || fail "writequeue.ts not found"
  [ -f src/watch/sync.ts ] || fail "sync.ts not found"
  [ -f src/watch/index.ts ] || fail "watch/index.ts not found"
  pass "All watch module files exist"

  # Check watcher.ts exports
  grep -q "export class FileSystemWatcher" src/watch/watcher.ts || fail "watcher.ts missing FileSystemWatcher"
  grep -q "export function scanDirectory" src/watch/watcher.ts || fail "watcher.ts missing scanDirectory"
  pass "watcher.ts has required exports"

  # Check reconcile.ts exports
  grep -q "export function reconcileDirectory" src/watch/reconcile.ts || fail "reconcile.ts missing reconcileDirectory"
  grep -q "export async function applyReconcileOps" src/watch/reconcile.ts || fail "reconcile.ts missing applyReconcileOps"
  pass "reconcile.ts has required exports"

  # Check writequeue.ts exports
  grep -q "export class WriteQueue" src/watch/writequeue.ts || fail "writequeue.ts missing WriteQueue"
  pass "writequeue.ts has required exports"

  # Check sync.ts exports
  grep -q "export class SyncManager" src/watch/sync.ts || fail "sync.ts missing SyncManager"
  grep -q "export async function syncOnce" src/watch/sync.ts || fail "sync.ts missing syncOnce"
  pass "sync.ts has required exports"

  # TypeScript compile check
  info "Running TypeScript check on watch module..."
  if bun build src/watch/index.ts --outfile /tmp/km-test-watch.js --target bun 2>&1 | grep -qi "error"; then
    fail "watch module TypeScript error"
  fi
  pass "watch module compiles"

  echo ""
}

# Phase 4: CLI
test_phase4() {
  echo "=== Phase 4: CLI ==="

  # Check files exist
  [ -f src/cli/index.ts ] || fail "cli/index.ts not found"
  [ -f src/cli/commands/list.ts ] || fail "commands/list.ts not found"
  [ -f src/cli/commands/add.ts ] || fail "commands/add.ts not found"
  [ -f src/cli/commands/show.ts ] || fail "commands/show.ts not found"
  [ -f src/cli/commands/tree.ts ] || fail "commands/tree.ts not found"
  [ -f src/cli/commands/actions.ts ] || fail "commands/actions.ts not found"
  [ -f src/cli/commands/sync.ts ] || fail "commands/sync.ts not found"
  [ -f src/cli/commands/watch.ts ] || fail "commands/watch.ts not found"
  [ -f src/cli/commands/rebuild.ts ] || fail "commands/rebuild.ts not found"
  [ -f src/cli/commands/search.ts ] || fail "commands/search.ts not found"
  pass "All CLI command files exist"

  # Check index.ts structure
  grep -q "#!/usr/bin/env bun" src/cli/index.ts || fail "cli/index.ts missing shebang"
  grep -q "import { Command } from" src/cli/index.ts || fail "cli/index.ts missing commander import"
  pass "cli/index.ts has correct structure"

  # Check commands are registered
  grep -q "tasksCommand" src/cli/index.ts || fail "tasks command not registered"
  grep -q "showCommand" src/cli/index.ts || fail "show command not registered"
  grep -q "treeCommand" src/cli/index.ts || fail "tree command not registered"
  grep -q "syncCommand" src/cli/index.ts || fail "sync command not registered"
  grep -q "watchCommand" src/cli/index.ts || fail "watch command not registered"
  grep -q "searchCommand" src/cli/index.ts || fail "search command not registered"
  pass "All commands registered"

  # TypeScript compile check
  info "Running TypeScript check on CLI..."
  if bun build src/cli/index.ts --outfile /tmp/km-test-cli.js --target bun 2>&1 | grep -qi "error"; then
    fail "CLI TypeScript error"
  fi
  pass "CLI compiles"

  # Test CLI help
  info "Testing CLI help output..."
  bun src/cli/index.ts --help >/dev/null 2>&1 || fail "CLI --help failed"
  pass "CLI help works"

  echo ""
}

# Phase 5: Agent Orchestration (Code)
test_phase5() {
  echo "=== Phase 5: Agent Orchestration ==="

  # Check files exist
  [ -f src/code/hub.ts ] || fail "hub.ts not found"
  [ -f src/code/subscriber.ts ] || fail "subscriber.ts not found"
  [ -f src/code/queue.ts ] || fail "queue.ts not found"
  [ -f src/code/session.ts ] || fail "session.ts not found"
  [ -f src/code/agent.ts ] || fail "agent.ts not found"
  [ -f src/code/index.ts ] || fail "code/index.ts not found"
  pass "All code module files exist"

  # Check hub.ts exports
  grep -q "export class EventHub" src/code/hub.ts || fail "hub.ts missing EventHub"
  pass "hub.ts has required exports"

  # Check subscriber.ts exports
  grep -q "export class Subscriber" src/code/subscriber.ts || fail "subscriber.ts missing Subscriber"
  pass "subscriber.ts has required exports"

  # Check queue.ts exports
  grep -q "export class TaskQueue" src/code/queue.ts || fail "queue.ts missing TaskQueue"
  pass "queue.ts has required exports"

  # Check session.ts exports
  grep -q "export class Session" src/code/session.ts || fail "session.ts missing Session"
  pass "session.ts has required exports"

  # Check agent.ts exports
  grep -q "export class Agent" src/code/agent.ts || fail "agent.ts missing Agent"
  pass "agent.ts has required exports"

  # TypeScript compile check
  info "Running TypeScript check on code module..."
  if bun build src/code/index.ts --outfile /tmp/km-test-code.js --target bun 2>&1 | grep -qi "error"; then
    fail "code module TypeScript error"
  fi
  pass "code module compiles"

  echo ""
}

# Phase 6: Integration
test_phase6() {
  echo "=== Phase 6: Integration ==="

  # Full CLI build check
  info "Running full build check..."
  if bun build src/cli/index.ts --outfile /tmp/km-test-full.js --target bun 2>&1 | grep -qi "error"; then
    fail "Full build failed"
  fi
  pass "Full build succeeds"

  # Integration test: create, list, done cycle
  info "Running integration test..."

  # Create temp test directory
  TEST_DIR=$(mktemp -d)
  mkdir -p "$TEST_DIR/.kimmi"

  # Set KIMMI_PATH for tests
  export KIMMI_PATH="$TEST_DIR/.kimmi"

  # Clean up on exit
  trap "rm -rf $TEST_DIR" EXIT

  # Test km --help
  bun src/cli/index.ts --help >/dev/null 2>&1 || fail "km --help failed"
  pass "km --help works"

  # Test km rebuild (should work with empty events)
  bun src/cli/index.ts rebuild --status >/dev/null 2>&1 || fail "km rebuild --status failed"
  pass "km rebuild --status works"

  # Test km tasks (should work with empty db)
  bun src/cli/index.ts tasks >/dev/null 2>&1 || fail "km tasks failed"
  pass "km tasks works"

  # Test km tasks list (should work with empty db)
  bun src/cli/index.ts tasks list >/dev/null 2>&1 || fail "km tasks list failed"
  pass "km tasks list works"

  # Test km tree (should work with empty db)
  bun src/cli/index.ts tree >/dev/null 2>&1 || fail "km tree failed"
  pass "km tree works"

  echo ""
}

# Phase 7: Unit Tests
test_phase7() {
  echo "=== Phase 7: Unit Tests ==="

  # Check test files exist
  [ -f tests/node-crud.test.ts ] || fail "node-crud.test.ts not found"
  [ -f tests/markdown.test.ts ] || fail "markdown.test.ts not found"
  pass "Test files exist"

  # Check fixtures exist
  [ -f tests/fixtures/sample-project.md ] || fail "sample-project.md fixture not found"
  [ -f tests/fixtures/inbox.md ] || fail "inbox.md fixture not found"
  [ -f tests/fixtures/daily-note.md ] || fail "daily-note.md fixture not found"
  pass "Test fixtures exist"

  # Run unit tests
  info "Running Node CRUD tests..."
  if ! bun test tests/node-crud.test.ts 2>&1; then
    fail "Node CRUD tests failed"
  fi
  pass "Node CRUD tests pass"

  info "Running Markdown tests..."
  if ! bun test tests/markdown.test.ts 2>&1; then
    fail "Markdown tests failed"
  fi
  pass "Markdown tests pass"

  echo ""
}

# Run all tests
main() {
  echo "========================================"
  echo "   Kimmi Phase Tests"
  echo "========================================"
  echo ""

  test_phase0
  test_phase1
  test_phase2
  test_phase3

  # Only test phase 4 if cli files exist
  if [ -f src/cli/index.ts ]; then
    test_phase4
  else
    echo "=== Phase 4: CLI ==="
    echo -e "${YELLOW}Skipped (not yet implemented)${NC}"
    echo ""
  fi

  # Only test phase 5 if code files exist
  if [ -f src/code/index.ts ]; then
    test_phase5
  else
    echo "=== Phase 5: Agent Orchestration ==="
    echo -e "${YELLOW}Skipped (not yet implemented)${NC}"
    echo ""
  fi

  # Only test phase 6 if all modules exist
  if [ -f src/code/index.ts ] && [ -f src/cli/index.ts ]; then
    test_phase6
  else
    echo "=== Phase 6: Integration ==="
    echo -e "${YELLOW}Skipped (dependencies not ready)${NC}"
    echo ""
  fi

  # Only test phase 7 if test files exist
  if [ -f tests/node-crud.test.ts ] && [ -f tests/markdown.test.ts ]; then
    test_phase7
  else
    echo "=== Phase 7: Unit Tests ==="
    echo -e "${YELLOW}Skipped (test files not ready)${NC}"
    echo ""
  fi

  echo "========================================"
  echo -e "${GREEN}All tests passed!${NC}"
  echo "========================================"
}

# Allow running specific phase tests
case "${1:-all}" in
  0) test_phase0 ;;
  1) test_phase1 ;;
  2) test_phase2 ;;
  3) test_phase3 ;;
  4) test_phase4 ;;
  5) test_phase5 ;;
  6) test_phase6 ;;
  7) test_phase7 ;;
  all) main ;;
  *) echo "Usage: $0 [0|1|2|3|4|5|6|7|all]"; exit 1 ;;
esac
