import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';

const embeddedSessionToken = new URLSearchParams(window.location.hash.slice(1)).get('session') || '';
if (embeddedSessionToken) {
  window.localStorage.setItem('businessCardAdminToken', embeddedSessionToken);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

const state = {
  siteData: null,
  authToken: window.localStorage.getItem('businessCardAdminToken') || '',
  authError: '',
  selectedSlug: '',
  selectedId: '',
  selectedOriginalSlug: '',
  selectedLayerId: '',
  selectedLabelId: '',
  activeView: 'builder',
  openMenuSlug: '',
  searchQuery: '',
  companyFilter: 'all',
  status: '',
  qrModal: null,
  keyboardBound: false,
  imageUploadMode: 'image',
};

const DOCUMENT_PRESETS = {
  'card-portrait': { label: 'Card · Portrait', width: 1080, height: 1920, documentType: 'card' },
  'card-landscape': { label: 'Card · Landscape', width: 1920, height: 1080, documentType: 'card' },
  'ticket-portrait': { label: 'Ticket · Portrait', width: 1080, height: 1920, documentType: 'ticket' },
  'ticket-landscape': { label: 'Ticket · Landscape', width: 1920, height: 1080, documentType: 'ticket' },
  square: { label: 'Square · 1080', width: 1080, height: 1080 },
  story: { label: 'Story · 1080 × 1920', width: 1080, height: 1920 },
  'print-a6': { label: 'Print · A6', width: 1240, height: 1748 },
};

const LAYER_BINDINGS = [
  ['', 'No data binding'],
  ['title', 'Document title'],
  ['personName', 'Person name'],
  ['role', 'Role'],
  ['ticket.eventName', 'Event name'],
  ['ticket.dateLabel', 'Event date'],
  ['ticket.venue', 'Venue'],
  ['ticket.address', 'Address'],
  ['ticket.ticketType', 'Ticket type'],
  ['ticket.attendeeName', 'Attendee'],
  ['ticket.seat', 'Seat'],
  ['ticket.gate', 'Gate'],
  ['ticket.orderNumber', 'Ticket number'],
  ['ticket.instructions', 'Instructions'],
  ['ticket.qrValue', 'QR destination'],
  ['publicUrl', 'Public document URL'],
];

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 80);
}

function aiReadyDesignPrompt(card) {
  const documentType = card?.documentType === 'ticket' ? 'ticket' : 'card';
  const designLabel = documentType === 'ticket' ? 'EVENT TICKET' : 'BUSINESS CARD';
  const details = {
    schemaVersion: 1,
    documentType,
    title: card?.title || '',
    slug: card?.slug || '',
    personName: card?.personName || '',
    role: card?.role || '',
    description: card?.description || '',
    qrColor: card?.qrColor || '#14e0e2',
    contacts: Array.isArray(card?.contacts) ? card.contacts : [],
    actions: [
      ...(card?.primaryActionUrl ? [{
        label: card.primaryActionLabel || 'Open link',
        url: card.primaryActionUrl,
        kind: 'primary',
      }] : []),
      ...(card?.secondaryActionUrl ? [{
        label: card.secondaryActionLabel || 'Open link',
        url: card.secondaryActionUrl,
        kind: 'secondary',
      }] : []),
    ],
    ...(documentType === 'ticket' ? { ticket: card?.ticket || createDefaultTicketData(card?.title) } : {}),
  };

  return `Create a production-ready, interactive ${designLabel} for me.

DELIVERY FORMAT
- Return one complete, self-contained HTML document in a single code block. I will save it as a .html file and upload it to Tanuki Card Creator.
- Use only HTML and CSS. Do not use JavaScript, iframes, forms, external scripts, tracking, or analytics.
- Put all CSS inside one <style> tag. Use HTTPS image URLs or embedded data URLs only.
- Make the document responsive, mobile-first, and visually complete at 1080 × 1920 portrait. It must also fit smaller phone screens without horizontal scrolling.
- Keep important content inside a safe area of at least 72px on every side.
- Use semantic, accessible HTML, strong contrast, legible text, visible focus states, and descriptive alt text.

INTERACTIVE REQUIREMENTS
- Every phone number must be a real link such as <a href="tel:+390000000000">Call</a>.
- Every email must use mailto:, every website or booking link must use a full https:// URL, and every physical address may use a Google Maps https:// link.
- Important buttons must be real <a> elements, not painted text. Add data-card-action="primary" or data-card-action="secondary" to the main buttons.
- Add data-card-contact="Phone", "Email", "Website", or another useful label to contact links.
- External web links should use target="_blank" and rel="noopener noreferrer".

REQUIRED MACHINE-READABLE MANIFEST
Place this exact script structure inside <head>, updating its JSON values to match the final design. Keep it valid JSON. Do not add comments or trailing commas:

<script type="application/json" id="card-studio-manifest">
${JSON.stringify(details, null, 2)}
</script>

The contacts array uses this shape:
{"label":"Phone","value":"+39 000 000 0000","url":"tel:+390000000000"}
The actions array uses this shape:
{"label":"Visit website","url":"https://example.com","kind":"primary"}

MY CREATIVE DIRECTION
- Colors: [INSERT COLORS]
- Style / mood: [INSERT STYLE]
- Logo or image URLs: [INSERT URLS OR SAY NONE]
- Border / texture / special features: [INSERT DETAILS]
- Typography preference: [INSERT DETAILS]
- Information or links to add/change: [INSERT DETAILS]

Design the full aesthetic, verify that the manifest matches every visible phone/email/link/button, then return only the final complete HTML code block.`;
}

function createLayerId() {
  return `layer-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function createDefaultTicketData(title = 'New Event') {
  return {
    eventName: title,
    dateLabel: 'Saturday · 19:30',
    venue: 'Event venue',
    address: 'City, Country',
    ticketType: 'General Admission',
    attendeeName: 'Guest name',
    seat: 'Free seating',
    gate: 'Main entrance',
    orderNumber: `TKT-${Date.now().toString(36).toUpperCase()}`,
    instructions: 'Present this ticket at the entrance.',
    qrValue: '',
  };
}

function createTicketCanvas() {
  return {
    width: 1080,
    height: 1920,
    backgroundColor: '#07090f',
    borderColor: '#8b5cf6',
    borderWidth: 4,
    borderRadius: 46,
    layers: [
      { id: createLayerId(), type: 'text', name: 'Event name', binding: 'ticket.eventName', x: 88, y: 150, w: 904, h: 250, color: '#ffffff', fontSize: 92, fontWeight: 800, align: 'left', lineHeight: 0.98, z: 1 },
      { id: createLayerId(), type: 'text', name: 'Date', binding: 'ticket.dateLabel', x: 92, y: 440, w: 896, h: 86, color: '#c4b5fd', fontSize: 42, fontWeight: 700, align: 'left', z: 2 },
      { id: createLayerId(), type: 'text', name: 'Venue', binding: 'ticket.venue', x: 92, y: 550, w: 896, h: 78, color: '#ffffff', fontSize: 40, fontWeight: 650, align: 'left', z: 3 },
      { id: createLayerId(), type: 'text', name: 'Address', binding: 'ticket.address', x: 92, y: 630, w: 896, h: 70, color: '#9ca3af', fontSize: 30, fontWeight: 500, align: 'left', z: 4 },
      { id: createLayerId(), type: 'shape', name: 'Ticket panel', shape: 'rect', x: 76, y: 810, w: 928, h: 520, fill: '#111827', stroke: '#312e81', strokeWidth: 2, radius: 32, z: 5 },
      { id: createLayerId(), type: 'text', name: 'Ticket type', binding: 'ticket.ticketType', x: 118, y: 865, w: 560, h: 78, color: '#a78bfa', fontSize: 29, fontWeight: 800, align: 'left', letterSpacing: 2, z: 6 },
      { id: createLayerId(), type: 'text', name: 'Attendee', binding: 'ticket.attendeeName', x: 118, y: 960, w: 560, h: 104, color: '#ffffff', fontSize: 48, fontWeight: 750, align: 'left', z: 7 },
      { id: createLayerId(), type: 'text', name: 'Seat', binding: 'ticket.seat', x: 118, y: 1090, w: 300, h: 70, color: '#d1d5db', fontSize: 28, fontWeight: 600, align: 'left', z: 8 },
      { id: createLayerId(), type: 'text', name: 'Gate', binding: 'ticket.gate', x: 430, y: 1090, w: 250, h: 70, color: '#d1d5db', fontSize: 28, fontWeight: 600, align: 'left', z: 9 },
      { id: createLayerId(), type: 'qr', name: 'Entry QR', binding: 'ticket.qrValue', x: 720, y: 900, w: 220, h: 220, fill: '#111827', color: '#ffffff', z: 10 },
      { id: createLayerId(), type: 'line', name: 'Perforation', x: 80, y: 1450, w: 920, h: 4, stroke: '#4b5563', strokeWidth: 4, rotation: 0, dashed: true, z: 11 },
      { id: createLayerId(), type: 'text', name: 'Ticket number', binding: 'ticket.orderNumber', x: 92, y: 1510, w: 896, h: 60, color: '#9ca3af', fontSize: 25, fontWeight: 600, align: 'center', letterSpacing: 2, z: 12 },
      { id: createLayerId(), type: 'text', name: 'Instructions', binding: 'ticket.instructions', x: 110, y: 1620, w: 860, h: 130, color: '#d1d5db', fontSize: 28, fontWeight: 500, align: 'center', lineHeight: 1.3, z: 13 },
    ],
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function showActionError(error) {
  state.status = `Action failed: ${error?.message || 'Please try again.'}`;
  renderApp();
}

function runAction(action) {
  return Promise.resolve().then(action).catch(showActionError);
}

function confirmAction({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'backend-confirm-overlay';
    overlay.innerHTML = `
      <section class="backend-confirm-card" role="dialog" aria-modal="true" aria-labelledby="backend-confirm-title">
        <span class="backend-kicker">Confirmation</span>
        <h2 id="backend-confirm-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="backend-confirm-actions">
          <button type="button" data-confirm-cancel>Cancel</button>
          <button type="button" data-confirm-accept class="${danger ? 'backend-danger' : 'backend-primary'}">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    `;

    const finish = (accepted) => {
      overlay.remove();
      resolve(accepted);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    overlay.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    overlay.querySelector('[data-confirm-accept]').addEventListener('click', () => finish(true));
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm-cancel]').focus();
  });
}

async function loadAdminData() {
  state.siteData = await api('/api/admin-site');
  state.siteData.labels = Array.isArray(state.siteData.labels) ? state.siteData.labels : [];
  if (!state.selectedSlug && state.siteData.cards.length) {
    const firstCard = state.siteData.cards[0];
    state.selectedSlug = firstCard.slug;
    state.selectedId = firstCard.id;
    state.selectedOriginalSlug = firstCard.slug;
  }
  if (!state.selectedLabelId && state.siteData.labels.length) {
    state.selectedLabelId = state.siteData.labels[0].id;
  }
}

async function login(accessCode) {
  const result = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ accessCode }),
  });
  state.authToken = result.token || '';
  window.localStorage.setItem('businessCardAdminToken', state.authToken);
  state.authError = '';
  await loadAdminData();
  renderApp();
}

function logout() {
  state.authToken = '';
  state.siteData = null;
  window.localStorage.removeItem('businessCardAdminToken');
  renderLogin();
}

function renderLogin() {
  const root = document.getElementById('backend-root');
  if (!root) return;
  root.innerHTML = `
    <section class="backend-login">
      <div class="backend-login-card">
        <span class="backend-kicker">Protected Access</span>
        <h2>Enter Access Code</h2>
        <form data-login-form>
          <label class="backend-field">
            <span>Access Code</span>
            <input type="password" inputmode="numeric" autocomplete="off" data-login-code placeholder="8-12 digit code" required autofocus>
          </label>
          <button type="submit" class="backend-primary"><i data-lucide="lock-keyhole"></i>Unlock</button>
          <p class="backend-login-error">${escapeHtml(state.authError || '')}</p>
        </form>
      </div>
    </section>
  `;
  document.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('[data-login-code]');
    try {
      await login(input?.value || '');
    } catch (error) {
      state.authError = error.message || 'Invalid access code';
      renderLogin();
    }
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectedCard() {
  return state.siteData?.cards.find((card) => card.id === state.selectedId)
    || state.siteData?.cards.find((card) => card.slug === state.selectedSlug)
    || null;
}

function selectCardBySlug(slug, activeView = state.activeView) {
  const card = state.siteData?.cards.find((item) => item.slug === slug);
  state.selectedSlug = card?.slug || slug;
  state.selectedId = card?.id || '';
  state.selectedOriginalSlug = card?.slug || slug;
  state.selectedLayerId = '';
  state.openMenuSlug = '';
  state.activeView = activeView;
  return card || null;
}

function selectedLayer(card = selectedCard()) {
  const canvas = card?.canvas;
  return canvas?.layers?.find((layer) => layer.id === state.selectedLayerId) || null;
}

function selectedLabel() {
  return state.siteData?.labels.find((label) => label.id === state.selectedLabelId) || null;
}

function getLabels() {
  return state.siteData?.labels || [];
}

function labelName(labelId) {
  return getLabels().find((label) => label.id === labelId)?.name || '';
}

function createLabel() {
  return {
    id: `label-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    name: 'New Company',
    slug: 'new-company',
    color: '#14e0e2',
    website: '',
    email: '',
    phone: '',
    notes: '',
  };
}

