// ============================================================
//  PRODUCT DETAIL JAVASCRIPT
//
//  Colour gallery:
//   The strip under the main image is a horizontal row of
//   small images, one per colour of the same product.
//
//   Order:
//     1. The parent product is ALWAYS the FIRST tile and the
//        default selection. Its image is the parent image, its
//        price is the parent price, its stock is the parent
//        stock. Its displayed colour name is the parent's own
//        `color` when set, otherwise the neutral word
//        "Standard". The product name is never used as a
//        colour.
//     2. Every real product_variant follows, in server order.
//        A variant named exactly "Default" (case-insensitive)
//        is hidden from the gallery.
//
//   Selection:
//     - Clicking a tile selects that colour.
//     - Sweeping the strip horizontally (touch or mouse drag)
//       selects the nearest tile as it snaps.
//     - The left / right arrow buttons step to the previous
//       or next tile.
//     - The active tile is outlined and slightly raised.
//
//   What changes when a colour is selected:
//     - the main image (or video),
//     - the colour name next to `Color:`,
//     - the price, old price, and discount,
//     - the stock.
//
//   Everything else on the page stays exactly as it is.
//
//  Pinned footer:
//   The footer is injected by this file so it is guaranteed to
//   reach the browser through the same path that already loads
//   the product variants. It replaces any old footer that may
//   still be present on the page and installs the pinned
//   three-cell version (brand | thank-you | legal links).
// ============================================================

const urlParams = new URLSearchParams(window.location.search);
let productId = urlParams.get('id');
if (!productId) {
  document.getElementById('detailContent').innerHTML = '<p style="color:#ef4444;">Product ID missing.</p>';
}

let detailQty = 1;

// Colour gallery state.
let colourTiles = [];
let selectedColourKey = 'parent';

// Media state for the currently selected colour.
let currentMediaIndex = 0;

let currentProduct = null;
let allVariants = [];

function fallbackMediaUrl(product) {
  if (product && product.image) return product.image;
  const label = String(product && product.name ? product.name : 'Product').slice(0, 32).replace(/[<>&]/g, '');
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" fill="#475569">Product image</text><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="#64748b">${label}</text></svg>`)}`;
}

// ============================================================
//  GET AUTO SOCIAL LINKS
// ============================================================
function getAutoSocialLinks(product) {
  const shop = product || {};
  const tile = getSelectedTile();
  const productUrl = new URL(window.location.href);
  productUrl.searchParams.delete('cartAdd');
  productUrl.searchParams.delete('cartQty');
  if (tile && tile.name) productUrl.searchParams.set('variant', tile.name);
  const mediaUrl = (tile && (tile.video || tile.image)) || shop.video || shop.image ||
    (Array.isArray(shop.videos) && shop.videos[0]) || (Array.isArray(shop.images) && shop.images[0]) || '';
  const productDescription = `${shop.name || 'this product'}${tile && tile.name && tile.name !== 'Standard' ? ` (${tile.name})` : ''}`;
  const price = tile && tile.price ? tile.price : shop.price;
  const inquiry = `I want to know more information about this: ${productDescription}${price ? `\nPrice: Ksh ${price}` : ''}\nProduct details: ${productUrl.href}${mediaUrl ? `\nProduct image/video: ${mediaUrl}` : ''}`;
  const encodedMessage = encodeURIComponent(inquiry);
  const whatsappNumber = shop.business_whatsapp || '';
  const instagramUser = shop.business_instagram || '';
  const facebookUser = shop.business_facebook || '';
  const tiktokUser = shop.business_tiktok || '';
  const phone = shop.business_phone || '';
  const cleanedWhatsapp = whatsappNumber.replace(/[^0-9]/g, '');
  return {
    whatsapp: cleanedWhatsapp ? `https://wa.me/${cleanedWhatsapp}?text=${encodedMessage}` : '',
    instagram: instagramUser ? `https://www.instagram.com/${instagramUser.replace('@', '').trim()}/` : '',
    messenger: facebookUser ? `https://m.me/${facebookUser.replace('@', '').trim()}?text=${encodedMessage}` : '',
    tiktok: tiktokUser ? `https://www.tiktok.com/@${tiktokUser.replace('@', '').trim()}` : '',
    phone: phone ? `sms:${phone}?body=${encodedMessage}` : '',
    call: phone ? `tel:${phone}` : '',
    inquiry: encodedMessage
  };
}

function updateProductInquiryLinks() {
  if (!currentProduct) return;
  const links = getAutoSocialLinks(currentProduct);
  const selectors = {
    whatsapp: '.social-icons .whatsapp',
    instagram: '.social-icons .instagram',
    messenger: '.social-icons .messenger',
    tiktok: '.social-icons .tiktok',
    phone: '.social-icons a[href^="sms:"]',
    call: '.social-icons a[href^="tel:"]'
  };
  Object.entries(selectors).forEach(([key, selector]) => {
    const anchor = document.querySelector(selector);
    if (anchor && links[key]) anchor.href = links[key];
  });
  document.querySelectorAll('.social-icons .instagram, .social-icons .tiktok').forEach(anchor => {
    anchor.dataset.inquiry = links.inquiry;
  });
}

function copyProductInquiryForContact(event) {
  const encodedInquiry = event && event.currentTarget && event.currentTarget.dataset.inquiry;
  if (!encodedInquiry) return;
  const inquiry = decodeURIComponent(encodedInquiry);
  const copyFallback = () => {
    const field = document.createElement('textarea');
    field.value = inquiry;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try { document.execCommand('copy'); } catch (_) {}
    field.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inquiry).catch(copyFallback);
  } else {
    copyFallback();
  }
}

// ============================================================
//  ORDER RELATED PRODUCTS \u{1F504}\u201D Option B
// ============================================================
function orderRelatedForDisplay(related, viewedProduct) {
  if (!Array.isArray(related) || related.length === 0) return [];

  const sameCategoryId = viewedProduct && viewedProduct.product_category_id
    ? viewedProduct.product_category_id
    : null;

  if (!sameCategoryId) return related.slice();

  const sameCategory = [];
  const otherCategories = [];

  related.forEach(item => {
    if (item && item.product_category_id === sameCategoryId) {
      sameCategory.push(item);
    } else {
      otherCategories.push(item);
    }
  });

  if (sameCategory.length === 0) return related.slice();

  return sameCategory.concat(otherCategories);
}

// ============================================================
//  BUILD COLOUR TILES
// ============================================================
function buildColourTiles(product, variants) {
  const tiles = [];

  const parentColour = (product && product.color ? String(product.color).trim() : '');
  const parentImage  = product && product.image ? product.image : '';
  const parentVideo  = product && product.video ? product.video : null;

  const parentFallbackName = 'Standard';
  const parentName = parentColour.length > 0 ? parentColour : parentFallbackName;

  // The parent tile is ALWAYS created and is always first.
  tiles.push({
    key: 'parent',
    variantId: null,
    name: parentName,
    image: parentImage,
    video: parentVideo,
    price: product && product.price ? String(product.price) : null,
    oldPrice: product && product.old_price ? String(product.old_price) : null,
    stock: product && product.stock != null ? Number(product.stock) : null,
    isDefaultName: false
  });

  // Filter out any "Default" variant. It is never shown next to
  // the parent tile.
  const list = Array.isArray(variants) ? variants.slice() : [];
  const namedVariants = list.filter(v => {
    const n = String(v && v.name ? v.name : '').trim().toLowerCase();
    return n !== '' && n !== 'default';
  });

  namedVariants.forEach(v => {
    if (!v) return;
    const name = String(v.name || '').trim() || parentName;

    const price = v.price != null && String(v.price).trim() !== ''
      ? String(v.price)
      : (product && product.price ? String(product.price) : null);

    const oldPrice = v.old_price != null && String(v.old_price).trim() !== ''
      ? String(v.old_price)
      : (product && product.old_price ? String(product.old_price) : null);

    const stock = v.stock != null
      ? Number(v.stock)
      : (product && product.stock != null ? Number(product.stock) : null);

    tiles.push({
      key: 'variant:' + v.id,
      variantId: v.id,
      name: name,
      image: v.image || parentImage,
      video: v.video || null,
      price: price,
      oldPrice: oldPrice,
      stock: stock,
      isDefaultName: false
    });
  });

  return tiles;
}

