#!/usr/bin/env bun

type Align = "left" | "right"

const C = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[94m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  boldCyan: "\x1b[1;36m",
  reset: "\x1b[0m",
} as const

const TOTAL_W = 135
const TOTAL_H = 40

const LEFT_W = 80
const RIGHT_W = 54
const GAP = " "

const CPU_INNER = LEFT_W - 2
const SIDE_INNER = RIGHT_W - 2
const PROC_INNER = TOTAL_W - 2

const ansiRe = /\x1b\[[0-9;]*m/g

const stripAnsi = (s: string): string => s.replace(ansiRe, "")
const vlen = (s: string): number => stripAnsi(s).length

const dim = (s: string): string => `${C.dim}${s}${C.reset}`
const bold = (s: string): string => `${C.bold}${s}${C.reset}`
const blue = (s: string): string => `${C.blue}${s}${C.reset}`
const cyan = (s: string): string => `${C.cyan}${s}${C.reset}`

function severityColor(value: number): string {
  if (value >= 80) return C.red
  if (value >= 60) return C.yellow
  return C.green
}

function heatColor(temp: number): string {
  if (temp >= 75) return C.red
  if (temp >= 60) return C.yellow
  return C.green
}

function cell(text: string, width: number, align: Align = "left"): string {
  if (width <= 0) return ""

  let out = text
  if (vlen(out) > width) {
    const plain = stripAnsi(out)
    out = plain.length > width ? `${plain.slice(0, Math.max(0, width - 1))}…` : plain
  }

  const pad = " ".repeat(Math.max(0, width - vlen(out)))
  return align === "right" ? `${pad}${out}` : `${out}${pad}`
}

function joinLR(left: string, right: string, width: number, fill = " ", fillColor = ""): string {
  let l = left
  const r = right

  if (vlen(l) + vlen(r) > width) {
    l = cell(stripAnsi(l), Math.max(0, width - vlen(r)))
  }

  const fillCount = Math.max(0, width - vlen(l) - vlen(r))
  const filler =
    fillCount > 0 ? (fillColor ? `${fillColor}${fill.repeat(fillCount)}${C.reset}` : fill.repeat(fillCount)) : ""

  return `${l}${filler}${r}`
}

function pct(value: number, digits = 0): string {
  const text = digits === 0 ? `${Math.round(value)}%` : `${value.toFixed(digits)}%`
  return `${severityColor(value)}${text}${C.reset}`
}

function infoPct(value: number): string {
  return `${C.blue}${Math.round(value)}%${C.reset}`
}

function progressBar(value: number, width: number, colorOverride?: string): string {
  const clamped = Math.max(0, Math.min(100, value))
  const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)))
  const empty = width - filled
  const color = colorOverride ?? severityColor(clamped)
  return `${color}${"█".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`
}

function sparkline(values: number[], color: string = C.cyan): string {
  const chars = "▁▂▃▄▅▆▇█"
  return `${color}${values.map((v) => chars[Math.max(0, Math.min(7, v))] ?? "▁").join("")}${C.reset}`
}

function sep(width: number): string {
  return `${C.dim}${"┄".repeat(width)}${C.reset}`
}

function topBorder(width: number, title: string, right = ""): string {
  const inner = width - 2
  const left = `${C.boldCyan} ${title} ${C.reset}`
  const r = right ? `${C.dim} ${right} ${C.reset}` : ""
  return `${C.cyan}╭${joinLR(left, r, inner, "─", C.cyan)}╮${C.reset}`
}

function bottomBorder(width: number): string {
  return `${C.cyan}╰${"─".repeat(width - 2)}╯${C.reset}`
}

function panelLine(width: number, content: string): string {
  return `${C.cyan}│${C.reset}${cell(content, width - 2)}${C.cyan}│${C.reset}`
}

function makePanel(width: number, title: string, right: string, body: string[]): string[] {
  return [topBorder(width, title, right), ...body.map((row) => panelLine(width, row)), bottomBorder(width)]
}

function assertWidth(line: string, width: number, label: string): void {
  const got = vlen(line)
  if (got !== width) {
    throw new Error(`${label}: expected width ${width}, got ${got}\n${stripAnsi(line)}`)
  }
}

interface CoreRow {
  label: string
  pct: number
  freq: string
  temp: number
  mode: string
}