function cardSearchText(card) {
  const contacts = (card.contacts || [])
    .map((contact) => `${contact.label || ''} ${contact.value || ''} ${contact.url || ''}`)
    .join(' ');
  return [
    card.title,
    card.personName,
    card.role,
    card.description,
    card.domainLabel,
    card.slug,
    card.liveUrl,
    card.logoPath,
    card.companyLabel,
    labelName(card.companyLabel),
    contacts,
  ].join(' ').toLowerCase();
}

function filteredCards() {
  const query = state.searchQuery.trim().toLowerCase();
  return (state.siteData?.cards || []).filter((card) => {
    const matchesCompany = state.companyFilter === 'all' || (card.companyLabel || '') === state.companyFilter;
    const matchesQuery = !query || cardSearchText(card).includes(query);
    return matchesCompany && matchesQuery;
  });
}

function defaultCanvasFromCard(card) {
  const title = card.personName || card.title || 'New Business Card';
  const role = card.role || card.tagline || 'Role / Company';
  const contacts = Array.isArray(card.contacts) ? card.contacts.filter((contact) => contact.value).slice(0, 4) : [];
  return {
    width: 1080,
    height: 1920,
    backgroundColor: '#080b10',
    borderColor: card.qrColor || '#14e0e2',
    borderWidth: 4,
    borderRadius: 44,
    layers: [
      ...(card.logoPath ? [{
        id: createLayerId(),
        type: 'image',
        src: card.logoPath,
        x: 390,
        y: 170,
        w: 300,
        h: 300,
        objectFit: 'contain',
      }] : []),
      {
        id: createLayerId(),
        type: 'text',
        text: title,
        x: 110,
        y: 560,
        w: 860,
        h: 130,
        color: '#ffffff',
        fontSize: 72,
        fontWeight: 800,
        align: 'center',
      },
      {
        id: createLayerId(),
        type: 'text',
        text: role,
        x: 140,
        y: 710,
        w: 800,
        h: 88,
        color: '#9aa7b7',
        fontSize: 38,
        fontWeight: 500,
        align: 'center',
      },
      {
        id: createLayerId(),
        type: 'shape',
        shape: 'rect',
        x: 180,
        y: 870,
        w: 720,
        h: 4,
        fill: card.qrColor || '#14e0e2',
        stroke: card.qrColor || '#14e0e2',
        strokeWidth: 0,
        radius: 999,
      },
      ...contacts.map((contact, index) => ({
        id: createLayerId(),
        type: 'text',
        text: `${contact.label ? `${contact.label}: ` : ''}${contact.value}`,
        x: 130,
        y: 1040 + index * 110,
        w: 820,
        h: 74,
        color: '#ffffff',
        fontSize: 34,
        fontWeight: 600,
        align: 'center',
      })),
    ],
  };
}

function ensureCanvas(card) {
  if (!card.canvas) {
    card.canvas = defaultCanvasFromCard(card);
  }
  card.canvas.width = Number(card.canvas.width) || 1080;
  card.canvas.height = Number(card.canvas.height) || 1920;
  card.canvas.layers = Array.isArray(card.canvas.layers) ? card.canvas.layers : [];
  return card.canvas;
}

function parseContacts(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = '', contactValue = '', url = ''] = line.split('|').map((part) => part.trim());
      return { label, value: contactValue, url };
    });
}

function stringifyContacts(contacts) {
  return (contacts || [])
    .map((contact) => [contact.label, contact.value, contact.url].filter((part, index) => index < 2 || part).join(' | '))
    .join('\n');
}

function isAllowedImportedUrl(value, { allowFragment = false } = {}) {
  const url = String(value || '').trim();
  if (allowFragment && url.startsWith('#')) return true;
  return /^(https?:|mailto:|tel:)/i.test(url);
}

function importedLinkValue(anchor, url) {
  const visibleText = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
  if (url.toLowerCase().startsWith('tel:')) return visibleText || decodeURIComponent(url.slice(4));
  if (url.toLowerCase().startsWith('mailto:')) return visibleText || decodeURIComponent(url.slice(7).split('?')[0]);
  return visibleText && visibleText !== url ? visibleText : url;
}

function importedLinkLabel(anchor, url) {
  const explicit = anchor.getAttribute('data-card-contact');
  if (explicit) return explicit.trim();
  if (/^tel:/i.test(url)) return 'Phone';
  if (/^mailto:/i.test(url)) return 'Email';
  if (/maps\.google\.|google\.[^/]+\/maps|maps\.apple\./i.test(url)) return 'Address';
  return 'Website';
}

function normalizeImportedContact(contact) {
  if (!contact || typeof contact !== 'object') return null;
  const url = String(contact.url || '').trim();
  if (!isAllowedImportedUrl(url)) return null;
  return {
    label: String(contact.label || (/^tel:/i.test(url) ? 'Phone' : /^mailto:/i.test(url) ? 'Email' : 'Website')).trim(),
    value: String(contact.value || url.replace(/^(tel:|mailto:)/i, '')).trim(),
    url,
  };
}

function normalizeImportedAction(action) {
  if (!action || typeof action !== 'object') return null;
  const url = String(action.url || '').trim();
  if (!isAllowedImportedUrl(url)) return null;
  return {
    label: String(action.label || 'Open link').trim(),
    url,
    kind: action.kind === 'secondary' ? 'secondary' : 'primary',
  };
}

function readReadyDesignDocument(source) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(String(source || ''), 'text/html');
  if (!documentNode.body || !documentNode.documentElement) throw new Error('The HTML design is not a complete document');

  let manifest = {};
  const manifestNode = documentNode.querySelector('#card-studio-manifest');
  if (manifestNode) {
    try {
      manifest = JSON.parse(manifestNode.textContent || '{}');
    } catch {
      throw new Error('The card-studio manifest contains invalid JSON');
    }
  }

  const detectedContacts = [];
  const detectedActions = [];
  const seenContacts = new Set();
  const seenActions = new Set();
  documentNode.querySelectorAll('a[href]').forEach((anchor) => {
    const url = String(anchor.getAttribute('href') || '').trim();
    if (!isAllowedImportedUrl(url, { allowFragment: true })) return;
    if (/^(tel:|mailto:|https?:)/i.test(url) && !seenContacts.has(url.toLowerCase())) {
      seenContacts.add(url.toLowerCase());
      detectedContacts.push({
        label: importedLinkLabel(anchor, url),
        value: importedLinkValue(anchor, url),
        url,
      });
    }
    const actionKind = anchor.getAttribute('data-card-action');
    if (actionKind && /^https?:/i.test(url) && !seenActions.has(url.toLowerCase())) {
      seenActions.add(url.toLowerCase());
      detectedActions.push({
        label: String(anchor.textContent || 'Open link').replace(/\s+/g, ' ').trim(),
        url,
        kind: actionKind === 'secondary' ? 'secondary' : 'primary',
      });
    }
  });

  documentNode.querySelectorAll('script, iframe, object, embed, base, form, meta[http-equiv="refresh" i]').forEach((element) => element.remove());
  documentNode.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')
        || ((name === 'href' || name === 'src' || name === 'action') && /^javascript:/i.test(value))
        || (name === 'style' && /(javascript:|expression\s*\()/i.test(value))) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  documentNode.querySelectorAll('a[href]').forEach((anchor) => {
    const url = String(anchor.getAttribute('href') || '').trim();
    if (!isAllowedImportedUrl(url, { allowFragment: true })) {
      anchor.removeAttribute('href');
      anchor.removeAttribute('target');
      return;
    }
    if (/^https?:/i.test(url)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else if (/^(tel:|mailto:)/i.test(url)) {
      anchor.setAttribute('target', '_top');
    }
  });

  const html = `<!doctype html>\n${documentNode.documentElement.outerHTML}`;
  return { html, manifest, detectedContacts, detectedActions };
}

