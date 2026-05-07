// Next.js instrumentation intentionally stays side-effect free.
//
// Task recovery is owned by the dedicated worker/watchdog process started from
// package scripts (`dev:watchdog` / `start:watchdog`). Keeping this hook free of
// Node-only task infrastructure prevents Next edge/runtime boot paths from
// loading worker-owned dependencies.
export function register() {
  return undefined
}
