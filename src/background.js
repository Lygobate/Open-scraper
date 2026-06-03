(() => {
    "use strict";

    const chromeInstance = chrome;

    // Keys used to store data in the extension
    const STORAGE_KEYS = {
        TABLES: "tableConfigurations"
    };

    /**
     * Asynchronous helper to read from the extension's local storage.
     * @param {string[]} keys - List of keys to retrieve.
     * @returns {Promise<Object>} Promise containing the associated values.
     */
    const getLocalStorage = async (keys) => chromeInstance.storage.local.get(keys);

    /**
     * Filters table configurations applicable to a specific URL based on its scope (path).
     * @param {Array} configs - List of saved table configurations.
     * @param {string} url - URL of the current web page.
     * @returns {Array} Filtered list of applicable configurations.
     */
    function filterConfigsByScope(configs, url) {
        if (!configs?.length) return configs ?? [];

        return configs.filter(config => {
            if (!config.scope) return true;
            
            return isUrlMatchingScope(config.scope, url);
        });
    }

    /**
     * Checks if the URL matches the path patterns defined in the scope.
     * @param {Object} scope - Scope object defining a pathPatterns array.
     * @param {string} url - Full URL to test.
     * @returns {boolean} True if the URL matches the scope.
     */
    function isUrlMatchingScope(scope, url) {
        if (!scope || !url) return true;
        const pathPatterns = scope.pathPatterns ?? [];
        if (!pathPatterns.length) return true;
        
        let pathname;
        try {
            pathname = new URL(url).pathname;
        } catch {
            pathname = url;
        }
        
        return pathPatterns.some(pattern => {
            try {
                return new RegExp(pattern).test(pathname);
            } catch {
                return false;
            }
        });
    }

    /**
     * Configures the badge colors of the extension icon for a given tab.
     * @param {number} tabId - ID of the target tab.
     */
    async function setupBadgeColors(tabId) {
        await chromeInstance.action.setBadgeBackgroundColor({
            tabId: tabId,
            color: "#000000"
        });
        if (chromeInstance.action.setBadgeTextColor) {
            await chromeInstance.action.setBadgeTextColor({
                tabId: tabId,
                color: "#FFFFFF"
            });
        }
    }

    /**
     * Retrieves the active tab and updates its badge.
     */
    async function updateActiveTabBadge() {
        try {
            const [activeTab] = await chromeInstance.tabs.query({
                active: true
            });
            if (!activeTab?.id) return;
            await updateBadgeForTab(activeTab.id);
        } catch (error) {
            console.error("Error updating the active tab badge:", error);
        }
    }

    /**
     * Calculates the number of applicable configurations for the site in the tab and updates the icon.
     * @param {number} tabId - ID of the tab concerned.
     * @param {Object} [cachedConfigs] - Optional pre-loaded configurations to avoid a storage call.
     */
    async function updateBadgeForTab(tabId, cachedConfigs) {
        const tab = await chromeInstance.tabs.get(tabId).catch(() => null);
        if (!tab?.id) return;

        // Extracting domain name
        const hostname = (() => {
            const url = tab.url;
            if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return null;
            try {
                return new URL(url).hostname.replace(/^www\./, "");
            } catch {
                return null;
            }
        })();

        // If the URL is not scraping-compatible (e.g. chrome://), clear the badge
        if (!hostname) {
            await chromeInstance.action.setBadgeText({
                tabId: tab.id,
                text: ""
            });
            await setupBadgeColors(tab.id);
            return;
        }

        // Retrieving saved configurations from local storage
        const configs = cachedConfigs ?? (await getLocalStorage([STORAGE_KEYS.TABLES]))[STORAGE_KEYS.TABLES];
        if (!configs) {
            await chromeInstance.action.setBadgeText({
                tabId: tab.id,
                text: ""
            });
            await setupBadgeColors(tab.id);
            return;
        }

        // Calculating the number of saved table configurations for this domain
        const domainConfig = configs[hostname]?.configs ?? [];
        const matchingConfigsCount = filterConfigsByScope(domainConfig, tab.url).length;

        // Updating badge text and color
        await setupBadgeColors(tab.id);
        await chromeInstance.action.setBadgeText({
            tabId: tab.id,
            text: matchingConfigsCount > 0 ? String(matchingConfigsCount) : ""
        });
    }

    /**
     * Opens the main Open Scraper interface in a standalone popup window for the specified tab.
     * @param {Object} tab - Chrome tab object.
     */
    function openPopupForTab(tab) {
        const searchParams = new URLSearchParams({
            tabid: String(tab.id ?? ""),
            url: tab.url ?? ""
        });
        chromeInstance.windows.create({
            url: chromeInstance.runtime.getURL("src/popup.html?" + searchParams.toString()),
            type: "popup",
            width: 720,
            height: 690
        });
    }

    // --- Extension Event Listeners ---

    // Open scraping tool on extension icon click
    chromeInstance.action.onClicked.addListener(openPopupForTab);

    // Update badge on tab activation/change
    chromeInstance.tabs.onActivated.addListener(() => updateActiveTabBadge());

    // Update badge when web page changes or finishes loading
    chromeInstance.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url || changeInfo.status === "complete") {
            updateBadgeForTab(tabId);
        }
    });

    // Initialize badge for the current tab on worker startup
    updateActiveTabBadge();
})();