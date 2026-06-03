(() => {
    "use strict";

    const chromeInstance = chrome;

    // Clés utilisées pour stocker les données dans l'extension
    const STORAGE_KEYS = {
        TABLES: "tableConfigurations"
    };

    /**
     * Helper asynchrone pour lire dans le stockage local de l'extension.
     * @param {string[]} keys - Liste des clés à récupérer.
     * @returns {Promise<Object>} Promesse contenant les valeurs associées.
     */
    const getLocalStorage = async (keys) => chromeInstance.storage.local.get(keys);

    /**
     * Filtre les configurations de table applicables à une URL spécifique en fonction de son scope (chemin d'accès).
     * @param {Array} configs - Liste des configurations de table enregistrées.
     * @param {string} url - URL de la page web actuelle.
     * @returns {Array} Liste filtrée des configurations applicables.
     */
    function filterConfigsByScope(configs, url) {
        if (!configs?.length) return configs ?? [];

        return configs.filter(config => {
            if (!config.scope) return true;
            
            return isUrlMatchingScope(config.scope, url);
        });
    }

    /**
     * Vérifie si l'URL correspond aux motifs de chemin définis dans le scope.
     * @param {Object} scope - Objet définissant le scope avec un tableau pathPatterns.
     * @param {string} url - URL complète à tester.
     * @returns {boolean} True si l'URL correspond au scope.
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
     * Configure les couleurs du badge de l'icône de l'extension pour un onglet donné.
     * @param {number} tabId - ID de l'onglet cible.
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
     * Récupère l'onglet actif et met à jour son badge.
     */
    async function updateActiveTabBadge() {
        try {
            const [activeTab] = await chromeInstance.tabs.query({
                active: true
            });
            if (!activeTab?.id) return;
            await updateBadgeForTab(activeTab.id);
        } catch (error) {
            console.error("Erreur lors de la mise à jour du badge de l'onglet actif:", error);
        }
    }

    /**
     * Calcule le nombre de configurations applicables au site dans l'onglet et met à jour l'icône.
     * @param {number} tabId - ID de l'onglet concerné.
     * @param {Object} [cachedConfigs] - Configurations optionnelles pré-chargées pour éviter un appel de stockage.
     */
    async function updateBadgeForTab(tabId, cachedConfigs) {
        const tab = await chromeInstance.tabs.get(tabId).catch(() => null);
        if (!tab?.id) return;

        // Extraction du nom de domaine
        const hostname = (() => {
            const url = tab.url;
            if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return null;
            try {
                return new URL(url).hostname.replace(/^www\./, "");
            } catch {
                return null;
            }
        })();

        // Si l'URL n'est pas scraping-compatible (ex: chrome://), vider le badge
        if (!hostname) {
            await chromeInstance.action.setBadgeText({
                tabId: tab.id,
                text: ""
            });
            await setupBadgeColors(tab.id);
            return;
        }

        // Récupération des configurations enregistrées dans le stockage local
        const configs = cachedConfigs ?? (await getLocalStorage([STORAGE_KEYS.TABLES]))[STORAGE_KEYS.TABLES];
        if (!configs) {
            await chromeInstance.action.setBadgeText({
                tabId: tab.id,
                text: ""
            });
            await setupBadgeColors(tab.id);
            return;
        }

        // Calcul du nombre de configurations de tables sauvegardées pour ce domaine
        const domainConfig = configs[hostname]?.configs ?? [];
        const matchingConfigsCount = filterConfigsByScope(domainConfig, tab.url).length;

        // Mise à jour du texte et de la couleur du badge
        await setupBadgeColors(tab.id);
        await chromeInstance.action.setBadgeText({
            tabId: tab.id,
            text: matchingConfigsCount > 0 ? String(matchingConfigsCount) : ""
        });
    }

    /**
     * Ouvre l'interface principale d'Open Scraper dans une fenêtre popup autonome pour l'onglet spécifié.
     * @param {Object} tab - Objet tab de Chrome.
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

    // --- Écouteurs d'Événements de l'Extension ---

    // Ouvrir l'outil de scraping au clic sur l'icône de l'extension
    chromeInstance.action.onClicked.addListener(openPopupForTab);

    // Mettre à jour le badge lors de l'activation/changement d'onglet
    chromeInstance.tabs.onActivated.addListener(() => updateActiveTabBadge());

    // Mettre à jour le badge quand la page web change ou finit de charger
    chromeInstance.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url || changeInfo.status === "complete") {
            updateBadgeForTab(tabId);
        }
    });

    // Initialiser le badge pour l'onglet courant au démarrage du worker
    updateActiveTabBadge();
})();