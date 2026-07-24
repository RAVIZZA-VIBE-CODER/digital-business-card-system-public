import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { get as getBlob, put as putBlob } from '@vercel/blob';

type HubContent = Record<string, unknown>;
type CardRecord = Record<string, unknown> & { id: string; slug: string };
type SiteData = {
  hub: HubContent;
  cards: CardRecord[];
  labels?: Record<string, unknown>[];
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = process.cwd();
const DATA_FILE = path.join(ROOT_DIR, 'data', 'site-content.json');
const BLOB_SITE_DATA_PATH = process.env.SITE_DATA_BLOB_PATH || 'site-content.json';
const ADMIN_ACCESS_CODE = process.env.HUB_ACCESS_CODE || '';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ALLOWED_ASSET_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
]);

app.use(express.json({ limit: '20mb' }));

app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
app.use('/src', express.static(path.join(ROOT_DIR, 'src')));
app.use('/node_modules', express.static(path.join(ROOT_DIR, 'node_modules')));

function sanitizeSlug(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 80);
}

function publicDocumentPath(documentType: unknown, slug: string) {
  return `/${documentType === 'ticket' ? 'tickets' : 'cards'}/${slug}/`;
}

function createCardId() {
  return `card-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function createDefaultCanvas() {
  return {
    width: 1080,
    height: 1920,
    backgroundColor: '#090b10',
    borderColor: '#14e0e2',
    borderWidth: 4,
    borderRadius: 44,
    layers: [
      {
        id: `layer-${crypto.randomBytes(4).toString('hex')}`,
        type: 'text',
        text: 'New Business Card',
        x: 92,
        y: 180,
        w: 896,
        h: 120,
        color: '#ffffff',
        fontSize: 74,
        fontWeight: 800,
        align: 'center',
      },
      {
        id: `layer-${crypto.randomBytes(4).toString('hex')}`,
        type: 'text',
        text: 'Role / Company',
        x: 140,
        y: 330,
        w: 800,
        h: 72,
        color: '#9aa7b7',
        fontSize: 38,
        fontWeight: 500,
        align: 'center',
      },
      {
        id: `layer-${crypto.randomBytes(4).toString('hex')}`,
        type: 'shape',
        shape: 'rect',
        x: 180,
        y: 1440,
        w: 720,
        h: 4,
        fill: '#14e0e2',
        stroke: '#14e0e2',
        strokeWidth: 0,
        radius: 999,
      },
    ],
  };
}

function createDefaultCard(slug: string) {
  const cleanSlug = sanitizeSlug(slug) || `card-${Date.now().toString(36)}`;
  return {
    id: createCardId(),
    slug: cleanSlug,
    documentType: 'card',
    theme: 'canvas',
    slotName: 'New Card',
    domainLabel: cleanSlug.toUpperCase(),
    title: 'New Business Card',
    personName: '',
    role: '',
    description: '',
    tagline: '',
    logoPath: '',
    backgroundImage: '',
    companyLabel: '',
    labelIds: [],
    liveUrl: `/cards/${cleanSlug}/`,
    qrColor: '#14e0e2',
    primaryActionLabel: '',
    primaryActionUrl: '',
    secondaryActionLabel: '',
    secondaryActionUrl: '',
    contacts: [],
    stats: [],
    isVisible: true,
    isAvailable: false,
    canvas: createDefaultCanvas(),
  };
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(12).toString('hex'),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_ACCESS_CODE).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isValidSessionToken(token: string) {
  if (!ADMIN_ACCESS_CODE) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = crypto.createHmac('sha256', ADMIN_ACCESS_CODE).update(payload).digest();
  let submitted: Buffer;
  try {
    submitted = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { issuedAt?: number };
    return Number.isFinite(session.issuedAt)
      && Number(session.issuedAt) <= Date.now()
      && Date.now() - Number(session.issuedAt) < SESSION_TTL_MS;
  } catch {
    return false;
  }
}

function parseImageDataUrl(value: unknown) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) throw new Error('Upload must be a base64 image');
  const contentType = match[1].toLowerCase();
  const extension = ALLOWED_ASSET_TYPES.get(contentType);
  if (!extension) throw new Error('Supported images are PNG, JPG, WebP, GIF, and SVG');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new Error('Image must be between 1 byte and 8 MB');
  }
  return { buffer, contentType, extension };
}

function uniqueSlug(cards: CardRecord[], requestedSlug: unknown, ignoredId = '') {
  const base = sanitizeSlug(requestedSlug) || `card-${Date.now().toString(36)}`;
  let candidate = base;
  let index = 2;
  while (cards.some((card) => card.slug === candidate && card.id !== ignoredId)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

async function readSiteData(): Promise<SiteData> {
  if (hasBlobStorage()) {
    const blob = await getBlob(BLOB_SITE_DATA_PATH, { access: 'private', useCache: false });
    if (blob?.statusCode === 200) {
      const raw = await streamToString(blob.stream);
      return JSON.parse(raw) as SiteData;
    }
  }

  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw) as SiteData;
}

async function writeSiteData(data: SiteData) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  if (hasBlobStorage()) {
    await putBlob(BLOB_SITE_DATA_PATH, body, {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
    return;
  }

  await fs.writeFile(DATA_FILE, body, 'utf8');
}

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

async function streamToString(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

function normalizeSiteData(value: unknown): SiteData {
  const candidate = value as Partial<SiteData> | null;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Import must be a JSON object');
  }
  if (!candidate.hub || typeof candidate.hub !== 'object') {
    throw new Error('Import must include a hub object');
  }
  if (!Array.isArray(candidate.cards)) {
    throw new Error('Import must include a cards array');
  }

  return {
    hub: candidate.hub,
    labels: Array.isArray(candidate.labels) ? candidate.labels : [],
    cards: candidate.cards.map((card, index) => {
      const slug = uniqueSlug(candidate.cards.slice(0, index) as CardRecord[], card.slug || card.title || `card-${index + 1}`);
      return {
        ...card,
        id: String(card.id || createCardId()),
        slug,
        liveUrl: card.liveUrl || publicDocumentPath(card.documentType, slug),
      };
    }),
  };
}

function createPublicSitePayload(siteData: SiteData, requestedSlug = '') {
  const slug = sanitizeSlug(requestedSlug);
  const cards = slug
    ? siteData.cards.filter((card) => card.isVisible && card.slug === slug)
    : [];

  return {
    hub: siteData.hub,
    cards,
  };
}

function createPublicCardIndex(siteData: SiteData) {
  return {
    cards: siteData.cards
      .filter((card) => card.isVisible)
      .map((card) => ({
        id: card.id,
        slug: card.slug,
        title: card.title,
        personName: card.personName,
        role: card.role,
        description: card.description,
        domainLabel: card.domainLabel,
        liveUrl: card.liveUrl || publicDocumentPath(card.documentType, card.slug),
        logoPath: card.logoPath,
        theme: card.theme,
        documentType: card.documentType || 'card',
        isVisible: card.isVisible,
        isAvailable: card.isAvailable,
      })),
  };
}

function getSessionToken(req: Request) {
  const header = req.get('authorization');
  if (!header) return '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer') return '';
  return token || '';
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_ACCESS_CODE) {
    res.status(503).json({ error: 'Access code is not configured' });
    return;
  }

  const token = getSessionToken(req);
  if (!token || !isValidSessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

app.post('/api/login', (req, res) => {
  const submittedCode = String(req.body?.accessCode || req.body?.password || '');
  if (!ADMIN_ACCESS_CODE || submittedCode !== ADMIN_ACCESS_CODE) {
    res.status(401).json({ error: 'Invalid access code' });
    return;
  }

  const token = createSessionToken();
  res.json({ token });
});

app.post('/api/logout', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/assets', requireAdmin, async (req, res) => {
  try {
    const { buffer, contentType, extension } = parseImageDataUrl(req.body?.dataUrl);
    if (!hasBlobStorage()) {
      res.json({ url: req.body.dataUrl, storage: 'inline' });
      return;
    }

    const assetName = `${crypto.randomUUID()}.${extension}`;
    await putBlob(`card-assets/${assetName}`, buffer, {
      access: 'private',
      contentType,
      cacheControlMaxAge: 31536000,
    });
    res.status(201).json({
      url: `/api/assets/${assetName}`,
      storage: 'blob',
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to upload image' });
  }
});

app.get('/api/assets/:assetName', async (req, res) => {
  const assetName = String(req.params.assetName || '');
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|svg)$/.test(assetName)) {
    res.status(404).send('Asset not found');
    return;
  }

  try {
    const result = await getBlob(`card-assets/${assetName}`, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      res.status(404).send('Asset not found');
      return;
    }
    res.setHeader('Content-Type', result.blob.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    Readable.fromWeb(result.stream as never).pipe(res);
  } catch {
    res.status(404).send('Asset not found');
  }
});

app.get('/api/public-site', async (req, res) => {
  try {
    const siteData = await readSiteData();
    res.json(createPublicSitePayload(siteData, String(req.query.slug || '')));
  } catch {
    res.status(500).json({ error: 'Unable to load site data' });
  }
});

app.get('/api/public-cards', async (_req, res) => {
  try {
    const siteData = await readSiteData();
    res.json(createPublicCardIndex(siteData));
  } catch {
    res.status(500).json({ error: 'Unable to load public card index' });
  }
});

app.get('/api/admin-site', requireAdmin, async (_req, res) => {
  try {
    const siteData = await readSiteData();
    res.json(siteData);
  } catch {
    res.status(500).json({ error: 'Unable to load admin data' });
  }
});

app.get('/api/export-site', requireAdmin, async (_req, res) => {
  try {
    const siteData = await readSiteData();
    res.setHeader('Content-Disposition', 'attachment; filename="site-content.json"');
    res.json(siteData);
  } catch {
    res.status(500).json({ error: 'Unable to export site data' });
  }
});

app.put('/api/import-site', requireAdmin, async (req, res) => {
  try {
    const siteData = normalizeSiteData(req.body);
    await writeSiteData(siteData);
    res.json({
      ok: true,
      cards: siteData.cards.length,
      labels: siteData.labels?.length || 0,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to import site data' });
  }
});

app.put('/api/hub', requireAdmin, async (req, res) => {
  try {
    const siteData = await readSiteData();
    siteData.hub = {
      ...siteData.hub,
      ...req.body,
    };
    await writeSiteData(siteData);
    res.json(siteData.hub);
  } catch {
    res.status(500).json({ error: 'Unable to save hub content' });
  }
});

app.put('/api/labels', requireAdmin, async (req, res) => {
  try {
    const siteData = await readSiteData();
    siteData.labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
    const validLabelIds = new Set(siteData.labels.map((label) => String(label.id || '')).filter(Boolean));
    siteData.cards = siteData.cards.map((card) => ({
      ...card,
      companyLabel: card.companyLabel && validLabelIds.has(String(card.companyLabel)) ? card.companyLabel : '',
      labelIds: Array.isArray(card.labelIds)
        ? card.labelIds.map((labelId) => String(labelId)).filter((labelId) => validLabelIds.has(labelId))
        : [],
    }));
    await writeSiteData(siteData);
    res.json({ labels: siteData.labels });
  } catch {
    res.status(500).json({ error: 'Unable to save labels' });
  }
});

app.put('/api/cards-order', requireAdmin, async (req, res) => {
  try {
    const orderedIds: string[] = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((value: unknown) => String(value))
      : [];
    const siteData = await readSiteData();
    const cardsById = new Map(siteData.cards.map((card) => [card.id, card]));
    const uniqueIds: string[] = [...new Set<string>(orderedIds)].filter((id) => cardsById.has(id));

    if (uniqueIds.length !== siteData.cards.length) {
      res.status(400).json({ error: 'Card order must include every card exactly once' });
      return;
    }

    siteData.cards = uniqueIds.map((id) => cardsById.get(id) as CardRecord);
    await writeSiteData(siteData);
    res.json({ cards: siteData.cards });
  } catch {
    res.status(500).json({ error: 'Unable to save card order' });
  }
});

app.put('/api/cards/:slug', requireAdmin, async (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    const siteData = await readSiteData();
    const cardIndex = siteData.cards.findIndex((card) => card.slug === slug);

    if (cardIndex === -1) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const existing = siteData.cards[cardIndex];
    const nextSlug = uniqueSlug(siteData.cards, req.body?.slug || slug, existing.id);
    siteData.cards[cardIndex] = {
      ...siteData.cards[cardIndex],
      ...req.body,
      slug: nextSlug,
      id: existing.id,
      liveUrl: req.body?.liveUrl || publicDocumentPath(req.body?.documentType || existing.documentType, nextSlug),
    };

    await writeSiteData(siteData);
    res.json(siteData.cards[cardIndex]);
  } catch {
    res.status(500).json({ error: 'Unable to save card content' });
  }
});

app.post('/api/cards', requireAdmin, async (req, res) => {
  try {
    const siteData = await readSiteData();
    const slug = uniqueSlug(siteData.cards, req.body?.slug || req.body?.title || 'new-card');
    const card = {
      ...createDefaultCard(slug),
      ...req.body,
      id: createCardId(),
      slug,
      liveUrl: req.body?.liveUrl || publicDocumentPath(req.body?.documentType, slug),
      canvas: req.body?.canvas || createDefaultCanvas(),
    };

    siteData.cards.push(card);
    await writeSiteData(siteData);
    res.status(201).json(card);
  } catch {
    res.status(500).json({ error: 'Unable to create card' });
  }
});

app.post('/api/cards/:slug/clone', requireAdmin, async (req, res) => {
  try {
    const sourceSlug = sanitizeSlug(req.params.slug);
    const siteData = await readSiteData();
    const source = siteData.cards.find((card) => card.slug === sourceSlug);

    if (!source) {
      res.status(404).json({ error: 'Source card not found' });
      return;
    }

    const slug = uniqueSlug(siteData.cards, req.body?.slug || `${source.slug}-copy`);
    const clone = {
      ...source,
      id: createCardId(),
      slug,
      slotName: `${source.slotName || source.title || source.slug} Copy`,
      domainLabel: `${source.domainLabel || source.slug} COPY`,
      liveUrl: `/cards/${slug}/`,
      isVisible: true,
      isAvailable: false,
      title: `${source.title || source.slug} Copy`,
    };

    siteData.cards.push(clone);
    await writeSiteData(siteData);
    res.status(201).json(clone);
  } catch {
    res.status(500).json({ error: 'Unable to clone card' });
  }
});

app.delete('/api/cards/:slug', requireAdmin, async (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    const siteData = await readSiteData();
    const nextCards = siteData.cards.filter((card) => card.slug !== slug);

    if (nextCards.length === siteData.cards.length) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    siteData.cards = nextCards;
    await writeSiteData(siteData);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to delete card' });
  }
});

app.post('/api/cards/:slug/duplicate', requireAdmin, async (req, res) => {
  try {
    const targetSlug = sanitizeSlug(req.params.slug);
    const sourceSlug = sanitizeSlug(req.body?.sourceSlug);
    const siteData = await readSiteData();
    const source = siteData.cards.find((card) => card.slug === sourceSlug);
    const targetIndex = siteData.cards.findIndex((card) => card.slug === targetSlug);

    if (!source || targetIndex === -1) {
      res.status(404).json({ error: 'Source or target card not found' });
      return;
    }

    const target = siteData.cards[targetIndex];
    siteData.cards[targetIndex] = {
      ...source,
      id: String(target.id),
      slug: String(target.slug),
      slotName: target.slotName,
      domainLabel: target.domainLabel,
      liveUrl: target.liveUrl,
      isVisible: true,
      isAvailable: false,
      title: source.title,
      personName: source.personName,
      role: source.role,
      description: source.description,
    };

    await writeSiteData(siteData);
    res.json(siteData.cards[targetIndex]);
  } catch {
    res.status(500).json({ error: 'Unable to duplicate card' });
  }
});

app.get(['/cards/:slug', '/tickets/:slug'], async (req, res) => {
  try {
    const siteData = await readSiteData();
    const slug = sanitizeSlug(req.params.slug);
    const cardExists = siteData.cards.some((card) => card.slug === slug);

    if (!cardExists) {
      res.status(404).send('Business Card Not Found');
      return;
    }

    res.sendFile(path.join(ROOT_DIR, 'card-shell.html'));
  } catch {
    res.status(500).send('Unable to load business card');
  }
});

app.get(['/privacy-policy', '/privacy-policy/'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'privacy-policy.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Digital business card system running on http://${HOST}:${PORT}`);
  });
}

export default app;
