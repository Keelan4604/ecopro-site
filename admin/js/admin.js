/* ============================================
   EcoPro USA — Admin Panel JavaScript
   ============================================ */

const API_BASE = 'https://ecopro-admin-api.keelan4604.workers.dev';
const CONTACT_API = 'https://ecopro-contact-form.keelan4604.workers.dev';

// ---- API Helper ----
async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ---- Auth ----
async function checkAuth() {
  try {
    const data = await api('/api/admin/me');
    return data;
  } catch {
    return null;
  }
}

async function requireAuth() {
  const user = await checkAuth();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  // Populate user email in header
  document.querySelectorAll('.user-email').forEach(el => {
    el.textContent = user.email;
  });
  return user;
}

// ---- Login ----
function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  // If already logged in, redirect to dashboard
  checkAuth().then(user => {
    if (user) window.location.href = 'dashboard.html';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const errorEl = document.getElementById('login-error');

    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;

    if (!email || !password) {
      showLoginError(errorEl, 'Please enter both email and password.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    hideLoginError(errorEl);

    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      window.location.href = 'dashboard.html';
    } catch (err) {
      showLoginError(errorEl, err.message);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

function showLoginError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

function hideLoginError(el) {
  if (!el) return;
  el.classList.remove('visible');
}

// ---- Logout ----
function initLogout() {
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/admin/logout', { method: 'POST' });
      } catch {
        // proceed regardless
      }
      window.location.href = 'index.html';
    });
  });
}

// ---- Rebuild ----
function initRebuild() {
  const btns = [document.getElementById('btn-rebuild'), document.getElementById('nav-rebuild')];
  btns.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const mainBtn = document.getElementById('btn-rebuild') || btn;
      mainBtn.classList.add('loading');
      if (mainBtn.disabled !== undefined) mainBtn.disabled = true;

      try {
        await api('/api/admin/rebuild', { method: 'POST' });
        toast('Site rebuild triggered!', 'success');
      } catch (err) {
        toast('Rebuild failed: ' + err.message, 'error');
      } finally {
        mainBtn.classList.remove('loading');
        if (mainBtn.disabled !== undefined) mainBtn.disabled = false;
      }
    });
  });
}

// ---- Toast Notifications ----
function toast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '\u2713' : type === 'error' ? '\u2717' : '\u26A0';
  el.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ---- Dashboard ----
async function initDashboard() {
  const user = await requireAuth();
  if (!user) return;

  initLogout();
  initRebuild();

  // Set welcome message
  const welcomeEl = document.getElementById('welcome-msg');
  if (welcomeEl && user.email) {
    const name = user.email.split('@')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    welcomeEl.textContent = `${greeting}, ${name}`;
  }

  loadDashboardStats();
}

async function loadDashboardStats() {
  try {
    const data = await api('/api/admin/products');
    const products = data.products || [];

    const total = products.length;
    const active = products.filter(p => p.status === 'active' || !p.status).length;
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))].length;

    animateStat('stat-total', total);
    animateStat('stat-active', active);
    animateStat('stat-categories', categories);
  } catch (err) {
    console.error('Failed to load stats:', err);
    setStatValue('stat-total', '!');
    setStatValue('stat-active', '!');
    setStatValue('stat-categories', '!');
  }

  // Load submission count
  setStatValue('stat-submissions', '—');
}

function animateStat(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  if (target === 0) { el.textContent = '0'; return; }

  let current = 0;
  const step = Math.max(1, Math.floor(target / 20));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    el.textContent = current;
  }, 30);
}

function setStatValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ---- Products ----
let allProducts = [];
let currentProduct = null;
let categorySet = new Set();

async function initProducts() {
  const user = await requireAuth();
  if (!user) return;

  initLogout();
  initRebuild();
  await loadProductList();
  initProductSearch();
  initEditorTabs();
  initProductForm();
}

async function loadProductList() {
  const listEl = document.getElementById('product-list');
  if (!listEl) return;

  listEl.innerHTML = '<li class="product-list-empty">Loading products...</li>';

  try {
    const data = await api('/api/admin/products');
    allProducts = data.products || [];

    // Update count
    const countEl = document.getElementById('product-count');
    if (countEl) countEl.textContent = allProducts.length;

    // Build category filters
    categorySet = new Set(allProducts.map(p => p.category).filter(Boolean));
    buildCategoryFilters();

    renderProductList(allProducts);
  } catch (err) {
    listEl.innerHTML = `<li class="product-list-empty">Failed to load: ${err.message}</li>`;
  }
}

