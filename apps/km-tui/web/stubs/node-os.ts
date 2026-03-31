/** Browser stub for node:os */
export function hostname() {
  return "browser"
}
export function platform() {
  return "browser"
}
export function tmpdir() {
  return "/tmp"
}
export function homedir() {
  return "/"
}
export function cpus() {
  return [{ model: "browser", speed: 0 }]
}
export default { hostname, platform, tmpdir, homedir, cpus }
