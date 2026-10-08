// ============================================================
//  BUSINESS PROFILE JAVASCRIPT � PHASE 2 (PART A)
//  Location: public/js/business-profile.js
//
//  This file is written in two parts. Command A writes this
//  half. Command B appends the rest. Do not run the browser
//  between the two commands � the file is intentionally
//  incomplete until Command B finishes.
// ============================================================

// ============================================================
//  TILE PROVIDER � single source of truth
// ============================================================

const CARTO_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const CARTO_TILE_ATTRIBUTION = 'Tiles &copy; Esri';
const CARTO_TILE_SUBDOMAINS = undefined;

// ============================================================
//  GLOBALS
// ============================================================

if (typeof window.businessSlug === 'undefined') {
    window.businessSlug = null;
}
if (typeof window.businessData === 'undefined') {
    window.businessData = null;
}
if (typeof window.businessProductList === 'undefined') {
    window.businessProductList = [];
}
if (typeof window.businessSlideIndex === 'undefined') {
    window.businessSlideIndex = 0;
}
if (typeof window.businessSlideTimer === 'undefined') {
    window.businessSlideTimer = null;
}
if (typeof window.businessMap === 'undefined') {
    window.businessMap = null;
}
if (typeof window.businessLiveMap === 'undefined') {
    window.businessLiveMap = null;
}
if (typeof window.businessLiveMarker === 'undefined') {
    window.businessLiveMarker = null;
}
if (typeof window.businessLiveRoute === 'undefined') {
    window.businessLiveRoute = null;
}
if (typeof window.businessProfileLoaded === 'undefined') {
    window.businessProfileLoaded = false;
}
if (typeof window.isFollowing === 'undefined') {
    window.isFollowing = false;
}
if (typeof window.isOwnBusiness === 'undefined') {
    window.isOwnBusiness = false;
}

// Phase 2 � current tab. Read from the URL on load and updated
// whenever the customer clicks a tab.
if (typeof window.businessProductTab === 'undefined') {
    window.businessProductTab = 'all';
}
const DEFAULT_ORDERS_PAUSED_MESSAGE = 'This business is not currently accepting online orders. Please contact them directly.';

let businessSlug = window.businessSlug;
let businessData = window.businessData;
let businessProductList = window.businessProductList;
let businessServicesList = [];
let businessDisplayedProducts = null;
let businessProductGridColumnCount = 0;
let businessServicesExpandedBreakIndex = null;
let businessServicesPanelElement = null;
let businessServicesSelectedIndex = 0;
let businessSlideIndex = window.businessSlideIndex;
let businessSlideTimer = window.businessSlideTimer;
let businessMap = window.businessMap;
let businessLiveMap = window.businessLiveMap;
let businessLiveMarker = window.businessLiveMarker;
let businessLiveRoute = window.businessLiveRoute;
let businessProfileLoaded = window.businessProfileLoaded;
let isFollowing = window.isFollowing;
let isOwnBusiness = window.isOwnBusiness;

// ============================================================
//  PHASE 2 � TAB HELPERS
// ============================================================

const VALID_PRODUCT_TABS = ['all', 'image', 'video'];

function readProductTabFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get('tab') || 'all').toLowerCase();
    return VALID_PRODUCT_TABS.includes(raw) ? raw : 'all';
}

function writeProductTabToUrl(tab) {
    const url = new URL(window.location.href);
    if (tab && tab !== 'all') {
        url.searchParams.set('tab', tab);
    } else {
        url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getActiveProductTab() {
    return window.businessProductTab || 'all';
}

function renderProductTabs(activeTab) {
    const container = document.getElementById('shopTabs');
    if (!container) return;
    const tab = VALID_PRODUCT_TABS.includes(activeTab) ? activeTab : 'all';
    container.querySelectorAll('.shop-tab').forEach(btn => {
        const isActive = btn.dataset.shopTab === tab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const emptyImages = document.getElementById('shopTabEmptyImages');
    const emptyVideos = document.getElementById('shopTabEmptyVideos');
    if (emptyImages) emptyImages.hidden = true;
    if (emptyVideos) emptyVideos.hidden = true;
}

function switchShopTab(tab) {
    if (!VALID_PRODUCT_TABS.includes(tab)) return;
    if (tab === getActiveProductTab()) return;
    closeBusinessServicesPanel();
    businessServicesPanelElement = null;
    window.businessProductTab = tab;
    renderProductTabs(tab);
    writeProductTabToUrl(tab);
    window.businessProductList = [];
    businessProductList = window.businessProductList;
    const grid = document.getElementById('productGrid');
    if (grid) grid.innerHTML = '<p style="text-align:center;padding:40px;color:#94a3b8;">Loading products�</p>';
    loadBusinessProducts();
}

function showProductTabEmptyState(tab, hasAnyProduct) {
    const emptyImages = document.getElementById('shopTabEmptyImages');
    const emptyVideos = document.getElementById('shopTabEmptyVideos');
    const grid = document.getElementById('productGrid');
    if (!emptyImages || !emptyVideos) return;

    emptyImages.hidden = true;
    emptyVideos.hidden = true;

    if (hasAnyProduct) return;

    if (tab === 'image') {
        emptyImages.hidden = false;
        if (grid) grid.innerHTML = '';
    } else if (tab === 'video') {
        emptyVideos.hidden = false;
        if (grid) grid.innerHTML = '';
    }
}

// ============================================================
//  VIEWER ROLE HELPERS
// ============================================================

function getViewerRole() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (!user || !(user.id || user.email || user.phone || user.username)) return 'guest';
        const role = user.role || 'customer';
        if (role === 'business_admin') return 'business_admin';
        if (role === 'super_admin' || role === 'admin') return 'super_admin';
        return 'customer';
    } catch (err) {
        return 'guest';
    }
}

function isCustomerViewer() { return getViewerRole() === 'customer'; }

function isBusinessAdminViewer() {
    const role = getViewerRole();
    return role === 'business_admin' || role === 'super_admin';
}

// Keep authentication in the business profile. The same modal is used by
// service inquiries and the header links, so customers never need to leave
// the shop just to sign in or create an account.
function openBusinessProfileAuth(tab = 'login') {
    if (typeof window.openAuthModal === 'function') {
        window.openAuthModal(tab === 'register' ? 'register' : 'login');
        document.getElementById('loginTypeBusiness')?.style.setProperty('display', 'none');
        document.getElementById('registerTypeBusiness')?.style.setProperty('display', 'none');
        if (typeof window.selectLoginType === 'function') window.selectLoginType('customer');
        if (typeof window.selectRegisterType === 'function') window.selectRegisterType('customer');
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('auth', tab === 'register' ? 'register' : 'login');
    window.location.assign(url.pathname + url.search + url.hash);
}
window.openBusinessProfileAuth = openBusinessProfileAuth;

// ============================================================
//  LOGOUT
// ============================================================

async function logout() {
    try {
        if (typeof window.fetch === 'function') {
            await window.fetch('/api/auth/logout', { method: 'POST' });
        }
    } catch (err) {
        console.warn('Logout request failed:', err);
    } finally {
        localStorage.removeItem('token');
        localStorage.removeItem('customerToken');
        localStorage.removeItem('businessId');
        localStorage.removeItem('businessName');
        localStorage.removeItem('businessSlug');
        localStorage.removeItem('currentUser');
        window.currentUser = null;
        window.customerToken = null;
        window.location.href = '/marketplace';
    }
}

function openGuestCartPrompt() {
    const modal = document.getElementById('authModal');
    const login = document.getElementById('authLoginContainer');
    const register = document.getElementById('authRegisterContainer');
    if (!modal || !login || !register) return;
    sessionStorage.setItem('authReturnPath', window.location.pathname + window.location.search);
    modal.classList.add('active');
    login.style.display = 'block';
    register.style.display = 'none';
    const title = document.getElementById('authLoginTitle');
    if (title) title.textContent = 'Please login or register to use your cart';
    const loginBusiness = document.getElementById('loginTypeBusiness');
    const registerBusiness = document.getElementById('registerTypeBusiness');
    if (loginBusiness) loginBusiness.style.display = 'none';
    if (registerBusiness) registerBusiness.style.display = 'none';
    if (typeof selectLoginType === 'function') selectLoginType('customer');
    let actions = document.getElementById('guestCartActions');
    if (!actions) {
        actions = document.createElement('div');
        actions.id = 'guestCartActions';
        actions.style.cssText = 'display:flex;gap:8px;margin:0 0 14px;';
        login.insertBefore(actions, login.querySelector('#loginForm'));
    }
    actions.innerHTML = '<button type="button" class="btn btn-primary" style="flex:1" onclick="selectLoginType(\'customer\')">Login as Customer</button><button type="button" class="btn btn-success" style="flex:1" onclick="switchAuthTab(\'register\'); selectRegisterType(\'customer\')">Register as Customer</button>';
}

function openChatTab() { window.location.assign('/marketplace?workspace=messages'); }

function goToMarketplaceCart() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'shop-kenya-open-workspace', section: 'cart' }, window.location.origin);
        return;
    }
    window.location.assign('/marketplace?workspace=cart');
}

// ============================================================
//  INIT
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('Business profile page loaded (Phase 2)');

    const path = window.location.pathname;
    const parts = path.replace(/^\//, '').split('/');

    if (parts.length >= 2 && parts[0] === 'business') {
        window.businessSlug = parts[1];
        businessSlug = window.businessSlug;
    } else {
        const params = new URLSearchParams(window.location.search);
        window.businessSlug = params.get('slug');
        businessSlug = window.businessSlug;
    }

    if (!businessSlug) {
        showError('No business specified', 'Please go back to the marketplace and pick a business.');
        return;
    }

    window.businessProductTab = readProductTabFromUrl();
    renderProductTabs(window.businessProductTab);
    if (typeof updateNavigation === 'function') {
        updateNavigation();
    }

    loadBusinessProfile();
    updateCartBadge();
    updateNavCartBadge();
});

