/** Browser stub for node:fs — no-op for all operations */
export function openSync() {
  return -1
}
export function writeSync() {
  return 0
}
export function closeSync() {}
export function appendFileSync() {}
export function readFileSync() {
  return ""
}
export function writeFileSync() {}
export function existsSync() {
  return false
}
export function mkdirSync() {}
export function readdirSync() {
  return []
}
export function statSync() {
  return { isFile: () => false, isDirectory: () => false }
}
export function writeFile() {
  return Promise.resolve()
}
export function readFile() {
  return Promise.resolve("")
}
export default {
  openSync,
  writeSync,
  closeSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFile,
  readFile,
}
