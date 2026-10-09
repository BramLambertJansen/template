import { env } from '#core/api/env.ts';
import { startServer } from '#core/api/http/serve.ts';
import { buildApp } from './app.ts';

// env() controleert de hele omgeving bij opstart (framework §6) en faalt met alle fouten tegelijk.
const { appOrigin, apiPort } = env();
startServer(buildApp({ appOrigin }), apiPort);
