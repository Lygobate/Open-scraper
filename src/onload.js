(() => {
    /**
     * Escapes special CSS selector characters in a string and prepends an optional separator.
     * Used to build safe CSS class selectors from raw text.
     *
     * @param {string} rawText - The raw text to escape.
     * @param {string} [separator="."] - Prefix separator (e.g. "." for class, "#" for ID).
     * @returns {string} The escaped and prefixed CSS selector fragment.
     */
    function escapeCssSelectorPart(rawText, separator) {
        return (separator || ".") + rawText.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&").trim();
    }

    /**
     * Returns the list of non-empty CSS classes of a jQuery element.
     *
     * @param {jQuery} $element - The jQuery element.
     * @returns {string[]} Array of class names.
     */
    function getElementClasses($element) {
        return ($element.attr("class") || "").trim().split(/\s+/).filter(function(cls) {
            return cls.length > 0;
        });
    }

    /**
     * Analyzes the children of a DOM element to find those sharing a common set of CSS classes.
     * This is used to detect repeating row-like elements that form a table structure.
     *
     * @param {Element} containerElement - The parent DOM element to inspect.
     * @returns {{ children: jQuery, goodClasses: string[] }}
     *   An object containing:
     *   - `children`: jQuery collection of the best-matching child elements.
     *   - `goodClasses`: Array of the dominant class combinations found.
     */
    function findRepeatingChildren(containerElement) {
        var $children = $(containerElement).children();
        var classComboCounts = {};
        var individualClassCounts = {};

        $children.each(function() {
            if (!["script", "img", "meta", "style"].includes(this.nodeName.toLowerCase()) && $(this).text().trim().length) {
                var sortedClasses = getElementClasses($(this)).sort();
                var comboKey = sortedClasses.join(" ");
                comboKey in classComboCounts || (classComboCounts[comboKey] = 0);
                classComboCounts[comboKey]++;
                sortedClasses.forEach(function(cls) {
                    cls in individualClassCounts || (individualClassCounts[cls] = 0);
                    individualClassCounts[cls]++;
                });
            }
        });

        // Dominant class combinations: those present in at least half the children (with some tolerance)
        var dominantCombos = Object.keys(classComboCounts).filter(function(combo) {
            return classComboCounts[combo] >= $children.length / 2 - 2;
        });

        // Fallback: try individual classes if no combo qualifies
        if (!dominantCombos.length) {
            dominantCombos = Object.keys(individualClassCounts).filter(function(cls) {
                return individualClassCounts[cls] >= $children.length / 2 - 2;
            });
        }

        $($children.length);

        // If no dominant classes found, return all valid children (non-empty, non-script/img/etc.)
        if (!dominantCombos.length || (dominantCombos.length === 1 && dominantCombos[0] === "")) {
            return {
                children: $children.filter(function() {
                    return this.nodeName
                        ? !["script", "img", "meta", "style"].includes(this.nodeName.toLowerCase()) && !!$(this).text().trim().length
                        : (console.log("???", this), false);
                }),
                goodClasses: []
            };
        }

        // Filter children: keep only those matching at least one dominant class combo
        return {
            children: $children.filter(function() {
                var matches = false;
                var $this = $(this);
                dominantCombos.forEach(function(combo) {
                    matches |= hasAllClasses($this, combo);
                });
                return matches;
            }),
            goodClasses: dominantCombos
        };
    }

    /**
     * Checks whether a jQuery element has all classes listed in a space-separated string.
     *
     * @param {jQuery} $el - The jQuery element to check.
     * @param {string} classCombo - Space-separated list of class names.
     * @returns {boolean} True if the element has all the specified classes.
     */
    function hasAllClasses($el, classCombo) {
        var classes = classCombo.split(" ");
        for (var i = 0; i < classes.length; i++) {
            if (!$el.hasClass(classes[i])) return false;
        }
        return true;
    }

    // --- Global Scraping State ---

    /** @type {Array<Object>} List of candidate table elements detected on the page */
    var detectedTables = [];

    /** @type {number} Index of the currently selected table in detectedTables */
    var currentTableIndex = 0;

    /**
     * Scans all elements on the page to detect candidates for data tables.
     * A candidate must have a significant area and contain at least 3 repeating child rows.
     * The top 5 candidates (by score) are kept.
     *
     * @param {*} _robots - Unused (reserved for future robots.txt support).
     */
    function findTables(_robots) {
        _robots && _robots.length;
        var bodyArea = $("body").width() * $("body").height();

        $("body *").each(function() {
            var elementArea = this.offsetWidth * this.offsetHeight;
            if (isNaN(elementArea) || elementArea < 0.02 * bodyArea) return;

            var rowInfo = findRepeatingChildren(this);
            var $rows = rowInfo.children;
            var rowCount = $rows.length;
            if (isNaN(rowCount) || rowCount < 3) return;

            var score = elementArea * rowCount * rowCount;
            detectedTables.push({
                table: this,
                goodClasses: rowInfo.goodClasses,
                area: elementArea,
                children: $rows,
                text: $rows.text(),
                score: score,
                selector: buildCssSelectorForElement(this),
                type: "selector"
            });
        });

        detectedTables = detectedTables.sort((a, b) => b.score - a.score).slice(0, 5);
        console.log("findTables:", detectedTables);
    }

    /**
     * Highlights the currently selected table and its rows, and removes the highlight
     * from the previously selected one.
     */
    function highlightSelectedTable() {
        var prevIndex = (currentTableIndex + detectedTables.length - 1) % detectedTables.length;
        $(detectedTables[prevIndex].table).removeClass("tablescraper-selected-table");
        $(detectedTables[prevIndex].children).removeClass("tablescraper-selected-row");
        $(detectedTables[currentTableIndex].table).addClass("tablescraper-selected-table");
        $(detectedTables[currentTableIndex].children).addClass("tablescraper-selected-row");
    }

    /**
     * Removes all scraper-related CSS highlighting classes from all page elements.
     */
    function clearAllHighlights() {
        $("*").removeClass("tablescraper-selected-table");
        $("*").removeClass("tablescraper-selected-row");
    }

    // Event listener references (stored to allow removal)
    var onElementClick, onElementMouseEnter;

    new Set;

    /**
     * Computes the SHA-256 hash of a string.
     *
     * @param {string} text - The input string.
     * @returns {string} The hexadecimal SHA-256 hash.
     */
    function hashText(text) {
        var hasher = sha256.create();
        hasher.update(text);
        return hasher.hex();
    }

    /**
     * Finds the first jQuery-matchable element from a CSS selector string,
     * progressively truncating leading path segments if no match is found.
     *
     * @param {string} selector - A CSS selector, potentially composed of ">" segments.
     * @returns {jQuery|null} The matched jQuery element, or null if none found.
     */
    function findElementBySelector(selector) {
        for (; selector.length;) {
            if ($(selector).length) return $(selector);
            selector = selector.split(">").slice(1).join(">");
        }
        return null;
    }

    /**
     * Checks whether the current table content (as text) has already been visited,
     * to avoid re-scraping the same page during multi-page crawling.
     * Uses localStorage to persist visit history across requests.
     *
     * @param {string} rowsText - The concatenated text content of the table rows.
     * @returns {boolean} True if the content was already seen.
     */
    function isTableAlreadyVisited(rowsText) {
        if (localStorage.getItem("visited") === null) return false;
        const hash = hashText(rowsText);
        const visitedHashes = JSON.parse(localStorage.getItem("visited"));
        return visitedHashes[visitedHashes.length - 1] === hash || visitedHashes[visitedHashes.length - 2] === hash;
    }

    /**
     * Saves the hash of the current table content to localStorage
     * to mark it as visited for duplicate detection.
     *
     * @param {string} rowsText - The concatenated text content of the table rows.
     */
    function markTableAsVisited(rowsText) {
        if (localStorage.getItem("visited") === null) {
            localStorage.setItem("visited", JSON.stringify([]));
        }
        const visited = JSON.parse(localStorage.getItem("visited"));
        visited.push(hashText(rowsText));
        localStorage.setItem("visited", JSON.stringify(visited));
    }

    /**
     * Extracts structured data from the currently selected table,
     * or from a specific table selector if provided.
     *
     * When a `targetSelector` is given, the function first checks if the table data
     * has already been collected (duplicate detection), then recursively calls itself
     * without the selector to extract the final data.
     *
     * @param {Function} sendResponse - Chrome message response callback.
     * @param {string} [targetSelector] - Optional CSS selector to target a specific table.
     */
    async function extractTableData(sendResponse, targetSelector) {
        var $rows;
        if (targetSelector) {
            var $target = findElementBySelector(targetSelector);
            if (console.log("getTableData:", targetSelector, $target), !$target) {
                return sendResponse({ error: "Table not found" }), void console.log("Table not found");
            }
            detectedTables.length || (detectedTables = [{}]);
            var rowInfo = findRepeatingChildren($target);
            $rows = rowInfo.children;

            if (isTableAlreadyVisited($rows.text())) {
                return (
                    sendResponse({
                        error: "Table not changed. If the last page was not reached, try to increase crawl delay.",
                        errorId: "finished"
                    }),
                    void console.log("Table not changed")
                );
            }

            detectedTables[currentTableIndex].table = $target;
            detectedTables[currentTableIndex].children = $rows;
            detectedTables[currentTableIndex].goodClasses = rowInfo.goodClasses;
            detectedTables[currentTableIndex].text = $rows.text();
            markTableAsVisited($rows.text());
            highlightSelectedTable();
            return void extractTableData(sendResponse);
        }

        // Extract structured cell data from each row
        $rows = detectedTables[currentTableIndex].children;
        var extractedRows = [];

        $rows.each(function() {
            var cellData = {};
            var pathHistory = [];

            /**
             * Records a cell value under a given path key, handling duplicate path names
             * by appending a numeric suffix.
             *
             * @param {string} value - The cell value to record.
             * @param {string} pathKey - The base path key.
             * @param {string} [suffix] - Optional suffix (e.g. "href", "src").
             */
            function recordCellValue(value, pathKey, suffix) {
                if (value) {
                    var fullKey = pathKey + (suffix ? " " + suffix : "");
                    var displayKey = fullKey;
                    var occurrences = 0;
                    pathHistory.forEach(p => {
                        p == pathKey && occurrences++;
                    });
                    if (occurrences > 1) displayKey = fullKey + " " + occurrences;
                    cellData[displayKey] = value;
                }
            }

            /**
             * Recursively traverses a DOM node and its children,
             * extracting text, href, and src values into cellData.
             *
             * @param {jQuery} $node - Current jQuery element.
             * @param {string} parentPath - Accumulated path from the row root.
             * @param {Element} rawNode - The raw DOM node.
             */
            !function traverseAndExtractNode($node, parentPath, rawNode) {
                if (rawNode.nodeName) {
                    var nodePath = parentPath + "/" + rawNode.nodeName.toLowerCase() + getElementClasses($node).map(cls => "." + cls).join("");
                    pathHistory.push(nodePath);
                    recordCellValue(
                        $node.clone().children().remove().end().text().trim(),
                        nodePath
                    );
                    recordCellValue($node.prop("href"), nodePath, "href");
                    recordCellValue($node.prop("src"), nodePath, "src");
                    $node.children().each(function() {
                        traverseAndExtractNode($(this), nodePath, this);
                    });
                } else {
                    console.log("what???", rawNode);
                }
            }($(this), "", this);

            if (Object.keys(cellData).length) extractedRows.push(cellData);
        });

        sendResponse({
            data: extractedRows,
            tableId: currentTableIndex,
            tableSelector: detectedTables[currentTableIndex].selector,
            goodClasses: detectedTables[currentTableIndex].goodClasses
        });
    }

    /**
     * Builds a unique CSS selector string for a DOM element by traversing its ancestor chain.
     * Uses IDs (when numeric-free) or class names to identify each ancestor.
     * Triggers mouseleave and blur before inspecting, to avoid UI state pollution.
     *
     * @param {Element} element - The target DOM element.
     * @returns {string} A CSS selector string (e.g. "div#main>ul.list>li.item").
     */
    function buildCssSelectorForElement(element) {
        return $(element).trigger("mouseleave").trigger("blur")
            .parents().addBack().not("html").not("body").map(function() {
                var tag = this.tagName.toLowerCase();
                if (typeof this.id === "string" && this.id.trim() && !this.id.match(/\d+/g)) {
                    tag += escapeCssSelectorPart(this.id, "#");
                } else if (typeof this.className === "string" && this.className.trim()) {
                    tag += escapeCssSelectorPart(this.className).replace(/\s+/g, ".");
                }
                return tag;
            }).get().join(">");
    }

    /**
     * Activates interactive "Next button" picking mode.
     * Highlights elements on hover and captures the user's click
     * to record the selector of the chosen "Next page" button.
     *
     * @param {Function} sendResponse - Chrome message callback to return the chosen selector.
     */
    function activateNextButtonPickingMode(sendResponse) {
        window.focus();

        onElementMouseEnter = function(event) {
            $(this).is($(event.target)) && (
                $("*").removeClass("tablescraper-hover"),
                $(buildCssSelectorForElement(this)).last().addClass("tablescraper-hover")
            );
        };

        onElementClick = function(event) {
            event.preventDefault();
            (function captureClickedElement(clickEvent) {
                $("*").off("click", onElementClick).off("mouseenter", onElementMouseEnter);
                $(".tablescraper-hover").removeClass("tablescraper-hover");
                $(".tablescraper-next-button").removeClass("tablescraper-next-button");
                var selector = buildCssSelectorForElement(clickEvent.target);
                $(clickEvent.target).addClass("tablescraper-next-button");
                console.log("Next button selector:", selector);
                sendResponse({ selector: selector });
            })(event);
            return false;
        };

        $("*").click(onElementClick).on("mouseenter", onElementMouseEnter);
    }

    /**
     * Clicks the "Next page" button identified by a CSS selector,
     * simulating a full sequence of mousedown, click, and mouseup events.
     *
     * @param {string} selector - CSS selector for the "Next" button element.
     * @param {Function} sendResponse - Chrome message callback.
     * @param {boolean} [markOnly=false] - If true, only marks the button visually without clicking.
     */
    function clickNextButton(selector, sendResponse, markOnly) {
        var $button = findElementBySelector(selector);
        if (!$button) {
            return sendResponse(
                markOnly
                    ? { error: "Next button not found", errorId: "error" }
                    : { error: "No more next buttons: Finished crawling. Download CSV or Excel file", errorId: "finished" }
            );
        }

        $button.last().addClass("tablescraper-next-button");

        if (markOnly) {
            return sendResponse({});
        }

        $("*").off("click", onElementClick).off("mouseenter", onElementMouseEnter);

        setTimeout(function() {
            sendResponse({});
            (function simulateClick(targetElement) {
                var mousedown = document.createEvent("MouseEvents");
                mousedown.initMouseEvent("mousedown", true, true, window, 1, targetElement.x, targetElement.y, targetElement.x, targetElement.y, false, false, false, false, 0, null);
                var click = document.createEvent("MouseEvents");
                click.initMouseEvent("click", true, true, window, 1, targetElement.x, targetElement.y, targetElement.x, targetElement.y, false, false, false, false, 0, null);
                var mouseup = document.createEvent("MouseEvents");
                mouseup.initMouseEvent("mouseup", true, true, window, 1, targetElement.x, targetElement.y, targetElement.x, targetElement.y, false, false, false, false, 0, null);
                targetElement.dispatchEvent(mousedown);
                targetElement.dispatchEvent(click);
                targetElement.dispatchEvent(mouseup);
            })($button.last()[0]);
        }, 100);
    }

    // --- Chrome Runtime Message Listener ---

    chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {

        if ("applyConfig" === message.action) {
            // Apply a saved scraping configuration to the page
            (function applyConfig(config, sendResponse) {
                clearAllHighlights();
                $(".tablescraper-hover").removeClass("tablescraper-hover");
                $(".tablescraper-next-button").removeClass("tablescraper-next-button");

                var $tableEl = findElementBySelector(config.tableSelector);
                if ($tableEl && $tableEl.length) {
                    var rawEl = $tableEl.get(0);
                    var rowInfo = findRepeatingChildren(rawEl);
                    detectedTables = [{
                        table: rawEl,
                        goodClasses: rowInfo.goodClasses,
                        children: rowInfo.children,
                        selector: config.tableSelector,
                        robot: null
                    }];
                    currentTableIndex = 0;
                    highlightSelectedTable();

                    var nextSelector = null;
                    var paginationType = config.pagination?.type ?? null;
                    if ("nextButton" === paginationType) {
                        nextSelector = config.pagination.selector;
                        localStorage.setItem("nextSelector:" + window.location.hostname, nextSelector);
                    }

                    sendResponse({
                        tableId: currentTableIndex,
                        tableSelector: detectedTables[currentTableIndex].selector,
                        robot: detectedTables[currentTableIndex].robot,
                        href: window.location.href,
                        hostname: window.location.hostname,
                        nextSelector: nextSelector,
                        paginationType: paginationType
                    });
                } else {
                    sendResponse({ error: "Table not found for selector: " + config.tableSelector });
                }
            })(message.config, sendResponse);
            return true;
        }

        if ("nextTable" === message.action || "findTables" === message.action) {
            // Detect tables on the page or advance to the next detected table
            if ("findTables" === message.action) {
                detectedTables = [];
                findTables(message.robots);
            } else {
                if (detectedTables.length <= 1 || !detectedTables.filter(t => !t.robot).length) {
                    detectedTables = [];
                    findTables(message.robots);
                }
                currentTableIndex = (currentTableIndex + 1) % detectedTables.length;
            }

            highlightSelectedTable();
            localStorage.removeItem("visited");

            sendResponse({
                tableId: currentTableIndex,
                tableSelector: detectedTables[currentTableIndex].selector,
                robot: detectedTables[currentTableIndex].robot,
                href: window.location.href,
                hostname: window.location.hostname
            });
            return true;
        }

        if ("getTableData" === message.action) {
            extractTableData(sendResponse, message.selector);
            return true;
        }

        if ("getNextButton" === message.action) {
            activateNextButtonPickingMode(sendResponse);
            return true;
        }

        if ("clickNext" === message.action) {
            clickNextButton(message.selector, sendResponse);
            return true;
        }

        if ("scrollDown" === message.action) {
            // Scroll down through the element containing the scraped table,
            // waiting until new rows appear or the scroll position stops changing.
            clearAllHighlights();
            (async function scrollDownUntilNewRows(tableSelector, sendResponse) {
                /**
                 * Attempts to scroll an element down by 50px and checks if it can scroll.
                 * @param {Element} el - The scrollable element.
                 * @returns {Promise<boolean>} True if the element has reached scroll threshold.
                 */
                let canScrollElement = el => new Promise((resolve) => {
                    if (el.scrollTop + 5 >= 50) {
                        resolve(true);
                    } else {
                        el.scrollTop = el.scrollTop + 50;
                        setTimeout(() => {
                            resolve(el.scrollTop + 5 >= 50);
                        }, 10);
                    }
                });

                /**
                 * Scrolls an element by a given amount and waits 1 second.
                 * @param {Element} el - The scrollable element.
                 * @param {number} amount - Amount to scroll in pixels.
                 * @returns {Promise<void>}
                 */
                let scrollByAmount = (el, amount) => new Promise((resolve) => {
                    el.scrollTop = el.scrollTop + amount;
                    setTimeout(() => { resolve(); }, 1000);
                });

                // Find the scrollable ancestor of the table element
                let scrollableEl = document.querySelector(tableSelector);
                for (; scrollableEl && !await canScrollElement(scrollableEl);) {
                    scrollableEl = scrollableEl.parentElement;
                }

                console.log("Element with scrollbar");
                console.log(scrollableEl);

                if (!scrollableEl) {
                    return void sendResponse({ error: "No element with a scrollbar found" });
                }

                let newRowsAppeared = false;
                let scrollPositionUnchanged = false;
                let initialRowCount = $(tableSelector).children().length;
                let lastScrollTop = scrollableEl.scrollTop;

                while (!newRowsAppeared && !scrollPositionUnchanged) {
                    await scrollByAmount(scrollableEl, 1000);
                    newRowsAppeared = initialRowCount !== $(tableSelector).children().length;
                    scrollPositionUnchanged = scrollableEl.scrollTop === lastScrollTop;
                    lastScrollTop = scrollableEl.scrollTop;
                }

                sendResponse({});
            })(message.selector, sendResponse);
            return true;
        }

        if ("markNextButton" === message.action) {
            clickNextButton(message.selector, sendResponse, true);
            return true;
        }

        sendResponse({});
    });
})();