// ============================================================
//  CHECK IF VIEWING OWN BUSINESS
// ============================================================

function checkIfOwnBusiness() {
    let user = {};
    try {
        user = JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
    } catch (err) {
        console.warn('Ignoring invalid saved user session:', err);
        localStorage.removeItem('currentUser');
    }
    const userBusinessId = user.business_id || localStorage.getItem('businessId');
    const userBusinessSlug = localStorage.getItem('businessSlug');

    if (user.role === 'business_admin' && userBusinessSlug) {
        window.isOwnBusiness = businessSlug === userBusinessSlug;
        isOwnBusiness = window.isOwnBusiness;
    }

    if (businessData && userBusinessId) {
        window.isOwnBusiness = businessData.id === parseInt(userBusinessId);
        isOwnBusiness = window.isOwnBusiness;
    }
}

// ============================================================
//  SHOW ERROR
// ============================================================

function showError(title, message) {
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) {
        loadingEl.innerHTML = '<div style="color:#ef4444; text-align:center; padding:40px;"><i class="fas fa-exclamation-circle fa-3x"></i><h3 style="margin-top:12px;">' + title + '</h3><p style="margin-top:8px; color:#64748b;">' + message + '</p><a href="/" class="btn btn-primary" style="margin-top:16px; display:inline-block;"><i class="fas fa-arrow-left"></i> Return to Marketplace</a></div>';
    }
}

// ============================================================
//  LOAD BUSINESS PROFILE
// ============================================================

