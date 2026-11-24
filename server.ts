import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import type {NextFunction, Request, Response} from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const TEMP_DIR = path.resolve(UPLOADS_DIR, 'tmp');
const META_PATH = path.resolve(UPLOADS_DIR, 'release-meta.json');
const ADMIN_PATH = path.resolve(UPLOADS_DIR, 'admin-auth.json');
const EXE_STORAGE_NAME = 'gamevoice-release.exe';
const EXE_STORAGE_PATH = path.resolve(UPLOADS_DIR, EXE_STORAGE_NAME);

fs.mkdirSync(UPLOADS_DIR, {recursive: true});
fs.mkdirSync(TEMP_DIR, {recursive: true});

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

interface StoredReleaseMeta {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  version: string;
  notes: string;
  uploadedAt: string;
  downloadCount: number;
}

interface StoredAdminAuth {
  salt: string;
  hash: string;
  createdAt: string;
}

function assertInsideUploads(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (resolved !== UPLOADS_DIR && !resolved.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid file path outside uploads directory');
  }
  return resolved;
}

function readReleaseMeta(): StoredReleaseMeta | null {
  try {
    if (!fs.existsSync(META_PATH) || !fs.existsSync(EXE_STORAGE_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(META_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoredReleaseMeta;
    const stats = fs.statSync(EXE_STORAGE_PATH);
    return {
      ...parsed,
      sizeBytes: stats.size,
    };
  } catch {
    return null;
  }
}

function writeReleaseMeta(meta: StoredReleaseMeta): void {
  assertInsideUploads(META_PATH);
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
}

function readAdminAuth(): StoredAdminAuth | null {
  try {
    if (!fs.existsSync(ADMIN_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(ADMIN_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoredAdminAuth;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeExeFileName(originalName: string): string {
  const base = path.basename(originalName || 'GameVoice-Setup.exe');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const withoutTrailingDots = cleaned.replace(/\.+$/, '');
  if (!withoutTrailingDots) {
    return 'GameVoice-Setup.exe';
  }
  return withoutTrailingDots.toLowerCase().endsWith('.exe')
    ? withoutTrailingDots
    : `${withoutTrailingDots}.exe`;
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function signSessionToken(): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.from(JSON.stringify({exp, nonce})).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const [payload, signature] = parts;
  if (!payload || !signature) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {exp?: number};
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function extractBearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return undefined;
  }
  return auth.slice('Bearer '.length).trim();
}

function verifyPasscode(candidate: string): boolean {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  if (envPasscode) {
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(envPasscode).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const stored = readAdminAuth();
  if (!stored) {
    return false;
  }
  const derived = crypto.scryptSync(candidate, stored.salt, 64);
  const expected = Buffer.from(stored.hash, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({error: 'Yetkisiz erişim. Lütfen yönetici parolası ile giriş yapın.'});
    return;
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, TEMP_DIR);
    },
    filename: (_req, _file, cb) => {
      cb(null, `upload-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.tmp`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const lower = (file.originalname || '').toLowerCase();
    if (!lower.endsWith('.exe')) {
      cb(new Error('Sadece .exe uzantılı Windows kurulum dosyaları yüklenebilir.'));
      return;
    }
    cb(null, true);
  },
});

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit: '1mb'}));

  app.get('/api/health', (_req, res) => {
    res.json({ok: true});
  });

  app.get('/api/auth/status', (req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());
    const claimed = envConfigured || Boolean(readAdminAuth());
    const authenticated = verifySessionToken(extractBearerToken(req));
    res.json({
      envConfigured,
      claimed,
      authenticated,
    });
  });

  app.post('/api/auth/setup', (req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());
    if (envConfigured || readAdminAuth()) {
      res.status(409).json({
        error: 'Yönetici parolası zaten tanımlanmış. Mevcut parolanız ile giriş yapın.',
      });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 4 || passcode.length > 128) {
      res.status(400).json({
        error: 'Parola en az 4, en fazla 128 karakter olmalıdır.',
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
    const record: StoredAdminAuth = {
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };

    try {
      assertInsideUploads(ADMIN_PATH);
      fs.writeFileSync(ADMIN_PATH, JSON.stringify(record, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
      const token = signSessionToken();
      res.status(201).json({token});
    } catch {
      res.status(409).json({
        error: 'Yönetici parolası zaten tanımlanmış.',
      });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!passcode) {
      res.status(400).json({error: 'Lütfen yönetici parolasını girin.'});
      return;
    }
    if (!verifyPasscode(passcode)) {
      res.status(401).json({error: 'Parola hatalı. Lütfen tekrar deneyin.'});
      return;
    }
    const token = signSessionToken();
    res.json({token});
  });

  app.get('/api/release', (_req, res) => {
    const meta = readReleaseMeta();
    if (!meta) {
      res.json({
        available: false,
        fileName: 'GameVoice-Setup.exe',
        sizeBytes: 0,
        sha256: '',
        version: '1.0.0',
        notes: '',
        uploadedAt: null,
        downloadCount: 0,
      });
      return;
    }
    res.json({
      available: true,
      ...meta,
    });
  });

  app.post('/api/release/upload', requireAdmin, (req, res) => {
    upload.single('file')(req, res, async (err: unknown) => {
      if (err) {
        const message =
          err instanceof Error ? err.message : 'Dosya yüklenirken bir hata oluştu.';
        res.status(400).json({error: message});
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({error: 'Lütfen bir .exe dosyası seçin.'});
        return;
      }

      const resolvedTemp = assertInsideUploads(file.path);

      try {
        const rawVersion = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
        const version = rawVersion.slice(0, 32) || '1.0.0';
        const rawNotes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
        const notes = rawNotes.slice(0, 500);

        const sha256 = await computeFileSha256(resolvedTemp);
        const safeName = sanitizeExeFileName(file.originalname);

        assertInsideUploads(EXE_STORAGE_PATH);
        fs.renameSync(resolvedTemp, EXE_STORAGE_PATH);

        const existing = readReleaseMeta();
        const meta: StoredReleaseMeta = {
          fileName: safeName,
          sizeBytes: file.size,
          sha256,
          version,
          notes,
          uploadedAt: new Date().toISOString(),
          downloadCount: existing ? existing.downloadCount : 0,
        };
        writeReleaseMeta(meta);

        res.status(201).json({
          available: true,
          ...meta,
        });
      } catch {
        if (fs.existsSync(resolvedTemp)) {
          fs.unlinkSync(resolvedTemp);
        }
        res.status(500).json({error: 'Dosya sunucuya kaydedilemedi.'});
      }
    });
  });

  app.delete('/api/release', requireAdmin, (_req, res) => {
    try {
      if (fs.existsSync(EXE_STORAGE_PATH)) {
        fs.unlinkSync(EXE_STORAGE_PATH);
      }
      if (fs.existsSync(META_PATH)) {
        fs.unlinkSync(META_PATH);
      }
      res.json({
        available: false,
        fileName: 'GameVoice-Setup.exe',
        sizeBytes: 0,
        sha256: '',
        version: '1.0.0',
        notes: '',
        uploadedAt: null,
        downloadCount: 0,
      });
    } catch {
      res.status(500).json({error: 'Dosya kaldırılırken bir hata oluştu.'});
    }
  });

  const handleDownload = (_req: Request, res: Response) => {
    const meta = readReleaseMeta();
    if (!meta || !fs.existsSync(EXE_STORAGE_PATH)) {
      res.status(404).json({
        error: 'Henüz indirilebilir bir GameVoice .exe dosyası yüklenmemiş.',
      });
      return;
    }

    const updated: StoredReleaseMeta = {
      ...meta,
      downloadCount: (meta.downloadCount || 0) + 1,
    };
    try {
      writeReleaseMeta(updated);
    } catch {
      // Download still proceeds even if counter write fails
    }

    const downloadName = sanitizeExeFileName(meta.fileName);
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(assertInsideUploads(EXE_STORAGE_PATH));
  };

  app.get('/download/gamevoice.exe', handleDownload);
  app.get('/api/release/download', handleDownload);

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GameVoice server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
