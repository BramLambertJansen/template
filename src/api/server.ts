import { env } from '#core/api/env.ts';
import { startServer } from '#core/api/http/serve.ts';
import { app } from './app.ts';

startServer(app, env.apiPort);
