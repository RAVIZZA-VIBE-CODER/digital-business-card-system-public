import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';

const state = {
  siteData: null,
  qrModal: null,
};

function normalizeUrl(value) {
  if (!value) return '';
  return value.startsWith('http') || value.startsWith('mailto:') || value.startsWith('tel:')
    ? value
    : value.startsWith('/')
      ? value
      : `/${value}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadSiteData(slug = '') {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`/api/public-site${query}`);
  if (!response.ok) throw new Error('Unable to load site data');
  state.siteData = await response.json();
  return state.siteData;
}

function getAllCards() {
  return state.siteData?.cards || [];
}

function getVisibleCards() {
  return getAllCards().filter((card) => card.isVisible);
}

function getCardBySlug(slug) {
  return getAllCards().find((card) => card.slug === slug) || null;
}

function themeClass(theme) {
  return `hub-item-${theme === 'excelsior' ? 'excelsior' : theme}`;
}

function createHubCardMarkup(card) {
  const logoMarkup = card.logoPath
    ? `<div class="hub-item-visual"><img src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo"></div>`
    : '';

  const extraPattern = card.theme === 'thub' ? '<div class="hub-item-pattern" aria-hidden="true"></div>' : '';
  const href = normalizeUrl(card.liveUrl || `/cards/${card.slug}/`);
  const description = card.personName || card.role || card.description || '';

  return `
    <a href="${escapeHtml(href)}" data-card-slug="${escapeHtml(card.slug)}" data-qr-color="${escapeHtml(card.qrColor || '#ff2a2a')}" class="hub-item ${themeClass(card.theme)}">
      ${extraPattern}
      <div class="hub-item-logo">${escapeHtml(card.domainLabel || card.slotName || card.slug)}</div>
      ${logoMarkup}
      <div class="hub-item-body">
        <h2 class="hub-item-title">${escapeHtml(card.title)}</h2>
        <p class="hub-item-desc">${escapeHtml(description)}</p>
        <span class="hub-item-link">Open Card
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        </span>
      </div>
    </a>
  `;
}

function renderHubPage() {
  const hub = state.siteData?.hub;
  const cards = getVisibleCards();

  document.getElementById('hub-title').textContent = hub?.title || 'Digital Business Cards Hub';
  document.getElementById('hub-subtitle').textContent = hub?.subtitle || '';
  document.getElementById('hub-description').textContent = hub?.description || '';
  document.getElementById('hub-footer-primary').textContent = hub?.footerPrimary || '';
  document.getElementById('hub-footer-secondary').textContent = hub?.footerSecondary || '';
  document.getElementById('hub-grid').innerHTML = cards.map(createHubCardMarkup).join('');

  bindHubQrTriggers();
}

