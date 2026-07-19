import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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
const activeSessions = new Map<string, { createdAt: number }>();

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
        liveUrl: card.liveUrl || `/cards/${slug}/`,
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
  if (!token || !activeSessions.has(token)) {
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

  const token = crypto.randomBytes(24).toString('hex');
  activeSessions.set(token, { createdAt: Date.now() });
  res.json({ token });
});

app.post('/api/logout', requireAdmin, (req, res) => {
  const token = getSessionToken(req);
  activeSessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/public-site', async (req, res) => {
  try {
    const siteData = await readSiteData();
    res.json(createPublicSitePayload(siteData, String(req.query.slug || '')));
  } catch {
    res.status(500).json({ error: 'Unable to load site data' });
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
    await writeSiteData(siteData);
    res.json({ labels: siteData.labels });
  } catch {
    res.status(500).json({ error: 'Unable to save labels' });
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
      liveUrl: req.body?.liveUrl || `/cards/${nextSlug}/`,
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
      liveUrl: req.body?.liveUrl || `/cards/${slug}/`,
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

app.get('/cards/:slug', async (req, res) => {
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

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Digital business card system running on http://${HOST}:${PORT}`);
  });
}

export default app;
