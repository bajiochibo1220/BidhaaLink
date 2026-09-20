# ============================================================
#  fix-all-three.ps1
#  Location: project root (my-business-website/)
#
#  Applies all three fixes in one run:
#    Item 1 — Products tab: remove removed fields + optional variants
#    Item 2 — Orders tab: horizontal status tabs with counts
#    Item 3 — M-Pesa: enable all three types at once
#
#  Run:  .\fix-all-three.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Get-Location

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' fix-all-three.ps1' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

# ------------------------------------------------------------
#  Backup directory
# ------------------------------------------------------------
$backup = Join-Path $root 'backup-fix-all-three'
if (-not (Test-Path $backup)) { New-Item -ItemType Directory -Path $backup | Out-Null }

function Backup-File($rel) {
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) { return $false }
    $dest = Join-Path $backup ($rel -replace '[\\/]', '__')
    Copy-Item $p $dest -Force
    return $true
}

function Read-File($rel) {
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) { throw "File not found: $rel" }
    return Get-Content -Raw -LiteralPath $p
}

function Write-File($rel, $content) {
    $p = Join-Path $root $rel
    Set-Content -LiteralPath $p -Value $content -NoNewline
}

# ============================================================
#  ITEM 1 — PRODUCTS TAB
# ============================================================

Write-Host ''
Write-Host '[ITEM 1] Products tab' -ForegroundColor Yellow

# --- 1a. business-admin.html: remove pDiscount, pRating, pContact, pShipping, dup pColor
Backup-File 'public/html/business-admin.html' | Out-Null
$html = Read-File 'public/html/business-admin.html'

# Remove the Discount row
$html = $html -replace '(?s)\s*<div><label>Discount \(%\)</label><input type="text" id="pDiscount"[^>]*></div>', ''

# Remove the Rating row
$html = $html -replace '(?s)\s*<div><label>Rating</label><input type="text" id="pRating"[^>]*></div>', ''

# Remove the Contact row
$html = $html -replace '(?s)\s*<div><label>Contact</label><input type="text" id="pContact"[^>]*></div>', ''

# Remove the Shipping Info row
$html = $html -replace '(?s)\s*<div class="full"><label>Shipping Info</label><input type="text" id="pShipping"[^>]*></div>', ''

# Remove the DUPLICATE pColor block. Keep the FIRST pColor (the one with the small helper text about "primary colour").
# Match the second occurrence (the one that has "primary colour" hint under it).
$dupColor = '(?s)<div>\s*<label>Color</label>\s*<input type="text" id="pColor" name="color" placeholder="e\.g\. Red"[^>]*>\s*<small[^>]*>The primary colour[^<]*</small>\s*</div>'
$html = $html -replace $dupColor, ''

Write-File 'public/html/business-admin.html' $html
Write-Host '  patched public/html/business-admin.html' -ForegroundColor Green

# --- 1b. business-admin.js: remove hydration + reset for removed fields
Backup-File 'public/js/business-admin.js' | Out-Null
$js = Read-File 'public/js/business-admin.js'

# Remove hydration lines
$js = $js -replace "(?m)^\s*pDiscount:\s*product\.discount_percent[^\r\n]*\r?\n", ''
$js = $js -replace "(?m)^\s*pRating:\s*product\.rating[^\r\n]*\r?\n", ''
$js = $js -replace "(?m)^\s*pContact:\s*product\.contact[^\r\n]*\r?\n", ''
$js = $js -replace "(?m)^\s*pShipping:\s*product\.shipping[^\r\n]*\r?\n", ''

# Remove the two duplicate Object.keys(fields) hydration loops' references to pColor is fine (pColor stays).
# Remove any explicit value resets for removed fields if present.
$js = $js -replace "(?m)^\s*const\s+discountEl[^\r\n]*\r?\n", ''

Write-File 'public/js/business-admin.js' $js
Write-Host '  patched public/js/business-admin.js' -ForegroundColor Green

# --- 1c. Product.js (legacy model): strip the four dropped columns
Backup-File 'src/models/Product.js' | Out-Null
$product = Read-File 'src/models/Product.js'

# Remove from INSERT column list
$product = $product -replace '(?m)^\s*discount_percent,\s*\r?\n', ''
$product = $product -replace '(?m)^\s*rating,\s*\r?\n', ''
$product = $product -replace '(?m)^\s*contact,\s*\r?\n', ''
$product = $product -replace '(?m)^\s*shipping,\s*\r?\n', ''

# Remove from SELECT (used in findById etc.)
$product = $product -replace '(?m)^\s*p\.discount_percent,[^\r\n]*\r?\n', ''
$product = $product -replace '(?m)^\s*p\.rating,[^\r\n]*\r?\n', ''