// ============================================================
//  GET SELECTED TILE
// ============================================================
// ============================================================
//  URL VARIANT SYNC  (Phase 2 completion)
// ============================================================
function readVariantFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get('variant') || '').trim();
    if (!raw) return null;
    const needle = raw.toLowerCase();
    const tile = (colourTiles || []).find(t =>
      String(t && t.name ? t.name : '').trim().toLowerCase() === needle
    );
    return tile ? tile.key : null;
  } catch (err) {
    return null;
  }
}

function writeVariantToUrl(tile) {
  if (!tile || !tile.name) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', String(tile.name));
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch (err) {
    // Non-fatal.
  }
}

// ============================================================
//  MIXED-MEDIA TOGGLE  (Phase 2 completion)
// ============================================================
function renderMixedMediaToggle(tile) {
  const mediaHost = document.getElementById('detailMainMedia');
  if (!mediaHost) return;

  const existing = document.getElementById('detailMediaToggle');
  if (existing) existing.remove();

  if (!tile) return;

  const hasImage = Boolean(tile.image);
  const hasVideo = Boolean(tile.video);

  if (!(hasImage && hasVideo)) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'detailMediaToggle';
  wrapper.className = 'detail-media-toggle';
  wrapper.innerHTML =
    '<button type="button" data-kind="video" class="is-active">' +
      '<i class="fas fa-video"></i> Video' +
    '</button>' +
    '<button type="button" data-kind="image">' +
      '<i class="fas fa-image"></i> Image' +
    '</button>';

  wrapper.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      wrapper.querySelectorAll('button').forEach(b =>
        b.classList.toggle('is-active', b.dataset.kind === kind)
      );

      if (kind === 'video' && tile.video) {
        mediaHost.innerHTML =
          '<video src="' + tile.video + '" controls preload="metadata">' +
          'Your browser cannot play this video.</video>';
      } else if (kind === 'image') {
        const url = tile.image || fallbackMediaUrl({ name: tile.name });
        mediaHost.innerHTML =
          '<img src="' + url + '" alt="' + tile.name + '" ' +
          'onerror="this.onerror=null;this.src=fallbackMediaUrl({name:this.alt})">';
      }
    });
  });

  mediaHost.insertAdjacentElement('afterend', wrapper);
}
function getSelectedTile() {
  if (!Array.isArray(colourTiles) || colourTiles.length === 0) return null;
  return colourTiles.find(t => t.key === selectedColourKey) || colourTiles[0];
}

// ============================================================
//  LOAD PRODUCT DETAIL
// ============================================================
async function loadProductDetail() {
  try {
    const res = await fetch(`/api/products/${productId}/detail`);
    if (!res.ok) throw new Error('Product not found');
    const data = await res.json();
    currentProduct = data.product;
    allVariants = data.variants || [];

    colourTiles = buildColourTiles(currentProduct, allVariants);

    (function () {
      const urlKey = readVariantFromUrl();
      if (urlKey && colourTiles.some(t => t.key === urlKey)) {
        selectedColourKey = urlKey;
      }
    })();

    if (!colourTiles.some(t => t.key === selectedColourKey)) {
      selectedColourKey = colourTiles.length > 0 ? colourTiles[0].key : 'parent';
    }

    currentMediaIndex = 0;

    const related = orderRelatedForDisplay(data.related || [], data.product);

    renderDetail(data.product, related);
    resumeProductCartIntent();
  } catch (err) {
    document.getElementById('detailContent').innerHTML = `<p style="color:#ef4444;">Error: ${err.message}</p>`;
  }
}

