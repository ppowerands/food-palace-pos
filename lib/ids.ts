// crypto.randomUUID only exists on https/localhost; phones on a local network need the fallback.
export const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