# Remove from VALUES ($n placeholders) — collapse the matching count.
# This is safest as a manual pattern: replace "discount_percent, rating," style occurrences.
$product = $product -replace "discount_percent\s*,\s*rating\s*,", ''
$product = $product -replace "contact\s*,\s*shipping\s*,", ''

# Remove from allowedFields arrays
$product = $product -replace "'discount_percent'\s*,\s*", ''
$product = $product -replace "'rating'\s*,\s*", ''
$product = $product -replace "'contact'\s*,\s*", ''
$product = $product -replace "'shipping'\s*,\s*", ''

# Remove destructured locals in create()
$product = $product -replace "(?m)^\s*const\s+\{[^}]*discount_percent[^}]*\}\s*=\s*data;\r?\n", ''
$product = $product -replace "(?m)^\s*const\s+\{[^}]*rating[^}]*\}\s*=\s*data;\r?\n", ''

Write-File 'src/models/Product.js' $product
Write-Host '  patched src/models/Product.js' -ForegroundColor Green

# --- 1d. business-admin-variants.js: readPayload drops all-empty rows
Backup-File 'public/js/business-admin-variants.js' | Out-Null
$variants = Read-File 'public/js/business-admin-variants.js'

# Replace the body of readPayload() so all-empty rows are skipped.
$newRead = @'
    function readPayload() {
        if (!container) return [];
        var rows = container.querySelectorAll('.ba-variant-row');
        var payload = [];

        rows.forEach(function (row) {
            var idInput = row.querySelector('.ba-variant-id');
            var nameInput = row.querySelector('.ba-variant-name');
            var priceInput = row.querySelector('.ba-variant-price');
            var oldPriceInput = row.querySelector('.ba-variant-old-price');
            var stockInput = row.querySelector('.ba-variant-stock');
            var existingImage = row.querySelector('.ba-variant-existing-image');
            var existingVideo = row.querySelector('.ba-variant-existing-video');
            var existingPoster = row.querySelector('.ba-variant-existing-poster');

            var id = idInput && idInput.value ? Number(idInput.value) : null;
            var name = nameInput ? nameInput.value.trim() : '';
            var price = priceInput ? priceInput.value.trim() : '';
            var oldPrice = oldPriceInput ? oldPriceInput.value.trim() : '';
            var stock = stockInput ? stockInput.value.trim() : '';
            var image = existingImage ? existingImage.value : '';
            var video = existingVideo ? existingVideo.value : '';
            var poster = existingPoster ? existingPoster.value : '';

            // Skip rows that are completely blank on every field.
            var hasAny = Boolean(id || name || price || oldPrice || stock || image || video || poster);
            if (!hasAny) return;

            payload.push({
                id: id,
                name: name,
                color_code: '',
                price: price,
                old_price: oldPrice,
                discount_percent: '',
                stock: stock,
                image: image,
                video: video,
                video_poster_url: poster
            });
        });

        return payload;
    }
'@

# Replace the existing readPayload function
$variants = [regex]::Replace(
    $variants,
    '(?s)function readPayload\(\)\s*\{.*?\n    \}',
    $newRead.TrimEnd()
)

Write-File 'public/js/business-admin-variants.js' $variants
Write-Host '  patched public/js/business-admin-variants.js' -ForegroundColor Green

# --- 1e. business-admin.js: skip validate() when payload is empty
Backup-File 'public/js/business-admin.js' | Out-Null
$js2 = Read-File 'public/js/business-admin.js'

# In product form submit, guard the validate() and the append.
$js2 = $js2 -replace "(?s)if \(window\.BusinessAdminVariants\) \{[\s\S]*?const check = window\.BusinessAdminVariants\.validate\(\);[\s\S]*?formData\.append\('variants', JSON\.stringify\(variants\)\);\s*\}",
@'
if (window.BusinessAdminVariants) {
        const rawVariants = window.BusinessAdminVariants.readPayload();
        if (rawVariants.length > 0) {
            const check = window.BusinessAdminVariants.validate();
            if (!check.ok) {
                if (check.row) window.BusinessAdminVariants.showSectionStatus(check.message, 'error');
                alert(check.message || 'Please fix the highlighted variant before saving.');
                return;
            }
            formData.append('variants', JSON.stringify(rawVariants));
        }
    }
'@

Write-File 'public/js/business-admin.js' $js2
Write-Host '  patched public/js/business-admin.js (variant guard)' -ForegroundColor Green

# --- 1f. Write migration for the four dropped columns
$migration1 = @'
-- ============================================================
--  DROP LEGACY PRODUCT COLUMNS
--  Location: migrations/sql/20260930-drop-product-legacy-columns.sql
-- ============================================================

