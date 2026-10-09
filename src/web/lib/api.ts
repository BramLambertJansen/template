import type { AppType } from '#api/app.ts';
import { createApiClient } from '#core/web/lib/api-client.ts';

export const api = createApiClient<AppType>();
