import { init, getNode, getChildren } from "./packages/km-storage/src/index.ts";
import { getNodeDisplayName } from "./apps/km-tui/packages/km-ink/src/state.ts";
import { renderPath } from "./apps/km-tui/packages/km-ink/src/layout/index.ts";
import { renderPlain } from "./apps/km-tui/packages/km-ink/src/text/index.ts";

await init({ rootPath: "/tmp/test-vault", mode: "memory" });

const files = getChildren(null).filter(n => n.type === "file");
console.log("Files:", files.map(f => ({ id: f.id, name: getNodeDisplayName(f) })));

const rootNode = files.find(f => getNodeDisplayName(f) === "Next Actions");
if (!rootNode) {
  console.log("Could not find Next Actions file");
  process.exit(1);
}
console.log("Root:", rootNode.id, rootNode.type, getNodeDisplayName(rootNode));

const sections = getChildren(rootNode.id);
const workSection = sections.find(s => getNodeDisplayName(s) === "Work");
if (!workSection) {
  console.log("Could not find Work section");
  process.exit(1);
}

const cards = getChildren(workSection.id);
const colorBlueTask = cards.find(c => c.content?.includes("color=blue"));
if (!colorBlueTask) {
  console.log("Could not find color=blue task");
  process.exit(1);
}

console.log("\n=== Path from color=blue to root ===");

function buildPath(nodeId, boardRootId) {
  const nodes = [];
  let cid = nodeId;
  while (cid) {
    const n = getNode(cid);
    if (!n) break;
    nodes.unshift(n);
    cid = n.parent_id;
  }
  
  const bri = boardRootId ? nodes.findIndex(n => n.id === boardRootId) : -1;
  console.log("Nodes:", nodes.map(n => n.type + ":" + getNodeDisplayName(n).slice(0, 15)));
  console.log("Board root index:", bri);
  
  const segs = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const name = renderPlain(getNodeDisplayName(node));
    const iwb = bri >= 0 && i > bri;
    
    if (node.type === "file" || node.type === "folder") {
      segs.push({ name, sep: segs.length > 0 ? "/" : "", isWithinBoard: iwb });
    } else if (node.type === "section") {
      segs.push({ name, sep: "#", isWithinBoard: iwb });
    } else if (node.type === "board") {
      if (segs.length === 0) segs.push({ name, sep: "", isWithinBoard: false });
    } else {
      segs.push({ name, sep: segs.length > 0 ? "/" : "", isWithinBoard: iwb });
    }
    console.log(i + ": " + node.type + " -> " + name + " iwb=" + iwb);
  }
  return segs;
}

const segs = buildPath(colorBlueTask.id, rootNode.id);
console.log("\nSegments:");
segs.forEach((s, i) => console.log("  " + i + ": " + s.sep + s.name + " iwb=" + s.isWithinBoard));

const rendered = renderPath(segs as any, 100);
console.log("\nRendered:");
rendered.forEach((s, i) => console.log("  " + i + ": " + s.sep + s.name + " iwb=" + s.isWithinBoard));
console.log("Full:", rendered.map(s => s.sep + s.name).join(""));
