/** Browser stub for node:child_process */
export function execSync() {
  return ""
}
export function exec() {}
export function execFile() {}
export function spawn() {
  return {
    on() {
      return this
    },
    stdout: null,
    stderr: null,
    kill() {},
  }
}
export function fork() {
  return spawn()
}
export default { execSync, exec, execFile, spawn, fork }
