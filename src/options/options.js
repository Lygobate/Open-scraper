(() => {
    "use strict";
    const t = chrome;

    document.querySelectorAll("[data-i18n]").forEach(e => {
        const n = e.getAttribute("data-i18n");
        if (n) {
            const a = t.i18n.getMessage(n);
            a && (e.textContent = a);
        }
    });
})();