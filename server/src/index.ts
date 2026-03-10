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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Top-level routes (not project-scoped)
app.use('/api/projects', projectsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/settings', settingsRouter);

// Project-scoped routes
app.use('/api/projects/:projectId/devices', projectScope, devicesRouter);
app.use('/api/projects/:projectId/subnets', projectScope, subnetsRouter);
app.use('/api/projects/:projectId/connections', projectScope, connectionsRouter);
app.use('/api/projects/:projectId/command-outputs', projectScope, commandOutputsRouter);
app.use('/api/projects/:projectId/diagram', projectScope, diagramRouter);
app.use('/api/projects/:projectId/highlight-rules', projectScope, highlightRulesRouter);
app.use('/api/projects/:projectId/credentials', projectScope, credentialsRouter);
app.use('/api/projects/:projectId/device-subnets', projectScope, deviceSubnetsRouter);
app.use('/api/projects/:projectId/backup', projectScope, backupRouter);
app.use('/api/projects/:projectId/logs', projectScope, activityLogsRouter);

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