async function importReadyDesignFile(file) {
  if (file.size > 3 * 1024 * 1024) throw new Error('Ready designs must be 3 MB or smaller');
  const card = selectedCard();
  if (!card) throw new Error('Select a card or ticket first');
  const source = await file.text();
  let htmlSource = source;
  let packageManifest = {};

  if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
    let packageData;
    try {
      packageData = JSON.parse(source);
    } catch {
      throw new Error('The ready-design JSON file is invalid');
    }
    htmlSource = packageData.html || packageData.htmlTemplate || '';
    packageManifest = packageData.manifest || packageData.card || {};
    if (!htmlSource) throw new Error('The JSON package must contain an html or htmlTemplate field');
  }

  const imported = readReadyDesignDocument(htmlSource);
  const manifest = {
    ...imported.manifest,
    ...packageManifest,
  };
  const manifestContacts = Array.isArray(manifest.contacts)
    ? manifest.contacts.map(normalizeImportedContact).filter(Boolean)
    : [];
  const manifestActions = Array.isArray(manifest.actions)
    ? manifest.actions.map(normalizeImportedAction).filter(Boolean)
    : [];
  const contacts = manifestContacts.length ? manifestContacts : imported.detectedContacts;
  const actions = manifestActions.length ? manifestActions : imported.detectedActions;
  const primaryAction = actions.find((action) => action.kind !== 'secondary') || actions[0];
  const secondaryAction = actions.find((action) => action.kind === 'secondary') || actions[1];
  const documentType = manifest.documentType === 'ticket' ? 'ticket' : manifest.documentType === 'card' ? 'card' : card.documentType;

  card.theme = 'html';
  card.htmlTemplate = imported.html;
  card.htmlUrl = '';
  card.documentType = documentType || 'card';
  if (manifest.title) card.title = String(manifest.title);
  if (manifest.slug) card.slug = slugify(manifest.slug) || card.slug;
  if (manifest.personName !== undefined) card.personName = String(manifest.personName || '');
  if (manifest.role !== undefined) card.role = String(manifest.role || '');
  if (manifest.description !== undefined) card.description = String(manifest.description || '');
  if (/^#[0-9a-f]{6}$/i.test(String(manifest.qrColor || ''))) card.qrColor = manifest.qrColor;
  if (card.documentType === 'ticket' && manifest.ticket && typeof manifest.ticket === 'object') {
    card.ticket = { ...createDefaultTicketData(card.title), ...manifest.ticket };
  }
  if (contacts.length) card.contacts = contacts;
  if (primaryAction) {
    card.primaryActionLabel = primaryAction.label;
    card.primaryActionUrl = primaryAction.url;
  }
  if (secondaryAction) {
    card.secondaryActionLabel = secondaryAction.label;
    card.secondaryActionUrl = secondaryAction.url;
  }
  card.liveUrl = `/${card.documentType === 'ticket' ? 'tickets' : 'cards'}/${card.slug}/`;
  state.selectedSlug = card.slug;
  state.selectedLayerId = '';
  state.status = `Ready design imported. Recognized ${contacts.length} contact link${contacts.length === 1 ? '' : 's'} and ${actions.length} action${actions.length === 1 ? '' : 's'}. Save to publish.`;
  renderApp();
}

function pct(value, total) {
  return `${((Number(value) || 0) / total) * 100}%`;
}

function getPathValue(source, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], source);
}

function resolvedLayerValue(layer, card) {
  if (!layer.binding) return layer.type === 'qr' ? (layer.value || '') : (layer.text || '');
  if (layer.binding === 'publicUrl') return publicUrl(card);
  return getPathValue(card, layer.binding) ?? '';
}

function qrImageUrl(value, foreground = '#111827', background = '#ffffff') {
  const color = String(foreground || '#111827').replace('#', '');
  const bgcolor = String(background || '#ffffff').replace('#', '');
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(value || ' ')}&color=${encodeURIComponent(color)}&bgcolor=${encodeURIComponent(bgcolor)}&qzone=1&margin=0`;
}

function layerStyle(layer, canvas) {
  return [
    `left:${pct(layer.x, canvas.width)}`,
    `top:${pct(layer.y, canvas.height)}`,
    `width:${pct(layer.w || 120, canvas.width)}`,
    `height:${pct(layer.h || 70, canvas.height)}`,
    `z-index:${Number(layer.z) || 1}`,
    `opacity:${Math.max(0, Math.min(1, Number(layer.opacity ?? 1)))}`,
    `transform:rotate(${Number(layer.rotation) || 0}deg)`,
    'transform-origin:center center',
  ].join(';');
}

function renderCanvasLayer(layer, canvas, card, selectable = true) {
  if (layer.hidden) return '';
  const selected = layer.id === state.selectedLayerId ? ' is-selected' : '';
  const attrs = [
    selectable ? `data-layer-id="${escapeHtml(layer.id)}"` : '',
    layer.binding ? `data-layer-binding="${escapeHtml(layer.binding)}"` : '',
  ].filter(Boolean).join(' ');
  const baseClass = `builder-layer${selected}${layer.locked ? ' is-locked' : ''}`;
  const baseStyle = layerStyle(layer, canvas);

  if (layer.type === 'image') {
    return `<img class="${baseClass} builder-layer-image" ${attrs} src="${escapeHtml(layer.src || '')}" alt="" style="${baseStyle};object-fit:${escapeHtml(layer.objectFit || 'cover')};object-position:${escapeHtml(layer.objectPosition || 'center')};border-radius:${Number(layer.radius) || 0}px;border:${Number(layer.strokeWidth) || 0}px solid ${escapeHtml(layer.stroke || 'transparent')};filter:${layer.shadow ? 'drop-shadow(0 18px 24px rgba(0,0,0,.35))' : 'none'}">`;
  }

  if (layer.type === 'qr') {
    const value = resolvedLayerValue(layer, card);
    return `<img class="${baseClass} builder-layer-image builder-layer-qr" ${attrs} src="${escapeHtml(qrImageUrl(value, layer.color, layer.fill))}" alt="Ticket QR code" style="${baseStyle};object-fit:contain;border-radius:${Number(layer.radius) || 18}px">`;
  }

  if (layer.type === 'shape') {
    const radius = layer.shape === 'ellipse' ? '999px' : `${Number(layer.radius) || 0}px`;
    return `<div class="${baseClass} builder-layer-shape" ${attrs} style="${baseStyle};background:${escapeHtml(layer.fill || 'transparent')};border:${Number(layer.strokeWidth) || 0}px solid ${escapeHtml(layer.stroke || 'transparent')};border-radius:${radius};box-shadow:${layer.shadow ? '0 24px 45px rgba(0,0,0,.3)' : 'none'}"></div>`;
  }

  if (layer.type === 'line') {
    const lineBackground = layer.dashed
      ? `repeating-linear-gradient(90deg,${escapeHtml(layer.stroke || '#ffffff')} 0 18px,transparent 18px 34px)`
      : escapeHtml(layer.stroke || layer.fill || '#ffffff');
    return `<div class="${baseClass} builder-layer-line" ${attrs} style="${baseStyle};height:${Number(layer.strokeWidth) || 3}px;background:${lineBackground}"></div>`;
  }

  return `<div class="${baseClass} builder-layer-text" ${attrs} style="${baseStyle};color:${escapeHtml(layer.color || '#ffffff')};font-size:calc(${Number(layer.fontSize) || 42} / ${canvas.height} * min(70vh, 680px));font-family:${escapeHtml(layer.fontFamily || 'Inter, sans-serif')};font-weight:${Number(layer.fontWeight) || 600};text-align:${escapeHtml(layer.align || 'left')};line-height:${Number(layer.lineHeight) || 1.12};letter-spacing:${Number(layer.letterSpacing) || 0}px;text-transform:${escapeHtml(layer.textTransform || 'none')}">${escapeHtml(resolvedLayerValue(layer, card))}</div>`;
}

function renderCanvasPreview(card, selectable = true) {
  if (card.theme === 'html' && card.htmlTemplate) {
    return `
      <div class="builder-ready-design-frame">
        <iframe
          class="builder-html-frame"
          title="${escapeHtml(card.title || 'Imported ready design')}"
          srcdoc="${escapeHtml(card.htmlTemplate)}"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        ></iframe>
      </div>
    `;
  }
  const canvas = ensureCanvas(card);
  const bgImage = canvas.backgroundImage || card.backgroundImage || '';
  const background = bgImage
    ? `background:${escapeHtml(canvas.backgroundColor || '#050505')} url('${escapeHtml(bgImage)}') center/cover no-repeat`
    : `background:${escapeHtml(canvas.backgroundColor || '#050505')}`;
  const selectedLayer = selectable ? canvas.layers.find((layer) => layer.id === state.selectedLayerId) : null;
  const selectionMarkup = selectedLayer ? `
    <div class="builder-selection-box" data-selection-box style="${layerStyle(selectedLayer, canvas)}">
      ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => `
        <button type="button" class="builder-layer-handle builder-layer-handle-${handle}" data-resize-handle="${handle}" data-layer-id="${escapeHtml(selectedLayer.id)}" aria-label="Resize layer ${handle}"></button>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="builder-canvas-frame ${canvas.width > canvas.height ? 'is-landscape' : 'is-portrait'}" data-canvas-frame style="aspect-ratio:${canvas.width}/${canvas.height};${background};border:${Number(canvas.borderWidth) || 0}px solid ${escapeHtml(canvas.borderColor || 'transparent')};border-radius:${Number(canvas.borderRadius) || 0}px">
      ${canvas.layers.map((layer) => renderCanvasLayer(layer, canvas, card, selectable)).join('')}
      ${selectionMarkup}
    </div>
  `;
}

function renderCardList() {
  const cards = filteredCards();
  return cards.map((card) => `
    <button type="button" class="backend-card-row ${card.id === state.selectedId ? 'is-active' : ''}" data-select-card="${escapeHtml(card.slug)}">
      <span>
        <strong>${escapeHtml(card.title || card.slug)}</strong>
        <small><span class="backend-kind-badge">${card.documentType === 'ticket' ? 'Ticket' : 'Card'}</span> ${escapeHtml(card.personName || card.ticket?.eventName || card.slug)}${labelName(card.companyLabel) ? ` / ${escapeHtml(labelName(card.companyLabel))}` : ''}</small>
      </span>
      <i data-lucide="${card.isVisible ? 'eye' : 'eye-off'}"></i>
    </button>
  `).join('') || '<p class="backend-muted">No cards match the current filters.</p>';
}

function field(label, name, value, type = 'text', extra = '') {
  return `
    <label class="backend-field">
      <span>${label}</span>
      <input type="${type}" data-card-field="${name}" value="${escapeHtml(value ?? '')}" ${extra}>
    </label>
  `;
}

function layerField(label, name, value, type = 'text', extra = '') {
  return `
    <label class="backend-field">
      <span>${label}</span>
      <input type="${type}" data-layer-field="${name}" value="${escapeHtml(value ?? '')}" ${extra}>
    </label>
  `;
}

function companyOptions(selectedValue = '') {
  return `
    <option value="">No company</option>
    ${getLabels().map((label) => `<option value="${escapeHtml(label.id)}" ${selectedValue === label.id ? 'selected' : ''}>${escapeHtml(label.name)}</option>`).join('')}
  `;
}