// ============================================================
//  RENDER DETAIL
// ============================================================
function renderDetail(product, related) {
  const container = document.getElementById('detailContent');

  const tile = getSelectedTile();

  // ---------- Media (for the selected colour) ----------
  let media = [];
  if (tile && tile.image) {
    media.push({ id: null, type: 'image', url: tile.image });
  }
  const productImages = Array.isArray(product.images) ? product.images : [];
  const productVideos = Array.isArray(product.videos) ? product.videos : [];
  if (tile && tile.video) {
    media.push({ id: null, type: 'video', url: tile.video });
  }
  productImages.forEach(url => {
    if (!media.some(m => m.url === url)) media.push({ id: null, type: 'image', url });
  });
  productVideos.forEach(url => {
    if (!media.some(m => m.url === url)) media.push({ id: null, type: 'video', url });
  });
  if (!media.length) media.push({ id: null, type: 'image', url: fallbackMediaUrl(product) });
  if (currentMediaIndex >= media.length) currentMediaIndex = 0;

  // ---------- Colour name ----------
  const selectedColourName = tile ? tile.name : (product.color || product.name || 'Standard');

  // ---------- Price ----------
  const currentPrice = tile && tile.price ? tile.price : product.price;
  const oldPrice     = tile && tile.oldPrice ? tile.oldPrice : product.old_price;
  let priceHtml = `
    <div class="price-section">
      <span class="current-price">Ksh ${parseFloat(currentPrice).toFixed(2)}</span>
  `;
  if (oldPrice && parseFloat(oldPrice) > parseFloat(currentPrice)) {
    priceHtml += `<span class="old-price">Ksh ${parseFloat(oldPrice).toFixed(2)}</span>`;
  }
  priceHtml += `</div>`;

  // ---------- Stock ----------
  const stockDisplay = tile && tile.stock != null ? tile.stock : (product.stock != null ? product.stock : 999);
  const stockHtml = `
    <div class="stock-info">
      ${stockDisplay > 0 ?
        `<span class="in-stock">\u2705 In Stock (${stockDisplay} available)</span>` :
        `<span class="out-of-stock">\u2212 Out of Stock</span>`}
    </div>
  `;

  // ---------- Rating ----------
  const ratingValue = parseFloat(product.avg_rating) || 0;
  const fullStars = Math.round(ratingValue);
  let ratingHtml = '';
  if (ratingValue > 0) {
    ratingHtml = `
      <div class="rating-section">
        <span class="stars">${'\u{1F4E6}'.repeat(Math.min(fullStars, 5))}</span>
        <span class="rating-text">${ratingValue.toFixed(1)}</span>
        <span class="review-count">(${product.review_count || 0} reviews)</span>
      </div>
    `;
  }

  // ---------- Category chip ----------
  const categoryChipHtml = product.product_category_name
    ? `<div class="product-category-chip" title="${product.product_category_name}">${product.product_category_icon || '\u2705??'} ${product.product_category_name}</div>`
    : '';

  // ---------- Badges ----------
  let badgesHtml = '';
  if (product.badge1) badgesHtml += `<span class="badge badge-green">${product.badge1}</span>`;
  if (product.badge2) badgesHtml += `<span class="badge badge-blue">${product.badge2}</span>`;
  if (product.isFlashSale) badgesHtml += `<span class="badge tag-flash">\u{1F4DE}?\u201D?? Flash Sale</span>`;
  if (product.isNewArrival) badgesHtml += `<span class="badge tag-new">\u{1F6D2}? New</span>`;
  if (badgesHtml) badgesHtml = `<div class="badges">${badgesHtml}</div>`;

  // ---------- Description / services / return ----------
  const descriptionText = String(product.description || 'No description available for this product.').slice(0, 180);
  const descriptionHtml = `<div class="description">${descriptionText.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</div>`;

  let servicesHtml = '';
  servicesHtml = '';

  const returnPolicy = String(product.business_return_policy || '').trim();
  const safeReturnPolicy = returnPolicy.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const returnPolicyHtml = `
    <details class="return-policy">
      <summary>See return policy</summary>
      <div class="return-policy-content">${safeReturnPolicy || 'You can ask the business about the return policy of this product.'}</div>
    </details>`;

  // ---------- Contact ----------
  const socialLinks = getAutoSocialLinks(product);
  let contactRatingHtml = '';
  if (ratingValue > 0) {
    contactRatingHtml = `
      <div class="product-rating-display">
        <span class="stars">${'\u{1F4E6}'.repeat(Math.min(fullStars, 5))}</span>
        <span class="rating-value">${ratingValue.toFixed(1)}</span>
        <span class="review-count">(${product.review_count || 0} reviews)</span>
      </div>
    `;
  } else {
    contactRatingHtml = `
      <div class="product-rating-display">
        <span style="color:#94a3b8; font-size:0.8rem;">No ratings yet. Be the first to rate!</span>
      </div>
    `;
  }

  const contactHtml = `
    <div class="contact-us-section">
      <details class="product-enquiry">
        <summary>Enquire more about this product</summary>
      ${contactRatingHtml}
      <div class="social-icons" style="margin-top:6px;">
        ${socialLinks.whatsapp ? `<a href="${socialLinks.whatsapp}" target="_blank" rel="noopener" class="whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>` : ''}
        ${socialLinks.instagram ? `<a href="${socialLinks.instagram}" target="_blank" rel="noopener" class="instagram" data-inquiry="${socialLinks.inquiry}" onclick="copyProductInquiryForContact(event)"><i class="fab fa-instagram"></i> Instagram</a>` : ''}
        ${socialLinks.messenger ? `<a href="${socialLinks.messenger}" target="_blank" rel="noopener" class="messenger"><i class="fab fa-facebook-messenger"></i> Messenger</a>` : ''}
        ${socialLinks.tiktok ? `<a href="${socialLinks.tiktok}" target="_blank" rel="noopener" class="tiktok" data-inquiry="${socialLinks.inquiry}" onclick="copyProductInquiryForContact(event)"><i class="fab fa-tiktok"></i> TikTok</a>` : ''}
        ${socialLinks.phone ? `<a href="${socialLinks.phone}" class="phone"><i class="fas fa-comment-sms"></i> SMS</a><a href="${socialLinks.call}" class="phone"><i class="fas fa-phone"></i> Call</a>` : ''}
      </div>
      </details>
    </div>
  `;

  // ---------- Main media ----------
  let mainMediaHtml = '';
  if (media.length > 0 && media[currentMediaIndex]) {
    mainMediaHtml = media[currentMediaIndex].type === 'video'
      ? `<video src="${media[currentMediaIndex].url}" controls preload="metadata">Your browser cannot play this video.</video>`
      : `<img src="${media[currentMediaIndex].url}" alt="${product.name}" onerror="this.onerror=null;this.src=fallbackMediaUrl({name:this.alt})">`;
  } else {
    mainMediaHtml = '<div class="no-image">\u2705??</div>';
  }

  // ---------- Colour gallery ----------
  const galleryHtml = renderColourGallery(colourTiles);

  // ---------- Related ----------
  let relatedHtml = '';
  const relatedCart = typeof getCart === 'function' ? getCart() : [];
  (related || []).forEach(item => { item.image = fallbackMediaUrl(item); });
  if (related && related.length > 0) {
    relatedHtml = related.map(p => `
      <div class="related-item"
           data-name="${(p.name || '').toLowerCase()}"
           data-category="${(p.category || '').toLowerCase()}"
           data-category-id="${p.product_category_id || ''}"
           onclick="location.href='/product-detail.html?id=${p.id}&business=${encodeURIComponent(product.business_slug || '')}'">
        <div class="related-media">
          ${p.image ? `<img src="${escapeProductCardText(p.image)}" alt="${escapeProductCardText(p.name || 'Product image')}">` : `<div class="no-image">\u2705??</div>`}
          ${p.image ? `<button type="button" class="related-image-preview" data-image-src="${escapeProductCardText(p.image)}" data-image-alt="${escapeProductCardText(p.name || 'Product image')}" onclick="event.stopPropagation(); openRelatedImagePreview(this)"><i class="fas fa-expand-alt" aria-hidden="true"></i> Preview</button>` : ''}
        </div>
        <div class="related-info">
          <div class="related-title-row"><div class="related-name">${escapeProductCardText(p.name || '')}</div></div>
          ${p.description ? `<div class="related-description"><span class="related-description-text">${escapeProductCardText(p.description)}</span></div>` : ''}
          <div class="related-purchase-row">
            <div class="related-price">${escapeProductCardText(p.price || '')}</div>
            ${p.description ? `<button type="button" class="related-description-toggle" aria-expanded="false" onclick="event.stopPropagation(); toggleRelatedDescription(this)">More</button>` : ''}
          </div>
          <div class="related-cart-actions" onclick="event.stopPropagation()">
            <div class="related-qty-control" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" onclick="changeRelatedProductQty(${Number(p.id)}, -1)">−</button>
              <span id="relatedQty-${Number(p.id)}">1</span>
              <button type="button" aria-label="Increase quantity" onclick="changeRelatedProductQty(${Number(p.id)}, 1)">+</button>
            </div>
            <button type="button" class="related-add-to-cart" onclick="addRelatedProductToCart(${Number(p.id)}, this)">${relatedCart.some(item => Number(item.id) === Number(p.id)) ? 'Add More' : 'Add to Cart'}</button>
            <button type="button" class="related-talk-to-business" onclick="event.stopPropagation(); openProductInquiry(${Number(p.id)}, this)"><i class="fas fa-comments" aria-hidden="true"></i> Let's Talk</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // ---------- Related filter dropdown ----------
  const definedCategoryOptions = [...new Map(
    (related || [])
      .filter(item => item.product_category_id && item.product_category_name)
      .map(item => [String(item.product_category_id), item.product_category_name])
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const legacyCategoryOptions = [...new Set(
    (related || []).map(item => item.category).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  let relatedFilterOptions = '<option value="all">All product categories</option>';
  if (definedCategoryOptions.length > 0) {
    relatedFilterOptions += `<optgroup label="Defined categories">${definedCategoryOptions
      .map(([id, name]) => `<option value="id:${id}">${name}</option>`)
      .join('')}</optgroup>`;
  }
  if (legacyCategoryOptions.length > 0) {
    relatedFilterOptions += `<optgroup label="Other categories">${legacyCategoryOptions
      .map(category => `<option value="name:${category.toLowerCase()}">${category}</option>`)
      .join('')}</optgroup>`;
  }

  // ---------- Cart button ----------
  const isInCart = getCart().some(item =>
    item.id === product.id &&
    (tile && tile.variantId !== null ? item.variant_id === tile.variantId : true)
  );
  const btnText = isInCart ? 'Add More' : 'Add to Cart';
  const btnClass = isInCart ? 'in-cart' : '';

  // ---------- Render ----------
  container.innerHTML = `
    <div class="detail-container">
      <div class="detail-media">
        <div class="detail-main-media" id="detailMainMedia">${mainMediaHtml}</div>
        <div class="colour-gallery" id="colourGallery" data-tile-count="${colourTiles.length}">
          ${galleryHtml}
        </div>
      </div>

      <div class="detail-info">
        <div class="name">${product.name}</div>
        ${categoryChipHtml}
        ${ratingHtml}
        <div class="colour-line">
          <span class="label">Color:</span>
          <span class="value" id="detailColourName">${selectedColourName}</span>
        </div>
        ${priceHtml}
        ${stockHtml}
        ${badgesHtml}
        ${descriptionHtml}
        ${servicesHtml}
        ${returnPolicyHtml}

        <div class="qty-section">
          <span class="qty-label">Quantity:</span>
          <div class="qty-control">
            <button onclick="changeDetailQty(-1)">\u2212</button>
            <span id="detailQty">${detailQty}</span>
            <button onclick="changeDetailQty(1)">+</button>
          </div>
        </div>

        <div class="button-group">
          <button class="btn-add-large ${btnClass}" onclick="addVariantToCart()">${btnText}</button>
          <button type="button" class="product-talk-to-business" onclick="openProductInquiry(${Number(product.id)}, this)"><i class="fas fa-comments" aria-hidden="true"></i> Let's Talk</button>
        </div>

        ${contactHtml}
      </div>
    </div>

    <div class="related-products">
      <h3>You may also like</h3>
      <div class="products-filters related-filters">
        <input id="relatedProductSearch" type="search" placeholder="Search this business's products" oninput="filterRelatedProducts()">
        <select id="relatedProductCategory" onchange="filterRelatedProducts()">${relatedFilterOptions}</select>
      </div>
      <div class="related-grid">${relatedHtml}</div>
    </div>
  `;

  renderThankYouBand(product);
  wireColourGallery();
  updateArrowsVisibility();

  if (typeof writeVariantToUrl === 'function') writeVariantToUrl(tile);
  if (typeof renderMixedMediaToggle === 'function') renderMixedMediaToggle(tile);
}

function escapeProductCardText(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function toggleRelatedDescription(button) {
  const description = button.closest('.related-item')?.querySelector('.related-description');
  if (!description) return;
  const expanded = description.classList.toggle('is-expanded');
  const card = button.closest('.related-item');
  card?.querySelectorAll('.related-description-toggle').forEach(toggle => {
    toggle.textContent = expanded ? 'Less' : 'More';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
}

function openRelatedImagePreview(button) {
  const modal = document.getElementById('relatedImagePreviewModal');
  const image = document.getElementById('relatedImagePreviewImage');
  if (!modal || !image || !button?.dataset.imageSrc) return;
  image.src = button.dataset.imageSrc;
  image.alt = button.dataset.imageAlt || 'Product image';
  modal.classList.add('active');
  document.body.classList.add('related-image-preview-open');
}

function closeRelatedImagePreview() {
  const modal = document.getElementById('relatedImagePreviewModal');
  const image = document.getElementById('relatedImagePreviewImage');
  modal?.classList.remove('active');
  image?.removeAttribute('src');
  document.body.classList.remove('related-image-preview-open');
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeRelatedImagePreview();
});

async function addRelatedProductToCart(productId, button) {
  const id = Number(productId);
  if (!Number.isFinite(id) || !button) return;
  const qtySpan = document.getElementById(`relatedQty-${id}`);
  const quantity = Math.max(1, Number.parseInt(qtySpan?.textContent || '1', 10) || 1);
  button.disabled = true;
  button.textContent = 'Adding…';
  try {
    const result = await postProductToCart(id, null, quantity);
    if (result.authRequired) {
      queueProductForCartAfterAuth(id, null, quantity);
      return;
    }
    button.textContent = 'Add More';
    notifyProductCart(`Added ${quantity} "${result.item.name}" to cart.`, 'success');
  } catch (error) {
    notifyProductCart(error.message || 'Unable to add this product to your cart.', 'error');
  } finally {
    button.disabled = false;
  }
}

function changeRelatedProductQty(productId, delta) {
  const qty = document.getElementById(`relatedQty-${Number(productId)}`);
  if (!qty) return;
  const current = Number.parseInt(qty.textContent, 10) || 1;
  qty.textContent = String(Math.max(1, Math.min(99, current + Number(delta || 0))));
}

// ============================================================
//  COLOUR GALLERY \u{1F504}\u201D rendering
// ============================================================
function renderColourGallery(tiles) {
  if (!Array.isArray(tiles) || tiles.length === 0) return '';

  const arrowLeft =
    '<button type="button" class="colour-gallery-arrow colour-gallery-arrow--left" ' +
      'aria-label="Previous colour" onclick="stepColourGallery(-1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>';

  const arrowRight =
    '<button type="button" class="colour-gallery-arrow colour-gallery-arrow--right" ' +
      'aria-label="Next colour" onclick="stepColourGallery(1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>';

  const tilesHtml = tiles.map(tile => {
    const active = tile.key === selectedColourKey ? 'is-active' : '';
    const img = tile.image || fallbackMediaUrl({ name: tile.name });
    const safeName = String(tile.name).replace(/"/g, '&quot;');
    return `
      <button type="button"
              class="colour-tile ${active}"
              data-colour-key="${tile.key}"
              title="${safeName}"
              onclick="selectColour('${tile.key}')">
        <img src="${img}" alt="${safeName}" loading="lazy">
        <span class="colour-tile-name">${safeName}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="colour-gallery-track">
      ${arrowLeft}
      <div class="colour-gallery-scroller" id="colourGalleryScroller" tabindex="0">
        ${tilesHtml}
      </div>
      ${arrowRight}
    </div>
  `;
}

// ============================================================
//  COLOUR GALLERY \u{1F504}\u201D interaction wiring
// ============================================================
function wireColourGallery() {
  const scroller = document.getElementById('colourGalleryScroller');
  if (!scroller) return;

  let pointerDown = false;
  let startX = 0;
  let startScroll = 0;

  const onDown = (clientX) => {
    pointerDown = true;
    startX = clientX;
    startScroll = scroller.scrollLeft;
  };
  const onMove = (clientX) => {
    if (!pointerDown) return;
    const dx = clientX - startX;
    scroller.scrollLeft = startScroll - dx;
  };
  const onUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    snapToNearestTile();
  };

  scroller.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) onDown(e.touches[0].clientX);
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX);
  }, { passive: true });

  scroller.addEventListener('touchend', onUp);
  scroller.addEventListener('touchcancel', onUp);

  scroller.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onDown(e.clientX);
  });
  window.addEventListener('mousemove', (e) => {
    if (pointerDown) onMove(e.clientX);
  });
  window.addEventListener('mouseup', onUp);
}

function snapToNearestTile() {
  const scroller = document.getElementById('colourGalleryScroller');
  if (!scroller) return;

  const centre = scroller.scrollLeft + scroller.clientWidth / 2;
  const tiles = Array.from(scroller.querySelectorAll('.colour-tile'));
  if (tiles.length === 0) return;

  let closest = tiles[0];
  let smallest = Infinity;

  tiles.forEach(tile => {
    const tileCentre = tile.offsetLeft + tile.offsetWidth / 2;
    const dist = Math.abs(tileCentre - centre);
    if (dist < smallest) {
      smallest = dist;
      closest = tile;
    }
  });

  const key = closest.dataset.colourKey;
  if (key && key !== selectedColourKey) {
    selectColour(key, { keepScroll: true });
  }
}

// ============================================================
//  COLOUR SELECTION (in-place update)
// ============================================================
function selectColour(key, options) {
  const opts = options || {};
  const tile = colourTiles.find(t => t.key === key);
  if (!tile) return;

  if (key === selectedColourKey && !opts.force) return;

  selectedColourKey = key;
  currentMediaIndex = 0;

  const colourNameEl = document.getElementById('detailColourName');
  if (colourNameEl) colourNameEl.textContent = tile.name;

  const priceSection = document.querySelector('.price-section');
  if (priceSection) {
    const currentPrice = tile.price || (currentProduct && currentProduct.price) || '0';
    const oldPrice = tile.oldPrice || (currentProduct && currentProduct.old_price) || null;

    let inner = `<span class="current-price">Ksh ${parseFloat(currentPrice).toFixed(2)}</span>`;
    if (oldPrice && parseFloat(oldPrice) > parseFloat(currentPrice)) {
      inner += `<span class="old-price">Ksh ${parseFloat(oldPrice).toFixed(2)}</span>`;
    }
    priceSection.innerHTML = inner;
  }

  const stockInfo = document.querySelector('.stock-info');
  if (stockInfo) {
    const stock = tile.stock != null
      ? tile.stock
      : (currentProduct && currentProduct.stock != null ? currentProduct.stock : 999);
    stockInfo.innerHTML = stock > 0
      ? `<span class="in-stock">\u2705 In Stock (${stock} available)</span>`
      : `<span class="out-of-stock">\u2212 Out of Stock</span>`;
  }

  const mainMedia = document.getElementById('detailMainMedia');
  if (mainMedia) {
    const imageUrl = tile.image || fallbackMediaUrl({ name: tile.name });
    const hasVideo = Boolean(tile.video);
    if (hasVideo) {
      mainMedia.innerHTML = `<video src="${tile.video}" controls preload="metadata">Your browser cannot play this video.</video>`;
    } else {
      mainMedia.innerHTML = `<img src="${imageUrl}" alt="${tile.name}" onerror="this.onerror=null;this.src=fallbackMediaUrl({name:this.alt})">`;
    }
  }

  const scroller = document.getElementById('colourGalleryScroller');
  if (scroller) {
    scroller.querySelectorAll('.colour-tile').forEach(el => {
      el.classList.toggle('is-active', el.dataset.colourKey === key);
    });
    if (!opts.keepScroll) {
      const active = scroller.querySelector('.colour-tile.is-active');
      if (active) {
        try {
          active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } catch (err) {
          active.scrollIntoView();
        }
      }
    }
  }

  const btn = document.querySelector('.btn-add-large');
  if (btn) {
    const isInCart = getCart().some(item =>
      item.id === currentProduct.id &&
      (tile.variantId !== null ? item.variant_id === tile.variantId : true)
    );
    btn.textContent = isInCart ? 'Add More' : 'Add to Cart';
    btn.classList.toggle('in-cart', isInCart);
  }

  updateArrowsVisibility();

  if (typeof writeVariantToUrl === 'function') writeVariantToUrl(tile);
  if (typeof renderMixedMediaToggle === 'function') renderMixedMediaToggle(tile);
  updateProductInquiryLinks();
}

// ============================================================
//  ARROWS
// ============================================================
function stepColourGallery(direction) {
  const currentIndex = colourTiles.findIndex(t => t.key === selectedColourKey);
  if (currentIndex < 0) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= colourTiles.length) return;

  const nextKey = colourTiles[nextIndex].key;
  selectColour(nextKey);
}

function updateArrowsVisibility() {
  const left = document.querySelector('.colour-gallery-arrow--left');
  const right = document.querySelector('.colour-gallery-arrow--right');
  if (!left || !right) return;

  const currentIndex = colourTiles.findIndex(t => t.key === selectedColourKey);
  left.disabled = currentIndex <= 0;
  right.disabled = currentIndex >= colourTiles.length - 1;
}

// ============================================================
//  THANK-YOU BAND
// ============================================================
function renderThankYouBand(product) {
  const band = document.getElementById('thankYouBand');
  const nameEl = document.getElementById('thankYouBusinessName');
  if (!band) return;

  const name = product && product.business_name
    ? String(product.business_name).trim()
    : 'our business';
  if (nameEl) nameEl.textContent = name;

  band.style.display = '';
}

// ============================================================
//  RELATED FILTER
// ============================================================
function filterRelatedProducts() {
  const query = (document.getElementById('relatedProductSearch')?.value || '').trim().toLowerCase();
  const selection = document.getElementById('relatedProductCategory')?.value || 'all';

  let mode = 'all';
  let target = '';
  if (selection.startsWith('id:')) { mode = 'id'; target = selection.slice(3); }
  else if (selection.startsWith('name:')) { mode = 'name'; target = selection.slice(5); }

  document.querySelectorAll('.related-products .related-item').forEach(item => {
    const matchesQuery = !query || (item.dataset.name || '').includes(query);
    let matchesCategory = true;
    if (mode === 'id') {
      matchesCategory = String(item.dataset.categoryId || '') === target;
    } else if (mode === 'name') {
      matchesCategory = (item.dataset.category || '') === target;
    }
    item.style.display = (matchesQuery && matchesCategory) ? '' : 'none';
  });
}

// ============================================================
//  QUANTITY
// ============================================================
function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  const span = document.getElementById('detailQty');
  if (span) span.textContent = detailQty;
}

