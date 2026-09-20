# ============================================================
#  fix-syntax.ps1
#  Fixes:
#   1) business-admin.js line 2615  — missing ) after argument list
#   2) business-admin.js filterProductCategoryOptions not defined
#      (script crashed before the function was defined)
#   3) business-profile.js — /api/businesses/:slug/products fetch failing
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Get-Location

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' fix-syntax.ps1' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$backup = Join-Path $root 'backup-fix-syntax'
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
#  Locate the broken line 2615 in business-admin.js
# ============================================================

Write-Host ''
Write-Host '[1/3] Inspecting public/js/business-admin.js' -ForegroundColor Yellow

$bajsPath = Join-Path $root 'public/js/business-admin.js'
$lines = Get-Content -LiteralPath $bajsPath
$total = $lines.Count

Write-Host "  total lines: $total"

# Show the lines around 2615 so we can see the corruption.
$start = [Math]::Max(0, 2600)
$end   = [Math]::Min($total - 1, 2625)

for ($i = $start; $i -le $end; $i++) {
    Write-Host ("  {0,5}: {1}" -f ($i + 1), $lines[$i])
}

Write-Host ''
Write-Host '  --- first 30 lines for context ---' -ForegroundColor DarkGray
for ($i = 0; $i -lt [Math]::Min(30, $total); $i++) {
    Write-Host ("  {0,5}: {1}" -f ($i + 1), $lines[$i])
}

# ============================================================
#  Restore business-admin.js to the version in the backup made
#  by the two previous scripts, then re-apply only the safe
#  changes (order tabs, M-Pesa checkboxes). This is the cleanest
#  way to remove the syntax error that one of the regex patches
#  introduced.
# ============================================================

$backupDirs = @(
    (Join-Path $root 'backup-fix-loading'),
    (Join-Path $root 'backup-fix-all-three')
) | Where-Object { Test-Path $_ }

$candidate = $null
foreach ($dir in $backupDirs) {
    $f = Join-Path $dir 'public__js__business-admin.js'
    if (Test-Path $f) { $candidate = $f; break }
}

if ($candidate) {
    Write-Host ''
    Write-Host "  Found backup: $candidate" -ForegroundColor Green
    Write-Host '  Restoring from backup, then re-applying safe patches...' -ForegroundColor Yellow

    Backup-File 'public/js/business-admin.js' | Out-Null
    Copy-Item $candidate $bajsPath -Force

    # Re-apply the order tabs fix on the restored file.
    $bajs = Read-File 'public/js/business-admin.js'

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

    document.querySelectorAll('.order-status-tab').forEach(btn => {
        const isActive = (btn.dataset.status || 'all') === status;
        btn.classList.toggle('is-active', isActive);
        if (isActive) {
            btn.setAttribute('aria-current', 'true');
        } else {
            btn.removeAttribute('aria-current');
        }
    });

    document.querySelectorAll('#statsGrid .stat-link').forEach(link => {
        link.classList.toggle('active', link.dataset.status === status);
    });

    loadOrders();
}

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

    $bajs = [regex]::Replace(
        $bajs,
        '(?s)function filterOrders\(\)\s*\{.*?\n\}',
        $newFilterOrders.TrimEnd(),
        1
    )

    if ($bajs -notmatch 'updateOrderStatusTabCounts\(') {
        $bajs = $bajs -replace "ordersData = orders;", "ordersData = orders;`n        if (typeof updateOrderStatusTabCounts === 'function') updateOrderStatusTabCounts(orders);"
    }

    if ($bajs -notmatch 'wireOrderStatusTabs\(\);') {
        $bajs = $bajs -replace "case 'orders':\s*\r?\n\s*loadOrders\(\);", "case 'orders':`n            if (typeof wireOrderStatusTabs === 'function') wireOrderStatusTabs();`n            loadOrders();"
    }

    # Re-apply the M-Pesa checkbox helpers.
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
    $bajs = [regex]::Replace($bajs, '(?s)function updateMpesaFields\(\)\s*\{.*?\n\}', $newUpdateFields.TrimEnd(), 1)

    $newValidate = @'
