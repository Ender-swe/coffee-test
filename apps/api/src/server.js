import { app } from './app.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`Orlast API running on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