function renderFilterBar() {
  return `
    <section class="backend-filterbar">
      <label class="backend-search">
        <i data-lucide="search"></i>
        <input type="search" data-filter-search value="${escapeHtml(state.searchQuery)}" placeholder="Search name, company, phone, email, link">
      </label>
      <label class="backend-select-filter">
        <span>Company</span>
        <select data-filter-company>
          <option value="all" ${state.companyFilter === 'all' ? 'selected' : ''}>All companies</option>
          ${getLabels().map((label) => `<option value="${escapeHtml(label.id)}" ${state.companyFilter === label.id ? 'selected' : ''}>${escapeHtml(label.name)}</option>`).join('')}
        </select>
      </label>
    </section>
  `;
}

function renderNav() {
  const tabs = [
    ['builder', 'pen-tool', 'Builder'],
    ['cards', 'layout-grid', 'Cards'],
    ['companies', 'building-2', 'Companies'],
  ];

  return `
    <nav class="backend-nav" aria-label="Backend sections">
      ${tabs.map(([view, icon, label]) => `
        <button type="button" class="${state.activeView === view ? 'is-active' : ''}" data-view="${view}">
          <i data-lucide="${icon}"></i>${label}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderCardInspector(card) {
  const canvas = ensureCanvas(card);
  card.documentType = card.documentType || 'card';
  card.ticket = card.ticket || createDefaultTicketData(card.title);
  return `
    <div class="backend-panel">
      <div class="backend-panel-head">
        <span class="backend-kicker">Card Record</span>
        <h2>${escapeHtml(card.title || card.slug)}</h2>
      </div>
      <div class="backend-form-grid">
        <label class="backend-field">
          <span>Document Type</span>
          <select data-card-field="documentType">
            <option value="card" ${card.documentType === 'card' ? 'selected' : ''}>Business card</option>
            <option value="ticket" ${card.documentType === 'ticket' ? 'selected' : ''}>Event ticket</option>
          </select>
        </label>
        ${field('Slug', 'slug', card.slug)}
        ${field('Title', 'title', card.title)}
        ${field('Person', 'personName', card.personName)}
        ${field('Role', 'role', card.role)}
        ${field('Domain Label', 'domainLabel', card.domainLabel)}
        ${field('Live URL', 'liveUrl', card.liveUrl || `/cards/${card.slug}/`)}
        <label class="backend-field">
          <span>Company</span>
          <select data-card-field="companyLabel">${companyOptions(card.companyLabel || '')}</select>
        </label>
        ${field('QR Color', 'qrColor', card.qrColor || '#14e0e2', 'color')}
        ${field('Logo Path', 'logoPath', card.logoPath)}
        <label class="backend-field backend-field-wide">
          <span>Description</span>
          <textarea data-card-field="description">${escapeHtml(card.description || '')}</textarea>
        </label>
        <label class="backend-field backend-field-wide">
          <span>Contacts: label | value | url</span>
          <textarea data-card-field="contacts">${escapeHtml(stringifyContacts(card.contacts))}</textarea>
        </label>
        <label class="backend-check">
          <input type="checkbox" data-card-field="isVisible" ${card.isVisible ? 'checked' : ''}>
          <span>Publicly visible</span>
        </label>
        <label class="backend-check">
          <input type="checkbox" data-card-field="themeCanvas" ${card.theme === 'canvas' ? 'checked' : ''}>
          <span>Use free canvas on public card</span>
        </label>
      </div>
      ${card.documentType === 'ticket' ? `
        <div class="backend-canvas-settings">
          <span class="backend-kicker">Event & Ticket Data</span>
          <div class="backend-form-grid">
            ${field('Event Name', 'ticket.eventName', card.ticket.eventName)}
            ${field('Date / Time', 'ticket.dateLabel', card.ticket.dateLabel)}
            ${field('Venue', 'ticket.venue', card.ticket.venue)}
            ${field('Address', 'ticket.address', card.ticket.address)}
            ${field('Ticket Type', 'ticket.ticketType', card.ticket.ticketType)}
            ${field('Attendee', 'ticket.attendeeName', card.ticket.attendeeName)}
            ${field('Seat', 'ticket.seat', card.ticket.seat)}
            ${field('Gate', 'ticket.gate', card.ticket.gate)}
            ${field('Ticket Number', 'ticket.orderNumber', card.ticket.orderNumber)}
            ${field('QR Destination', 'ticket.qrValue', card.ticket.qrValue)}
            <label class="backend-field backend-field-wide">
              <span>Entry Instructions</span>
              <textarea data-card-field="ticket.instructions">${escapeHtml(card.ticket.instructions || '')}</textarea>
            </label>
          </div>
        </div>
      ` : ''}
      <div class="backend-canvas-settings">
        <span class="backend-kicker">Canvas & Format</span>
        <div class="backend-form-grid">
          <label class="backend-field backend-field-wide">
            <span>Size Preset</span>
            <select data-document-preset>
              <option value="">Custom · ${canvas.width} × ${canvas.height}</option>
              ${Object.entries(DOCUMENT_PRESETS).map(([key, preset]) => `<option value="${key}">${preset.label} · ${preset.width} × ${preset.height}</option>`).join('')}
            </select>
          </label>
          ${field('Width', 'canvas.width', canvas.width, 'number', 'min="240" max="4096" step="1"')}
          ${field('Height', 'canvas.height', canvas.height, 'number', 'min="240" max="4096" step="1"')}
          ${field('Background', 'canvas.backgroundColor', canvas.backgroundColor || '#080b10', 'color')}
          ${field('Border', 'canvas.borderColor', canvas.borderColor || '#14e0e2', 'color')}
          ${field('Border Width', 'canvas.borderWidth', canvas.borderWidth || 0, 'number', 'min="0" step="1"')}
          ${field('Radius', 'canvas.borderRadius', canvas.borderRadius || 0, 'number', 'min="0" step="1"')}
          ${field('Background Image', 'canvas.backgroundImage', canvas.backgroundImage || '')}
          <button type="button" data-upload-background><i data-lucide="image-up"></i>Upload Background</button>
        </div>
      </div>
    </div>
  `;
}

function renderLayerInspector(card) {
  const layer = selectedLayer(card);
  if (!layer) {
    return `
      <div class="backend-panel">
        <div class="backend-panel-head">
          <span class="backend-kicker">Layer</span>
          <h2>No Layer Selected</h2>
        </div>
        <p class="backend-muted">Select an item on the canvas, or add text, images, transparent overlays, QR codes, shapes, or lines from the toolbar.</p>
      </div>
    `;
  }

  const common = `
    <div class="backend-form-grid">
      ${layerField('Layer Name', 'layer.name', layer.name || layer.type)}
      ${layerField('X', 'layer.x', layer.x, 'number', 'step="1"')}
      ${layerField('Y', 'layer.y', layer.y, 'number', 'step="1"')}
      ${layerField('W', 'layer.w', layer.w, 'number', 'step="1" min="1"')}
      ${layerField('H', 'layer.h', layer.h, 'number', 'step="1" min="1"')}
      ${layerField('Rotation', 'layer.rotation', layer.rotation || 0, 'number', 'min="-360" max="360" step="1"')}
      ${layerField('Opacity', 'layer.opacity', layer.opacity ?? 1, 'number', 'min="0" max="1" step="0.05"')}
    </div>
    <div class="backend-check-row">
      <label class="backend-check"><input type="checkbox" data-layer-check="locked" ${layer.locked ? 'checked' : ''}><span>Lock layer</span></label>
      <label class="backend-check"><input type="checkbox" data-layer-check="hidden" ${layer.hidden ? 'checked' : ''}><span>Hide layer</span></label>
    </div>
  `;
  let specific = '';

  if (layer.type === 'text') {
    specific = `
      <label class="backend-field backend-field-wide">
        <span>Text</span>
        <textarea data-layer-field="text">${escapeHtml(layer.text || '')}</textarea>
      </label>
      <label class="backend-field backend-field-wide">
        <span>Dynamic Data</span>
        <select data-layer-field="binding">
          ${LAYER_BINDINGS.filter(([value]) => value !== 'ticket.qrValue' && value !== 'publicUrl').map(([value, label]) => `<option value="${escapeHtml(value)}" ${layer.binding === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
      <div class="backend-form-grid">
        ${layerField('Color', 'layer.color', layer.color || '#ffffff', 'color')}
        ${layerField('Font Size', 'layer.fontSize', layer.fontSize || 42, 'number', 'min="8" step="1"')}
        ${layerField('Weight', 'layer.fontWeight', layer.fontWeight || 600, 'number', 'min="100" max="900" step="50"')}
        ${layerField('Line Height', 'layer.lineHeight', layer.lineHeight || 1.12, 'number', 'min="0.6" max="3" step="0.05"')}
        ${layerField('Letter Spacing', 'layer.letterSpacing', layer.letterSpacing || 0, 'number', 'min="-10" max="40" step="0.5"')}
        <label class="backend-field">
          <span>Font</span>
          <select data-layer-field="fontFamily">
            ${[
              ['Inter, sans-serif', 'Inter'],
              ['Playfair Display, serif', 'Playfair Display'],
              ['JetBrains Mono, monospace', 'JetBrains Mono'],
              ['Arial, sans-serif', 'Arial'],
              ['Georgia, serif', 'Georgia'],
              ['Impact, sans-serif', 'Impact'],
            ].map(([value, label]) => `<option value="${value}" ${layer.fontFamily === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="backend-field">
          <span>Align</span>
          <select data-layer-field="align">
            ${['left', 'center', 'right'].map((align) => `<option value="${align}" ${layer.align === align ? 'selected' : ''}>${align}</option>`).join('')}
          </select>
        </label>
        <label class="backend-field">
          <span>Case</span>
          <select data-layer-field="textTransform">
            ${[['none', 'Original'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase']].map(([value, label]) => `<option value="${value}" ${layer.textTransform === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
    `;
  } else if (layer.type === 'image') {
    specific = `
      <label class="backend-field backend-field-wide">
        <span>Image Source</span>
        <textarea data-layer-field="src">${escapeHtml(layer.src || '')}</textarea>
      </label>
      <label class="backend-field">
        <span>Fit</span>
        <select data-layer-field="objectFit">
          ${['cover', 'contain', 'fill'].map((fit) => `<option value="${fit}" ${layer.objectFit === fit ? 'selected' : ''}>${fit}</option>`).join('')}
        </select>
      </label>
      <div class="backend-form-grid">
        ${layerField('Corner Radius', 'layer.radius', layer.radius || 0, 'number', 'min="0" step="1"')}
        ${layerField('Border Width', 'layer.strokeWidth', layer.strokeWidth || 0, 'number', 'min="0" step="1"')}
        ${layerField('Border Color', 'layer.stroke', layer.stroke || '#ffffff', 'color')}
        <label class="backend-check"><input type="checkbox" data-layer-check="shadow" ${layer.shadow ? 'checked' : ''}><span>Drop shadow</span></label>
      </div>
      <button type="button" data-replace-image><i data-lucide="replace"></i>Replace Image</button>
    `;
  } else if (layer.type === 'qr') {
    specific = `
      <label class="backend-field backend-field-wide">
        <span>QR Destination</span>
        <textarea data-layer-field="value">${escapeHtml(layer.value || '')}</textarea>
      </label>
      <label class="backend-field backend-field-wide">
        <span>Dynamic Data</span>
        <select data-layer-field="binding">
          ${LAYER_BINDINGS.filter(([value]) => ['', 'ticket.qrValue', 'publicUrl'].includes(value)).map(([value, label]) => `<option value="${escapeHtml(value)}" ${layer.binding === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
      <div class="backend-form-grid">
        ${layerField('QR Color', 'layer.color', layer.color || '#111827', 'color')}
        ${layerField('Background', 'layer.fill', layer.fill || '#ffffff', 'color')}
        ${layerField('Corner Radius', 'layer.radius', layer.radius || 18, 'number', 'min="0" step="1"')}
      </div>
    `;
  } else {
    specific = `
      <div class="backend-form-grid">
        ${layerField('Fill', 'layer.fill', layer.fill || '#14e0e2', 'color')}
        ${layerField('Stroke', 'layer.stroke', layer.stroke || '#14e0e2', 'color')}
        ${layerField('Stroke Width', 'layer.strokeWidth', layer.strokeWidth || 0, 'number', 'min="0" step="1"')}
        ${layer.type === 'shape' ? layerField('Radius', 'layer.radius', layer.radius || 0, 'number', 'min="0" step="1"') : ''}
        ${layer.type === 'line' ? `<label class="backend-check"><input type="checkbox" data-layer-check="dashed" ${layer.dashed ? 'checked' : ''}><span>Dashed line</span></label>` : ''}
        ${layer.type === 'shape' ? `<label class="backend-check"><input type="checkbox" data-layer-check="shadow" ${layer.shadow ? 'checked' : ''}><span>Drop shadow</span></label>` : ''}
      </div>
      ${layer.type === 'shape' ? `
        <label class="backend-field">
          <span>Shape</span>
          <select data-layer-field="shape">
            ${['rect', 'ellipse'].map((shape) => `<option value="${shape}" ${layer.shape === shape ? 'selected' : ''}>${shape}</option>`).join('')}
          </select>
        </label>
      ` : ''}
    `;
  }

  return `
    <div class="backend-panel">
      <div class="backend-panel-head">
        <span class="backend-kicker">Layer</span>
        <h2>${escapeHtml(layer.type)}</h2>
      </div>
      ${common}
      ${specific}
      <div class="backend-inline-actions">
        <button type="button" class="backend-danger" data-delete-layer><i data-lucide="trash-2"></i>Delete Layer</button>
        <button type="button" data-duplicate-layer><i data-lucide="copy-plus"></i>Duplicate</button>
        <button type="button" data-layer-back><i data-lucide="arrow-down"></i>Back</button>
        <button type="button" data-layer-front><i data-lucide="arrow-up"></i>Front</button>
      </div>
    </div>
  `;
}

function themeClass(theme) {
  return `hub-item-${theme === 'excelsior' ? 'excelsior' : theme}`;
}

function overviewCardMarkup(card, index) {
  const href = card.liveUrl || `/cards/${card.slug}/`;
  const company = labelName(card.companyLabel);
  const description = card.documentType === 'ticket'
    ? [card.ticket?.dateLabel, card.ticket?.venue].filter(Boolean).join(' · ')
    : card.personName || card.role || company || card.description || '';
  const logoMarkup = card.logoPath
    ? `<div class="hub-item-visual"><img src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo"></div>`
    : '';
  const menuOpen = state.openMenuSlug === card.slug;

  return `
    <article class="hub-item ${themeClass(card.theme)} backend-overview-card" data-select-card="${escapeHtml(card.slug)}">
      <button type="button" class="backend-card-settings" data-card-settings="${escapeHtml(card.slug)}" aria-label="Card actions" aria-expanded="${menuOpen ? 'true' : 'false'}">
        <i data-lucide="settings"></i>
      </button>
      ${menuOpen ? `
        <div class="backend-card-menu" data-card-menu="${escapeHtml(card.slug)}">
          <button type="button" data-card-action="copy" data-card-slug="${escapeHtml(card.slug)}"><i data-lucide="copy"></i>Copy Link</button>
          <button type="button" data-card-action="qr" data-card-slug="${escapeHtml(card.slug)}"><i data-lucide="qr-code"></i>QR Code</button>
          <button type="button" data-card-action="edit" data-card-slug="${escapeHtml(card.slug)}"><i data-lucide="pen-line"></i>Edit</button>
          <button type="button" data-card-action="clone" data-card-slug="${escapeHtml(card.slug)}"><i data-lucide="copy-plus"></i>Clone</button>
          <button type="button" class="is-danger" data-card-action="delete" data-card-slug="${escapeHtml(card.slug)}"><i data-lucide="trash-2"></i>Delete</button>
        </div>
      ` : ''}
      <button type="button" class="hub-item-logo backend-overview-qr-trigger" data-card-action="qr" data-card-slug="${escapeHtml(card.slug)}" aria-label="Show QR code for ${escapeHtml(card.title || card.slug)}">${escapeHtml(card.domainLabel || `${String(index + 1).padStart(2, '0')} / ${card.slug}`)}</button>
      ${logoMarkup}
      <div class="hub-item-body">
        <h2 class="hub-item-title">${escapeHtml(card.title || card.slug)}</h2>
        <p class="hub-item-desc">${escapeHtml(description)}</p>
        <a class="hub-item-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open ${card.documentType === 'ticket' ? 'Ticket' : 'Card'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        </a>
      </div>
    </article>
  `;
}

function renderCardsView() {
  const cards = filteredCards();
  return `
    ${renderFilterBar()}
    <section class="backend-overview-head">
      <div>
        <span class="backend-kicker">Visual Library</span>
        <h2>${cards.length} matching designs</h2>
        ${state.status ? `<p class="backend-status" role="status">${escapeHtml(state.status)}</p>` : ''}
      </div>
      <div class="backend-inline-actions">
        <button type="button" data-new-card><i data-lucide="contact"></i>New Card</button>
        <button type="button" data-new-ticket><i data-lucide="ticket-plus"></i>New Ticket</button>
      </div>
    </section>
    <section class="hub-grid backend-overview-grid">
      ${cards.map(overviewCardMarkup).join('') || '<p class="backend-muted">No cards match the current filters.</p>'}
    </section>
  `;
}

function renderBuilderView(card) {
  return `
    ${renderFilterBar()}
    <section class="backend-layout">
      <aside class="backend-sidebar">
        <div class="backend-sidebar-head">
          <span class="backend-kicker">Library</span>
          <h2>Cards</h2>
        </div>
        <div class="backend-card-list">${renderCardList()}</div>
      </aside>
      <section class="backend-stage">
        <div class="backend-stage-toolbar">
          <button type="button" data-add-text><i data-lucide="type"></i>Text</button>
          <button type="button" data-add-image><i data-lucide="image"></i>Image</button>
          <button type="button" data-add-overlay title="Upload a transparent PNG, WebP, or SVG border"><i data-lucide="frame"></i>Overlay</button>
          <button type="button" data-add-rect><i data-lucide="square"></i>Rect</button>
          <button type="button" data-add-circle><i data-lucide="circle"></i>Circle</button>
          <button type="button" data-add-line><i data-lucide="minus"></i>Line</button>
          <button type="button" data-add-qr><i data-lucide="qr-code"></i>QR</button>
          <input type="file" data-image-upload accept="image/*" hidden>
          <span class="backend-spacer"></span>
          <button type="button" data-open-public><i data-lucide="external-link"></i>Open</button>
          <button type="button" data-show-qr><i data-lucide="qr-code"></i>QR</button>
          <button type="button" data-export-card><i data-lucide="download"></i>PNG</button>
        </div>
        <div class="backend-canvas-wrap">
          ${renderCanvasPreview(card)}
        </div>
        <p class="backend-status">${escapeHtml(state.status || 'Drag and resize any layer. Transparent overlays stay transparent. Save to publish the design.')}</p>
      </section>
      <aside class="backend-inspector">
        ${renderCardInspector(card)}
        ${renderLayerInspector(card)}
      </aside>
    </section>
    <section class="backend-ai-handoff">
      <div class="backend-ai-handoff-copy">
        <span class="backend-kicker">Create outside · Import here</span>
        <h2>Make a complete design with ChatGPT</h2>
        <p>Copy this prompt, customize the creative-direction fields, and ask ChatGPT to return one HTML file. Upload that file here and Creator will recognize its phone, email, website, map, booking, and ticket links.</p>
        <div class="backend-inline-actions">
          <button type="button" class="backend-primary" data-copy-ai-prompt><i data-lucide="copy"></i>Copy ChatGPT Prompt</button>
          <button type="button" data-import-ready-design><i data-lucide="file-up"></i>Import Ready Design</button>
          <input type="file" data-ready-design-file accept="text/html,application/json,.html,.htm,.json" hidden>
        </div>
        <p class="backend-ai-note"><strong>Interactive format:</strong> upload HTML or a JSON package containing HTML. PNG/JPG files can still be added as visual layers, but a flat image cannot carry clickable phone numbers or links.</p>
      </div>
      <label class="backend-field backend-ai-prompt-field">
        <span>Ready-to-copy prompt for this ${card.documentType === 'ticket' ? 'ticket' : 'business card'}</span>
        <textarea readonly data-ai-design-prompt>${escapeHtml(aiReadyDesignPrompt(card))}</textarea>
      </label>
    </section>
  `;
}

function labelField(label, name, value, type = 'text') {
  return `
    <label class="backend-field">
      <span>${label}</span>
      <input type="${type}" data-label-field="${name}" value="${escapeHtml(value ?? '')}">
    </label>
  `;
}

function renderCompaniesView() {
  const label = selectedLabel();
  const assignedCount = label ? (state.siteData.cards || []).filter((card) => card.companyLabel === label.id).length : 0;
  return `
    <section class="backend-companies">
      <aside class="backend-sidebar">
        <div class="backend-sidebar-head">
          <span class="backend-kicker">Labels</span>
          <h2>Companies</h2>
        </div>
        <div class="backend-card-list">
          ${getLabels().map((item) => `
            <button type="button" class="backend-card-row ${item.id === state.selectedLabelId ? 'is-active' : ''}" data-select-label="${escapeHtml(item.id)}">
              <span><strong>${escapeHtml(item.name)}</strong><small>${(state.siteData.cards || []).filter((card) => card.companyLabel === item.id).length} cards</small></span>
              <span class="backend-label-dot" style="background:${escapeHtml(item.color || '#14e0e2')}"></span>
            </button>
          `).join('') || '<p class="backend-muted">No companies yet.</p>'}
        </div>
      </aside>
      <section class="backend-panel backend-company-editor">
        <div class="backend-panel-head">
          <span class="backend-kicker">Company Detail</span>
          <h2>${escapeHtml(label?.name || 'Create a company')}</h2>
        </div>
        ${label ? `
          <div class="backend-form-grid">
            ${labelField('Name', 'name', label.name)}
            ${labelField('Slug', 'slug', label.slug)}
            ${labelField('Color', 'color', label.color || '#14e0e2', 'color')}
            ${labelField('Website', 'website', label.website)}
            ${labelField('Email', 'email', label.email)}
            ${labelField('Phone', 'phone', label.phone)}
            <label class="backend-field backend-field-wide">
              <span>Notes</span>
              <textarea data-label-field="notes">${escapeHtml(label.notes || '')}</textarea>
            </label>
          </div>
          <p class="backend-status">${assignedCount} cards assigned to this company.</p>
          <div class="backend-inline-actions">
            <button type="button" data-delete-label class="backend-danger"><i data-lucide="trash-2"></i>Delete Company</button>
          </div>
        ` : '<p class="backend-muted">Create a company label, then assign cards to it from the Builder inspector.</p>'}
      </section>
    </section>
  `;
}

function renderApp() {
  const root = document.getElementById('backend-root');
  const card = selectedCard();
  if (!root || !state.siteData) return;
  const cards = state.siteData.cards || [];
  const content = state.activeView === 'cards'
    ? renderCardsView()
    : state.activeView === 'companies'
      ? renderCompaniesView()
      : card
        ? renderBuilderView(card)
        : '<p class="backend-muted">No cards yet. Create one to begin.</p>';

  root.innerHTML = `
    <section class="backend-toolbar">
      <div>
        <span class="backend-kicker">Design Studio</span>
        <h2>${cards.length} cards & tickets managed</h2>
      </div>
      ${renderNav()}
      <div class="backend-toolbar-actions">
        <button type="button" data-new-card><i data-lucide="contact"></i>New Card</button>
        <button type="button" data-new-ticket><i data-lucide="ticket-plus"></i>New Ticket</button>
        <button type="button" data-new-label><i data-lucide="building-2"></i>New Company</button>
        <button type="button" data-import-site><i data-lucide="upload"></i>Upload Cards</button>
        <button type="button" data-export-site><i data-lucide="download"></i>Backup</button>
        <input type="file" data-import-site-file accept="application/json,.json" hidden>
        ${state.activeView === 'builder' ? `
          <button type="button" data-clone-card><i data-lucide="copy"></i>Clone</button>
          <button type="button" data-delete-card class="backend-danger"><i data-lucide="trash-2"></i>Delete</button>
          <button type="button" data-save-card class="backend-primary"><i data-lucide="save"></i>Save</button>
        ` : ''}
        ${state.activeView === 'companies' ? `
          <button type="button" data-save-labels class="backend-primary"><i data-lucide="save-all"></i>Save Companies</button>
        ` : ''}
        <button type="button" data-logout><i data-lucide="log-out"></i>Lock</button>
      </div>
    </section>
    ${content}
  `;

  bindEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateCardField(card, name, value, input) {
  if (name === 'isVisible') {
    card.isVisible = input.checked;
    return;
  }
  if (name === 'themeCanvas') {
    card.theme = input.checked ? 'canvas' : 'clean';
    ensureCanvas(card);
    renderApp();
    return;
  }
  if (name === 'contacts') {
    card.contacts = parseContacts(value);
    return;
  }
  if (name === 'documentType') {
    card.documentType = value === 'ticket' ? 'ticket' : 'card';
    card.ticket = card.ticket || createDefaultTicketData(card.title);
    card.liveUrl = `/${card.documentType === 'ticket' ? 'tickets' : 'cards'}/${card.slug}/`;
    renderApp();
    return;
  }
  if (name.startsWith('ticket.')) {
    const key = name.split('.')[1];
    card.ticket = card.ticket || createDefaultTicketData(card.title);
    card.ticket[key] = value;
    refreshBoundLayers(card, name);
    return;
  }
  if (name.startsWith('canvas.')) {
    const key = name.split('.')[1];
    const canvas = ensureCanvas(card);
    canvas[key] = input.type === 'number' ? Number(value) : value;
    renderApp();
    return;
  }
  card[name] = value;
  refreshBoundLayers(card, name);
  if (name === 'slug') {
    card.slug = slugify(value);
    card.liveUrl = `/${card.documentType === 'ticket' ? 'tickets' : 'cards'}/${card.slug}/`;
    state.selectedSlug = card.slug;
  }
}

function refreshBoundLayers(card, binding) {
  const canvas = ensureCanvas(card);
  canvas.layers
    .filter((layer) => layer.binding === binding)
    .forEach((layer) => {
      const element = document.querySelector(`[data-layer-id="${CSS.escape(layer.id)}"]`);
      if (!element) return;
      const value = resolvedLayerValue(layer, card);
      if (layer.type === 'qr') {
        element.src = qrImageUrl(value, layer.color, layer.fill);
      } else {
        element.textContent = value;
      }
    });
}

function updateLayerField(layer, name, value, input) {
  const key = name.replace('layer.', '');
  layer[key] = input.type === 'number' ? Number(value) : value;
  renderApp();
}

function addLayer(type) {
  const card = selectedCard();
  if (!card) return;
  const canvas = ensureCanvas(card);
  const base = {
    id: createLayerId(),
    type,
    x: 160,
    y: 820,
    w: 760,
    h: 100,
    z: canvas.layers.length + 1,
  };
  let layer = base;
  if (type === 'text') {
    layer = { ...base, text: 'New text', color: '#ffffff', fontSize: 46, fontWeight: 700, align: 'center' };
  } else if (type === 'image') {
    layer = { ...base, src: card.logoPath || '', h: 420, objectFit: 'contain' };
  } else if (type === 'shape') {
    layer = { ...base, shape: 'rect', fill: '#14e0e2', stroke: '#14e0e2', strokeWidth: 0, radius: 24, h: 180 };
  } else if (type === 'circle') {
    layer = { ...base, type: 'shape', shape: 'ellipse', fill: '#14e0e2', stroke: '#14e0e2', strokeWidth: 0, w: 260, h: 260 };
  } else if (type === 'line') {
    layer = { ...base, type: 'line', stroke: '#ffffff', strokeWidth: 5, h: 5, rotation: 0 };
  } else if (type === 'qr') {
    layer = { ...base, type: 'qr', name: 'QR code', value: '', binding: 'publicUrl', color: '#111827', fill: '#ffffff', radius: 18, x: 360, w: 360, h: 360 };
  }
  canvas.layers.push(layer);
  state.selectedLayerId = layer.id;
  renderApp();
}

function duplicateSelectedLayer() {
  const card = selectedCard();
  const canvas = card ? ensureCanvas(card) : null;
  const layer = selectedLayer(card);
  if (!canvas || !layer) return;
  const copy = JSON.parse(JSON.stringify(layer));
  copy.id = createLayerId();
  copy.name = `${layer.name || layer.type} copy`;
  copy.x = Math.min(canvas.width - Math.max(12, Number(copy.w) || 120), (Number(copy.x) || 0) + 28);
  copy.y = Math.min(canvas.height - Math.max(12, Number(copy.h) || 70), (Number(copy.y) || 0) + 28);
  copy.z = canvas.layers.length + 1;
  copy.locked = false;
  canvas.layers.push(copy);
  state.selectedLayerId = copy.id;
  state.status = 'Layer duplicated. Save to publish.';
  renderApp();
}

function applyDocumentPreset(key) {
  const card = selectedCard();
  const preset = DOCUMENT_PRESETS[key];
  if (!card || !preset) return;
  const canvas = ensureCanvas(card);
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  const scaleX = preset.width / oldWidth;
  const scaleY = preset.height / oldHeight;
  canvas.layers.forEach((layer) => {
    layer.x = Math.round((Number(layer.x) || 0) * scaleX);
    layer.y = Math.round((Number(layer.y) || 0) * scaleY);
    if (layer.type === 'qr') {
      const squareSize = Math.max(1, Math.round(Math.max(Number(layer.w) || 1, Number(layer.h) || 1) * Math.sqrt(scaleX * scaleY)));
      layer.w = squareSize;
      layer.h = squareSize;
    } else {
      layer.w = Math.max(1, Math.round((Number(layer.w) || 1) * scaleX));
      layer.h = Math.max(1, Math.round((Number(layer.h) || 1) * scaleY));
    }
    if (layer.fontSize) layer.fontSize = Math.max(8, Math.round(Number(layer.fontSize) * Math.min(scaleX, scaleY)));
    if (layer.strokeWidth) layer.strokeWidth = Math.max(1, Math.round(Number(layer.strokeWidth) * Math.min(scaleX, scaleY)));
  });
  canvas.width = preset.width;
  canvas.height = preset.height;
  if (preset.documentType) {
    card.documentType = preset.documentType;
    card.liveUrl = `/${preset.documentType === 'ticket' ? 'tickets' : 'cards'}/${card.slug}/`;
  }
  state.status = `Applied ${preset.label} format.`;
  renderApp();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image'));
    reader.readAsDataURL(file);
  });
}

async function uploadImageAsset(file) {
  if (!file.type.startsWith('image/')) throw new Error('Select a PNG, JPG, WebP, GIF, or SVG image');
  if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller');
  const dataUrl = await fileToDataUrl(file);
  const result = await api('/api/assets', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, filename: file.name }),
  });
  return result.url;
}

async function placeUploadedImage(file, mode = 'image') {
  const card = selectedCard();
  if (!card) return;
  state.status = `Uploading ${file.name}...`;
  renderApp();
  const url = await uploadImageAsset(file);
  const canvas = ensureCanvas(card);

  if (mode === 'background') {
    canvas.backgroundImage = url;
    state.status = 'Background uploaded. Save to publish.';
    renderApp();
    return;
  }

  if (mode === 'replace') {
    const layer = selectedLayer(card);
    if (layer?.type === 'image') {
      layer.src = url;
      state.status = 'Image replaced. Save to publish.';
      renderApp();
    }
    return;
  }

  addLayer('image');
  const layer = selectedLayer(card);
  if (layer) {
    layer.src = url;
    layer.name = mode === 'overlay' ? 'Transparent overlay' : file.name.replace(/\.[^.]+$/, '');
    layer.objectFit = mode === 'overlay' ? 'fill' : 'contain';
    if (mode === 'overlay') {
      layer.x = 0;
      layer.y = 0;
      layer.w = canvas.width;
      layer.h = canvas.height;
      layer.z = canvas.layers.length;
    }
  }
  state.status = mode === 'overlay'
    ? 'Transparent overlay added above the design.'
    : 'Image uploaded and added to the canvas.';
  renderApp();
}

function deleteSelectedLayer() {
  const card = selectedCard();
  const canvas = card ? ensureCanvas(card) : null;
  if (!canvas || !state.selectedLayerId) return;
  canvas.layers = canvas.layers.filter((layer) => layer.id !== state.selectedLayerId);
  state.selectedLayerId = '';
  state.status = 'Layer removed. Save the card to publish the change.';
  renderApp();
}

function moveLayer(delta) {
  const card = selectedCard();
  const canvas = card ? ensureCanvas(card) : null;
  const layer = selectedLayer(card);
  if (!canvas || !layer) return;
  const index = canvas.layers.findIndex((item) => item.id === layer.id);
  const nextIndex = Math.max(0, Math.min(canvas.layers.length - 1, index + delta));
  canvas.layers.splice(index, 1);
  canvas.layers.splice(nextIndex, 0, layer);
  canvas.layers.forEach((item, itemIndex) => {
    item.z = itemIndex + 1;
  });
  renderApp();
}

async function saveSelectedCard() {
  const card = selectedCard();
  if (!card) return;
  ensureCanvas(card);
  state.status = 'Saving...';
  renderApp();
  const previousSlug = state.selectedOriginalSlug || state.selectedSlug || card.slug;
  const saved = await api(`/api/cards/${encodeURIComponent(previousSlug)}`, {
    method: 'PUT',
    body: JSON.stringify(card),
  });
  const index = state.siteData.cards.findIndex((item) => item.id === saved.id);
  if (index !== -1) state.siteData.cards[index] = saved;
  state.selectedSlug = saved.slug;
  state.selectedId = saved.id;
  state.selectedOriginalSlug = saved.slug;
  state.status = 'Saved. Public URL updated.';
  renderApp();
}

async function createCard() {
  const title = `New Card ${state.siteData.cards.length + 1}`;
  const created = await api('/api/cards', {
    method: 'POST',
    body: JSON.stringify({ title, slug: slugify(title), theme: 'canvas', documentType: 'card' }),
  });
  state.siteData.cards.push(created);
  state.selectedSlug = created.slug;
  state.selectedId = created.id;
  state.selectedOriginalSlug = created.slug;
  state.selectedLayerId = '';
  state.activeView = 'builder';
  state.status = 'New canvas card created.';
  renderApp();
}

async function createTicket() {
  const title = `New Event ${state.siteData.cards.filter((item) => item.documentType === 'ticket').length + 1}`;
  const slug = slugify(title).toLowerCase();
  const created = await api('/api/cards', {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      documentType: 'ticket',
      theme: 'canvas',
      liveUrl: `/tickets/${slug}/`,
      ticket: createDefaultTicketData(title),
      canvas: createTicketCanvas(),
      qrColor: '#8b5cf6',
    }),
  });
  state.siteData.cards.push(created);
  state.selectedSlug = created.slug;
  state.selectedId = created.id;
  state.selectedOriginalSlug = created.slug;
  state.selectedLayerId = '';
  state.activeView = 'builder';
  state.status = 'New event ticket created from the editable ticket template.';
  renderApp();
}

async function cloneCard(sourceCard = selectedCard()) {
  const card = sourceCard;
  if (!card) return;
  const cloned = await api(`/api/cards/${encodeURIComponent(card.slug)}/clone`, { method: 'POST', body: '{}' });
  state.siteData.cards.push(cloned);
  state.selectedSlug = cloned.slug;
  state.selectedId = cloned.id;
  state.selectedOriginalSlug = cloned.slug;
  state.selectedLayerId = '';
  state.status = 'Card cloned.';
  renderApp();
}

async function deleteCard(targetCard = selectedCard()) {
  const card = targetCard;
  if (!card || !(await confirmAction({
    title: `Delete ${card.documentType === 'ticket' ? 'event ticket' : 'business card'}?`,
    message: `${card.title || card.slug} will be removed from the live design library.`,
    confirmLabel: `Delete ${card.documentType === 'ticket' ? 'Ticket' : 'Card'}`,
    danger: true,
  }))) return;
  state.status = 'Deleting card...';
  renderApp();
  await api(`/api/cards/${encodeURIComponent(card.slug)}`, { method: 'DELETE' });
  state.siteData.cards = state.siteData.cards.filter((item) => item.id !== card.id);
  const nextCard = state.siteData.cards[0];
  state.selectedSlug = nextCard?.slug || '';
  state.selectedId = nextCard?.id || '';
  state.selectedOriginalSlug = nextCard?.slug || '';
  state.selectedLayerId = '';
  state.status = 'Card deleted.';
  renderApp();
}

async function saveLabels() {
  state.status = 'Saving companies...';
  renderApp();
  const result = await api('/api/labels', {
    method: 'PUT',
    body: JSON.stringify({ labels: getLabels() }),
  });
  state.siteData.labels = result.labels || [];
  await Promise.all((state.siteData.cards || []).map((card) => api(`/api/cards/${encodeURIComponent(card.slug)}`, {
    method: 'PUT',
    body: JSON.stringify(card),
  })));
  state.status = 'Companies saved.';
  renderApp();
}

function downloadJson(data, filename) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportSiteData() {
  state.status = 'Preparing backup...';
  renderApp();
  const data = await api('/api/export-site');
  downloadJson(data, 'site-content-backup.json');
  state.status = 'Backup downloaded.';
  renderApp();
}

async function importSiteDataFile(file) {
  const text = await file.text();
  const importedData = JSON.parse(text);
  const count = Array.isArray(importedData.cards) ? importedData.cards.length : 0;
  if (!window.confirm(`Upload ${count} cards and replace the current live dataset?`)) return;

  state.status = 'Uploading cards...';
  renderApp();
  const result = await api('/api/import-site', {
    method: 'PUT',
    body: JSON.stringify(importedData),
  });
  state.selectedSlug = '';
  state.selectedId = '';
  state.selectedOriginalSlug = '';
  state.selectedLayerId = '';
  state.selectedLabelId = '';
  await loadAdminData();
  state.activeView = 'cards';
  state.status = `Uploaded ${result.cards || 0} cards and ${result.labels || 0} companies.`;
  renderApp();
}

function createCompanyLabel() {
  const label = createLabel();
  state.siteData.labels.push(label);
  state.selectedLabelId = label.id;
  state.activeView = 'companies';
  state.status = 'New company created. Add details and save.';
  renderApp();
}

async function deleteCompanyLabel() {
  const label = selectedLabel();
  if (!label || !(await confirmAction({
    title: 'Delete company label?',
    message: `Cards will keep working but lose the ${label.name} company label.`,
    confirmLabel: 'Delete Company',
    danger: true,
  }))) return;
  state.siteData.labels = getLabels().filter((item) => item.id !== label.id);
  state.siteData.cards.forEach((card) => {
    if (card.companyLabel === label.id) card.companyLabel = '';
  });
  state.selectedLabelId = state.siteData.labels[0]?.id || '';
  state.status = 'Company deleted. Save companies and affected cards to persist.';
  renderApp();
}

function updateLabelField(label, name, value, input) {
  label[name] = input.type === 'color' ? value : value;
  if (name === 'name' && !label.slug) label.slug = slugify(value).toLowerCase();
  if (name === 'slug') label.slug = slugify(value).toLowerCase();
}

function openQrModal(targetUrl, colorHex) {
  if (!state.qrModal) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-modal-overlay';
    overlay.innerHTML = `
      <div class="qr-modal-card">
        <button class="qr-modal-close" aria-label="Close modal"><i data-lucide="x"></i></button>
        <h3 class="qr-modal-title">Card QR</h3>
        <p class="qr-modal-subtitle">${escapeHtml(targetUrl)}</p>
        <div class="qr-code-frame"><img src="" alt="QR code" class="qr-code-image"></div>
        <div class="qr-modal-actions">
          <a href="#" download="business-card-qr.png" class="qr-modal-action-btn qr-download-btn">Download QR</a>
          <button class="qr-modal-action-btn qr-copy-btn">Copy Link</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.qr-modal-close').addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.classList.remove('active');
    });
    state.qrModal = overlay;
  }

  const color = (colorHex || '#111111').replace('#', '');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(targetUrl)}&color=${encodeURIComponent(color)}&bgcolor=ffffff&qzone=1&margin=0`;
  state.qrModal.querySelector('.qr-code-image').src = qrUrl;
  state.qrModal.querySelector('.qr-download-btn').href = qrUrl;
  state.qrModal.querySelector('.qr-copy-btn').onclick = async () => navigator.clipboard.writeText(targetUrl);
  state.qrModal.classList.add('active');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function publicUrl(card) {
  return new URL(card.liveUrl || `/cards/${card.slug}/`, window.location.origin).href;
}

async function copyCardLink(card) {
  const link = publicUrl(card);
  await navigator.clipboard.writeText(link);
  state.status = `Copied ${card.title || card.slug} public link.`;
  state.openMenuSlug = '';
  renderApp();
}

async function exportCardPng() {
  const card = selectedCard();
  const frame = document.querySelector('[data-canvas-frame]');
  if (!card || !frame) return;
  const canvas = await html2canvas(frame, {
    backgroundColor: null,
    scale: Math.min(window.devicePixelRatio || 1.5, 2),
    useCORS: true,
  });
  const link = document.createElement('a');
  link.download = `${card.slug || 'business-card'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function bindDragHandlers() {
  const frame = document.querySelector('[data-canvas-frame]');
  const card = selectedCard();
  if (!frame || !card) return;
  const canvas = ensureCanvas(card);

  frame.querySelectorAll('.builder-layer[data-layer-id]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const layer = canvas.layers.find((item) => item.id === element.dataset.layerId);
      if (!layer) return;
      state.selectedLayerId = layer.id;
      if (layer.locked) {
        state.status = 'Layer is locked. Unlock it in the inspector to move or resize it.';
        renderApp();
        return;
      }
      frame.querySelectorAll('.builder-layer').forEach((item) => item.classList.remove('is-selected'));
      element.classList.add('is-selected');

      const rect = frame.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originalX = Number(layer.x) || 0;
      const originalY = Number(layer.y) || 0;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      element.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        layer.x = Math.round(originalX + (moveEvent.clientX - startX) * scaleX);
        layer.y = Math.round(originalY + (moveEvent.clientY - startY) * scaleY);
        element.style.left = pct(layer.x, canvas.width);
        element.style.top = pct(layer.y, canvas.height);
      };
      const up = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        renderApp();
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
    });
  });

  frame.querySelectorAll('[data-resize-handle][data-layer-id]').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const layer = canvas.layers.find((item) => item.id === handle.dataset.layerId);
      if (!layer || layer.locked) return;

      state.selectedLayerId = layer.id;
      const rect = frame.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originalX = Number(layer.x) || 0;
      const originalY = Number(layer.y) || 0;
      const originalW = Math.max(12, Number(layer.w) || 120);
      const originalH = Math.max(12, Number(layer.h) || 70);
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const direction = handle.dataset.resizeHandle || '';
      const layerElement = frame.querySelector(`.builder-layer[data-layer-id="${CSS.escape(layer.id)}"]`);
      const selectionBox = frame.querySelector('[data-selection-box]');

      handle.setPointerCapture(event.pointerId);
      const update = (moveEvent) => {
        const deltaX = (moveEvent.clientX - startX) * scaleX;
        const deltaY = (moveEvent.clientY - startY) * scaleY;
        let x = originalX;
        let y = originalY;
        let w = originalW;
        let h = originalH;

        if (direction.includes('e')) w = Math.max(12, Math.min(canvas.width - x, originalW + deltaX));
        if (direction.includes('s')) h = Math.max(12, Math.min(canvas.height - y, originalH + deltaY));
        if (direction.includes('w')) {
          w = Math.max(12, Math.min(originalX + originalW, originalW - deltaX));
          x = originalX + originalW - w;
        }
        if (direction.includes('n')) {
          h = Math.max(12, Math.min(originalY + originalH, originalH - deltaY));
          y = originalY + originalH - h;
        }

        layer.x = Math.round(x);
        layer.y = Math.round(y);
        layer.w = Math.round(w);
        layer.h = Math.round(h);
        [layerElement, selectionBox].forEach((element) => {
          if (!element) return;
          element.style.left = pct(layer.x, canvas.width);
          element.style.top = pct(layer.y, canvas.height);
          element.style.width = pct(layer.w, canvas.width);
          element.style.height = pct(layer.h, canvas.height);
        });
      };
      const up = () => {
        handle.removeEventListener('pointermove', update);
        handle.removeEventListener('pointerup', up);
        renderApp();
      };
      handle.addEventListener('pointermove', update);
      handle.addEventListener('pointerup', up);
    });
  });

  frame.addEventListener('pointerdown', (event) => {
    if (event.target === frame) {
      state.selectedLayerId = '';
      renderApp();
    }
  });
}

function bindKeyboardShortcuts() {
  if (state.keyboardBound) return;
  state.keyboardBound = true;
  document.addEventListener('keydown', (event) => {
    const tagName = event.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || event.target?.isContentEditable) return;
    if (state.activeView !== 'builder' || !state.selectedLayerId) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelectedLayer();
      return;
    }
    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      deleteSelectedLayer();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const layer = selectedLayer();
      if (!layer || layer.locked) return;
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') layer.x -= amount;
      if (event.key === 'ArrowRight') layer.x += amount;
      if (event.key === 'ArrowUp') layer.y -= amount;
      if (event.key === 'ArrowDown') layer.y += amount;
      renderApp();
    }
  });
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view || 'builder';
      state.selectedLayerId = '';
      renderApp();
    });
  });

  document.querySelector('[data-filter-search]')?.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderApp();
    const search = document.querySelector('[data-filter-search]');
    if (search) {
      search.focus();
      search.setSelectionRange(state.searchQuery.length, state.searchQuery.length);
    }
  });

  document.querySelector('[data-filter-company]')?.addEventListener('change', (event) => {
    state.companyFilter = event.target.value;
    renderApp();
  });

  document.querySelectorAll('[data-select-card]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.target.closest('a') || event.target.closest('[data-card-settings]') || event.target.closest('[data-card-menu]')) return;
      selectCardBySlug(button.dataset.selectCard, state.activeView);
      state.status = '';
      renderApp();
    });
  });

  document.querySelectorAll('[data-card-settings]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openMenuSlug = state.openMenuSlug === button.dataset.cardSettings ? '' : button.dataset.cardSettings;
      renderApp();
    });
  });

  document.querySelectorAll('[data-card-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      runAction(async () => {
        const card = state.siteData.cards.find((item) => item.slug === button.dataset.cardSlug);
        if (!card) return;

        if (button.dataset.cardAction === 'copy') {
          await copyCardLink(card);
        } else if (button.dataset.cardAction === 'qr') {
          state.openMenuSlug = '';
          openQrModal(publicUrl(card), card.qrColor);
        } else if (button.dataset.cardAction === 'edit') {
          selectCardBySlug(card.slug, 'builder');
          state.status = 'Editing selected card.';
          renderApp();
        } else if (button.dataset.cardAction === 'clone') {
          selectCardBySlug(card.slug, state.activeView);
          await cloneCard(card);
        } else if (button.dataset.cardAction === 'delete') {
          await deleteCard(card);
        }
      });
    });
  });

  document.querySelectorAll('[data-select-label]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLabelId = button.dataset.selectLabel || '';
      renderApp();
    });
  });

  document.querySelector('[data-new-card]')?.addEventListener('click', () => runAction(createCard));
  document.querySelector('[data-new-ticket]')?.addEventListener('click', () => runAction(createTicket));
  document.querySelector('[data-clone-card]')?.addEventListener('click', () => runAction(cloneCard));
  document.querySelector('[data-delete-card]')?.addEventListener('click', () => runAction(deleteCard));
  document.querySelector('[data-save-card]')?.addEventListener('click', () => runAction(saveSelectedCard));
  document.querySelector('[data-import-site]')?.addEventListener('click', () => document.querySelector('[data-import-site-file]')?.click());
  document.querySelector('[data-copy-ai-prompt]')?.addEventListener('click', () => runAction(async () => {
    const prompt = document.querySelector('[data-ai-design-prompt]')?.value || aiReadyDesignPrompt(selectedCard());
    await navigator.clipboard.writeText(prompt);
    state.status = 'ChatGPT design prompt copied.';
    renderApp();
  }));
  document.querySelector('[data-import-ready-design]')?.addEventListener('click', () => document.querySelector('[data-ready-design-file]')?.click());
  document.querySelector('[data-export-site]')?.addEventListener('click', () => runAction(exportSiteData));
  document.querySelector('[data-new-label]')?.addEventListener('click', createCompanyLabel);
  document.querySelector('[data-save-labels]')?.addEventListener('click', () => runAction(saveLabels));
  document.querySelector('[data-delete-label]')?.addEventListener('click', () => runAction(deleteCompanyLabel));
  document.querySelector('[data-logout]')?.addEventListener('click', logout);
  document.querySelector('[data-add-text]')?.addEventListener('click', () => addLayer('text'));
  document.querySelector('[data-add-image]')?.addEventListener('click', () => {
    state.imageUploadMode = 'image';
    document.querySelector('[data-image-upload]')?.click();
  });
  document.querySelector('[data-add-overlay]')?.addEventListener('click', () => {
    state.imageUploadMode = 'overlay';
    document.querySelector('[data-image-upload]')?.click();
  });
  document.querySelector('[data-add-rect]')?.addEventListener('click', () => addLayer('shape'));
  document.querySelector('[data-add-circle]')?.addEventListener('click', () => addLayer('circle'));
  document.querySelector('[data-add-line]')?.addEventListener('click', () => addLayer('line'));
  document.querySelector('[data-add-qr]')?.addEventListener('click', () => addLayer('qr'));
  document.querySelector('[data-upload-background]')?.addEventListener('click', () => {
    state.imageUploadMode = 'background';
    document.querySelector('[data-image-upload]')?.click();
  });
  document.querySelector('[data-replace-image]')?.addEventListener('click', () => {
    state.imageUploadMode = 'replace';
    document.querySelector('[data-image-upload]')?.click();
  });
  document.querySelector('[data-open-public]')?.addEventListener('click', () => {
    const card = selectedCard();
    if (card) window.open(publicUrl(card), '_blank', 'noopener,noreferrer');
  });
  document.querySelector('[data-show-qr]')?.addEventListener('click', () => {
    const card = selectedCard();
    if (card) openQrModal(publicUrl(card), card.qrColor);
  });
  document.querySelector('[data-export-card]')?.addEventListener('click', exportCardPng);
  document.querySelector('[data-delete-layer]')?.addEventListener('click', deleteSelectedLayer);
  document.querySelector('[data-duplicate-layer]')?.addEventListener('click', duplicateSelectedLayer);
  document.querySelector('[data-layer-front]')?.addEventListener('click', () => moveLayer(1));
  document.querySelector('[data-layer-back]')?.addEventListener('click', () => moveLayer(-1));

  document.querySelector('[data-document-preset]')?.addEventListener('change', (event) => {
    if (event.target.value) applyDocumentPreset(event.target.value);
  });

  document.querySelector('[data-image-upload]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await placeUploadedImage(file, state.imageUploadMode);
    } catch (error) {
      showActionError(error);
    } finally {
      event.target.value = '';
      state.imageUploadMode = 'image';
    }
  });

  document.querySelector('[data-import-site-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importSiteDataFile(file);
    } catch (error) {
      state.status = `Upload failed: ${error.message || 'Invalid JSON file'}`;
      renderApp();
    } finally {
      event.target.value = '';
    }
  });

  document.querySelector('[data-ready-design-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importReadyDesignFile(file);
    } catch (error) {
      state.status = `Ready-design import failed: ${error.message || 'Invalid file'}`;
      renderApp();
    } finally {
      event.target.value = '';
    }
  });

  const card = selectedCard();
  document.querySelectorAll('[data-card-field]').forEach((input) => {
    const fieldName = input.dataset.cardField || '';
    const supportsLivePreview = fieldName.startsWith('ticket.')
      || ['title', 'personName', 'role', 'description'].includes(fieldName)
      || input.tagName === 'TEXTAREA';
    const eventName = supportsLivePreview && input.type !== 'checkbox' ? 'input' : 'change';
    input.addEventListener(eventName, () => updateCardField(card, input.dataset.cardField, input.value, input));
  });

  const layer = selectedLayer(card);
  document.querySelectorAll('[data-layer-check]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!layer) return;
      layer[input.dataset.layerCheck] = input.checked;
      renderApp();
    });
  });
  document.querySelectorAll('[data-layer-field]').forEach((input) => {
    const eventName = input.tagName === 'TEXTAREA' ? 'input' : 'change';
    input.addEventListener(eventName, () => {
      if (layer) updateLayerField(layer, input.dataset.layerField, input.value, input);
    });
  });

  const label = selectedLabel();
  document.querySelectorAll('[data-label-field]').forEach((input) => {
    const eventName = input.tagName === 'TEXTAREA' ? 'input' : 'change';
    input.addEventListener(eventName, () => {
      if (label) updateLabelField(label, input.dataset.labelField, input.value, input);
    });
  });

  bindDragHandlers();
}

document.addEventListener('DOMContentLoaded', async () => {
  bindKeyboardShortcuts();
  try {
    await loadAdminData();
    renderApp();
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Invalid access code' || error.message === 'Access code is not configured') {
      window.localStorage.removeItem('businessCardAdminToken');
      state.authToken = '';
      state.authError = error.message === 'Access code is not configured' ? error.message : '';
      renderLogin();
      return;
    }

    const root = document.getElementById('backend-root');
    if (root) root.innerHTML = `<p class="backend-muted">Unable to load backend data: ${escapeHtml(error.message)}</p>`;
  }
});
