(() => {
    const PENDING_KEY = 'postLoginProductConversation';

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
            window.location.assign('/?auth=login');
        }
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
            document.querySelectorAll('.product-inquiry-dialog').forEach(dialog => dialog.close?.());
            openAuth();
            return false;
        }
        if (!response.ok || !data.conversationId) throw new Error(data.error || 'Could not start this conversation.');
        localStorage.removeItem(PENDING_KEY);
        window.location.assign(`/account.html?section=messages&serviceConversation=${encodeURIComponent(data.conversationId)}`);
        return true;
    }

    async function openProductInquiry(productId) {
        const id = Number(productId);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        try {
            const response = await fetch(`/api/products/${id}/detail`, { credentials: 'same-origin' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'This product is not available.');
            const product = data.product || data;
            const businessSlug = product.business_slug || product.business?.slug || '';
            if (!businessSlug) throw new Error('This business is not available for contact.');

            const dialog = document.createElement('dialog');
            dialog.className = 'product-inquiry-dialog';
            dialog.setAttribute('aria-label', `Contact the business about ${product.name || 'this product'}`);
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
            close.addEventListener('click', () => dialog.close());
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
                button.className = 'product-inquiry-option';
                const icon = document.createElement('i');
                icon.className = option.icon;
                icon.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span');
                const label = document.createElement('strong');
                label.textContent = option.label;
                const hint = document.createElement('small');
                hint.textContent = option.phone || option.method === 'inapp'
                    ? (option.method === 'inapp' ? 'Chat privately on BidhaaLink' : 'Open a chat with the business')
                    : 'This business has not added a phone number';
                copy.append(label, hint);
                const arrow = document.createElement('i');
                arrow.className = 'fas fa-chevron-right';
                arrow.setAttribute('aria-hidden', 'true');
                button.append(icon, copy, arrow);
                button.disabled = option.method !== 'inapp' && !option.phone;
                button.addEventListener('click', async () => {
                    const productUrl = new URL(`/product-detail.html?id=${id}&business=${encodeURIComponent(businessSlug)}`, window.location.origin).href;
                    const externalMessage = `${message}\nView this product: ${productUrl}`;
                    if (option.method === 'whatsapp') {
                        window.location.assign(`https://wa.me/${option.phone}?text=${encodeURIComponent(externalMessage)}`);
                    } else if (option.method === 'sms') {
                        const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
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
            dialog.appendChild(panel);
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
            dialog.addEventListener('close', () => dialog.remove(), { once: true });
            document.body.appendChild(dialog);
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        } catch (error) {
            if (typeof window.showToast === 'function') window.showToast(error.message || 'Could not open product contact options.', 'error');
            else console.error('Open product inquiry failed:', error);
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
    window.resumePendingProductInquiry = resumePendingProductInquiry;
})();
