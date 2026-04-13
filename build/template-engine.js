/**
 * EcoPro USA — Custom Template Engine
 *
 * Supports:
 *   {{variable}}              — escaped interpolation
 *   {{{variable}}}            — raw/unescaped HTML
 *   {{> partialName}}         — include partial
 *   {{#each items}}...{{/each}} — loop (exposes @index, @first, @last, this)
 *   {{#if cond}}...{{else}}...{{/if}} — conditional
 *   {{lookup obj key}}        — dynamic property access
 *   Nested property access:   {{obj.prop.sub}}
 */

const fs = require('fs');
const path = require('path');

class TemplateEngine {
  constructor(partialsDir) {
    this.partials = {};
    this.helpers = {};
    if (partialsDir) this.loadPartials(partialsDir);
  }

  loadPartials(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
    for (const file of files) {
      const name = path.basename(file, '.html');
      this.partials[name] = fs.readFileSync(path.join(dir, file), 'utf8');
    }
  }

  registerPartial(name, content) {
    this.partials[name] = content;
  }

  registerHelper(name, fn) {
    this.helpers[name] = fn;
  }

  /**
   * Resolve a dotted path like "obj.prop.sub" against a context object.
   */
  resolve(ctx, keyPath) {
    if (keyPath === 'this' || keyPath === '.') {
      // If we're inside an #each of primitives, return the stored 'this' value
      return ctx.hasOwnProperty('this') ? ctx['this'] : ctx;
    }
    const parts = keyPath.split('.');
    let val = ctx;
    for (const p of parts) {
      if (val == null) return undefined;
      val = val[p];
    }
    return val;
  }

  /**
   * Escape HTML entities for safe output.
   */
  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Render a template string with a given data context.
   */
  render(template, data) {
    let output = template;

    // Process blocks first (each, if) — these are recursive
    output = this.processBlocks(output, data);

    // Process partials
    output = this.processPartials(output, data);

    // Process raw interpolation {{{var}}}
    output = output.replace(/\{\{\{([^}]+)\}\}\}/g, (_, key) => {
      const val = this.resolve(data, key.trim());
      return val != null ? String(val) : '';
    });

