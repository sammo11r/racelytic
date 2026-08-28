(function loadFrontendChrome() {
    const scripts = ['/js/series-config.js', '/js/ui-components.js', '/js/global-search.js', '/js/navigation.js', '/js/analytics.js', '/js/privacy.js'];
    scripts.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    })), Promise.resolve()).catch(error => console.error('Frontend chrome error:', error));
})();