function validateMpesaSettings() {
    const enabled = document.getElementById('pMpesaEnabled')?.checked === true;
    if (!enabled) return { ok: true };
    const paybillCb = document.getElementById('mpesaPaybillEnabled');
    const tillCb    = document.getElementById('mpesaTillEnabled');
    const pochiCb   = document.getElementById('mpesaPochiEnabled');
    const anyType = (paybillCb && paybillCb.checked) || (tillCb && tillCb.checked) || (pochiCb && pochiCb.checked);
    if (!anyType) return { ok: false, message: 'Please tick at least one M-Pesa type (Paybill, Till, or Pochi).' };
    if (paybillCb && paybillCb.checked) {
        const number = document.getElementById('pMpesaPaybillNumber')?.value.trim() || '';
        const account = document.getElementById('pMpesaPaybillAccount')?.value.trim() || '';
        if (!number || !account) return { ok: false, message: 'Paybill requires both the Paybill number and an account number.' };
    }
    if (tillCb && tillCb.checked) {
        if (!(document.getElementById('pMpesaTillNumber')?.value.trim() || '')) return { ok: false, message: 'Till requires the Till number.' };
    }
    if (pochiCb && pochiCb.checked) {
        if (!(document.getElementById('pPochiNumber')?.value.trim() || '')) return { ok: false, message: 'Pochi la Biashara requires the Pochi number.' };
    }
    return { ok: true };
}
'@
    $bajs = [regex]::Replace($bajs, '(?s)function validateMpesaSettings\(\)\s*\{.*?\n\}', $newValidate.TrimEnd(), 1)

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
    $bajs = [regex]::Replace($bajs, '(?s)async function loadPaymentSettings\(\)\s*\{.*?\n\}', $newLoadPayment.TrimEnd(), 1)

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
    $bajs = [regex]::Replace(
        $bajs,
        "(?s)document\.getElementById\('paymentSettingsForm'\)\?\.addEventListener\('submit',\s*async\s*function\s*\(e\)\s*\{.*?\n\}\);",
        $newSubmitPayment.TrimEnd(),
        1
    )

    # Expose the helpers.
    if ($bajs -notmatch 'window\.updateOrderStatusTabCounts') {
        $bajs += @'

window.updateOrderStatusTabCounts = updateOrderStatusTabCounts;
window.wireOrderStatusTabs = wireOrderStatusTabs;
window.filterOrders = filterOrders;
window.updateMpesaFields = updateMpesaFields;
window.validateMpesaSettings = validateMpesaSettings;
window.loadPaymentSettings = loadPaymentSettings;
'@
    }

    Write-File 'public/js/business-admin.js' $bajs
    Write-Host '  restored + re-patched public/js/business-admin.js' -ForegroundColor Green
} else {
    Write-Host '  no backup found — cannot restore automatically.' -ForegroundColor Red
    Write-Host '  Please upload the current business-admin.js for review.' -ForegroundColor Red
}

# ============================================================
#  Fix business-profile.js — guard the products fetch.
# ============================================================

Write-Host ''
Write-Host '[2/3] public/js/business-profile.js — guard products fetch' -ForegroundColor Yellow

Backup-File 'public/js/business-profile.js' | Out-Null
$bp = Read-File 'public/js/business-profile.js'

# Wrap loadBusinessProducts' fetch in a try/catch that does not
# throw on network failure, and abort if no slug is known.
$newLoadProducts = @'
async function loadBusinessProducts() {
    try {
        if (!businessSlug) {
            window.businessProductList = [];
            businessProductList = window.businessProductList;
            renderBusinessGrid();
            return;
        }

        const tab = getActiveProductTab();
        const url = '/api/businesses/' + encodeURIComponent(businessSlug) + '/products?limit=100&page=1&tab=' + encodeURIComponent(tab);
        console.log('Fetching products from:', url);

        let res;
        try {
            res = await fetch(url);
        } catch (netErr) {
            console.warn('Products fetch failed (network):', netErr.message);
            window.businessProductList = [];
            businessProductList = window.businessProductList;
            renderBusinessGrid();
            return;
        }

        if (!res.ok) {
            console.warn('Products API returned:', res.status);
            window.businessProductList = [];
            businessProductList = window.businessProductList;
            renderBusinessGrid();
            return;
        }

        const data = await res.json();
        const allProducts = Array.isArray(data.products) ? data.products : [];
        const totalPages = data.pagination?.pages || 1;

        for (let page = 2; page <= totalPages; page += 1) {
            try {
                const nextRes = await fetch('/api/businesses/' + encodeURIComponent(businessSlug) + '/products?limit=100&page=' + page + '&tab=' + encodeURIComponent(tab));
                if (!nextRes.ok) break;
                const nextData = await nextRes.json();
                if (Array.isArray(nextData.products)) {
                    allProducts.push(...nextData.products);
                }
            } catch (pageErr) {
                console.warn('Page ' + page + ' fetch failed:', pageErr.message);
                break;
            }
        }

        window.businessProductList = allProducts;
        businessProductList = window.businessProductList;

        populateBusinessProductCategories();
        populateDefinedProductCategories();

        console.log('Loaded ' + businessProductList.length + ' products for tab "' + tab + '"');

        showProductTabEmptyState(tab, allProducts.length > 0);
        renderBusinessGrid();
    } catch (err) {
        console.error('Products error:', err);
        const grid = document.getElementById('productGrid');
        if (grid) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#94a3b8;">No products available yet.</p>';
        }
    }
}
'@

