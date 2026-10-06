(() => {
    const PENDING_KEY = 'postLoginProductConversation';
    const productContactCache = new Map();
    const businessContactCache = new Map();

    function normalisePhone(raw) {
        let digits = String(raw || '').replace(/\D/g, '');
        if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
        else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
        return digits.length >= 10 && digits.length <= 15 ? digits : '';
    }

    function formatPrice(raw) {
        const value = Number(String(raw || '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(value)
            ? `Ksh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
            : String(raw || 'Contact the business');
    }

    function openAuth() {
        if (typeof window.openBusinessProfileAuth === 'function') {
            window.openBusinessProfileAuth('login');
        } else if (typeof window.openAuthModal === 'function') {
            window.openAuthModal('login');
        } else {
            window.location.assign('/marketplace?auth=login');
        }
    }

    function mountInlineContactOptions(panel, trigger) {
        document.querySelectorAll('.business-service-contact-options:not([hidden])').forEach(existing => {
            existing.hidden = true;
            existing.parentElement?.querySelector('.business-service-inquiry-trigger')?.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.product-inquiry-inline').forEach(existing => {
            existing._contactTrigger?.setAttribute('aria-expanded', 'false');
            existing.remove();
        });
        const wrapper = document.createElement('div');
        wrapper.className = 'product-inquiry-inline';
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Contact options');
        wrapper._contactTrigger = trigger;
        wrapper.append(panel);
        const host = trigger?.closest('.marketplace-feed-card, .product-card, .related-item, .detail-container');
        if (host) {
            host.classList.add('product-inquiry-host');
            trigger.setAttribute('aria-expanded', 'true');
            host.append(wrapper);
            wrapper.classList.add('product-inquiry-card-overlay');
        } else if (trigger && trigger.parentElement) {
            trigger.setAttribute('aria-expanded', 'true');
            trigger.insertAdjacentElement('afterend', wrapper);
        } else {
            document.body.append(wrapper);
        }
        return wrapper;
    }

    function toggleContactOptions(trigger) {
        const current = [...document.querySelectorAll('.product-inquiry-inline')]
            .find(menu => menu._contactTrigger === trigger);
        if (!current) return false;
        current.remove();
        trigger?.setAttribute('aria-expanded', 'false');
        return true;
    }

    function closeInlineContactMenu(element) {
        const menu = element?.closest?.('.product-inquiry-inline');
        if (!menu) return;
        menu._contactTrigger?.setAttribute('aria-expanded', 'false');
        menu.remove();
    }

    function closeAllInlineContactMenus() {
        document.querySelectorAll('.product-inquiry-inline').forEach(menu => {
            menu._contactTrigger?.setAttribute('aria-expanded', 'false');
            menu.remove();
        });
    }

    function showContactOptionsLoading(trigger) {
        const panel = document.createElement('div');
        panel.className = 'product-inquiry-panel product-inquiry-loading-panel';
        const options = document.createElement('div');
        options.className = 'product-inquiry-choices';
        [
            ['fab fa-whatsapp', 'WhatsApp'],
            ['fas fa-comment-sms', 'SMS'],
            ['fas fa-comments', 'In-app conversation']
        ].forEach(([iconClass, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'product-inquiry-option business-service-contact-option';
            button.disabled = true;
            const icon = document.createElement('i');
            icon.className = iconClass;
            icon.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = label;
            const hint = document.createElement('small');
            hint.textContent = 'Loading contact options…';
            copy.append(title, hint);
            button.append(icon, copy);
            options.append(button);
        });
        panel.append(options);
        return mountInlineContactOptions(panel, trigger);
    }

    async function sendInAppProductInquiry(pending) {
        const response = await fetch('/api/service-conversations/customer/product-conversations', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending)
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
            localStorage.removeItem('postLoginServiceConversation');
            localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
            closeAllInlineContactMenus();
            openAuth();
            return false;
        }
        if (!response.ok || !data.conversationId) throw new Error(data.error || 'Could not start this conversation.');
        localStorage.removeItem(PENDING_KEY);
        window.location.assign(`/account.html?section=messages&serviceConversation=${encodeURIComponent(data.conversationId)}`);
        return true;
    }

    async function openProductInquiry(productId, trigger = document.activeElement) {
        const id = Number(productId);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        if (toggleContactOptions(trigger)) return;
        const loadingMenu = showContactOptionsLoading(trigger);
        try {
            let product = productContactCache.get(id);
            if (!product) {
                const response = await fetch(`/api/products/${id}/contact`, { credentials: 'same-origin' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'This product is not available.');
                product = data.product || data;
                productContactCache.set(id, product);
            }
            const businessSlug = product.business_slug || product.business?.slug || '';
            if (!businessSlug) throw new Error('This business is not available for contact.');
            if (!loadingMenu.isConnected) return;

            const panel = document.createElement('div');
            panel.className = 'product-inquiry-panel';
            const heading = document.createElement('div');
            heading.className = 'product-inquiry-header';
            const titleWrap = document.createElement('div');
            const title = document.createElement('h2');
            title.textContent = "Let's talk";
            const productTitle = document.createElement('p');
            productTitle.textContent = `${product.name || 'Product'} · ${formatPrice(product.price)}`;
            titleWrap.append(title, productTitle);
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'product-inquiry-close';
            close.setAttribute('aria-label', 'Close contact options');
            close.textContent = '×';
            close.addEventListener('click', () => {
                trigger?.setAttribute('aria-expanded', 'false');
                closeInlineContactMenu(panel);
            });
            heading.append(titleWrap, close);
            panel.appendChild(heading);

            const message = `Can we have a talk about this product please?\nProduct: ${product.name || 'Product'}\nPrice -> ${formatPrice(product.price)}`;
            const preview = document.createElement('p');
            preview.className = 'product-inquiry-preview';
            preview.textContent = `${message}\nProduct link: ${new URL(`/product-detail.html?id=${id}&business=${encodeURIComponent(businessSlug)}`, window.location.origin).href}`;
            panel.appendChild(preview);

            const whatsapp = normalisePhone(product.business_whatsapp || product.business_phone || product.business?.whatsapp || product.business?.phone);
            const sms = normalisePhone(product.business_phone || product.business?.phone);
            const options = document.createElement('div');
            options.className = 'product-inquiry-choices';
            [
                { method: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', phone: whatsapp },
                { method: 'sms', label: 'SMS', icon: 'fas fa-comment-sms', phone: sms },
                { method: 'inapp', label: 'In-app conversation', icon: 'fas fa-comments', phone: '' }
            ].forEach(option => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'product-inquiry-option business-service-contact-option';
                const icon = document.createElement('i');
                icon.className = option.icon;
                icon.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span');
                const label = document.createElement('strong');
                label.textContent = option.label;
                const hint = document.createElement('small');
                hint.textContent = option.phone || option.method === 'inapp'
                    ? (option.method === 'inapp' ? 'Chat privately on BidhaaLink' : option.method === 'sms' ? 'Open a text message' : 'Open a WhatsApp chat')
                    : 'This business has not added a phone number';
                copy.append(label, hint);
            button.append(icon, copy);
                button.disabled = option.method !== 'inapp' && !option.phone;
                button.addEventListener('click', async () => {
                    const productUrl = new URL(`/product-detail.html?id=${id}&business=${encodeURIComponent(businessSlug)}`, window.location.origin).href;
                    const externalMessage = `${message}\nView this product: ${productUrl}`;
                    if (option.method === 'whatsapp') {
                        closeInlineContactMenu(panel);
                        window.location.assign(`https://wa.me/${option.phone}?text=${encodeURIComponent(externalMessage)}`);
                    } else if (option.method === 'sms') {
                        const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
                        closeInlineContactMenu(panel);
                        window.location.assign(`sms:+${option.phone}${separator}body=${encodeURIComponent(externalMessage)}`);
                    } else {
                        button.disabled = true;
                        hint.textContent = 'Sending your product inquiry…';
                        try {
                            await sendInAppProductInquiry({ businessSlug, productId: id });
                        } catch (error) {
                            button.disabled = false;
                            hint.textContent = error.message || 'Could not start this conversation.';
                        }
                    }
                });
                options.appendChild(button);
            });
            panel.appendChild(options);
            mountInlineContactOptions(panel, trigger);
        } catch (error) {
            const menuWasOpen = loadingMenu.isConnected;
            loadingMenu.remove();
            trigger?.setAttribute('aria-expanded', 'false');
            if (!menuWasOpen) return;
            if (typeof window.showToast === 'function') window.showToast(error.message || 'Could not open product contact options.', 'error');
            else console.error('Open product inquiry failed:', error);
        }
    }

    async function openServiceInquiry(serviceId, businessSlug, mediaItem = null, trigger = document.activeElement) {
        const id = Number(serviceId);
        const slug = String(businessSlug || '').trim();
        if (!Number.isSafeInteger(id) || id <= 0 || !slug) return;
        if (toggleContactOptions(trigger)) return;
        const loadingMenu = showContactOptionsLoading(trigger);
        try {
            let businessContact = businessContactCache.get(slug);
            if (!businessContact) {
                const [servicesResponse, businessResponse] = await Promise.all([
                    fetch(`/api/businesses/${encodeURIComponent(slug)}/services`, { credentials: 'same-origin' }),
                    fetch(`/api/businesses/${encodeURIComponent(slug)}`, { credentials: 'same-origin' })
                ]);
                const [servicesData, businessData] = await Promise.all([
                    servicesResponse.json().catch(() => ({})),
                    businessResponse.json().catch(() => ({}))
                ]);
                if (!servicesResponse.ok || !businessResponse.ok) throw new Error('Could not load this service’s contact options.');
                businessContact = { services: servicesData.services || [], business: businessData.business || businessData };
                businessContactCache.set(slug, businessContact);
            }
            const service = businessContact.services.find(entry => Number(entry.id) === id);
            const business = businessContact.business;
            if (!service) throw new Error('This service is no longer available.');
            if (!loadingMenu.isConnected) return;

            const unitLabels = { per_service: 'per job', per_item: 'per item', per_hour: 'per hour', per_day: 'per day' };
            const servicePrice = service.pricing_mode === 'negotiable'
                ? 'You said you are free to negotiate'
                : `${formatPrice(service.price)} ${unitLabels[service.price_unit] || 'per job'}`;
            const businessUrl = new URL(`/business/${encodeURIComponent(slug)}`, window.location.origin);
            businessUrl.searchParams.set('serviceId', String(id));
            if (mediaItem?.url && ['image', 'video'].includes(mediaItem.kind)) {
                businessUrl.searchParams.set('serviceMedia', mediaItem.url);
                businessUrl.searchParams.set('serviceMediaKind', mediaItem.kind);
            }
            const message = `Can we have a talk about this service please?\nService: ${service.name || 'Service'}\nPrice -> ${servicePrice}`;
            const externalMessage = `${message}\nView this service: ${businessUrl.href}`;

            const panel = document.createElement('div');
            panel.className = 'product-inquiry-panel';
            const heading = document.createElement('div');
            heading.className = 'product-inquiry-header';
            const titleWrap = document.createElement('div');
            const title = document.createElement('h2');
            title.textContent = "Let's talk";
            const serviceTitle = document.createElement('p');
            serviceTitle.textContent = `${service.name || 'Service'} · ${servicePrice}`;
            titleWrap.append(title, serviceTitle);
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'product-inquiry-close';
            close.setAttribute('aria-label', 'Close contact options');
            close.textContent = '×';
            close.addEventListener('click', () => {
                trigger?.setAttribute('aria-expanded', 'false');
                closeInlineContactMenu(panel);
            });
            heading.append(titleWrap, close);
            panel.append(heading);

            const preview = document.createElement('p');
            preview.className = 'product-inquiry-preview';
            preview.textContent = `${message}\nService link: ${businessUrl.href}`;
            panel.append(preview);
            if (mediaItem?.url && ['image', 'video'].includes(mediaItem.kind)) {
                const attachment = document.createElement('a');
                attachment.className = 'product-inquiry-service-attachment';
                attachment.href = businessUrl.href;
                attachment.textContent = `Open the selected service ${mediaItem.kind}`;
                panel.append(attachment);
            }

            const whatsapp = normalisePhone(business.whatsapp || business.phone);
            const sms = normalisePhone(business.phone);
            const options = document.createElement('div');
            options.className = 'product-inquiry-choices';
            [
                { method: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', phone: whatsapp },
                { method: 'sms', label: 'SMS', icon: 'fas fa-comment-sms', phone: sms },
                { method: 'inapp', label: 'In-app conversation', icon: 'fas fa-comments', phone: '' }
            ].forEach(option => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'product-inquiry-option business-service-contact-option';
                button.disabled = option.method !== 'inapp' && !option.phone;
                const icon = document.createElement('i');
                icon.className = option.icon;
                icon.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span');
                const label = document.createElement('strong');
                label.textContent = option.label;
                const hint = document.createElement('small');
                hint.textContent = button.disabled ? 'This business has not added a phone number'
                    : option.method === 'inapp' ? 'Chat privately on BidhaaLink'
                        : option.method === 'sms' ? 'Open a text message' : 'Open a WhatsApp chat';
                copy.append(label, hint);
                button.append(icon, copy);
                button.addEventListener('click', async () => {
                    if (option.method === 'whatsapp') {
                        closeInlineContactMenu(panel);
                        window.location.assign(`https://wa.me/${option.phone}?text=${encodeURIComponent(externalMessage)}`);
                    } else if (option.method === 'sms') {
                        const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
                        closeInlineContactMenu(panel);
                        window.location.assign(`sms:+${option.phone}${separator}body=${encodeURIComponent(externalMessage)}`);
                    } else {
                        button.disabled = true;
                        hint.textContent = 'Starting your conversation…';
                        const pending = {
                            businessSlug: slug,
                            serviceId: id,
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
                                localStorage.removeItem(PENDING_KEY);
                                localStorage.setItem('postLoginServiceConversation', JSON.stringify(pending));
                                closeInlineContactMenu(panel);
                                openAuth();
                                return;
                            }
                            if (!response.ok || !data.conversationId) throw new Error(data.error || 'Could not start this conversation.');
                            localStorage.removeItem('postLoginServiceConversation');
                            closeInlineContactMenu(panel);
                            window.location.assign(`/account.html?section=messages&serviceConversation=${encodeURIComponent(data.conversationId)}`);
                        } catch (error) {
                            button.disabled = false;
                            hint.textContent = error.message || 'Could not start this conversation.';
                        }
                    }
                });
                options.append(button);
            });
            panel.append(options);
            mountInlineContactOptions(panel, trigger);
        } catch (error) {
            const menuWasOpen = loadingMenu.isConnected;
            loadingMenu.remove();
            trigger?.setAttribute('aria-expanded', 'false');
            if (!menuWasOpen) return;
            if (typeof window.showToast === 'function') window.showToast(error.message || 'Could not open service contact options.', 'error');
            else console.error('Open service inquiry failed:', error);
        }
    }

    async function resumePendingProductInquiry() {
        let pending;
        try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) { localStorage.removeItem(PENDING_KEY); return; }
        if (!pending?.businessSlug || !pending?.productId) return;
        if (window.businessSlug && window.businessSlug !== pending.businessSlug) return;
        try {
            await sendInAppProductInquiry(pending);
        } catch (error) {
            console.error('Resume product inquiry failed:', error);
            if (typeof window.showToast === 'function') window.showToast(error.message || 'Could not send your product inquiry.', 'error');
        }
    }

    window.openProductInquiry = openProductInquiry;
    window.openServiceInquiry = openServiceInquiry;
    window.resumePendingProductInquiry = resumePendingProductInquiry;
})();
