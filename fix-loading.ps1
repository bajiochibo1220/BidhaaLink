# ============================================================
#  fix-loading.ps1
#  Restores Dashboard / Orders / Products / Customers / My Shop
#  loading in the business-admin page.
#  Location: project root
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Get-Location

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' fix-loading.ps1' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$backup = Join-Path $root 'backup-fix-loading'
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
#  FIX 1 — src/routes/business-admin.js
#  Restore GET /payment-settings SELECT list.
#  Restore PUT /payment-settings to a valid, single-shape query.
# ============================================================

Write-Host ''
Write-Host '[FIX 1] src/routes/business-admin.js' -ForegroundColor Yellow

Backup-File 'src/routes/business-admin.js' | Out-Null
$route = Read-File 'src/routes/business-admin.js'

# Replace the entire GET /payment-settings handler body with a clean version.
$newGetPayment = @'
router.get('/payment-settings', authMiddleware, businessAdminOnly, getBusinessIdFromToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                mpesa_enabled, mpesa_number,
                mpesa_till_number, mpesa_paybill_number, mpesa_paybill_account,
                mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
                pochi_la_biashara_enabled, pochi_la_biashara_number,
                airtel_enabled, airtel_number,
                bank_enabled, bank_name, bank_account, bank_account_name,
                paypal_enabled, paypal_email
            FROM businesses
            WHERE id = $1
        `, [req.businessId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Business not found' });
        }

        const settings = result.rows[0];
        settings.mpesa_environment = (process.env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase();

        res.json(settings);
    } catch (err) {
        console.error('❌ Get payment settings error:', err);
        logError(err, 'Get payment settings');
        res.status(500).json({ error: err.message });
    }
});
'@

# Match the GET handler using its route string.
$route = [regex]::Replace(
    $route,
    "(?s)router\.get\('/payment-settings'.*?\n\}\);",
    $newGetPayment.TrimEnd(),
    1
)

# Replace the entire PUT /payment-settings handler body with a clean version.
$newPutPayment = @'
router.put('/payment-settings', authMiddleware, businessAdminOnly, getBusinessIdFromToken, async (req, res) => {
    try {
        const {
            mpesa_enabled, mpesa_number,
            mpesa_till_number, mpesa_paybill_number, mpesa_paybill_account,
            mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
            pochi_la_biashara_enabled, pochi_la_biashara_number,
            airtel_enabled, airtel_number,
            bank_enabled, bank_name, bank_account, bank_account_name,
            paypal_enabled, paypal_email
        } = req.body;

        if (mpesa_enabled === true
            && !mpesa_paybill_enabled
            && !mpesa_till_enabled
            && !mpesa_pochi_enabled) {
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

        const result = await pool.query(`
            UPDATE businesses
            SET
                mpesa_enabled = COALESCE($1, mpesa_enabled),
                mpesa_number = COALESCE($2, mpesa_number),
                mpesa_till_number = COALESCE($3, mpesa_till_number),
                mpesa_paybill_number = COALESCE($4, mpesa_paybill_number),
                mpesa_paybill_account = COALESCE($5, mpesa_paybill_account),
                mpesa_paybill_enabled = COALESCE($6, mpesa_paybill_enabled),
                mpesa_till_enabled = COALESCE($7, mpesa_till_enabled),
                mpesa_pochi_enabled = COALESCE($8, mpesa_pochi_enabled),
                pochi_la_biashara_enabled = COALESCE($9, pochi_la_biashara_enabled),
                pochi_la_biashara_number = COALESCE($10, pochi_la_biashara_number),
                airtel_enabled = COALESCE($11, airtel_enabled),
                airtel_number = COALESCE($12, airtel_number),
                bank_enabled = COALESCE($13, bank_enabled),
                bank_name = COALESCE($14, bank_name),
                bank_account = COALESCE($15, bank_account),
                bank_account_name = COALESCE($16, bank_account_name),
                paypal_enabled = COALESCE($17, paypal_enabled),
                paypal_email = COALESCE($18, paypal_email),
                updated_at = NOW()
            WHERE id = $19
            RETURNING *
        `, [
            mpesa_enabled, mpesa_number,
            mpesa_till_number, mpesa_paybill_number, mpesa_paybill_account,
            mpesa_paybill_enabled, mpesa_till_enabled, mpesa_pochi_enabled,
            pochi_la_biashara_enabled, pochi_la_biashara_number,
            airtel_enabled, airtel_number,
            bank_enabled, bank_name, bank_account, bank_account_name,
            paypal_enabled, paypal_email,
            req.businessId
        ]);

        await logAdminActivity(req.userId, 'UPDATE_PAYMENT_SETTINGS', { businessId: req.businessId });
        res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
        console.error('❌ Update payment settings error:', err);
        logError(err, 'Update payment settings');
        res.status(500).json({ error: err.message });
    }
});
'@

$route = [regex]::Replace(
    $route,
    "(?s)router\.put\('/payment-settings'.*?\n\}\);",
    $newPutPayment.TrimEnd(),
    1
)

Write-File 'src/routes/business-admin.js' $route
Write-Host '  patched src/routes/business-admin.js' -ForegroundColor Green

# ============================================================
#  FIX 2 — src/routes/businesses.js
#  Restore public payment-settings SELECT list.
# ============================================================

Write-Host ''
Write-Host '[FIX 2] src/routes/businesses.js' -ForegroundColor Yellow

Backup-File 'src/routes/businesses.js' | Out-Null
$pub = Read-File 'src/routes/businesses.js'

$newPublicPayment = @'
router.get('/:slug/payment-settings', async (req, res) => {
    try {
        const { slug } = req.params;

        const result = await pool.query(
            `SELECT
                mpesa_enabled,
                mpesa_number,
                mpesa_paybill_number,
                mpesa_paybill_account,
                mpesa_till_number,
                mpesa_paybill_enabled,
                mpesa_till_enabled,
                mpesa_pochi_enabled,
                pochi_la_biashara_enabled,
                pochi_la_biashara_number,
                airtel_enabled, airtel_number,
                bank_enabled, bank_name, bank_account, bank_account_name,
                paypal_enabled, paypal_email
             FROM businesses
             WHERE slug = $1 AND is_active = true`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Business not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Get business payment settings error:', err);
        logError(err, 'Get payment settings');
        res.status(500).json({ error: err.message });
    }
});
'@

$pub = [regex]::Replace(
    $pub,
    "(?s)router\.get\('/:slug/payment-settings'.*?\n\}\);",
    $newPublicPayment.TrimEnd(),
    1
)

Write-File 'src/routes/businesses.js' $pub
Write-Host '  patched src/routes/businesses.js' -ForegroundColor Green

# ============================================================
#  FIX 3 — src/models/Product.js
#  The previous script broke the SQL. Restore the four removed
#  columns to findById, findAll, search, and related selects.
#  (The DB columns are gone, so the model must not query them.
#   We remove them cleanly from all SELECT/INSERT/UPDATE lists.)
# ============================================================

Write-Host ''
Write-Host '[FIX 3] src/models/Product.js' -ForegroundColor Yellow

Backup-File 'src/models/Product.js' | Out-Null
$prod = Read-File 'src/models/Product.js'

# Remove any leftover references to the four dropped columns.
$prod = $prod -replace "(?m)^\s*p\.discount_percent,.*\r?\n", ''
$prod = $prod -replace "(?m)^\s*p\.rating,.*\r?\n", ''
$prod = $prod -replace "(?m)^\s*p\.contact,.*\r?\n", ''
$prod = $prod -replace "(?m)^\s*p\.shipping,.*\r?\n", ''

$prod = $prod -replace "'discount_percent'\s*,\s*", ''
$prod = $prod -replace "'rating'\s*,\s*", ''
$prod = $prod -replace "'contact'\s*,\s*", ''
$prod = $prod -replace "'shipping'\s*,\s*", ''

$prod = $prod -replace "discount_percent\s*,\s*", ''
$prod = $prod -replace "\brating\s*,\s*", ''

Write-File 'src/models/Product.js' $prod
Write-Host '  patched src/models/Product.js' -ForegroundColor Green

# ============================================================
#  FIX 4 — public/js/business-admin.js
#  Restore the payment settings form submit + load so the
#  script does not throw and section navigation can continue.
# ============================================================

Write-Host ''
Write-Host '[FIX 4] public/js/business-admin.js' -ForegroundColor Yellow

Backup-File 'public/js/business-admin.js' | Out-Null
$bajs = Read-File 'public/js/business-admin.js'

# Replace loadPaymentSettings() with a clean version that reads
# the three checkboxes.
$newLoadPayment = @'
async function loadPaymentSettings() {
    if (!businessData) return;
    try {
        const res = await fetch('/api/business-admin/payment-settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load payment settings');
        const settings = await res.json();

        const setChecked = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v === true; };
        const setValue   = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };

        setChecked('pMpesaEnabled', settings.mpesa_enabled);
        setChecked('mpesaPaybillEnabled', settings.mpesa_paybill_enabled);
        setChecked('mpesaTillEnabled',    settings.mpesa_till_enabled);
        setChecked('mpesaPochiEnabled',   settings.mpesa_pochi_enabled);

        setValue('pMpesaPaybillNumber',  settings.mpesa_paybill_number);
        setValue('pMpesaPaybillAccount', settings.mpesa_paybill_account);
        setValue('pMpesaTillNumber',     settings.mpesa_till_number);
        setValue('pPochiNumber',         settings.pochi_la_biashara_number);
        setValue('pMpesaNumber',         settings.mpesa_number);

        setChecked('pAirtelEnabled', settings.airtel_enabled);
        setValue('pAirtelNumber', settings.airtel_number);
        setChecked('pBankEnabled', settings.bank_enabled);
        setValue('pBankName', settings.bank_name);
        setValue('pBankAccount', settings.bank_account);
        setValue('pBankHolder', settings.bank_account_name);
        setChecked('pPaypalEnabled', settings.paypal_enabled);
        setValue('pPaypalEmail', settings.paypal_email);

        updateMpesaFields();

        if (settings.mpesa_environment) currentMpesaEnvironment = settings.mpesa_environment;
        renderMpesaEnvironmentLabel(currentMpesaEnvironment);

    } catch (err) {
        console.error('❌ Payment settings error:', err);
    }
}
'@

$bajs = [regex]::Replace(
    $bajs,
    '(?s)async function loadPaymentSettings\(\)\s*\{.*?\n\}',
    $newLoadPayment.TrimEnd(),
    1
)

# Replace the payment form submit handler with a clean version.
$newSubmitPayment = @'
document.getElementById('paymentSettingsForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const mpesaCheck = validateMpesaSettings();
    if (!mpesaCheck.ok) {
        const status = document.getElementById('paymentStatus');
        if (status) { status.textContent = '❌ ' + mpesaCheck.message; status.style.color = '#ef4444'; }
        if (typeof showToast === 'function') showToast('❌ ' + mpesaCheck.message, 'error');
        return;
    }

    const get = id => document.getElementById(id);
    const val = id => { const el = get(id); return el ? el.value.trim() : ''; };
    const chk = id => { const el = get(id); return el ? el.checked : false; };

    const payload = {
        mpesa_enabled: chk('pMpesaEnabled'),
        mpesa_paybill_enabled: chk('mpesaPaybillEnabled'),
        mpesa_till_enabled: chk('mpesaTillEnabled'),
        mpesa_pochi_enabled: chk('mpesaPochiEnabled'),
        mpesa_paybill_number: val('pMpesaPaybillNumber') || null,
        mpesa_paybill_account: val('pMpesaPaybillAccount') || null,
        mpesa_till_number: val('pMpesaTillNumber') || null,
        pochi_la_biashara_number: val('pPochiNumber') || null,
        mpesa_number: val('pMpesaNumber') || null,

        airtel_enabled: chk('pAirtelEnabled'),
        airtel_number: val('pAirtelNumber') || null,
        bank_enabled: chk('pBankEnabled'),
        bank_name: val('pBankName') || null,
        bank_account: val('pBankAccount') || null,
        bank_account_name: val('pBankHolder') || null,
        paypal_enabled: chk('pPaypalEnabled'),
        paypal_email: val('pPaypalEmail') || null
    };

    const status = document.getElementById('paymentStatus');
    if (status) status.textContent = '⏳ Saving...';

    try {
        const res = await fetch('/api/business-admin/payment-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            if (status) { status.textContent = '✅ Payment settings updated!'; status.style.color = '#16a34a'; }
            if (typeof showToast === 'function') showToast('✅ Payment settings updated!', 'success');
        } else {
            if (status) { status.textContent = '❌ ' + (result.error || 'Failed'); status.style.color = '#ef4444'; }
        }
    } catch (err) {
        if (status) { status.textContent = '❌ Network error'; status.style.color = '#ef4444'; }
    }
});
'@

# Match the old submit handler by its distinctive opening.
$bajs = [regex]::Replace(
    $bajs,
    "(?s)document\.getElementById\('paymentSettingsForm'\)\?\.addEventListener\('submit',\s*async\s*function\s*\(e\)\s*\{.*?\n\}\);",
    $newSubmitPayment.TrimEnd(),
    1
)

# Replace validateMpesaSettings() with a clean version.
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
        if (!(document.getElementById('pMpesaTillNumber')?.value.trim() || '')) {
            return { ok: false, message: 'Till requires the Till number.' };
        }
    }
    if (pochiCb && pochiCb.checked) {
        if (!(document.getElementById('pPochiNumber')?.value.trim() || '')) {
            return { ok: false, message: 'Pochi la Biashara requires the Pochi number.' };
        }
    }
    return { ok: true };
}
'@

$bajs = [regex]::Replace(
    $bajs,
    '(?s)function validateMpesaSettings\(\)\s*\{.*?\n\}',
    $newValidate.TrimEnd(),
    1
)

# Replace updateMpesaFields() with a clean version.
$newUpdateFields = @'
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

$bajs = [regex]::Replace(
    $bajs,
    '(?s)function updateMpesaFields\(\)\s*\{.*?\n\}',
    $newUpdateFields.TrimEnd(),
    1
)

Write-File 'public/js/business-admin.js' $bajs
Write-Host '  patched public/js/business-admin.js' -ForegroundColor Green

# ============================================================
#  FIX 5 — public/html/business-admin.html
#  Ensure the M-Pesa checkboxes exist. If the previous patch
#  partially replaced the radios, restore the checkbox block.
# ============================================================

Write-Host ''
Write-Host '[FIX 5] public/html/business-admin.html' -ForegroundColor Yellow

Backup-File 'public/html/business-admin.html' | Out-Null
$html = Read-File 'public/html/business-admin.html'

# If the radio inputs are still present, replace them with the checkbox block.
if ($html -match 'name="mpesa_payment_type"') {
    $radioBlock = '(?s)<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:10px;">\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type"[^>]*>\s*Paybill\s*</label>\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type"[^>]*>\s*Till \(Buy Goods\)\s*</label>\s*<label[^>]*>\s*<input type="radio" name="mpesa_payment_type"[^>]*>\s*Pochi la Biashara\s*</label>\s*</div>'

    $checkboxBlock = @'
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

    $html = [regex]::Replace($html, $radioBlock, $checkboxBlock.TrimEnd(), 1)
}

Write-File 'public/html/business-admin.html' $html
Write-Host '  patched public/html/business-admin.html' -ForegroundColor Green

# ============================================================
#  FIX 6 — public/js/cart.js
#  Replace getMpesaLabel with getMpesaEntries and remove any
#  broken pieces the previous patch left behind.
# ============================================================

Write-Host ''
Write-Host '[FIX 6] public/js/cart.js' -ForegroundColor Yellow

Backup-File 'public/js/cart.js' | Out-Null
$cart = Read-File 'public/js/cart.js'

# Ensure selectedMpesaType global exists.
if ($cart -notmatch "let selectedMpesaType") {
    $cart = $cart -replace "let selectedPaymentMethod = '';", "let selectedPaymentMethod = '';`nlet selectedMpesaType = '';"
}