function updateCartBadge() {
  const cart = typeof getCart === 'function' ? getCart() : [];
  const count = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  document.querySelectorAll('#cartBadge, #navCartBadge, #navCartBadgeBP').forEach(badge => {
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    badge.classList.toggle('show', count > 0);
  });
}

function updateNavCartBadge() {
  updateCartBadge();
}

function notifyProductCart(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type || 'success');
    return;
  }
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();
  const container = document.createElement('div');
  container.className = 'toast-container';
  container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;max-width:400px;width:calc(100% - 40px);';
  const toast = document.createElement('div');
  toast.className = `toast ${type || 'info'}`;
  toast.textContent = message;
  container.appendChild(toast);
  document.body.appendChild(container);
  window.setTimeout(() => container.remove(), 3500);
}

async function postProductToCart(productId, variantId, quantity) {
  if (typeof window.addProductToCart !== 'function') throw new Error('Cart is not ready. Please refresh and try again.');
  return window.addProductToCart(productId, quantity, { variantId, promptAuth: false });
}

// ============================================================
//  ADD TO CART
// ============================================================
async function addVariantToCart() {
  if (!currentProduct) return;

  const tile = getSelectedTile();
  if (!tile) return;

  const variantId = tile.variantId;
  const variantName = tile.name || 'Default';

  const button = document.querySelector('.btn-add-large');
  if (button) { button.disabled = true; button.textContent = 'Adding...'; }
  try {
    const result = await postProductToCart(currentProduct.id, variantId, detailQty);
    if (result.authRequired) {
      queueProductForCartAfterAuth(currentProduct.id, variantId, detailQty);
      return;
    }
    notifyProductCart(`Added ${detailQty} "${result.item.name}" (${variantName}) to cart.`, 'success');
    clearProductCartIntentFromUrl();
    detailQty = 1;
    const span = document.getElementById('detailQty');
    if (span) span.textContent = '1';
    selectColour(selectedColourKey, { force: true });
  } catch (error) {
    clearProductCartIntentFromUrl();
    notifyProductCart(error.message || 'Unable to add this product.', 'error');
  } finally {
    if (button && document.body.contains(button)) {
      button.disabled = false;
      button.textContent = getCart().some(item => Number(item.id) === Number(currentProduct.id)) ? 'Add More' : 'Add to Cart';
    }
  }
}