function unlockHub() {
  document.body.classList.remove('hub-auth-locked');
  const overlay = document.getElementById('hub-auth-overlay');
  if (!overlay) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function bindHubAccessGate() {
  unlockHub();
}

function getContactIconSvg(label) {
  const normalized = String(label || '').trim().toLowerCase();

  if (normalized.includes('email')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>';
  }

  if (normalized.includes('phone')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.29a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z"></path></svg>';
  }

  if (normalized.includes('website')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
  }

  if (normalized.includes('role')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"></path><path d="M20 21a8 8 0 0 0-16 0"></path></svg>';
  }

  if (normalized.includes('name')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg>';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l2.5 2.5"></path></svg>';
}

function getContactIconClass(theme, label) {
  const normalized = String(label || '').trim().toLowerCase();
  if (theme === 'thub' && normalized.includes('company')) {
    return 'thub-contact-icon thub-contact-icon-company';
  }

  return theme === 'thub' ? 'thub-contact-icon' : '';
}

function contactRowMarkup(contact, theme) {
  const value = contact?.value || '';
  const label = contact?.label || '';
  const url = contact?.url || '';
  const body = `
    <span class="card-contact-label">${escapeHtml(label)}</span>
    <span class="card-contact-value">${escapeHtml(value)}</span>
  `;

  if (theme === 'tanuki') {
    return `
      <a class="tanuki-row-link" href="${escapeHtml(url || '#')}" ${url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
        <div class="tanuki-icon-wrap">${getContactIconSvg(label)}</div>
        <div class="tanuki-row-body">${body}</div>
      </a>
    `;
  }

  return `
    <a class="card-contact-row" href="${escapeHtml(url || '#')}" ${url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
      ${body}
    </a>
  `;
}

function actionButtonMarkup(label, url, variant = '') {
  if (!label || !url) return '';
  return `<a class="card-cta ${variant}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function pct(value, total) {
  return `${((Number(value) || 0) / total) * 100}%`;
}

function renderCanvasLayer(layer, canvas) {
  const width = Number(canvas.width) || 1080;
  const height = Number(canvas.height) || 1920;
  const style = [
    `left:${pct(layer.x, width)}`,
    `top:${pct(layer.y, height)}`,
    `width:${pct(layer.w || 100, width)}`,
    `height:${pct(layer.h || 60, height)}`,
    `z-index:${Number(layer.z) || 1}`,
  ];

  if (layer.type === 'image') {
    return `<img class="canvas-card-layer canvas-card-image" src="${escapeHtml(layer.src || '')}" alt="" style="${style.join(';')};object-fit:${escapeHtml(layer.objectFit || 'cover')}">`;
  }

  if (layer.type === 'shape') {
    const radius = layer.shape === 'ellipse' ? '999px' : `${Number(layer.radius) || 0}px`;
    return `<div class="canvas-card-layer canvas-card-shape" style="${style.join(';')};background:${escapeHtml(layer.fill || 'transparent')};border:${Number(layer.strokeWidth) || 0}px solid ${escapeHtml(layer.stroke || 'transparent')};border-radius:${radius}"></div>`;
  }

  if (layer.type === 'line') {
    return `<div class="canvas-card-layer canvas-card-line" style="${style.join(';')};height:${Number(layer.strokeWidth) || 3}px;background:${escapeHtml(layer.stroke || layer.fill || '#ffffff')};transform:rotate(${Number(layer.rotation) || 0}deg);transform-origin:left center"></div>`;
  }

  return `<div class="canvas-card-layer canvas-card-text" style="${style.join(';')};color:${escapeHtml(layer.color || '#ffffff')};font-size:calc(${Number(layer.fontSize) || 42} / ${height} * min(88vh, 720px));font-weight:${Number(layer.fontWeight) || 600};text-align:${escapeHtml(layer.align || 'left')};line-height:${Number(layer.lineHeight) || 1.12}">${escapeHtml(layer.text || '')}</div>`;
}

function renderCanvasCardMarkup(card) {
  const canvas = card.canvas || {};
  const width = Number(canvas.width) || 1080;
  const height = Number(canvas.height) || 1920;
  const layers = Array.isArray(canvas.layers) ? canvas.layers : [];
  const bgImage = canvas.backgroundImage || card.backgroundImage || '';
  const background = bgImage
    ? `background:${escapeHtml(canvas.backgroundColor || '#050505')} url('${escapeHtml(bgImage)}') center/cover no-repeat`
    : `background:${escapeHtml(canvas.backgroundColor || '#050505')}`;

  return `
    <div class="business-card card-theme-canvas">
      <div class="canvas-card" style="aspect-ratio:${width}/${height};${background};border:${Number(canvas.borderWidth) || 0}px solid ${escapeHtml(canvas.borderColor || 'transparent')};border-radius:${Number(canvas.borderRadius) || 0}px">
        ${layers.map((layer) => renderCanvasLayer(layer, { width, height })).join('')}
      </div>
    </div>
  `;
}

function renderCardMarkup(card) {
  if (card.theme === 'canvas' && card.canvas) {
    return renderCanvasCardMarkup(card);
  }

  const contacts = (card.contacts || []).filter((contact) => contact.label || contact.value);
  const description = card.description || '';
  const tagline = card.tagline || '';
  const person = card.personName || '';
  const actions = `
    <div class="card-cta-row">
      ${actionButtonMarkup(card.primaryActionLabel, card.primaryActionUrl)}
      ${actionButtonMarkup(card.secondaryActionLabel, card.secondaryActionUrl, 'card-cta-secondary')}
    </div>
  `;

  if (card.theme === '2ndlife' || card.theme === 'trade') {
    const backgroundImage = card.backgroundImage ? `style="background-image:url('${escapeHtml(card.backgroundImage)}')"` : '';
    if (card.slug === '2ndlife') {
      const legacyContacts = (card.contacts || []).slice(0, 4);
      return `
        <div class="business-card card-theme-2ndlife-classic" ${backgroundImage}>
          <div class="classic-2ndlife-shell">
            ${card.logoPath ? `<img class="classic-2ndlife-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
            <div class="classic-2ndlife-name">${escapeHtml(person || card.title)}</div>
            <div class="classic-2ndlife-rows">
              ${legacyContacts.map((contact) => `
                <a class="classic-2ndlife-row" href="${escapeHtml(contact.url || '#')}" ${contact.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                  <span class="classic-2ndlife-icon">${getContactIconSvg(contact.label)}</span>
                  <span class="classic-2ndlife-value">${escapeHtml(contact.value || '')}</span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (card.theme === 'trade') {
      const tradeContacts = (card.contacts || []).slice(0, 4);
      return `
        <div class="business-card card-theme-trade-classic">
          <div class="classic-trade-shell">
            ${card.logoPath ? `<img class="classic-trade-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
            <div class="classic-trade-name">Sales Manager</div>
            <div class="classic-trade-rows">
              ${tradeContacts.map((contact) => `
                <a class="classic-trade-row" href="${escapeHtml(contact.url || '#')}" ${contact.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                  <span class="classic-trade-icon">${getContactIconSvg(contact.label)}</span>
                  <span class="classic-trade-value">${escapeHtml(contact.value || '')}</span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="business-card card-theme-photo ${card.theme === 'trade' ? 'card-theme-trade' : 'card-theme-2ndlife'}" ${backgroundImage}>
        <div class="card-theme-photo-overlay">
          ${card.logoPath ? `<img class="card-theme-photo-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
          <div class="card-subtitle"><span class="card-meta-glow"></span>${escapeHtml(tagline || 'Private Identity')}</div>
          <h1 class="card-title">${escapeHtml(person || card.title)}</h1>
          <p class="card-role">${escapeHtml(card.role || card.title)}</p>
          <p class="card-summary">${escapeHtml(description)}</p>
          ${actions}
        </div>
      </div>
    `;
  }

  if (card.theme === 'tanuki') {
    return `
      <div class="business-card card-theme-tanuki">
        <div class="tanuki-logo-box">
          ${card.logoPath ? `<img src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
        </div>
        <div class="tanuki-brand">
          <h1 class="tanuki-brand-main">${escapeHtml(card.title)}</h1>
          <h2 class="tanuki-brand-sub">${escapeHtml(card.role || tagline)}</h2>
        </div>
        <div class="tanuki-rows">${contacts.map((contact) => contactRowMarkup(contact, 'tanuki')).join('')}</div>
      </div>
    `;
  }

  if (card.theme === 'area0') {
    const areaContacts = contacts.slice(0, 4);
    return `
      <div class="business-card card-theme-area0">
        <div class="area0-shell">
          <div class="area0-brand">
            ${card.logoPath ? `<img class="area0-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
            <h1 class="area0-title">${escapeHtml(card.title)}</h1>
          </div>
          <div class="area0-contact-list">
            ${areaContacts.map((contact) => `
              <a class="area0-contact-row" href="${escapeHtml(contact.url || '#')}" ${contact.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                <span class="area0-contact-icon">${getContactIconSvg(contact.label)}</span>
                <span class="area0-contact-body">
                  <span class="area0-contact-label">${escapeHtml(contact.label)}</span>
                  <strong class="area0-contact-value">${escapeHtml(contact.value || '')}</strong>
                </span>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (card.theme === 'actbound') {
    const compactContacts = contacts.slice(0, 4);
    return `
      <div class="business-card card-theme-actbound">
        <div class="actbound-grid">
          <div class="actbound-brand">
            ${card.logoPath ? `<img src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo" class="actbound-logo">` : ''}
            <p class="actbound-kicker">${escapeHtml(tagline || 'AI Agent Runtime Assurance')}</p>
            <h1>${escapeHtml(card.title)}</h1>
            <p class="card-role">${escapeHtml(card.role)}</p>
            <div class="actbound-contact-list">
              ${compactContacts.map((contact) => contactRowMarkup(contact, 'actbound')).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (card.theme === 'thub') {
    const headerStyle = card.backgroundImage ? `style="background-image:url('${escapeHtml(card.backgroundImage)}')"` : '';
    return `
      <div class="business-card card-theme-thub">
        <div class="thub-card-shell">
          <div class="thub-card-banner" ${headerStyle}></div>
          ${card.logoPath ? `<img class="thub-card-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
          <div class="thub-card-copy">
            <h1 class="thub-card-name">${escapeHtml(card.personName || card.title)}</h1>
            <p class="thub-card-role">${escapeHtml(card.role)}</p>
            <div class="thub-divider"><span></span></div>
            <div class="thub-contact-list">
              ${contacts.map((contact) => `
                <a class="thub-contact-row" href="${escapeHtml(contact.url || '#')}" ${contact.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                  <span class="${getContactIconClass('thub', contact.label)}">${getContactIconSvg(contact.label)}</span>
                  <span class="thub-contact-body">
                    ${contact.label === 'Company'
                      ? `<strong>${escapeHtml(contact.value.split('\n')[0] || '')}</strong><small>${escapeHtml(contact.value.split('\n').slice(1).join('\n'))}</small>`
                      : `<strong>${escapeHtml(contact.value || '')}</strong>`
                    }
                  </span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (card.theme === 'excelsior') {
    return `
      <div class="business-card card-theme-excelsior-profile">
        <div class="excelsior-card-shell">
          ${card.logoPath ? `<img class="excelsior-card-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
          <div class="excelsior-card-copy">
            <div class="excelsior-divider"><span></span></div>
            <h1 class="excelsior-card-name">${escapeHtml(card.personName || card.title)}</h1>
            <p class="excelsior-card-role">${escapeHtml(card.role || '')}</p>
            <div class="excelsior-contact-list">
              ${contacts.map((contact) => `
                <a class="excelsior-contact-row" href="${escapeHtml(contact.url || '#')}" ${contact.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                  <span class="excelsior-contact-icon">${getContactIconSvg(contact.label)}</span>
                  <span class="excelsior-contact-value">${escapeHtml(contact.value || '')}</span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="business-card card-theme-clean ${card.theme === 'excelsior' ? 'card-theme-excelsior' : ''}">
      ${card.logoPath ? `<img class="card-theme-clean-logo" src="${escapeHtml(card.logoPath)}" alt="${escapeHtml(card.title)} logo">` : ''}
      <div class="card-theme-clean-copy">
        <p class="card-subtitle">${escapeHtml(tagline || person)}</p>
        <h1 class="card-theme-clean-title">${escapeHtml(card.title)}</h1>
        <p class="card-role">${escapeHtml(card.role)}</p>
        <p class="card-summary">${escapeHtml(description)}</p>
        <div class="card-contact-list">${contacts.map((contact) => contactRowMarkup(contact, 'clean')).join('')}</div>
        ${actions}
      </div>
    </div>
  `;
}

function setCardMeta(card) {
  document.title = `${card.title} | Digital Business Card`;
  const description = card.description || card.role || card.title;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', description);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', card.qrColor || '#050505');
}

function renderCardPage(card) {
  const root = document.getElementById('card-root');
  if (!root) return;
  root.innerHTML = renderCardMarkup(card);
  setCardMeta(card);
}

function ensureQrModal() {
  if (state.qrModal) return state.qrModal;

  const overlay = document.createElement('div');
  overlay.className = 'qr-modal-overlay';
  overlay.innerHTML = `
    <div class="qr-modal-card">
      <button class="qr-modal-close" aria-label="Close modal">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <h3 class="qr-modal-title">Share Profile</h3>
      <p class="qr-modal-subtitle">Scan to open this card instantly.</p>
      <div class="qr-code-frame">
        <img src="" alt="QR code" class="qr-code-image">
      </div>
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
  return overlay;
}

function openQrModal(targetUrl, colorHex) {
  const overlay = ensureQrModal();
  const image = overlay.querySelector('.qr-code-image');
  const copyButton = overlay.querySelector('.qr-copy-btn');
  const downloadButton = overlay.querySelector('.qr-download-btn');
  const color = (colorHex || '#111111').replace('#', '');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(targetUrl)}&color=${encodeURIComponent(color)}&bgcolor=ffffff&qzone=1&margin=0`;

  image.src = qrUrl;
  copyButton.onclick = async () => {
    await navigator.clipboard.writeText(targetUrl);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy Link';
    }, 1200);
  };

  downloadButton.href = qrUrl;
  document.documentElement.style.setProperty('--qr-accent', colorHex || '#ff2a2a');
  overlay.classList.add('active');
}

function bindHubQrTriggers() {
  document.querySelectorAll('.hub-item').forEach((item) => {
    const logo = item.querySelector('.hub-item-logo');
    const link = item.getAttribute('href');
    const color = item.getAttribute('data-qr-color') || '#ff2a2a';
    if (!logo || !link) return;

    logo.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openQrModal(new URL(link, window.location.origin).href, color);
    });
  });
}

function getCardSlugFromPath() {
  if (window.BUSINESS_CARD_SLUG) {
    return String(window.BUSINESS_CARD_SLUG);
  }

  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'cards' ? parts[1] : '';
}

function renderCardNotFound() {
  document.getElementById('card-root').innerHTML = '<div class="business-card card-theme-clean"><div class="card-theme-clean-copy"><h1 class="card-theme-clean-title">Card not found</h1><p class="card-summary">This card slot does not exist in the current data file.</p></div></div>';
}

async function initHubPage() {
  bindHubAccessGate();
  await loadSiteData();
  renderHubPage();
}

async function initCardPage() {
  const slug = getCardSlugFromPath();
  await loadSiteData(slug);
  const card = getCardBySlug(slug);
  const qrButton = document.getElementById('open-card-qr');
  const saveButton = document.getElementById('save-card-image');

  if (!card) {
    renderCardNotFound();
    return;
  }

  renderCardPage(card);
  if (qrButton) {
    qrButton.addEventListener('click', () => openQrModal(window.location.href, card.qrColor || '#ff2a2a'));
  }
  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const cardNode = document.querySelector('.business-card');
      if (!cardNode) return;

      saveButton.disabled = true;
      try {
        const canvas = await html2canvas(cardNode, {
          backgroundColor: null,
          scale: Math.min(window.devicePixelRatio || 1.5, 2),
          useCORS: true,
        });
        const link = document.createElement('a');
        link.download = `${card.slug || 'business-card'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } finally {
        saveButton.disabled = false;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    if (document.getElementById('hub-grid')) {
      await initHubPage();
      return;
    }

    if (document.getElementById('card-root')) {
      await initCardPage();
    }
  } catch (error) {
    if (document.getElementById('card-root')) {
      renderCardNotFound();
      return;
    }

    const grid = document.getElementById('hub-grid');
    if (grid) {
      grid.innerHTML = '<p class="hub-item-desc">Unable to load card data.</p>';
    }
  }
});
