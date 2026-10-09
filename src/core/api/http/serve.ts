import { serve } from '@hono/node-server';

interface Fetchable {
  fetch: (request: Request) => Response | Promise<Response>;
}

// Node-ingang; host-adapters in deploy/<host>/ gebruiken dit niet.
export function startServer(app: Fetchable, port: number): void {
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    console.info(`API op http://127.0.0.1:${String(info.port)}`);
  });
}
