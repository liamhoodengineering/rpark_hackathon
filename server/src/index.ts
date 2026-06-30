import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `PinPoint API listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});
