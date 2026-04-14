import { createToken, verifyToken, verifyPassword, hashPassword } from './auth.js';
import { getUser, setUser, getProducts, getProduct, updateProduct } from './storage.js';

// --- Helpers ---

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function setAuthCookie(token, maxAge = 86400) {
  // SameSite=None required for cross-origin cookies (admin pages on different domain than API)
  return `admin_token=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

function clearAuthCookie() {
  return 'admin_token=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0';
}

function corsHeaders(env, request) {
  const origin = request ? (request.headers.get('Origin') || '') : '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
  // Allow the requesting origin if it's in our allowed list, or fall back to first allowed
  const matchedOrigin = allowed.find(a => a === origin) || allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// --- Rate Limiting ---

async function checkRateLimit(kv, ip) {
  const key = `login_rate:${ip}`;
  const data = await kv.get(key, { type: 'json' });
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour

  if (!data) return { allowed: true, remaining: 4 };

  // Filter attempts within the window
  const recent = data.attempts.filter(t => now - t < windowMs);
  if (recent.length >= 5) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: 4 - recent.length };
}

async function recordLoginAttempt(kv, ip) {
  const key = `login_rate:${ip}`;
  const data = await kv.get(key, { type: 'json' });
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  let attempts = data ? data.attempts.filter(t => now - t < windowMs) : [];
  attempts.push(now);

  // Store with 1-hour TTL
  await kv.put(key, JSON.stringify({ attempts }), { expirationTtl: 3600 });
}

// --- Auth Middleware ---

async function requireAuth(request, env) {
  const token = getCookie(request, 'admin_token');
  if (!token) return null;
  const payload = await verifyToken(env, token);
  return payload; // null if invalid/expired
}

// --- Route Handlers ---

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Rate limit check
  const rateCheck = await checkRateLimit(env.ADMIN_KV, ip);
  if (!rateCheck.allowed) {
    return errorResponse('Too many login attempts. Try again in 1 hour.', 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { email, password } = body;
  if (!email || !password) {
    return errorResponse('Email and password are required');
  }

  const user = await getUser(env.ADMIN_KV, email);
  if (!user) {
    await recordLoginAttempt(env.ADMIN_KV, ip);
    return errorResponse('Invalid credentials', 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginAttempt(env.ADMIN_KV, ip);
    return errorResponse('Invalid credentials', 401);
  }

  const token = await createToken(env, {
    sub: email,
    role: user.role || 'editor',
  });

  return jsonResponse(
    { ok: true, email, role: user.role || 'editor' },
    200,
    { 'Set-Cookie': setAuthCookie(token) }
  );
}

async function handleLogout() {
  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': clearAuthCookie() }
  );
}

async function handleMe(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);
  return jsonResponse({ email: payload.sub, role: payload.role });
}

async function handleGetProducts(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);
  const products = await getProducts(env.ADMIN_KV);
  return jsonResponse({ products });
}

async function handleGetProduct(request, env, slug) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);
  const product = await getProduct(env.ADMIN_KV, slug);
  if (!product) return errorResponse('Product not found', 404);
  return jsonResponse({ product });
}

async function handleUpdateProduct(request, env, slug) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);

  let updates;
  try {
    updates = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const product = await updateProduct(env.ADMIN_KV, slug, updates);
  if (!product) return errorResponse('Product not found', 404);
  return jsonResponse({ product });
}

async function handleGetSubmissions(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);

  // List all submission keys from KV
  // Submissions are stored in the SUBMISSIONS KV namespace if bound,
  // otherwise fall back to ADMIN_KV with submission_ prefix
  const kv = env.SUBMISSIONS || env.ADMIN_KV;
  const submissions = [];

  try {
    let cursor = null;
    do {
      const listOpts = { prefix: 'submission_', limit: 100 };
      if (cursor) listOpts.cursor = cursor;
      const result = await kv.list(listOpts);
      for (const key of result.keys) {
        const data = await kv.get(key.name, { type: 'json' });
        if (data) {
          submissions.push({ id: key.name, ...data });
        }
      }
      cursor = result.list_complete ? null : result.cursor;
    } while (cursor);
  } catch (err) {
    console.error('Failed to load submissions:', err);
  }

  // Sort newest first
  submissions.sort((a, b) => {
    const da = new Date(a.submittedAt || a.timestamp || 0);
    const db = new Date(b.submittedAt || b.timestamp || 0);
    return db - da;
  });

  return jsonResponse({ submissions });
}

async function handleRebuild(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return errorResponse('Unauthorized', 401);

  if (!env.DEPLOY_HOOK_URL) {
    return errorResponse('Deploy hook not configured', 500);
  }

  try {
    const resp = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
    if (!resp.ok) {
      return errorResponse(`Deploy hook returned ${resp.status}`, 502);
    }
    return jsonResponse({ ok: true, message: 'Rebuild triggered' });
  } catch (err) {
    return errorResponse(`Failed to trigger rebuild: ${err.message}`, 502);
  }
}

async function handleSetup(request, env) {
  // Protected by SETUP_KEY — only for initial user creation
  if (!env.SETUP_KEY) {
    return errorResponse('Setup endpoint is disabled', 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { setupKey, email, password, role } = body;
  if (!setupKey || setupKey !== env.SETUP_KEY) {
    return errorResponse('Invalid setup key', 403);
  }
  if (!email || !password) {
    return errorResponse('Email and password are required');
  }
  if (role && !['admin', 'editor'].includes(role)) {
    return errorResponse('Role must be "admin" or "editor"');
  }

  const passwordHash = await hashPassword(password);
  await setUser(env.ADMIN_KV, email, {
    email,
    passwordHash,
    role: role || 'editor',
    createdAt: new Date().toISOString(),
  });

  return jsonResponse({ ok: true, email, role: role || 'editor' }, 201);
}

// --- Router ---

function matchRoute(method, pathname) {
  // POST /api/admin/login
  if (method === 'POST' && pathname === '/api/admin/login') return { handler: 'login' };
  // POST /api/admin/logout
  if (method === 'POST' && pathname === '/api/admin/logout') return { handler: 'logout' };
  // GET /api/admin/me
  if (method === 'GET' && pathname === '/api/admin/me') return { handler: 'me' };
  // GET /api/admin/products
  if (method === 'GET' && pathname === '/api/admin/products') return { handler: 'listProducts' };
  // GET /api/admin/products/:slug
  if (method === 'GET' && pathname.startsWith('/api/admin/products/')) {
    const slug = pathname.replace('/api/admin/products/', '');
    if (slug && !slug.includes('/')) return { handler: 'getProduct', slug };
  }
  // PUT /api/admin/products/:slug
  if (method === 'PUT' && pathname.startsWith('/api/admin/products/')) {
    const slug = pathname.replace('/api/admin/products/', '');
    if (slug && !slug.includes('/')) return { handler: 'updateProduct', slug };
  }
  // GET /api/admin/submissions
  if (method === 'GET' && pathname === '/api/admin/submissions') return { handler: 'listSubmissions' };
  // POST /api/admin/rebuild
  if (method === 'POST' && pathname === '/api/admin/rebuild') return { handler: 'rebuild' };
  // POST /api/admin/setup
  if (method === 'POST' && pathname === '/api/admin/setup') return { handler: 'setup' };

  return null;
}

// --- Main Export ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const route = matchRoute(request.method, url.pathname);
    if (!route) {
      const resp = errorResponse('Not found', 404);
      // Add CORS headers
      for (const [k, v] of Object.entries(cors)) resp.headers.set(k, v);
      return resp;
    }

    let response;
    try {
      switch (route.handler) {
        case 'login':
          response = await handleLogin(request, env);
          break;
        case 'logout':
          response = await handleLogout();
          break;
        case 'me':
          response = await handleMe(request, env);
          break;
        case 'listProducts':
          response = await handleGetProducts(request, env);
          break;
        case 'getProduct':
          response = await handleGetProduct(request, env, route.slug);
          break;
        case 'updateProduct':
          response = await handleUpdateProduct(request, env, route.slug);
          break;
        case 'listSubmissions':
          response = await handleGetSubmissions(request, env);
          break;
        case 'rebuild':
          response = await handleRebuild(request, env);
          break;
        case 'setup':
          response = await handleSetup(request, env);
          break;
        default:
          response = errorResponse('Not found', 404);
      }
    } catch (err) {
      console.error('Unhandled error:', err);
      response = errorResponse('Internal server error', 500);
    }

    // Add CORS headers to all responses
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  },
};