const cores: CoreRow[] = [
  { label: "cpu00", pct: 12, freq: "3.62", temp: 39, mode: "idle" },
  { label: "cpu01", pct: 28, freq: "3.79", temp: 42, mode: "balanced" },
  { label: "cpu02", pct: 44, freq: "4.02", temp: 47, mode: "steady" },
  { label: "cpu03", pct: 57, freq: "4.18", temp: 53, mode: "steady" },
  { label: "cpu04", pct: 63, freq: "4.31", temp: 61, mode: "warm" },
  { label: "cpu05", pct: 71, freq: "4.47", temp: 68, mode: "boost" },
  { label: "cpu06", pct: 79, freq: "4.62", temp: 72, mode: "boost" },
  { label: "cpu07", pct: 83, freq: "4.84", temp: 75, mode: "boost" },
  { label: "cpu08", pct: 88, freq: "5.02", temp: 77, mode: "turbo" },
  { label: "cpu09", pct: 94, freq: "5.21", temp: 81, mode: "turbo" },
]

const cpuHistory = [
  1, 2, 2, 3, 2, 4, 5, 4, 6, 5, 4, 6, 7, 6, 5, 6, 7, 6, 5, 4, 5, 6, 5, 7, 6, 5, 6, 7, 7, 6, 5, 4, 5, 6, 5, 4,
]
const memHistory = [4, 4, 5, 5, 4, 5, 6, 5, 5, 6, 6, 5, 6, 6, 7, 6, 6, 5, 6, 6, 5, 5, 6, 5]
const dlHistory = [1, 2, 3, 5, 4, 6, 5, 7, 6, 4, 3, 5, 6, 7, 5, 4, 6, 7, 6, 5, 4, 6, 5, 4]
const ulHistory = [0, 1, 1, 2, 2, 3, 2, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 2, 2, 3, 2, 1]

const cpuBody: string[] = [
  `${joinLR(
    `${dim("Total")} ${pct(67)} ${progressBar(67, 24)}`,
    `${dim("Load")} 4.21 3.88 3.11  ${dim("Temp")} ${heatColor(71)}71°C${C.reset}  ${dim("Tasks")} 287`,
    CPU_INNER,
  )}`,
  `${joinLR(
    `${dim("User")} ${pct(38)}  ${dim("Sys")} ${pct(12)}  ${dim("Wait")} ${pct(14)}`,
    `${dim("Avg")} 4.31GHz  ${dim("Ctx/s")} 128k  ${dim("Uptime")} 12d 06h`,
    CPU_INNER,
  )}`,
  `${sep(CPU_INNER)}`,
  ...cores.map(
    (core) =>
      `${joinLR(
        `${dim(core.label)} ${pct(core.pct)} ${progressBar(core.pct, 24)} ${dim(`${core.freq}GHz`)}`,
        `${dim("temp")} ${heatColor(core.temp)}${core.temp}°C${C.reset}  ${severityColor(core.pct)}${core.mode}${C.reset}`,
        CPU_INNER,
      )}`,
  ),
  `${sep(CPU_INNER)}`,
  `${joinLR(
    `${dim("Pkg")} ${pct(67)} ${progressBar(67, 24)}`,
    `${dim("Power")} 84W  ${dim("Fan")} 1460RPM  ${dim("Boost")} ${C.green}on${C.reset}`,
    CPU_INNER,
  )}`,
  `${joinLR(`${dim("History")} ${sparkline(cpuHistory)}`, `${dim("60s")}`, CPU_INNER)}`,
]

const memBody: string[] = [
  `${joinLR(`${dim("RAM")} 23.7 / 32.0 GiB ${pct(74)} ${progressBar(74, 16)}`, `${dim("avail")} 8.3G`, SIDE_INNER)}`,
  `${joinLR(`${dim("Used")} 23.7G  ${dim("Cache")} 5.9G`, `${dim("Free")} 2.4G  ${dim("Slab")} 1.1G`, SIDE_INNER)}`,
  `${joinLR(`${dim("Swap")} 2.1 / 8.0 GiB ${pct(26)} ${progressBar(26, 16)}`, `${dim("zram")} off`, SIDE_INNER)}`,
  `${sep(SIDE_INNER)}`,
  `${joinLR(`${dim("Apps")} 17.4G  ${dim("Wired")} 1.8G`, `${dim("Buffers")} 612M`, SIDE_INNER)}`,
  `${joinLR(`${dim("Dirty")} 212M  ${dim("Shared")} 1.3G`, `${dim("Reclaim")} 0.8G`, SIDE_INNER)}`,
  `${joinLR(`${dim("Trend")} ${sparkline(memHistory)}`, `${dim("30m")}`, SIDE_INNER)}`,
]

