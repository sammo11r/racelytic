(function initialiseAnalyticsModule() {
function startAnonymousAnalytics() {
    if (navigator.doNotTrack === '1' || window.location.pathname.startsWith('/monitor')) return null;
    const uuid = () => crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        return (character === 'x' ? random : (random & 3) | 8).toString(16);
    });
    let visitorId;
    try {
        visitorId = localStorage.getItem(ANALYTICS_VISITOR_KEY) || uuid();
        localStorage.setItem(ANALYTICS_VISITOR_KEY, visitorId);
    } catch {
        visitorId = uuid();
    }
    const id = uuid();
    let running = true;
    let activeMilliseconds = 0;
    let activeSince = document.visibilityState === 'visible' ? performance.now() : null;
    const duration = () => Math.round((activeMilliseconds + (activeSince === null ? 0 : performance.now() - activeSince)) / 1000);
    const send = (url, data) => {
        const body = JSON.stringify(data);
        if (navigator.sendBeacon) return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    };
    let referrerHost = '';
    try {
        const referrer = document.referrer && new URL(document.referrer);
        if (referrer && referrer.host !== window.location.host) referrerHost = referrer.host;
    } catch {}
    send('/api/analytics/visit', { id, visitorId, path: location.pathname, referrerHost });
    const heartbeat = () => {
        if (running) send('/api/analytics/heartbeat', { id, duration: duration() });
    };
    const timer = window.setInterval(heartbeat, 15000);
    const handleVisibility = () => {
        if (document.visibilityState === 'hidden' && activeSince !== null) {
            activeMilliseconds += performance.now() - activeSince;
            activeSince = null;
            heartbeat();
        } else if (document.visibilityState === 'visible' && activeSince === null) {
            activeSince = performance.now();
        }
    };
    const handlePageHide = () => {
        window.clearInterval(timer);
        if (activeSince !== null) activeMilliseconds += performance.now() - activeSince;
        activeSince = null;
        heartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
        running = false;
        window.clearInterval(timer);
        activeSince = null;
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pagehide', handlePageHide);
    };
}


    window.RacelyticAnalytics = Object.freeze({ start: startAnonymousAnalytics });
})();