# Replace getMpesaLabel if it still exists.
$newEntries = @'
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

$cart = [regex]::Replace(
    $cart,
    '(?s)function getMpesaLabel\(settings\)\s*\{.*?\n\}',
    $newEntries.TrimEnd(),
    1
)

# Ensure getMpesaEntries exists if the previous patch already renamed it.
if ($cart -notmatch 'function getMpesaEntries') {
    $cart = $cart -replace 'function getMpesaFallbackMessage', ($newEntries + "`nfunction getMpesaFallbackMessage")
}

# Replace getMpesaFallbackMessage with a clean version.
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

$cart = [regex]::Replace(
    $cart,
    '(?s)function getMpesaFallbackMessage\(settings\)\s*\{.*?\n\}',
    $newFallback.TrimEnd(),
    1
)

# Make sure window export uses getMpesaEntries.
$cart = $cart -replace "window\.getMpesaLabel\s*=\s*getMpesaLabel;", "window.getMpesaEntries = getMpesaEntries;"

Write-File 'public/js/cart.js' $cart
Write-Host '  patched public/js/cart.js' -ForegroundColor Green

# ============================================================
#  FIX 7 — public/js/business-admin-variants.js
#  Ensure readPayload() drops all-empty rows so the guard in
#  business-admin.js does not break validation.
# ============================================================