const netBody: string[] = [
  `${joinLR(`${dim("DL")} 428 Mb/s ${pct(68)} ${progressBar(68, 16)}`, `${dim("peak")} 612`, SIDE_INNER)}`,
  `${joinLR(
    `${dim("UL")} ${blue("86 Mb/s")} ${infoPct(22)} ${progressBar(22, 16, C.blue)}`,
    `${dim("peak")} 143`,
    SIDE_INNER,
  )}`,
  `${sep(SIDE_INNER)}`,
  `${joinLR(`${dim("Conn")} 184 est  ${dim("Listen")} 23`, `${dim("SYN")} 2  ${dim("Drops")} 0`, SIDE_INNER)}`,
  `${joinLR(
    `${dim("Rx")} 61.2kpps  ${dim("Tx")} 19.4kpps`,
    `${dim("Retrans")} 0.08%  ${dim("RTT")} 18ms`,
    SIDE_INNER,
  )}`,
  `${joinLR(`${dim("DL")} ${sparkline(dlHistory, C.cyan)}`, `${dim("60s")}`, SIDE_INNER)}`,
  `${joinLR(`${dim("UL")} ${sparkline(ulHistory, C.blue)}`, `${dim("60s")}`, SIDE_INNER)}`,
]

interface ProcEntry {
  pid: number
  name: string
  cpu: number
  memp: number
  mem: string
  status: "Running" | "Sleep" | "I/O wait"
  time: string
  io: string
  thr: number
}

const procs: ProcEntry[] = [
  {
    pid: 31842,
    name: "bun dev --hot src/server.ts",
    cpu: 94.2,
    memp: 3.8,
    mem: "1.22G",
    status: "Running",
    time: "01:42:17",
    io: "24M/s",
    thr: 18,
  },
  {
    pid: 27114,
    name: "node /usr/bin/vite --host",
    cpu: 71.4,
    memp: 2.2,
    mem: "716M",
    status: "Running",
    time: "00:18:09",
    io: "12M/s",
    thr: 26,
  },
  {
    pid: 918,
    name: "postgres: checkpointer",
    cpu: 12.8,
    memp: 1.4,
    mem: "448M",
    status: "Sleep",
    time: "19:22:41",
    io: "3.1M/s",
    thr: 27,
  },
  {
    pid: 1023,
    name: "Code Helper (Renderer)",
    cpu: 9.6,
    memp: 4.8,
    mem: "1.53G",
    status: "Sleep",
    time: "07:13:51",
    io: "1.2M/s",
    thr: 44,
  },
  {
    pid: 2241,
    name: "docker-desktop",
    cpu: 8.9,
    memp: 6.3,
    mem: "2.01G",
    status: "Running",
    time: "11:08:04",
    io: "9.4M/s",
    thr: 61,
  },
  {
    pid: 1542,
    name: "redis-server *:6379",
    cpu: 6.7,
    memp: 0.9,
    mem: "289M",
    status: "Sleep",
    time: "02:51:17",
    io: "642K/s",
    thr: 8,
  },
  {
    pid: 612,
    name: "tailscaled --tun=userspace-networking",
    cpu: 5.4,
    memp: 0.4,
    mem: "132M",
    status: "Sleep",
    time: "05:44:22",
    io: "218K/s",
    thr: 19,
  },
  {
    pid: 33210,
    name: "bun test --watch",
    cpu: 4.2,
    memp: 1.1,
    mem: "356M",
    status: "Running",
    time: "00:06:38",
    io: "4.6M/s",
    thr: 12,
  },
  {
    pid: 1804,
    name: "nginx: worker process",
    cpu: 3.7,
    memp: 0.2,
    mem: "72M",
    status: "Sleep",
    time: "03:17:09",
    io: "118K/s",
    thr: 5,
  },
  {
    pid: 2877,
    name: "Chrome Helper (GPU)",
    cpu: 3.2,
    memp: 2.7,
    mem: "864M",
    status: "Sleep",
    time: "06:29:33",
    io: "2.3M/s",
    thr: 23,
  },
  {
    pid: 451,
    name: "kernel_task",
    cpu: 2.8,
    memp: 0.1,
    mem: "42M",
    status: "Running",
    time: "22:54:48",
    io: "0",
    thr: 179,
  },
  {
    pid: 1942,
    name: "syncthing serve --no-browser",
    cpu: 2.1,
    memp: 0.8,
    mem: "258M",
    status: "Sleep",
    time: "14:05:14",
    io: "884K/s",
    thr: 16,
  },
  {
    pid: 7621,
    name: "python scripts/indexer.py --incremental",
    cpu: 1.9,
    memp: 1.9,
    mem: "604M",
    status: "I/O wait",
    time: "00:43:58",
    io: "14M/s",
    thr: 9,
  },
  {
    pid: 266,
    name: "systemd-journald",
    cpu: 1.2,
    memp: 0.1,
    mem: "38M",
    status: "Sleep",
    time: "09:12:44",
    io: "96K/s",
    thr: 3,
  },
  {
    pid: 74,
    name: "zsh - bun gen-mockup.ts",
    cpu: 0.2,
    memp: 0.0,
    mem: "6M",
    status: "Running",
    time: "00:00:03",
    io: "0",
    thr: 1,
  },
]

