import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';

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
};

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

function createLayerId() {
  return `layer-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
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

function pct(value, total) {
  return `${((Number(value) || 0) / total) * 100}%`;
}

function layerStyle(layer, canvas) {
  return [
    `left:${pct(layer.x, canvas.width)}`,
    `top:${pct(layer.y, canvas.height)}`,
    `width:${pct(layer.w || 120, canvas.width)}`,
    `height:${pct(layer.h || 70, canvas.height)}`,
    `z-index:${Number(layer.z) || 1}`,
  ].join(';');
}

function renderCanvasLayer(layer, canvas, selectable = true) {
  const selected = layer.id === state.selectedLayerId ? ' is-selected' : '';
  const attrs = selectable ? `data-layer-id="${escapeHtml(layer.id)}"` : '';
  const baseClass = `builder-layer${selected}`;
  const baseStyle = layerStyle(layer, canvas);

  if (layer.type === 'image') {
    return `<img class="${baseClass} builder-layer-image" ${attrs} src="${escapeHtml(layer.src || '')}" alt="" style="${baseStyle};object-fit:${escapeHtml(layer.objectFit || 'cover')}">`;
  }

  if (layer.type === 'shape') {
    const radius = layer.shape === 'ellipse' ? '999px' : `${Number(layer.radius) || 0}px`;
    return `<div class="${baseClass} builder-layer-shape" ${attrs} style="${baseStyle};background:${escapeHtml(layer.fill || 'transparent')};border:${Number(layer.strokeWidth) || 0}px solid ${escapeHtml(layer.stroke || 'transparent')};border-radius:${radius}"></div>`;
  }

  if (layer.type === 'line') {
    return `<div class="${baseClass} builder-layer-line" ${attrs} style="${baseStyle};height:${Number(layer.strokeWidth) || 3}px;background:${escapeHtml(layer.stroke || layer.fill || '#ffffff')};transform:rotate(${Number(layer.rotation) || 0}deg);transform-origin:left center"></div>`;
  }

  return `<div class="${baseClass} builder-layer-text" ${attrs} style="${baseStyle};color:${escapeHtml(layer.color || '#ffffff')};font-size:calc(${Number(layer.fontSize) || 42} / ${canvas.height} * min(70vh, 680px));font-weight:${Number(layer.fontWeight) || 600};text-align:${escapeHtml(layer.align || 'left')};line-height:${Number(layer.lineHeight) || 1.12}">${escapeHtml(layer.text || '')}</div>`;
}

function renderCanvasPreview(card, selectable = true) {
  const canvas = ensureCanvas(card);
  const bgImage = canvas.backgroundImage || card.backgroundImage || '';
  const background = bgImage
    ? `background:${escapeHtml(canvas.backgroundColor || '#050505')} url('${escapeHtml(bgImage)}') center/cover no-repeat`
    : `background:${escapeHtml(canvas.backgroundColor || '#050505')}`;

  return `
    <div class="builder-canvas-frame" data-canvas-frame style="aspect-ratio:${canvas.width}/${canvas.height};${background};border:${Number(canvas.borderWidth) || 0}px solid ${escapeHtml(canvas.borderColor || 'transparent')};border-radius:${Number(canvas.borderRadius) || 0}px">
      ${canvas.layers.map((layer) => renderCanvasLayer(layer, canvas, selectable)).join('')}
    </div>
  `;
}

function renderCardList() {
  const cards = filteredCards();
  return cards.map((card) => `
    <button type="button" class="backend-card-row ${card.id === state.selectedId ? 'is-active' : ''}" data-select-card="${escapeHtml(card.slug)}">
      <span>
        <strong>${escapeHtml(card.title || card.slug)}</strong>
        <small>${escapeHtml(card.personName || card.slug)}${labelName(card.companyLabel) ? ` / ${escapeHtml(labelName(card.companyLabel))}` : ''}</small>
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
  return `
    <div class="backend-panel">
      <div class="backend-panel-head">
        <span class="backend-kicker">Card Record</span>
        <h2>${escapeHtml(card.title || card.slug)}</h2>
      </div>
      <div class="backend-form-grid">
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
      <div class="backend-canvas-settings">
        <span class="backend-kicker">Canvas</span>
        <div class="backend-form-grid">
          ${field('Background', 'canvas.backgroundColor', canvas.backgroundColor || '#080b10', 'color')}
          ${field('Border', 'canvas.borderColor', canvas.borderColor || '#14e0e2', 'color')}
          ${field('Border Width', 'canvas.borderWidth', canvas.borderWidth || 0, 'number', 'min="0" step="1"')}
          ${field('Radius', 'canvas.borderRadius', canvas.borderRadius || 0, 'number', 'min="0" step="1"')}
          ${field('Background Image', 'canvas.backgroundImage', canvas.backgroundImage || '')}
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
        <p class="backend-muted">Select an item on the canvas, or add text, image, shape, or line layers from the toolbar.</p>
      </div>
    `;
  }

  const common = `
    <div class="backend-form-grid">
      ${layerField('X', 'layer.x', layer.x, 'number', 'step="1"')}
      ${layerField('Y', 'layer.y', layer.y, 'number', 'step="1"')}
      ${layerField('W', 'layer.w', layer.w, 'number', 'step="1" min="1"')}
      ${layerField('H', 'layer.h', layer.h, 'number', 'step="1" min="1"')}
    </div>
  `;
  let specific = '';

  if (layer.type === 'text') {
    specific = `
      <label class="backend-field backend-field-wide">
        <span>Text</span>
        <textarea data-layer-field="text">${escapeHtml(layer.text || '')}</textarea>
      </label>
      <div class="backend-form-grid">
        ${layerField('Color', 'layer.color', layer.color || '#ffffff', 'color')}
        ${layerField('Font Size', 'layer.fontSize', layer.fontSize || 42, 'number', 'min="8" step="1"')}
        ${layerField('Weight', 'layer.fontWeight', layer.fontWeight || 600, 'number', 'min="100" max="900" step="100"')}
        <label class="backend-field">
          <span>Align</span>
          <select data-layer-field="align">
            ${['left', 'center', 'right'].map((align) => `<option value="${align}" ${layer.align === align ? 'selected' : ''}>${align}</option>`).join('')}
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
    `;
  } else {
    specific = `
      <div class="backend-form-grid">
        ${layerField('Fill', 'layer.fill', layer.fill || '#14e0e2', 'color')}
        ${layerField('Stroke', 'layer.stroke', layer.stroke || '#14e0e2', 'color')}
        ${layerField('Stroke Width', 'layer.strokeWidth', layer.strokeWidth || 0, 'number', 'min="0" step="1"')}
        ${layerField('Radius/Rotation', layer.type === 'line' ? 'layer.rotation' : 'layer.radius', layer.type === 'line' ? layer.rotation || 0 : layer.radius || 0, 'number', 'step="1"')}
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
  const description = card.personName || card.role || company || card.description || '';
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
      <div class="hub-item-logo">${escapeHtml(card.domainLabel || `${String(index + 1).padStart(2, '0')} / ${card.slug}`)}</div>
      ${logoMarkup}
      <div class="hub-item-body">
        <h2 class="hub-item-title">${escapeHtml(card.title || card.slug)}</h2>
        <p class="hub-item-desc">${escapeHtml(description)}</p>
        <a class="hub-item-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open Card
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
        <h2>${cards.length} matching cards</h2>
      </div>
      <button type="button" data-new-card><i data-lucide="plus"></i>New Card</button>
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
          <button type="button" data-add-rect><i data-lucide="square"></i>Rect</button>
          <button type="button" data-add-circle><i data-lucide="circle"></i>Circle</button>
          <button type="button" data-add-line><i data-lucide="minus"></i>Line</button>
          <input type="file" data-image-upload accept="image/*" hidden>
          <span class="backend-spacer"></span>
          <button type="button" data-open-public><i data-lucide="external-link"></i>Open</button>
          <button type="button" data-show-qr><i data-lucide="qr-code"></i>QR</button>
          <button type="button" data-export-card><i data-lucide="download"></i>PNG</button>
        </div>
        <div class="backend-canvas-wrap">
          ${renderCanvasPreview(card)}
        </div>
        <p class="backend-status">${escapeHtml(state.status || 'Drag layers freely. Save to publish changes to the public card URL.')}</p>
      </section>
      <aside class="backend-inspector">
        ${renderCardInspector(card)}
        ${renderLayerInspector(card)}
      </aside>
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
        <span class="backend-kicker">Backend</span>
        <h2>${cards.length} cards managed</h2>
      </div>
      ${renderNav()}
      <div class="backend-toolbar-actions">
        <button type="button" data-new-card><i data-lucide="plus"></i>New</button>
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
  if (name.startsWith('canvas.')) {
    const key = name.split('.')[1];
    const canvas = ensureCanvas(card);
    canvas[key] = input.type === 'number' ? Number(value) : value;
    renderApp();
    return;
  }
  card[name] = value;
  if (name === 'slug') {
    card.slug = slugify(value);
    card.liveUrl = `/cards/${card.slug}/`;
    state.selectedSlug = card.slug;
  }
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
  }
  canvas.layers.push(layer);
  state.selectedLayerId = layer.id;
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
    body: JSON.stringify({ title, slug: slugify(title), theme: 'canvas' }),
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
  if (!card || !window.confirm(`Delete ${card.title || card.slug}?`)) return;
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

function deleteCompanyLabel() {
  const label = selectedLabel();
  if (!label || !window.confirm(`Delete company ${label.name}? Cards will keep working but lose this label.`)) return;
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

  frame.querySelectorAll('[data-layer-id]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const layer = canvas.layers.find((item) => item.id === element.dataset.layerId);
      if (!layer) return;
      state.selectedLayerId = layer.id;
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

  frame.addEventListener('pointerdown', (event) => {
    if (event.target === frame) {
      state.selectedLayerId = '';
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
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
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

  document.querySelectorAll('[data-select-label]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLabelId = button.dataset.selectLabel || '';
      renderApp();
    });
  });

  document.querySelector('[data-new-card]')?.addEventListener('click', createCard);
  document.querySelector('[data-clone-card]')?.addEventListener('click', cloneCard);
  document.querySelector('[data-delete-card]')?.addEventListener('click', deleteCard);
  document.querySelector('[data-save-card]')?.addEventListener('click', saveSelectedCard);
  document.querySelector('[data-import-site]')?.addEventListener('click', () => document.querySelector('[data-import-site-file]')?.click());
  document.querySelector('[data-export-site]')?.addEventListener('click', exportSiteData);
  document.querySelector('[data-new-label]')?.addEventListener('click', createCompanyLabel);
  document.querySelector('[data-save-labels]')?.addEventListener('click', saveLabels);
  document.querySelector('[data-delete-label]')?.addEventListener('click', deleteCompanyLabel);
  document.querySelector('[data-logout]')?.addEventListener('click', logout);
  document.querySelector('[data-add-text]')?.addEventListener('click', () => addLayer('text'));
  document.querySelector('[data-add-image]')?.addEventListener('click', () => document.querySelector('[data-image-upload]')?.click());
  document.querySelector('[data-add-rect]')?.addEventListener('click', () => addLayer('shape'));
  document.querySelector('[data-add-circle]')?.addEventListener('click', () => addLayer('circle'));
  document.querySelector('[data-add-line]')?.addEventListener('click', () => addLayer('line'));
  document.querySelector('[data-open-public]')?.addEventListener('click', () => {
    const card = selectedCard();
    if (card) window.open(publicUrl(card), '_blank', 'noopener,noreferrer');
  });
  document.querySelector('[data-show-qr]')?.addEventListener('click', () => {
    const card = selectedCard();
    if (card) openQrModal(publicUrl(card), card.qrColor);
  });
  document.querySelector('[data-export-card]')?.addEventListener('click', exportCardPng);
  document.querySelector('[data-delete-layer]')?.addEventListener('click', () => {
    const card = selectedCard();
    const canvas = card ? ensureCanvas(card) : null;
    if (!canvas) return;
    canvas.layers = canvas.layers.filter((layer) => layer.id !== state.selectedLayerId);
    state.selectedLayerId = '';
    renderApp();
  });
  document.querySelector('[data-layer-front]')?.addEventListener('click', () => moveLayer(1));
  document.querySelector('[data-layer-back]')?.addEventListener('click', () => moveLayer(-1));

  document.querySelector('[data-image-upload]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      addLayer('image');
      const layer = selectedLayer();
      if (layer) {
        layer.src = String(reader.result || '');
        layer.objectFit = 'cover';
      }
      renderApp();
    };
    reader.readAsDataURL(file);
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

  const card = selectedCard();
  document.querySelectorAll('[data-card-field]').forEach((input) => {
    const eventName = input.tagName === 'TEXTAREA' ? 'input' : 'change';
    input.addEventListener(eventName, () => updateCardField(card, input.dataset.cardField, input.value, input));
  });

  const layer = selectedLayer(card);
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
