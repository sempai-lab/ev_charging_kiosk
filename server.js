import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the dist directory
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));

// Handle React Router - serve index.html for all routes
app.get('*', (req, res) => {
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    const indexHtml = readFileSync(indexPath, 'utf-8');
    res.send(indexHtml);
  } else {
    res.status(404).send(`
      <html>
        <head><title>Build Required</title></head>
        <body>
          <h1>Application Not Built</h1>
          <p>Please run <code>npm run build</code> first to build the application.</p>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EV Charging Kiosk Server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Access from other devices: http://<raspberry-pi-ip>:${PORT}`);
});

