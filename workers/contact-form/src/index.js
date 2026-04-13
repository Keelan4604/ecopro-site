/**
 * EcoPro USA — Contact Form Worker
 *
 * Receives form submissions via POST, validates, routes email by department,
 * stores submission in KV, and returns JSON response.
 *
 * Secrets (set via `wrangler secret put`):
 *   RESEND_API_KEY — Resend.com API key
 *
 * KV Namespace:
 *   SUBMISSIONS — stores form submissions for records
 */

// Email routing by subject/department
const EMAIL_ROUTING = {
  quote:     'sales@ecoprousa.com',
  product:   'sales@ecoprousa.com',
  technical: 'technical@ecoprousa.com',
  order:     'customerservice@ecoprousa.com',
  billing:   'accounting@ecoprousa.com',
  other:     'controller@ecoprousa.com',
};

const SUBJECT_LABELS = {
  quote:     'Quote Request',
  product:   'Product Inquiry',
  technical: 'Technical Support',
  order:     'Order / Service',
  billing:   'Billing / Accounting',
  other:     'General Inquiry',
};

// Rate limiting: max submissions per IP per hour
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(env, new Response(null, { status: 204 }));
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return corsResponse(env, jsonResponse({ error: 'Method not allowed' }, 405));
    }

    try {
      const body = await request.json();

      // Honeypot check — if the hidden field has a value, it's a bot
      if (body.website_url) {
        // Silently accept to not tip off bots
        return corsResponse(env, jsonResponse({ success: true, message: 'Thank you! We\'ll be in touch soon.' }));
      }

      // Validate required fields
      const errors = validate(body);
      if (errors.length > 0) {
        return corsResponse(env, jsonResponse({ error: 'Validation failed', details: errors }, 400));
      }

      // Rate limiting
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (env.SUBMISSIONS) {
        const rateLimited = await checkRateLimit(env.SUBMISSIONS, clientIP);
        if (rateLimited) {
          return corsResponse(env, jsonResponse({ error: 'Too many submissions. Please try again later.' }, 429));
        }
      }

      // Determine recipient
      const subject = body.subject || 'other';
      const toEmail = EMAIL_ROUTING[subject] || EMAIL_ROUTING.other;
      const subjectLabel = SUBJECT_LABELS[subject] || 'General Inquiry';

      // Build email
      const emailSubject = `[EcoPro Website] ${subjectLabel} from ${body.firstName} ${body.lastName}`;
      const emailHtml = buildEmailHtml(body, subjectLabel);

      // Send via Resend
      if (env.RESEND_API_KEY) {
        const sendResult = await sendEmail(env, {
          to: toEmail,
          replyTo: body.email,
          subject: emailSubject,
          html: emailHtml,
        });

        if (!sendResult.ok) {
          console.error('Email send failed:', sendResult.error);
          return corsResponse(env, jsonResponse({ error: 'Failed to send message. Please call us at 855-ECO-PRO2.' }, 500));
        }
      } else {
        console.log('RESEND_API_KEY not set — skipping email send. Submission:', JSON.stringify(body));
      }

      // Store submission in KV
      if (env.SUBMISSIONS) {
        const id = `submission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await env.SUBMISSIONS.put(id, JSON.stringify({
          ...body,
          submittedAt: new Date().toISOString(),
          routedTo: toEmail,
          ip: clientIP,
        }), { expirationTtl: 60 * 60 * 24 * 90 }); // 90 days
      }

      return corsResponse(env, jsonResponse({
        success: true,
        message: 'Thank you! We\'ll be in touch within one business day.',
      }));
    } catch (err) {
      console.error('Worker error:', err);
      return corsResponse(env, jsonResponse({ error: 'Something went wrong. Please call us at 855-ECO-PRO2.' }, 500));
    }
  },
};

// --- Validation ---

function validate(body) {
  const errors = [];
  if (!body.firstName || body.firstName.trim().length < 1) errors.push('First name is required');
  if (!body.lastName || body.lastName.trim().length < 1) errors.push('Last name is required');
  if (!body.email || !isValidEmail(body.email)) errors.push('Valid email is required');
  if (!body.phone || body.phone.replace(/\D/g, '').length < 7) errors.push('Valid phone number is required');
  if (!body.company || body.company.trim().length < 1) errors.push('Company name is required');
  if (!body.message || body.message.trim().length < 5) errors.push('Message is required (min 5 characters)');

  // Length limits to prevent abuse
  if (body.firstName && body.firstName.length > 100) errors.push('First name too long');
  if (body.lastName && body.lastName.length > 100) errors.push('Last name too long');
  if (body.email && body.email.length > 254) errors.push('Email too long');
  if (body.message && body.message.length > 5000) errors.push('Message too long (max 5000 characters)');

  return errors;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Rate Limiting ---

async function checkRateLimit(kv, ip) {
  const key = `rate_${ip}`;
  const existing = await kv.get(key, 'json');
  const now = Date.now();

  if (!existing) {
    await kv.put(key, JSON.stringify({ count: 1, start: now }), { expirationTtl: 3600 });
    return false;
  }

  if (now - existing.start > RATE_WINDOW_MS) {
    await kv.put(key, JSON.stringify({ count: 1, start: now }), { expirationTtl: 3600 });
    return false;
  }

  if (existing.count >= RATE_LIMIT) {
    return true;
  }

  await kv.put(key, JSON.stringify({ count: existing.count + 1, start: existing.start }), { expirationTtl: 3600 });
  return false;
}

// --- Email ---

async function sendEmail(env, { to, replyTo, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
      to: [to],
      reply_to: replyTo,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text };
  }
  return { ok: true };
}

function buildEmailHtml(body, subjectLabel) {
  const products = Array.isArray(body.products) && body.products.length > 0
    ? body.products.join(', ')
    : 'None specified';

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#0a1e3d;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">New ${escapeHtml(subjectLabel)}</h2>
        <p style="margin:4px 0 0;opacity:0.8;font-size:13px;">EcoPro USA Website Contact Form</p>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 12px;font-weight:600;color:#555;width:130px;">Name</td><td style="padding:8px 12px;">${escapeHtml(body.firstName)} ${escapeHtml(body.lastName)}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-weight:600;color:#555;">Email</td><td style="padding:8px 12px;"><a href="mailto:${escapeHtml(body.email)}">${escapeHtml(body.email)}</a></td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#555;">Phone</td><td style="padding:8px 12px;"><a href="tel:${escapeHtml(body.phone)}">${escapeHtml(body.phone)}</a></td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-weight:600;color:#555;">Company</td><td style="padding:8px 12px;">${escapeHtml(body.company)}</td></tr>
          ${body.website ? `<tr><td style="padding:8px 12px;font-weight:600;color:#555;">Website</td><td style="padding:8px 12px;"><a href="${escapeHtml(body.website)}">${escapeHtml(body.website)}</a></td></tr>` : ''}
          <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-weight:600;color:#555;">Department</td><td style="padding:8px 12px;">${escapeHtml(subjectLabel)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#555;">Products</td><td style="padding:8px 12px;">${escapeHtml(products)}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#f3f4f6;border-radius:6px;">
          <p style="margin:0 0 4px;font-weight:600;color:#555;font-size:13px;">Message:</p>
          <p style="margin:0;white-space:pre-wrap;line-height:1.6;">${escapeHtml(body.message)}</p>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#999;">Submitted via ecoprousa.com contact form</p>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Helpers ---

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsResponse(env, response) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
