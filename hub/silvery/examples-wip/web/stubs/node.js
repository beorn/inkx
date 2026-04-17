// Empty stubs for Node.js builtins that silvery imports but doesn't use in browser
export const spawnSync = () => ({ stdout: "", stderr: "", status: 0 })
export const execSync = () => ""
export const spawn = () => ({})
export const exec = () => ({})
export default { spawnSync, execSync, spawn, exec }
