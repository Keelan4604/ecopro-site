# CLAUDE.md — EcoPro USA Site Operations Guide

## Project Overview

EcoPro USA (ecoprousa.com) — a heavy equipment products company in Tempe, AZ selling filtration, lighting, and protection products for fleets. This is a fully Claude-managed static site with a build system, deployed to Cloudflare Pages.

## Project Location

```
C:\Users\Keela\Desktop\AI\EcoPro-Site\
```

## Architecture

```
Google Sheet (source of truth, 152+ products)
    ↓  (Sheets API / CSV export)
data/*.json (local cache)
    ↓
build/build.js + templates/
    ↓
dist/ (static HTML)
    ↓
Cloudflare Pages → ecoprousa.com
```

### Key Components
- **Data:** `data/*.json` — generated from Google Sheet, never edited directly
- **Templates:** `templates/` — HTML templates with `{{variable}}` syntax
- **Static Assets:** `static/` — CSS, JS, images, PDFs
- **Build Script:** `build/build.js` — reads data + templates → outputs `dist/`
- **Workers:** `workers/` — Cloudflare Workers for forms and admin API
- **Admin UI:** `admin/` — login + product editor at `/admin/`

### Data Source
- **Google Sheet ID:** `1ss_HqqYiN5BmhMyJzE4TIe7SNxXBJvq8dVh3IFPXd9Y`
- This is the SINGLE source of truth for all product data
- Local `data/products.json` is a cache — regenerated on build
- Admin UI edits write back to the Sheet via Sheets API

## Common Operations

### Adding a New Product
1. Add the product row to the Google Sheet
2. Run: `npm run sync` (pulls Sheet → updates products.json)
3. Add images to `static/images/products/{slug}/`
4. Add PDFs to `static/pdfs/{category}/`
5. Run: `npm run build`
6. Verify locally: `npm run serve`
7. Deploy: `npm run deploy`

### Editing a Product
1. Edit the product in the Google Sheet (or admin UI)
2. Run: `npm run sync && npm run build && npm run deploy`

### Adding a Tech Corner Article
1. Add article object to `data/articles.json`
2. Create article content (markdown or HTML)
3. Add article image to `static/images/articles/`
4. Run: `npm run build && npm run deploy`

### Adding a New Page
1. Create template in `templates/pages/`
2. Add page generation logic in `build/build.js`
3. Update `data/navigation.json` if it appears in nav
4. Run: `npm run build && npm run deploy`

### Deploying
```bash
npm run deploy
# or manually:
npx wrangler pages deploy dist --project-name=ecopro-site
```

### Downloading Images from WordPress
```bash
node build/download-wp-media.js
```
Downloads all images/PDFs from the WP REST API and organizes them into `static/`.

### Managing Admin Users
```bash
# Add user (via worker script)
node workers/admin-api/create-user.js --email "user@ecoprousa.com" --password "..." --role admin

# List users
npx wrangler kv:list --namespace-id=<admin-kv-id>

# Reset password
node workers/admin-api/reset-password.js --email "user@ecoprousa.com" --password "..."
```

### Viewing Contact Form Submissions
```bash
npx wrangler kv:list --namespace-id=<submissions-kv-id> --prefix=submission_
npx wrangler kv:get --namespace-id=<submissions-kv-id> "submission_<key>"
```

### Emergency Rollback
Cloudflare Pages keeps deployment history. Roll back via:
Cloudflare Dashboard → Pages → ecopro-site → Deployments → select previous → "Rollback to this deployment"

## File Conventions

- **Product slugs:** lowercase, hyphenated (e.g., `turbo-ii-hd`)
- **Image naming:** `main.png` for primary, `gallery-N.jpg` for gallery
- **PDF naming:** match existing WordPress naming for URL compatibility
- **All dates:** ISO 8601 format (e.g., `2026-04-13T00:00:00Z`)
- **URLs:** always use trailing slashes (`/about/` not `/about`)

## Template Syntax

```html
{{variable}}              — interpolate variable
{{> partialName}}          — include partial
{{#each items}}...{{/each}} — loop
{{#if cond}}...{{else}}...{{/if}} — conditional
{{{raw}}}                  — unescaped HTML
```

## Contact Information

- **Phone:** 855-ECO-PRO2 (855-326-7762)
- **Email:** controller@ecoprousa.com
- **Address:** 2443 W 12th St, Tempe, AZ 85281
- **Email routing:** See `data/company.json` for all department emails

## DO NOT

- Commit secrets, API keys, or passwords to the repo
- Modify `dist/` directly — always use the build system
- Deploy without building first
- Delete old Cloudflare deployments (keep for rollback)
- Mention AI/Claude/automation in any client-facing content on the site
- Edit `data/products.json` directly — edit the Google Sheet instead

## Key Paths

| What | Path |
|------|------|
| Project root | `C:\Users\Keela\Desktop\AI\EcoPro-Site\` |
| Product data | `data/products.json` (152 products) |
| Google Sheet | `docs.google.com/spreadsheets/d/1ss_HqqYiN5BmhMyJzE4TIe7SNxXBJvq8dVh3IFPXd9Y` |
| Price sheet | `C:\Users\Keela\Documents\EcoPro\ecopro price sheets\` |
| Demo site (original) | `C:\Users\Keela\Desktop\AI\Website-Business\Demo-Sites\ecopro-site\` |
| Live demo | `https://ecopro.keelanodoherty.org` |
| Cloudflare account | `f8d4ad1fff21836f900f15bddf5eaf51` |