function queueProductForCartAfterAuth(productId, variantId, quantity) {
  try {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('cartAdd', '1');
    returnUrl.searchParams.set('cartProductId', String(productId || currentProduct?.id || ''));
    returnUrl.searchParams.set('cartQty', String(quantity || detailQty || 1));
    if (variantId) returnUrl.searchParams.set('cartVariantId', String(variantId));
    else returnUrl.searchParams.delete('cartVariantId');
    localStorage.setItem('postLoginReturnToProduct', returnUrl.pathname + returnUrl.search + returnUrl.hash);
  } catch (_) {}
  window.location.assign('/marketplace?auth=login');
}

function clearProductCartIntentFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('cartAdd');
  url.searchParams.delete('cartProductId');
  url.searchParams.delete('cartQty');
  url.searchParams.delete('cartVariantId');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

async function resumeProductCartIntent() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('cartAdd') !== '1') return;
  if (localStorage.getItem('resumePostLoginCartAdd') !== '1') {
    clearProductCartIntentFromUrl();
    return;
  }
  localStorage.removeItem('resumePostLoginCartAdd');
  const pendingProductId = Number(url.searchParams.get('cartProductId') || url.searchParams.get('id'));
  if (!currentProduct || !Number.isFinite(pendingProductId)) {
    clearProductCartIntentFromUrl();
    return;
  }
  const quantity = Number.parseInt(url.searchParams.get('cartQty'), 10);
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.min(quantity, 99)) : 1;
  const variantId = Number(url.searchParams.get('cartVariantId')) || null;
  if (pendingProductId === Number(currentProduct.id)) {
    detailQty = safeQuantity;
    if (variantId) {
      const targetTile = colourTiles.find(tile => Number(tile.variantId) === variantId);
      if (targetTile) selectColour(targetTile.key, { force: true });
    }
    const quantityLabel = document.getElementById('detailQty');
    if (quantityLabel) quantityLabel.textContent = String(detailQty);
    addVariantToCart();
    return;
  }
  try {
    const result = await postProductToCart(pendingProductId, variantId, safeQuantity);
    if (result.authRequired) {
      queueProductForCartAfterAuth(pendingProductId, variantId, safeQuantity);
      return;
    }
    notifyProductCart(`Added ${safeQuantity} "${result.item.name}" to cart.`, 'success');
  } catch (error) {
    notifyProductCart(error.message || 'Unable to add this product to your cart.', 'error');
  } finally {
    clearProductCartIntentFromUrl();
  }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const businessSlug = urlParams.get('business');
  if (businessSlug) {
    const shopUrl = `/business/${encodeURIComponent(businessSlug)}`;
    ['productBusinessHome', 'productBusinessHomeNav'].forEach(id => {
      const link = document.getElementById(id);
      if (link) link.href = shopUrl;
    });
    const backToShop = document.querySelector('.product-detail-page .back-link');
    if (backToShop) backToShop.href = shopUrl;
  }
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
  } catch (err) {
    console.warn('Ignoring invalid saved user session:', err);
    localStorage.removeItem('currentUser');
  }
  const isLoggedIn = Boolean(user.email);
  ['productNavCategory', 'productNavMessages', 'productNavAccount'].forEach(id => {
    const item = document.getElementById(id);
    if (item) item.style.display = isLoggedIn ? 'flex' : 'none';
  });
  if (!isLoggedIn) {
    ['productHeaderCart', 'productNavCart'].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.href = '/marketplace?auth=login&next=cart';
    });
  }
  loadProductDetail();
  updateCartBadge();
  updateNavCartBadge();
});

// ============================================================
//  EXPOSE GLOBALS
// ============================================================
window.selectColour = selectColour;
window.stepColourGallery = stepColourGallery;
window.changeDetailQty = changeDetailQty;
window.changeRelatedProductQty = changeRelatedProductQty;
window.addVariantToCart = addVariantToCart;
window.addRelatedProductToCart = addRelatedProductToCart;
window.updateCartBadge = updateCartBadge;
window.updateNavCartBadge = updateNavCartBadge;
window.loadProductDetail = loadProductDetail;
window.fallbackMediaUrl = fallbackMediaUrl;
window.filterRelatedProducts = filterRelatedProducts;
window.renderThankYouBand = renderThankYouBand;
window.orderRelatedForDisplay = orderRelatedForDisplay;
window.buildColourTiles = buildColourTiles;
window.readVariantFromUrl = readVariantFromUrl;
window.writeVariantToUrl = writeVariantToUrl;
window.renderMixedMediaToggle = renderMixedMediaToggle;

