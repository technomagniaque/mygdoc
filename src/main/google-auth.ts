import { safeStorage, shell } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { getOAuthCredentialsFilePath, getOAuthTokenFilePath } from './app-paths';
import { OAuthCredentialsInput } from '../shared/types';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export class GoogleAuthManager {
  private oauth2Client: OAuth2Client | null = null;
  private connected = false;

  hasCredentials(): boolean {
    return this.loadClientCredentials() !== null;
  }

  isConnected(): boolean {
    return this.connected && this.oauth2Client !== null;
  }

  saveClientCredentials(input: OAuthCredentialsInput): void {
    const filePath = getOAuthCredentialsFilePath();
    const payload = {
      clientId: input.clientId.trim(),
      clientSecret: input.clientSecret.trim(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    this.oauth2Client = null;
    this.connected = false;
  }

  private loadClientCredentials(): OAuthCredentialsInput | null {
    const envId = process.env.GDOCS_CLIENT_ID;
    const envSecret = process.env.GDOCS_CLIENT_SECRET;
    if (envId && envSecret) {
      return { clientId: envId, clientSecret: envSecret };
    }

    const filePath = getOAuthCredentialsFilePath();
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      if (typeof raw.clientId === 'string' && typeof raw.clientSecret === 'string') {
        return { clientId: raw.clientId, clientSecret: raw.clientSecret };
      }
      const installed = (raw.installed || raw.web) as
        | { client_id?: string; client_secret?: string }
        | undefined;
      if (installed?.client_id && installed?.client_secret) {
        return { clientId: installed.client_id, clientSecret: installed.client_secret };
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveTokens(tokens: Credentials): void {
    const filePath = getOAuthTokenFilePath();
    const serialized = JSON.stringify(tokens);
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(serialized);
      fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
    } else {
      fs.writeFileSync(filePath, Buffer.from(`PLAIN:${serialized}`, 'utf-8'), { mode: 0o600 });
    }
  }

  private loadTokens(): Credentials | null {
    const filePath = getOAuthTokenFilePath();
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath);
      const asText = raw.toString('utf-8');
      if (asText.startsWith('PLAIN:')) {
        return JSON.parse(asText.slice('PLAIN:'.length)) as Credentials;
      }
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(raw);
        return JSON.parse(decrypted) as Credentials;
      }
      return null;
    } catch {
      return null;
    }
  }

  async restoreSession(): Promise<boolean> {
    const creds = this.loadClientCredentials();
    if (!creds) return false;

    const tokens = this.loadTokens();
    if (!tokens) return false;

    const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, 'http://127.0.0.1');
    client.setCredentials(tokens);
    client.on('tokens', (newTokens) => {
      const merged = { ...client.credentials, ...newTokens };
      this.saveTokens(merged);
    });

    this.oauth2Client = client;
    this.connected = Boolean(tokens.refresh_token || tokens.access_token);
    return this.connected;
  }

  async startInteractiveLogin(): Promise<void> {
    const creds = this.loadClientCredentials();
    if (!creds) {
      throw new Error(
        'Identifiants OAuth2 manquants. Configurez Client ID et Client Secret dans les paramètres.'
      );
    }

    await new Promise<void>((resolve, reject) => {
      const server = http.createServer();
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        server.close();
        if (err) reject(err);
        else resolve();
      };

      const timeout = setTimeout(() => {
        finish(new Error('Délai d’authentification OAuth2 dépassé (3 minutes)'));
      }, 180_000);

      server.on('request', async (req, res) => {
        if (!req.url || !req.url.startsWith('/oauth2callback')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        const code = reqUrl.searchParams.get('code');
        const errorParam = reqUrl.searchParams.get('error');

        if (errorParam || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2>Authentification annulée ou refusée.</h2><p>Vous pouvez fermer cet onglet.</p>');
          clearTimeout(timeout);
          finish(new Error(`OAuth2 refusé : ${errorParam || 'code absent'}`));
          return;
        }

        try {
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
          const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
          const { tokens } = await client.getToken(code);
          client.setCredentials(tokens);
          client.on('tokens', (newTokens) => {
            this.saveTokens({ ...client.credentials, ...newTokens });
          });

          this.saveTokens(tokens);
          this.oauth2Client = client;
          this.connected = true;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<h2>Connexion Google Drive réussie !</h2><p>Vous pouvez fermer cet onglet et revenir à Google Docs Desktop.</p>'
          );
          clearTimeout(timeout);
          finish();
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2>Erreur lors de l’échange du jeton OAuth2.</h2>');
          clearTimeout(timeout);
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
        const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);

        const authUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: DRIVE_SCOPES,
        });

        void shell.openExternal(authUrl);
      });
    });
  }

  disconnect(): void {
    const tokenPath = getOAuthTokenFilePath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    this.oauth2Client = null;
    this.connected = false;
  }

  getClient(): OAuth2Client | null {
    return this.oauth2Client;
  }
}