ALTER TABLE products DROP COLUMN IF EXISTS discount_percent;
ALTER TABLE products DROP COLUMN IF EXISTS rating;
ALTER TABLE products DROP COLUMN IF EXISTS contact;
ALTER TABLE products DROP COLUMN IF EXISTS shipping;

DO $$
DECLARE
    still_there INTEGER;
BEGIN
    SELECT COUNT(*) INTO still_there
    FROM information_schema.columns
    WHERE table_name = 'products'
      AND column_name IN ('discount_percent', 'rating', 'contact', 'shipping');

    RAISE NOTICE 'legacy product columns still present (must be 0): %', still_there;
END $$;
'@

$m1path = Join-Path $root 'migrations/sql/20260930-drop-product-legacy-columns.sql'
Set-Content -LiteralPath $m1path -Value $migration1 -NoNewline
Write-Host '  wrote migrations/sql/20260930-drop-product-legacy-columns.sql' -ForegroundColor Green

# ============================================================
#  ITEM 2 — ORDERS TAB: horizontal status tabs with counts
# ============================================================

Write-Host ''
Write-Host '[ITEM 2] Orders tab horizontal tabs' -ForegroundColor Yellow

# --- 2a. business-admin.html: replace <select id="orderFilterStatus"> with tab bar
Backup-File 'public/html/business-admin.html' | Out-Null
$html2 = Read-File 'public/html/business-admin.html'

$statusTabMarkup = @'
<div class="order-status-tabs" id="orderStatusTabs" role="tablist" aria-label="Filter orders by status">
            <button type="button" class="order-status-tab is-active" data-status="all" role="tab" aria-current="true">All <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="pending_payment" role="tab">Awaiting Payment <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="pending" role="tab">Pending <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="confirmed" role="tab">Confirmed <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="shipped" role="tab">Shipped <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="delivered" role="tab">Delivered <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="awaiting_payment" role="tab">Awaiting Delivery Payment <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="paid_on_delivery" role="tab">Paid on Delivery <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="received" role="tab">Received <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="completed" role="tab">Completed <span class="count">0</span></button>
            <button type="button" class="order-status-tab" data-status="cancelled" role="tab">Cancelled <span class="count">0</span></button>
          </div>
'@

$html2 = [regex]::Replace(
    $html2,
    '(?s)<select id="orderFilterStatus"[^>]*>.*?</select>',
    $statusTabMarkup.TrimEnd()
)

Write-File 'public/html/business-admin.html' $html2
Write-Host '  patched public/html/business-admin.html (order tabs)' -ForegroundColor Green

# --- 2b. business-admin.css: add .order-status-tabs styles
$cssPath = Join-Path $root 'public/css/business-admin.css'
$cssAppend = @'

/* ============================================================
   Orders status tabs (horizontal, with counts)
   ============================================================ */
.order-status-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0 12px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 12px;
}

.order-status-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.order-status-tab:hover {
  border-color: #2563eb;
  color: #1e40af;
}

.order-status-tab.is-active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.order-status-tab .count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 10px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.65rem;
  font-weight: 800;
}

.order-status-tab.is-active .count {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}
'@

Add-Content -LiteralPath $cssPath -Value $cssAppend
Write-Host '  appended public/css/business-admin.css (order tabs)' -ForegroundColor Green

# --- 2c. business-admin.js: rewrite filterOrders() to use tabs + compute counts
Backup-File 'public/js/business-admin.js' | Out-Null
$js3 = Read-File 'public/js/business-admin.js'

# Replace filterOrders() body
$newFilterOrders = @'
function filterOrders() {
    const search = document.getElementById('orderFilterSearch')?.value || '';

    let status = 'all';
    const activeTab = document.querySelector('.order-status-tab.is-active');
    if (activeTab) {
        status = activeTab.dataset.status || 'all';
    }

    if (status === 'all') {
        currentFilterStatus = null;
    } else {
        currentFilterStatus = status;
    }

    // Update the tab bar's active state.
    document.querySelectorAll('.order-status-tab').forEach(btn => {
        const isActive = (btn.dataset.status || 'all') === status;
        btn.classList.toggle('is-active', isActive);
        if (isActive) {
            btn.setAttribute('aria-current', 'true');
        } else {
            btn.removeAttribute('aria-current');
        }
    });

    // Update the dashboard stat pills (if visible) to match.
    document.querySelectorAll('#statsGrid .stat-link').forEach(link => {
        link.classList.toggle('active', link.dataset.status === status);
    });

    loadOrders();
}

