import pino from 'pino';

// In non-TTY environments (systemd service), pino-pretty's worker thread
// buffers output and never flushes to the log file. Use it only when
// stdout is a TTY (interactive dev); otherwise write plain JSON which
// pino flushes synchronously via sonic-boom.
const isTTY = process.stdout.isTTY === true;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    ...(isTTY && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
  isTTY ? undefined : pino.destination({ dest: 1, sync: true }),
);

// Route uncaught errors through pino so they get timestamps in stderr
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
