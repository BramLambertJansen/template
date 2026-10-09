import { createRouteKit } from '#core/api/route/kit.ts';
import { permissions } from '#shared/permissions.ts';

// Compositie-root (ADR 0008): defineRoute met de permissietabel van de app.
export const { defineRoute } = createRouteKit({ permissions });