async function loadBusinessProfile() {
    if (businessProfileLoaded) return;

    try {
        const loadingEl = document.getElementById('loadingState');
        const contentEl = document.getElementById('businessContent');

        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';

        const res = await fetch('/api/businesses/' + businessSlug);

        if (!res.ok) {
            if (res.status === 404) {
                showError('Business not found', 'We could not find that business.');
                return;
            }
            throw new Error('Failed to load business: ' + res.status);
        }

        const data = await res.json();
        window.businessData = data.business;
        businessData = window.businessData;

        if (!businessData) {
            showError('Business not found', 'We could not find that business.');
            return;
        }

        checkIfOwnBusiness();

        if (typeof updateNavigation === 'function') {
            updateNavigation();
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        renderBusinessProfile();
        loadPublicBusinessServices();
        await loadBusinessProducts();
        buildBusinessSlider();

        if (isCustomerViewer()) {
            checkFollowStatus();
        } else {
            hideFollowButtonForNonCustomer();
        }

        document.title = businessData.business_name + ' - Shop Kenya';
        window.businessProfileLoaded = true;
        businessProfileLoaded = window.businessProfileLoaded;
    } catch (err) {
        console.error('Business profile error:', err);
        showError('Error loading business', err.message);
    }
}

async function loadPublicBusinessServices() {
    if (!businessSlug) return;
    try {
        const response = await fetch(`/api/businesses/${encodeURIComponent(businessSlug)}/services`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Service request failed (${response.status})`);
        const data = await response.json();
        businessServicesList = Array.isArray(data.services) ? data.services : [];
        renderBusinessProductGrid(businessDisplayedProducts || businessProductList || []);
        openSharedBusinessServiceTarget();
        resumePostLoginBusinessServiceConversation();
        if (typeof window.resumePendingProductInquiry === 'function') window.resumePendingProductInquiry();
    } catch (error) {
        console.warn('Could not load public business services:', error);
        businessServicesList = [];
        renderBusinessProductGrid(businessDisplayedProducts || businessProductList || []);
        if (typeof window.resumePendingProductInquiry === 'function') window.resumePendingProductInquiry();
    }
}

function getBusinessProductGridColumns(grid) {
    if (!grid || !grid.isConnected) return 1;
    const tracks = window.getComputedStyle(grid).gridTemplateColumns;
    return Math.max(1, tracks.split(/\s+/).filter(Boolean).length);
}

function getBusinessServiceMedia(service) {
    let media = service?.media;
    if (typeof media === 'string') {
        try { media = JSON.parse(media); } catch (_) { media = []; }
    }
    if (!Array.isArray(media)) return [];
    const activeTab = getActiveProductTab();
    return media.filter(item => item && ['image', 'video'].includes(item.kind) &&
        typeof item.url === 'string' && (activeTab === 'all' || item.kind === activeTab));
}

function getVisibleBusinessServices() {
    const activeTab = getActiveProductTab();
    return businessServicesList.filter(service => activeTab === 'all' || getBusinessServiceMedia(service).length > 0);
}

function getBusinessServicePriceLabel(service) {
    const unitLabels = { per_service: 'per job', per_item: 'per item', per_hour: 'per hour', per_day: 'per day' };
    return service.pricing_mode === 'negotiable'
        ? "Let's talk"
        : `Ksh ${Number(service.price || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })} ${unitLabels[service.price_unit] || unitLabels.per_service}`;
}

function normaliseBusinessContactNumber(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
    else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
    return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function createBusinessServiceInquiryLink(service, className = 'business-service-inquiry-link', mediaItem = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    const price = getBusinessServicePriceLabel(service);
    button.textContent = service.pricing_mode === 'negotiable' ? "Let's talk" : `${price} · Let's talk`;
    button.setAttribute('aria-label', `${price}. Choose how to contact the business about ${service.name || 'this service'}`);
    button.addEventListener('click', () => openBusinessServiceContactOptions(service, mediaItem));
    return button;
}

function buildServiceInquiryMessage(service) {
    const price = service.pricing_mode === 'negotiable'
        ? 'You said you are free to negotiate'
        : getBusinessServicePriceLabel(service);
    return `Can we have a talk about this service please?\nService: ${service.name || 'Service'}\nPrice -> ${price}`;
}

function openBusinessServiceContactOptions(service, mediaItem = null) {
    document.getElementById('businessServiceContactDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'businessServiceContactDialog';
    dialog.className = 'business-service-contact-dialog';
    dialog.setAttribute('aria-labelledby', 'businessServiceContactTitle');

    const panel = document.createElement('div');
    panel.className = 'business-service-contact-panel';
    const header = document.createElement('div');
    header.className = 'business-service-contact-header';
    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.id = 'businessServiceContactTitle';
    title.textContent = "Let's talk";
    const serviceName = document.createElement('p');
    serviceName.textContent = `${service.name || 'Service'} · ${getBusinessServicePriceLabel(service)}`;
    heading.append(title, serviceName);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'business-service-contact-close';
    close.setAttribute('aria-label', 'Close contact options');
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    header.append(heading, close);
    panel.appendChild(header);

    const intro = document.createElement('p');
    intro.className = 'business-service-contact-intro';
    intro.textContent = 'Choose how you would like to contact this business. Your message will mention this service.';
    panel.appendChild(intro);

    const messagePreview = document.createElement('p');
    messagePreview.className = 'business-service-contact-message-preview';
    messagePreview.textContent = buildServiceInquiryMessage(service);
    panel.appendChild(messagePreview);

    if (mediaItem?.url && ['image', 'video'].includes(mediaItem.kind)) {
        const attachment = document.createElement('div');
        attachment.className = 'business-service-contact-attachment';
        if (mediaItem.kind === 'image') {
            const image = document.createElement('img');
            image.src = mediaItem.url;
            image.alt = mediaItem.caption || `${service.name || 'Service'} photo selected for your message`;
            attachment.appendChild(image);
        } else {
            const video = document.createElement('video');
            video.src = mediaItem.url;
            video.controls = true;
            video.playsInline = true;
            video.preload = 'metadata';
            attachment.appendChild(video);
        }
        const caption = document.createElement('span');
        caption.textContent = mediaItem.caption || `This ${mediaItem.kind} will be included with your in-app message and linked in WhatsApp or SMS.`;
        attachment.appendChild(caption);
        panel.appendChild(attachment);
    }

    const whatsappPhone = normaliseBusinessContactNumber(businessData?.whatsapp || businessData?.phone);
    const smsPhone = normaliseBusinessContactNumber(businessData?.phone);
    const externalText = buildServiceInquiryMessage(service) + (mediaItem?.url ? `\nService ${mediaItem.kind}: ${mediaItem.url}` : '');
    const choices = document.createElement('div');
    choices.className = 'business-service-contact-choices';
    [
        { method: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', hint: 'Open a WhatsApp chat', disabled: !whatsappPhone },
        { method: 'sms', label: 'SMS', icon: 'fas fa-comment-sms', hint: 'Send the message by text', disabled: !smsPhone },
        { method: 'inapp', label: 'In-app conversation', icon: 'fas fa-comments', hint: 'Keep the conversation in BidhaaLink', disabled: false }
    ].forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'business-service-contact-option';
        button.disabled = option.disabled;
        const icon = document.createElement('i');
        icon.className = option.icon;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        const label = document.createElement('strong');
        label.textContent = option.label;
        const hint = document.createElement('small');
        hint.textContent = option.disabled ? 'This business has not added a phone number' : option.hint;
        text.append(label, hint);
        const arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-right';
        arrow.setAttribute('aria-hidden', 'true');
        button.append(icon, text, arrow);
        button.addEventListener('click', async () => {
            if (option.method === 'whatsapp') {
                window.location.assign(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(externalText)}`);
                dialog.close();
            } else if (option.method === 'sms') {
                const international = `+${smsPhone}`;
                const bodySeparator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
                window.location.href = `sms:${international}${bodySeparator}body=${encodeURIComponent(externalText)}`;
                dialog.close();
            } else {
                button.disabled = true;
                hint.textContent = 'Starting your conversation…';
                await startBusinessServiceConversation(service, mediaItem, button, hint);
            }
        });
        choices.appendChild(button);
    });
    panel.appendChild(choices);
    dialog.appendChild(panel);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

async function startBusinessServiceConversation(service, mediaItem, button, hint) {
    const pending = {
        businessSlug: businessSlug || businessData?.slug || '',
        serviceId: service.id,
        serviceName: service.name || 'Service',
        mediaUrl: mediaItem?.url || null,
        mediaKind: mediaItem?.kind || null,
        mediaCaption: mediaItem?.caption || null
    };
    try {
        const response = await fetch('/api/service-conversations/customer/conversations', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending)
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
            localStorage.removeItem('postLoginProductConversation');
            localStorage.setItem('postLoginServiceConversation', JSON.stringify(pending));
            const dialog = document.getElementById('businessServiceContactDialog');
            if (dialog?.open) dialog.close();
            openBusinessProfileAuth('login');
            return;
        }
        if (!response.ok || !data.conversationId) throw new Error(data.error || 'Could not start the conversation.');
        localStorage.removeItem('postLoginServiceConversation');
        window.location.assign(`/account.html?section=messages&serviceConversation=${encodeURIComponent(data.conversationId)}`);
    } catch (error) {
        console.error('Start business service conversation error:', error);
        if (hint) hint.textContent = error.message || 'Could not start the conversation. Please try again.';
        if (button) button.disabled = false;
        if (!hint && typeof window.showToast === 'function') window.showToast(error.message || 'Could not start the conversation. Please try again.', 'error');
    }
}

function buildBusinessServiceShareUrl(service, mediaItem = null) {
    const slug = businessSlug || businessData?.slug;
    if (!slug || !service?.id) return window.location.href;
    const url = new URL(`/business/${encodeURIComponent(slug)}`, window.location.origin);
    url.searchParams.set('serviceId', String(service.id));
    if (mediaItem?.url && ['image', 'video'].includes(mediaItem.kind)) {
        url.searchParams.set('serviceMedia', mediaItem.url);
        url.searchParams.set('serviceMediaKind', mediaItem.kind);
    }
    return url.href;
}

function showInlineBusinessServiceChoices(service, mediaItem, trigger, panel) {
    document.querySelectorAll('.product-inquiry-inline').forEach(menu => {
        menu._contactTrigger?.setAttribute('aria-expanded', 'false');
        menu.remove();
    });
    const willOpen = panel.hidden;
    document.querySelectorAll('.business-service-contact-options:not([hidden])').forEach(openPanel => {
        if (openPanel !== panel) {
            openPanel.hidden = true;
            openPanel.parentElement?.querySelector('.business-service-inquiry-trigger')?.setAttribute('aria-expanded', 'false');
        }
    });
    panel.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (!willOpen) return;

    const whatsappPhone = normaliseBusinessContactNumber(businessData?.whatsapp || businessData?.phone);
    const smsPhone = normaliseBusinessContactNumber(businessData?.phone);
    const serviceUrl = buildBusinessServiceShareUrl(service, mediaItem);
    const externalText = `${buildServiceInquiryMessage(service)}\nView this service: ${serviceUrl}`;
    const mediaNote = panel.querySelector('.business-service-contact-media-note');
    if (mediaNote) {
        mediaNote.textContent = mediaItem?.url
            ? `This ${mediaItem.kind} will be attached to the in-app message. The service link in WhatsApp or SMS opens this same ${mediaItem.kind}.`
            : 'Your message will include a link back to this service.';
    }

    panel.querySelectorAll('[data-contact-method]').forEach(choice => {
        const method = choice.dataset.contactMethod;
        const phone = method === 'whatsapp' ? whatsappPhone : smsPhone;
        choice.disabled = method !== 'inapp' && !phone;
        const hint = choice.querySelector('small');
        if (hint) hint.textContent = choice.disabled
            ? 'This business has not added a phone number'
            : method === 'whatsapp' ? 'Open a WhatsApp chat' : method === 'sms' ? 'Open a text message' : 'Chat privately on BidhaaLink';
        choice.onclick = async () => {
            if (method === 'whatsapp') {
                window.location.assign(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(externalText)}`);
            } else if (method === 'sms') {
                const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
                window.location.assign(`sms:+${smsPhone}${separator}body=${encodeURIComponent(externalText)}`);
            } else {
                choice.disabled = true;
                const status = panel.querySelector('.business-service-contact-status');
                if (status) status.textContent = 'Starting your conversation…';
                await startBusinessServiceConversation(service, mediaItem, choice, status);
            }
        };
    });
}

// Keep the channel choices beside the exact service/media card the customer tapped.
function createBusinessServiceInquiryLink(service, className = 'business-service-inquiry-link', mediaItem = null) {
    const wrapper = document.createElement('div');
    wrapper.className = `business-service-contact-wrap ${className}`;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'business-service-inquiry-trigger';
    const price = getBusinessServicePriceLabel(service);
    trigger.textContent = service.pricing_mode === 'negotiable' ? "Let's talk" : `${price} · Let's talk`;
    trigger.setAttribute('aria-label', `${price}. Choose WhatsApp, SMS, or an in-app conversation about ${service.name || 'this service'}`);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => showInlineBusinessServiceChoices(service, mediaItem, trigger, options));

    const options = document.createElement('div');
    options.className = 'business-service-contact-options';
    options.hidden = true;
    const mediaNote = document.createElement('p');
    mediaNote.className = 'business-service-contact-media-note';
    mediaNote.textContent = mediaItem?.url
        ? `This ${mediaItem.kind} will be attached to your message.`
        : 'Your message will include a link back to this service.';
    options.appendChild(mediaNote);
    [
        { method: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', hint: 'Open a WhatsApp chat' },
        { method: 'sms', label: 'SMS', icon: 'fas fa-comment-sms', hint: 'Open a text message' },
        { method: 'inapp', label: 'In-app conversation', icon: 'fas fa-comments', hint: 'Chat privately on BidhaaLink' }
    ].forEach(option => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'business-service-contact-option';
        choice.dataset.contactMethod = option.method;
        const icon = document.createElement('i');
        icon.className = option.icon;
        icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('span');
        const label = document.createElement('strong');
        label.textContent = option.label;
        const hint = document.createElement('small');
        hint.textContent = option.hint;
        copy.append(label, hint);
        choice.append(icon, copy);
        options.appendChild(choice);
    });
    const status = document.createElement('small');
    status.className = 'business-service-contact-status';
    status.setAttribute('aria-live', 'polite');
    options.appendChild(status);
    wrapper.append(trigger, options);
    return wrapper;
}

function openSharedBusinessServiceTarget() {
    const params = new URLSearchParams(window.location.search);
    const serviceId = params.get('serviceId');
    if (!serviceId || window.__openedSharedBusinessServiceTarget) return;
    const services = getVisibleBusinessServices();
    const index = services.findIndex(service => String(service.id) === String(serviceId));
    if (index < 0) return;
    const prompt = document.querySelector('.business-services-teaser-button');
    if (!prompt) return;
    window.__openedSharedBusinessServiceTarget = true;
    businessServicesSelectedIndex = index;
    const breakIndex = Number(prompt.dataset.serviceBreakIndex);
    toggleBusinessServicesAt(breakIndex);
    const mediaUrl = params.get('serviceMedia');
    if (mediaUrl) requestAnimationFrame(() => {
        const media = businessServicesPanelElement?.querySelectorAll('.business-service-media');
        const target = Array.from(media || []).find(figure => figure.dataset.mediaUrl === mediaUrl);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function resumePostLoginBusinessServiceConversation() {
    const raw = localStorage.getItem('postLoginServiceConversation');
    if (!raw) return;
    let pending;
    try { pending = JSON.parse(raw); } catch (_) { localStorage.removeItem('postLoginServiceConversation'); return; }
    if (!pending?.businessSlug || pending.businessSlug !== businessSlug || !businessServicesList.length) return;
    const service = businessServicesList.find(item => String(item.id) === String(pending.serviceId));
    if (!service) {
        localStorage.removeItem('postLoginServiceConversation');
        return;
    }
    startBusinessServiceConversation(service, pending.mediaUrl ? {
        url: pending.mediaUrl, kind: pending.mediaKind, caption: pending.mediaCaption
    } : null, null, null);
}
window.resumePostLoginBusinessServiceConversation = resumePostLoginBusinessServiceConversation;

function createBusinessServiceCard(service) {
    const card = document.createElement('article');
    card.className = 'business-service-card';
    const mediaItems = getBusinessServiceMedia(service);

    const heading = document.createElement('h3');
    heading.className = 'business-service-title';
    heading.textContent = service.name || 'Service';
    card.appendChild(heading);

    const price = document.createElement('p');
    price.className = 'business-service-price business-service-price-action';
    price.appendChild(createBusinessServiceInquiryLink(service, 'business-service-inquiry-link', mediaItems[0] || null));
    card.appendChild(price);

    if (service.service_area) {
        const area = document.createElement('p');
        area.className = 'business-service-area';
        area.textContent = `Available in: ${service.service_area}`;
        card.appendChild(area);
    }
    if (service.description) {
        const description = document.createElement('p');
        description.className = 'business-service-description';
        description.textContent = service.description;
        card.appendChild(description);
    }

    if (mediaItems.length) {
        const mediaSection = document.createElement('section');
        mediaSection.className = 'business-service-media-section';
        const mediaHeading = document.createElement('h4');
        mediaHeading.textContent = 'Photos & videos';
        mediaSection.appendChild(mediaHeading);

        const controls = document.createElement('div');
        controls.className = 'business-service-media-controls';
        const counter = document.createElement('span');
        counter.className = 'business-service-media-counter';
        counter.textContent = `1 / ${mediaItems.length}`;
        controls.appendChild(counter);
        const scrollerId = `businessServiceMediaScroll-${String(service.id || service.name || 'service').replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const upButton = document.createElement('button');
        upButton.type = 'button';
        upButton.className = 'business-service-media-scroll-button';
        upButton.setAttribute('aria-label', 'Scroll to previous service photo or video');
        upButton.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
        upButton.addEventListener('click', () => scrollBusinessServiceMedia(scrollerId, -1));
        controls.appendChild(upButton);
        const downButton = document.createElement('button');
        downButton.type = 'button';
        downButton.className = 'business-service-media-scroll-button';
        downButton.setAttribute('aria-label', 'Scroll to next service photo or video');
        downButton.innerHTML = '<i class="fas fa-arrow-down" aria-hidden="true"></i>';
        downButton.addEventListener('click', () => scrollBusinessServiceMedia(scrollerId, 1));
        controls.appendChild(downButton);
        mediaSection.appendChild(controls);

        const scroller = document.createElement('div');
        scroller.className = 'business-service-media-scroll';
        scroller.id = scrollerId;
        scroller.tabIndex = 0;
        scroller.setAttribute('aria-label', 'Scroll vertically through this service’s photos and videos');
        const gallery = document.createElement('div');
        gallery.className = 'business-service-gallery';
        mediaItems.forEach((item, index) => {
            let mediaUrl;
            try {
                mediaUrl = new URL(item.url, window.location.origin);
                if (!['http:', 'https:'].includes(mediaUrl.protocol)) return;
            } catch (_) { return; }

            const figure = document.createElement('figure');
            figure.className = 'business-service-media';
            if (item.kind === 'video') {
                const video = document.createElement('video');
                video.controls = true;
                video.preload = 'metadata';
                video.playsInline = true;
                video.src = mediaUrl.href;
                video.setAttribute('aria-label', item.caption || `${service.name || 'Service'} example video`);
                figure.appendChild(video);
            } else {
                const openButton = document.createElement('button');
                openButton.type = 'button';
                openButton.className = 'business-service-photo-trigger';
                openButton.setAttribute('aria-label', `Open full photo${item.caption ? `: ${item.caption}` : ` from ${service.name || 'this service'}`}`);
                const image = document.createElement('img');
                image.src = mediaUrl.href;
                image.alt = item.caption || `${service.name || 'Service'} example photo`;
                image.loading = 'lazy';
                image.decoding = 'async';
                openButton.appendChild(image);
                openButton.addEventListener('click', () => openBusinessServicePhotoViewer(service.id, item.url));
                figure.appendChild(openButton);
            }
            figure.appendChild(createBusinessServiceInquiryLink(service, 'business-service-inquiry-link business-service-media-inquiry', item));
            if (item.caption) {
                const caption = document.createElement('figcaption');
                caption.textContent = item.caption;
                figure.appendChild(caption);
            }
            figure.dataset.mediaIndex = String(index);
            figure.dataset.mediaUrl = item.url;
            gallery.appendChild(figure);
        });
        scroller.appendChild(gallery);
        mediaSection.appendChild(scroller);
        scroller.addEventListener('scroll', () => {
            const slideHeight = scroller.clientHeight || 1;
            const activeIndex = Math.min(mediaItems.length - 1, Math.max(0, Math.round(scroller.scrollTop / slideHeight)));
            counter.textContent = `${activeIndex + 1} / ${mediaItems.length}`;
        }, { passive: true });
        card.appendChild(mediaSection);
    }
    return card;
}

function scrollBusinessServiceMedia(scrollerId, direction) {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;
    scroller.scrollBy({ top: direction * scroller.clientHeight, behavior: 'smooth' });
}

function openBusinessServicePhotoViewer(serviceId, mediaUrl) {
    const dialog = document.getElementById('businessServicePhotoViewer');
    const scroller = document.getElementById('businessServicePhotoViewerScroll');
    const title = document.getElementById('businessServicePhotoViewerTitle');
    const count = document.getElementById('businessServicePhotoViewerCount');
    if (!dialog || !scroller) return;

    const activeTab = getActiveProductTab();
    const services = businessServicesList.filter(service => activeTab === 'all' || getBusinessServiceMedia(service).length > 0);
    const photos = [];
    services.forEach(service => getBusinessServiceMedia(service).filter(item => item.kind === 'image').forEach(item => {
        try {
            const url = new URL(item.url, window.location.origin);
            if (['http:', 'https:'].includes(url.protocol)) photos.push({ service, item, url: url.href });
        } catch (_) { /* Skip invalid saved URLs. */ }
    }));
    const startIndex = Math.max(0, photos.findIndex(photo =>
        String(photo.service.id) === String(serviceId) && photo.item.url === mediaUrl));
    if (!photos.length) return;

    scroller.replaceChildren();
    photos.forEach((photo, index) => {
        const slide = document.createElement('figure');
        slide.className = 'business-service-photo-slide';
        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = photo.item.caption || `${photo.service.name || 'Service'} past-work photo`;
        image.loading = index === startIndex ? 'eager' : 'lazy';
        image.decoding = 'async';
        slide.appendChild(image);
        const caption = document.createElement('figcaption');
        const serviceName = document.createElement('strong');
        serviceName.textContent = photo.service.name || 'Service';
        caption.appendChild(serviceName);
        if (photo.item.caption) {
            caption.appendChild(document.createTextNode(` · ${photo.item.caption}`));
        }
        slide.appendChild(caption);
        slide.appendChild(createBusinessServiceInquiryLink(photo.service, 'business-service-inquiry-link business-service-viewer-inquiry', photo.item));
        scroller.appendChild(slide);
    });

    if (title) title.textContent = photos[startIndex].service.name || 'Service photos';
    if (count) count.textContent = `${startIndex + 1} / ${photos.length}`;
    scroller.onscroll = () => {
        const visibleIndex = Math.min(photos.length - 1, Math.max(0, Math.round(scroller.scrollTop / scroller.clientHeight)));
        if (count) count.textContent = `${visibleIndex + 1} / ${photos.length}`;
        if (title) title.textContent = photos[visibleIndex]?.service.name || 'Service photos';
    };
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    requestAnimationFrame(() => scroller.children[startIndex]?.scrollIntoView({ block: 'start' }));
}

function closeBusinessServicePhotoViewer() {
    const dialog = document.getElementById('businessServicePhotoViewer');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
}

function createBusinessServicesTeaser(index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'business-services-teaser';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'business-services-teaser-button';
    button.dataset.serviceBreakIndex = String(index);
    button.setAttribute('aria-controls', 'businessServicesExpandedPanel');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => toggleBusinessServicesAt(index));

    const icon = document.createElement('span');
    icon.className = 'business-services-teaser-icon';
    icon.innerHTML = '<i class="fas fa-sparkles" aria-hidden="true"></i>';
    button.appendChild(icon);

    const copy = document.createElement('span');
    copy.className = 'business-services-teaser-copy';
    const message = document.createElement('span');
    message.className = 'business-services-teaser-message';
    message.textContent = 'We offer these services also';
    copy.appendChild(message);
    button.appendChild(copy);

    const count = document.createElement('span');
    count.className = 'business-services-teaser-count';
    count.textContent = `${businessServicesList.length} ${businessServicesList.length === 1 ? 'service' : 'services'}`;
    button.appendChild(count);
    const arrow = document.createElement('span');
    arrow.className = 'business-services-teaser-arrow';
    arrow.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i>';
    button.appendChild(arrow);
    wrapper.appendChild(button);
    const slot = document.createElement('div');
    slot.className = 'business-services-expand-slot';
    slot.id = `businessServicesPanelSlot-${index}`;
    wrapper.appendChild(slot);
    return wrapper;
}

function createBusinessServicesPanel() {
    const section = document.createElement('section');
    section.className = 'business-services-expanded-panel';
    section.id = 'businessServicesExpandedPanel';
    section.setAttribute('aria-label', 'Other services offered by this business');
    const header = document.createElement('div');
    header.className = 'business-services-expanded-heading';
    const title = document.createElement('h2');
    title.textContent = 'Other Services We Offer';
    header.appendChild(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'business-services-expanded-close';
    close.textContent = 'Close services';
    close.addEventListener('click', closeBusinessServicesPanel);
    header.appendChild(close);
    section.appendChild(header);
    const note = document.createElement('p');
    note.className = 'business-services-expanded-note';
    note.textContent = 'Contact the business to discuss these services. They are not checkout items.';
    section.appendChild(note);
    const layout = document.createElement('div');
    layout.className = 'business-services-master-detail';
    const detail = document.createElement('div');
    detail.className = 'business-services-selected-detail';
    detail.id = 'businessServiceDetailPanel';
    detail.setAttribute('role', 'tabpanel');
    const listSide = document.createElement('aside');
    listSide.className = 'business-services-list-side';
    const listHeader = document.createElement('div');
    listHeader.className = 'business-services-list-header';
    const listTitle = document.createElement('h3');
    listTitle.textContent = 'Services';
    listHeader.appendChild(listTitle);
    const listScrollControls = document.createElement('div');
    listScrollControls.className = 'business-services-list-scroll-controls';
    const scrollListUp = document.createElement('button');
    scrollListUp.type = 'button';
    scrollListUp.setAttribute('aria-label', 'Scroll service list up');
    scrollListUp.innerHTML = '<i class="fas fa-chevron-up" aria-hidden="true"></i>';
    scrollListUp.addEventListener('click', () => scrollBusinessServiceList(-1));
    const scrollListDown = document.createElement('button');
    scrollListDown.type = 'button';
    scrollListDown.setAttribute('aria-label', 'Scroll service list down');
    scrollListDown.innerHTML = '<i class="fas fa-chevron-down" aria-hidden="true"></i>';
    scrollListDown.addEventListener('click', () => scrollBusinessServiceList(1));
    listScrollControls.append(scrollListUp, scrollListDown);
    listHeader.appendChild(listScrollControls);
    listSide.appendChild(listHeader);

    const list = document.createElement('div');
    list.className = 'business-services-list-items';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Choose a service to view');
    list.setAttribute('aria-orientation', 'vertical');
    const services = getVisibleBusinessServices();
    services.forEach((service, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'business-services-list-button';
        button.id = `businessServiceTab-${index}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', detail.id);
        button.setAttribute('aria-selected', index === businessServicesSelectedIndex ? 'true' : 'false');
        button.tabIndex = index === businessServicesSelectedIndex ? 0 : -1;
        button.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
            const current = tabs.indexOf(button);
            const next = event.key === 'Home' ? 0
                : event.key === 'End' ? tabs.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next]?.focus();
            selectBusinessServiceInPanel(next);
        });
        const name = document.createElement('span');
        name.className = 'business-services-list-name';
        name.textContent = service.name || 'Service';
        button.appendChild(name);
        const price = document.createElement('span');
        price.className = 'business-services-list-price';
        const units = { per_service: 'per job', per_item: 'per item', per_hour: 'per hour', per_day: 'per day' };
        price.textContent = service.pricing_mode === 'negotiable'
            ? 'Flexible price'
            : `Ksh ${Number(service.price || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })} ${units[service.price_unit] || units.per_service}`;
        button.appendChild(price);
        button.addEventListener('click', () => selectBusinessServiceInPanel(index));
        list.appendChild(button);
    });
    listSide.appendChild(list);
    layout.append(detail, listSide);
    section.appendChild(layout);
    if (services.length) renderSelectedBusinessService(services, detail, list);
    return section;
}

