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
        const isF2Mode = window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/');
        const isF3Mode = window.location.pathname === '/f3' || window.location.pathname.startsWith('/f3/');
        const isAcademyMode = window.location.pathname === '/academy' || window.location.pathname.startsWith('/academy/');
        const summary = footer.querySelector('[data-footer-summary]');
        const trademark = footer.querySelector('[data-footer-trademark]');
        const source = footer.querySelector('[data-footer-source]');
        if (isF2Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f2';
            if (summary) summary.textContent = 'Independent Formula 2 history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 2 Championship, the FIA, the Formula 1 companies, or any team. FIA FORMULA 2 CHAMPIONSHIP, FIA FORMULA 2, FORMULA 2, F2 and related marks are trade marks of the Fédération Internationale de l’Automobile and are used by their authorised operators under licence.';
            if (source) source.innerHTML = 'Formula 2 statistics are compiled from <a href="https://www.motorsportstats.com/" target="_blank" rel="noopener noreferrer">Motorsport Stats</a> classifications and project-maintained corrections. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
        }
        if (isF3Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f3';
            if (summary) summary.textContent = 'Independent Formula 3 history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 3 Championship, the FIA, the Formula 1 companies, or any team. FIA FORMULA 3 CHAMPIONSHIP, FIA FORMULA 3, FORMULA 3, F3 and related marks are trade marks of the Fédération Internationale de l’Automobile and are used by their authorised operators under licence.';
            if (source) source.innerHTML = 'Formula 3 statistics are compiled from <a href="https://www.motorsportstats.com/" target="_blank" rel="noopener noreferrer">Motorsport Stats</a> classifications, official championship sources, and project-maintained corrections. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
        }
        if (isAcademyMode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/academy';
            if (summary) summary.textContent = 'Independent F1 Academy history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by F1 Academy, Formula One Management, the FIA, any team, or any driver. F1 ACADEMY, F1, FORMULA 1 and related marks belong to their respective owners.';
            if (source) source.innerHTML = 'F1 Academy calendars, classifications and standings are compiled from the <a href="https://www.f1academy.com/" target="_blank" rel="noopener noreferrer">official F1 Academy website</a> and project-maintained normalisation. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
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
