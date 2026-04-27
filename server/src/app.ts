import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectScope } from './middleware/projectScope.js';
import projectsRouter from './routes/projects.js';
import devicesRouter from './routes/devices.js';
import subnetsRouter from './routes/subnets.js';
import connectionsRouter from './routes/connections.js';
import commandOutputsRouter from './routes/commandOutputs.js';
import routerConfigsRouter from './routes/routerConfigs.js';
import diagramRouter from './routes/diagram.js';
import highlightRulesRouter from './routes/highlightRules.js';
import credentialsRouter from './routes/credentials.js';
import deviceSubnetsRouter from './routes/deviceSubnets.js';
import backupRouter from './routes/backup.js';
import settingsRouter from './routes/settings.js';
import activityLogsRouter from './routes/activityLogs.js';
import deviceImagesRouter from './routes/deviceImages.js';
import devicePortsRouter from './routes/devicePorts.js';
import deviceAttachmentsRouter from './routes/deviceAttachments.js';
import adminLogsRouter from './routes/adminLogs.js';
import diagramIconsRouter from './routes/diagramIcons.js';
import imageLibraryRouter from './routes/imageLibrary.js';
import deviceImportRouter from './routes/deviceImport.js';
import drawioImportRouter from './routes/drawioImport.js';
import sqlQueryRouter from './routes/sqlQuery.js';
import timelineRouter from './routes/timeline.js';
import agentsRouter from './routes/agents.js';
import agentTypesRouter from './routes/agentTypes.js';
import searchRouter from './routes/search.js';
import deviceCsvImportRouter from './routes/deviceCsvImport.js';
import credentialCsvImportRouter from './routes/credentialCsvImport.js';
import agentDiagramRouter from './routes/agentDiagram.js';
import agentConnectionsRouter from './routes/agentConnections.js';
import undoRouter from './routes/undo.js';
import trashRouter from './routes/trash.js';
import eventsRouter from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Trust the first proxy in front of us (nginx/caddy/etc). Without this, the
// rate limiter's per-IP bucket would key on the proxy's address — one bucket
// for every real user. Set to 'loopback' so we only trust local reverse
// proxies, not arbitrary upstream X-Forwarded-For headers.
app.set('trust proxy', 'loopback');

// Security headers via helmet.
// - CSP is only enabled in production because the Vite dev server injects inline scripts
//   and connects to an HMR websocket, both of which a strict CSP would break.
// - crossOriginResourcePolicy is set to cross-origin so the API (port 3001) can serve
//   images/attachments embedded by the client dev server (port 5173).
app.use(helmet({
  contentSecurityPolicy: isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          // React sets inline styles in various places; allow 'unsafe-inline' for styles only.
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          // data: is used for base64-encoded icons/images stored in the DB.
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      }
    : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // HSTS only makes sense over HTTPS; helmet enables it by default which is fine
  // (browsers ignore the header on plain HTTP).
}));