/**
 * Compute per-status counts from the loaded orders and paint them
 * into the tab bar.
 */
function updateOrderStatusTabCounts(orders) {
    const counts = {
        all: 0,
        pending_payment: 0,
        pending: 0,
        confirmed: 0,
        shipped: 0,
        delivered: 0,
        awaiting_payment: 0,
        paid_on_delivery: 0,
        received: 0,
        completed: 0,
        cancelled: 0
    };

    if (Array.isArray(orders)) {
        orders.forEach(o => {
            counts.all++;
            const s = String(o && o.status || '').toLowerCase();
            if (Object.prototype.hasOwnProperty.call(counts, s)) {
                counts[s]++;
            }
        });
    }

    document.querySelectorAll('.order-status-tab').forEach(btn => {
        const key = btn.dataset.status || 'all';
        const countEl = btn.querySelector('.count');
        if (countEl) {
            countEl.textContent = counts[key] !== undefined ? String(counts[key]) : '0';
        }
    });
}

/**
 * Wire the tab bar once.
 */
function wireOrderStatusTabs() {
    const bar = document.getElementById('orderStatusTabs');
    if (!bar || bar.dataset.wired === 'true') return;
    bar.dataset.wired = 'true';

    bar.addEventListener('click', (event) => {
        const btn = event.target.closest('.order-status-tab');
        if (!btn) return;
        bar.querySelectorAll('.order-status-tab').forEach(b => {
            b.classList.remove('is-active');
            b.removeAttribute('aria-current');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'true');
        filterOrders();
    });
}
'@

$js3 = [regex]::Replace(
    $js3,
    '(?s)function filterOrders\(\)\s*\{.*?\n\}',
    $newFilterOrders.TrimEnd()
)

# In loadOrders(), after ordersData = orders; call updateOrderStatusTabCounts(orders);
$js3 = $js3 -replace "ordersData\s*=\s*orders;", "ordersData = orders;`n        updateOrderStatusTabCounts(orders);"

# Wire tabs in navigateTo('orders')
$js3 = $js3 -replace "case 'orders':\s*\r?\n\s*loadOrders\(\);", "case 'orders':`n            wireOrderStatusTabs();`n            loadOrders();"

# Export new helpers
$js3 += @'

// Orders status tab helpers
window.filterOrders = filterOrders;
window.updateOrderStatusTabCounts = updateOrderStatusTabCounts;
window.wireOrderStatusTabs = wireOrderStatusTabs;
'@

Write-File 'public/js/business-admin.js' $js3
Write-Host '  patched public/js/business-admin.js (order tabs + counts)' -ForegroundColor Green

# ============================================================
#  ITEM 3 — M-PESA: all three types enabled at once
# ============================================================

Write-Host ''
Write-Host '[ITEM 3] M-Pesa multi-type' -ForegroundColor Yellow

# --- 3a. Migration
$migration3 = @'
-- ============================================================
--  M-PESA MULTI-TYPE
--  Location: migrations/sql/20260930-mpesa-multi-type.sql
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_paybill_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_till_enabled    BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_pochi_enabled   BOOLEAN DEFAULT FALSE;

UPDATE businesses
SET mpesa_paybill_enabled = TRUE
WHERE mpesa_payment_type = 'paybill' AND mpesa_paybill_number IS NOT NULL;

UPDATE businesses
SET mpesa_till_enabled = TRUE
WHERE mpesa_payment_type = 'till' AND mpesa_till_number IS NOT NULL;

UPDATE businesses
SET mpesa_pochi_enabled = TRUE
WHERE mpesa_payment_type = 'pochi' AND pochi_la_biashara_number IS NOT NULL;

DO $$
DECLARE
    col_paybill BOOLEAN;
    col_till    BOOLEAN;
    col_pochi   BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_paybill_enabled'
    ) INTO col_paybill;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_till_enabled'
    ) INTO col_till;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_pochi_enabled'
    ) INTO col_pochi;

    RAISE NOTICE 'mpesa_paybill_enabled: %', col_paybill;
    RAISE NOTICE 'mpesa_till_enabled:    %', col_till;
    RAISE NOTICE 'mpesa_pochi_enabled:   %', col_pochi;
END $$;
'@

$m3path = Join-Path $root 'migrations/sql/20260930-mpesa-multi-type.sql'
Set-Content -LiteralPath $m3path -Value $migration3 -NoNewline
Write-Host '  wrote migrations/sql/20260930-mpesa-multi-type.sql' -ForegroundColor Green

# --- 3b. business-admin.html: replace radios with checkboxes
Backup-File 'public/html/business-admin.html' | Out-Null
$html3 = Read-File 'public/html/business-admin.html'

