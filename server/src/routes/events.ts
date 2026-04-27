import { Router } from 'express';
import { subscribe } from '../events/bus.js';

const router = Router({ mergeParams: true });

const HEARTBEAT_MS = 25_000;

router.get('/', (req, res) => {
  const projectId = res.locals.projectId as number;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy-level response buffering (nginx). Without this, events can
  // sit buffered until the response closes.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Prime the stream so the browser marks the connection as open immediately.
  res.write(': connected\n\n');

  const unsubscribe = subscribe(projectId, (event) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
  res.on('error', cleanup);
});

export default router;