    // Process escaped interpolation {{var}}
    output = output.replace(/\{\{([^#/>!][^}]*)\}\}/g, (match, key) => {
      const trimmed = key.trim();
      // Skip block-related tags that weren't caught
      if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('!')) {
        return match;
      }
      // Handle lookup helper
      if (trimmed.startsWith('lookup ')) {
        const args = trimmed.substring(7).trim().split(/\s+/);
        if (args.length >= 2) {
          const obj = this.resolve(data, args[0]);
          const keyVal = this.resolve(data, args[1]) ?? args[1];
          return obj != null ? this.escapeHtml(obj[keyVal]) : '';
        }
        return '';
      }
      const val = this.resolve(data, trimmed);
      return val != null ? this.escapeHtml(val) : '';
    });

    return output;
  }

  /**
   * Find the matching closing tag for a block, respecting nesting.
   * Returns { body, rest } where body is the inner content and rest is everything after {{/tag}}.
   * For if blocks, also returns elseBody if {{else}} is found at the top nesting level.
   */
  findMatchingClose(template, tag) {
    let depth = 0;
    let i = 0;
    let elsePos = -1;
    const openTag = `{{#${tag} `;
    const closeTag = `{{/${tag}}}`;
    const elseTag = '{{else}}';

    while (i < template.length) {
      if (template.startsWith(openTag, i)) {
        depth++;
        i += openTag.length;
      } else if (template.startsWith(closeTag, i)) {
        if (depth === 0) {
          const body = template.substring(0, i);
          const rest = template.substring(i + closeTag.length);
          if (tag === 'if' && elsePos !== -1) {
            return { ifBody: body.substring(0, elsePos), elseBody: body.substring(elsePos + elseTag.length), rest };
          }
          return { body, rest };
        }
        depth--;
        i += closeTag.length;
      } else if (tag === 'if' && depth === 0 && template.startsWith(elseTag, i)) {
        elsePos = i;
        i += elseTag.length;
      } else {
        i++;
      }
    }
    // No match found — return everything as body
    return { body: template, rest: '' };
  }

  /**
   * Process {{#each}} and {{#if}} blocks.
   */
  processBlocks(template, data) {
    let output = template;
    let safety = 0;

    // Process {{#each items}}...{{/each}} with nesting support
    while (output.includes('{{#each ') && safety++ < 100) {
      const match = output.match(/\{\{#each\s+([^}]+)\}\}/);
      if (!match) break;
      const keyPath = match[1].trim();
      const startIdx = match.index;
      const afterOpen = startIdx + match[0].length;
      const parsed = this.findMatchingClose(output.substring(afterOpen), 'each');
      const before = output.substring(0, startIdx);
      const items = this.resolve(data, keyPath);
      let rendered = '';
      if (Array.isArray(items) && items.length > 0) {
        rendered = items.map((item, index) => {
          const itemCtx = typeof item === 'object' && item !== null
            ? { ...data, ...item, '@index': index, '@first': index === 0, '@last': index === items.length - 1, 'this': item }
            : { ...data, '@index': index, '@first': index === 0, '@last': index === items.length - 1, 'this': item, '.': item };
          return this.render(parsed.body, itemCtx);
        }).join('');
      }
      output = before + rendered + parsed.rest;
    }

    // Process {{#if cond}}...{{else}}...{{/if}} and {{#if cond}}...{{/if}} with nesting support
    safety = 0;
    while (output.includes('{{#if ') && safety++ < 100) {
      const match = output.match(/\{\{#if\s+([^}]+)\}\}/);
      if (!match) break;
      const cond = match[1].trim();
      const startIdx = match.index;
      const afterOpen = startIdx + match[0].length;
      const parsed = this.findMatchingClose(output.substring(afterOpen), 'if');
      const before = output.substring(0, startIdx);
      const val = this.resolve(data, cond);
      const truthy = val != null && val !== false && val !== '' && val !== 0 && !(Array.isArray(val) && val.length === 0);
      let rendered;
      if (parsed.ifBody !== undefined) {
        // Has else
        rendered = this.render(truthy ? parsed.ifBody : parsed.elseBody, data);
      } else {
        rendered = truthy ? this.render(parsed.body, data) : '';
      }
      output = before + rendered + parsed.rest;
    }

    // Process {{#unless cond}}...{{/unless}} with nesting support
    safety = 0;
    while (output.includes('{{#unless ') && safety++ < 100) {
      const match = output.match(/\{\{#unless\s+([^}]+)\}\}/);
      if (!match) break;
      const cond = match[1].trim();
      const startIdx = match.index;
      const afterOpen = startIdx + match[0].length;
      const parsed = this.findMatchingClose(output.substring(afterOpen), 'unless');
      const before = output.substring(0, startIdx);
      const val = this.resolve(data, cond);
      const truthy = val != null && val !== false && val !== '' && val !== 0 && !(Array.isArray(val) && val.length === 0);
      output = before + (truthy ? '' : this.render(parsed.body, data)) + parsed.rest;
    }

    return output;
  }

  /**
   * Process {{> partialName}} includes.
   */
  processPartials(template, data) {
    let output = template;
    let safety = 0;
    while (output.includes('{{>') && safety++ < 50) {
      output = output.replace(/\{\{>\s*([^}\s]+)\s*\}\}/g, (_, name) => {
        const partial = this.partials[name.trim()];
        if (!partial) {
          console.warn(`Warning: partial "${name.trim()}" not found`);
          return '';
        }
        return this.render(partial, data);
      });
    }
    return output;
  }

  /**
   * Render a template file with data.
   */
  renderFile(filePath, data) {
    const template = fs.readFileSync(filePath, 'utf8');
    return this.render(template, data);
  }
}

module.exports = TemplateEngine;
