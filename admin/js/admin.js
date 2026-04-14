/* ============================================
   EcoPro USA — Admin Panel JavaScript
   ============================================ */

const API_BASE = 'https://ecopro-admin-api.keelan4604.workers.dev';

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
  const emailEl = document.querySelector('.user-email');
  if (emailEl && user.email) {
    emailEl.textContent = user.email;
  }
  return user;
}

// ---- Login ----
function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

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
  const btn = document.querySelector('.btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      // proceed regardless
    }
    window.location.href = 'index.html';
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
  loadDashboardStats();

  // Rebuild button
  const rebuildBtn = document.getElementById('btn-rebuild');
  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', handleRebuild);
  }
}

async function loadDashboardStats() {
  try {
    const data = await api('/api/admin/products');
    const products = data.products || [];

    const total = products.length;
    const active = products.filter(p => p.status === 'active').length;
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))].length;

    setStatValue('stat-total', total);
    setStatValue('stat-active', active);
    setStatValue('stat-categories', categories);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function setStatValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function handleRebuild() {
  const btn = document.getElementById('btn-rebuild');
  if (!btn) return;

  btn.classList.add('loading');
  btn.disabled = true;

  try {
    await api('/api/admin/rebuild', { method: 'POST' });
    toast('Site rebuild triggered successfully!', 'success');
  } catch (err) {
    toast('Rebuild failed: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ---- Products ----
let allProducts = [];
let currentProduct = null;

async function initProducts() {
  const user = await requireAuth();
  if (!user) return;

  initLogout();
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
    renderProductList(allProducts);
  } catch (err) {
    listEl.innerHTML = `<li class="product-list-empty">Failed to load products: ${err.message}</li>`;
  }
}

function renderProductList(products) {
  const listEl = document.getElementById('product-list');
  if (!listEl) return;

  if (products.length === 0) {
    listEl.innerHTML = '<li class="product-list-empty">No products found</li>';
    return;
  }

  listEl.innerHTML = products.map(p => `
    <li class="product-list-item${currentProduct && currentProduct.slug === p.slug ? ' active' : ''}"
        data-slug="${p.slug}">
      <div class="product-name">${escapeHtml(p.name)}</div>
      <div class="product-meta">
        <span>${escapeHtml(p.category || 'Uncategorized')}</span>
        <span class="badge ${p.status === 'active' ? 'badge-active' : 'badge-inactive'}">
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

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) {
      renderProductList(allProducts);
      return;
    }
    const filtered = allProducts.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.slug && p.slug.toLowerCase().includes(q))
    );
    renderProductList(filtered);
  });
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

  // Update editor title
  const titleEl = document.getElementById('editor-title');
  if (titleEl) titleEl.textContent = product.name;

  // Fill form
  fillProductForm(product);
}

function fillProductForm(p) {
  setFieldValue('field-name', p.name || '');
  setFieldValue('field-slug', p.slug || '');
  setFieldValue('field-category', p.category || '');
  setFieldValue('field-subcategory', p.subcategory || '');
  setFieldValue('field-status', p.status || 'active');
  setFieldValue('field-shortDescription', p.shortDescription || '');
  setFieldValue('field-description', p.description || '');
  setFieldValue('field-tags', Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''));
  setFieldValue('field-sku', p.sku || '');

  // Specs tab
  const specsEl = document.getElementById('field-specs');
  if (specsEl) {
    if (p.specs && typeof p.specs === 'object') {
      specsEl.value = JSON.stringify(p.specs, null, 2);
    } else {
      specsEl.value = '';
    }
  }

  // Images tab
  const imagesEl = document.getElementById('field-images');
  if (imagesEl) {
    const imgs = p.images || [];
    imagesEl.value = Array.isArray(imgs) ? imgs.join('\n') : '';
  }

  // PDFs tab
  const pdfsEl = document.getElementById('field-pdfs');
  if (pdfsEl) {
    const pdfs = p.pdfs || p.documents || [];
    if (Array.isArray(pdfs)) {
      pdfsEl.value = pdfs.map(d => typeof d === 'string' ? d : `${d.name || ''}|${d.url || ''}`).join('\n');
    } else {
      pdfsEl.value = '';
    }
  }
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
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

    const btn = form.querySelector('.btn-save');
    btn.classList.add('loading');
    btn.disabled = true;

    const payload = {
      name: getFieldValue('field-name'),
      slug: getFieldValue('field-slug'),
      category: getFieldValue('field-category'),
      subcategory: getFieldValue('field-subcategory'),
      status: getFieldValue('field-status'),
      shortDescription: getFieldValue('field-shortDescription'),
      description: getFieldValue('field-description'),
      tags: getFieldValue('field-tags').split(',').map(t => t.trim()).filter(Boolean),
      sku: getFieldValue('field-sku'),
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
        return;
      }
    }

    // Images
    const imagesRaw = getFieldValue('field-images');
    if (imagesRaw.trim()) {
      payload.images = imagesRaw.split('\n').map(s => s.trim()).filter(Boolean);
    }

    // PDFs
    const pdfsRaw = getFieldValue('field-pdfs');
    if (pdfsRaw.trim()) {
      payload.pdfs = pdfsRaw.split('\n').map(line => {
        const parts = line.trim().split('|');
        if (parts.length >= 2) {
          return { name: parts[0].trim(), url: parts[1].trim() };
        }
        return { name: '', url: parts[0].trim() };
      }).filter(d => d.url);
    }

    try {
      await api(`/api/admin/products/${currentProduct.slug}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast('Product saved successfully!', 'success');

      // Update local data
      const idx = allProducts.findIndex(p => p.slug === currentProduct.slug);
      if (idx !== -1) {
        allProducts[idx] = { ...allProducts[idx], ...payload };
        currentProduct = allProducts[idx];
        renderProductList(allProducts);
      }
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

function getFieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// ---- Utilities ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  }
});
