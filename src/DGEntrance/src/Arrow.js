L.DG.Entrance.Arrow = L.Polyline.extend({

    initialize: function (latlngs, options) { // (Array, Object)
        var options = options || {},
            animation = this.getArrowAnimation(latlngs.length);

        options.animation = [animation];

        L.Polyline.prototype.initialize.call(this, latlngs, options);
    },

    _initElements: function () {
        this._map._initPathRoot();
        this._initPath();
        this._initMarkers();
        this._initStyle();
    },

    _initMarkers: function () {
        var i, marker, markerPath,
            optionsByZoom =  this.options.byZoom,
            id = this._markerId = 'arrow-marker-' + L.Util.stamp(this);

        for (i in optionsByZoom) {
            if (optionsByZoom.hasOwnProperty(i)) {
                marker = this._createElement('marker', optionsByZoom[i].marker);
                marker.id = id + '-' + i;
                markerPath = this._createElement('path', optionsByZoom[i].markerPath);
                marker.appendChild(markerPath);
                this._path.parentNode.appendChild(marker);
            }
        }

        this._updateMarker();
    },

    onAdd: function(map){
        L.Path.prototype.onAdd.call(this, map);
        map.on({'zoomend': this._updateMarker}, this);
    },

    onRemove: function(map){
       L.Path.prototype.onRemove.call(this, map);
       map.off({'zoomend': this._updateMarker}, this);
    },

    _updatePath: function () {
        L.Polyline.prototype._updatePath.call(this);
        this._offsetPathEnd();
    },

    _clipPath: function () {
        var mask = this._createElement('mask', {
            id: this._markerId + '-mask1'
        });
        var bg = this._createElement('rect', {
            x: 0, y: 0, width: 1000, height: 1000,
            fill: "white"
        });
        var rect = this._createElement('rect', {
            x: 0, y: 0, width: 832, height: 1000,
            fill: "#6f8497"
        });        

        this._path.parentNode.appendChild(mask);
        mask.appendChild(bg);
        mask.appendChild(rect);
        this._path.setAttribute('mask', 'url(#' + mask.id + ')');
    },

    _offsetPathEnd: function () {
        var origPoints = this._originalPoints,
            pointsLen = origPoints.length,
            byZoom = this.options.byZoom,
            zoom = this._map.getZoom(),
            offsetVector,
            offsetPercents,
            offsetTo,
            halfMarkerRef = {};

        if (typeof byZoom[zoom] !== 'undefined') {
            halfMarkerRef.x = byZoom[zoom].marker.refX / 2;
            halfMarkerRef.y = byZoom[zoom].marker.refY / 2;

            offsetVector = {
                x: origPoints[pointsLen - 1].x - origPoints[pointsLen - 2].x,
                y: origPoints[pointsLen - 1].y - origPoints[pointsLen - 2].y
            }
            offsetPercents = {
                x: Math.abs((halfMarkerRef.y * 100) / offsetVector.x), // x % of vector.x
                y: Math.abs((halfMarkerRef.y * 100) / offsetVector.y)  // x % of vector.x
            }

            offsetTo = {
                x: offsetVector.x / (100 / offsetPercents.x), // marker refX less than vector x times
                y: offsetVector.y / (100 / offsetPercents.y)  // marker refY less than vector y times
            }

            origPoints[pointsLen - 1].x -= offsetTo.x;
            origPoints[pointsLen - 1].y -= offsetTo.y;                    
        };
    },

    _updateMarker: function() {
        var zoom = this._map.getZoom();
        if (zoom >= L.DG.Entrance.SHOW_FROM_ZOOM) {
            this._path.setAttribute('marker-end', 'url(#' + this._markerId + '-' + zoom + ')');
        } else {
            this._path.setAttribute('marker-end', 'url(#)');
        }
    }
});

L.DG.Entrance.arrow = function (latlngs, options) {
    return new L.DG.Entrance.Arrow(latlngs, options);
};
