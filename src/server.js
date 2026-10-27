import app from './app.js';
import env from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Flock Energy API Wrapper running on port ${env.PORT}`);
  console.log(`📡 Upstream Portal : ${env.URJA_BASE_URL}`);
  console.log(`📖 Interactive Docs: http://localhost:${env.PORT}/docs`);
  console.log(`📑 OpenAPI JSON    : http://localhost:${env.PORT}/openapi.json`);
  console.log(`🩺 Health Check    : http://localhost:${env.PORT}/health`);
  console.log(`⚡ Environment     : ${env.NODE_ENV}`);
  console.log(`=======================================================`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown if taking longer than 10s
  setTimeout(() => {
    console.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default server;