// ============================================================
//  PINNED FOOTER
//  Injected here so the change is guaranteed to reach the
//  browser through the same file that already loads the
//  product variants. It replaces any old footer on the page.
// ============================================================
(function () {
  function installPinnedFooter() {
    // Remove any footer the page may already carry.
    document.querySelectorAll('footer.bidhaa-legal-footer').forEach(function (el) {
      el.remove();
    });

    // Inject the stylesheet only once.
    if (!document.getElementById('bidhaaPinnedFooterStyles')) {
      var style = document.createElement('style');
      style.id = 'bidhaaPinnedFooterStyles';
      style.textContent = `
        :root { --bidhaa-footer-height: 64px; }

        body { padding-bottom: var(--bidhaa-footer-height) !important; }

        .bidhaa-legal-footer {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          z-index: 900;
          background: #0f172a;
          color: #94a3b8;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 0.8rem;
          line-height: 1.4;
          border-top: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: 0 -6px 18px rgba(15, 23, 42, 0.18);
          transform: translateZ(0);
          margin: 0 !important;
        }

        .bidhaa-legal-footer-inner {
          max-width: 1400px;
          margin: 0 auto;
          padding: 8px 20px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 20px;
          min-height: var(--bidhaa-footer-height);
        }

        .bidhaa-legal-footer-brand {
          display: flex; flex-direction: column; gap: 1px; white-space: nowrap;
        }
        .bidhaa-legal-footer-brand strong { color: #ffffff; font-weight: 800; font-size: 0.85rem; }
        .bidhaa-legal-footer-brand span { color: #64748b; font-size: 0.68rem; }

        .bidhaa-legal-footer-thanks {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          min-width: 0; padding: 4px 14px;
          background: rgba(34, 197, 94, 0.10);
          border: 1px solid rgba(34, 197, 94, 0.28);
          border-radius: 999px;
          color: #d1fae5; font-size: 0.78rem; font-weight: 600;
        }
        .bidhaa-legal-footer-thanks-icon { font-size: 0.95rem; line-height: 1; flex-shrink: 0; }
        .bidhaa-legal-footer-thanks-text {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
        }
        #footerThankYouBusinessName { color: #ffffff; font-weight: 800; }

        .bidhaa-legal-footer-links {
          display: flex; align-items: center; gap: 16px; white-space: nowrap;
        }
        .bidhaa-legal-footer-links a {
          display: inline-flex; align-items: center; gap: 5px;
          color: #cbd5e1; text-decoration: none; font-weight: 600; font-size: 0.76rem;
          transition: color 0.15s ease;
        }
        .bidhaa-legal-footer-links a:hover { color: #ffffff; text-decoration: underline; }
        .bidhaa-legal-footer-links i { color: #2563eb; font-size: 0.72rem; }

        @media (max-width: 900px) {
          .bidhaa-legal-footer-inner {
            grid-template-columns: 1fr auto;
            grid-template-areas: "brand links" "thanks thanks";
            gap: 8px 16px; padding: 8px 16px;
          }
          .bidhaa-legal-footer-brand  { grid-area: brand; }
          .bidhaa-legal-footer-thanks { grid-area: thanks; justify-content: flex-start; }
          .bidhaa-legal-footer-links  { grid-area: links; }
        }

        @media (max-width: 640px) {
          :root { --bidhaa-footer-height: 92px; }
          .bidhaa-legal-footer-inner {
            grid-template-columns: 1fr;
            grid-template-areas: "brand" "thanks" "links";
            gap: 6px; padding: 10px 14px; text-align: left;
          }
          .bidhaa-legal-footer-thanks { justify-content: flex-start; font-size: 0.72rem; }
          .bidhaa-legal-footer-links { flex-wrap: wrap; gap: 10px 14px; }
          .bidhaa-legal-footer-links a { font-size: 0.72rem; }
        }
      `;
      document.head.appendChild(style);
    }

    // Pick up the business name from the visible thank-you band
    // if one exists on the page.
    var src = document.getElementById('thankYouBusinessName');
    var name = (src && src.textContent ? src.textContent : '').trim() || 'our business';

    var footer = document.createElement('footer');
    footer.className = 'bidhaa-legal-footer';
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = `
      <div class="bidhaa-legal-footer-inner">
        <div class="bidhaa-legal-footer-brand">
          <strong>BidhaaLink</strong>
          <span>Kenya's Multi-Vendor Marketplace</span>
        </div>
        <div class="bidhaa-legal-footer-thanks" id="footerThankYou">
          <span class="bidhaa-legal-footer-thanks-icon" aria-hidden="true">\u{1F6D2}</span>
          <span class="bidhaa-legal-footer-thanks-text">
            Thank you for visiting <span id="footerThankYouBusinessName">${name}</span>. We value you!
          </span>
        </div>
        <nav class="bidhaa-legal-footer-links" aria-label="Legal and contact links">
          <a href="/terms.html"><i class="fas fa-file-contract" aria-hidden="true"></i> Terms and Conditions</a>
          <a href="/privacy.html"><i class="fas fa-shield-halved" aria-hidden="true"></i> Privacy Policy</a>
          <a href="/privacy.html#cookies"><i class="fas fa-cookie-bite" aria-hidden="true"></i> Cookie Notice</a>
          <a href="mailto:georgebabji1220@gmail.com"><i class="fas fa-envelope" aria-hidden="true"></i> Contact</a>
        </nav>
      </div>
    `;
    document.body.appendChild(footer);
  }

  document.addEventListener('DOMContentLoaded', installPinnedFooter);
  [300, 900, 2000].forEach(function (ms) { setTimeout(installPinnedFooter, ms); });
})();

// ============================================================
//  FORCE THE PINNED FOOTER
//  Overrides any old inline footer stylesheet on this page so
//  the footer is pinned, sits above the bottom nav, and lays
//  out as three cells (brand | thank-you | legal links).
// ============================================================
(function () {
  function forcePinnedFooter() {
    var footer = document.querySelector('footer.bidhaa-legal-footer');
    if (!footer) return;

    var navHeight = 0;
    var bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      var navStyle = window.getComputedStyle(bottomNav);
      if (navStyle.display !== 'none' && navStyle.visibility !== 'hidden') {
        navHeight = bottomNav.getBoundingClientRect().height || 0;
      }
    }

    footer.style.position = 'fixed';
    footer.style.left = '0';
    footer.style.right = '0';
    footer.style.bottom = navHeight + 'px';
    footer.style.zIndex = '1100';
    footer.style.margin = '0';
    footer.style.padding = '0';
    footer.style.background = '#0f172a';
    footer.style.color = '#94a3b8';
    footer.style.borderTop = '1px solid rgba(148, 163, 184, 0.18)';
    footer.style.boxShadow = '0 -6px 18px rgba(15, 23, 42, 0.18)';

    var inner = footer.querySelector('.bidhaa-legal-footer-inner');
    if (inner) {
      inner.style.maxWidth = '1400px';
      inner.style.margin = '0 auto';
      inner.style.padding = '8px 20px';
      inner.style.display = 'grid';
      inner.style.gridTemplateColumns = 'auto 1fr auto';
      inner.style.alignItems = 'center';
      inner.style.gap = '20px';
      inner.style.minHeight = '56px';
      inner.style.flexWrap = 'nowrap';
    }

    var brand = footer.querySelector('.bidhaa-legal-footer-brand');
    if (brand) {
      brand.style.display = 'flex';
      brand.style.flexDirection = 'column';
      brand.style.gap = '1px';
      brand.style.whiteSpace = 'nowrap';
    }

    var links = footer.querySelector('.bidhaa-legal-footer-links');
    if (links) {
      links.style.display = 'flex';
      links.style.gap = '16px';
      links.style.flexWrap = 'nowrap';
      links.style.whiteSpace = 'nowrap';
    }

    document.body.style.paddingBottom = (navHeight + 72) + 'px';
  }

  document.addEventListener('DOMContentLoaded', forcePinnedFooter);
  window.addEventListener('resize', forcePinnedFooter);
  window.addEventListener('orientationchange', forcePinnedFooter);
  [300, 900, 2000, 4000].forEach(function (ms) {
    setTimeout(forcePinnedFooter, ms);
  });
})();
/* ============================================================
   PHASE 3 - BIG-MEDIA ARROWS AND SWIPE GESTURES
   Pure additions. No existing function is modified.
   ============================================================ */

var bigMediaGestureState = {
  locked: null,
  startX: 0,
  startY: 0,
  pointerDown: false
};

var BIG_MEDIA_LOCK_PX = 12;
var BIG_MEDIA_LOCK_RATIO = 1.2;
var BIG_MEDIA_TRIGGER_PX = 24;

