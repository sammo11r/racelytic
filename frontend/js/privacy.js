(function initialisePrivacyModule() {
const ANALYTICS_CONSENT_KEY = 'racelytic-analytics-consent';
const ANALYTICS_VISITOR_KEY = 'racelytic-visitor-id';
const ANALYTICS_CONSENT_LIFETIME = 13 * 30.44 * 24 * 60 * 60 * 1000;
let stopAnalytics = null;

function analyticsChoice() {
    try {
        const stored = JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY) || 'null');
        if (!stored?.choice || Date.now() - Number(stored.decidedAt) >= ANALYTICS_CONSENT_LIFETIME) {
            localStorage.removeItem(ANALYTICS_CONSENT_KEY);
            localStorage.removeItem(ANALYTICS_VISITOR_KEY);
            return null;
        }
        return stored.choice;
    } catch {
        try {
            localStorage.removeItem(ANALYTICS_CONSENT_KEY);
            localStorage.removeItem(ANALYTICS_VISITOR_KEY);
        } catch {}
        return null;
    }
}

function setAnalyticsChoice(choice) {
    try {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, decidedAt: Date.now() }));
        if (choice !== 'allowed') localStorage.removeItem(ANALYTICS_VISITOR_KEY);
    } catch {}
    if (choice === 'allowed') {
        if (!stopAnalytics) stopAnalytics = window.RacelyticAnalytics.start();
    } else if (stopAnalytics) {
        stopAnalytics();
        stopAnalytics = null;
    }
    document.querySelector('.privacy-banner')?.remove();
}

function showAnalyticsChoice(settings = false) {
    document.querySelector('.privacy-banner')?.remove();
    const banner = document.createElement('aside');
    banner.className = 'privacy-banner';
    banner.setAttribute('aria-label', 'Analytics privacy choice');
    banner.innerHTML = `
        <div class="privacy-banner-copy">
            <strong>${settings ? 'Analytics privacy settings' : 'Your privacy choice'}</strong>
            <p>Racelytic uses optional first-party analytics to count visits, pages viewed and active time. If allowed, Racelytic stores a random visitor ID in your browser for up to 13 months. No advertising trackers are used. <a href="/privacy#choices">Privacy Notice</a></p>
        </div>
        <div class="privacy-banner-actions">
            <button type="button" class="button secondary" data-analytics-choice="declined">Decline</button>
            <button type="button" class="button primary" data-analytics-choice="allowed">Allow analytics</button>
        </div>`;
    banner.querySelectorAll('[data-analytics-choice]').forEach(button => button.addEventListener('click', () => setAnalyticsChoice(button.dataset.analyticsChoice)));
    document.body.appendChild(banner);
}


    window.RacelyticPrivacy = Object.freeze({ analyticsChoice, setAnalyticsChoice, showAnalyticsChoice });

async function loadFooter() {
    const footer = document.querySelector('.footer');
    if (!footer) return;
    try {
        const response = await fetch('/components/footer.html');
        if (!response.ok) throw new Error('Failed to load footer');
        footer.innerHTML = (await response.text()).replace('{{year}}', String(new Date().getFullYear()));
        const requestedSeries = new URLSearchParams(window.location.search).get('series');
        const activeSeries = document.body.classList.contains('academy-mode') ? 'academy'
            : document.body.classList.contains('f3-mode') ? 'f3'
            : document.body.classList.contains('f2-mode') ? 'f2'
            : ['f1', 'f2', 'f3', 'academy'].includes(requestedSeries) ? requestedSeries : 'f1';
        const isF2Mode = activeSeries === 'f2';
        const isF3Mode = activeSeries === 'f3';
        const isAcademyMode = activeSeries === 'academy';
        const summary = footer.querySelector('[data-footer-summary]');
        const trademark = footer.querySelector('[data-footer-trademark]');
        const source = footer.querySelector('[data-footer-source]');
        const seriesBase = activeSeries === 'f1' ? '' : `/${activeSeries}`;
        const footerRoutes = {
            database: `${seriesBase}/database`,
            analysis: `${seriesBase}/analysis`,
            simulator: activeSeries === 'f1' ? '/simulator-overview' : `${seriesBase}/simulator`,
            games: `${seriesBase}/games`,
            about: `/about?series=${activeSeries}`,
            method: `/about?series=${activeSeries}#about-method`,
            account: `/account?series=${activeSeries}`
        };
        footer.querySelectorAll('[data-footer-page]').forEach(link => { link.href = footerRoutes[link.dataset.footerPage]; });
        if (summary) summary.textContent = 'Independent motorsport history, statistics, and championship analysis.';
        if (isF2Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f2';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 2 Championship, the FIA, the Formula 1 companies, any team, or any driver. Formula 2, F2 and related marks belong to their respective owners.';
            if (source) source.innerHTML = 'Formula 2 statistics are compiled from published classifications and project-maintained corrections. See <a href="/data-sources#formula-2">Data sources &amp; licences</a> for provenance and important reuse information. Data may contain errors and is not an official record.';
        }
        if (isF3Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f3';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 3 Championship, the FIA, the Formula 1 companies, any team, or any driver. Formula 3, F3 and related marks belong to their respective owners.';
            if (source) source.innerHTML = 'Formula 3 statistics are compiled from published classifications and project-maintained corrections. See <a href="/data-sources#formula-3">Data sources &amp; licences</a> for provenance and important reuse information. Data may contain errors and is not an official record.';
        }
        if (isAcademyMode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/academy';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by F1 Academy, the Formula 1 companies, the FIA, any team, or any driver. F1 ACADEMY, F1, FORMULA 1 and related marks are trade marks of Formula One Licensing B.V.';
            if (source) source.innerHTML = 'F1 Academy statistics are compiled from published calendars and classifications, then normalised by Racelytic. See <a href="/data-sources#f1-academy">Data sources &amp; licences</a> for provenance and important reuse information. Data may contain errors and is not an official record.';
        }
        footer.querySelector('[data-privacy-settings]')?.addEventListener('click', () => window.RacelyticPrivacy.showAnalyticsChoice(true));
    } catch (error) {
        console.error('Footer error:', error);
    }
}

loadFooter();


const storedAnalyticsChoice = analyticsChoice();
if (storedAnalyticsChoice === 'allowed') stopAnalytics = window.RacelyticAnalytics.start();
else if (!storedAnalyticsChoice && !window.location.pathname.startsWith('/monitor')) showAnalyticsChoice();
})();