function renderSelectedBusinessService(services = getVisibleBusinessServices(), detail = null, list = null) {
    if (!businessServicesPanelElement && (!detail || !list)) return;
    detail = detail || businessServicesPanelElement.querySelector('#businessServiceDetailPanel');
    list = list || businessServicesPanelElement.querySelector('.business-services-list-items');
    if (!detail || !list || !services.length) return;
    businessServicesSelectedIndex = Math.max(0, Math.min(businessServicesSelectedIndex, services.length - 1));
    detail.replaceChildren(createBusinessServiceCard(services[businessServicesSelectedIndex]));
    list.querySelectorAll('[role="tab"]').forEach((button, index) => {
        const selected = index === businessServicesSelectedIndex;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
    });
    detail.setAttribute('aria-labelledby', `businessServiceTab-${businessServicesSelectedIndex}`);
}

function selectBusinessServiceInPanel(index) {
    businessServicesSelectedIndex = index;
    renderSelectedBusinessService();
}

function scrollBusinessServiceList(direction) {
    const list = businessServicesPanelElement?.querySelector('.business-services-list-items');
    if (!list) return;
    list.scrollBy({ top: direction * Math.max(140, Math.round(list.clientHeight * 0.75)), behavior: 'smooth' });
}

function updateBusinessServicesTeaserStates() {
    document.querySelectorAll('.business-services-teaser-button').forEach(button => {
        const isExpanded = Number(button.dataset.serviceBreakIndex) === businessServicesExpandedBreakIndex;
        button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });
}

