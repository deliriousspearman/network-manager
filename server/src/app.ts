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
import sqlQueryRouter from './routes/sqlQuery.js';
import timelineRouter from './routes/timeline.js';
import agentsRouter from './routes/agents.js';
import searchRouter from './routes/search.js';
import deviceCsvImportRouter from './routes/deviceCsvImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

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
const defaultDevOrigins = ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3001'];
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
    const origins = allowedOrigins || defaultDevOrigins;
    if (origins.some(o => o === origin || (o.startsWith('*.') && origin.endsWith(o.slice(1))))) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
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
});

app.use('/api/', apiLimiter);

// Body parsers — large-body routes get 10MB, everything else gets 1MB.
// The large-body parser is applied first on specific routes so the default 1MB parser
// doesn't reject them before they're matched.
const largeBody = express.json({ limit: '10mb' });
const defaultBody = express.json({ limit: '1mb' });

// Paths that need the larger body limit (checked by substring)
const largeBodySubPaths = ['/diagram', '/credentials', '/backup', '/images', '/attachments', '/diagram-icons', '/image-library', '/import'];

app.use((req, res, next) => {
  const p = req.path;
  const needsLarge = p === '/api/backup' ||
    largeBodySubPaths.some(sub => p.includes(sub));
  if (needsLarge) {
    largeBody(req, res, next);
  } else {
    defaultBody(req, res, next);
  }
});

// Top-level routes (not project-scoped)
app.use('/api/projects', projectsRouter);
app.use('/api/backup', uploadLimiter, backupRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/logs', adminLogsRouter);

// Project-scoped routes
app.use('/api/projects/:projectId/devices', projectScope, devicesRouter);
app.use('/api/projects/:projectId/subnets', projectScope, subnetsRouter);
app.use('/api/projects/:projectId/connections', projectScope, connectionsRouter);
app.use('/api/projects/:projectId/command-outputs', projectScope, commandOutputsRouter);
app.use('/api/projects/:projectId/router-configs', projectScope, routerConfigsRouter);
app.use('/api/projects/:projectId/diagram', projectScope, diagramRouter);
app.use('/api/projects/:projectId/highlight-rules', projectScope, highlightRulesRouter);
app.use('/api/projects/:projectId/credentials', projectScope, uploadLimiter, credentialsRouter);
app.use('/api/projects/:projectId/device-subnets', projectScope, deviceSubnetsRouter);
app.use('/api/projects/:projectId/backup', projectScope, uploadLimiter, backupRouter);
app.use('/api/projects/:projectId/logs', projectScope, activityLogsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/images', projectScope, uploadLimiter, deviceImagesRouter);
app.use('/api/projects/:projectId/devices/:deviceId/ports', projectScope, devicePortsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/attachments', projectScope, uploadLimiter, deviceAttachmentsRouter);
app.use('/api/projects/:projectId/diagram-icons', projectScope, uploadLimiter, diagramIconsRouter);
app.use('/api/projects/:projectId/image-library', projectScope, uploadLimiter, imageLibraryRouter);
app.use('/api/projects/:projectId/import', projectScope, uploadLimiter, deviceImportRouter);
app.use('/api/projects/:projectId/query', projectScope, sqlQueryRouter);
app.use('/api/projects/:projectId/timeline', projectScope, timelineRouter);
app.use('/api/projects/:projectId/agents', projectScope, agentsRouter);
app.use('/api/projects/:projectId/search', projectScope, searchRouter);
app.use('/api/projects/:projectId/device-csv-import', projectScope, deviceCsvImportRouter);

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