function injectBigMediaArrows() {
  var host = document.getElementById('detailMainMedia');
  if (!host) return;
  if (document.getElementById('detailBigArrows')) return;

  var wrap = document.createElement('div');
  wrap.id = 'detailBigArrows';
  wrap.className = 'detail-big-arrows';
  wrap.innerHTML =
    '<button type="button" class="detail-big-arrow detail-big-arrow--up" ' +
      'aria-label="Previous variant" onclick="stepVariantByDirection(-1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<button type="button" class="detail-big-arrow detail-big-arrow--down" ' +
      'aria-label="Next variant" onclick="stepVariantByDirection(1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<button type="button" class="detail-big-arrow detail-big-arrow--left" ' +
      'aria-label="Previous product" onclick="stepProductByDirection(-1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<button type="button" class="detail-big-arrow detail-big-arrow--right" ' +
      'aria-label="Next product" onclick="stepProductByDirection(1)">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>';

  host.appendChild(wrap);
  updateBigMediaArrows();
}

function updateBigMediaArrows() {
  var up    = document.querySelector('.detail-big-arrow--up');
  var down  = document.querySelector('.detail-big-arrow--down');
  var left  = document.querySelector('.detail-big-arrow--left');
  var right = document.querySelector('.detail-big-arrow--right');
  if (!up || !down || !left || !right) return;

  var verticalEnabled = Array.isArray(colourTiles) && colourTiles.length > 1;
  var colourIdx = verticalEnabled
    ? colourTiles.findIndex(function (t) { return t.key === selectedColourKey; })
    : 0;
  up.disabled   = !verticalEnabled || colourIdx <= 0;
  down.disabled = !verticalEnabled || colourIdx >= colourTiles.length - 1;

  var siblings = window.__productSwipeList || [];
  var horizontalEnabled = siblings.length > 1;
  var sibIdx = siblings.findIndex(function (p) {
    return String(p.id) === String(productId);
  });
  left.disabled  = !horizontalEnabled || sibIdx <= 0;
  right.disabled = !horizontalEnabled || sibIdx >= siblings.length - 1;
}

function stepVariantByDirection(direction) {
  if (!Array.isArray(colourTiles) || colourTiles.length <= 1) return;
  var idx = colourTiles.findIndex(function (t) { return t.key === selectedColourKey; });
  if (idx < 0) return;
  var nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= colourTiles.length) return;
  selectColour(colourTiles[nextIdx].key);
}

function stepProductByDirection(direction) {
  var list = window.__productSwipeList || [];
  if (!Array.isArray(list) || list.length <= 1) return;

  var idx = list.findIndex(function (p) { return String(p.id) === String(productId); });
  if (idx < 0) return;
  var nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= list.length) return;

  var target = list[nextIdx];
  if (!target || !target.id) return;

  var url = new URL(window.location.href);
  url.searchParams.set('id', target.id);
  window.location.href = url.pathname + url.search + url.hash;
}

function wireBigMediaGestures() {
  var host = document.getElementById('detailMainMedia');
  if (!host || host.dataset.gesturesWired === '1') return;
  host.dataset.gesturesWired = '1';

  function reset() {
    bigMediaGestureState.locked = null;
    bigMediaGestureState.pointerDown = false;
    bigMediaGestureState.startX = 0;
    bigMediaGestureState.startY = 0;
  }

  function onStart(clientX, clientY) {
    bigMediaGestureState.pointerDown = true;
    bigMediaGestureState.locked = null;
    bigMediaGestureState.startX = clientX;
    bigMediaGestureState.startY = clientY;
  }

  function onMove(clientX, clientY, event) {
    if (!bigMediaGestureState.pointerDown) return;

    var dx = clientX - bigMediaGestureState.startX;
    var dy = clientY - bigMediaGestureState.startY;
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);

    if (bigMediaGestureState.locked === null) {
      if (absX >= BIG_MEDIA_LOCK_PX && absX > BIG_MEDIA_LOCK_RATIO * absY) {
        bigMediaGestureState.locked = 'horizontal';
      } else if (absY >= BIG_MEDIA_LOCK_PX && absY > BIG_MEDIA_LOCK_RATIO * absX) {
        bigMediaGestureState.locked = 'vertical';
      } else {
        return;
      }
    }

    if (event && typeof event.preventDefault === 'function') {
      try { event.preventDefault(); } catch (e) { /* ignore */ }
    }

    if (bigMediaGestureState.locked === 'horizontal') {
      if (absX >= BIG_MEDIA_TRIGGER_PX) {
        stepProductByDirection(dx < 0 ? 1 : -1);
        reset();
      }
    } else if (bigMediaGestureState.locked === 'vertical') {
      if (absY >= BIG_MEDIA_TRIGGER_PX) {
        stepVariantByDirection(dy > 0 ? 1 : -1);
        reset();
      }
    }
  }

  function onEnd() { reset(); }

  host.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    onStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  host.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1) return;
    onMove(e.touches[0].clientX, e.touches[0].clientY, e);
  }, { passive: false });

  host.addEventListener('touchend', onEnd);
  host.addEventListener('touchcancel', onEnd);

  host.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', function (e) {
    onMove(e.clientX, e.clientY, null);
  });
  window.addEventListener('mouseup', onEnd);
}

var _originalSelectColour = window.selectColour || selectColour;
window.selectColour = function (key, options) {
  _originalSelectColour(key, options);
  if (typeof injectBigMediaArrows === 'function') injectBigMediaArrows();
  if (typeof wireBigMediaGestures === 'function') wireBigMediaGestures();
  if (typeof updateBigMediaArrows === 'function') updateBigMediaArrows();
};

var _originalLoadProductDetail = window.loadProductDetail || loadProductDetail;
window.loadProductDetail = async function () {
  await _originalLoadProductDetail();
  injectBigMediaArrows();
  wireBigMediaGestures();
  updateBigMediaArrows();
    if (typeof ensureProductSwipeList === 'function') ensureProductSwipeList();
};

var _originalLoadSiblingProducts = window.loadSiblingProducts;
if (typeof _originalLoadSiblingProducts === 'function') {
  window.loadSiblingProducts = async function () {
    await _originalLoadSiblingProducts();
    if (Array.isArray(window.siblingProducts)) {
      window.__productSwipeList = window.siblingProducts;
    }
    updateBigMediaArrows();
  };
}

window.injectBigMediaArrows = injectBigMediaArrows;
window.updateBigMediaArrows = updateBigMediaArrows;
window.stepVariantByDirection = stepVariantByDirection;
window.stepProductByDirection = stepProductByDirection;
window.wireBigMediaGestures = wireBigMediaGestures;

/* ============================================================
   PHASE 3b - sibling list loader (self-contained)
   Fetches every product of the same shop and fills
   window.__productSwipeList so the left/right arrows can step
   through them. Does not depend on any Phase 2 export.
   ============================================================ */

async function ensureProductSwipeList() {
  if (Array.isArray(window.__productSwipeList) && window.__productSwipeList.length > 0) {
    return;
  }

  var slug = (currentProduct && currentProduct.business_slug) ? currentProduct.business_slug : null;
  if (!slug) {
    var fromUrl = new URLSearchParams(window.location.search).get('business');
    if (fromUrl) slug = fromUrl;
  }
  if (!slug) {
    window.__productSwipeList = [];
    updateBigMediaArrows();
    return;
  }

  try {
    var all = [];
    var page = 1;
    var totalPages = 1;

    while (page <= totalPages && page <= 20) {
      var res = await fetch(
        '/api/businesses/' + encodeURIComponent(slug) +
        '/products?limit=100&page=' + page
      );
      if (!res.ok) break;
      var data = await res.json();
      if (Array.isArray(data.products)) { all = all.concat(data.products); }
      totalPages = data.pagination && data.pagination.pages ? data.pagination.pages : page;
      page += 1;
    }

    window.__productSwipeList = all;
    window.siblingProducts = all;
    prefetchAdjacentProductDetails();
    if (typeof updateBigMediaArrows === 'function') updateBigMediaArrows();
  } catch (err) {
    console.warn('Sibling list fetch failed:', err.message);
    window.__productSwipeList = [];
    if (typeof updateBigMediaArrows === 'function') updateBigMediaArrows();
  }
}

