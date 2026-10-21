// Older deployed backends use a strict { message } schema.
// Keep plain-text chat compatible while frontend/backend roll out independently.
export function storeChatRequest(message: string, attachments: { name: string; data: string }[]) {
  return attachments.length ? { message, attachments } : { message };
}
