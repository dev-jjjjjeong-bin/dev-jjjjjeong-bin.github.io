import { handle } from "../../../server/api.js";
export function onRequest(context) {
  return handle(context.request, context.env, { waitUntil: task => context.waitUntil(task) });
}
