import { createApp } from '#core/api/http/create-app.ts';

// Compositie-root van de app (ADR 0008).
export const app = createApp();

export type AppType = typeof app;