// CORS: in production, allow all origins since the client is served from the
// same Express server (same-origin). In development, restrict to known dev
// server origins (configurable via ALLOWED_ORIGINS env var).
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;
// Vite binds to 0.0.0.0, so the client may be reached over the LAN — accept any
// host on the standard dev ports rather than only localhost.
const DEV_PORTS = new Set(['5173', '8080', '3001']);
app.use(cors({
  origin: (origin, callback) => {
    // No origin header (same-origin, curl, server-to-server) — always allow
    if (!origin) {
      return callback(null, true);
    }
    // Production: client is served by Express on the same port, so any
    // origin reaching this server is legitimate (IP, hostname, domain)
    if (isProduction && !allowedOrigins) {
      return callback(null, true);
    }
    if (allowedOrigins?.some(o => o === origin || (o.startsWith('*.') && origin.endsWith(o.slice(1))))) {
      return callback(null, true);
    }
    // In dev, also accept any host on the standard dev ports (Vite binds 0.0.0.0
    // for LAN access). Prod still requires an explicit ALLOWED_ORIGINS match.
    if (!isProduction) {
      try {
        const port = new URL(origin).port;
        if (DEV_PORTS.has(port)) return callback(null, true);
      } catch { /* fall through to reject */ }
    }
    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again later' },
  // Tests POST many credentials/uploads in succession from a single IP; the
  // 20/min cap kicks in mid-suite. Bypass when explicitly running under tests.
  skip: () => process.env.NODE_ENV === 'test',
});

// Events (SSE) is mounted BEFORE the rate limiter. A long-lived stream should
// not count against the per-minute request cap, and browser auto-reconnects
// during a server restart could otherwise exhaust the bucket and lock the user
// out of normal API calls.
app.use('/api/projects/:projectId/events', projectScope, eventsRouter);

app.use('/api/', apiLimiter);

// Body parsers — routes that accept file uploads or large diagram payloads get
// 10MB; everything else gets 1MB. Each route mounts its own parser so the limit
// is explicit per route instead of a substring match that could misfire on
// project slugs containing "import"/"backup"/etc.
const largeBody = express.json({ limit: '10mb' });
const defaultBody = express.json({ limit: '1mb' });

// Large-body routes — mount the 10MB parser as route middleware directly.
app.use('/api/backup', largeBody, uploadLimiter, backupRouter);
app.use('/api/projects/:projectId/backup', largeBody, projectScope, uploadLimiter, backupRouter);
app.use('/api/projects/:projectId/credentials', largeBody, projectScope, uploadLimiter, credentialsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/images', largeBody, projectScope, uploadLimiter, deviceImagesRouter);
app.use('/api/projects/:projectId/devices/:deviceId/attachments', largeBody, projectScope, uploadLimiter, deviceAttachmentsRouter);
app.use('/api/projects/:projectId/diagram-icons', largeBody, projectScope, uploadLimiter, diagramIconsRouter);
app.use('/api/projects/:projectId/agent-types', largeBody, projectScope, uploadLimiter, agentTypesRouter);
app.use('/api/projects/:projectId/image-library', largeBody, projectScope, uploadLimiter, imageLibraryRouter);
app.use('/api/projects/:projectId/import', largeBody, projectScope, uploadLimiter, deviceImportRouter);
app.use('/api/projects/:projectId/drawio-import', largeBody, projectScope, uploadLimiter, drawioImportRouter);
app.use('/api/projects/:projectId/diagram', largeBody, projectScope, diagramRouter);
app.use('/api/projects/:projectId/agent-diagram', largeBody, projectScope, agentDiagramRouter);
app.use('/api/projects/:projectId/device-csv-import', largeBody, projectScope, deviceCsvImportRouter);
app.use('/api/projects/:projectId/credential-csv-import', largeBody, projectScope, credentialCsvImportRouter);

// Project image upload needs the 10MB body + upload limiter. The handler itself
// lives on projectsRouter below; this middleware just applies the parsing/limit
// before the default 1MB parser locks it out.
app.post('/api/projects/:id/image', largeBody, uploadLimiter, (_req, _res, next) => next());

// Default 1MB parser for the remaining routes.
app.use(defaultBody);

// Top-level routes (not project-scoped)
app.use('/api/projects', projectsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/logs', adminLogsRouter);

// Project-scoped routes
app.use('/api/projects/:projectId/devices', projectScope, devicesRouter);
app.use('/api/projects/:projectId/subnets', projectScope, subnetsRouter);
app.use('/api/projects/:projectId/connections', projectScope, connectionsRouter);
app.use('/api/projects/:projectId/command-outputs', projectScope, commandOutputsRouter);
app.use('/api/projects/:projectId/router-configs', projectScope, routerConfigsRouter);
app.use('/api/projects/:projectId/highlight-rules', projectScope, highlightRulesRouter);
app.use('/api/projects/:projectId/device-subnets', projectScope, deviceSubnetsRouter);
app.use('/api/projects/:projectId/logs', projectScope, activityLogsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/ports', projectScope, devicePortsRouter);
app.use('/api/projects/:projectId/query', projectScope, sqlQueryRouter);
app.use('/api/projects/:projectId/timeline', projectScope, timelineRouter);
app.use('/api/projects/:projectId/agents', projectScope, agentsRouter);
app.use('/api/projects/:projectId/search', projectScope, searchRouter);
app.use('/api/projects/:projectId/agent-connections', projectScope, agentConnectionsRouter);
app.use('/api/projects/:projectId/undo', projectScope, undoRouter);
app.use('/api/projects/:projectId/trash', projectScope, trashRouter);

// Global error handler — catches unhandled errors from route handlers
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