function buildCategoryFilters() {
  const bar = document.getElementById('product-filters');
  if (!bar) return;

  const cats = [...categorySet].sort();
  bar.innerHTML = `<button class="filter-chip active" data-filter="all">All</button>` +
    cats.map(c => `<button class="filter-chip" data-filter="${escapeHtml(c)}">${escapeHtml(formatCategory(c))}</button>`).join('');

  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFilters();
    });
  });
}

function formatCategory(cat) {
  return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function applyFilters() {
  const activeFilter = document.querySelector('.filter-chip.active');
  const filter = activeFilter ? activeFilter.dataset.filter : 'all';
  const query = (document.getElementById('product-search')?.value || '').toLowerCase().trim();

  let filtered = allProducts;
  if (filter !== 'all') {
    filtered = filtered.filter(p => p.category === filter);
  }
  if (query) {
    filtered = filtered.filter(p =>
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.slug && p.slug.toLowerCase().includes(query)) ||
      (p.shortName && p.shortName.toLowerCase().includes(query))
    );
  }
  renderProductList(filtered);
}

function renderProductList(products) {
  const listEl = document.getElementById('product-list');
  if (!listEl) return;

  // Update count for filtered
  const countEl = document.getElementById('product-count');
  if (countEl) countEl.textContent = products.length;

  if (products.length === 0) {
    listEl.innerHTML = '<li class="product-list-empty">No products found</li>';
    return;
  }

  listEl.innerHTML = products.map(p => `
    <li class="product-list-item${currentProduct && currentProduct.slug === p.slug ? ' active' : ''}"
        data-slug="${escapeAttr(p.slug)}">
      <div class="product-name">${escapeHtml(p.name || p.slug)}</div>
      <div class="product-meta">
        <span>${escapeHtml(formatCategory(p.category || 'uncategorized'))}</span>
        <span class="badge ${(p.status || 'active') === 'active' ? 'badge-active' : 'badge-inactive'}">
          ${p.status || 'active'}
        </span>
      </div>
    </li>
  `).join('');

  // Bind click events
  listEl.querySelectorAll('.product-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const slug = item.dataset.slug;
      const product = allProducts.find(p => p.slug === slug);
      if (product) selectProduct(product);
    });
  });
}

function initProductSearch() {
  const input = document.getElementById('product-search');
  if (!input) return;
  input.addEventListener('input', applyFilters);
}

function selectProduct(product) {
  currentProduct = product;

  // Highlight in list
  document.querySelectorAll('.product-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.slug === product.slug);
  });

  // Show editor
  const placeholder = document.getElementById('editor-placeholder');
  const editor = document.getElementById('editor-form-area');
  if (placeholder) placeholder.style.display = 'none';
  if (editor) editor.style.display = 'block';

  // Update editor header
  const titleEl = document.getElementById('editor-title');
  const slugEl = document.getElementById('editor-slug');
  if (titleEl) titleEl.textContent = product.name || product.slug;
  if (slugEl) slugEl.textContent = '/' + product.slug;

  // Reset to first tab
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const firstTab = document.querySelector('.editor-tab');
  const firstPanel = document.getElementById('tab-basic');
  if (firstTab) firstTab.classList.add('active');
  if (firstPanel) firstPanel.classList.add('active');

  // Clear save status
  const statusEl = document.getElementById('save-status');
  if (statusEl) statusEl.textContent = '';

  // Fill form
  fillProductForm(product);
}