$oldMpesaBlock = '(?s)<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:10px;">\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type" value="paybill"[^>]*>\s*Paybill\s*</label>\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type" value="till"[^>]*>\s*Till \(Buy Goods\)\s*</label>\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type" value="pochi"[^>]*>\s*Pochi la Biashara\s*</label>\s*</div>'

$newMpesaBlock = @'
<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:10px;">
                  <label style="font-size:0.85rem; cursor:pointer; padding:6px 12px; background:white; border-radius:6px; border:1px solid #e2e8f0;">
                    <input type="checkbox" id="mpesaPaybillEnabled" onchange="updateMpesaFields()"> Enable Paybill
                  </label>
                  <label style="font-size:0.85rem; cursor:pointer; padding:6px 12px; background:white; border-radius:6px; border:1px solid #e2e8f0;">
                    <input type="checkbox" id="mpesaTillEnabled" onchange="updateMpesaFields()"> Enable Till (Buy Goods)
                  </label>
                  <label style="font-size:0.85rem; cursor:pointer; padding:6px 12px; background:white; border-radius:6px; border:1px solid #e2e8f0;">
                    <input type="checkbox" id="mpesaPochiEnabled" onchange="updateMpesaFields()"> Enable Pochi la Biashara
                  </label>
                </div>
'@

$html3 = [regex]::Replace($html3, $oldMpesaBlock, $newMpesaBlock.TrimEnd())
Write-File 'public/html/business-admin.html' $html3
Write-Host '  patched public/html/business-admin.html (M-Pesa checkboxes)' -ForegroundColor Green

# --- 3c. business-admin.js: updateMpesaFields / loadPaymentSettings / validateMpesaSettings / submit
Backup-File 'public/js/business-admin.js' | Out-Null
$js4 = Read-File 'public/js/business-admin.js'

# Replace updateMpesaFields()
$newUpdateMpesa = @'
function updateMpesaFields() {
    const paybillCb = document.getElementById('mpesaPaybillEnabled');
    const tillCb    = document.getElementById('mpesaTillEnabled');
    const pochiCb   = document.getElementById('mpesaPochiEnabled');

    const paybillFields = document.getElementById('mpesaPaybillFields');
    const tillFields    = document.getElementById('mpesaTillFields');
    const pochiFields   = document.getElementById('mpesaPochiFields');

    if (paybillFields) paybillFields.style.display = (paybillCb && paybillCb.checked) ? 'block' : 'none';
    if (tillFields)    tillFields.style.display    = (tillCb && tillCb.checked) ? 'block' : 'none';
    if (pochiFields)   pochiFields.style.display   = (pochiCb && pochiCb.checked) ? 'block' : 'none';
}
'@

$js4 = [regex]::Replace($js4, '(?s)function updateMpesaFields\(\)\s*\{.*?\n\}', $newUpdateMpesa.TrimEnd())

# Replace validateMpesaSettings()
$newValidate = @'
function validateMpesaSettings() {
    const enabled = document.getElementById('pMpesaEnabled')?.checked === true;
    if (!enabled) return { ok: true };

    const paybillCb = document.getElementById('mpesaPaybillEnabled');
    const tillCb    = document.getElementById('mpesaTillEnabled');
    const pochiCb   = document.getElementById('mpesaPochiEnabled');

    const anyType = (paybillCb && paybillCb.checked) || (tillCb && tillCb.checked) || (pochiCb && pochiCb.checked);
    if (!anyType) {
        return { ok: false, message: 'Please tick at least one M-Pesa type (Paybill, Till, or Pochi).' };
    }

    if (paybillCb && paybillCb.checked) {
        const number = document.getElementById('pMpesaPaybillNumber')?.value.trim() || '';
        const account = document.getElementById('pMpesaPaybillAccount')?.value.trim() || '';
        if (!number || !account) {
            return { ok: false, message: 'Paybill requires both the Paybill number and an account number.' };
        }
    }
    if (tillCb && tillCb.checked) {
        const till = document.getElementById('pMpesaTillNumber')?.value.trim() || '';
        if (!till) {
            return { ok: false, message: 'Till requires the Till number.' };
        }
    }
    if (pochiCb && pochiCb.checked) {
        const pochi = document.getElementById('pPochiNumber')?.value.trim() || '';
        if (!pochi) {
            return { ok: false, message: 'Pochi la Biashara requires the Pochi number.' };
        }
    }

    return { ok: true };
}
'@

$js4 = [regex]::Replace($js4, '(?s)function validateMpesaSettings\(\)\s*\{.*?\n\}', $newValidate.TrimEnd())