/* Kick off once the detail card is on screen. */
(function () {
  var started = false;
  function tryStart() {
    if (started) return;
    if (!document.getElementById('detailMainMedia')) return;
    started = true;
    ensureProductSwipeList();
  }
  function boot() {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      tryStart();
      if (started || tries > 60) clearInterval(timer);
    }, 100);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

window.ensureProductSwipeList = ensureProductSwipeList;
/* ============================================================
   PHASE 3c ? in-place product swap
   Replaces the full-page navigation with an in-place fetch and
   re-render. The URL is updated silently so the browser back
   button still walks the sibling list, and the arrows are
   re-wired after each swap.
   ============================================================ */

var productSwapInFlight = false;
const prefetchedProductDetails = new Map();

function prefetchAdjacentProductDetails() {
  const list = window.__productSwipeList || [];
  const index = list.findIndex(item => String(item.id) === String(productId));
  if (index < 0) return;
  [list[index - 1], list[index + 1]].filter(Boolean).forEach(item => {
    const id = String(item.id);
    if (!id || prefetchedProductDetails.has(id)) return;
    const request = fetch('/api/products/' + encodeURIComponent(id) + '/detail')
      .then(res => { if (!res.ok) throw new Error('Product unavailable'); return res.json(); })
      .catch(() => { prefetchedProductDetails.delete(id); return null; });
    prefetchedProductDetails.set(id, request);
  });
}

async function swapToProduct(targetId) {
  if (productSwapInFlight || String(targetId) === String(productId)) return;
  productSwapInFlight = true;
  try {
    let data = prefetchedProductDetails.get(String(targetId));
    if (data) data = await data;
    if (!data) {
      const res = await fetch('/api/products/' + encodeURIComponent(targetId) + '/detail');
      if (!res.ok) throw new Error('Failed to load product ' + targetId);
      data = await res.json();
    }

    currentProduct = data.product;
    productId = String(data.product.id);
    allVariants = data.variants || [];
    colourTiles = buildColourTiles(currentProduct, allVariants);

    // Default selection: parent (Standard) unless the URL asks for
    // a specific variant name.
    const url = new URL(window.location.href);
    const requestedVariantName = url.searchParams.get('variant');
    let initialKey = 'parent';

    if (requestedVariantName) {
      const needle = String(requestedVariantName).toLowerCase();
      const match = colourTiles.find(t =>
        String(t.name || '').trim().toLowerCase() === needle
      );
      if (match) initialKey = match.key;
    }

    selectedColourKey = initialKey;
    currentMediaIndex = 0;

    const related = orderRelatedForDisplay(data.related || [], data.product);
    renderDetail(data.product, related);

    // Update the URL silently.
    url.searchParams.set('id', targetId);
    url.searchParams.set('variant', String(
      (getSelectedTile() && getSelectedTile().name) || 'Standard'
    ));
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);

    // Re-wire the arrows and gestures that renderDetail() just replaced.
    injectBigMediaArrows();
    wireBigMediaGestures();
    updateBigMediaArrows();

    // The sibling list does not change on an in-place swap, so we
    // only need to re-check the enable state, not refetch.
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    prefetchAdjacentProductDetails();
  } catch (err) {
    console.warn('In-place swap failed:', err.message);
    if (typeof showToast === 'function') {
      showToast('Could not load that product. Please try again.', 'error');
    }
  } finally {
    productSwapInFlight = false;
  }
}

function stepProductByDirection(direction) {
  const list = window.__productSwipeList || [];
  if (!Array.isArray(list) || list.length <= 1) return;

  const idx = list.findIndex(function (p) { return String(p.id) === String(productId); });
  if (idx < 0) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= list.length) return;

  const target = list[nextIdx];
  if (!target || !target.id) return;

  swapToProduct(target.id);
}

/* Full-screen product media viewer. Reuses the detail API media and the
   existing variant/sibling navigation so admin-uploaded media stays in sync. */
(function installProductMediaViewer() {
  let overlay;
  let previousOverflow = '';

  function mediaSource(node) {
    if (!node) return null;
    if (node.tagName === 'VIDEO') {
      const source = node.querySelector('source');
      return { kind: 'video', src: node.currentSrc || (source && source.src) || node.src, poster: node.poster || '' };
    }
    if (node.tagName === 'IMG') return { kind: 'image', src: node.currentSrc || node.src, alt: node.alt || (currentProduct && currentProduct.name) || 'Product image' };
    return null;
  }

  function showCurrentMedia() {
    if (!overlay) return;
    const stage = overlay.querySelector('.product-media-viewer__stage');
    const host = document.getElementById('detailMainMedia');
    const node = host && host.querySelector('img, video');
    const media = mediaSource(node);
    stage.replaceChildren();
    if (!media || !media.src) {
      const message = document.createElement('p');
      message.textContent = 'Product media is unavailable.';
      stage.appendChild(message);
      return;
    }
    const full = document.createElement(media.kind === 'video' ? 'video' : 'img');
    full.className = 'product-media-viewer__media';
    if (media.kind === 'video') {
      full.src = media.src;
      full.poster = media.poster;
      full.controls = true;
      full.playsInline = true;
    } else {
      full.src = media.src;
      full.alt = media.alt;
      full.draggable = false;
    }
    stage.appendChild(full);
    const title = overlay.querySelector('.product-media-viewer__title');
    const tile = typeof getSelectedTile === 'function' ? getSelectedTile() : null;
    title.textContent = [currentProduct && currentProduct.name, tile && tile.name && tile.key !== 'parent' ? tile.name : ''].filter(Boolean).join(' · ');
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = previousOverflow;
  }

  function updateViewerArrows() {
    if (!overlay) return;
    const variantCount = Array.isArray(colourTiles) && colourTiles.length > 1;
    const variantIndex = variantCount ? colourTiles.findIndex(item => item.key === selectedColourKey) : -1;
    const products = window.__productSwipeList || [];
    const productIndex = products.findIndex(item => String(item.id) === String(productId));
    overlay.querySelector('.product-media-viewer__up').disabled = !variantCount || variantIndex <= 0;
    overlay.querySelector('.product-media-viewer__down').disabled = !variantCount || variantIndex >= colourTiles.length - 1;
    overlay.querySelector('.product-media-viewer__left').disabled = productIndex <= 0;
    overlay.querySelector('.product-media-viewer__right').disabled = productIndex < 0 || productIndex >= products.length - 1;
  }

  function open() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'product-media-viewer';
      overlay.id = 'productMediaViewer';
      overlay.hidden = true;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Full-size product media');
      overlay.innerHTML = '<button type="button" class="product-media-viewer__close" aria-label="Close full-size media">×</button>' +
        '<div class="product-media-viewer__title"></div><div class="product-media-viewer__stage"></div>' +
        '<button type="button" class="product-media-viewer__arrow product-media-viewer__up" aria-label="Previous variant">↑</button>' +
        '<button type="button" class="product-media-viewer__arrow product-media-viewer__down" aria-label="Next variant">↓</button>' +
        '<button type="button" class="product-media-viewer__arrow product-media-viewer__left" aria-label="Previous product">‹</button>' +
        '<button type="button" class="product-media-viewer__arrow product-media-viewer__right" aria-label="Next product">›</button>';
      document.body.appendChild(overlay);
      overlay.querySelector('.product-media-viewer__close').addEventListener('click', close);
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.product-media-viewer__up').addEventListener('click', () => stepVariantByDirection(-1));
      overlay.querySelector('.product-media-viewer__down').addEventListener('click', () => stepVariantByDirection(1));
      overlay.querySelector('.product-media-viewer__left').addEventListener('click', () => stepProductByDirection(-1));
      overlay.querySelector('.product-media-viewer__right').addEventListener('click', () => stepProductByDirection(1));
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowUp') stepVariantByDirection(-1);
        if (event.key === 'ArrowDown') stepVariantByDirection(1);
        if (event.key === 'ArrowLeft') stepProductByDirection(-1);
        if (event.key === 'ArrowRight') stepProductByDirection(1);
      });
    }
    if (overlay.hidden) previousOverflow = document.body.style.overflow;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    showCurrentMedia();
    updateViewerArrows();
    if (document.activeElement !== overlay.querySelector('.product-media-viewer__close')) {
      overlay.querySelector('.product-media-viewer__close').focus();
    }
  }

  document.addEventListener('click', event => {
    const host = event.target.closest && event.target.closest('#detailMainMedia');
    if (!host || event.target.closest('button')) return;
    if (event.target.matches('img, video') || event.target.closest('img, video')) open();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay && !overlay.hidden) close(); });
  const observer = new MutationObserver(() => {
    if (overlay && !overlay.hidden) {
      showCurrentMedia();
      updateViewerArrows();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('productDetail') || document.body;
    observer.observe(root, { childList: true, subtree: true });
  }, { once: true });
})();