function statusText(status: ProcEntry["status"]): string {
  switch (status) {
    case "Running":
      return `${C.green}${status}${C.reset}`
    case "I/O wait":
      return `${C.yellow}${status}${C.reset}`
    case "Sleep":
    default:
      return `${C.dim}${status}${C.reset}`
  }
}

function ioText(io: string): string {
  return io === "0" ? `${C.dim}0${C.reset}` : `${C.cyan}${io}${C.reset}`
}

function procRow(p: ProcEntry, index: number): string {
  const name = index === 0 ? `${C.bold}${p.name}${C.reset}` : p.name
  const cpuText =
    index === 0
      ? `${C.bold}${severityColor(p.cpu)}${p.cpu.toFixed(1)}%${C.reset}`
      : `${severityColor(p.cpu)}${p.cpu.toFixed(1)}%${C.reset}`

  return [
    cell(`${p.pid}`, 6, "right"),
    cell(name, 62, "left"),
    cell(cpuText, 6, "right"),
    cell(`${severityColor(p.memp)}${p.memp.toFixed(1)}%${C.reset}`, 6, "right"),
    cell(p.mem, 9, "right"),
    cell(statusText(p.status), 10, "left"),
    cell(p.time, 10, "right"),
    cell(ioText(p.io), 11, "right"),
    cell(`${p.thr}`, 5, "right"),
  ].join(" ")
}

const procHeader = [
  cell(`${C.dim}PID${C.reset}`, 6, "right"),
  cell(`${C.dim}NAME${C.reset}`, 62, "left"),
  cell(`${C.boldCyan}CPU%↓${C.reset}`, 6, "right"),
  cell(`${C.dim}MEM%${C.reset}`, 6, "right"),
  cell(`${C.dim}MEM${C.reset}`, 9, "right"),
  cell(`${C.dim}STATUS${C.reset}`, 10, "left"),
  cell(`${C.dim}TIME${C.reset}`, 10, "right"),
  cell(`${C.dim}IO${C.reset}`, 11, "right"),
  cell(`${C.dim}THR${C.reset}`, 5, "right"),
].join(" ")

const procFooter = joinLR(
  `${dim("184 processes")}  ${C.green}6 running${C.reset}  ${dim("176 sleeping")}  ${C.yellow}2 iowait${C.reset}`,
  `${dim("Threads")} 1,942  ${dim("CPU")} ${pct(67)}  ${dim("MEM")} ${pct(74)}  ${C.cyan}428↓${C.reset}  ${C.blue}86↑${C.reset}`,
  PROC_INNER,
)

const procBody: string[] = [
  `${procHeader}`,
  `${sep(PROC_INNER)}`,
  ...procs.map((p, i) => `${procRow(p, i)}`),
  `${sep(PROC_INNER)}`,
  `${procFooter}`,
]

const cpuPanel = makePanel(LEFT_W, "CPU / Compute", "10 logical", cpuBody)
const memPanel = makePanel(RIGHT_W, "Memory", "32 GiB", memBody)
const netPanel = makePanel(RIGHT_W, "Network", "en0 • wifi6", netBody)
const procPanel = makePanel(TOTAL_W, "Processes", "sorted by CPU%", procBody)

const titleBar = joinLR(
  `${C.boldCyan}Silvery TUI${C.reset} ${C.dim}system monitor showcase${C.reset} ${C.cyan}devbox-01${C.reset}`,
  `${C.dim}14:27 UTC  [h]help  [1]cpu  [2]mem  [3]net  [p]proc  [/]filter  [q]quit${C.reset}`,
  TOTAL_W,
  "┄",
  C.dim,
)

const topRight = [...memPanel, ...netPanel]

if (cpuPanel.length !== topRight.length) {
  throw new Error(`Top layout mismatch: left=${cpuPanel.length}, right=${topRight.length}`)
}

const lines: string[] = [titleBar, ...cpuPanel.map((left, i) => `${left}${GAP}${topRight[i]}`), ...procPanel]

if (lines.length !== TOTAL_H) {
  throw new Error(`Expected ${TOTAL_H} lines, got ${lines.length}`)
}

assertWidth(titleBar, TOTAL_W, "title bar")
cpuPanel.forEach((line, i) => assertWidth(line, LEFT_W, `cpu panel line ${i}`))
memPanel.forEach((line, i) => assertWidth(line, RIGHT_W, `memory panel line ${i}`))
netPanel.forEach((line, i) => assertWidth(line, RIGHT_W, `network panel line ${i}`))
procPanel.forEach((line, i) => assertWidth(line, TOTAL_W, `proc panel line ${i}`))
lines.forEach((line, i) => assertWidth(line, TOTAL_W, `final line ${i}`))

for (const line of lines) {
  console.log(`${line}`)
}