function fillProductForm(p) {
  // Basic Info
  setFieldValue('field-name', p.name || '');
  setFieldValue('field-shortName', p.shortName || '');
  setFieldValue('field-category', p.category || '');
  setFieldValue('field-status', p.status || 'active');
  setFieldValue('field-tagline', p.tagline || '');
  setFieldValue('field-shortDescription', p.shortDescription || '');

  // Description
  const desc = p.description || {};
  if (typeof desc === 'string') {
    setFieldValue('field-summary', desc);
    setFieldValue('field-extended', '');
    setFieldValue('field-features', '');
  } else {
    setFieldValue('field-summary', desc.summary || '');
    setFieldValue('field-extended', desc.extended || '');
    setFieldValue('field-features', Array.isArray(desc.features) ? desc.features.join('\n') : '');
  }

  // Specs & Tags
  const specsEl = document.getElementById('field-specs');
  if (specsEl) {
    if (p.specs && typeof p.specs === 'object') {
      specsEl.value = JSON.stringify(p.specs, null, 2);
    } else {
      specsEl.value = '';
    }
  }

  setFieldValue('field-tags', Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''));
  setFieldValue('field-machineModels', Array.isArray(p.machineModels) ? p.machineModels.join(', ') : (p.machineModels || ''));

  const partsEl = document.getElementById('field-partNumbers');
  if (partsEl) {
    if (p.partNumbers && Array.isArray(p.partNumbers)) {
      partsEl.value = JSON.stringify(p.partNumbers, null, 2);
    } else {
      partsEl.value = '';
    }
  }

  // Media
  const images = p.images || {};
  setFieldValue('field-mainImage', typeof images === 'string' ? images : (images.main || ''));
  const gallery = images.gallery || [];
  setFieldValue('field-gallery', Array.isArray(gallery) ? gallery.join('\n') : '');

  const pdfs = p.pdfs || p.documents || [];
  const pdfsEl = document.getElementById('field-pdfs');
  if (pdfsEl) {
    if (Array.isArray(pdfs)) {
      pdfsEl.value = pdfs.map(d => typeof d === 'string' ? d : `${d.name || ''}|${d.file || d.url || ''}`).join('\n');
    } else {
      pdfsEl.value = '';
    }
  }

  const videos = p.videos || [];
  setFieldValue('field-videos', Array.isArray(videos) ? videos.join('\n') : '');
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getFieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function initEditorTabs() {
  document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(`tab-${target}`);
      if (panel) panel.classList.add('active');
    });
  });
}