$bp = [regex]::Replace(
    $bp,
    '(?s)async function loadBusinessProducts\(\)\s*\{.*?\n\}\r?\n',
    ($newLoadProducts.TrimEnd() + "`n"),
    1
)

Write-File 'public/js/business-profile.js' $bp
Write-Host '  patched public/js/business-profile.js' -ForegroundColor Green

# ============================================================
#  Ensure filterProductCategoryOptions is defined before the HTML
#  references it. It is defined in business-admin.js. If the file
#  was restored from a backup that predates that function, add it.
# ============================================================

Write-Host ''
Write-Host '[3/3] ensure filterProductCategoryOptions exists' -ForegroundColor Yellow

Backup-File 'public/js/business-admin.js' | Out-Null
$bajs3 = Read-File 'public/js/business-admin.js'

if ($bajs3 -notmatch 'function filterProductCategoryOptions') {
    $fn = @'

function filterProductCategoryOptions(scope) {
    scope = scope || 'single';
    const input = scope === 'bulk'
        ? document.getElementById('bulkProductCategorySearch')
        : document.getElementById('pProductCategorySearch');
    const select = scope === 'bulk'
        ? document.getElementById('bulkProductCategory')
        : document.getElementById('pProductCategory');
    if (!input || !select) return;

    const query = (input.value || '').trim().toLowerCase();
    const currentValue = select.value;

    const filtered = (productCategories || []).filter(c => {
        if (!query) return true;
        const haystack = `${c.name || ''} ${c.business_category_name || ''} ${c.slug || ''}`.toLowerCase();
        return haystack.includes(query);
    });

    let statusLabel = 'Select a product category...';
    if (query && filtered.length === 0) statusLabel = 'No categories match your search';
    else if (query && filtered.length === 1) statusLabel = '1 match — select below';
    else if (query) statusLabel = filtered.length + ' matches — pick one below';

    const optionsHtml = '<option value="">' + statusLabel + '</option>' +
        filtered.map(c => {
            const label = (c.icon || '📦') + ' ' + c.name + (c.business_category_name ? ' · ' + c.business_category_name : '');
            return '<option value="' + c.id + '">' + label + '</option>';
        }).join('');

    select.innerHTML = optionsHtml;

    if (query && filtered.length === 1) {
        select.value = String(filtered[0].id);
    } else if (currentValue && filtered.some(c => String(c.id) === String(currentValue))) {
        select.value = currentValue;
    }

    if (scope === 'single') {
        const help = document.getElementById('pProductCategoryHelp');
        if (help) {
            if (query) {
                help.textContent = filtered.length + ' categor' + (filtered.length === 1 ? 'y' : 'ies') + ' match "' + query + '"';
            } else {
                help.innerHTML = "Pick from the platform's defined product categories. Can't find yours? <a href=\"#\" onclick=\"navigateTo('productcategories'); return false;\">Request a new category</a>.";
            }
        }
    }
}

window.filterProductCategoryOptions = filterProductCategoryOptions;
'@
    $bajs3 = $bajs3 + $fn
    Write-File 'public/js/business-admin.js' $bajs3
    Write-Host '  added filterProductCategoryOptions' -ForegroundColor Green
} else {
    Write-Host '  already present' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Done.' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Next: hard-refresh the browser (Ctrl+Shift+R).' -ForegroundColor White
Write-Host ''