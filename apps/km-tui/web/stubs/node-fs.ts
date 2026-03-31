/** Browser stub for node:fs — no-op for all operations */

// Sync operations
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
export function unlinkSync() {}
export function renameSync() {}
export function copyFileSync() {}
export function realpathSync(p: string) {
  return p
}
export function lstatSync() {
  return { isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false }
}
export function statSync() {
  return { isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false }
}
export function chmodSync() {}
export function createWriteStream() {
  return {
    write() {},
    end() {},
    on() {
      return this
    },
    once() {
      return this
    },
  }
}
export function createReadStream() {
  return {
    on() {
      return this
    },
    once() {
      return this
    },
    pipe() {
      return this
    },
  }
}

// Promise/callback operations
export function writeFile() {
  return Promise.resolve()
}
export function readFile() {
  return Promise.resolve("")
}
export function mkdir() {
  return Promise.resolve()
}
export function access() {
  return Promise.resolve()
}
export function unlink() {
  return Promise.resolve()
}
export function rmdir() {
  return Promise.resolve()
}
export function rename() {
  return Promise.resolve()
}
export function copyFile() {
  return Promise.resolve()
}
export function stat() {
  return Promise.resolve({ isFile: () => false, isDirectory: () => false })
}
export function readdir() {
  return Promise.resolve([])
}

// Watch
export function watch() {
  return {
    close() {},
    on() {
      return this
    },
  }
}
export function watchFile() {}
export function unwatchFile() {}

// Constants
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 }

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
  unlinkSync,
  renameSync,
  copyFileSync,
  realpathSync,
  lstatSync,
  statSync,
  chmodSync,
  createWriteStream,
  createReadStream,
  writeFile,
  readFile,
  mkdir,
  access,
  unlink,
  rmdir,
  rename,
  copyFile,
  stat,
  readdir,
  watch,
  watchFile,
  unwatchFile,
  constants,
}
