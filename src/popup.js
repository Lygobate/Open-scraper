(() => {
    "use strict";

    const chromeInstance = chrome;

    // Clés utilisées pour stocker les configurations locales de table
    const STORAGE_KEYS = {
        TABLES: "tableConfigurations"
    };

    /**
     * Helper asynchrone pour lire dans le stockage local de l'extension.
     * @param {string[]} keys - Liste des clés à récupérer.
     * @returns {Promise<Object>} Promesse contenant les valeurs lues.
     */
    const getLocalStorage = async (keys) => chromeInstance.storage.local.get(keys);

    /**
     * Filtre les configurations de table applicables à une URL selon le scope configuré (chemin d'accès).
     * @param {Array} configs - Configurations à filtrer.
     * @param {string} url - URL de la page web actuelle.
     * @returns {Array} Liste filtrée des configurations applicables.
     */
    function filterConfigsByScope(configs, url) {
        if (!configs?.length) return configs ?? [];

        return configs.filter(config => {
            if (!config.scope) return true;

            return (() => {
                const scope = config.scope;
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
            })();
        });
    }

    /**
     * Met à jour le menu déroulant des configurations enregistrées pour le site dans le popup.
     * @param {Array} configs - Configurations de table applicables.
     * @param {number} [selectedConfigIndex] - Index de la configuration sélectionnée par défaut.
     */
    function updateConfigDropdown(configs, selectedConfigIndex) {
        const $savedConfigSection = $("#savedConfigSection");
        const $savedConfigSelect = $("#savedConfigSelect");

        $savedConfigSection.css("display", "flex");
        $("#applyConfig").show();

        const applyConfigBtn = document.getElementById("applyConfig");
        if (applyConfigBtn) {
            applyConfigBtn.textContent = chromeInstance.i18n.getMessage("popupApply");
            applyConfigBtn.style.display = "inline-block";
        }

        $savedConfigSelect.empty();

        if (configs && configs.length !== 0) {
            $savedConfigSelect.append(
                $("<option>")
                    .attr("value", "")
                    .text(chromeInstance.i18n.getMessage("popupSavedConfigPlaceholder"))
                    .prop("disabled", true)
                    .prop("selected", true)
            );
            configs.forEach((config, index) => {
                $savedConfigSelect.append($("<option>").attr("value", index).text(config.name));
            });
            $savedConfigSelect.prop("disabled", false);

            if (selectedConfigIndex != null && configs[selectedConfigIndex]) {
                $savedConfigSelect.val(String(selectedConfigIndex));
                if (applyConfigBtn) applyConfigBtn.disabled = false;
            } else {
                if (applyConfigBtn) applyConfigBtn.disabled = true;
            }
            $savedConfigSection.removeClass("saved-config-empty");
        } else {
            $savedConfigSelect.append(
                $("<option>")
                    .attr("value", "")
                    .text(chromeInstance.i18n.getMessage("popupSavedConfigEmpty"))
                    .prop("disabled", true)
                    .prop("selected", true)
            );
            $savedConfigSelect.prop("disabled", true);
            if (applyConfigBtn) applyConfigBtn.disabled = true;
            $savedConfigSection.addClass("saved-config-empty");
        }
    }

    /**
     * Récupère la liste des configurations sauvegardées pour le domaine de l'onglet actif.
     * @returns {Promise<Array>} Liste des configurations valides pour la page courante.
     */
    async function getConfigsForCurrentTab() {
        const tab = await chromeInstance.tabs.get(currentTab.id).catch(() => null);
        const url = tab?.url || currentTab.url;

        const hostname = (() => {
            if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return null;
            try {
                return new URL(url).hostname.replace(/^www\./, "");
            } catch {
                return null;
            }
        })();

        if (!hostname) return [];

        const domainConfigs = await (async (host) => {
            const { [STORAGE_KEYS.TABLES]: storedTables } = await getLocalStorage([STORAGE_KEYS.TABLES]);
            const configObj = storedTables && typeof storedTables === "object" ? storedTables : {};
            return configObj[host]?.configs ?? [];
        })(hostname);

        return filterConfigsByScope(domainConfigs, url);
    }

    /**
     * Charge les configurations applicables pour l'onglet courant.
     * @returns {Promise<Array>} Liste des configurations applicables.
     */
    async function loadConfigs() {
        return getConfigsForCurrentTab();
    }

    /**
     * Applique la configuration sélectionnée dans le menu déroulant à la page en cours d'extraction.
     */
    function applySelectedConfig() {
        const $savedConfigSelect = $("#savedConfigSelect");
        const configIndex = parseInt($savedConfigSelect.val(), 10);

        if (!isNaN(configIndex)) {
            getConfigsForCurrentTab().then(configs => {
                const config = configs[configIndex];
                if (config) {
                    chromeInstance.tabs.sendMessage(
                        currentTab.id,
                        {
                            action: "applyConfig",
                            config: config
                        },
                        function(response) {
                            if (response?.error) {
                                showStatusMessage(response.error, "noResponseErr", false);
                            } else if (response) {
                                onTableDataReceived(response, true, configIndex);
                            }
                        }
                    );
                }
            });
        }
    }

    /**
     * Convertit une valeur de date JS en numéro de série de date Excel.
     * @param {string} dateStr - Date sous forme de texte.
     * @param {boolean} is1904 - Utiliser le système de date Excel 1904.
     * @returns {number} Numéro sérialisé représentant la date dans Excel.
     */
    function dateToExcelSerial(dateStr, is1904) {
        let serialDate = Date.parse(dateStr);
        if (is1904) {
            serialDate += 1462;
        }
        return (serialDate - new Date(Date.UTC(1899, 11, 30))) / 864e5;
    }

    /**
     * Génère un fichier binaire XLSX à partir de la structure de table d'Open Scraper.
     * @param {Object} extractedData - Données extraites avec les en-têtes (fields) et les lignes (data).
     * @param {string} sheetName - Nom de la feuille de calcul Excel.
     * @returns {string} Fichier XLSX binaire encodé sous forme de chaîne de caractères.
     */
    function generateXlsxBinary(extractedData, sheetName) {
        extractedData.data.unshift(extractedData.fields);
        
        const workbook = new function WBook() {
            if (!(this instanceof WBook)) return new WBook();
            this.SheetNames = [];
            this.Sheets = {};
        }();

        const sheetData = ((data) => {
            const cells = {};
            const range = {
                s: { c: 1e7, r: 1e7 },
                e: { c: 0, r: 0 }
            };

            for (let rowIdx = 0; rowIdx !== data.length; ++rowIdx) {
                for (let colIdx = 0; colIdx !== data[rowIdx].length; ++colIdx) {
                    if (range.s.r > rowIdx) range.s.r = rowIdx;
                    if (range.s.c > colIdx) range.s.c = colIdx;
                    if (range.e.r < rowIdx) range.e.r = rowIdx;
                    if (range.e.c < colIdx) range.e.c = colIdx;

                    const cellVal = { v: data[rowIdx][colIdx] };
                    if (cellVal.v !== null) {
                        const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx });
                        
                        if (typeof cellVal.v === "number") {
                            cellVal.t = "n";
                        } else if (typeof cellVal.v === "boolean") {
                            cellVal.t = "b";
                        } else if (cellVal.v instanceof Date) {
                            cellVal.t = "n";
                            cellVal.z = XLSX.SSF._table[14];
                            cellVal.v = dateToExcelSerial(cellVal.v);
                        } else {
                            cellVal.t = "s";
                        }
                        cells[cellRef] = cellVal;
                    }
                }
            }

            if (range.s.c < 1e7) {
                cells["!ref"] = XLSX.utils.encode_range(range);
            }
            return cells;
        })(extractedData.data);

        workbook.SheetNames.push(sheetName);
        workbook.Sheets[sheetName] = sheetData;

        return XLSX.write(workbook, {
            type: "binary"
        });
    }

    /**
     * Exécute de manière sécurisée une fonction en capturant les exceptions.
     * @param {Function} fn - Fonction à exécuter.
     */
    function safeExecute(fn) {
        try {
            fn();
        } catch (error) {
            console.error("Erreur capturée lors d'une exécution sécurisée:", error);
        }
    }

    // --- Variables d'État Globales ---

    // Données d'onglet actif extraites de l'URL du popup
    const currentTab = {
        id: parseInt(getQueryParam("tabid")),
        url: getQueryParam("url")
    };

    // État actuel du scraping et de la configuration active
    const scrapingState = {};
    const PREVIEW_LIMIT = 1000;
    const robotsTxtRules = null;

    /**
     * Analyse l'URL de recherche GET du popup pour extraire la valeur d'un paramètre.
     * @param {string} paramName - Nom du paramètre.
     * @returns {string} Valeur décodée du paramètre.
     */
    function getQueryParam(paramName) {
        const paramsArray = window.location.search.substring(1).split("&");
        for (let i = 0; i < paramsArray.length; i++) {
            const pair = paramsArray[i].split("=");
            if (decodeURIComponent(pair[0]) === paramName) {
                return decodeURIComponent(pair[1]);
            }
        }
    }

    /**
     * Met à jour le texte d'un conteneur d'informations de statut dans le popup.
     * @param {string} message - Message d'information ou d'erreur.
     * @param {string} elementId - ID DOM du conteneur.
     * @param {boolean} [isStopAction=false] - Indique s'il faut arrêter le scraping.
     */
    function showStatusMessage(message, elementId, isStopAction) {
        if (message === "") {
            return $("#" + elementId).hide();
        }
        $("#" + elementId).show().text(message);
        if (isStopAction) {
            stopScraping();
        }
    }

    /**
     * Analyse les données d'objets brutes pour générer une structure tabulaire propre
     * en choisissant les chemins d'accès aux propriétés de colonnes les plus optimaux.
     * @param {Array<Object>} rawData - Lignes d'objets brutes lues dans la page cible.
     * @returns {Object} Objet contenant la liste finale des colonnes (fields) et la matrice de données (data).
     */
    function findOptimalDataFields(rawData) {
        const rowCount = rawData.length;
        const selectorLengthsCache = {
            "": Infinity
        };
        const fieldCounts = {};
        const detectedFields = {};
        const fieldNamePaths = {};
        const fieldMatchRates = {};

        function getSelectorLength(selector) {
            if (!(selector in selectorLengthsCache)) {
                selectorLengthsCache[selector] = $(
                    "." + selector.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&")
                ).length;
            }
            return selectorLengthsCache[selector];
        }

        // Compter l'occurrence de chaque champ dans les objets bruts
        rawData.forEach(function(row) {
            for (const key in row) {
                if (!(key in fieldCounts)) fieldCounts[key] = 0;
                fieldCounts[key]++;
            }
        });

        // Déterminer les en-têtes nettoyés et uniques
        Object.keys(fieldCounts)
            .map(function(key) {
                return [fieldCounts[key], key];
            })
            .forEach(function([count, key]) {
                let cleanHeader = "";
                let optimalLen = Infinity;

                key.split(" ")[0].split("/").slice(1).reverse().forEach(function(part) {
                    part.split(".").slice(1).forEach(function(subPart) {
                        const len = getSelectorLength(subPart);
                        if (!(optimalLen < 2 * rowCount || len >= optimalLen)) {
                            cleanHeader = subPart;
                            optimalLen = len;
                        }
                    });
                });

                const suffix = key.split(" ")[1];
                if (suffix && isNaN(suffix)) {
                    cleanHeader += " " + suffix;
                }

                let subIndex = 0;
                const rowPresentMap = rawData.map(row => key in row);

                if (cleanHeader in detectedFields) {
                    detectedFields[cleanHeader].forEach(function(existingMap, idx) {
                        if (!subIndex) {
                            let isDisjoint = true;
                            existingMap.forEach(function(val, innerIdx) {
                                isDisjoint &= !(rowPresentMap[innerIdx] && val);
                            });
                            if (isDisjoint) {
                                subIndex = idx + 1;
                            }
                        }
                    });

                    if (subIndex) {
                        detectedFields[cleanHeader][subIndex - 1] = detectedFields[cleanHeader][subIndex - 1].map(
                            function(val, idx) {
                                return rowPresentMap[idx] || val;
                            }
                        );
                    } else {
                        detectedFields[cleanHeader].push(rowPresentMap);
                        subIndex = detectedFields[cleanHeader].length;
                    }

                    if (subIndex > 1) {
                        cleanHeader += " " + subIndex;
                    }
                } else {
                    detectedFields[cleanHeader] = [rowPresentMap];
                }

                if (!(cleanHeader in fieldNamePaths)) {
                    fieldNamePaths[cleanHeader] = [];
                }
                fieldNamePaths[cleanHeader].push(key);

                if (!(cleanHeader in fieldMatchRates)) {
                    fieldMatchRates[cleanHeader] = 0;
                }
                fieldMatchRates[cleanHeader] += count;
            });

        const seenValuesCache = {};
        const optimalFields = Object.keys(fieldNamePaths).filter(function(field) {
            const valuesArray = [];
            const isIgnored = field in scrapingState.config.deletedFields;
            if (isIgnored) return false;

            const duplicateValuesMap = {};
            rawData.forEach(function(row) {
                let cellVal;
                for (let i = 0; i < fieldNamePaths[field].length; i++) {
                    const keyPath = fieldNamePaths[field][i];
                    if (keyPath in row) {
                        cellVal = row[keyPath];
                        break;
                    }
                }
                if (cellVal !== undefined) {
                    if (!(cellVal in duplicateValuesMap)) duplicateValuesMap[cellVal] = 0;
                    duplicateValuesMap[cellVal]++;
                }
                valuesArray.push(cellVal);
            });

            // Éliminer les colonnes qui ont une valeur constante unique pour toute la table
            const distinctValues = Object.keys(duplicateValuesMap);
            if (distinctValues.length && duplicateValuesMap[distinctValues[0]] === rowCount) {
                return false;
            }

            // Éliminer les colonnes redondantes (qui contiennent exactement le même motif de valeurs)
            const cacheKey = JSON.stringify(valuesArray);
            if (cacheKey in seenValuesCache) {
                return false;
            }
            seenValuesCache[cacheKey] = 1;

            // Éliminer les colonnes vides ou à très faible taux de remplissage (< 20%)
            if (fieldMatchRates[field] < 0.2 * rowCount) {
                return false;
            }

            return true;
        });

        const tabularResult = {
            fields: optimalFields,
            data: rawData.map(function(row) {
                return optimalFields.map(function(field) {
                    for (let i = 0; i < fieldNamePaths[field].length; i++) {
                        const keyPath = fieldNamePaths[field][i];
                        if (keyPath in row) return row[keyPath];
                    }
                    return "";
                });
            })
        };

        scrapingState.names = optimalFields;
        scrapingState.namePaths = fieldNamePaths;

        return tabularResult;
    }

    /**
     * Renomme les champs d'en-tête selon les modifications personnalisées de l'utilisateur.
     * @param {string[]} fields - Noms originaux des champs.
     * @returns {string[]} Liste des noms après renommage.
     */
    function applyHeaderRenames(fields) {
        return fields.map(function(field) {
            return field in scrapingState.config.headers ? scrapingState.config.headers[field] : field;
        });
    }

    /**
     * Structure les données brutes sous forme tabulaire propre prête à l'export.
     * @param {Array<Object>} rawData - Lignes brutes extraites.
     * @returns {Object} Données formatées avec les en-têtes remappés.
     */
    function prepareDataForExport(rawData) {
        const optimalData = findOptimalDataFields(rawData);
        optimalData.fields = applyHeaderRenames(optimalData.fields);
        return optimalData;
    }

    /**
     * Convertit une chaîne de caractères binaire brute en un buffer ArrayBuffer de bytes.
     * @param {string} binaryStr - Chaîne binaire.
     * @returns {ArrayBuffer} Le buffer de données.
     */
    function stringToArrayBuffer(binaryStr) {
        const buffer = new ArrayBuffer(binaryStr.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i !== binaryStr.length; ++i) {
            view[i] = 255 & binaryStr.charCodeAt(i);
        }
        return buffer;
    }

    /**
     * Analyse les configurations d'en-têtes et crée des règles de sélecteurs pour les colonnes de la table active.
     */
    function analyzeAndSaveTableSelector() {
        (() => {
            const parseSelectors = str => str.split(",").map(item => item.slice(-100));
            const createSelectorObj = array => {
                const selectors = {};
                for (let i = 0; i < 4; i++) {
                    selectors[`selector${i}`] = array[i] !== undefined ? array[i] : "";
                }
                return selectors;
            };

            const headersCount = Object.keys(scrapingState.config.headers).length;
            if (headersCount) {
                (async (includeDeleted = false) => {
                    const cleanTableSelector = scrapingState.tableSelector.replace(".tablescraper-selected-table", "");
                    const classRules = scrapingState.goodClasses.map(cls => cls.split(" ").map(item => "." + item).join(""));
                    const rulesArray = [];

                    classRules.forEach(rule => {
                        const cleanRule = rule.replace(/.tablescraper-selected-row/g, "");
                        if (cleanRule.length) {
                            rulesArray.push(cleanTableSelector + " " + cleanRule + ":not(:empty)");
                        }
                    });

                    if (!rulesArray.length) {
                        rulesArray.push(cleanTableSelector + " > *:not(:empty)");
                    }

                    const joinedRules = rulesArray.join(",");
                    const fieldSelectors = [];
                    let targetFields = scrapingState.names;

                    if (includeDeleted) {
                        targetFields = targetFields.concat(Object.keys(scrapingState.config.deletedFields));
                    }

                    for (const field of targetFields) {
                        const path = scrapingState.namePaths[field];
                        const selectorRule = { target: "text", field_id: field, param: "" };
                        if (scrapingState.config.headers[field]) {
                            selectorRule.field_id = scrapingState.config.headers[field];
                        }

                        const generatedSelectors = [];
                        for (const subPath of path) {
                            let matchedSelector = "";
                            try {
                                console.log("Recherche de sélecteur...");
                                matchedSelector = await requestSelectorFromTab(joinedRules, subPath);
                            } catch (err) {
                                console.error(err);
                            }
                            console.log("Sélecteur trouvé : ", matchedSelector);
                            generatedSelectors.push(matchedSelector);

                            const splitSubPath = subPath.split(" ");
                            if (splitSubPath.filter(word => word === "href").length) {
                                selectorRule.target = "prop";
                                selectorRule.param = "href";
                            }
                            if (splitSubPath.filter(word => word === "src").length) {
                                selectorRule.target = "prop";
                                selectorRule.param = "src";
                            }
                        }
                        selectorRule.selector = generatedSelectors.join(",");
                        fieldSelectors.push(selectorRule);
                    }
                    return [joinedRules, fieldSelectors];
                })(true).then(result => {
                    const [tableRules, selectors] = result;
                    const findSelectorByField = fieldId => selectors.find(s => s.field_id === fieldId);
                    const baseMetadata = {
                        tableId: scrapingState.tableId,
                        hostName: scrapingState.hostName,
                        startingUrl: scrapingState.startingUrl
                    };

                    for (const originalName in scrapingState.config.headers) {
                        const selectorInfo = findSelectorByField(scrapingState.config.headers[originalName]);
                        if (selectorInfo) {
                            const parsed = parseSelectors(selectorInfo.selector);
                            Object.assign(createSelectorObj(parsed), baseMetadata, {
                                originalName: originalName,
                                newName: scrapingState.config.headers[originalName]
                            });
                        }
                    }
                });
            }
        })();
    }

    /**
     * Rendu de la grille de données interactive en utilisant la bibliothèque Handsontable.
     */
    function renderHandsontable() {
        const previewData = findOptimalDataFields(scrapingState.data);
        previewData.data = previewData.data.slice(0, PREVIEW_LIMIT);
        scrapingState.previewLength = previewData.data.length;

        const scrollTop = $(".wtHolder").scrollTop();
        const scrollLeft = $(".wtHolder").scrollLeft();
        let hasRendered = false;

        $("#hot").empty();

        const footerEl = document.querySelector(".popup-footer");
        const footerHeight = footerEl ? footerEl.getBoundingClientRect().height : 52;

        new Handsontable($("#hot").get(0), {
            data: previewData.data,
            colHeaders: applyHeaderRenames(previewData.fields),
            wordWrap: false,
            manualColumnResize: true,
            width: $(window).width() - 20,
            height: $(window).height() - $("#hot").get(0).getBoundingClientRect().y - footerHeight,
            afterRender: function() {
                if (!hasRendered) {
                    hasRendered = true;
                    $(".wtHolder").scrollTop(scrollTop);
                    $(".wtHolder").scrollLeft(scrollLeft);
                }
            },
            modifyColWidth: function(width, colIdx) {
                if (width > 200) return 200;
            },
            afterGetColHeader: function(colIdx, headerCell) {
                if (colIdx !== -1) {
                    if ($(headerCell).children().length > 1) {
                        $(".hot-header", headerCell).remove();
                    } else {
                        $(headerCell).click(function() {
                            const self = this;
                            setTimeout(function() {
                                $(".header-input", self).trigger("focus");
                            }, 20);
                        });
                    }

                    const $headerContainer = $("<div>", { class: "hot-header" });
                    const $headerInput = $("<div>", {
                        class: "header-input",
                        contenteditable: "true"
                    });

                    if (scrapingState.config.headers[previewData.fields[colIdx]]) {
                        $headerInput.text(scrapingState.config.headers[previewData.fields[colIdx]]);
                    } else {
                        $headerInput.text(headerCell.firstChild.textContent);
                    }

                    $headerContainer.append($headerInput);

                    // Bouton de suppression de colonne
                    $headerContainer.append(
                        $("<span>", {
                            class: "glyphicon glyphicon-remove remove-column",
                            style: "padding-top: 2.5px"
                        }).click(function() {
                            scrapingState.config.deletedFields[previewData.fields[colIdx]] = true;
                            saveCurrentConfig();
                            $("#resetColumns").show();
                            renderHandsontable();
                        })
                    );

                    $headerInput.get(0).addEventListener("input", function() {
                        scrapingState.config.headers[previewData.fields[colIdx]] = $headerInput.text();
                        saveCurrentConfig();
                    });

                    headerCell.firstChild.style.display = "none";
                    $(headerCell).append($headerContainer);
                }
            },
            beforeOnCellMouseDown: function(event, coords) {
                if (coords.row < 0) {
                    event.stopImmediatePropagation();
                }
            }
        });
    }

    /**
     * Sauvegarde la configuration active de la table courante dans le stockage local de l'extension.
     */
    function saveCurrentConfig() {
        localStorage.setItem(scrapingState.configName, JSON.stringify(scrapingState.config));
    }

    /**
     * Affiche un message d'erreur si l'extraction n'est pas supportée sur ce site.
     */
    function handleUnsupportedSite() {
        $("#waitHeader").hide();
        showStatusMessage(
            "Open Scraper doesn't support data extraction from this site yet. Our administrators are notified and will try to add support in the future. Thanks for trying us out!",
            "noResponseErr",
            false
        );
    }

    /**
     * Récupère le sélecteur du bouton "Suivant" pré-enregistré pour cet hôte.
     * @returns {string|null} Le sélecteur du bouton suivant ou null.
     */
    function getNextPageSelectorFromStorage() {
        return localStorage.getItem("nextSelector:" + scrapingState.hostName);
    }

    /**
     * Callback déclenché à la réception de la structure d'analyse initiale de la table.
     * @param {Object} tableData - Données et sélecteurs de table transmis par l'onglet cible.
     * @param {boolean} [isInitial=false] - Indique si c'est le chargement initial.
     * @param {number} [configIndex] - Index de configuration de table pré-enregistrée à appliquer d'emblée.
     */
    function onTableDataReceived(tableData, isInitial, configIndex) {
        if (!tableData) {
            if (currentTab.reloaded) {
                return handleUnsupportedSite();
            } else {
                currentTab.reloaded = true;
                return chromeInstance.tabs.reload(currentTab.id, {}, function() {
                    chromeInstance.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
                        if (changeInfo.status === "complete" && updatedTabId === currentTab.id) {
                            chromeInstance.tabs.onUpdated.removeListener(listener);
                            triggerFindTables();
                        }
                    });
                });
            }
        }

        scrapingState.tableId = tableData.tableId;
        scrapingState.scraping = false;
        scrapingState.failedToProcess = false;
        scrapingState.processingError = null;
        scrapingState.tableSelector = tableData.tableSelector;
        scrapingState.startingUrl = tableData.href;
        scrapingState.hostName = tableData.hostname;
        scrapingState.pages = 0;

        if (tableData.nextSelector) {
            localStorage.setItem("nextSelector:" + tableData.hostname, tableData.nextSelector);
        }

        scrapingState.previewLength = 0;
        scrapingState.configName = tableData.hostname + "-config";
        scrapingState.config = JSON.parse(localStorage.getItem(scrapingState.configName)) || {
            headers: {},
            deletedFields: {},
            crawlDelay: 1000,
            maxWait: 20000
        };

        if (tableData.paginationType === "scroll") {
            scrapingState.config.infinateScrollChecked = true;
            saveCurrentConfig();
        } else if (tableData.paginationType === "nextButton") {
            scrapingState.config.infinateScrollChecked = false;
            saveCurrentConfig();
        }

        if (Object.keys(scrapingState.config.deletedFields).length) {
            $("#resetColumns").show();
        }

        // Calcul du nom de fichier d'export par défaut
        const domainKey = (() => {
            const url = currentTab.url;
            const hostnameParts = new URL(url).hostname.split(".");
            return hostnameParts[0].indexOf("www") > -1 ? hostnameParts[1] : hostnameParts[0];
        })();

        $("#wrongTable").show();

        if (scrapingState.config.infinateScrollChecked) {
            $("#nextButton").hide();
            $("#startScraping").show();
            $("#infinateScroll").prop("checked", true);
        }

        chromeInstance.tabs.sendMessage(
            currentTab.id,
            { action: "getTableData" },
            function(response) {
                if (response && response.error) {
                    showStatusMessage("Something went wrong!", "noResponseErr", true);
                } else if (response.tableId == scrapingState.tableId) {
                    if (response.failedToProcess) {
                        showStatusMessage("Failed to process rows on server. Showing raw data instead.", "error", false);
                        scrapingState.failedToProcess = true;
                        scrapingState.processingError = response.processingError;
                    } else {
                        $("#error").hide();
                        scrapingState.failedToProcess = false;
                    }

                    if (scrapingState.pages || scrapingState.config.infinateScrollChecked) {
                        // Rien
                    } else {
                        $("#nextButton").show();
                    }

                    if (!scrapingState.pages) {
                        scrapingState.nextSelector = getNextPageSelectorFromStorage();
                        if (scrapingState.nextSelector) {
                            chromeInstance.tabs.sendMessage(
                                currentTab.id,
                                {
                                    action: "markNextButton",
                                    selector: scrapingState.nextSelector
                                },
                                function(markResponse) {
                                    if (!markResponse.error) {
                                        $("#startScraping").show();
                                    }
                                }
                            );
                        }
                    }

                    $("#wait").hide();
                    $("#content").show();
                    showStatusMessage('Download data or locate "Next" to crawl multiple pages', "instructions");

                    scrapingState.data = response.data;
                    scrapingState.pages = 1;
                    scrapingState.lastRows = response.data.length;
                    scrapingState.tableSelector = response.tableSelector;
                    scrapingState.goodClasses = response.goodClasses;
                    scrapingState.workingTime = 0;

                    updateUiStats();
                    $(".download-button").show();

                    loadConfigs().then(configs => {
                        updateConfigDropdown(configs, configIndex);
                        renderHandsontable();
                    });

                    // Configuration des boutons de téléchargement / copie de données
                    $("#csv")
                        .off("click")
                        .click(function() {
                            console.log("Téléchargement CSV...");
                            safeExecute(analyzeAndSaveTableSelector);

                            const prepared = prepareDataForExport(scrapingState.data);
                            prepared.data.forEach((row, rowIdx) => {
                                row.forEach((cell, colIdx) => {
                                    if (Array.isArray(cell)) {
                                        prepared.data[rowIdx][colIdx] = Papa.unparse([cell], {
                                            quotes: true,
                                            escapeChar: '"'
                                        });
                                    }
                                });
                            });

                            saveAs(
                                new Blob(
                                    [
                                        Papa.unparse(prepared, {
                                            quotes: true,
                                            escapeChar: '"'
                                        })
                                    ],
                                    { type: "application/octet-stream" }
                                ),
                                domainKey + ".csv"
                            );
                        });

                    $("#xlsx")
                        .off("click")
                        .click(function() {
                            safeExecute(analyzeAndSaveTableSelector);
                            saveAs(
                                new Blob(
                                    [
                                        stringToArrayBuffer(
                                            generateXlsxBinary(
                                                prepareDataForExport(scrapingState.data),
                                                currentTab.url.substring(0, 100)
                                            )
                                        )
                                    ],
                                    { type: "application/octet-stream" }
                                ),
                                domainKey + ".xlsx"
                            );
                        });

                    $("#copy")
                        .off("click")
                        .click(function() {
                            safeExecute(analyzeAndSaveTableSelector);
                            const tsvString = Papa.unparse(prepareDataForExport(scrapingState.data), {
                                delimiter: "\t"
                            });
                            const copyListener = function(e) {
                                e.preventDefault();
                                if (e.clipboardData) {
                                    e.clipboardData.setData("text/plain", tsvString);
                                } else if (window.clipboardData) {
                                    window.clipboardData.setData("Text", tsvString);
                                }
                            };
                            window.addEventListener("copy", copyListener);
                            document.execCommand("copy");
                            window.removeEventListener("copy", copyListener);
                        });
                }
            }
        );
    }

    /**
     * Déclenche la recherche des tables dans la page active en envoyant un message au script de contenu.
     */
    function triggerFindTables() {
        chromeInstance.tabs.sendMessage(
            currentTab.id,
            {
                action: "findTables",
                robots: robotsTxtRules
            },
            function(response) {
                onTableDataReceived(response, true);
            }
        );
    }

    /**
     * Vérifie si le mode "Infinite scroll" est coché.
     * @returns {boolean} True si le défilement infini est actif.
     */
    function isInfiniteScrollChecked() {
        return $("#infinateScroll").is(":checked");
    }

    /**
     * Arrête le scraping en cours.
     */
    function stopScraping() {
        scrapingState.scraping = false;
        console.log("Scraping arrêté.");
        $("#startScraping").show();
        $("#stopScraping").hide();
        showStatusMessage("Crawling stopped. Please download data or continue crawling.", "instructions");
    }

    /**
     * Met à jour les valeurs d'information de scraping affichées dans le conteneur #stats.
     */
    function updateUiStats() {
        $("#stats")
            .empty()
            .append($("<div>", { text: "Pages scraped: " + scrapingState.pages }))
            .append($("<div>", { text: "Rows collected: " + scrapingState.data.length }))
            .append($("<div>", { text: "Rows from last page: " + scrapingState.lastRows }))
            .append($("<div>", { text: "Working time: " + parseInt(scrapingState.workingTime / 1000) + "s" }));
    }

    /**
     * Demande à l'onglet actif de calculer un sélecteur de colonne optimal.
     * @param {string} rowSelector - Sélecteur de la ligne de données.
     * @param {string} path - Chemin de la cellule à analyser.
     * @returns {Promise<string>} Promesse résolue avec le sélecteur CSS.
     */
    async function requestSelectorFromTab(rowSelector, path) {
        const response = await chromeInstance.tabs.sendMessage(currentTab.id, {
            action: "chooseSelector",
            rowSelector: rowSelector,
            path: path
        });
        if (!response) throw new Error("Impossible de choisir le sélecteur !");
        return response.selector;
    }

    // --- Routine d'Initialisation Principale de l'Interface ---
    !async function initializePopup() {
        $("#stopScraping").click(stopScraping);

        // Liaison de la gestion des délais de crawl
        $("#crawlDelay").bind("propertychange change click keyup input paste", function() {
            const value = $(this).val();
            if (isNaN(value) || value < 0 || parseInt(1000 * value) >= scrapingState.config.maxWait) {
                return showStatusMessage("Bad min waiting value", "inputError");
            }
            showStatusMessage("", "inputError");
            scrapingState.config.crawlDelay = parseInt(1000 * value);
            saveCurrentConfig();
        });

        $("#maxWait").bind("propertychange change click keyup input paste", function() {
            const value = $(this).val();
            if (isNaN(value) || parseInt(1000 * value) <= scrapingState.config.crawlDelay) {
                return showStatusMessage("Bad max waiting value", "inputError");
            }
            showStatusMessage("", "inputError");
            scrapingState.config.maxWait = parseInt(1000 * value);
            saveCurrentConfig();
        });

        $("#resetColumns").click(function() {
            scrapingState.config.deletedFields = {};
            saveCurrentConfig();
            $("#resetColumns").hide();
            renderHandsontable();
        });

        $("#infinateScroll").click(function() {
            if (scrapingState.config.infinateScrollChecked) {
                scrapingState.config.infinateScrollChecked = false;
                $("#nextButton").show();
                if (getNextPageSelectorFromStorage()) {
                    $("#startScraping").show();
                } else {
                    $("#startScraping").hide();
                }
            } else {
                scrapingState.config.infinateScrollChecked = true;
                $("#nextButton").hide();
                $("#startScraping").show();
            }
            saveCurrentConfig();
        });

        // Écouteur des changements locaux dans le stockage (synchronisation)
        chromeInstance.storage.local.onChanged.addListener(changes => {
            if (changes[STORAGE_KEYS.TABLES]) {
                loadConfigs().then(configs => updateConfigDropdown(configs));
            }
        });

        // Écouteur des mises à jour d'URL dans l'onglet d'origine
        chromeInstance.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (tabId === currentTab.id && changeInfo.url) {
                currentTab.url = changeInfo.url;
                loadConfigs().then(configs => updateConfigDropdown(configs));
            }
        });

        loadConfigs().then(configs => updateConfigDropdown(configs));

        $("#applyConfig").on("click", applySelectedConfig);

        $("#savedConfigSelect").on("change", function() {
            const applyConfigBtn = document.getElementById("applyConfig");
            if (applyConfigBtn) {
                applyConfigBtn.disabled = this.value === "";
            }
        });

        // Timeout de sécurité si la page cible met trop de temps à répondre
        setTimeout(function() {
            console.log("Pas de réponse reçue");
            if ($("#waitHeader").is(":visible")) {
                handleUnsupportedSite();
            }
        }, 50000);

        $(window).resize(function() {
            renderHandsontable();
        });

        // Lancer la première recherche de tables
        triggerFindTables();
    }();

    $("#wrongTable").click(function() {
        $("#hot").empty();
        chromeInstance.tabs.sendMessage(
            currentTab.id,
            { action: "nextTable" },
            onTableDataReceived
        );
    });

    $("#nextButton").click(function() {
        showStatusMessage('Mark "Next" button or link', "instructions");
        scrapingState.gettingNext = true;

        // Fonction récursive de scrutation du statut du bouton "Suivant"
        !function pollNextButtonStatus() {
            chromeInstance.tabs.sendMessage(
                currentTab.id,
                { action: "getNextButton" },
                function(response) {
                    if (!scrapingState.scraping) {
                        if (scrapingState.gettingNext) {
                            pollNextButtonStatus();
                        }
                        if (response.selector) {
                            $("#startScraping").show();
                            showStatusMessage(
                                '"Next" button located. Press "Start crawling" to get more pages or mark another button/link if marked incorrectly.',
                                "instructions"
                            );
                            scrapingState.nextSelector = response.selector;
                            localStorage.setItem("nextSelector:" + scrapingState.hostName, response.selector);
                        }
                    }
                }
            );
        }();
    });

    $("#startScraping").click(function() {
        scrapingState.gettingNext = false;
        scrapingState.scraping = true;
        $("#startScraping").hide();
        $("#stopScraping").show();
        showStatusMessage("", "error");
        showStatusMessage('Please wait for more pages or press "Stop crawling".', "instructions");

        if (isInfiniteScrollChecked()) {
            $("#infinateScrollElement").hide();
        }

        let startTime = new Date();

        // Lancement de la routine de crawl récursif
        !function crawlNextPage() {
            const scrollDownPage = function(callback) {
                chromeInstance.tabs.sendMessage(
                    currentTab.id,
                    {
                        action: "scrollDown",
                        selector: scrapingState.tableSelector
                    },
                    function(response) {
                        if (response && response.error) {
                            showStatusMessage("", "instructions");
                            return showStatusMessage(response.error, response.errorId || "error", true);
                        }
                        $("#wrongTable").hide();
                        callback();
                    }
                );
            };

            let clickNextPageButton = function(callback) {
                chromeInstance.tabs.sendMessage(
                    currentTab.id,
                    {
                        action: "clickNext",
                        selector: scrapingState.nextSelector
                    },
                    function(response) {
                        if (response && response.error) {
                            showStatusMessage("", "instructions");
                            return showStatusMessage(response.error, response.errorId, true);
                        }
                        $("#wrongTable").hide();
                        callback();
                    }
                );
            };

            if (isInfiniteScrollChecked()) {
                clickNextPageButton = scrollDownPage;
            }

            // Routine d'écoute et d'attente de chargement de la nouvelle page via requêtes réseau actives
            (function waitForPageToLoad(actionTrigger, onLoadComplete, tabId, maxWaitTime, pollInterval, crawlDelay, checkTabAlive) {
                const activeRequests = {};
                let lastRequestTime = null;
                let isLoaded = false;
                let isTimeoutReached = false;
                const filterRules = {
                    urls: ["<all_urls>"],
                    tabId: tabId,
                    types: ["main_frame", "sub_frame", "stylesheet", "script", "font", "object", "xmlhttprequest", "other"]
                };

                function checkCompletion() {
                    if (!isLoaded && isTimeoutReached) {
                        checkTabAlive(function(isAlive) {
                            if (!isAlive) return triggerErrorCallback();
                            if (!isLoaded) {
                                isLoaded = true;
                                chromeInstance.webRequest.onBeforeRequest.removeListener(onBeforeRequestHandler);
                                chromeInstance.webRequest.onCompleted.removeListener(onCompletedHandler);
                                chromeInstance.webRequest.onErrorOccurred.removeListener(onCompletedHandler);
                                onLoadComplete();
                            }
                        });
                    }
                }

                function onBeforeRequestHandler(details) {
                    activeRequests[details.requestId] = 1;
                    lastRequestTime = new Date();
                }

                function onCompletedHandler(details) {
                    if (lastRequestTime) {
                        delete activeRequests[details.requestId];
                        if (!Object.keys(activeRequests).length) {
                            triggerErrorCallback();
                        }
                    }
                }

                function triggerErrorCallback() {
                    setTimeout(function() {
                        if (new Date() - lastRequestTime < pollInterval || Object.keys(activeRequests).length) {
                            // En attente
                        } else {
                            checkCompletion();
                        }
                    }, pollInterval);
                }

                chromeInstance.webRequest.onBeforeRequest.addListener(onBeforeRequestHandler, filterRules);
                chromeInstance.webRequest.onCompleted.addListener(onCompletedHandler, filterRules);
                chromeInstance.webRequest.onErrorOccurred.addListener(onCompletedHandler, filterRules);

                (actionTrigger || function(cb) { cb(); })(function() {
                    setTimeout(checkCompletion, maxWaitTime);
                    setTimeout(function() {
                        isTimeoutReached = true;
                        triggerErrorCallback();
                    }, crawlDelay);
                });
            })(
                clickNextPageButton,
                function() {
                    // Page chargée -> récupérer les nouvelles lignes de données de la table
                    chromeInstance.tabs.sendMessage(
                        currentTab.id,
                        {
                            action: "getTableData",
                            selector: scrapingState.tableSelector
                        },
                        function(response) {
                            if (response) {
                                if (response.error) {
                                    showStatusMessage("", "instructions");
                                    return showStatusMessage(response.error, response.errorId || "error", true);
                                }

                                if (response.failedToProcess) {
                                    showStatusMessage("Failed to process rows. Showing raw data instead.", "error", false);
                                    scrapingState.failedToProcess = true;
                                    scrapingState.processingError = response.processingError;
                                } else {
                                    $("#error").hide();
                                    scrapingState.failedToProcess = false;
                                }

                                scrapingState.lastRows = response.data.length;
                                scrapingState.pages++;
                                scrapingState.workingTime += new Date() - startTime;
                                startTime = new Date();

                                // Ajout des lignes uniques collectées
                                (function(newRows) {
                                    scrapingState.data = scrapingState.data.concat(newRows);
                                    const uniqueRowsSet = new Set();
                                    scrapingState.data.forEach(row => uniqueRowsSet.add(JSON.stringify(row)));
                                    scrapingState.data = Array.from(uniqueRowsSet, str => JSON.parse(str));
                                })(response.data);

                                updateUiStats();

                                if (scrapingState.previewLength < PREVIEW_LIMIT) {
                                    renderHandsontable();
                                } else {
                                    showStatusMessage("Preview limited to 1000 rows.", "previewLimit");
                                }

                                if (scrapingState.scraping) {
                                    crawlNextPage();
                                }
                            }
                        }
                    );
                },
                currentTab.id,
                scrapingState.config.maxWait,
                100,
                scrapingState.config.crawlDelay,
                function(callback) {
                    chromeInstance.tabs.sendMessage(currentTab.id, {}, function(response) {
                        callback(response !== undefined);
                    });
                }
            );
        }();
    });
})();