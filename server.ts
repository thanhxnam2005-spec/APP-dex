import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'default-secret-key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: 'none'
}));

// Google OAuth Setup
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appUrl = process.env.APP_URL || 'http://localhost:3000';
const redirectUri = `${appUrl.replace(/\/$/, '')}/auth/callback`;

let oauth2Client: any = null;

if (googleClientId && googleClientSecret) {
  try {
    oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      redirectUri
    );
    console.log('OAuth2 Client initialized successfully');
  } catch (e) {
    console.error('Failed to initialize OAuth2 Client:', e);
  }
} else {
  console.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing. OAuth features will be disabled.');
}

// API Routes
app.get('/api/diag', (req, res) => {
  res.json({
    env: {
      GOOGLE_CLIENT_ID: !!googleClientId,
      GOOGLE_CLIENT_SECRET: !!googleClientSecret,
      APP_URL: appUrl,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      NODE_ENV: process.env.NODE_ENV
    },
    redirectUri,
    isVercel: !!process.env.VERCEL
  });
});

app.get('/api/auth/google/url', (req, res) => {
  if (!oauth2Client) {
    return res.status(503).json({ error: 'Google OAuth is not configured on the server.' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  res.json({ url });
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('No code provided');
  }

  if (!oauth2Client) {
    return res.status(500).send('OAuth client not initialized');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ isAuthenticated: !!req.session?.tokens });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.post('/api/drive/upload', async (req, res) => {
  if (!req.session?.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!oauth2Client) {
    return res.status(500).json({ error: 'OAuth client not initialized' });
  }

  const { name, content } = req.body;
  if (!name || !content) {
    return res.status(400).json({ error: 'Missing name or content' });
  }

  try {
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const fileMetadata = {
      name: `${name}.txt`,
      mimeType: 'text/plain',
    };
    const media = {
      mimeType: 'text/plain',
      body: content,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    res.json({ 
      success: true, 
      fileId: response.data.id,
      link: response.data.webViewLink 
    });
  } catch (error: any) {
    console.error('Error uploading to Drive:', error);
    if (error.code === 401) {
      req.session = null;
      return res.status(401).json({ error: 'Session expired' });
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Vite Integration
async function bootstrap() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Avoid infinite loop if common files missing
      if (req.path.includes('.')) return res.status(404).end();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if not in a serverless environment (Vercel)
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

bootstrap();

export default app;
