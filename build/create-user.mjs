// Creates an admin user directly in KV via wrangler
// Usage: node build/create-user.mjs email password role
import { execSync } from 'child_process';

const [,, email, password, role = 'editor'] = process.argv;
if (!email || !password) {
  console.error('Usage: node build/create-user.mjs <email> <password> [role]');
  process.exit(1);
}

const PBKDF2_ITERATIONS = 100000;
const KV_NAMESPACE_ID = '845fa7aabbe34453b52936583bfa0f8f';

async function hashPassword(pwd) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const toHex = arr => Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  return `${toHex(salt)}:${toHex(new Uint8Array(derived))}`;
}

const passwordHash = await hashPassword(password);
const userData = JSON.stringify({
  email,
  passwordHash,
  role,
  createdAt: new Date().toISOString(),
});

// Write to KV via wrangler CLI
const key = `user:${email}`;
const tmpFile = 'tmp-user-value.txt';
import { writeFileSync, unlinkSync } from 'fs';
writeFileSync(tmpFile, userData);

try {
  execSync(
    `npx wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} --remote "${key}" --path="${tmpFile}"`,
    { stdio: 'inherit', cwd: process.cwd() }
  );
  console.log(`\n✓ Created user: ${email} (role: ${role})`);
} finally {
  unlinkSync(tmpFile);
}