Write-Host ''
Write-Host '[FIX 7] public/js/business-admin-variants.js' -ForegroundColor Yellow

Backup-File 'public/js/business-admin-variants.js' | Out-Null
$v = Read-File 'public/js/business-admin-variants.js'

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

$v = [regex]::Replace(
    $v,
    '(?s)function readPayload\(\)\s*\{.*?\n    \}',
    $newRead.TrimEnd(),
    1
)

Write-File 'public/js/business-admin-variants.js' $v
Write-Host '  patched public/js/business-admin-variants.js' -ForegroundColor Green

# ============================================================
#  FIX 8 — public/js/business-admin.js
#  Make sure wireOrderStatusTabs is called and the guard around
#  variant validation does not block the submit.
# ============================================================

Write-Host ''
Write-Host '[FIX 8] public/js/business-admin.js — order tabs + variant guard' -ForegroundColor Yellow

Backup-File 'public/js/business-admin.js' | Out-Null
$bajs2 = Read-File 'public/js/business-admin.js'

# Ensure updateOrderStatusTabCounts is called after orders load.
if ($bajs2 -notmatch 'updateOrderStatusTabCounts\(') {
    $bajs2 = $bajs2 -replace "ordersData = orders;", "ordersData = orders;`n        if (typeof updateOrderStatusTabCounts === 'function') updateOrderStatusTabCounts(orders);"
}

