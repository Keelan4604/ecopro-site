#!/usr/bin/env node
/**
 * EcoPro USA — Static Site Build Script
 *
 * Reads data JSON files + templates, renders all pages to dist/.
 * Usage: node build/build.js
 */

const fs = require('fs');
const path = require('path');
const TemplateEngine = require('./template-engine');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'data');
const TEMPLATES = path.join(ROOT, 'templates');
const STATIC = path.join(ROOT, 'static');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJSON(name) {
  const filePath = path.join(DATA, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
}

// ---------------------------------------------------------------------------
// Load all data
// ---------------------------------------------------------------------------

console.log('Loading data...');
const products = loadJSON('products.json');
const categories = loadJSON('categories.json');
const navigation = loadJSON('navigation.json');
const company = loadJSON('company.json');
const testimonials = loadJSON('testimonials.json');
const articles = loadJSON('articles.json');
const dealers = loadJSON('dealers.json');

const currentYear = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Prepare navigation with active states
// ---------------------------------------------------------------------------

function buildNavItems(activeId, rootPath) {
  return navigation.mainNav.map(item => {
    let url = rootPath + item.url.replace(/^\//, '');
    if (url === '') url = './';
    const result = { ...item, url, active: item.id === activeId };
    // Attach product dropdown menu with resolved URLs
    if (item.hasDropdown) {
      result.productMenu = navigation.productMenu.map(cat => ({
        ...cat,
        url: rootPath + cat.url.replace(/^\//, ''),
        subcategories: (cat.subcategories || []).map(sub => ({
          ...sub,
          url: rootPath + sub.url.replace(/^\//, ''),
        })),
      }));
    }
    return result;
  });
}

// Footer product links — point to category pages
const footerProducts = navigation.productMenu.map(cat => ({
  label: cat.label,
  url: cat.url,
}));

// Active products (used by category mapping, product pages, etc.)
const activeProducts = products.products.filter(p => p.status === 'active');

// ---------------------------------------------------------------------------
// Category → product mapping for building category pages
// ---------------------------------------------------------------------------

const categoryMapping = [
  {
    slug: 'turbo-ii-hd', name: 'Turbo II HD', url: '/products/turbo-ii-hd/',
    description: 'Centrifugal pre-cleaners with 40+ years of proven performance. Extends engine air filter life 3-5x.',
    heroImage: 'images/hero/slide-1-bg.jpg',
    filter: p => (p.category === 'Generic Products' && p.slug === 'turbo-ii-hd') || (p.category === 'Machine Specific' && p.subcategory === 'TURBO IIHD'),
    subcategories: [
      { slug: 'kits', name: 'Kits for Equipment', url: '/products/turbo-ii-hd/kits/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'TURBO IIHD' },
      { slug: 'parts', name: 'Parts', url: '/products/turbo-ii-hd/parts/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'TURBO IIHD Parts' },
    ],
  },
  {
    slug: 'ccap', name: 'Clean Cabin Air Pressurizer (CCAP)', url: '/products/ccap/',
    description: 'Three-stage filtration system delivering air 200x cleaner than competitors at 0.3 microns.',
    heroImage: 'images/hero/our-products.jpg',
    filter: p => (p.category === 'Generic Products' && p.slug === 'clean-cabin-air-pressurizer') || (p.category === 'Machine Specific' && p.subcategory && p.subcategory.startsWith('Clean Cabin Air Pressurizer')),
    subcategories: [
      { slug: 'kits', name: 'Kits for Equipment', url: '/products/ccap/kits/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'Clean Cabin Air Pressurizer' },
      { slug: 'filters', name: 'Filters', url: '/products/ccap/filters/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'Clean Cabin Air Pressurizer Filters' },
      { slug: 'parts', name: 'Parts', url: '/products/ccap/parts/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'Clean Cabin Air Pressurizer Parts' },
    ],
  },
  {
    slug: 'lights', name: 'Lights', url: '/products/lights/',
    description: 'Mining-grade LED work lights, beacons, and upgrade kits built for extreme conditions.',
    heroImage: 'images/hero/slide-1-bg.jpg',
    filter: p => p.category === 'Lights',
    subcategories: [
      { slug: 'work-lights', name: 'Work Lights', url: '/products/lights/work-lights/',
        filter: p => p.category === 'Lights' && p.subcategory === 'Work Lights' },
      { slug: 'beacons', name: 'Beacons', url: '/products/lights/beacons/',
        filter: p => p.category === 'Lights' && p.subcategory === 'Beacons' },
      { slug: 'safety-lights', name: 'Safety Lights', url: '/products/lights/safety-lights/',
        filter: p => p.category === 'Lights' && p.subcategory === 'Safety Lights' },
      { slug: 'led-upgrade-kits', name: 'LED Upgrade Kits', url: '/products/lights/led-upgrade-kits/',
        filter: p => p.category === 'Lights' && p.subcategory === 'LED Upgrade Kits' },
    ],
  },
  {
    slug: 'jump-starters', name: 'Jump Starters', url: '/products/jump-starters/',
    description: 'Heavy-duty portable jump starters with Rapid Recharge Technology and LiFePO4 batteries.',
    heroImage: 'images/hero/slidd-2-bg.jpg',
    filter: p => p.category === 'Jump Starters',
    subcategories: [],
  },
  {
    slug: 'desiccant-breathers', name: 'Desiccant Breathers', url: '/products/desiccant-breathers/',
    description: 'Contamination control for diesel and lubricant storage — color-changing silica shows replacement timing.',
    heroImage: 'images/hero/slide-3-bg.jpg',
    filter: p => p.category === 'Generic Products' && p.slug === 'desiccant-breathers',
    subcategories: [],
  },
  {
    slug: 'adapters', name: 'Adapters', url: '/products/adapters/',
    description: 'In-house manufactured metal stack extensions, expansion adapters, rubber adapters, and HVAC access doors.',
    heroImage: 'images/hero/slide-1-bg.jpg',
    filter: p => p.category === 'Adapters',
    subcategories: [
      { slug: 'metal', name: 'Metal Adapters', url: '/products/adapters/metal/',
        filter: p => p.category === 'Adapters' && (p.slug.startsWith('mse-') || p.slug.startsWith('mea-')) },
      { slug: 'rubber', name: 'Rubber Adapters', url: '/products/adapters/rubber/',
        filter: p => p.category === 'Adapters' && p.slug.startsWith('tur-') },
      { slug: 'hvac-doors', name: 'HVAC Access Doors', url: '/products/adapters/hvac-doors/',
        filter: p => p.category === 'Adapters' && (p.slug.startsWith('ccap-') && p.slug.includes('door')) },
    ],
  },
  {
    slug: 'ez3-kits', name: 'EZ3 Kits', url: '/products/ez3-kits/',
    description: 'Machine-specific bundles: Turbo II HD + CCAP + LED lights + adapter + HVAC door — everything in one kit.',
    heroImage: 'images/hero/our-products.jpg',
    filter: p => p.category === 'Machine Specific' && p.subcategory === 'EZ3 Kits',
    subcategories: [
      { slug: 'kits', name: 'Kits for Equipment', url: '/products/ez3-kits/kits/',
        filter: p => p.category === 'Machine Specific' && p.subcategory === 'EZ3 Kits' },
    ],
  },
];

/**
 * Build sidebar menu data with active states for a given page URL.
 */
function buildProductMenu(rootPath, activeUrl) {
  return navigation.productMenu.map(cat => ({
    ...cat,
    url: rootPath + cat.url.replace(/^\//, ''),
    active: activeUrl === cat.url,
    subcategories: (cat.subcategories || []).map(sub => ({
      ...sub,
      url: rootPath + sub.url.replace(/^\//, ''),
      active: activeUrl === sub.url,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Featured products for homepage
// ---------------------------------------------------------------------------

const featuredProductDefs = [
  {
    slug: 'turbo-ii-hd',
    name: 'Turbo II HD PreCleaner',
    shortDescription: 'Centrifugal pre-cleaner with 40+ years of proven performance. Extends engine air filter life 3-5x in the harshest dust environments. One moving part. Lifetime-warranted spinner.',
    highlights: ['80-90% improved filtration', 'SAE J726 independently tested', 'Fits loaders, graders, haulers & more'],
    image: 'images/products/turbo-ii-hd/product-1.png',
  },
  {
    slug: 'clean-cabin-air-pressurizer',
    name: 'Cabin Air Pressurizer',
    shortDescription: 'Three-stage filtration system that pressurizes equipment cabs to deliver air 200x cleaner than leading competitors at 0.3 microns. German-engineered motor in a powder-coated steel enclosure.',
    highlights: ['99.998% efficient at 0.3 microns', '2,000-hour filter life', 'Equipment-specific kits available'],
    image: 'images/products/cabin-air-pressurizer/product-2.png',
  },
  {
    slug: 'led-hd-lights',
    name: 'LED HD Lights',
    shortDescription: 'Mining-grade H30 Series LED work lights built to withstand extreme vibration, washdowns, and harsh operating environments. Plug-and-play DT connectors with sealed construction.',
    highlights: ['Mining-grade durability', 'Extreme vibration rated', 'Plug-and-play installation'],
    image: 'images/products/lights/DuraLux-Gen-2_9-LED-Large-300x232.png',
  },
  {
    slug: 'desiccant-breathers',
    name: 'Desiccant Breathers',
    shortDescription: 'Protect diesel and lubricant storage from moisture and airborne contaminants. Color-changing silica indicates replacement timing. Prevents rust, sludge, and microbial growth.',
    highlights: ['Visual replacement indicator', 'Diesel & lubricant protection', 'Low-profile options available'],
    image: 'images/products/desiccant/product-4.png',
  },
  {
    slug: 'metal-adapters',
    name: 'Metal Adapters',
    shortDescription: 'In-house manufactured metal stack extensions, expansion adapters, and custom brackets. Precision metal spinning, bracket design, and HVAC access panels for any application.',
    highlights: ['Custom in-house manufacturing', 'Stack extensions & expansion adapters', '90-day warranty'],
    image: 'images/products/adapters/My-project-1-4-2-300x263.jpg',
  },
  {
    slug: 'jump-starters',
    name: 'Jump Starters',
    shortDescription: 'Heavy-duty portable jump starters featuring Rapid Recharge Technology and Lithium Iron Phosphate (LiFePO4) batteries. Built for reliable cold starts on equipment fleets in any conditions.',
    highlights: ['Rapid Recharge Technology', 'Lithium Iron Phosphate batteries', '12V & 24V capability'],
    image: 'images/products/jump-starters/h0507-600x600.jpg',
  },
];

// ---------------------------------------------------------------------------
// Products page — generic product detail sections
// ---------------------------------------------------------------------------

const genericProducts = [
  {
    anchor: 'turbo', name: 'Turbo II HD PreCleaner', eyebrow: 'Air Filtration', reverse: false,
    image: 'images/products/turbo-ii-hd/product-1.png',
    descriptionHtml: '<p class="product-detail-desc">The Turbo II HD PreCleaner is a centrifugal pre-cleaning system with over 40 years of proven performance. It removes up to 90% of airborne contaminants before they reach your primary air filter — extending engine air filter life 3-5x in the harshest dust environments.</p><p class="product-detail-desc">With just one moving part and a lifetime-warranted spinner, the Turbo II delivers low-maintenance, high-reliability filtration for loaders, graders, haulers, dozers, and more.</p><ul class="product-feature-list"><li>Centrifugal pre-cleaning technology</li><li>Lifetime-warranted spinner</li><li>Reduces engine air filter costs by up to 80%</li><li>Will not void equipment warranty</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">80-90%</span><span class="spec-label">Improved Filtration</span></div><div class="spec-item"><span class="spec-value">3-5x</span><span class="spec-label">Filter Life Extension</span></div><div class="spec-item"><span class="spec-value">1</span><span class="spec-label">Moving Part</span></div><div class="spec-item"><span class="spec-value">SAE J726</span><span class="spec-label">Independently Tested</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Wheel loaders &amp; track loaders</li><li>Motor graders</li><li>Haul trucks &amp; articulated haulers</li><li>Dozers &amp; excavators</li><li>Crushers &amp; screeners</li><li>Stationary generators &amp; compressors</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">The Turbo II spinner is fully lifetime warranted against failure. The complete unit is backed by a comprehensive manufacturer warranty. Will not void equipment warranties.</p>',
  },
  {
    anchor: 'cabin', name: 'Cabin Air Pressurizer (CCAP)', eyebrow: 'Operator Protection', reverse: true,
    image: 'images/products/cabin-air-pressurizer/product-2.png',
    descriptionHtml: '<p class="product-detail-desc">The Clean Cabin Air Pressurizer (CCAP) is a three-stage filtration system that pressurizes equipment cabs to deliver air 200x cleaner than leading competitors at 0.3 microns. German-engineered brushless motor in a powder-coated steel enclosure.</p><ul class="product-feature-list"><li>99.998% efficient at 0.3 microns</li><li>2,000-hour filter life</li><li>Positive pressure keeps contaminants out</li><li>Equipment-specific kits available</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">99.998%</span><span class="spec-label">Efficiency at 0.3&mu;</span></div><div class="spec-item"><span class="spec-value">200x</span><span class="spec-label">Cleaner than Competitors</span></div><div class="spec-item"><span class="spec-value">2,000</span><span class="spec-label">Hour Filter Life</span></div><div class="spec-item"><span class="spec-value">25,000+</span><span class="spec-label">Hours Proven</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Dozers (D3-D11)</li><li>Wheel loaders</li><li>Motor graders</li><li>Excavators</li><li>Landfill compactors</li><li>Any enclosed cab equipment</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Backed by a full manufacturer warranty. CCAP systems are designed to integrate safely with existing HVAC systems and will not void equipment warranties.</p>',
  },
  {
    anchor: 'led', name: 'LED HD Work Lights', eyebrow: 'Lighting', reverse: false,
    image: 'images/products/lights/DuraLux-Gen-2_9-LED-Large-300x232.png',
    descriptionHtml: '<p class="product-detail-desc">Mining-grade LED work lights built to withstand extreme vibration, washdowns, and harsh operating environments. The H30 Series features plug-and-play DT connectors with sealed construction for maximum durability.</p><ul class="product-feature-list"><li>Mining-grade durability</li><li>Extreme vibration rated</li><li>Plug-and-play DT connectors</li><li>Sealed construction</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">H30</span><span class="spec-label">Series</span></div><div class="spec-item"><span class="spec-value">LED</span><span class="spec-label">Technology</span></div><div class="spec-item"><span class="spec-value">IP69K</span><span class="spec-label">Sealed Rating</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Mining equipment</li><li>Construction machinery</li><li>Haul trucks</li><li>Any heavy equipment requiring durable lighting</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Full manufacturer warranty on all LED work lights.</p>',
  },
  {
    anchor: 'desiccant', name: 'Desiccant Breathers', eyebrow: 'Contamination Control', reverse: true,
    image: 'images/products/desiccant/product-4.png',
    descriptionHtml: '<p class="product-detail-desc">Desiccant breathers protect diesel and lubricant storage from moisture and airborne contaminants. The color-changing silica shows when replacement is needed, making tank protection simple and reliable.</p><ul class="product-feature-list"><li>Removes moisture and airborne contamination</li><li>Extends fluid and equipment life</li><li>Color-changing replacement indicator</li><li>Fully disposable, long lasting</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">Visual</span><span class="spec-label">Replacement Indicator</span></div><div class="spec-item"><span class="spec-value">Multiple</span><span class="spec-label">Sizes Available</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Diesel storage tanks</li><li>Lubricant storage tanks</li><li>Lube trucks</li><li>Hydraulic reservoirs</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Fully disposable units with manufacturer quality guarantee.</p>',
  },
  {
    anchor: 'adapters', name: 'Metal Adapters', eyebrow: 'Custom Manufacturing', reverse: false,
    image: 'images/products/adapters/My-project-1-4-2-300x263.jpg',
    descriptionHtml: '<p class="product-detail-desc">In-house manufactured metal stack extensions (MSE), expansion adapters (MEA), and custom brackets. Precision metal spinning, bracket design, and HVAC access panels for any application.</p><ul class="product-feature-list"><li>Custom in-house manufacturing</li><li>Stack extensions &amp; expansion adapters</li><li>Precision metal spinning</li><li>HVAC access panels</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">Custom</span><span class="spec-label">In-House Manufacturing</span></div><div class="spec-item"><span class="spec-value">90-Day</span><span class="spec-label">Warranty</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Pre-cleaner mounting</li><li>Stack extensions</li><li>HVAC access panels</li><li>Custom brackets and adapters</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">90-day warranty on all custom-manufactured metal adapters.</p>',
  },
  {
    anchor: 'jump-starters', name: 'Jump Starters', eyebrow: 'Power Solutions', reverse: true,
    image: 'images/products/jump-starters/h0507-600x600.jpg',
    descriptionHtml: '<p class="product-detail-desc">Heavy-duty portable jump starters featuring Rapid Recharge Technology and Lithium Iron Phosphate (LiFePO4) batteries. Built for reliable cold starts on equipment fleets in any conditions.</p><ul class="product-feature-list"><li>Rapid Recharge Technology</li><li>Lithium Iron Phosphate batteries</li><li>12V &amp; 24V capability</li><li>Portable and durable</li></ul>',
    specsHtml: '<div class="product-specs"><div class="spec-item"><span class="spec-value">LiFePO4</span><span class="spec-label">Battery Technology</span></div><div class="spec-item"><span class="spec-value">12V/24V</span><span class="spec-label">Dual Capability</span></div><div class="spec-item"><span class="spec-value">Rapid</span><span class="spec-label">Recharge</span></div></div>',
    applicationsHtml: '<ul class="product-feature-list"><li>Heavy equipment fleets</li><li>Construction sites</li><li>Mining operations</li><li>Remote locations</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Full manufacturer warranty on all jump starter units.</p>',
  },
  {
    anchor: 'rubber-adapters', name: 'Rubber Adapters', eyebrow: 'Adapters', reverse: false,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Flexible rubber adapters for connecting pre-cleaners to various stack sizes. Durable construction handles vibration and temperature extremes.</p>',
    specsHtml: '<p class="product-detail-desc">Multiple sizes available to fit standard stack diameters.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Pre-cleaner to stack connections</li><li>Flexible mounting solutions</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
  {
    anchor: 'hvac-doors', name: 'HVAC Access Doors', eyebrow: 'Access Solutions', reverse: true,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Custom HVAC access doors and panels for equipment cab maintenance. Provides easy access to HVAC components without removing major panels.</p>',
    specsHtml: '<p class="product-detail-desc">Custom manufactured to fit specific equipment models.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Equipment cab HVAC maintenance</li><li>Filter access</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">90-day warranty on all custom-manufactured access doors.</p>',
  },
  {
    anchor: 'ez3-kits', name: 'EZ3 Machine-Specific Kits', eyebrow: 'Complete Kits', reverse: false,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Machine-specific installation kits that bundle a Turbo II HD PreCleaner, metal adapter, and all mounting hardware for a specific equipment model. Everything you need in one box.</p>',
    specsHtml: '<p class="product-detail-desc">Each kit is tailored to a specific machine model for a perfect fit.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Caterpillar equipment</li><li>Komatsu equipment</li><li>Volvo equipment</li><li>John Deere equipment</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Individual component warranties apply to each item in the kit.</p>',
  },
  {
    anchor: 'axle-guards', name: 'Axle Guards for Packers', eyebrow: 'Protection', reverse: true,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Heavy-duty axle guards designed for landfill compactors and packers. Protects axles from wire, cable, and debris wrap.</p>',
    specsHtml: '<p class="product-detail-desc">Designed for common landfill compactor models.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Landfill compactors</li><li>Waste packers</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
  {
    anchor: 'tipper-wheels', name: 'Steel Tipper Wheels', eyebrow: 'Waste Industry', reverse: false,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Heavy-duty steel tipper wheels for landfill and waste industry applications.</p>',
    specsHtml: '<p class="product-detail-desc">Steel construction for maximum durability.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Landfill operations</li><li>Waste management</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
  {
    anchor: 'ultraburn', name: 'UltraBurn Catalyst System', eyebrow: 'Emissions', reverse: true,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Catalytic combustion system that reduces diesel emissions and improves fuel efficiency.</p>',
    specsHtml: '<p class="product-detail-desc">Proven emission reduction technology.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Diesel-powered equipment</li><li>Emissions compliance</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Full manufacturer warranty.</p>',
  },
  {
    anchor: 'form-a-funnel', name: 'Form-A-Funnel', eyebrow: 'Maintenance Tools', reverse: false,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Flexible, reusable drip-free funnel that forms to any shape. Ideal for fluid top-offs in tight spaces.</p>',
    specsHtml: '<p class="product-detail-desc">Flexible material forms to any shape needed.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Fluid top-offs</li><li>Tight-space maintenance</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
  {
    anchor: 'yelloc', name: 'Yelloc Caps', eyebrow: 'Protection', reverse: true,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Protective dust caps for hydraulic fittings. Keeps contaminants out of hydraulic systems during maintenance and storage.</p>',
    specsHtml: '<p class="product-detail-desc">Multiple sizes for standard hydraulic fittings.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Hydraulic system maintenance</li><li>Equipment storage</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
  {
    anchor: 'fireball', name: 'Fireball Fire Extinguisher', eyebrow: 'Safety', reverse: false,
    image: 'images/placeholder.svg',
    descriptionHtml: '<p class="product-detail-desc">Automatic fire suppression ball that activates on contact with flame. Provides passive fire protection for equipment engine compartments.</p>',
    specsHtml: '<p class="product-detail-desc">Self-activating fire suppression technology.</p>',
    applicationsHtml: '<ul class="product-feature-list"><li>Engine compartments</li><li>Electrical panels</li><li>Storage areas</li></ul>',
    warrantyHtml: '<p class="product-detail-desc">Manufacturer warranty included.</p>',
  },
];

// ---------------------------------------------------------------------------
// Case studies with stat breakout for results page
// ---------------------------------------------------------------------------

const caseStudiesWithStats = [
  { ...testimonials.caseStudies[0], statNumber: '$12,000', statLabel: '/year saved', title: 'Recycling Facility Slashes Filter Costs' },
  { ...testimonials.caseStudies[1], statNumber: '25,000', statLabel: 'hours in operation', title: 'D6T Dozer Reaches 25,000 Operating Hours' },
  { ...testimonials.caseStudies[2], statNumber: '3', statLabel: 'years — HVAC still clean', title: 'Arizona Landfill HVAC Stays Pristine' },
];

// ---------------------------------------------------------------------------
// Tech corner data
// ---------------------------------------------------------------------------

const techArticles = [
  {
    title: 'The Green Revolution: How Turbo II HD PreCleaner is Redefining Clean Air',
    description: 'Explore how centrifugal pre-cleaning technology is reducing emissions, cutting waste, and saving fleets thousands of dollars per year.',
    badge: 'Article',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><path d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4z" stroke="currentColor" stroke-width="2"/><path d="M16 20h16M16 28h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tags: ['Turbo II HD', 'Sustainability'],
  },
  {
    title: 'Turbo II HD: Typical Applications',
    description: 'From wheel loaders to stationary generators, see where the Turbo II HD PreCleaner delivers the most impact.',
    badge: 'Article',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" stroke-width="2"/><path d="M6 18h36M18 18v20" stroke="currentColor" stroke-width="2"/></svg>',
    tags: ['Turbo II HD', 'Applications'],
  },
  {
    title: 'Turbo II HD: Key Benefits',
    description: 'A breakdown of the measurable benefits: filter life extension, cost savings, reduced downtime, and environmental impact.',
    badge: 'Article',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><path d="M24 4l5.18 10.5L40 16.27l-8 7.8 1.89 11.01L24 30.24l-9.89 4.84L16 24.07l-8-7.8 10.82-1.77z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    tags: ['Turbo II HD', 'ROI'],
  },
];

const fieldGuides = [
  {
    title: 'Replacing the Spinner',
    description: 'Step-by-step guide for replacing the Turbo II HD spinner assembly. Covers removal, inspection, replacement, and testing.',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><path d="M14 4v8l-6 4v24h32V16l-6-4V4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 4h20v8H14z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M20 24h8M20 30h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tags: ['Turbo II HD', 'Maintenance'],
  },
  {
    title: 'Pre-Screen Cleaning',
    description: 'How to inspect and clean the pre-screen on your Turbo II HD PreCleaner for peak airflow and efficiency.',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/><path d="M24 14v10l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tags: ['Turbo II HD', 'Maintenance'],
  },
  {
    title: 'Air Filter PreCleaner Installation',
    description: 'Complete installation guide for air filter pre-cleaners. Covers sizing, mounting options, stack adapter selection, and post-install verification.',
    icon: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none"><path d="M8 38V18l16-12 16 12v20a2 2 0 01-2 2H10a2 2 0 01-2-2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M18 40V28h12v12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    tags: ['Turbo II HD', 'Installation'],
  },
];

// ---------------------------------------------------------------------------
// Where-to-buy extra CSS (page-specific styles)
// ---------------------------------------------------------------------------

const wtbExtraCss = `<style>
.wtb-hero{position:relative;padding:calc(var(--header-height) + var(--space-3xl)) 0 var(--space-3xl);background:linear-gradient(135deg,var(--color-navy) 0%,var(--color-navy-mid) 100%);color:var(--color-white);text-align:center;overflow:hidden}.wtb-hero::before{content:'';position:absolute;inset:0;background:url('images/hero/our-products.jpg') center/cover no-repeat;opacity:.12}.wtb-hero .container{position:relative;z-index:1}.wtb-hero .section-eyebrow{color:var(--color-accent)}.wtb-hero-title{font-family:var(--font-serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:800;line-height:1.15;margin-bottom:var(--space-md)}.wtb-hero-sub{font-size:1.15rem;color:rgba(255,255,255,.75);max-width:620px;margin:0 auto;line-height:1.65}.channels{padding:var(--space-3xl) 0;background:var(--color-off-white)}.channels-grid{display:flex;flex-direction:column;gap:var(--space-xl);max-width:900px;margin:0 auto}.channel-card{background:var(--color-white);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);padding:var(--space-xl);display:grid;grid-template-columns:64px 1fr;gap:var(--space-lg);align-items:start;transition:box-shadow var(--transition),transform var(--transition);position:relative;overflow:hidden}.channel-card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:var(--color-accent);border-radius:4px 0 0 4px}.channel-card:hover{box-shadow:var(--shadow-lg);transform:translateY(-2px)}.channel-card.card-featured::before{background:var(--color-success)}.channel-icon{width:56px;height:56px;border-radius:var(--radius-md);background:var(--color-navy);display:flex;align-items:center;justify-content:center;color:var(--color-white);flex-shrink:0}.channel-icon svg{width:28px;height:28px}.channel-icon.icon-direct{background:var(--color-success)}.channel-icon.icon-fleet{background:var(--color-navy-mid)}.channel-icon.icon-cat{background:#FFCD11;color:var(--color-gray-900)}.channel-icon.icon-oem{background:var(--color-navy-light)}.channel-icon.icon-help{background:var(--color-accent)}.channel-body h3{font-family:var(--font-sans);font-size:1.3rem;font-weight:700;color:var(--color-navy);margin-bottom:var(--space-xs)}.channel-tag{display:inline-block;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border-radius:100px;margin-bottom:var(--space-sm)}.channel-tag.tag-recommended{background:rgba(34,197,94,.12);color:var(--color-success)}.channel-tag.tag-dealer{background:rgba(59,156,255,.12);color:var(--color-accent)}.channel-body p{font-size:.95rem;color:var(--color-gray-700);line-height:1.65;margin-bottom:var(--space-md)}.channel-body .btn{display:inline-flex;align-items:center;gap:6px}.channel-body .btn svg{width:16px;height:16px}.how-it-works{padding:var(--space-3xl) 0;background:var(--color-white)}.steps-row{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-xl);max-width:900px;margin:var(--space-2xl) auto 0}.step-item{text-align:center}.step-number{width:48px;height:48px;border-radius:50%;background:var(--color-navy);color:var(--color-white);font-weight:800;font-size:1.2rem;display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-md)}.step-item h4{font-size:1rem;font-weight:700;color:var(--color-navy);margin-bottom:var(--space-xs)}.step-item p{font-size:.88rem;color:var(--color-gray-500);line-height:1.55}@media(max-width:768px){.channel-card{grid-template-columns:1fr;padding:var(--space-lg)}.channel-icon{width:48px;height:48px}.steps-row{grid-template-columns:1fr;gap:var(--space-lg)}.step-item{display:grid;grid-template-columns:48px 1fr;gap:var(--space-md);text-align:left}.step-number{margin:0}.step-text{display:flex;flex-direction:column}}
</style>`;

// ---------------------------------------------------------------------------
// Page definitions
// ---------------------------------------------------------------------------

const pages = [
  {
    template: 'index',
    output: 'index.html',
    activeNav: 'home',
    headerScrolled: false,
    rootPath: '',
    pageTitle: 'EcoPro USA — Proven Protection for Heavy Equipment',
    pageDescription: 'EcoPro USA delivers tested, validated filtration, lighting, and protection products for heavy equipment fleets. Reduce costs, extend asset life, and protect your operators.',
    ctaHeadline: 'Ready to Protect Your Fleet?',
    ctaSub: "Talk to our team about the right products for your equipment. We'll help you select, size, and install — start to finish.",
    ctaPrimaryUrl: 'mailto:controller@ecoprousa.com',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
    ctaId: 'contact',
  },
  {
    template: 'about',
    output: 'about/index.html',
    activeNav: 'about',
    headerScrolled: true,
    rootPath: '../',
    pageTitle: 'About Us — EcoPro USA',
    pageDescription: 'EcoPro USA is an independent solutions company that works exclusively for the end user — selecting only the best, safest, and most proven products for heavy equipment.',
    heroImage: '../images/hero/our-products.jpg',
    heroEyebrow: 'About EcoPro USA',
    heroTitle: 'We Work for You —<br>Not the Manufacturer',
    heroSub: 'An independent solutions company that selects only the best, safest, and most proven products on the market — chosen for real-world performance, not brand loyalty.',
    ctaHeadline: 'Ready to Protect Your Fleet?',
    ctaSub: 'Talk to our team about the right products for your equipment.',
    ctaPrimaryUrl: '../contact/',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
  },
  {
    template: 'products',
    output: 'products/index.html',
    activeNav: 'products',
    headerScrolled: true,
    rootPath: '../',
    pageTitle: 'Products — EcoPro USA',
    pageDescription: 'Industrial-grade filtration, lighting, protection, and maintenance products for heavy equipment. 15 product lines including Turbo II PreCleaners, Cabin Air Pressurizers, LED HD Lights, and more.',
    heroImage: '../images/hero/slide-1-bg.jpg',
    heroEyebrow: 'Our Products',
    heroTitle: 'Engineered for the<br>Toughest Environments',
    heroSub: 'Every product is rigorously tested, independently validated, and proven in real-world operations. From pre-cleaners to LED lighting — built to earn their keep.',
    ctaHeadline: 'Ready to Protect Your Fleet?',
    ctaSub: "Talk to our team about the right products for your equipment. We'll help you select, size, and install — start to finish.",
    ctaPrimaryUrl: '../contact/',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
  },
  {
    template: 'contact',
    output: 'contact/index.html',
    activeNav: 'contact',
    headerScrolled: true,
    rootPath: '../',
    pageTitle: 'Contact Us — EcoPro USA',
    pageDescription: 'Get a quote, ask a question, or schedule a consultation. EcoPro USA is here to help you find the right products for your equipment.',
    heroImage: '../images/hero/slide-3-bg.jpg',
    heroEyebrow: 'Get in Touch',
    heroTitle: "Let's Talk About<br>Your Equipment",
    heroSub: "Whether you need a quote, product recommendation, or installation support — we're here to help.",
    ctaHeadline: 'Need Help Right Now?',
    ctaSub: 'Call us directly. Our team is ready to help you find the right solution for your fleet.',
    ctaPrimaryUrl: 'tel:8553267762',
    ctaPrimaryLabel: 'Call 855-ECO-PRO2',
  },
  {
    template: 'results',
    output: 'results/index.html',
    activeNav: 'results',
    headerScrolled: true,
    rootPath: '../',
    pageTitle: 'Results & Case Studies — EcoPro USA',
    pageDescription: 'Real outcomes from real operations. See how EcoPro USA products deliver measurable savings and proven performance across industries.',
    heroImage: '../images/hero/slidd-2-bg.jpg',
    heroEyebrow: 'Proven Results',
    heroTitle: 'Real Outcomes from<br>Real Operations',
    heroSub: "Don't take our word for it. Here's what happens when EcoPro products go to work.",
    ctaHeadline: 'See Results Like These?',
    ctaSub: 'Let us show you how EcoPro products can reduce costs and extend the life of your equipment.',
    ctaPrimaryUrl: '../contact/',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
  },
  {
    template: 'techcorner',
    output: 'techcorner/index.html',
    activeNav: 'techcorner',
    headerScrolled: true,
    rootPath: '../',
    pageTitle: 'Tech Corner — EcoPro USA',
    pageDescription: 'Technical articles, field service guides, and industry insights from EcoPro USA.',
    heroImage: '../images/hero/slide-1-bg.jpg',
    heroEyebrow: 'Tech Corner',
    heroTitle: 'Technical Resources<br>&amp; Field Guides',
    heroSub: 'Industry insights, product deep-dives, and field service guides to help you get the most out of your EcoPro products.',
    ctaHeadline: 'Have a Technical Question?',
    ctaSub: 'Our team is here to help with product selection, installation guidance, and troubleshooting.',
    ctaPrimaryUrl: '../contact/',
    ctaPrimaryLabel: 'Contact Us',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
  },
  {
    template: 'where-to-buy',
    output: 'where-to-buy/index.html',
    activeNav: 'where-to-buy',
    headerScrolled: false,
    rootPath: '../',
    pageTitle: 'Where to Buy — EcoPro USA',
    pageDescription: 'Find out where to buy EcoPro products — buy direct, through Caterpillar dealers, or other heavy equipment dealers nationwide.',
    extraCss: wtbExtraCss,
    ctaHeadline: 'Ready to Get Started?',
    ctaSub: "Talk to our team about the right products for your equipment. We're here to help — every step of the way.",
    ctaPrimaryUrl: 'mailto:controller@ecoprousa.com',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
    ctaId: 'contact',
  },
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log('Cleaning dist/...');
cleanDir(DIST);

console.log('Copying static assets...');
copyDirSync(STATIC, DIST);

console.log('Initializing template engine...');
const engine = new TemplateEngine(path.join(TEMPLATES, 'partials'));
const layoutTemplate = fs.readFileSync(path.join(TEMPLATES, 'layouts', 'base.html'), 'utf8');

console.log('Rendering pages...');

for (const page of pages) {
  // Build data context for this page
  const data = {
    ...page,
    logoUrl: page.rootPath || './',
    navItems: buildNavItems(page.activeNav, page.rootPath),
    company,
    contactFormUrl: '/api/contact',
    currentYear,
    clients: testimonials.clients,
    footerProducts: footerProducts.map(fp => ({ ...fp, url: page.rootPath + fp.url.replace(/^\//, '') })),
  };

  // Page-specific data
  if (page.template === 'index') {
    data.featuredProducts = featuredProductDefs.map(p => ({
      ...p,
      image: page.rootPath + p.image,
      url: page.rootPath + 'products/#' + (p.slug === 'clean-cabin-air-pressurizer' ? 'cabin' : p.slug === 'turbo-ii-hd' ? 'turbo' : p.slug === 'led-hd-lights' ? 'led' : p.slug === 'desiccant-breathers' ? 'desiccant' : p.slug === 'metal-adapters' ? 'adapters' : p.slug),
    }));
    data.caseStudies = testimonials.caseStudies;
    data.testimonials = testimonials.testimonials;
  }

  if (page.template === 'products') {
    data.productMenu = buildProductMenu(page.rootPath, '/products/');
    data.productCategories = categoryMapping.map(cat => {
      const catProducts = activeProducts.filter(cat.filter).slice(0, 6);
      return {
        name: cat.name,
        anchor: cat.slug,
        description: cat.description,
        viewAllUrl: catProducts.length > 5 ? page.rootPath + cat.url.replace(/^\//, '') : null,
        products: catProducts.map(p => ({
          name: p.name,
          shortDescription: (p.shortDescription || '').substring(0, 120) + ((p.shortDescription || '').length > 120 ? '...' : ''),
          image: p.images.main || (page.rootPath + 'images/placeholder.svg'),
          url: page.rootPath + 'product/' + p.slug + '/',
        })),
      };
    });
  }

  if (page.template === 'results') {
    data.caseStudies = caseStudiesWithStats;
    data.testimonials = testimonials.testimonials;
    data.clients = testimonials.clients;
  }

  if (page.template === 'techcorner') {
    data.articles = techArticles;
    data.fieldGuides = fieldGuides;
  }

  // Render page template
  const pageTemplate = fs.readFileSync(path.join(TEMPLATES, 'pages', page.template + '.html'), 'utf8');
  const pageBody = engine.render(pageTemplate, data);

  // Inject into layout
  data.body = pageBody;
  const fullHtml = engine.render(layoutTemplate, data);

  // Write output
  const outPath = path.join(DIST, page.output);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, fullHtml, 'utf8');
  console.log(`  ✓ ${page.output}`);
}

// ---------------------------------------------------------------------------
// Product detail pages — one per active product
// ---------------------------------------------------------------------------

console.log('Rendering product pages...');

const productDetailTemplate = fs.readFileSync(path.join(TEMPLATES, 'pages', 'product-detail.html'), 'utf8');

/**
 * Convert raw text with \\n separators into HTML paragraphs.
 */
function textToHtml(text) {
  if (!text) return '';
  // Split on \\n patterns and clean up
  const parts = text.split(/\\n/).map(s => s.trim()).filter(Boolean);
  return parts.map(p => `<p class="product-detail-desc">${p}</p>`).join('\n');
}

/**
 * Resolve product image — use local path if available, fall back to WP URL.
 */
function resolveProductImage(product, rootPath) {
  if (product.images.main) {
    return product.images.main;
  }
  return rootPath + 'images/placeholder.svg';
}

/**
 * Find related products: same category/subcategory, excluding self, max 3.
 */
function findRelated(product, allProducts, rootPath) {
  const related = allProducts
    .filter(p => p.slug !== product.slug && p.status === 'active')
    .filter(p => {
      if (product.subcategory && p.subcategory === product.subcategory) return true;
      if (p.category === product.category) return true;
      return false;
    })
    .slice(0, 3);

  return related.map(p => ({
    name: p.name,
    shortDescription: p.shortDescription ? p.shortDescription.substring(0, 120) + (p.shortDescription.length > 120 ? '...' : '') : '',
    image: p.images.main || (rootPath + 'images/placeholder.svg'),
    url: rootPath + 'product/' + p.slug + '/',
  }));
}

/**
 * Find the category URL for a given product (for breadcrumbs).
 */
function findCategoryUrl(product, rootPath) {
  for (const cat of categoryMapping) {
    if (cat.filter(product)) return rootPath + cat.url.replace(/^\//, '');
    for (const sub of cat.subcategories) {
      if (sub.filter(product)) return rootPath + cat.url.replace(/^\//, '');
    }
  }
  return rootPath + 'products/';
}

function findSubcategoryUrl(product, rootPath) {
  for (const cat of categoryMapping) {
    for (const sub of cat.subcategories) {
      if (sub.filter(product)) return rootPath + sub.url.replace(/^\//, '');
    }
  }
  return '';
}

let productCount = 0;

for (const product of activeProducts) {
  const rootPath = '../../';
  const data = {
    rootPath,
    logoUrl: rootPath,
    headerScrolled: true,
    navItems: buildNavItems('products', rootPath),
    company,
    currentYear,
    clients: testimonials.clients,
    footerProducts: footerProducts.map(fp => ({ ...fp, url: rootPath + fp.url.replace(/^\//, '') })),
    productMenu: buildProductMenu(rootPath, ''),
    pageTitle: `${product.name} — EcoPro USA`,
    pageDescription: product.shortDescription || `${product.name} from EcoPro USA. Proven protection for heavy equipment.`,
    heroImage: rootPath + 'images/hero/slide-1-bg.jpg',
    heroEyebrow: product.category,
    heroTitle: product.name,
    heroSub: product.shortDescription || 'Proven protection for heavy equipment — tested, validated, and backed by EcoPro USA.',
    ctaHeadline: 'Ready to Order?',
    ctaSub: "Contact us for pricing, availability, and installation support.",
    ctaPrimaryUrl: rootPath + 'where-to-buy/',
    ctaPrimaryLabel: 'Request a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
    product,
    productImage: resolveProductImage(product, rootPath),
    categoryUrl: findCategoryUrl(product, rootPath),
    subcategoryUrl: findSubcategoryUrl(product, rootPath),
    hasGallery: product.images.gallery && product.images.gallery.length > 0,
    tabDescription: !!product.tabs.description,
    tabInstallation: !!product.tabs.installation,
    tabMaintenance: !!product.tabs.maintenance,
    tabWarranty: !!product.tabs.warranty,
    tabPdfs: !!product.tabs.pdfsAndVideos,
    descriptionHtml: textToHtml(product.tabs.description),
    installationHtml: textToHtml(product.tabs.installation),
    maintenanceHtml: textToHtml(product.tabs.maintenance),
    warrantyHtml: textToHtml(product.tabs.warranty),
    pdfsHtml: textToHtml(product.tabs.pdfsAndVideos),
    relatedProducts: findRelated(product, activeProducts, rootPath),
  };

  const pageBody = engine.render(productDetailTemplate, data);
  data.body = pageBody;
  const fullHtml = engine.render(layoutTemplate, data);

  const outPath = path.join(DIST, 'product', product.slug, 'index.html');
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, fullHtml, 'utf8');
  productCount++;
}

console.log(`  ✓ ${productCount} product pages`);

// ---------------------------------------------------------------------------
// Category & subcategory listing pages
// ---------------------------------------------------------------------------

console.log('Rendering category pages...');

const categoryTemplate = fs.readFileSync(path.join(TEMPLATES, 'pages', 'product-category.html'), 'utf8');
let categoryCount = 0;

for (const cat of categoryMapping) {
  const catProducts = activeProducts.filter(cat.filter);

  // Determine rootPath based on output depth: products/turbo-ii-hd/ → ../../
  const rootPath = '../../';
  const outputPath = `products/${cat.slug}/index.html`;

  const data = {
    rootPath,
    logoUrl: rootPath,
    headerScrolled: true,
    navItems: buildNavItems('products', rootPath),
    company,
    currentYear,
    clients: testimonials.clients,
    footerProducts: footerProducts.map(fp => ({ ...fp, url: rootPath + fp.url.replace(/^\//, '') })),
    productMenu: buildProductMenu(rootPath, cat.url),
    pageTitle: `${cat.name} — EcoPro USA`,
    pageDescription: cat.description,
    heroImage: rootPath + cat.heroImage,
    heroEyebrow: 'Products',
    heroTitle: cat.name,
    heroSub: cat.description,
    ctaHeadline: 'Need Help Choosing?',
    ctaSub: "Our team can help you find the right product for your equipment.",
    ctaPrimaryUrl: rootPath + 'where-to-buy/',
    ctaPrimaryLabel: 'Get a Quote',
    ctaSecondaryUrl: 'tel:8553267762',
    ctaSecondaryLabel: 'Call 855-ECO-PRO2',
    categoryName: cat.name,
    categoryDescription: cat.description,
    productCount: catProducts.length,
    productCountPlural: catProducts.length !== 1,
    categoryProducts: catProducts.map(p => ({
      name: p.name,
      shortDescription: (p.shortDescription || '').substring(0, 140) + ((p.shortDescription || '').length > 140 ? '...' : ''),
      image: p.images.main || (rootPath + 'images/placeholder.svg'),
      url: rootPath + 'product/' + p.slug + '/',
    })),
  };

  const pageBody = engine.render(categoryTemplate, data);
  data.body = pageBody;
  const fullHtml = engine.render(layoutTemplate, data);

  const outPath = path.join(DIST, outputPath);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, fullHtml, 'utf8');
  categoryCount++;

  // Generate subcategory pages
  for (const sub of cat.subcategories) {
    const subProducts = activeProducts.filter(sub.filter);
    if (subProducts.length === 0) continue;

    // products/turbo-ii-hd/kits/ → ../../../
    const subRootPath = '../../../';
    const subOutputPath = sub.url.replace(/^\//, '').replace(/\/$/, '') + '/index.html';

    const subData = {
      rootPath: subRootPath,
      logoUrl: subRootPath,
      headerScrolled: true,
      navItems: buildNavItems('products', subRootPath),
      company,
      currentYear,
      clients: testimonials.clients,
      footerProducts: footerProducts.map(fp => ({ ...fp, url: subRootPath + fp.url.replace(/^\//, '') })),
      productMenu: buildProductMenu(subRootPath, sub.url),
      pageTitle: `${sub.name} — ${cat.name} — EcoPro USA`,
      pageDescription: `${sub.name} for ${cat.name} from EcoPro USA.`,
      heroImage: subRootPath + cat.heroImage,
      heroEyebrow: cat.name,
      heroTitle: sub.name,
      heroSub: `${sub.name} for ${cat.name} — browse ${subProducts.length} product${subProducts.length !== 1 ? 's' : ''}.`,
      ctaHeadline: 'Need Help Choosing?',
      ctaSub: "Our team can help you find the right product for your equipment.",
      ctaPrimaryUrl: subRootPath + 'where-to-buy/',
      ctaPrimaryLabel: 'Get a Quote',
      ctaSecondaryUrl: 'tel:8553267762',
      ctaSecondaryLabel: 'Call 855-ECO-PRO2',
      categoryName: sub.name,
      categoryDescription: `${sub.name} for ${cat.name}.`,
      productCount: subProducts.length,
      productCountPlural: subProducts.length !== 1,
      categoryProducts: subProducts.map(p => ({
        name: p.name,
        shortDescription: (p.shortDescription || '').substring(0, 140) + ((p.shortDescription || '').length > 140 ? '...' : ''),
        image: p.images.main || (subRootPath + 'images/placeholder.svg'),
        url: subRootPath + 'product/' + p.slug + '/',
      })),
    };

    const subPageBody = engine.render(categoryTemplate, subData);
    subData.body = subPageBody;
    const subFullHtml = engine.render(layoutTemplate, subData);

    const subOutPath = path.join(DIST, subOutputPath);
    ensureDir(path.dirname(subOutPath));
    fs.writeFileSync(subOutPath, subFullHtml, 'utf8');
    categoryCount++;
  }
}

console.log(`  ✓ ${categoryCount} category pages`);

const totalPages = pages.length + productCount + categoryCount;
console.log(`\nBuild complete! ${totalPages} pages → dist/`);
