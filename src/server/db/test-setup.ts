// Silences the one-time `ExperimentalWarning: SQLite is an experimental feature`
// emitted by node:sqlite. Expected Node runtime notice, not test noise — see
// src/server/db/test-d1.ts.
//
// Node's default stderr-printing of process warnings is itself just a
// 'warning' listener, so adding our own on top of it doesn't suppress
// anything — we have to remove the default listener and re-implement
// pass-through for every warning except this one.
const defaultListeners = process.listeners('warning')
process.removeAllListeners('warning')
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && /SQLite is an experimental feature/.test(warning.message)) {
    return
  }
  for (const listener of defaultListeners) listener(warning)
})