function toggleBusinessServicesAt(index) {
    if (businessServicesExpandedBreakIndex === index) {
        closeBusinessServicesPanel();
        return;
    }
    const slot = document.getElementById(`businessServicesPanelSlot-${index}`);
    if (!slot) return;
    if (!businessServicesPanelElement) businessServicesPanelElement = createBusinessServicesPanel();
    businessServicesExpandedBreakIndex = index;
    slot.appendChild(businessServicesPanelElement);
    updateBusinessServicesTeaserStates();
    businessServicesPanelElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeBusinessServicesPanel() {
    businessServicesPanelElement?.querySelectorAll('video').forEach(video => video.pause());
    businessServicesPanelElement?.remove();
    businessServicesExpandedBreakIndex = null;
    businessServicesSelectedIndex = 0;
    renderSelectedBusinessService();
    updateBusinessServicesTeaserStates();
}

window.addEventListener('resize', () => {
    const grid = document.getElementById('productGrid');
    const columns = getBusinessProductGridColumns(grid);
    if (businessDisplayedProducts && columns !== businessProductGridColumnCount) {
        renderBusinessProductGrid(businessDisplayedProducts);
    }
});

function hideFollowButtonForNonCustomer() {
    const followBtn = document.getElementById('followBtn');
    if (followBtn) followBtn.style.display = 'none';
}

// ============================================================
//  RENDER BUSINESS PROFILE
// ============================================================

function renderBusinessProfile() {
    const business = businessData;
    if (!business) return;

    const heroTitle = document.getElementById('heroTitle');
    const heroLocation = document.getElementById('heroLocation');
    const heroAddress = document.getElementById('heroAddress');
    const heroLogo = document.getElementById('heroLogo');

    if (heroTitle) heroTitle.textContent = business.business_name || 'Welcome';
    if (heroLocation) heroLocation.textContent = business.location || '';
    if (heroAddress) heroAddress.textContent = business.address || '';

    const productCountEl = document.getElementById('productCount');
    const followerCountEl = document.getElementById('followerCount');
    if (productCountEl) productCountEl.textContent = business.product_count || 0;
    if (followerCountEl) followerCountEl.textContent = business.follower_count || 0;

    if (heroLogo) {
        if (business.logo && business.logo !== '') {
            heroLogo.src = business.logo;
            heroLogo.style.display = 'block';
        } else {
            heroLogo.style.display = 'none';
        }
    }

    renderHeroMedia(business);
    renderHeroDescriptionOverlay(business);
    renderHeroSearchTagChip(business);

    const verifiedBadge = document.getElementById('verifiedBadge');
    if (verifiedBadge) verifiedBadge.style.display = 'none';

    const missionEl = document.getElementById('businessMission');
    const visionEl = document.getElementById('businessVision');
    const descEl = document.getElementById('businessDescription');
    if (missionEl) missionEl.textContent = business.mission || '-';
    if (visionEl) visionEl.textContent = business.vision || '-';
    if (descEl) descEl.textContent = business.description || 'No description provided.';

    renderSocialLinks(business);
    renderMap(business);

    if (!isCustomerViewer()) hideFollowButtonForNonCustomer();

    applyOrderVisibilityState();
    renderThankYouBand(business);
}

// ============================================================
//  HERO SEARCH TAG CHIP
// ============================================================

function renderHeroSearchTagChip(business) {
    const chip = document.getElementById('heroSearchTagChip');
    const valueEl = document.getElementById('heroSearchTagValue');
    const btn = document.getElementById('heroSearchTagBtn');
    if (!chip || !valueEl) return;

    const display = business && business.search_display ? String(business.search_display).trim() : '';
    const confirmed = business && business.search_tag_confirmed === true;

    if (!display || !confirmed) {
        chip.style.display = 'none';
        valueEl.textContent = '';
        return;
    }

    chip.style.display = 'block';
    valueEl.textContent = display;

    if (btn && !btn.dataset.wired) {
        btn.dataset.wired = 'true';
        btn.addEventListener('click', () => {
            const tag = valueEl.textContent || '';
            if (!tag) return;
            const fallback = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = tag;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'absolute';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    if (typeof showToast === 'function') showToast('Copied: ' + tag, 'success');
                } catch (err) {
                    if (typeof showToast === 'function') showToast('Could not copy. Please copy it manually.', 'warning');
                }
            };
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(tag)
                    .then(() => { if (typeof showToast === 'function') showToast('Copied: ' + tag, 'success'); })
                    .catch(fallback);
            } else {
                fallback();
            }
        });
    }
}

// ============================================================
//  THANK-YOU BAND
// ============================================================

let thankYouPopupTimer = null;

function dismissThankYouBand() {
    const band = document.getElementById('thankYouBand');
    if (!band) return;
    clearTimeout(thankYouPopupTimer);
    band.classList.remove('is-visible');
    band.hidden = true;
}

window.dismissThankYouBand = dismissThankYouBand;

function renderThankYouBand(business) {
    const band = document.getElementById('thankYouBand');
    const nameEl = document.getElementById('thankYouBusinessName');
    if (!band || band.dataset.shown === 'true') return;
    band.dataset.shown = 'true';
    const name = business && business.business_name ? String(business.business_name).trim() : 'our business';
    if (nameEl) nameEl.textContent = name;
    clearTimeout(thankYouPopupTimer);
    band.hidden = true;
    band.classList.remove('is-visible');
    thankYouPopupTimer = setTimeout(() => {
        band.hidden = false;
        requestAnimationFrame(() => band.classList.add('is-visible'));
        thankYouPopupTimer = setTimeout(dismissThankYouBand, 4800);
    }, 700);
}

// ============================================================
//  HERO MEDIA
// ============================================================

function isVideoUrl(url) {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(String(url));
}

function renderHeroMedia(business) {
    const slot = document.getElementById('heroMediaSlot');
    if (!slot) return;
    slot.innerHTML = '';
    const coverUrl = business && (business.heroImage || business.heroimage);
    if (!coverUrl) return;

    if (isVideoUrl(coverUrl)) {
        const video = document.createElement('video');
        video.className = 'hero-media-video';
        video.src = coverUrl;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.preload = 'metadata';
        slot.appendChild(video);
        return;
    }

    const img = document.createElement('img');
    img.className = 'hero-media-image';
    img.src = coverUrl;
    img.alt = (business.business_name || 'Business') + ' cover';
    img.loading = 'lazy';
    img.onerror = function () { this.remove(); };
    slot.appendChild(img);
}

// ============================================================
//  HERO DESCRIPTION OVERLAY
// ============================================================

