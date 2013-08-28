// Sets default zoom position from current theme

L.Control.Zoom.prototype.options = {
    position: L.DG.configTheme.controls.zoom.position
};

// TODO: think about pull request to leaflet with zoom control button's titles as options

L.Control.Zoom.prototype.onAdd = function (map) {
    var zoomName = 'dg-zoom',
        container = L.DomUtil.create('div', zoomName),
        projectLeaveMaxZoom = '__PROJECT_LEAVE_MAX_ZOOM__';

    this._map = map;
    this._zoomInButton = this._createButton('+', 'Приблизить', zoomName + '__in', container, this._zoomIn, this);
    this._zoomOutButton = this._createButton('-', 'Отдалить', zoomName + '__out', container, this._zoomOut, this);

    map.on('zoomend zoomlevelschange', this._updateDisabled, this);
    map.on('dgProjectLeave', function() {
        map.setMaxZoom(projectLeaveMaxZoom);
        if (map.getZoom() > projectLeaveMaxZoom) {
            map.setZoom(projectLeaveMaxZoom);
        };
    });

    map.on('dgProjectChange', function(project) {
        var projectInfo = project.getProject();
        if (projectInfo) {
            map.setMaxZoom(projectInfo.max_zoom_level);
        }
    });
    return container;
};

// Adds 2GIS-related popup content wrapper and offset
(function () {
    var offsetX = L.DG.configTheme.balloonOptions.offset.x,
        offsetY = L.DG.configTheme.balloonOptions.offset.y,
        originalSetContent = L.Popup.prototype.setContent,
        originalOnAdd = L.Popup.prototype.onAdd,
        graf = baron.noConflict(),
        baronInstance,
        tmpl = __DGCustomization_TMPL__;

    L.Popup.include({
        _domContent: null,
        _dgContainer: null,
        _scroller: null,
        _scrollerBar: null,
        _barWrapper: null,

        options: {
            offset: L.point(offsetX, offsetY)
        },

        onAdd: function (map) {
            map.on('dgEntranceShow', function() {
                map.closePopup(this);
            }, this);

            return originalOnAdd.call(this, map);
        },

        setContent: function (content) {
            if (typeof content !== 'string') {
                this._domContent = content;
                content = '';
            }
            this._shouldInitPopupContainer = true;
            this._shouldInitBaronScroller = true;

            return originalSetContent.call(this, content);
        },

        setHeaderContent: function(content) {
            this._headerContent = content;
        },

        setFooterContent: function(content) {
            this._footerContent = content;
        },

        _shouldInitHeaderFooter: function() {
            return !!(this._headerContent && this._footerContent);
        },

        _initHeaderFooter: function() {
            //TODO Support DOM type content
            this._content = L.Util.template(tmpl.header, {headerContent: this._headerContent, content: this._content});
            this._content += L.Util.template(tmpl.footer, {footerContent: this._footerContent});
        },

        clearHeaderFooter: function() {
            this._footerContent = undefined;
            this._headerContent = undefined;
        },

        _initPopupContainer: function () {
            this._content = L.Util.template(tmpl.container, {content: this._content});
            this._shouldInitPopupContainer = false;
        },

        _initBaronScroller: function () {
            var scroller = document.createElement('div'),
                barWrapper = document.createElement('div'),
                scrollerBar = document.createElement('div'),
                contentNode = this._contentNode,
                footer = contentNode.querySelector('.dg-popup-footer');
            this._detachEl(this._dgContainer);

            scroller.setAttribute('class', 'scroller');
            barWrapper.setAttribute('class', 'scroller__bar-wrapper');
            scrollerBar.setAttribute('class', 'scroller__bar');

            barWrapper.appendChild(scrollerBar);
            scroller.appendChild(this._dgContainer);
            scroller.appendChild(barWrapper);

            contentNode.insertBefore(scroller, footer);

            this._scroller = scroller;
            this._scrollerBar = scrollerBar;
            this._barWrapper = barWrapper;
            this._shouldInitBaronScroller = false;
        },

        updateScrollPosition: function() {
            baronInstance && baronInstance.update();
        },

        _update: function () {
            var shouldInitBaron;

            if (!this._map) { return; }

            this._container.style.visibility = 'hidden';

            if (this._shouldInitPopupContainer) {
                this._originalContent =  this._content;
                this._initPopupContainer();
            }

            this._updateContent();

            if (this._shouldInitHeaderFooter()) {
                this._initHeaderFooter();
                this._updateContent();
            }

            this._dgContainer = this._container.querySelector('.dg-popup-container');

            if (this._domContent) {
                this._appendEl(this._domContent);
            }

            shouldInitBaron = this._shouldInitBaron();

            if (shouldInitBaron) {
                if (this._shouldInitBaronScroller) {
                    this._initBaronScroller();
                }
                this._initBaron();
            }

            this._updateLayout();
            this._updatePosition();

            L.DomEvent.off(this._map._container, 'MozMousePixelScroll', L.DomEvent.preventDefault);

            this._container.style.visibility = '';
            this._adjustPan();
        },

        _appendEl: function (domContent) {
            this._detachEl(domContent);
            this._dgContainer.appendChild(domContent);
        },

        _detachEl: function (elem) {
            if (elem.parentNode) {
                elem.parentNode.removeChild(elem);
            }
        },

        _shouldInitBaron: function () {
            var popupHeight = this._contentNode.offsetHeight,
                maxHeight = this.options.maxHeight;

                return (maxHeight && maxHeight <= popupHeight);
        },

        _initBaron: function () {

            baronInstance = graf({
                scroller: '.scroller',
                bar: '.scroller__bar',
                track: '.scroller__bar-wrapper',
                $: function(selector, context) {
                  return bonzo(qwery(selector, context));
                },
                event: function(elem, event, func, mode) {
                  if (mode == 'trigger') {
                    mode = 'fire';
                  }
                  bean[mode || 'on'](elem, event, func);
                }
            });
        }
    });
}());

L.Map.include({
    openPopup: function (popup, latlng, options) { // (Popup) or (String || HTMLElement, LatLng[, Object])
        var content;

        this.closePopup();

        if (!(popup instanceof L.Popup)) {
            content = popup;
            popup = new L.Popup(options).setLatLng(latlng).setContent(content);
        }
        popup._isOpen = true;

        this._popup = popup;

        if (popup._source && popup._source._icon) {
            L.DomUtil.addClass(popup._source._icon, 'leaflet-marker-active');
        }

        return this.addLayer(popup);
    },

    closePopup: function (popup) {
        if (!popup || popup === this._popup) {
            popup = this._popup;
            this._popup = null;
        }
        if (popup) {
            if (popup._source && popup._source._icon) {
                L.DomUtil.removeClass(popup._source._icon, 'leaflet-marker-active');
            }
            this.removeLayer(popup);
            popup._isOpen = false;
        }
        return this;
    }
});

// Applies 2GIS divIcon to marker

L.Marker.prototype.options.icon = L.DG.divIcon();

// Adds posibility to change max zoom level
L.Map.prototype.setMaxZoom = function(maxZoom) {
    this._layersMaxZoom = maxZoom;
};
