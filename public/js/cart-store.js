// Shared client-side cart store.  Several pages use these helpers, so keep
// them independent from any one page's UI script.
(function () {
    function getCart() {
        try {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            return Array.isArray(cart) ? cart : [];
        } catch (error) {
            console.warn('Invalid saved cart; starting with an empty cart.', error);
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem('cart', JSON.stringify(Array.isArray(cart) ? cart : []));
        window.dispatchEvent(new CustomEvent('cart:changed'));
    }

    function clearCart() {
        localStorage.removeItem('cart');
        window.dispatchEvent(new CustomEvent('cart:changed'));
    }

    async function addProductToCart(productId, quantity = 1, options = {}) {
        const id = Number(productId);
        const qty = Math.max(1, Math.min(99, Number.parseInt(quantity, 10) || 1));
        const variantId = options.variantId == null ? null : Number(options.variantId);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A valid product is required.');
        if (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) throw new Error('The selected product option is invalid.');

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20000);
        let response;
        try {
            response = await fetch('/api/cart/add', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: id, variant_id: variantId, quantity: qty }),
                signal: controller.signal
            });
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('Adding to cart took too long. Please try again.');
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
            if (typeof options.onAuthRequired === 'function') {
                options.onAuthRequired({ productId: id, variantId, quantity: qty });
            } else if (options.promptAuth !== false) {
                const returnUrl = new URL('/product-detail.html', window.location.origin);
                returnUrl.searchParams.set('id', String(id));
                returnUrl.searchParams.set('cartAdd', '1');
                returnUrl.searchParams.set('cartProductId', String(id));
                returnUrl.searchParams.set('cartQty', String(qty));
                if (variantId) returnUrl.searchParams.set('cartVariantId', String(variantId));
                localStorage.setItem('postLoginReturnToProduct', returnUrl.pathname + returnUrl.search);
                if (typeof window.openAuthModal === 'function') window.openAuthModal('login');
                else window.location.assign('/marketplace?auth=login');
            }
            return { authRequired: true };
        }
        if (!response.ok || !data.success || !data.item) {
            throw new Error(data.error || 'Could not add this product to your cart.');
        }

        const cart = getCart();
        const existing = cart.find(item => Number(item.id) === Number(data.item.id) &&
            (Number(item.variant_id) || null) === (Number(data.item.variant_id) || null));
        if (existing) Object.assign(existing, data.item);
        else cart.push(data.item);
        saveCart(cart);
        if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
        return { item: data.item, cart: getCart() };
    }

    async function addToCart(productId, quantity = 1, options = {}) {
        try {
            const result = await addProductToCart(productId, quantity, options);
            if (result?.item && typeof window.showToast === 'function') window.showToast('Added to cart.', 'success');
            return result;
        } catch (error) {
            console.error('Add to cart failed:', error);
            if (typeof window.showToast === 'function') window.showToast(error.message || 'Unable to add this product to cart.', 'error');
            throw error;
        }
    }

    window.getCart = getCart;
    window.saveCart = saveCart;
    window.clearCart = clearCart;
    window.addToCart = addToCart;
    window.addProductToCart = addProductToCart;
})();