function renderHeroDescriptionOverlay(business) {
    const overlay = document.getElementById('heroDescriptionOverlay');
    const track = document.getElementById('heroDescriptionTrack');
    if (!overlay || !track) return;

    overlay.classList.remove('is-scrolling');
    track.style.animationDuration = '';
    track.style.removeProperty('--hero-desc-scroll');
    const tagline = String(business && business.description || '').trim();
    if (!tagline) {
        overlay.style.display = 'none';
        track.textContent = '';
        return;
    }

    const description = document.createElement('span');
    description.className = 'hero-desc-tagline';
    description.textContent = tagline;
    const repeatedDescription = description.cloneNode(true);
    repeatedDescription.setAttribute('aria-hidden', 'true');
    track.replaceChildren(description, repeatedDescription);

    overlay.style.display = '';

    requestAnimationFrame(() => {
        const overlayHeight = overlay.clientHeight;
        const descriptionHeight = description.getBoundingClientRect().height;
        if (!overlayHeight || !descriptionHeight) return;

        // Space the repeated copy so it enters exactly as the first
        // copy completes one upward pass, keeping the loop seamless.
        const travelDistance = Math.max(overlayHeight, descriptionHeight);
        track.style.gap = Math.max(0, travelDistance - descriptionHeight) + 'px';
        track.style.setProperty('--hero-desc-scroll', '-' + travelDistance + 'px');
        const durationSeconds = Math.min(120, Math.max(22, travelDistance / 18));
        track.style.animationDuration = durationSeconds + 's';
        overlay.classList.add('is-scrolling');
    });
}

// ============================================================
//  ORDER VISIBILITY
// ============================================================

function applyOrderVisibilityState() {
    if (!businessData) return;
    const ordersEnabled = businessData.online_orders_enabled !== false;
    const banner = document.getElementById('ordersPausedBanner');
    const contactBlock = document.getElementById('ordersPausedContactBlock');
    if (ordersEnabled) {
        if (banner) banner.style.display = 'none';
        if (contactBlock) contactBlock.style.display = 'none';
        return;
    }
    renderOrdersPausedBanner();
    renderOrdersPausedContactBlock();
}

function renderOrdersPausedBanner() {
    const banner = document.getElementById('ordersPausedBanner');
    const messageEl = document.getElementById('ordersPausedMessage');
    if (!banner || !messageEl) return;
    const custom = (businessData && businessData.order_disabled_message) ? String(businessData.order_disabled_message).trim() : '';
    messageEl.textContent = custom || DEFAULT_ORDERS_PAUSED_MESSAGE;
    banner.style.display = 'block';
}

function renderOrdersPausedContactBlock() {
    const block = document.getElementById('ordersPausedContactBlock');
    const iconsContainer = document.getElementById('ordersPausedContactIcons');
    const emptyHint = document.getElementById('ordersPausedContactEmpty');
    if (!block || !iconsContainer) return;

    const iconDefs = [];
    if (businessData && businessData.whatsapp) {
        const cleaned = String(businessData.whatsapp).replace(/[^0-9]/g, '');
        iconDefs.push({ href: 'https://wa.me/' + cleaned, label: 'WhatsApp', iconClass: 'fab fa-whatsapp', color: '#25D366' });
    }
    if (businessData && businessData.tiktok) {
        const handle = String(businessData.tiktok).replace('@', '').trim();
        iconDefs.push({ href: 'https://tiktok.com/@' + handle, label: 'TikTok', iconClass: 'fab fa-tiktok', color: '#000000' });
    }
    if (businessData && businessData.instagram) {
        const handle = String(businessData.instagram).replace('@', '').trim();
        iconDefs.push({ href: 'https://instagram.com/' + handle, label: 'Instagram', iconClass: 'fab fa-instagram', color: '#E4405F' });
    }
    if (businessData && businessData.facebook) {
        const handle = String(businessData.facebook).replace('@', '').trim();
        iconDefs.push({ href: 'https://facebook.com/messages/t/' + handle, label: 'Messenger', iconClass: 'fab fa-facebook-messenger', color: '#1877F2' });
    }
    if (businessData && businessData.phone) {
        iconDefs.push({ href: 'tel:' + businessData.phone, label: 'Call', iconClass: 'fas fa-phone', color: '#2563eb' });
    }

    if (iconDefs.length === 0) {
        iconsContainer.innerHTML = '';
        if (emptyHint) emptyHint.style.display = 'block';
    } else {
        iconsContainer.innerHTML = iconDefs.map(icon =>
            '<a href="' + icon.href + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:30px;background:' + icon.color + ';color:white;font-size:0.8rem;font-weight:600;text-decoration:none;"><i class="' + icon.iconClass + '"></i> ' + icon.label + '</a>'
        ).join('');
        if (emptyHint) emptyHint.style.display = 'none';
    }
    block.style.display = 'block';
}

// ============================================================
//  SOCIAL LINKS
// ============================================================

function renderSocialLinks(business) {
    const links = [
        ['iconWhatsapp', business.whatsapp ? 'https://wa.me/' + String(business.whatsapp).replace(/\D/g, '') : null],
        ['iconTiktok', business.tiktok ? (String(business.tiktok).startsWith('http') ? business.tiktok : 'https://tiktok.com/@' + String(business.tiktok).replace(/^@/, '')) : null],
        ['iconInstagram', business.instagram ? (String(business.instagram).startsWith('http') ? business.instagram : 'https://instagram.com/' + String(business.instagram).replace(/^@/, '')) : null],
        ['iconFacebook', business.facebook ? (String(business.facebook).startsWith('http') ? business.facebook : 'https://facebook.com/' + String(business.facebook).replace(/^@/, '')) : null],
        ['iconPhone', business.phone ? 'tel:' + String(business.phone).replace(/[^+\d]/g, '') : null],
        ['iconEmail', business.email ? 'mailto:' + String(business.email).trim() : null],
        ['iconWebsite', business.website ? (String(business.website).match(/^https?:\/\//i) ? String(business.website).trim() : 'https://' + String(business.website).trim()) : null]
    ];

    let hasContact = false;
    for (const [id, href] of links) {
        const link = document.getElementById(id);
        if (!link) continue;
        if (href) {
            link.href = href;
            link.style.display = 'inline-flex';
            hasContact = true;
        } else {
            link.removeAttribute('href');
            link.style.display = 'none';
        }
    }

    const contactSection = document.getElementById('businessProfileContacts');
    const emptyHint = document.getElementById('businessContactEmpty');
    const contactHeading = document.getElementById('businessContactHeading');
    const navContact = document.getElementById('navBusinessContact');
    const navLabel = document.getElementById('navBusinessContactLabel');
    const businessName = String(business.business_name || 'Business').trim();
    if (contactHeading) contactHeading.textContent = businessName + ' Contact';
    if (navLabel) navLabel.textContent = businessName + ' Contact';
    if (contactSection) contactSection.style.display = 'none';
    if (emptyHint) emptyHint.style.display = hasContact ? 'none' : 'block';
    if (navContact) navContact.style.display = 'flex';
}

// ============================================================
//  MAP
// ============================================================

function renderMap(business) {
    const mapContainer = document.getElementById('shopMap');
    const lat = parseFloat(business.latitude);
    const lng = parseFloat(business.longitude);
    const address = business.address || '';

    if (mapContainer && typeof L !== 'undefined') {
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            if (businessMap) businessMap.remove();
            window.businessMap = L.map('shopMap').setView([lat, lng], 15);
            businessMap = window.businessMap;
            L.tileLayer(CARTO_TILE_URL, {
                attribution: CARTO_TILE_ATTRIBUTION,
                subdomains: CARTO_TILE_SUBDOMAINS,
                maxZoom: 19
            }).addTo(businessMap);
            L.marker([lat, lng]).addTo(businessMap)
                .bindPopup('<strong>' + business.business_name + '</strong><br>' + (address || business.location || ''));
            const mapAddressEl = document.getElementById('mapAddress');
            if (mapAddressEl) mapAddressEl.textContent = address || '';
            const staticMapSection = document.getElementById('staticMapSection');
            if (staticMapSection) staticMapSection.style.display = 'block';
        }
    }
}

// ============================================================
//  BUSINESS SLIDER
// ============================================================

function buildBusinessSlider() {
    const wrapper = document.getElementById('sliderWrapper');
    if (!wrapper) return;

    const images = [];
    const heroImage = businessData.heroImage || businessData.heroimage;
    if (heroImage) images.push(heroImage);
    if (businessData.logo) images.push(businessData.logo);

    businessProductList.forEach(p => {
        if (p.image && !images.includes(p.image)) {
            images.push(p.image);
        }
    });

    if (images.length === 0) {
        wrapper.textContent = 'No images available';
        return;
    }

    wrapper.innerHTML = images.map(img =>
        '<div class="slide"><img src="' + img + '" alt="Business image" onerror="this.parentElement.textContent=\'Image unavailable\'"></div>'
    ).join('');

    window.businessSlideIndex = 0;
    businessSlideIndex = window.businessSlideIndex;
    updateBusinessSlider();
    clearInterval(businessSlideTimer);
    window.businessSlideTimer = setInterval(() => changeBusinessSlide(1), 4000);
    businessSlideTimer = window.businessSlideTimer;
}

function updateBusinessSlider() {
    const wrapper = document.getElementById('sliderWrapper');
    if (!wrapper) return;
    const total = wrapper.children.length || 1;
    wrapper.style.transform = 'translateX(-' + (businessSlideIndex * 100) + '%)';
}

function changeBusinessSlide(direction) {
    const wrapper = document.getElementById('sliderWrapper');
    if (!wrapper) return;
    const total = wrapper.children.length || 1;
    window.businessSlideIndex = (businessSlideIndex + direction + total) % total;
    businessSlideIndex = window.businessSlideIndex;
    updateBusinessSlider();
}

// ============================================================
//  LOAD BUSINESS PRODUCTS � PHASE 2: forwards the active tab
// ============================================================

async function loadBusinessProducts() {
    try {
        if (!businessSlug) {
            window.businessProductList = [];
            businessProductList = window.businessProductList;
            renderBusinessGrid();

            return;
        }

        const tab = getActiveProductTab();
        const url = '/api/businesses/' + encodeURIComponent(businessSlug) + '/products?limit=24&page=1&tab=' + encodeURIComponent(tab);
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

        // The visible first page is ready. Fetch additional pages in parallel
        // after paint instead of serially blocking the whole shop.
        const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2);
        const remainingProductsPromise = Promise.all(remainingPages.map(async page => {
            const nextRes = await fetch('/api/businesses/' + encodeURIComponent(businessSlug) + '/products?limit=24&page=' + page + '&tab=' + encodeURIComponent(tab));
            if (!nextRes.ok) return [];
            const nextData = await nextRes.json();
            return Array.isArray(nextData.products) ? nextData.products : [];
        })).catch(err => {
            console.warn('Background product pages failed:', err.message);
            return [];
        });

        window.businessProductList = allProducts;
        businessProductList = window.businessProductList;

        populateBusinessProductCategories();

        console.log('Loaded ' + businessProductList.length + ' products for tab "' + tab + '"');

        showProductTabEmptyState(tab, allProducts.length > 0);
        renderBusinessGrid();

        remainingProductsPromise.then(pages => {
            const laterProducts = pages.flat();
            if (!laterProducts.length) return;
            allProducts.push(...laterProducts);
            window.businessProductList = allProducts;
            businessProductList = allProducts;
            populateBusinessProductCategories();
            renderBusinessGrid();
        });
    } catch (err) {
        console.error('Products error:', err);
        const grid = document.getElementById('productGrid');
        if (grid) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#94a3b8;">No products available yet.</p>';
        }
    }
}

