import https from 'https';
import fs from 'fs';
import app from './app.js';

const PORT = process.env.PORT || 3001;

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
