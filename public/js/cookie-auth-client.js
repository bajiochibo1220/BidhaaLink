(() => {
    const nativeFetch = window.fetch.bind(window);
    async function getCsrfToken() {
        const cookieToken = document.cookie.split('; ')
            .find(cookie => cookie.startsWith('csrfToken='));
        if (cookieToken) return decodeURIComponent(cookieToken.slice('csrfToken='.length));

        const response = await nativeFetch('/api/csrf-token', { credentials: 'same-origin' });
        const data = await response.json();
        return data.csrfToken;
    }

    window.fetch = async (input, init = {}) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
        const isApiMutation = url.origin === window.location.origin && url.pathname.startsWith('/api/') &&
            !['GET', 'HEAD', 'OPTIONS'].includes(method);
        const requestInit = { ...init, credentials: init.credentials || 'same-origin' };

        if (!isApiMutation) return nativeFetch(input, requestInit);

        const headers = new Headers(requestInit.headers || (typeof input !== 'string' ? input.headers : undefined));
        headers.set('X-CSRF-Token', await getCsrfToken());
        return nativeFetch(input, { ...requestInit, headers });
    };
})();
