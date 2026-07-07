/**
 * utils/id.js — collision-safe id generation without external deps.
 */
export function generateId(prefix = "id") {
  const rand = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${prefix}_${rand}`;
}
