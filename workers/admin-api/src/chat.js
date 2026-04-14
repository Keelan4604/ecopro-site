/**
 * EcoPro USA — AI Chat Handler
 * Integrates with Anthropic API to let admin users manage the site via chat.
 * Claude has tools to read/update products, view submissions, and trigger rebuilds.
 */

import { getProducts, getProduct, updateProduct } from './storage.js';

// ---------------------------------------------------------------------------
// System Prompt — all context the AI needs about the site
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the EcoPro USA Site Assistant — a friendly, capable AI that helps manage the EcoPro USA website through conversation.

## About EcoPro USA
EcoPro USA is a heavy equipment products company based in Tempe, AZ (2443 W 12th St, Tempe, AZ 85281).
Phone: 855-ECO-PRO2 (855-326-7762). Website: ecoprousa.com (demo at ecopro.keelanodoherty.org).

They sell industrial-grade filtration, lighting, and protection products that reduce costs, extend equipment life, and keep operators safe — without voiding warranties. They work exclusively for the end user, not the manufacturer. Every product is rigorously tested and validated in real-world conditions.

## Website Architecture
- Static site built with a custom Node.js build system (Handlebars-like templates)
- Deployed on Cloudflare Workers with Static Assets
- GitHub: https://github.com/Keelan4604/ecopro-site
- Admin panel at /admin/ with JWT-based authentication
- Contact form submissions stored in Cloudflare KV
- Products stored in Cloudflare KV (synced from Google Sheet)

## Product Categories (7 main categories, ~152 products)
1. **Air Filtration (Turbo II HD)** — Centrifugal pre-cleaners with 40+ years of proven performance. Removes 80-90% of debris before the primary filter. Extends filter life 3-5x. No moving parts. Kits available for CAT equipment: D6T, D6R, D7E, D7R, D8T, D8R, D9T, D9R, D10T, D10R, D11T, D11R, 816, 826H, 826K, 836H, 836K, 938, 950, 966, 972, 980, 988, 320, 323, 330, 336. Parts include prescreens, lids, spinners (MD/LG), rubber boots, baffles.

2. **Cabin Air (CCAP — Clean Cabin Air Pressurizer)** — Delivers air 200x cleaner than competitors. Pressurizes the cab with filtered air to keep dust, silica, and diesel particulates out. Kits for the same CAT equipment lineup. Filters: ECO-9990 (standard), ECO-9999 (HEPA), NH3 variants (ammonia). Parts: hose plates, motors, PC 3.0 units, access doors, nuts, boxes, hoses.

3. **Lighting** — Heavy-duty LED lights for equipment:
   - Work Lights: H3002-H3009 series in Flood (F) and Driving Light (DL) variants
   - Beacons: H0113A, H0116A, H0120A/B/G
   - Safety Lights (blue/red spot lights for equipment visibility)
   - LED Upgrade Kits for Tipper trucks, 826/836, D6T, D8T

4. **Jump Starters** — Portable lithium jump starters for heavy equipment: H0507, H0512, H0516, H0516HD

5. **Desiccant Breathers** — Moisture and contaminant protection for hydraulic systems, fuel tanks, and gearboxes

6. **Adapters** — Stack extensions and expansion adapters:
   - Metal Stack Extensions: 60M/70M/80M series (e.g., 60M04, 70M06, 80M08)
   - Metal Expansion Adapters: 60M/70M/80M series
   - Rubber Adapters
   - HVAC Access Doors

7. **EZ3 Kits** — Bundled packages combining Turbo II HD + CCAP + accessories for specific machines (24 machine-specific kits)

## Product Data Schema
Each product has these fields you can read/update:
- name, shortName, slug (URL identifier, read-only)
- category, subcategory, status (active/inactive/discontinued)
- tagline, shortDescription
- description: { summary, extended, features[] }
- specs: [{ label, value }] — technical specifications
- applications: { summary, list[] }
- warranty: { summary, points[] }
- installation: { summary, time }
- maintenance: { summary, steps[] }
- images: { main, gallery[], thumbnail }
- pdfs: [{ name, file }] — downloadable documents
- videos: [] — YouTube or video URLs
- tags: [] — machine types (dozer, loader, excavator, etc.)
- machineModels: [] — specific models (D6T, 966, etc.)
- partNumbers: [{ snp, description, price }]
- relatedProducts: [] — slugs of related products
- featured: boolean, sortOrder: number
- seo: { title, description }

