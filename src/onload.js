(() => {
    function e(e, t) {
        return (t || ".") + e.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&").trim()
    }

    function t(e) {
        return (e.attr("class") || "").trim().split(/\s+/).filter(function(e) {
            return e.length > 0
        })
    }

    function n(e) {
        var n = $(e).children(),
            r = {},
            o = {};
        n.each(function() {
            if (!["script", "img", "meta", "style"].includes(this.nodeName.toLowerCase()) && $(this).text().trim().length) {
                var e = t($(this)).sort(),
                    n = e.join(" ");
                n in o || (o[n] = 0), o[n]++, e.forEach(function(e) {
                    e in r || (r[e] = 0), r[e]++
                })
            }
        });
        var s = Object.keys(o).filter(function(e) {
            return o[e] >= n.length / 2 - 2
        });
        if (s.length || (s = Object.keys(r).filter(function(e) {
                return r[e] >= n.length / 2 - 2
            })), $(e).width() * $(e).height() > 5e4 && n.length, !s.length || 1 === s.length && "" === s[0]) return {
            children: n.filter(function() {
                return this.nodeName ? !["script", "img", "meta", "style"].includes(this.nodeName.toLowerCase()) && !!$(this).text().trim().length : (console.log("???", this), !1)
            }),
            goodClasses: []
        };
        return {
            children: n.filter(function() {
                var e = !1,
                    t = $(this);
                return s.forEach(function(n) {
                    e |= function(e, t) {
                        for (var n = t.split(" "), r = 0; r < n.length; r++)
                            if (!e.hasClass(n[r])) return !1;
                        return !0
                    }(t, n)
                }), e
            }),
            goodClasses: s
        }
    }

    var r = [],
        o = 0;

    function s(e) {
        e && e.length;
        var t = $("body").width() * $("body").height();
        $("body *").each(function() {
            if (area = this.offsetWidth * this.offsetHeight, !(isNaN(area) || area < .02 * t)) {
                var e = n(this),
                    o = e.children,
                    s = o.length;
                if (!(isNaN(s) || s < 3)) {
                    var i = area * s * s;
                    r.push({
                        table: this,
                        goodClasses: e.goodClasses,
                        area,
                        children: o,
                        text: o.text(),
                        score: i,
                        selector: f(this),
                        type: "selector"
                    })
                }
            }
        }), r = r.sort((e, t) => t.score - e.score).slice(0, 5), console.log("findTables:", r)
    }

    function i() {
        var e = (o + r.length - 1) % r.length;
        $(r[e].table).removeClass("tablescraper-selected-table"), $(r[e].children).removeClass("tablescraper-selected-row"), $(r[o].table).addClass("tablescraper-selected-table"), $(r[o].children).addClass("tablescraper-selected-row")
    }

    function a() {
        $("*").removeClass("tablescraper-selected-table"), $("*").removeClass("tablescraper-selected-row")
    }
    var l, c;
    new Set;

    function d(e) {
        var t = sha256.create();
        return t.update(e), t.hex()
    }

    function u(e) {
        for (; e.length;) {
            if ($(e).length) return $(e);
            e = e.split(">").slice(1).join(">")
        }
        return null
    }

    async function h(e, s) {
        var a;
        if (s) {
            var l = u(s);
            if (console.log("getTableData:", s, l), !l) return e({
                error: "Table not found"
            }), void console.log("Table not found");
            r.length || (r = [{}]);
            var c = n(l),
                f = c.children;
            return function(e) {
                if (null === localStorage.getItem("visited")) return !1;
                {
                    const t = d(e),
                        n = JSON.parse(localStorage.getItem("visited"));
                    return n[n.length - 1] === t || n[n.length - 2] === t
                }
            }(f.text()) ? (e({
                error: "Table not changed. If the last page was not reached, try to increase crawl delay.",
                errorId: "finished"
            }), void console.log("Table not changed")) : (r[o].table = l, r[o].children = f, r[o].goodClasses = c.goodClasses, r[o].text = f.text(), function(e) {
                null === localStorage.getItem("visited") && localStorage.setItem("visited", JSON.stringify([]));
                const t = JSON.parse(localStorage.getItem("visited"));
                t.push(d(e)), localStorage.setItem("visited", JSON.stringify(t))
            }(f.text()), i(), void h(e))
        }
        a = r[o].children;
        var m = [];
        a.each(function() {
            var e = {},
                n = [];

            function r(t, r, o) {
                if (t) {
                    var s = r + (o ? " " + o : ""),
                        i = s,
                        a = 0;
                    n.forEach(e => {
                        e == r && a++
                    }), a > 1 && (i = s + " " + a), e[i] = t
                }
            }! function e(o, s, i) {
                if (i.nodeName) {
                    var a = s + "/" + i.nodeName.toLowerCase() + t(o).map(e => "." + e).join("");
                    n.push(a), r(function(e) {
                        return e.clone().children().remove().end().text()
                    }(o).trim(), a), r(o.prop("href"), a, "href"), r(o.prop("src"), a, "src"), o.children().each(function() {
                        e($(this), a, this)
                    })
                } else console.log("what???", i)
            }($(this), "", this), Object.keys(e).length && m.push(e)
        }), e({
            data: m,
            tableId: o,
            tableSelector: r[o].selector,
            goodClasses: r[o].goodClasses
        })
    }

    function f(t) {
        return $(t).trigger("mouseleave"), $(t).trigger("blur"), $(t).parents().addBack().not("html").not("body").map(function() {
            var t = this.tagName.toLowerCase();
            return "string" == typeof this.id && this.id.trim() && !this.id.match(/\d+/g) ? t += e(this.id, "#") : "string" == typeof this.className && this.className.trim() && (t += e(this.className).replace(/\s+/g, ".")), t
        }).get().join(">")
    }

    function m(e) {
        window.focus(), c = function(e) {
            $(this).is($(e.target)) && ($("*").removeClass("tablescraper-hover"), $(f(this)).last().addClass("tablescraper-hover"))
        };
        l = function(t) {
            return t.preventDefault(),
                function(t) {
                    $("*").off("click", l).off("mouseenter", c), $(".tablescraper-hover").removeClass("tablescraper-hover"), $(".tablescraper-next-button").removeClass("tablescraper-next-button");
                    var n = f(t.target);
                    $(t.target).addClass("tablescraper-next-button"), console.log("Next button selector:", n), e({
                        selector: n
                    })
                }(t), !1
        }, $("*").click(l).on("mouseenter", c)
    }

    function g(e, t, n) {
        var r = function(e) {
            for (; e.length;) {
                if ($(e).length) return $(e);
                e = e.split(">").slice(1).join(">")
            }
            return null
        }(e);
        return r ? (r.last().addClass("tablescraper-next-button"), n ? t({}) : ($("*").off("click", l).off("mouseenter", c), void setTimeout(function() {
            t({}),
                function(e) {
                    var t = document.createEvent("MouseEvents");
                    t.initMouseEvent("mousedown", !0, !0, window, 1, e.x, e.y, e.x, e.y, !1, !1, !1, !1, 0, null);
                    var n = document.createEvent("MouseEvents");
                    n.initMouseEvent("click", !0, !0, window, 1, e.x, e.y, e.x, e.y, !1, !1, !1, !1, 0, null);
                    var r = document.createEvent("MouseEvents");
                    r.initMouseEvent("mouseup", !0, !0, window, 1, e.x, e.y, e.x, e.y, !1, !1, !1, !1, 0, null), e.dispatchEvent(t), e.dispatchEvent(n), e.dispatchEvent(r)
                }(r.last()[0])
        }, 100))) : t(n ? {
            error: "Next button not found",
            errorId: "error"
        } : {
            error: "No more next buttons: Finished crawling. Download CSV or Excel file",
            errorId: "finished"
        })
    }
    chrome.runtime.onMessage.addListener(function(e, t, l) {
        return "applyConfig" === e.action ? (function(e, t) {
            a(), $(".tablescraper-hover").removeClass("tablescraper-hover"), $(".tablescraper-next-button").removeClass("tablescraper-next-button");
            var s = u(e.tableSelector);
            if (s && s.length) {
                var l = s.get(0),
                    c = n(l);
                r = [{
                    table: l,
                    goodClasses: c.goodClasses,
                    children: c.children,
                    selector: e.tableSelector,
                    robot: null
                }], o = 0, i();
                var d = null,
                    h = e.pagination?.type ?? null;
                "nextButton" === h && (d = e.pagination.selector, localStorage.setItem("nextSelector:" + window.location.hostname, d)), t({
                    tableId: o,
                    tableSelector: r[o].selector,
                    robot: r[o].robot,
                    href: window.location.href,
                    hostname: window.location.hostname,
                    nextSelector: d,
                    paginationType: h
                })
            } else t({
                error: "Table not found for selector: " + e.tableSelector
            })
        }(e.config, l), !0) : "nextTable" == e.action || "findTables" == e.action ? ("findTables" == e.action ? (r = [], s(e.robots)) : ((r.length <= 1 || !r.filter(e => !e.robot).length) && (r = [], s(e.robots)), o = (o + 1) % r.length), i(), localStorage.removeItem("visited"), l({
            tableId: o,
            tableSelector: r[o].selector,
            robot: r[o].robot,
            href: window.location.href,
            hostname: window.location.hostname
        }), !0) : "getTableData" == e.action ? (h(l, e.selector), !0) : "getNextButton" == e.action ? (m(l), !0) : "clickNext" == e.action ? (g(e.selector, l), !0) : "scrollDown" === e.action ? (a(), async function(e, t) {
            let n = e => new Promise((t, n) => {
                    e.scrollTop + 5 >= 50 ? t(!0) : (e.scrollTop = e.scrollTop + 50, setTimeout(() => {
                        let n = e.scrollTop + 5 >= 50;
                        t(n)
                    }, 10))
                }),
                r = (e, t) => new Promise((n, r) => {
                    e.scrollTop = e.scrollTop + t, setTimeout(() => {
                        n()
                    }, 1e3)
                }),
                o = document.querySelector(e);
            for (; o && !await n(o);) o = o.parentElement;
            if (console.log("Element with scrollbar"), console.log(o), !o) return void t({
                error: "No element with a scrollbar found"
            });
            let s = !1,
                i = !1,
                a = $(e).children().length,
                l = o.scrollTop;
            for (; !s && !i;) await r(o, 1e3), s = a != $(e).children().length, i = o.scrollTop == l, l = o.scrollTop;
            t({})
        }(e.selector, l), !0) : "markNextButton" == e.action ? (g(e.selector, l, !0), !0) : void l({})
    })
})();