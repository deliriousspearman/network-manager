import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import fs from 'fs';
import { projectScope } from './middleware/projectScope.js';
import projectsRouter from './routes/projects.js';
import devicesRouter from './routes/devices.js';
import subnetsRouter from './routes/subnets.js';
import connectionsRouter from './routes/connections.js';
import commandOutputsRouter from './routes/commandOutputs.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: restrict to known origins (configurable via ALLOWED_ORIGINS env var)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null; // null = use default list below
const defaultOrigins = ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);
    const origins = allowedOrigins || defaultOrigins;
    // Check exact match or wildcard subdomain patterns
    if (origins.some(o => o === origin || (o.startsWith('*.') && origin.endsWith(o.slice(1))))) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Default body limit: 1MB (file upload routes use higher limits below)
app.use(express.json({ limit: '1mb' }));

// Higher body limit for routes that handle file uploads or large payloads
const largeBody = express.json({ limit: '10mb' });

// Top-level routes (not project-scoped)
app.use('/api/projects', projectsRouter);
app.use('/api/backup', largeBody, backupRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/logs', adminLogsRouter);

// Project-scoped routes
app.use('/api/projects/:projectId/devices', projectScope, devicesRouter);
app.use('/api/projects/:projectId/subnets', projectScope, subnetsRouter);
app.use('/api/projects/:projectId/connections', projectScope, connectionsRouter);
app.use('/api/projects/:projectId/command-outputs', projectScope, commandOutputsRouter);
app.use('/api/projects/:projectId/diagram', projectScope, largeBody, diagramRouter);
app.use('/api/projects/:projectId/highlight-rules', projectScope, highlightRulesRouter);
app.use('/api/projects/:projectId/credentials', projectScope, largeBody, credentialsRouter);
app.use('/api/projects/:projectId/device-subnets', projectScope, deviceSubnetsRouter);
app.use('/api/projects/:projectId/backup', projectScope, largeBody, backupRouter);
app.use('/api/projects/:projectId/logs', projectScope, activityLogsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/images', projectScope, largeBody, deviceImagesRouter);
app.use('/api/projects/:projectId/devices/:deviceId/ports', projectScope, devicePortsRouter);
app.use('/api/projects/:projectId/devices/:deviceId/attachments', projectScope, largeBody, deviceAttachmentsRouter);
app.use('/api/projects/:projectId/diagram-icons', projectScope, largeBody, diagramIconsRouter);
app.use('/api/projects/:projectId/image-library', projectScope, largeBody, imageLibraryRouter);

// Serve client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start HTTPS server if SSL_CERT and SSL_KEY are provided, otherwise HTTP
if (process.env.SSL_CERT && process.env.SSL_KEY) {
  const sslPort = process.env.SSL_PORT || 3443;
  const cert = fs.readFileSync(process.env.SSL_CERT);
  const key = fs.readFileSync(process.env.SSL_KEY);
  https.createServer({ cert, key }, app).listen(sslPort, () => {
    console.log(`Server running on https://localhost:${sslPort}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