# Ensure wireOrderStatusTabs is called when navigating to orders.
if ($bajs2 -notmatch 'wireOrderStatusTabs\(\);') {
    $bajs2 = $bajs2 -replace "case 'orders':\s*\r?\n\s*loadOrders\(\);", "case 'orders':`n            if (typeof wireOrderStatusTabs === 'function') wireOrderStatusTabs();`n            loadOrders();"
}

# Ensure the variant guard only runs when there is a real payload.
$badGuard = "(?s)if\s*\(window\.BusinessAdminVariants\)\s*\{\s*const\s+check\s*=\s*window\.BusinessAdminVariants\.validate\(\);\s*if\s*\(!check\.ok\)\s*\{[\s\S]*?return;\s*\}\s*const\s+variants\s*=\s*window\.BusinessAdminVariants\.readPayload\(\);\s*if\s*\(variants\.length\s*>\s*0\)\s*\{\s*formData\.append\('variants',\s*JSON\.stringify\(variants\)\);\s*\}\s*\}"

$goodGuard = @'
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

$bajs2 = [regex]::Replace($bajs2, $badGuard, $goodGuard.TrimEnd(), 1)

Write-File 'public/js/business-admin.js' $bajs2
Write-Host '  patched public/js/business-admin.js' -ForegroundColor Green

# ============================================================
#  FIX 9 — Run migrations on next start.
# ============================================================

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' All fixes applied.' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  1. Restart the server.' -ForegroundColor White
Write-Host '  2. Run:  npm run migrate' -ForegroundColor White
Write-Host '  3. Hard-refresh the browser (Ctrl+Shift+R).' -ForegroundColor White
Write-Host ''
Write-Host "Backups: $backup" -ForegroundColor DarkGray
Write-Host ''