## Contact Form & Email Routing
The website has a contact form that routes submissions by department:
- Quote Request / Product Inquiry → sales@ecoprousa.com
- Technical Support → technical@ecoprousa.com
- Order/Service → customerservice@ecoprousa.com
- Billing/Accounting → accounting@ecoprousa.com
- General → controller@ecoprousa.com
(Currently all routed to keelan4604@gmail.com for the demo)

## Key Values & Messaging
EcoPro's core values: "We Work for You — Not the Manufacturer", "Nothing We Sell Will Void Warranties", "Real Environmental Impact"
Stats: $12,000 avg annual savings, 25,000 hours proven, 40+ years on the market
Tagline: "Cleaner Air. Longer Life. Proven Performance."

## How to Help
- When asked to change something, use your tools to look up the product first, then confirm what you'll change before doing it.
- After making changes, offer to trigger a site rebuild so changes go live.
- Be conversational and clear. The user may not be technical.
- Never delete products — set status to "inactive" instead.
- If you're unsure what product they mean, search and ask to confirm.
- You can update any field in the product schema.
- For changes you can't make (like uploading new images), explain what files need to be added and where.`;

// ---------------------------------------------------------------------------
// Tool Definitions for the Anthropic API
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'list_products',
    description: 'List all products in the catalog. Returns name, slug, category, status, and shortDescription for each product. Use this to get an overview or find products.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by category slug (e.g., "air-filtration", "cabin-air", "lighting", "jump-starters", "desiccant-breathers", "adapters", "ez3-kits")'
        },
        search: {
          type: 'string',
          description: 'Optional: search term to filter by name, slug, or tags'
        }
      },
      required: []
    }
  },
  {
    name: 'get_product',
    description: 'Get full details of a specific product by its slug. Returns all fields including description, specs, part numbers, images, PDFs, etc.',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The product slug (URL identifier), e.g., "turbo-ii-hd", "ccap", "h3005-dl"'
        }
      },
      required: ['slug']
    }
  },
  {
    name: 'update_product',
    description: 'Update one or more fields of a product. Pass only the fields you want to change. The slug cannot be changed. After updating, suggest triggering a rebuild.',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The product slug to update'
        },
        updates: {
          type: 'object',
          description: 'Object containing the fields to update. Can include any product schema field: name, shortName, category, status, tagline, shortDescription, description, specs, tags, machineModels, partNumbers, images, pdfs, videos, featured, sortOrder, etc.'
        }
      },
      required: ['slug', 'updates']
    }
  },
  {
    name: 'list_submissions',
    description: 'List recent contact form submissions from the website. Returns name, email, company, subject, date, and message for each submission.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of submissions to return (default 20)'
        }
      },
      required: []
    }
  },
  {
    name: 'trigger_rebuild',
    description: 'Trigger a site rebuild and deploy. Use this after making product changes so they appear on the live site. Returns success/failure status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

async function executeTool(name, input, env) {
  switch (name) {
    case 'list_products': {
      const products = await getProducts(env.ADMIN_KV);
      let results = products.map(p => ({
        name: p.name,
        slug: p.slug,
        category: p.category,
        status: p.status || 'active',
        shortDescription: p.shortDescription || '',
        shortName: p.shortName || '',
      }));

      // Filter by category
      if (input.category) {
        results = results.filter(p => p.category === input.category);
      }

      // Search
      if (input.search) {
        const q = input.search.toLowerCase();
        results = results.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.slug && p.slug.toLowerCase().includes(q)) ||
          (p.shortName && p.shortName.toLowerCase().includes(q)) ||
          (p.shortDescription && p.shortDescription.toLowerCase().includes(q))
        );
      }

      return JSON.stringify({ count: results.length, products: results });
    }

    case 'get_product': {
      const product = await getProduct(env.ADMIN_KV, input.slug);
      if (!product) return JSON.stringify({ error: `Product not found: ${input.slug}` });
      return JSON.stringify(product);
    }

    case 'update_product': {
      const updated = await updateProduct(env.ADMIN_KV, input.slug, input.updates);
      if (!updated) return JSON.stringify({ error: `Product not found: ${input.slug}` });
      return JSON.stringify({ success: true, message: `Updated product: ${updated.name}`, updatedFields: Object.keys(input.updates) });
    }

    case 'list_submissions': {
      const kv = env.SUBMISSIONS || env.ADMIN_KV;
      const submissions = [];
      const limit = input.limit || 20;

      try {
        let cursor = null;
        do {
          const listOpts = { prefix: 'submission_', limit: 100 };
          if (cursor) listOpts.cursor = cursor;
          const result = await kv.list(listOpts);
          for (const key of result.keys) {
            const data = await kv.get(key.name, { type: 'json' });
            if (data) submissions.push({ id: key.name, ...data });
          }
          cursor = result.list_complete ? null : result.cursor;
        } while (cursor);
      } catch (err) {
        return JSON.stringify({ error: 'Failed to load submissions', detail: err.message });
      }

      // Sort newest first and limit
      submissions.sort((a, b) => new Date(b.submittedAt || b.timestamp || 0) - new Date(a.submittedAt || a.timestamp || 0));
      const limited = submissions.slice(0, limit);

      return JSON.stringify({ count: submissions.length, showing: limited.length, submissions: limited });
    }

    case 'trigger_rebuild': {
      if (!env.DEPLOY_HOOK_URL) {
        return JSON.stringify({ success: false, message: 'Deploy hook not configured. Changes are saved but a manual deploy is needed.' });
      }
      try {
        const resp = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
        if (!resp.ok) {
          return JSON.stringify({ success: false, message: `Deploy hook returned status ${resp.status}` });
        }
        return JSON.stringify({ success: true, message: 'Site rebuild triggered! Changes will be live in 1-2 minutes.' });
      } catch (err) {
        return JSON.stringify({ success: false, message: `Failed: ${err.message}` });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ---------------------------------------------------------------------------
// Anthropic API Call
// ---------------------------------------------------------------------------

async function callAnthropic(env, messages) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = env.CHAT_MODEL || 'claude-sonnet-4-20250514';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools: TOOLS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Main Chat Handler
// ---------------------------------------------------------------------------

export async function handleChatMessage(request, env, userEmail) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }

  const { message } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Message is required');
  }

  // Load conversation history from KV
  const historyKey = `chat:${userEmail}`;
  let history = await env.ADMIN_KV.get(historyKey, { type: 'json' }) || [];

  // Add user message
  history.push({ role: 'user', content: message.trim() });

  // Track tool calls for the response
  const toolCalls = [];

  // Call Anthropic API — loop to handle tool use
  let apiResponse = await callAnthropic(env, history);
  let iterations = 0;
  const MAX_ITERATIONS = 10; // safety limit

  while (apiResponse.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
    iterations++;

    // Add assistant's response (contains tool_use blocks) to history
    history.push({ role: 'assistant', content: apiResponse.content });

    // Execute each tool call and build tool_result messages
    const toolResults = [];
    for (const block of apiResponse.content) {
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, block.input, env);
        toolCalls.push({ tool: block.name, input: block.input });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Add tool results as a user message
    history.push({ role: 'user', content: toolResults });

    // Call API again
    apiResponse = await callAnthropic(env, history);
  }

  // Add final assistant response to history
  history.push({ role: 'assistant', content: apiResponse.content });

  // Trim history to last 40 messages to stay within context limits
  if (history.length > 40) {
    history = history.slice(-40);
    // Ensure history starts with a user message
    while (history.length > 0 && history[0].role !== 'user') {
      history.shift();
    }
  }

  // Save updated history
  await env.ADMIN_KV.put(historyKey, JSON.stringify(history));

  // Extract text from final response
  const textBlocks = apiResponse.content.filter(c => c.type === 'text');
  const responseText = textBlocks.map(c => c.text).join('\n');

  return {
    response: responseText,
    toolsUsed: toolCalls,
    model: apiResponse.model,
  };
}

export async function handleChatHistory(env, userEmail) {
  const historyKey = `chat:${userEmail}`;
  const history = await env.ADMIN_KV.get(historyKey, { type: 'json' }) || [];

  // Convert to a simpler format for the UI
  const messages = [];
  for (const msg of history) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      messages.push({ role: 'user', text: msg.content });
    } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const tools = msg.content.filter(c => c.type === 'tool_use').map(c => c.name);
      if (text) messages.push({ role: 'assistant', text, tools });
    } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
      messages.push({ role: 'assistant', text: msg.content });
    }
    // Skip tool_result messages (user messages with array content)
  }

  return { messages };
}

export async function handleChatClear(env, userEmail) {
  const historyKey = `chat:${userEmail}`;
  await env.ADMIN_KV.delete(historyKey);
  return { ok: true };
}
