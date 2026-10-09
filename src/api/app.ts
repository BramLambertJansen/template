import { createApp, type AppConfig } from '#core/api/http/create-app.ts';

// Compositie-root van de app (ADR 0008). Zonder neveneffect bij importeren: src/web leest hier alleen het type.
export function buildApp(config: AppConfig) {
  return createApp(config);
}

export type AppType = ReturnType<typeof buildApp>;
