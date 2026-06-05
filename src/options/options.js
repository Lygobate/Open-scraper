(() => {
    "use strict";

    const chromeInstance = chrome;

    /**
     * Applies internationalization (i18n) translations to all elements
     * that have a `data-i18n` attribute, replacing their text content
     * with the corresponding localized message from the Chrome i18n API.
     */
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const messageKey = element.getAttribute("data-i18n");
        if (messageKey) {
            const localizedText = chromeInstance.i18n.getMessage(messageKey);
            if (localizedText) {
                element.textContent = localizedText;
            }
        }
    });
})();