function initProductForm() {
  const form = document.getElementById('product-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentProduct) return;

    const btn = form.querySelector('.btn-primary');
    btn.classList.add('loading');
    btn.disabled = true;

    const statusEl = document.getElementById('save-status');
    if (statusEl) statusEl.textContent = 'Saving...';

    const payload = {
      name: getFieldValue('field-name'),
      shortName: getFieldValue('field-shortName'),
      category: getFieldValue('field-category'),
      status: getFieldValue('field-status'),
      tagline: getFieldValue('field-tagline'),
      shortDescription: getFieldValue('field-shortDescription'),
    };

    // Description
    payload.description = {
      summary: getFieldValue('field-summary'),
      extended: getFieldValue('field-extended'),
      features: getFieldValue('field-features').split('\n').map(s => s.trim()).filter(Boolean),
    };

    // Specs
    const specsRaw = getFieldValue('field-specs');
    if (specsRaw.trim()) {
      try {
        payload.specs = JSON.parse(specsRaw);
      } catch {
        toast('Invalid JSON in Specs field', 'error');
        btn.classList.remove('loading');
        btn.disabled = false;
        if (statusEl) statusEl.textContent = 'Fix errors and try again';
        return;
      }
    }

    // Tags
    payload.tags = getFieldValue('field-tags').split(',').map(t => t.trim()).filter(Boolean);
    payload.machineModels = getFieldValue('field-machineModels').split(',').map(t => t.trim()).filter(Boolean);

    // Part Numbers
    const partsRaw = getFieldValue('field-partNumbers');
    if (partsRaw.trim()) {
      try {
        payload.partNumbers = JSON.parse(partsRaw);
      } catch {
        toast('Invalid JSON in Part Numbers field', 'error');
        btn.classList.remove('loading');
        btn.disabled = false;
        if (statusEl) statusEl.textContent = 'Fix errors and try again';
        return;
      }
    }

    // Media
    payload.images = {
      main: getFieldValue('field-mainImage'),
      gallery: getFieldValue('field-gallery').split('\n').map(s => s.trim()).filter(Boolean),
    };

    const pdfsRaw = getFieldValue('field-pdfs');
    if (pdfsRaw.trim()) {
      payload.pdfs = pdfsRaw.split('\n').map(line => {
        const parts = line.trim().split('|');
        if (parts.length >= 2) {
          return { name: parts[0].trim(), file: parts[1].trim() };
        }
        return { name: '', file: parts[0].trim() };
      }).filter(d => d.file);
    }

    payload.videos = getFieldValue('field-videos').split('\n').map(s => s.trim()).filter(Boolean);

    try {
      await api(`/api/admin/products/${currentProduct.slug}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast('Product saved!', 'success');
      if (statusEl) statusEl.textContent = 'Saved just now';

      // Update local data
      const idx = allProducts.findIndex(p => p.slug === currentProduct.slug);
      if (idx !== -1) {
        allProducts[idx] = { ...allProducts[idx], ...payload };
        currentProduct = allProducts[idx];
        renderProductList(allProducts);
      }
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
      if (statusEl) statusEl.textContent = 'Save failed';
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

// ---- Submissions ----
async function initSubmissions() {
  const user = await requireAuth();
  if (!user) return;

  initLogout();
  initRebuild();
  loadSubmissions();

  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadSubmissions);
  }

  // Modal close
  const modalClose = document.getElementById('modal-close');
  const modal = document.getElementById('submission-modal');
  if (modalClose && modal) {
    modalClose.addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('visible');
    });
  }
}

async function loadSubmissions() {
  const container = document.getElementById('submissions-container');
  if (!container) return;

  container.innerHTML = `<div class="empty-state"><p>Loading submissions...</p></div>`;

  try {
    // Try to fetch submissions from the admin API
    const data = await api('/api/admin/submissions');
    const submissions = data.submissions || [];

    if (submissions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#9993;</div>
          <p>No submissions yet. Contact form submissions from the website will appear here.</p>
        </div>`;
      return;
    }

    renderSubmissions(container, submissions);
  } catch (err) {
    // If submissions endpoint doesn't exist yet, show a friendly message
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9993;</div>
        <p>Submissions viewer ready. Form submissions will appear here once the contact form is configured.</p>
      </div>`;
  }
}

function renderSubmissions(container, submissions) {
  container.innerHTML = `
    <table class="submissions-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Subject</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${submissions.map(s => `
          <tr data-id="${escapeAttr(s.id || '')}">
            <td>
              <span class="sub-name">${escapeHtml((s.firstName || '') + ' ' + (s.lastName || ''))}</span>
              <br><span class="sub-company">${escapeHtml(s.company || '')}</span>
            </td>
            <td>${escapeHtml(s.email || '')}</td>
            <td>${escapeHtml(s.subject || 'General')}</td>
            <td><span class="sub-date">${formatDate(s.submittedAt || s.timestamp)}</span></td>
            <td><button class="btn btn-outline btn-sm view-sub" data-id="${escapeAttr(s.id || '')}">View</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  container.querySelectorAll('.view-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const sub = submissions.find(s => (s.id || '') === id);
      if (sub) showSubmissionDetail(sub);
    });
  });
}

function showSubmissionDetail(sub) {
  const modal = document.getElementById('submission-modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;

  const fields = [
    ['Name', (sub.firstName || '') + ' ' + (sub.lastName || '')],
    ['Email', sub.email || ''],
    ['Phone', sub.phone || ''],
    ['Company', sub.company || ''],
    ['Website', sub.website || ''],
    ['Subject', sub.subject || 'General'],
    ['Products', Array.isArray(sub.products) ? sub.products.join(', ') : (sub.products || '')],
    ['Message', sub.message || ''],
    ['Date', formatDate(sub.submittedAt || sub.timestamp)],
  ].filter(([, v]) => v);

  body.innerHTML = fields.map(([label, value]) => `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${escapeHtml(value)}</div>
    </div>
  `).join('');

  modal.classList.add('visible');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ---- Utilities ----
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Page Init ----
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  switch (page) {
    case 'login':
      initLogin();
      break;
    case 'dashboard':
      initDashboard();
      break;
    case 'products':
      initProducts();
      break;
    case 'submissions':
      initSubmissions();
      break;
  }
});