// ============================================================
//  FALLBACK IMAGE
// ============================================================

function businessFallbackImage(product) {
    const rawLabel = String((product && product.name) || 'Product').slice(0, 32);
    const safeLabel = rawLabel.replace(/[\u0000-\u001F\u007F\uD800-\uDFFF\uFFFE\uFFFF]/g, '');
    let encoded;
    try {
        encoded = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" fill="#475569">Product image</text><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="#64748b">' + safeLabel + '</text></svg>');
    } catch (err) {
        encoded = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" fill="#475569">Product image</text></svg>');
    }
    return 'data:image/svg+xml;charset=UTF-8,' + encoded;
}

// ============================================================
//  PRODUCT-CATEGORY FILTERS
// ============================================================

function populateBusinessProductCategories() {
    const select = document.getElementById('businessProductCategoryFilter');
    if (!select) return;
    const selected = select.value || 'all';
    const categories = [...new Set((businessProductList || []).map(product => product.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="all">Product categories</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });
    select.value = categories.includes(selected) ? selected : 'all';
}

// ============================================================
//  GRID � PHASE 2: uses thumbnail_url / thumbnail_kind
// ============================================================

function renderBusinessGrid() {
    renderBusinessProductGrid(businessProductList || []);
}

function renderBusinessProductGrid(products, emptyStateText = 'No products available yet.') {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    products = Array.isArray(products) ? products : [];
    businessDisplayedProducts = products;
    const columns = getBusinessProductGridColumns(grid);
    businessProductGridColumnCount = columns;
    const activeTab = getActiveProductTab();
    const visibleServices = businessServicesList.filter(service => {
        if (activeTab === 'all') return true;
        return getBusinessServiceMedia(service).length > 0;
    });
    // Insert one services prompt after each complete responsive product row.
    const productsPerServiceRow = columns;
    const renderedProducts = [];

    const cart = typeof getCart === 'function' ? getCart() : [];
    const onlineOrdersEnabled = businessData.online_orders_enabled !== false;

    const productMarkup = products.map(p => {
        const inCart = cart.some(item => item.id === p.id);
        const btnText = inCart ? 'Add More' : 'Add to Cart';
        const btnClass = inCart ? 'in-cart' : '';
        const qtyId = 'bqty-' + p.id;
        const disabled = !onlineOrdersEnabled ? 'disabled' : '';

        const thumbUrl = p.thumbnail_url || p.image || businessFallbackImage(p);
        const fullVariantImage = Array.isArray(p.variants) ? p.variants.find(variant => variant && variant.image)?.image : '';
        const fullImageUrl = p.image || fullVariantImage || p.thumbnail_url || businessFallbackImage(p);
        const thumbKind = p.thumbnail_kind || (p.image ? 'image' : 'placeholder');
        const fallbackForThisProduct = businessFallbackImage(p).replace(/'/g, "\\'");
        const imageHtml = '<img src="' + thumbUrl + '" alt="' + String(p.name).replace(/"/g, '&quot;') + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + fallbackForThisProduct + '\'">';
        const videoPill = thumbKind === 'video'
            ? '<span class="video-pill"><i class="fas fa-play"></i> Video</span>'
            : '';
        const imagePreviewButton = thumbKind === 'image'
            ? '<button type="button" class="product-image-preview" data-preview-src="' + escapeBusinessProductText(fullImageUrl) + '" data-preview-alt="' + escapeBusinessProductText(p.name || 'Product image') + '" aria-label="Preview full image of ' + escapeBusinessProductText(p.name || 'product') + '" onclick="event.stopPropagation(); openBusinessImagePreviewFromButton(this)"><i class="fas fa-expand-alt" aria-hidden="true"></i><span>Preview</span></button>'
            : '';

        const ratingHtml = '';
        const description = String(p.description || '').trim();
        const titleHtml = '<div class="product-card-title-row"><div class="name">' + escapeBusinessProductText(p.name || '') + ' ' + (inCart ? '<span class="green-tick">?</span>' : '') + '</div>'
            + '</div>';
        const descriptionHtml = description
            ? '<div class="product-description"><span class="product-description-text">' + escapeBusinessProductText(description) + '</span></div>'
            : '';
        const priceHtml = '<div class="product-card-price-row"><div class="price">' + escapeBusinessProductText(p.price || '') + '</div>'
            + (description ? '<button type="button" class="product-description-toggle" aria-expanded="false" onclick="event.stopPropagation(); toggleBusinessProductDescription(this)">More</button>' : '')
            + '</div>';

        return '<div class="product-card">'
            + '<div class="media-wrap" onclick="location.href=\'/product-detail.html?id=' + p.id + '&business=' + businessSlug + '\'">'
            + imageHtml
            + '<div class="quick-view-icon"><i class="fas fa-eye"></i></div>'
            + imagePreviewButton
            + (p.isFlashSale ? '<div class="flash-badge">??</div>' : '')
            + (p.isNewArrival ? '<div class="new-badge">??</div>' : '')
            + videoPill
            + '<i id="bwishlist-icon-' + p.id + '" class="far fa-heart" onclick="event.stopPropagation(); toggleBusinessWishlist(' + p.id + ')" style="position:absolute; top:8px; left:8px; font-size:1.2rem; background:white; padding:4px; border-radius:50%; cursor:pointer; z-index:10;"></i>'
            + '</div>'
            + '<div class="info">'
            + titleHtml
            + descriptionHtml
            + priceHtml
            + ratingHtml
            + '<div class="actions">'
            + '<div class="qty-control">'
            + '<button onclick="changeBusinessCardQty(' + p.id + ', -1)" ' + disabled + '>-</button>'
            + '<span id="' + qtyId + '">1</span>'
            + '<button onclick="changeBusinessCardQty(' + p.id + ', 1)" ' + disabled + '>+</button>'
            + '</div>'
            + '<button class="btn-add ' + btnClass + '" onclick="addBusinessCardToCart(' + p.id + ', this)" ' + disabled + '>'
            + '<i class="fas fa-cart-plus"></i> ' + (onlineOrdersEnabled ? btnText : 'Not available')
            + '</button>'
            + '</div>'
            + '<button type="button" class="business-product-inquiry-trigger" onclick="event.stopPropagation(); openProductInquiry(' + Number(p.id) + ', this)"><i class="fas fa-comments" aria-hidden="true"></i> Let\'s Talk</button>'
            + '</div>'
            + '</div>';
    }).join('');

    const productTemplate = document.createElement('template');
    productTemplate.innerHTML = productMarkup;
    renderedProducts.push(...Array.from(productTemplate.content.children));
    const content = document.createDocumentFragment();
    let serviceBreakIndex = 0;
    if (!renderedProducts.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'business-product-empty';
        emptyMessage.textContent = emptyStateText;
        content.appendChild(emptyMessage);
        if (visibleServices.length) content.appendChild(createBusinessServicesTeaser(serviceBreakIndex++));
    } else {
        renderedProducts.forEach((productCard, index) => {
            content.appendChild(productCard);
            const reachedProductRow = (index + 1) % productsPerServiceRow === 0;
            if (reachedProductRow && visibleServices.length) {
                content.appendChild(createBusinessServicesTeaser(serviceBreakIndex++));
            }
        });
        if (serviceBreakIndex === 0 && visibleServices.length) content.appendChild(createBusinessServicesTeaser(serviceBreakIndex++));
    }
    grid.replaceChildren(content);
    if (businessServicesExpandedBreakIndex !== null) {
        const expandedSlot = document.getElementById(`businessServicesPanelSlot-${businessServicesExpandedBreakIndex}`);
        if (expandedSlot && businessServicesPanelElement) expandedSlot.appendChild(businessServicesPanelElement);
        else if (!expandedSlot) closeBusinessServicesPanel();
    }
    updateBusinessServicesTeaserStates();
}

function openBusinessImagePreviewFromButton(button) {
    if (!button) return;
    const modal = document.getElementById('businessImagePreviewModal');
    const image = document.getElementById('businessImagePreviewImage');
    if (!modal || !image) return;
    image.src = button.dataset.previewSrc || '';
    image.alt = button.dataset.previewAlt || 'Product image';
    image.loading = 'eager';
    image.decoding = 'async';
    modal.classList.add('active');
    document.body.classList.add('image-preview-open');
}

function closeBusinessImagePreview() {
    const modal = document.getElementById('businessImagePreviewModal');
    const image = document.getElementById('businessImagePreviewImage');
    if (modal) modal.classList.remove('active');
    if (image) image.removeAttribute('src');
    document.body.classList.remove('image-preview-open');
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeBusinessImagePreview();
});

function escapeBusinessProductText(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function toggleBusinessProductDescription(button) {
    const description = button.closest('.product-card')?.querySelector('.product-description');
    if (!description) return;
    const expanded = description.classList.toggle('is-expanded');
    button.textContent = expanded ? 'Less' : 'More';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function changeBusinessCardQty(productId, delta) {
    const qtySpan = document.getElementById('bqty-' + productId);
    if (!qtySpan) return;
    let current = parseInt(qtySpan.textContent) || 1;
    current = Math.max(1, current + delta);
    qtySpan.textContent = current;
}

function queueBusinessProductCartAfterAuth(productId, quantity) {
    try {
        const returnUrl = new URL('/product-detail.html', window.location.origin);
        returnUrl.searchParams.set('id', String(productId));
        if (businessData && businessData.slug) returnUrl.searchParams.set('business', businessData.slug);
        returnUrl.searchParams.set('cartAdd', '1');
        returnUrl.searchParams.set('cartProductId', String(productId));
        returnUrl.searchParams.set('cartQty', String(quantity || 1));
        localStorage.setItem('postLoginReturnToProduct', returnUrl.pathname + returnUrl.search);
    } catch (error) {
        console.error('Could not save the pending cart item:', error);
    }
    if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
    } else {
        window.location.assign('/marketplace?auth=login');
    }
}

async function addBusinessCardToCart(productId, button) {
    if (businessData && businessData.online_orders_enabled === false) {
        showToast('? This shop is not taking orders at the moment.', 'error');
        return;
    }
    const qtySpan = document.getElementById('bqty-' + productId);
    const qty = qtySpan ? parseInt(qtySpan.textContent) || 1 : 1;
    const role = getViewerRole();
    if (role === 'guest') {
        queueBusinessProductCartAfterAuth(productId, qty);
        return;
    }
    if (role !== 'customer') {
        showToast('Please use a customer account to add products to your cart.', 'error');
        return;
    }
    const quantity = Math.max(1, Math.min(99, qty));
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    }
    try {
        const result = await window.addProductToCart(productId, quantity, {
            promptAuth: false,
            onAuthRequired: () => queueBusinessProductCartAfterAuth(productId, quantity)
        });
        if (result?.authRequired) return;
        if (qtySpan) qtySpan.textContent = '1';
        if (button) {
            button.classList.add('in-cart');
            button.innerHTML = '<i class="fas fa-cart-plus"></i> Add More';
        }
        showToast('Added to cart.', 'success');
    } catch (error) {
        showToast(error.message || 'Unable to add this product to your cart.', 'error');
    } finally {
        if (button && document.body.contains(button)) {
            if (button.textContent.includes('Adding...')) button.innerHTML = '<i class="fas fa-cart-plus"></i> Add to Cart';
            button.disabled = false;
        }
    }
}

// ============================================================
//  FILTER BUSINESS PRODUCTS
// ============================================================

function filterBusinessProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const query = (document.getElementById('businessSearchInput')?.value || '').trim().toLowerCase();
    const legacyCategory = document.getElementById('businessProductCategoryFilter')?.value || 'all';

    let products = (businessProductList || []).slice();

    if (query) {
        products = products.filter(p =>
            (p.name || '').toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query))
        );
    }

    if (legacyCategory !== 'all') {
        products = products.filter(p => p.category === legacyCategory);
    }

    if (products.length === 0) {
        renderBusinessProductGrid([], 'No products match your filters.');
        return;
    }

    renderBusinessProductGrid(products);
}