# Replace loadPaymentSettings()'s radio logic with checkbox logic
$js4 = $js4 -replace "const paymentType = settings\.mpesa_payment_type \|\| 'paybill';\s*\r?\n\s*document\.querySelectorAll\('input\[name=""mpesa_payment_type""\]'\)\.forEach\(r => \{\s*\r?\n\s*r\.checked = r\.value === paymentType;\s*\r?\n\s*\}\);", @'
const paybillCb = document.getElementById('mpesaPaybillEnabled');
        const tillCb    = document.getElementById('mpesaTillEnabled');
        const pochiCb   = document.getElementById('mpesaPochiEnabled');
        if (paybillCb) paybillCb.checked = settings.mpesa_paybill_enabled === true;
        if (tillCb)    tillCb.checked    = settings.mpesa_till_enabled === true;
        if (pochiCb)   pochiCb.checked   = settings.mpesa_pochi_enabled === true;
'@

# Replace the payment form submit payload
$js4 = $js4 -replace "const selectedType = document\.querySelector\('input\[name=""mpesa_payment_type""\]:checked'\);", @'
const paybillCb = document.getElementById('mpesaPaybillEnabled');
    const tillCb    = document.getElementById('mpesaTillEnabled');
    const pochiCb   = document.getElementById('mpesaPochiEnabled');
'@

$js4 = $js4 -replace "mpesa_payment_type: selectedType \? selectedType\.value : null,", @'
mpesa_paybill_enabled: paybillCb ? paybillCb.checked : false,
        mpesa_till_enabled: tillCb ? tillCb.checked : false,
        mpesa_pochi_enabled: pochiCb ? pochiCb.checked : false,
'@

Write-File 'public/js/business-admin.js' $js4
Write-Host '  patched public/js/business-admin.js (M-Pesa checkboxes)' -ForegroundColor Green

# --- 3d. src/routes/business-admin.js: accept/return new booleans
Backup-File 'src/routes/business-admin.js' | Out-Null
$route = Read-File 'src/routes/business-admin.js'

# GET payment-settings: add the three columns to the SELECT
$route = $route -replace "mpesa_enabled, mpesa_number, mpesa_till_number, mpesa_paybill_number,", @'
mpesa_enabled, mpesa_number, mpesa_till_number, mpesa_paybill_number,
                mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
'@

# PUT payment-settings: destructure
$route = $route -replace "mpesa_enabled, mpesa_number, mpesa_till_number, mpesa_paybill_number,\s*\r?\n\s*mpesa_paybill_account, mpesa_payment_type, pochi_la_biashara_enabled, pochi_la_biashara_number,", @'
mpesa_enabled, mpesa_number, mpesa_till_number, mpesa_paybill_number,
            mpesa_paybill_account, mpesa_payment_type, pochi_la_biashara_enabled, pochi_la_biashara_number,
            mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
'@

