// KV storage helpers — no external dependencies

export async function getUser(kv, email) {
  const data = await kv.get(`user:${email}`, { type: 'json' });
  return data || null;
}

export async function setUser(kv, email, userData) {
  await kv.put(`user:${email}`, JSON.stringify(userData));
}

export async function getProducts(kv) {
  const data = await kv.get('products', { type: 'json' });
  if (!data) return [];
  // Handle both {products: [...]} wrapper and plain array
  return Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
}

export async function getProduct(kv, slug) {
  const products = await getProducts(kv);
  return products.find(p => p.slug === slug) || null;
}

export async function updateProduct(kv, slug, updates) {
  const products = await getProducts(kv);
  const index = products.findIndex(p => p.slug === slug);
  if (index === -1) return null;

  // Merge updates into existing product (shallow merge)
  products[index] = { ...products[index], ...updates, slug }; // preserve slug
  await kv.put('products', JSON.stringify(products));
  return products[index];
}