// ============================================================
//  WISHLIST TOGGLE
// ============================================================

async function toggleBusinessWishlist(productId) {
    if (!isCustomerViewer()) {
        if (typeof openAuthModal === 'function') openAuthModal('login');
        return;
    }
    try {
        const res = await fetch('/api/products/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId })
        });
        const data = await res.json();
        if (data.success) {
            const icon = document.getElementById('bwishlist-icon-' + productId);
            if (icon) {
                if (data.action === 'added') {
                    icon.className = 'fas fa-heart';
                    icon.style.color = '#ef4444';
                } else {
                    icon.className = 'far fa-heart';
                    icon.style.color = '';
                }
            }
            if (typeof showToast === 'function') {
                showToast(data.action === 'added' ? '?? Added to wishlist' : '?? Removed from wishlist', 'success');
            }
        }
    } catch (err) {
        console.error('Wishlist error:', err);
    }
}

// ============================================================
//  FOLLOW / UNFOLLOW BUSINESS
// ============================================================

async function checkFollowStatus() {
    if (!isCustomerViewer()) return;
    try {
        const res = await fetch('/api/businesses/' + businessSlug + '/follow-status');
        if (!res.ok) return;
        const data = await res.json();
        window.isFollowing = data.isFollowing || false;
        isFollowing = window.isFollowing;
        updateFollowButton();
    } catch (err) {
        console.error('Check follow error:', err);
    }
}

function updateFollowButton() {
    const followText = document.getElementById('followText');
    const followBtn = document.getElementById('followBtn');
    if (!followText || !followBtn) return;

    if (isFollowing) {
        followText.textContent = 'Following';
        followBtn.className = 'btn btn-following';
    } else {
        followText.textContent = 'Follow';
        followBtn.className = 'btn btn-primary';
    }
}

async function toggleFollow() {
    if (!isCustomerViewer()) {
        if (typeof openAuthModal === 'function') openAuthModal('login');
        return;
    }
    try {
        const res = await fetch('/api/businesses/' + businessSlug + '/follow', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            window.isFollowing = data.action === 'followed';
            isFollowing = window.isFollowing;
            updateFollowButton();
            if (typeof showToast === 'function') {
                showToast(isFollowing ? '? Now following this business!' : '? Unfollowed this business', 'success');
            }
            loadBusinessProfile();
        }
    } catch (err) {
        console.error('Follow error:', err);
        alert('Could not update follow status. Please try again.');
    }
}

// ============================================================
//  CART BADGE
// ============================================================

function updateCartBadge() {
    const cart = typeof getCart === 'function' ? getCart() : [];
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badges = document.querySelectorAll('#cartBadge, #navCartBadge, #navCartBadgeBP');
    badges.forEach(badge => {
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.add('show');
            } else {
                badge.classList.remove('show');
            }
        }
    });
}

function updateNavCartBadge() {
    updateCartBadge();
}

// ============================================================
//  SHOW TOAST
// ============================================================

function showToast(message, type) {
    type = type || 'success';
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(message, type);
        return;
    }
    const existing = document.querySelector('.toast-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;max-width:400px;width:100%;';

    const toast = document.createElement('div');
    const typeMap = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#2563eb' };
    const iconMap = { success: '?', error: '?', warning: '??', info: '??' };
    const bgColor = typeMap[type] || '#2563eb';

    toast.className = 'toast ' + type;
    toast.style.cssText = 'background:' + bgColor + ';color:white;padding:14px 20px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);font-size:0.9rem;font-weight:500;display:flex;align-items:center;gap:12px;animation:slideIn 0.3s ease;margin-bottom:8px;transform:translateX(0);transition:transform 0.3s;word-break:break-word;';

    const icon = document.createElement('span');
    icon.innerHTML = iconMap[type] || '??';
    icon.style.fontSize = '1.2rem';
    icon.style.flexShrink = '0';

    const text = document.createElement('span');
    text.textContent = message;
    text.style.flex = '1';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '?';
    closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:1rem;cursor:pointer;margin-left:auto;opacity:0.7;transition:opacity 0.2s;flex-shrink:0;';

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    document.body.appendChild(container);

    setTimeout(() => {
        if (document.body.contains(container)) {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => container.remove(), 300);
        }
    }, 5000);
}

// ============================================================
//  EXPOSE FUNCTIONS
// ============================================================

window.logout = logout;
window.switchShopTab = switchShopTab;
window.renderProductTabs = renderProductTabs;
window.readProductTabFromUrl = readProductTabFromUrl;
window.writeProductTabToUrl = writeProductTabToUrl;
window.getActiveProductTab = getActiveProductTab;
window.changeBusinessCardQty = changeBusinessCardQty;
window.addBusinessCardToCart = addBusinessCardToCart;
window.goToMarketplaceCart = goToMarketplaceCart;
window.changeBusinessSlide = changeBusinessSlide;
window.loadBusinessProfile = loadBusinessProfile;
window.toggleBusinessWishlist = toggleBusinessWishlist;
window.toggleFollow = toggleFollow;
window.filterBusinessProducts = filterBusinessProducts;
window.showToast = showToast;
window.checkIfOwnBusiness = checkIfOwnBusiness;

window.getViewerRole = getViewerRole;
window.isCustomerViewer = isCustomerViewer;
window.isBusinessAdminViewer = isBusinessAdminViewer;

window.renderBusinessProductGrid = renderBusinessProductGrid;
window.openBusinessImagePreviewFromButton = openBusinessImagePreviewFromButton;
window.closeBusinessImagePreview = closeBusinessImagePreview;
window.closeDetails = function closeDetails() {
    const modal = document.getElementById('detailModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
};
window.populateBusinessProductCategories = populateBusinessProductCategories;
window.businessFallbackImage = businessFallbackImage;

window.applyOrderVisibilityState = applyOrderVisibilityState;
window.renderOrdersPausedBanner = renderOrdersPausedBanner;
window.renderOrdersPausedContactBlock = renderOrdersPausedContactBlock;

window.renderHeroMedia = renderHeroMedia;
window.renderHeroDescriptionOverlay = renderHeroDescriptionOverlay;
window.renderThankYouBand = renderThankYouBand;
window.renderHeroSearchTagChip = renderHeroSearchTagChip;

console.log('? Business Profile JS loaded successfully (Phase 2 � tabs wired, thumbnail_url used)');

function scrollToBusinessContact() {
    const contacts = document.getElementById('businessProfileContacts');
    if (!contacts) return;
    contacts.style.display = 'block';
    contacts.scrollIntoView({ behavior: 'smooth', block: 'start' });
    contacts.focus({ preventScroll: true });
}
window.scrollToBusinessContact = scrollToBusinessContact;