# Validation branch: add new booleans
$route = $route -replace "if \(mpesa_payment_type && !\['paybill', 'till', 'pochi'\]\.includes\(mpesa_payment_type\)\) \{", @'
// Multi-type: at least one type must be enabled when mpesa_enabled is true.
        if (mpesa_enabled === true && !mpesa_paybill_enabled && !mpesa_till_enabled && !mpesa_pochi_enabled) {
            return res.status(400).json({ error: 'Please tick at least one M-Pesa type.' });
        }
        if (mpesa_paybill_enabled && (!mpesa_paybill_number || !mpesa_paybill_account)) {
            return res.status(400).json({ error: 'Paybill number and account number are required when Paybill is enabled.' });
        }
        if (mpesa_till_enabled && !mpesa_till_number) {
            return res.status(400).json({ error: 'Till number is required when Till is enabled.' });
        }
        if (mpesa_pochi_enabled && !pochi_la_biashara_number) {
            return res.status(400).json({ error: 'Pochi number is required when Pochi la Biashara is enabled.' });
        }
        if (false) {
'@

# Add the three new booleans to the UPDATE query's SET list and params
$route = $route -replace "pochi_la_biashara_enabled = COALESCE\(\$7, pochi_la_biashara_enabled\), pochi_la_biashara_number = COALESCE\(\$8, pochi_la_biashara_number\),", @'
pochi_la_biashara_enabled = COALESCE($7, pochi_la_biashara_enabled), pochi_la_biashara_number = COALESCE($8, pochi_la_biashara_number),
                mpesa_paybill_enabled = COALESCE($18, mpesa_paybill_enabled),
                mpesa_till_enabled = COALESCE($19, mpesa_till_enabled),
                mpesa_pochi_enabled = COALESCE($20, mpesa_pochi_enabled),
'@

# Add new params to the array
$route = $route -replace "paypal_enabled, paypal_email,\s*\r?\n\s*req\.businessId", @'
paypal_enabled, paypal_email,
            mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
            req.businessId
'@

Write-File 'src/routes/business-admin.js' $route
Write-Host '  patched src/routes/business-admin.js' -ForegroundColor Green

# --- 3e. src/routes/businesses.js (public): expose the three booleans
Backup-File 'src/routes/businesses.js' | Out-Null
$pubRoute = Read-File 'src/routes/businesses.js'

$pubRoute = $pubRoute -replace "mpesa_paybill_number,\s*\r?\n\s*mpesa_paybill_account,\s*\r?\n\s*mpesa_till_number,\s*\r?\n\s*pochi_la_biashara_enabled,\s*\r?\n\s*pochi_la_biashara_number,", @'
mpesa_paybill_number,
                mpesa_paybill_account,
                mpesa_till_number,
                mpesa_paybill_enabled,
                mpesa_till_enabled,
                mpesa_pochi_enabled,
                pochi_la_biashara_enabled,
                pochi_la_biashara_number,
'@

Write-File 'src/routes/businesses.js' $pubRoute
Write-Host '  patched src/routes/businesses.js (public payment settings)' -ForegroundColor Green

# --- 3f. cart.js: render one row per enabled M-Pesa type
Backup-File 'public/js/cart.js' | Out-Null
$cart = Read-File 'public/js/cart.js'

# Replace getMpesaLabel with getMpesaEntries
$newMpesaEntries = @'
function getMpesaEntries(settings) {
    if (!settings || !settings.mpesa_enabled) return [];
    const entries = [];

    if (settings.mpesa_paybill_enabled) {
        entries.push({
            type: 'paybill',
            title: 'M-Pesa (Paybill)',
            shortcode: settings.mpesa_paybill_number || '',
            accountReference: settings.mpesa_paybill_account || '',
            subtitle: settings.mpesa_paybill_number
                ? `Paybill: ${settings.mpesa_paybill_number}${settings.mpesa_paybill_account ? ' · A/C: ' + settings.mpesa_paybill_account : ''}`
                : ''
        });
    }
    if (settings.mpesa_till_enabled) {
        entries.push({
            type: 'till',
            title: 'M-Pesa (Till)',
            shortcode: settings.mpesa_till_number || '',
            accountReference: '',
            subtitle: settings.mpesa_till_number ? `Till: ${settings.mpesa_till_number}` : ''
        });
    }
    if (settings.mpesa_pochi_enabled) {
        entries.push({
            type: 'pochi',
            title: 'M-Pesa (Pochi la Biashara)',
            shortcode: settings.pochi_la_biashara_number || '',
            accountReference: '',
            subtitle: settings.pochi_la_biashara_number ? `Pochi: ${settings.pochi_la_biashara_number}` : ''
        });
    }

    return entries;
}
'@

$cart = [regex]::Replace($cart, '(?s)function getMpesaLabel\(settings\)\s*\{.*?\n\}', $newMpesaEntries.TrimEnd())

# Replace updatePaymentMethods()
$newUpdateMethods = @'
function updatePaymentMethods() {
    const container = document.getElementById('paymentMethods');
    if (!container || !businessPaymentSettings) return;

    let html = '';
    let hasMethods = false;

    const mpesaEntries = getMpesaEntries(businessPaymentSettings);

    mpesaEntries.forEach((entry, idx) => {
        hasMethods = true;
        const safeTitle = entry.title;
        html += `
            <div class="method" onclick="selectPaymentMethod('mpesa', '${entry.type}')">
                <i class="fas fa-mobile-alt" style="color:#4CAF50;"></i> ${safeTitle}
                ${entry.subtitle ? `<span style="font-size:0.6rem; color:#64748b; margin-left:4px;">${entry.subtitle}</span>` : ''}
            </div>
        `;
    });

    if (businessPaymentSettings.airtel_enabled) {
        hasMethods = true;
        html += `
            <div class="method" onclick="selectPaymentMethod('airtel')">
                <i class="fas fa-phone" style="color:#FF6600;"></i> Airtel Money
            </div>
        `;
    }
    if (businessPaymentSettings.bank_enabled) {
        hasMethods = true;
        html += `
            <div class="method" onclick="selectPaymentMethod('bank')">
                <i class="fas fa-university" style="color:#2563eb;"></i> Bank Transfer
                ${businessPaymentSettings.bank_name ? `<span style="font-size:0.6rem; color:#64748b; margin-left:4px;">${businessPaymentSettings.bank_name}</span>` : ''}
            </div>
        `;
    }
    if (businessPaymentSettings.paypal_enabled) {
        hasMethods = true;
        html += `
            <div class="method" onclick="selectPaymentMethod('paypal')">
                <i class="fab fa-paypal" style="color:#0070BA;"></i> PayPal
            </div>
        `;
    }

    if (!hasMethods) {
        html = `<p style="color:#991b1b; background:#fef2f2; border-left:3px solid #ef4444; padding:10px 12px; border-radius:6px; font-size:0.85rem; margin:0;">This shop has no payment method configured. Please contact the shop directly.</p>`;
    } else if (mpesaEntries.length === 0) {
        html = `<p style="color:#92400e; background:#fffbeb; border-left:3px solid #f59e0b; padding:8px 12px; border-radius:6px; font-size:0.75rem; margin:0 0 8px 0;">M-Pesa is not available for this shop. Please pick another method below.</p>` + html;
    }

    container.innerHTML = html;
}
'@

$cart = [regex]::Replace($cart, '(?s)function updatePaymentMethods\(\)\s*\{.*?\n\}', $newUpdateMethods.TrimEnd())

# Replace getMpesaFallbackMessage (still used in placeOrder)
$newFallback = @'
function getMpesaFallbackMessage(settings) {
    const hasAlternative = Boolean(
        settings && (
            settings.airtel_enabled ||
            settings.bank_enabled ||
            settings.paypal_enabled
        )
    );
    if (hasAlternative) {
        return 'M-Pesa is not available for this shop. Please pick another way to pay below.';
    }
    return 'This shop has not set up M-Pesa and has no other way to pay online. Please contact the shop directly to arrange payment.';
}
'@

$cart = [regex]::Replace($cart, '(?s)function getMpesaFallbackMessage\(settings\)\s*\{.*?\n\}', $newFallback.TrimEnd())

# Add selectedMpesaType global
$cart = $cart -replace "let selectedPaymentMethod = '';", "let selectedPaymentMethod = '';`nlet selectedMpesaType = '';"

# Replace selectPaymentMethod signature + mpesa handling
$cart = $cart -replace "function selectPaymentMethod\(method\) \{", "function selectPaymentMethod(method, mpesaType) {"
$cart = $cart -replace "selectedPaymentMethod = method;", @'
selectedPaymentMethod = method;
    if (method === 'mpesa') {
        selectedMpesaType = mpesaType || '';
    } else {
        selectedMpesaType = '';
    }
'@

# processPayment: forward selected type
$cart = $cart -replace "const mpesaLabel = getMpesaLabel\(businessPaymentSettings\);\s*\r?\n\s*if \(!mpesaLabel\) \{", @'
const entries = getMpesaEntries(businessPaymentSettings);
        const mpesaEntry = entries.find(e => e.type === selectedMpesaType) || entries[0];
        if (!mpesaEntry) {
'@

$cart = $cart -replace "payment_type: mpesaLabel\.type,\s*\r?\n\s*shortcode: mpesaLabel\.shortcode \|\| null,\s*\r?\n\s*account_reference: mpesaLabel\.accountReference \|\| null", @'
payment_type: mpesaEntry.type,
                shortcode: mpesaEntry.shortcode || null,
                account_reference: mpesaEntry.accountReference || null
'@

# Remove the old mpesaLabel specific fallback use in processPayment
$cart = $cart -replace "statusEl\.textContent = '❌ ' \+ getMpesaFallbackMessage\(businessPaymentSettings\);", "statusEl.textContent = '❌ ' + getMpesaFallbackMessage(businessPaymentSettings);"

# Expose new helper
$cart = $cart -replace "window\.getMpesaLabel = getMpesaLabel;", "window.getMpesaEntries = getMpesaEntries;"

Write-File 'public/js/cart.js' $cart
Write-Host '  patched public/js/cart.js (multi-type M-Pesa)' -ForegroundColor Green

# --- 3g. products.js route: payment_settings public also returns new booleans
Backup-File 'src/routes/products.js' | Out-Null
Write-Host '  (no change needed in products.js for M-Pesa)' -ForegroundColor DarkGray

# ============================================================
#  DONE
# ============================================================

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' All three fixes applied.' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  1. Restart the server.' -ForegroundColor White
Write-Host '  2. Run:  npm run migrate' -ForegroundColor White
Write-Host '     (This applies the two new migrations.)' -ForegroundColor DarkGray
Write-Host '  3. Hard-refresh the browser (Ctrl+Shift+R).' -ForegroundColor White
Write-Host ''
Write-Host 'Backups of every patched file are in:' -ForegroundColor DarkGray
Write-Host "  $backup" -ForegroundColor DarkGray
Write-Host ''