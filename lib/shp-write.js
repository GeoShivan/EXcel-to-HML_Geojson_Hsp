(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.shpwrite = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var zip = require('./zip');
module.exports = function(gj, options) {
    zip(gj, options);
};

},{"./zip":6}],2:[function(require,module,exports){
var dataview = require('jdataview'),
    getter = require('jdataview/src/jdataview.js').prototype.getString,
    utils = require('./utils');

module.exports = function(columns, features) {
    var dbf = new ArrayBuffer(
        33 +
        (32 * columns.length) +
        (1 + utils.multi(features, 1))
    ),
    view = dataview(dbf);

    view.setUint8(0, 3);
    view.setUint8(1, 13);
    view.setUint8(2, 8);
    view.setUint8(3, 10);
    view.setUint32(4, features.length, true);
    view.setUint16(8, 33 + (32 * columns.length), true);
    view.setUint16(10, utils.multi(features, 1), true);

    var field_offset = 33;
    columns.forEach(function(column) {
        view.setString(field_offset, pad(column.name.substring(0, 10), 11, '\0'));
        view.setUint8(field_offset + 11, column.type.charCodeAt(0));
        view.setUint8(field_offset + 16, column.width);
        field_offset += 32;
    });

    var feature_offset = field_offset,
        prop;

    features.forEach(function(feature, i) {
        view.setUint8(feature_offset, 32);
        feature_offset++;
        columns.forEach(function(column) {
            prop = feature.properties[column.name];
            view.setString(feature_offset,
                pad(prop === undefined || prop === null ? '' :
                    prop.toString().substring(0, column.width), column.width, ' '));
            feature_offset += column.width;
        });
    });

    view.setUint8(feature_offset, 26);
    return view.buffer;
};

function pad(str, len, char) {
    while (str.length < len) str += char;
    return str;
}

},{"./utils":5,"jdataview":7,"jdataview/src/jdataview.js":8}],3:[function(require,module,exports){
var dataview = require('jdataview'),
    getter = require('jdataview/src/jdataview.js').prototype.getString;

module.exports = prj;

function prj(features) {
    return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';
}

},{"jdataview":7,"jdataview/src/jdataview.js":8}],4:[function(require,module,exports){
var dataview = require('jdataview'),
    utils = require('./utils');

module.exports = function(features) {
    var shp = new ArrayBuffer(utils.multi(features, 44)),
        shx = new ArrayBuffer(utils.multi(features, 8)),
        shpview = dataview(shp),
        shxview = dataview(shx),
        shx_off = 0,
        shp_off = 0;

    features.forEach(function(feature, i) {
        shpview.setInt32(shp_off, i + 1, false);
        shpview.setInt32(shp_off + 4, 20, false);
        shpview.setInt32(shp_off + 8, 1, true);
        shpview.setFloat64(shp_off + 12, feature.geometry.coordinates[0], true);
        shpview.setFloat64(shp_off + 20, feature.geometry.coordinates[1], true);
        shpview.setFloat64(shp_off + 28, 0, true);
        shpview.setFloat64(shp_off + 36, 0, true);

        shxview.setInt32(shx_off, 50 + (i * 24), false);
        shxview.setInt32(shx_off + 4, 20, false);

        shp_off += 44;
        shx_off += 8;
    });

    return [shpview.buffer, shxview.buffer];
};

},{"./utils":5,"jdataview":7}],5:[function(require,module,exports){
module.exports.multi = multi;
module.exports.bbox = bbox;
module.exports.just_props = just_props;
module.exports.just_feat = just_feat;
module.exports.just_geometry = just_geometry;
module.exports.auto = auto;

function multi(features, val) {
    return features.length * val;
}

function just_props(a) {
    return a.properties;
}

function just_feat(a) {
    return a.features;
}

function just_geometry(a) {
togeojson.geomEach(a, function(feature) {
return feature.geometry;
});
}

function auto(a) {
    if (a.type === 'FeatureCollection') {
        return just_feat(a);
    } else if (a.type === 'Feature') {
        return [a];
    } else {
        return [{
            type: 'Feature',
            properties: {},
            geometry: a
        }];
    }
}

function bbox(features) {
    var x = [], y = [];
    features.forEach(function(feature) {
        x.push(feature.geometry.coordinates[0]);
        y.push(feature.geometry.coordinates[1]);
    });
    return [
        Math.min.apply(null, x),
        Math.min.apply(null, y),
        Math.max.apply(null, x),
        Math.max.apply(null, y)
    ];
}

},{}],6:[function(require,module,exports){
(function (Buffer){
var shp = require('./shp'),
    shx = require('./shx'),
    dbf = require('./dbf'),
    prj = require('./prj'),
    JSZip = require('jszip'),
    utils = require('./utils');

module.exports = function(gj, options) {

    var features = gj.features || utils.auto(gj),
        columns = getColumns(features);

    var content = zip(
        shp(features),
        shx(features),
        dbf(columns, features),
        prj(features));

    if (typeof options.folder === 'string') {
        var zipfile = new JSZip();
        zipfile.folder(options.folder);
        zipfile.file(options.folder + '/' + options.types.point + '.shp', content[0]);
        zipfile.file(options.folder + '/' + options.types.point + '.shx', content[1]);
        zipfile.file(options.folder + '/' + options.types.point + '.dbf', content[2]);
        zipfile.file(options.folder + '/' + options.types.point + '.prj', content[3]);
        if (typeof document !== 'undefined') {
            saveAs(zipfile.generate({ type: 'blob' }), options.folder + '.zip');
        } else {
            return zipfile.generate({ type: 'base64' });
        }
    } else {
        return content;
    }

};

function getColumns(features) {
    var fields = {},
        columns = [];
    features.forEach(collect);
    function collect(f) {
        for (var p in f.properties) {
            fields[p] = f.properties[p];
        }
    }
    for (var p in fields) {
        var val = fields[p],
            type = 'C';
        if (typeof val === 'number') type = 'N';
        columns.push({
            name: p,
            type: type,
            width: val ? val.toString().length + 2 : 20
        });
    }
    return columns;
}

function zip(shp, shx, dbf, prj) {
    return [
        shp,
        shx,
        dbf,
        prj
    ];
}

}).call(this,require("buffer").Buffer)
},{"./dbf":2,"./prj":3,"./shp":4,"./shx":9,"./utils":5,"buffer":10,"jszip":11}],7:[function(require,module,exports){
var jDataView = require('./src/jdataview');
if (typeof module !== 'undefined' && module.exports) {
    module.exports = jDataView;
}

},{"./src/jdataview":8}],8:[function(require,module,exports){
(function (global) {
/*
 * jDataView by Vjeux <vjeuxx@gmail.com>
 *
 * A unique way to read a binary file in the browser
 *
 * Link: https://github.com/vjeux/jDataView
 *
 * Thanks to the following projects from which I copied some code
 * - https://github.com/gmarty/js-binary-schema-parser
 * - https://github.com/andreasgal/pdf.js
 */

(function (global) {

var compatibility = {
	isLittleEndian: (function () {
		var buffer = new ArrayBuffer(2);
		new DataView(buffer).setInt16(0, 256, true);
		return new Int16Array(buffer)[0] === 256;
	})()
};

var jDataView = function (buffer, byteOffset, byteLength) {
	if (buffer instanceof jDataView) {
		var jview = buffer;
		buffer = jview.buffer;
		byteOffset = jview.byteOffset + (byteOffset || 0);
		byteLength = jview.byteLength - (byteOffset || 0);
	}

	this.buffer = buffer;
	this.byteOffset = byteOffset || 0;
	this.byteLength = byteLength || this.buffer.byteLength || 0;
	this._isLittleEndian = compatibility.isLittleEndian;

	try {
		this._view = new DataView(this.buffer, this.byteOffset, this.byteLength);
	} catch (e) {
		// IE10 requires defineProperty, have to use a polyfill
	}
};

jDataView.createBuffer = function () {
	var buffer = new ArrayBuffer(arguments.length);
	for (var i = 0; i < arguments.length; ++i) {
		buffer[i] = arguments[i];
	}
	return buffer;
};

jDataView.prototype = {
	// Helpers

	_getByteLength: function (byteLength) {
		if (typeof byteLength !== 'number') {
			var type = byteLength;

			switch (type) {
				case 'Int8':
				case 'Uint8':
					byteLength = 1;
					break;

				case 'Int16':
				case 'Uint16':
					byteLength = 2;
					break;

				case 'Int32':
				case 'Uint32':
				case 'Float32':
					byteLength = 4;
					break;

				case 'Float64':
					byteLength = 8;
					break;

				default:
					if (type.substr(0, 6) === 'String') {
						byteLength = parseInt(type.substr(6));
					} else if (type.substr(0, 4) === 'Char') {
						byteLength = parseInt(type.substr(4));
					} else {
						byteLength = 0;
					}
			}
		}

		return byteLength;
	},

	_checkBounds: function (byteOffset, byteLength) {
		if (typeof byteOffset !== 'number') {
			throw new TypeError('Offset is not a number.');
		}
		if (typeof byteLength !== 'number') {
			throw new TypeError('Size is not a number.');
		}
		if (byteLength < 0) {
			throw new RangeError('Size is negative.');
		}
		if (byteOffset < 0 || byteOffset + byteLength > this.byteLength) {
			throw new RangeError('Trying to access beyond buffer length.');
		}
	},

	// wrapper for DataView methods

	_getInt8: function (byteOffset, isLittleEndian) {
		return this._view.getInt8(byteOffset);
	},
	_getUint8: function (byteOffset, isLittleEndian) {
		return this._view.getUint8(byteOffset);
	},
	_getInt16: function (byteOffset, isLittleEndian) {
		return this._view.getInt16(byteOffset, isLittleEndian);
	},
	_getUint16: function (byteOffset, isLittleEndian) {
		return this._view.getUint16(byteOffset, isLittleEndian);
	},
	_getInt32: function (byteOffset, isLittleEndian) {
		return this._view.getInt32(byteOffset, isLittleEndian);
	},
	_getUint32: function (byteOffset, isLittleEndian) {
		return this._view.getUint32(byteOffset, isLittleEndian);
	},
	_getFloat32: function (byteOffset, isLittleEndian) {
		return this._view.getFloat32(byteOffset, isLittleEndian);
	},
	_getFloat64: function (byteOffset, isLittleEndian) {
		return this._view.getFloat64(byteOffset, isLittleEndian);
	},

	// wrapper for DataView methods

	_setInt8: function (byteOffset, value, isLittleEndian) {
		this._view.setInt8(byteOffset, value);
	},
	_setUint8: function (byteOffset, value, isLittleEndian) {
		this._view.setUint8(byteOffset, value);
	},
	_setInt16: function (byteOffset, value, isLittleEndian) {
		this._view.setInt16(byteOffset, value, isLittleEndian);
	},
	_setUint16: function (byteOffset, value, isLittleEndian) {
		this._view.setUint16(byteOffset, value, isLittleEndian);
	},
	_setInt32: function (byteOffset, value, isLittleEndian) {
		this._view.setInt32(byteOffset, value, isLittleEndian);
	},
	_setUint32: function (byteOffset, value, isLittleEndian) {
		this._view.setUint32(byteOffset, value, isLittleEndian);
	},
	_setFloat32: function (byteOffset, value, isLittleEndian) {
		this._view.setFloat32(byteOffset, value, isLittleEndian);
	},
	_setFloat64: function (byteOffset, value, isLittleEndian) {
		this._view.setFloat64(byteOffset, value, isLittleEndian);
	},

	// Public methods

	get: function (byteOffset, type, isLittleEndian) {
		if (isLittleEndian === undefined) {
			isLittleEndian = this._isLittleEndian;
		}

		// If the type is a number, it's a bitmask
		if (typeof type === 'number') {
			var bitmask = this.get(byteOffset, 'Uint32', isLittleEndian);
			var result = {};
			for (var key in type) {
				var mask = type[key];
				var val = bitmask & mask.mask;
				if (mask.signed && (val & (1 << (mask.length - 1)))) {
					val -= (1 << mask.length);
				}
				result[key] = val >> mask.shift;
			}
			return result;
		}
		// Little hack to be able to use the following syntax
		// view.get(offset, ['string', 30], ['number', 2]);
		else if (typeof type === 'object') {
			var results = {};
			for (var i = 0; i < type.length; ++i) {
				var item = type[i];
				var result = this.get(byteOffset, item, isLittleEndian);

				// Prematurely ended list
				if (result === undefined) {
					break;
				}

				byteOffset += this._getByteLength(item);

				results[i] = result;
			}
			return results;
		}


		var byteLength = this._getByteLength(type),
			methodName;

		this._checkBounds(byteOffset, byteLength);

		if (typeof type === 'string') {
			switch (type.substr(0, 4)) {
				case 'Int8':
				case 'Int1': // Int16
				case 'Int3': // Int32
				case 'Uint':
				case 'Floa': // Float32, Float64
					methodName = '_get' + type;
					return this[methodName](byteOffset, isLittleEndian);

				case 'Stri': // String
					return this.getString(byteLength, byteOffset, isLittleEndian);

				case 'Char':
					return this.getChar(byteLength, byteOffset, isLittleEndian);
			}
		}
		return undefined;
	},

	set: function (byteOffset, value, type, isLittleEndian) {
		if (isLittleEndian === undefined) {
			isLittleEndian = this._isLittleEndian;
		}

		var byteLength = this._getByteLength(type),
			methodName;
		
		this._checkBounds(byteOffset, byteLength);

		if (typeof type === 'string') {
			switch (type.substr(0, 4)) {
				case 'Int8':
				case 'Int1': // Int16
				case 'Int3': // Int32
				case 'Uint':
				case 'Floa': // Float32, Float64
					methodName = '_set' + type;
					this[methodName](byteOffset, value, isLittleEndian);
					break;

				case 'Stri': // String
					this.setString(byteLength, byteOffset, value, isLittleEndian);
					break;

				case 'Char':
					this.setChar(byteLength, byteOffset, value, isLittleEndian);
					break;
			}
		}
	},

	getChar: function (byteLength, byteOffset, isLittleEndian) {
		return this.getString(byteLength, byteOffset, isLittleEndian);
	},

	getString: function (byteLength, byteOffset, isLittleEndian) {
		var string = '';
		for (var i = 0; i < byteLength; ++i) {
			var char = this.get(byteOffset + i, 'Uint8');
			if (char === 0) {
				break;
			}
			string += String.fromCharCode(char);
		}
		return string;
	},

	setChar: function (byteLength, byteOffset, value, isLittleEndian) {
		this.setString(byteLength, byteOffset, value, isLittleEndian);
	},
	
	setString: function (byteLength, byteOffset, value, isLittleEndian) {
		for (var i = 0; i < byteLength; ++i) {
			var charCode = value.charCodeAt(i) || 0;
			this.set(byteOffset + i, charCode, 'Uint8');
		}
	},

	// Stream methods

	tell: function () {
		return this.byteOffset;
	},

	seek: function (byteOffset) {
		this.byteOffset = byteOffset;
	},

	skip: function (byteLength) {
		this.byteOffset += byteLength;
	},

	slice: function (byteOffset, byteLength) {
		return new jDataView(this.buffer, this.byteOffset + byteOffset, byteLength);
	}
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = jDataView;
} else if (typeof define === 'function' && define.amd) {
    define(jDataView);
} else {
    global.jDataView = jDataView;
}

})(this);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],9:[function(require,module,exports){
var dataview = require('jdataview'),
    utils = require('./utils');

module.exports = function(features) {
    var shx = new ArrayBuffer(100 + utils.multi(features, 8)),
        view = dataview(shx);

    view.setInt32(0, 9994, false);
    view.setInt32(24, 50 + utils.multi(features, 4), false);
    view.setInt32(28, 1000, true);
    view.setFloat64(36, utils.bbox(features)[0], true);
    view.setFloat64(44, utils.bbox(features)[1], true);
    view.setFloat64(52, utils.bbox(features)[2], true);
    view.setFloat64(60, utils.bbox(features)[3], true);
    return view.buffer;
};

},{"./utils":5,"jdataview":7}],10:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken implementation of `TypedArray.prototype.subarray` which returns
 *     incorrect values in certain scenarios.
 *
 *   - IE11 daily builds have a broken implementation of `TypedArray.prototype.subarray`
 *     that returns corrupt data in certain scenarios.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

/*
 * Export kMaxLength after typed array support is determined.
 */
exports.kMaxLength = kMaxLength()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length)
    }
    that.length = length
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` underlying buffer allocation is handled by `new Uint8Array(...)`
 * which creates a new buffer underlying the `Uint8Array` instance.
 *
 * Note: If the browser supports simple type checking but fails to support
 * modern typed array features, `Buffer.TYPED_ARRAY_SUPPORT` will be false.
 */
function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }

  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpreted as a start position.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
}

function allocUnsafe (that, size) {
  assertSize(size)
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  that = createBuffer(that, length)

  var actual = that.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual)
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  that = createBuffer(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array)
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset)
  } else {
    array = new Uint8Array(array, byteOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array)
  }
  return that
}

function fromObject (that, obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    that = createBuffer(that, len)

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len)
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.alloc(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array#toString()
  // as it ignores all arguments and applies tacitly some default stringification
  if (start === undefined || start < 0) {
    start = 0
  }
  // Do not exceed bounds ahead of passing them to component functions
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; serves as search starting point
// - encoding - encoding of the string val
// - dir - true for forward search, false for backward search
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either forward or backward
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (Buffer.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i = i - (i - foundIndex)
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset, length) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength automatically computed with base64ToBytes
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xCF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start]
    }
  }

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write past its end.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    this.writeUInt8(value & 0xff, offset, true)
    this.writeUInt8(value >>> 8, offset + 1, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    this.writeUInt8(value >>> 8, offset, true)
    this.writeUInt8(value & 0xff, offset + 1, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    this.writeUInt8(value & 0xff, offset, true)
    this.writeUInt8((value >> 8) & 0xff, offset + 1, true)
    this.writeUInt8((value >> 16) & 0xff, offset + 2, true)
    this.writeUInt8((value >> 24) & 0xff, offset + 3, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    this.writeUInt8((value >> 24) & 0xff, offset, true)
    this.writeUInt8((value >> 16) & 0xff, offset + 1, true)
    this.writeUInt8((value >> 8) & 0xff, offset + 2, true)
    this.writeUInt8(value & 0xff, offset + 3, true)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    this.writeInt8(value & 0xff, offset, true)
    this.writeInt8(value >>> 8, offset + 1, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    this.writeInt8(value >>> 8, offset, true)
    this.writeInt8(value & 0xff, offset + 1, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    this.writeInt8(value & 0xff, offset, true)
    this.writeInt8((value >> 8) & 0xff, offset + 1, true)
    this.writeInt8((value >> 16) & 0xff, offset + 2, true)
    this.writeInt8((value >> 24) & 0xff, offset + 3, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    this.writeInt8((value >> 24) & 0xff, offset, true)
    this.writeInt8((value >> 16) & 0xff, offset + 1, true)
    this.writeInt8((value >> 8) & 0xff, offset + 2, true)
    this.writeInt8(value & 0xff, offset + 3, true)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so handle that here.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString())
    var len = bytes.length
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for missing padding, but doesn't connect strings with +'s, whereas base64-js does
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          leadSurrogate = codePoint
          continue
        }
      } else {
        // valid surrogate pair
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          codePoint = (((leadSurrogate - 0xD800) << 10) | (codePoint - 0xDC00)) + 0x10000
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        (codePoint >> 0x6) | 0xC0,
        (codePoint & 0x3F) | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        (codePoint >> 0xC) | 0xE0,
        ((codePoint >> 0x6) & 0x3F) | 0x80,
        (codePoint & 0x3F) | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        (codePoint >> 0x12) | 0xF0,
        ((codePoint >> 0xC) & 0x3F) | 0x80,
        ((codePoint >> 0x6) & 0x3F) | 0x80,
        (codePoint & 0x3F) | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":12,"ieee754":13,"isarray":14}],11:[function(require,module,exports){
(function (Buffer){
/**

JSZip - A Javascript class for creating, reading and editing .zip files
<http://stuartk.com/jszip>

(c) 2009-2014 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/master/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/master/LICENSE
**/
(function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.JSZip=e()}})(function(){return function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}({1:[function(e,t,n){
'use strict';
var r = e("./utils");
var s = e("./support");
var o = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
n.encode = function(e) {
    var t, n, i, a, f, l, h, u = [],
        c = 0,
        p = e.length,
        d = p,
        g = "string" !== r.getTypeOf(e);
    while (c < p) {
        d = p - c;
        if (g) {
            t = e[c++];
            n = c < p ? e[c++] : 0;
            i = c < p ? e[c++] : 0
        } else {
            t = e.charCodeAt(c++);
            n = c < p ? e.charCodeAt(c++) : 0;
            i = c < p ? e.charCodeAt(c++) : 0
        }
        a = t >> 2;
        f = (t & 3) << 4 | n >> 4;
        l = d > 1 ? (n & 15) << 2 | i >> 6 : 64;
        h = d > 2 ? i & 63 : 64;
        u.push(o.charAt(a) + o.charAt(f) + o.charAt(l) + o.charAt(h))
    }
    return u.join("")
};
n.decode = function(e) {
    var t, n, r, i, a, f, l, h = 0,
        u = 0,
        c = "data:";
    if (e.substr(0, c.length) === c) {
        throw new Error("Invalid base64 input, it looks like a data url.")
    }
    e = e.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    var p = 3 * e.length / 4;
    if (e.charAt(e.length - 1) === o.charAt(64)) {
        p--
    }
    if (e.charAt(e.length - 2) === o.charAt(64)) {
        p--
    }
    var d;
    if (s.uint8array) {
        d = new Uint8Array(p)
    } else {
        d = new Array(p)
    }
    while (h < e.length) {
        i = o.indexOf(e.charAt(h++));
        a = o.indexOf(e.charAt(h++));
        f = o.indexOf(e.charAt(h++));
        l = o.indexOf(e.charAt(h++));
        t = i << 2 | a >> 4;
        n = (a & 15) << 4 | f >> 2;
        r = (f & 3) << 6 | l;
        d[u++] = t;
        if (f !== 64) {
            d[u++] = n
        }
        if (l !== 64) {
            d[u++] = r
        }
    }
    return d
}
},{"./support":30,"./utils":32}],2:[function(e,t,n){
'use strict';
var r = e("./external");
var s = e("./stream/DataWorker");
var o = e("./stream/Crc32Probe");
var i = e("./stream/DataLengthProbe");

function a(e, t, n, r, s) {
    this.compressedSize = e;
    this.uncompressedSize = t;
    this.crc32 = n;
    this.compression = r;
    this.compressedContent = s
}
a.prototype = {
    getContentWorker: function() {
        var e = new s(r.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new i("data_length"));
        var t = this;
        e.on("error", function(e) {
            t.error = e
        }).on("end", function() {
            if (!this.streamInfo.data_length) {
                t.error = new Error("Bug : uncompressed data size mismatch")
            }
        });
        return e
    },
    getCompressedWorker: function() {
        return new s(r.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression)
    }
};
a.createWorkerFrom = function(e, t, n) {
    return e.pipe(new o).pipe(new i("uncompressedSize")).pipe(t.compressWorker(n)).pipe(new i("compressedSize")).on("end", function() {
        this.streamInfo.crc32 = this.streamInfo.crc32.get_crc32()
    })
};
t.exports = a
},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,n){
'use strict';
var r = e("./stream/StreamHelper");
var s = e("./utils");
var o = e("./compressedObject");
var i = e("./stream/Crc32Probe");
var a = e("./nodejs/NodejsStreamInputAdapter");
var f = function(e, t) {
    this.name = e;
    this.dir = t.dir;
    this.date = t.date;
    this.comment = t.comment;
    this.unixPermissions = t.unixPermissions;
    this.dosPermissions = t.dosPermissions;
    this._data = t.data;
    this._dataBinary = t.binary;
    this.options = {
        compression: t.compression,
        compressionOptions: t.compressionOptions
    }
};
f.prototype = {
    internalStream: function(e) {
        var t = e;
        var n = "string";
        if (t === "binarystring" || t === "text") {
            t = "string"
        }
        var o = this._decompressWorker();
        var i = !this._dataBinary;
        if (i && !s.isNode) {
            o = o.pipe(new r.transformTo("string", this.options.encoding))
        }
        if (!i && n !== t) {
            o = o.pipe(new r.transformTo(t, this.options.encoding))
        }
        return new r(o, n, this.options.encoding)
    },
    async: function(e, t) {
        return this.internalStream(e).accumulate(t)
    },
    nodeStream: function(e, t) {
        return new a(this, e, t)
    },
    _compressWorker: function(e, t) {
        if (this._data instanceof o && this._data.compression.magic === e.magic) {
            return this._data.getCompressedWorker()
        } else {
            var n = this._stream();
            if (!this._dataBinary) {
                n = n.pipe(new r.transformTo("uint8array"))
            }
            return o.createWorkerFrom(n, e, t)
        }
    },
    _decompressWorker: function() {
        if (this._data instanceof o) {
            return this._data.getContentWorker()
        } else {
            var e = this._stream();
            if (!this._dataBinary) {
                e = e.pipe(new r.transformTo("uint8array"))
            }
            return e
        }
    },
    _stream: function() {
        var e = this.options.encoding;
        var t = s.getTypeOf(this._data);
        var n = new r.Nil;
        var o = this;
        if (s.isNode && s.isStream(this._data)) {
            var a = new r.StreamAdapter(this._data);
            return a
        }
        try {
            var f = s.transformTo(e, this._data);
            n.push({
                data: f,
                meta: {
                    percent: 0,
                    currentFile: this.name
                }
            });
            var l = this.options.compression.compressWorker(this.options.compressionOptions);
            var h = new i;
            var u = new r.StreamAdapter(n);
            u.pipe(l).pipe(h).pipe(new r.StreamAdapter({
                on: function(e, t) {
                    if (e === "data") {
                        o._data = new s.Buffer(t.data)
                    }
                }
            }));
            u.resume()
        } catch (c) {
            n.error(c);
            return n
        }
        return n
    }
};
t.exports = f
},{"./compressedObject":2,"./nodejs/NodejsStreamInputAdapter":14,"./stream/Crc32Probe":25,"./stream/StreamHelper":28,"./utils":32}],4:[function(e,t,n){
'use strict';
var r = e("./stream/DataReader");

function s(e) {
    r.call(this, e);
    for (var t = 0; t < this.data.length; t++) {
        e[t] = e[t] & 255
    }
}
e("./utils").inherits(s, r);
s.prototype.byteAt = function(e) {
    return this.data[this.zero + e]
};
s.prototype.lastIndexOfSignature = function(e) {
    var t = e.charCodeAt(0),
        n = e.charCodeAt(1),
        r = e.charCodeAt(2),
        s = e.charCodeAt(3);
    for (var o = this.length - 4; o >= 0; --o) {
        if (this.data[o] === t && this.data[o + 1] === n && this.data[o + 2] === r && this.data[o + 3] === s) {
            return o - this.zero
        }
    }
    return -1
};
s.prototype.readAndCheckSignature = function(e) {
    var t = e.charCodeAt(0),
        n = e.charCodeAt(1),
        r = e.charCodeAt(2),
        s = e.charCodeAt(3),
        o = this.readData(4);
    return t === o[0] && n === o[1] && r === o[2] && s === o[3]
};
s.prototype.readData = function(e) {
    this.checkOffset(e);
    if (e === 0) {
        return []
    }
    var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
    this.index += e;
    return t
};
t.exports = s
},{"./stream/DataReader":24,"./utils":32}],5:[function(e,t,n){
'use strict';
var r = e("./utils");
var s = e("./stream/GenericWorker");
var o = e("./stream/StreamHelper");
var i = e("./utf8");
var a = e("./zipEntries");
var f = e("./stream/Crc32Probe");
var l = e("./nodejsUtils");
var h = e("./stream/DataLengthProbe");
var u = e("./stream/TransformStream");

function c(e, t, n) {
    this.name = e;
    this.options = t;
    this.comment = n;
    this.files = {};
    this.root = "";
    this.clone = function() {
        var e = new c(this.name, this.options, this.comment);
        for (var t in this.files) {
            if (this.files.hasOwnProperty(t)) {
                e.file(t, this.files[t].options)
            }
        }
        e.root = this.root;
        return e
    }
}
c.prototype = {
    file: function(e, t, n) {
        if (arguments.length === 1) {
            if (r.isRegExp(e)) {
                var s = e;
                return this.filter(function(e, t) {
                    return !t.dir && s.test(e)
                })
            } else {
                return this.filter(function(t) {
                    return t === e
                })[0] || null
            }
        } else {
            e = this.root + e;
            p.call(this, e, t, n)
        }
        return this
    },
    folder: function(e) {
        if (!e) {
            return this
        }
        if (r.isRegExp(e)) {
            return this.filter(function(t, n) {
                return n.dir && e.test(t)
            })
        }
        var t = this.root + e;
        var n = t.replace(/\/$/, "");
        var s = this.files[n];
        if (!s || !s.dir) {
            p.call(this, n, null, {
                dir: true
            })
        }
        var o = new c(this.name, this.options, this.comment);
        o.root = n + "/";
        return o
    },
    filter: function(e) {
        var t = [];
        for (var n in this.files) {
            if (this.files.hasOwnProperty(n)) {
                var r = this.files[n];
                if (e(n.slice(this.root.length, n.length), r)) {
                    t.push(r)
                }
            }
        }
        return t
    },
    remove: function(e) {
        e = this.root + e;
        var t = this.files[e];
        if (!t) {
            if (e.slice(e.length - 1) !== "/") {
                e += "/"
            }
            t = this.files[e]
        }
        if (t && !t.dir) {
            delete this.files[e]
        } else {
            var n = this.filter(function(t, n) {
                return n.name.slice(0, e.length) === e
            });
            for (var r = 0; r < n.length; r++) {
                delete this.files[n[r].name]
            }
        }
        return this
    },
    generate: function(e) {
        throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")
    },
    generateInternalStream: function(e) {
        var t, n = {};
        try {
            n = r.extend(e || {}, {
                streamFiles: false,
                compression: "STORE",
                compressionOptions: null,
                type: "",
                platform: "DOS",
                comment: this.comment || null,
                mimeType: "application/zip"
            });
            n.type = n.type.toLowerCase();
            n.platform = n.platform.toUpperCase();
            if (n.type === "binarystring") {
                n.type = "string"
            }
            if (!n.streamFiles && e && e.streamFiles !== false) {
                t = this._generateStream(n)
            } else if (l.isNode && n.type === "nodebuffer") {
                t = this._generateNodeBuffer(n)
            } else {
                t = this._generateStream(n)
            }
        } catch (s) {
            t = new s("string");
t.error(s)
        }
        return t
    },
    _generateNodeBuffer: function(e) {
        var t = new u("nodebuffer");
        var n = this;
        this.generateInternalStream(e).on("data", function(e) {
            t.push(e.data)
        }).on("error", function(e) {
            t.error(e)
        }).on("end", function() {
            t.push(null)
        });
        return t
    },
    _generateStream: function(e) {
        var t = new s("string");
        var n = 0,
            r = 0,
            o = 0,
            i = 0,
            l, h, u;
        var c = 0;
        var d = [];
        var g = new f;
        var m = new h("string");
        var b = this;
        l = e.compression;
        if (!e.streamFiles) {
            u = function(e, t) {
                e.comment = b.comment || null;
                e.extraFields = [];
                var s = t.options.compression,
                    o = t.options.compressionOptions || {},
                    i = t._compressWorker(s, o),
                    f = i.pipe(g, {
                        chunkSize: 16384
                    }).pipe(m);
                f.on("end", function() {
                    n++;
                    var b = m.streamInfo.crc32,
                        s = m.streamInfo.data_length;
                    m.unpipe(this);
                    m = new h("string");
                    var o = this.streamInfo.data_length;
                    var i = new r.Buffer(s);
                    this.result.copy(i, 0);
                    e.compressedSize = o;
                    e.uncompressedSize = s;
                    e.crc32 = b;
                    e.compression = l;
                    e.compressedContent = i;
                    e.extraFields = [];
                    e.centralDirectory = false;
                    d.push(e);
                    if (n === c) {
                        v()
                    }
                }).on("error", function(e) {
                    t.error(e)
                });
                i.resume()
            }
        }
        var v = function() {
            var n;
            for (n = 0; n < d.length; n++) {
                t.push({
                    data: a.LOCAL_FILE_HEADER + d[n].fileheader(),
                    meta: {
                        percent: 0,
                        currentFile: d[n].name
                    }
                });
                t.push({
                    data: d[n].compressedContent,
                    meta: {
                        percent: 0,
                        currentFile: d[n].name
                    }
                })
            }
            i = t.streamInfo.written;
            for (n = 0; n < d.length; n++) {
                d[n].centralDirectory = true;
                d[n].fileOffset = d[n].offset;
                t.push({
                    data: a.CENTRAL_FILE_HEADER + d[n].fileheader(),
                    meta: {
                        percent: 0,
                        currentFile: d[n].name
                    }
                });
                o++
            }
            var r = t.streamInfo.written;
            var s = r - i;
            var f = a.CENTRAL_DIRECTORY_END + a.EOCDR(o, s, i, e.comment);
            t.push({
                data: f,
                meta: {
                    percent: 100
                }
            })
        };
        for (h in this.files) {
            if (!this.files.hasOwnProperty(h)) {
                continue
            }
            c++;
            var w = this.files[h],
                _ = new a({
                    name: w.name,
                    dir: w.dir,
                    date: w.date,
                    comment: w.comment,
                    unixPermissions: w.unixPermissions,
                    dosPermissions: w.dosPermissions
                }, {
                    percent: r,
                    total: i
                });
            if (!e.streamFiles) {
                u(_, w)
            } else {
                var S = _.fileheader(),
                    k = w._compressWorker(l, e.compressionOptions),
                    y = new f,
                    x = new h("string");
                d.push(_);
                var E = k.pipe(y).pipe(x);
                t.push({
                    data: a.LOCAL_FILE_HEADER + S,
                    meta: {
                        percent: 0,
                        currentFile: w.name
                    }
                });
                E.on("data", function(e) {
                    t.push({
                        data: e.data,
                        meta: {
                            percent: 0,
                            currentFile: w.name
                        }
                    })
                }).on("end", function() {
                    _.crc32 = y.get_crc32();
                    _.compressedSize = x.streamInfo.data_length;
                    _.uncompressedSize = w.uncompressedSize;
                    var e = t.streamInfo.written;
                    _.offset = e;
                    n++;
                    _.centralDirectory = true;
                    _.fileOffset = e;
                    t.push({
                        data: a.CENTRAL_FILE_HEADER + _.fileheader(),
                        meta: {
                            percent: 0,
                            currentFile: w.name
                        }
                    });
                    o++;
                    if (n === c) {
                        var r = t.streamInfo.written;
                        var s = r - i;
                        var f = a.CENTRAL_DIRECTORY_END + a.EOCDR(o, s, i, b.comment);
                        t.push({
                            data: f,
                            meta: {
                                percent: 100
                            }
                        })
                    }
                }).on("error", function(e) {
                    t.error(e)
                });
                k.resume()
            }
        }
        if (c === 0) {
            var f = a.CENTRAL_DIRECTORY_END + a.EOCDR(0, 0, 0, this.comment);
            t.push({
                data: f,
                meta: {
                    percent: 100
                }
            })
        }
        return t
    }
};
var p = function(e, t, n) {
    if (e.slice(-1) === "/") {
        n = n || {};
        n.dir = true
    }
    if (this.files[e]) {
        this.remove(e)
    }
    var s = r.extend(n || {}, {
        name: e,
        dir: n && n.dir || false,
        date: null,
        comment: null,
        unixPermissions: null,
        dosPermissions: null,
        _data: null,
        _dataBinary: false
    });
    s.date = s.date || new Date;
    if (t !== null && typeof t !== "undefined") {
        if (r.isNode && r.isStream(t)) {
            var o = new h("string");
            t.pipe(o);
            o.on("end", function() {
                s.uncompressedSize = this.streamInfo.data_length
            })
        }
        s._data = t;
        s.binary = true;
        s.options = s.options || {};
        if (s.options.base64) {
            s._data = i.decode(s._data)
        } else if (s.options.binary) {
            s._dataBinary = true
        } else {
            s.binary = false;
            var a = r.getTypeOf(s._data);
            if (a === "string") {
                s.options.encoding = "utf-8"
            }
        }
        if (!s.dir && typeof s.options.createFolders === "undefined" || s.options.createFolders) {
            d.call(this, e)
        }
    }
    this.files[e] = s
};
var d = function(e) {
    e = e.replace(/\/$/, "");
    var t = e.lastIndexOf("/");
    if (t > 0) {
        var n = e.substring(0, t);
        if (!this.files[n]) {
            p.call(this, n, null, {
                dir: true
            })
        }
    }
};
c.load = function() {
    throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")
};
t.exports = c
},{"./nodejsUtils":15,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/GenericWorker":29,"./stream/TransformStream":31,"./utf8":33,"./utils":32,"./zipEntries":34}],6:[function(e,t,n){
'use strict';
var r;
if (typeof Promise !== "undefined") {
    r = Promise
} else {
    r = e("lie")
}
t.exports.Promise = r
},{"lie":37}],7:[function(e,t,n){
'use strict';
var r = "undefined" == typeof Uint8Array || "undefined" == typeof Uint16Array || "undefined" == typeof Uint32Array;
n.assign = function(e) {
    var t, n, r = Array.prototype.slice.call(arguments, 1);
    while (r.length) {
        n = r.shift();
        for (t in n) {
            if (Object.prototype.hasOwnProperty.call(n, t)) {
                e[t] = n[t]
            }
        }
    }
    return e
};
n.shrinkBuf = function(e, t) {
    if (e.length === t) {
        return e
    }
    if (e.subarray) {
        return e.subarray(0, t)
    }
    e.length = t;
    return e
};
var s = {
    arraySet: function(e, t, n, r, s) {
        if (t.subarray && e.subarray) {
            e.set(t.subarray(n, n + r), s);
            return
        }
        for (var o = 0; o < r; o++) {
            e[s + o] = t[n + o]
        }
    },
    flattenChunks: function(e) {
        var t, n, r, s, o, i;
        r = 0;
        for (t = 0, n = e.length; t < n; t++) {
            r += e[t].length
        }
        i = new Uint8Array(r);
        s = 0;
        for (t = 0, n = e.length; t < n; t++) {
            o = e[t];
            i.set(o, s);
            s += o.length
        }
        return i
    }
};
var o = {
    arraySet: function(e, t, n, r, s) {
        for (var o = 0; o < r; o++) {
            e[s + o] = t[n + o]
        }
    },
    flattenChunks: function(e) {
        return [].concat.apply([], e)
    }
};
n.setTyped = function(e) {
    if (e) {
        n.Buf8 = Uint8Array;
        n.Buf16 = Uint16Array;
        n.Buf32 = Uint32Array;
        n.assign(n, s)
    } else {
        n.Buf8 = Array;
        n.Buf16 = Array;
        n.Buf32 = Array;
        n.assign(n, o)
    }
};
n.setTyped(r)
},{}],8:[function(e,t,n){
'use strict';
var r = e("./zlib/deflate");
var s = e("./utils");
var o = e("./constants");
var i = e("./stream/GenericWorker");
var a = function(e, t) {
    i.call(this, "FlateWorker/" + e);
    this._pako = new r.Deflate(e, {
        raw: true,
        level: t.level || -1
    });
    this.meta = {};
    var n = this;
    this._pako.onData = function(e) {
        n.push({
            data: e,
            meta: n.meta
        })
    };
    this._pako.onEnd = function(e) {
        if (e) {
            n.error(new Error("pako error" + e))
        }
        n.push({
            data: new s.Buffer(0),
            meta: n.meta
        })
    }
};
s.inherits(a, i);
a.prototype.processChunk = function(e) {
    this.meta = e.meta;
    this._pako.push(s.transformTo("uint8array", e.data), false)
};
a.prototype.flush = function() {
    this._pako.push([], true)
};
a.prototype.cleanUp = function() {
    this._pako = null
};
n.STORE = {
    magic: "\0\0",
    compressWorker: function(e) {
        return new i("STORE compression")
    },
    uncompressWorker: function() {
        return new i("STORE decompression")
    }
};
n.DEFLATE = {
    magic: "\b\0",
    compressWorker: function(e) {
        var t = e && e.level || -1;
        return new a(t, e)
    },
    uncompressWorker: function() {
        var e = e || {};
        var t = new(e.Inflate || r.InflateRaw);
        var n = new i("DEFLATE decompression");
        t.onData = function(e) {
            n.push({
                data: e,
                meta: {}
            })
        };
        t.onEnd = function(e) {
            if (e) {
                n.error(new Error("DEFLATE error " + e))
            }
            n.push({
                data: new s.Buffer(0),
                meta: {}
            })
        };
        t.onTrain = function(e) {
            o.DEFLATE_TRAIN.push(e)
        };
        n.on("data", function(e) {
            t.push(e.data, false)
        }).on("error", function(e) {
            t.push([], true)
        }).on("end", function() {
            t.push([], true)
        });
        return n
    }
}
},{"./constants":10,"./stream/GenericWorker":29,"./utils":32,"./zlib/deflate":35}],9:[function(e,t,n){
'use strict';
var r = e("./utils");
var s = e("./stream/GenericWorker");

function o(e) {
    s.call(this, "DateWorker");
    this.date = e
}
r.inherits(o, s);
o.prototype.processChunk = function(e) {
    var t = this.date;
    var n = (t.getFullYear() - 1980 << 9) + (t.getMonth() + 1 << 5) + t.getDate();
    var r = (t.getHours() << 11) + (t.getMinutes() << 5) + (t.getSeconds() / 2);
    e.meta.dosTime = r;
    e.meta.dosDate = n;
    this.push(e)
};
t.exports = o
},{"./stream/GenericWorker":29,"./utils":32}],10:[function(e,t,n){
'use strict';
n.DEFLATE_TRAIN = []
},{}],11:[function(e,t,n){
"use strict";
var r = e("./flate");
n.STORE = r.STORE;
n.DEFLATE = r.DEFLATE
},{"./flate":8}],12:[function(e,t,n){
(function(e){
'use strict';
var r = e("./uint8ArrayReader");
var s = e("./utils");

function o(e) {
    this.files = [];
    if (e) {
        this.load(e)
    }
}
o.prototype = {
    load: function(e) {
        var t = s.getTypeOf(e);
        if (t === "string") {
            s.base64 = true;
            e = s.decode(e.slice(e.lastIndexOf(",") + 1))
        } else if (t === "arraybuffer") {
            e = new Uint8Array(e)
        }
        this.reader = new r(e);
        var n = this.reader.readString(4);
        if (n !== "PK") {
            throw new Error("Corrupted zip file")
        }
        this.read()
    },
    read: function() {
        var e = this.reader.readString(4);
        while (e === "PK") {
            this.readFile();
            e = this.reader.readString(4)
        }
        if (e === "PK") {
            this.readCentralDir()
        } else if (e !== "PK") {
            throw new Error("Corrupted zip file")
        }
    },
    readFile: function() {
        this.reader.readString(2);
        this.reader.readString(2);
        this.reader.readString(2);
        this.reader.readString(2);
        var e = this.reader.readInt(4);
        var t = this.reader.readInt(4);
        var n = this.reader.readInt(4);
        var r = this.reader.readInt(2);
        var s = this.reader.readInt(2);
        var o = this.reader.readString(r);
        this.reader.readString(s)
    },
    readCentralDir: function() {
        this.reader.readString(2);
        this.reader.readString(2);
        this.reader.readString(2);
        this.reader.readString(2);
        this.reader.readString(4);
        this.reader.readString(4);
        var e = this.reader.readInt(4);
        var t = this.reader.readInt(4);
        var n = this.reader.readInt(2);
        var r = this.reader.readInt(2);
        var s = this.reader.readInt(2);
        this.reader.readString(4);
        var o = this.reader.readInt(4);
        var i = this.reader.readString(n);
        this.reader.readString(r);
        this.reader.readString(s);
        var a = this.reader.clone();
        a.goTo(o);
        var f = a.readString(4);
        if (f !== "PK") {
            throw new Error("Corrupted zip file")
        }
        var l = new e.ZipObject;
        l.load({
            reader: a
        });
        this.files.push(l);
        this.readCentralDir()
    }
};
t.exports = o
}).call(this,e("_process"))
},{"./uint8ArrayReader":23,"./utils":32,"_process":38}],13:[function(e,t,n){
(function(e){
'use strict';
var r = e("./utils");
var s = e("./stream/GenericWorker");
var o = e("./utf8");
var i = e("./zipEntries");
var a = e("./stream/Crc32Probe");
var f = e("./nodejsUtils");
var l = e("./stream/DataLengthProbe");

function h(e, t, n) {
    this.name = e;
    this.options = t;
    this.comment = n;
    this.files = {};
    this.clone = function() {
        var e = new h(this.name, this.options, this.comment);
        for (var t in this.files) {
            if (this.files.hasOwnProperty(t)) {
                e.file(t, this.files[t].options)
            }
        }
        return e
    }
}
h.prototype = {
    file: function(e, t, n) {
        if (arguments.length === 1) {
            if (r.isRegExp(e)) {
                var s = e;
                return this.filter(function(e, t) {
                    return !t.dir && s.test(e)
                })
            } else {
                return this.filter(function(t) {
                    return t === e
                })[0] || null
            }
        } else {
            e = this.root + e;
            u.call(this, e, t, n)
        }
        return this
    },
    folder: function(e) {
        if (!e) {
            return this
        }
        if (r.isRegExp(e)) {
            return this.filter(function(t, n) {
                return n.dir && e.test(t)
            })
        }
        var t = this.root + e;
        var n = t.replace(/\/$/, "");
        var s = this.files[n];
        if (!s || !s.dir) {
            u.call(this, n, null, {
                dir: true
            })
        }
        var o = new h(this.name, this.options, this.comment);
        o.root = n + "/";
        return o
    },
    filter: function(e) {
        var t = [];
        for (var n in this.files) {
            if (this.files.hasOwnProperty(n)) {
                var r = this.files[n];
                if (e(n, r)) {
                    t.push(r)
                }
            }
        }
        return t
    },
    remove: function(e) {
        e = this.root + e;
        var t = this.files[e];
        if (!t) {
            if (e.slice(e.length - 1) !== "/") {
                e += "/"
            }
            t = this.files[e]
        }
        if (t && !t.dir) {
            delete this.files[e]
        } else {
            var n = this.filter(function(t, n) {
                return n.name.slice(0, e.length) === e
            });
            for (var r = 0; r < n.length; r++) {
                delete this.files[n[r].name]
            }
        }
        return this
    },
    generate: function(e) {
        e = e || {};
        var t = e.compression || "STORE";
        var n = e.compressionOptions || {};
        var s = e.type || "string";
        var o = e.comment || this.comment || "";
        if (s === "binarystring") {
            s = "string"
        }
        if (s === "uint8array" || s === "arraybuffer" || s === "blob" || s === "nodebuffer") {} else {
            s = "string"
        }
        var i = new(e.streamFiles && f.isNode ? e.Readable || require("stream").Readable : s);
        var l = 0,
            h = 0,
            u = 0,
            c = 0,
            p, d;
        var g = 0;
        var m = [];
        var b = new a;
        var v = this;
        p = e.compression;
        if (!e.streamFiles) {
            d = function(e, n) {
                var s = n.options.compression,
                    o = n.options.compressionOptions || {},
                    a = n.compress(s, o),
                    f = r.transformTo(s.magic === "\0" ? "string" : "uint8array", a);
                var h = new l("string");
                f.pipe(b).pipe(h).on("end", function() {
                    l++;
                    var r = h.streamInfo.crc32,
                        s = h.streamInfo.data_length,
                        o = a.length;
                    e.compressedSize = o;
                    e.uncompressedSize = s;
                    e.crc32 = r;
                    e.compression = p;
                    e.compressedContent = a;
                    e.extraFields = [];
                    e.centralDirectory = false;
                    m.push(e);
                    if (l === g) {
                        w()
                    }
                })
            }
        }
        var w = function() {
            var n;
            for (n = 0; n < m.length; n++) {
                i.push(i.LOCAL_FILE_HEADER + m[n].fileheader());
                i.push(m[n].compressedContent)
            }
            c = i.streamInfo.written;
            for (n = 0; n < m.length; n++) {
                m[n].centralDirectory = true;
                m[n].fileOffset = m[n].offset;
                i.push(i.CENTRAL_FILE_HEADER + m[n].fileheader());
                h++
            }
            var r = i.streamInfo.written;
            var a = r - c;
            var f = i.CENTRAL_DIRECTORY_END + i.EOCDR(h, a, c, e.comment);
            i.push(f)
        };
        for (d in this.files) {
            if (!this.files.hasOwnProperty(d)) {
                continue
            }
            g++;
            var _ = this.files[d],
                S = new i.ZipEntry({
                    name: _.name,
                    dir: _.dir,
                    date: _.date,
                    comment: _.comment,
                    unixPermissions: _.unixPermissions,
                    dosPermissions: _.dosPermissions
                }, {
                    percent: h,
                    total: u
                });
            if (!e.streamFiles) {
                d(_, _)
            } else {
                var k = S.fileheader(),
                    y = _.compress(p, n),
                    x = new a,
                    E = new l("string");
                m.push(S);
                var O = y.pipe(x).pipe(E);
                i.push(i.LOCAL_FILE_HEADER + k);
                O.on("data", function(e) {
                    i.push(e.data)
                }).on("end", function() {
                    S.crc32 = x.get_crc32();
                    S.compressedSize = E.streamInfo.data_length;
                    S.uncompressedSize = _.uncompressedSize;
                    var e = i.streamInfo.written;
                    S.offset = e;
                    l++;
                    S.centralDirectory = true;
                    S.fileOffset = e;
                    i.push(i.CENTRAL_FILE_HEADER + S.fileheader());
                    h++;
                    if (l === g) {
                        var n = i.streamInfo.written;
                        var r = n - c;
                        var a = i.CENTRAL_DIRECTORY_END + i.EOCDR(h, r, c, v.comment);
                        i.push(a)
                    }
                })
            }
        }
        if (g === 0) {
            var f = i.CENTRAL_DIRECTORY_END + i.EOCDR(0, 0, 0, this.comment);
            i.push(f)
        }
        if (s === "string") {
            return i.asString()
        } else if (s === "uint8array") {
            return i.asUint8Array()
        } else if (s === "arraybuffer") {
            return i.asArrayBuffer()
        } else if (s === "blob") {
            return i.asBlob(e.mimeType || "application/zip")
        } else if (s === "nodebuffer") {
            return i.asNodeBuffer()
        }
    }
};
var u = function(e, t, n) {
    if (e.slice(-1) === "/") {
        n = n || {};
        n.dir = true
    }
    if (this.files[e]) {
        this.remove(e)
    }
    var s = r.extend(n || {}, {
        name: e,
        dir: n && n.dir || false,
        date: null,
        comment: null,
        unixPermissions: null,
        dosPermissions: null,
        _data: null,
        _dataBinary: false
    });
    s.date = s.date || new Date;
    if (t !== null && typeof t !== "undefined") {
        if (r.isNode && r.isStream(t)) {
            var i = new l("string");
            t.pipe(i);
            i.on("end", function() {
                s.uncompressedSize = this.streamInfo.data_length
            })
        }
        s._data = t;
        s.binary = true;
        s.options = s.options || {};
        if (s.options.base64) {
            s._data = o.decode(s._data)
        } else if (s.options.binary) {
            s._dataBinary = true
        } else {
            s.binary = false;
            var a = r.getTypeOf(s._data);
            if (a === "string") {
                s.options.encoding = "utf-8"
            }
        }
        if (!s.dir && typeof s.options.createFolders === "undefined" || s.options.createFolders) {
            c.call(this, e)
        }
    }
    this.files[e] = new i.ZipObject(s)
};
var c = function(e) {
    e = e.replace(/\/$/, "");
    var t = e.lastIndexOf("/");
    if (t > 0) {
        var n = e.substring(0, t);
        if (!this.files[n]) {
            u.call(this, n, null, {
                dir: true
            })
        }
    }
};
h.load = function(e, t) {
    var n = new h;
    n.load(e, t);
    return n
};
t.exports = h
}).call(this,e("_process"))
},{"./nodejsUtils":15,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/GenericWorker":29,"./utf8":33,"./utils":32,"./zipEntries":34,"_process":38}],14:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("../stream/StreamHelper");

function o(e, t, n) {
    var o = t;
    switch (o) {
        case "blob":
        case "arraybuffer":
        case "uint8array":
        case "nodebuffer":
            o = "uint8array";
            break
    }
    try {
        n = r.extend(n || {}, {
            chunkSize: 16384,
            window: {
                Promise: Promise
            }
        });
        var i = e.internalStream(o);
        var a = n.on || function() {};
        var f = new s.StreamAdapter(i, a, n.window);
        f.on("error", function(e) {
            console.log(e)
        });
        return f
    } catch (l) {
        var h = new s.Nil;
        h.error(l);
        return h
    }
}
t.exports = o
},{"../stream/StreamHelper":28,"../utils":32}],15:[function(e,t,n){
'use strict';
t.exports = {
    isNode: typeof Buffer !== "undefined",
    newBuffer: function(e, t) {
        return new Buffer(e, t)
    },
    isBuffer: function(e) {
        return Buffer.isBuffer(e)
    },
    isStream: function(e) {
        return e && typeof e.on === "function" && typeof e.pipe === "function"
    }
}
},{}],16:[function(e,t,n){
'use strict';

function r() {
    this.keys = [];
    this.values = []
}
r.prototype.put = function(e, t) {
    var n = this.keys.indexOf(e);
    if (n === -1) {
        this.keys.push(e);
        this.values.push(t)
    } else {
        this.values[n] = t
    }
};
r.prototype.get = function(e) {
    var t = this.keys.indexOf(e);
    return t === -1 ? null : this.values[t]
};
t.exports = r
},{}],17:[function(e,t,n){
'use strict';
var r = e("./DataReader");

function s(e) {
    r.call(this, e)
}
e("../utils").inherits(s, r);
s.prototype.readData = function(e) {
    this.checkOffset(e);
    var t = this.data.substring(this.zero + this.index, this.zero + this.index + e);
    this.index += e;
    return t
};
t.exports = s
},{"../utils":32,"./DataReader":24}],18:[function(e,t,n){
(function(e){
'use strict';
var r = e("./reader/reader");
var s = e("./utils");
var o = e("./compressions");
var i = e("./crc32");
var a = e("./utf8");
var f = e("./compressions");
var l = e("./support");
var h = function(e) {
    var t = new r(e);
    var n = t.readString(4);
    if (n !== "PK") {
        throw new Error("Invalid zip file")
    }
    var i = t.readString(2);
    var h = t.readString(2);
    var u = t.readString(2);
    var c = t.readString(2);
    var p = t.readInt(4);
    var d = t.readInt(4);
    var g = t.readInt(4);
    var m = t.readInt(2);
    var b = t.readInt(2);
    var v;
    if (s.isRegExp(e)) {
        v = e.exec(h)
    } else {
        v = s.endsWith(h, "g")
    }
    var w = t.readString(m);
    var _ = t.readString(b);
    var S = a.isUTF8(u);
    if (!S && !l.nodebuffer) {
        w = a.decode(w)
    }
    var k = {
        name: w,
        version: i,
        options: {
            flags: u
        },
        date: s.dosToJSDate(c),
        dir: v,
        comment: _,
        compressedSize: d,
        uncompressedSize: g,
        crc32: p
    };
    var y = f.DEFLATE.magic,
        x = o[y];
    if (x) {
        k.compression = x
    } else {
        k.compression = o.STORE
    }
    k.compressedContent = t.readString(d);
    return k
};
t.exports = h
}).call(this,e("_process"))
},{"./compressions":11,"./crc32":19,"./reader/reader":22,"./support":30,"./utf8":33,"./utils":32,"_process":38}],19:[function(e,t,n){
'use strict';
var r = function() {
    for (var e, t = [], n = 0; n < 256; n++) {
        e = n;
        for (var r = 0; r < 8; r++) {
            e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1
        }
        t[n] = e
    }
    return t
}();
t.exports = function(e, t) {
    if (typeof e === "undefined" || !e.length) {
        return 0
    }
    var n = typeof t !== "undefined" ? t : -1;
    for (var s = 0; s < e.length; s++) {
        n = n >>> 8 ^ r[(n ^ e[s]) & 255]
    }
    return ~n
}
},{}],20:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("../stream/GenericWorker");
var o = e("./crc32");

function i(e) {
    s.call(this, "Crc32Probe");
    this.crc32 = 0
}
r.inherits(i, s);
i.prototype.processChunk = function(e) {
    this.crc32 = o(e.data, this.crc32);
    this.push(e)
};
i.prototype.get_crc32 = function() {
    return this.crc32
};
t.exports = i
},{"../stream/GenericWorker":29,"../utils":32,"./crc32":19}],21:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("../stream/GenericWorker");

function o(e) {
    s.call(this, "DataLengthProbe for " + e);
    this.propName = e;
    this.withStreamInfo(e, 0)
}
r.inherits(o, s);
o.prototype.processChunk = function(e) {
    if (e.data) {
        var t = this.streamInfo[this.propName] || 0;
        this.streamInfo[this.propName] = t + e.data.length
    }
    s.prototype.processChunk.call(this, e)
};
t.exports = o
},{"../stream/GenericWorker":29,"../utils":32}],22:[function(e,t,n){
'use strict';
var r = e("../utils");

function s(e) {
    this.data = e;
    this.length = e.length;
    this.index = 0;
    this.zero = 0
}
s.prototype = {
    checkOffset: function(e) {
        this.checkIndex(this.index + e)
    },
    checkIndex: function(e) {
        if (this.length < this.zero + e || e < 0) {
            throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e + "). Corrupted zip ?")
        }
    },
    setIndex: function(e) {
        this.checkIndex(e);
        this.index = e
    },
    skip: function(e) {
        this.setIndex(this.index + e)
    },
    byteAt: function(e) {},
    readInt: function(e) {
        var t = 0,
            n;
        this.checkOffset(e);
        for (n = this.index + e - 1; n >= this.index; n--) {
            t = (t << 8) + this.byteAt(n)
        }
        this.index += e;
        return t
    },
    readString: function(e) {
        return r.transformTo("string", this.readData(e))
    },
    readData: function(e) {},
    lastIndexOfSignature: function(e) {},
    readAndCheckSignature: function(e) {},
    readDate: function() {
        var e = this.readInt(4);
        return new Date(Date.UTC((e >> 25 & 127) + 1980, (e >> 21 & 15) - 1, e >> 16 & 31, e >> 11 & 31, e >> 5 & 63, (31 & e) << 1))
    }
};
t.exports = s
},{"../utils":32}],23:[function(e,t,n){
'use strict';
var r = e("./DataReader");

function s(e) {
    r.call(this, e)
}
e("../utils").inherits(s, r);
s.prototype.byteAt = function(e) {
    return this.data[this.zero + e]
};
s.prototype.lastIndexOfSignature = function(e) {
    var t = e.charCodeAt(0),
        n = e.charCodeAt(1),
        r = e.charCodeAt(2),
        s = e.charCodeAt(3);
    for (var o = this.length - 4; o >= 0; --o) {
        if (this.data[o] === t && this.data[o + 1] === n && this.data[o + 2] === r && this.data[o + 3] === s) {
            return o - this.zero
        }
    }
    return -1
};
s.prototype.readAndCheckSignature = function(e) {
    var t = e.charCodeAt(0),
        n = e.charCodeAt(1),
        r = e.charCodeAt(2),
        s = e.charCodeAt(3),
        o = this.readData(4);
    return t === o[0] && n === o[1] && r === o[2] && s === o[3]
};
s.prototype.readData = function(e) {
    this.checkOffset(e);
    if (e === 0) {
        return new Uint8Array(0)
    }
    var t = this.data.subarray(this.zero + this.index, this.zero + this.index + e);
    this.index += e;
    return t
};
t.exports = s
},{"../utils":32,"./DataReader":24}],24:[function(e,t,n){
'use strict';
var r = e("../utils");

function s(e) {
    this.data = e;
    this.length = e.length;
    this.index = 0;
    this.zero = 0
}
s.prototype = {
    checkOffset: function(e) {
        this.checkIndex(this.index + e)
    },
    checkIndex: function(e) {
        if (this.length < this.zero + e || e < 0) {
            throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e + "). Corrupted zip ?")
        }
    },
    setIndex: function(e) {
        this.checkIndex(e);
        this.index = e
    },
    skip: function(e) {
        this.setIndex(this.index + e)
    },
    byteAt: function(e) {},
    readInt: function(e) {
        var t = 0,
            n;
        this.checkOffset(e);
        for (n = this.index + e - 1; n >= this.index; n--) {
            t = (t << 8) + this.byteAt(n)
        }
        this.index += e;
        return t
    },
    readString: function(e) {
        return r.transformTo("string", this.readData(e))
    },
    readData: function(e) {},
    lastIndexOfSignature: function(e) {},
    readAndCheckSignature: function(e) {},
    readDate: function() {
        var e = this.readInt(4);
        return new Date(Date.UTC((e >> 25 & 127) + 1980, (e >> 21 & 15) - 1, e >> 16 & 31, e >> 11 & 31, e >> 5 & 63, (31 & e) << 1))
    }
};
t.exports = s
},{"../utils":32}],25:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("./GenericWorker");
var o = e("../crc32");

function i(e) {
    s.call(this, "Crc32Probe");
    this.withStreamInfo("crc32", 0)
}
r.inherits(i, s);
i.prototype.processChunk = function(e) {
    this.streamInfo.crc32 = o(e.data, this.streamInfo.crc32);
    this.push(e)
};
t.exports = i
},{"../crc32":19,"../utils":32,"./GenericWorker":29}],26:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("./GenericWorker");

function o(e) {
    s.call(this, "DataLengthProbe for " + e);
    this.propName = e;
    this.withStreamInfo(e, 0)
}
r.inherits(o, s);
o.prototype.processChunk = function(e) {
    if (e.data) {
        var t = this.streamInfo[this.propName] || 0;
        this.streamInfo[this.propName] = t + e.data.length
    }
    s.prototype.processChunk.call(this, e)
};
t.exports = o
},{"../utils":32,"./GenericWorker":29}],27:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("./GenericWorker");
var o = e("../external");

function i(e) {
    s.call(this, "DataWorker");
    var t = this;
    this.dataIsReady = false;
    this.index = 0;
    this.max = 0;
    this.data = null;
    this.type = "";
    this._tickScheduled = false;
    e.then(function(e) {
        t.data = e;
        t.max = e.length;
        t.type = r.getTypeOf(e);
        t.dataIsReady = true;
        t._tick()
    }, function(e) {
        t.error(e)
    })
}
r.inherits(i, s);
i.prototype.cleanUp = function() {
    s.prototype.cleanUp.call(this);
    this.data = null
};
i.prototype.resume = function() {
    if (!s.prototype.resume.call(this)) {
        return false
    }
    if (!this._tickScheduled && this.dataIsReady) {
        this._tickScheduled = true;
        r.delay(this._tick, [], this)
    }
    return true
};
i.prototype._tick = function() {
    this._tickScheduled = false;
    if (this.isPaused || this.isFinished) {
        return false
    }
    var e = this.getRemainingData();
    var t = null,
        n = Math.min(this.max, this.index + 16384);
    if (this.index >= this.max) {
        return this.end()
    }
    switch (this.type) {
        case "string":
            t = e.substring(0, n);
            break;
        case "uint8array":
            t = e.subarray(0, n);
            break;
        case "array":
        case "nodebuffer":
            t = e.slice(0, n);
            break
    }
    this.index = n;
    this.push({
        data: t,
        meta: {
            percent: this.max ? this.index / this.max * 100 : 0
        }
    });
    if (this.index >= this.max) {
        this.end()
    } else {
        this._tick()
    }
    return true
};
i.prototype.getRemainingData = function() {
    var e = null;
    switch (this.type) {
        case "string":
            e = this.data.substring(this.index, this.max);
            break;
        case "uint8array":
            e = this.data.subarray(this.index, this.max);
            break;
        case "array":
            e = this.data.slice(this.index, this.max);
            break
    }
    return e
};
t.exports = i
},{"../external":6,"../utils":32,"./GenericWorker":29}],28:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("./GenericWorker");
var o = e("./StreamHelper");
var i = e("./DataWorker");
var a = e("../utf8");
var f = e("../base64");
var l = e("./TransformStream");

function h(e, t, n) {
    s.call(this, "StreamHelper");
    this.reader = e;
    this.reader.isPaused = false;
    this.reader.isFinished = false;
    this.reader.isError = false;
    var i = e._listeners["data"];
    if (!i || !i.length) {
        e.on("data", function(e) {
            this.push(e)
        })
    }
    var l = this,
        u = false;
    e.on("end", function() {
        l.push(null);
        l.isFinished = true;
        if (u) {
            l.flush()
        }
    }).on("error", function(e) {
        l.isError = true;
        l.error(e)
    });
    this._listeners = {};
    this._buffer = [];
    this._maxBufferSize = n || 16384;
    this.on("data", function(e) {
        if (l._buffer) {
            l._buffer.push(e)
        }
    });
    this.on("end", function() {
        u = true;
        if (l._buffer) {
            l.flush()
        }
    })
}
r.inherits(h, s);
h.prototype.pipe = function(e) {
    var t = new h(this.reader, null, this._maxBufferSize);
    var n = new o(this, null, this._maxBufferSize);
    this.on("data", function(e) {
        n.push(e)
    });
    this.on("end", function() {
        n.push(null)
    });
    var r = e;
    var s = new o(e, null, this._maxBufferSize);
    n.pipe(r).pipe(s);
    var i = new h(s, null, this._maxBufferSize);
    return i
};
h.prototype.accumulate = function(e) {
    var t = e || "string";
    var n = [];
    var r = new Promise(function(e, t) {
        this.on("data", function(e) {
            n.push(e.data)
        }).on("end", function() {
            if (t === "string") {
                e(a.decode(n.join("")))
            } else if (t === "text") {
                e(a.decode(n.join("")))
            } else if (t === "base64") {
                e(f.encode(n.join("")))
            } else if (t === "uint8array" || t === "arraybuffer" || t === "nodebuffer") {
                e(r.concat(n))
            } else if (t === "blob") {
                e(r.concat(n))
            }
            this.result = n;
            e(this.result)
        }).on("error", function(e) {
            t(e)
        })
    });
    return r
};
h.prototype.flush = function() {
    for (var e = 0; e < this._buffer.length; e++) {
        this.push(this._buffer[e])
    }
    this._buffer = null
};
h.prototype.transformTo = function(e, t) {
    var n = new l(e, t);
    this.on("data", function(e) {
        try {
            n.push(e.data)
        } catch (t) {
            n.error(t)
        }
    });
    this.on("end", function() {
        try {
            n.push(null)
        } catch (e) {
            n.error(e)
        }
    });
    var r = new o(n);
    return r
};
t.exports = h
},{"../base64":1,"../utf8":33,"../utils":32,"./DataWorker":27,"./GenericWorker":29,"./StreamHelper":28,"./TransformStream":31}],29:[function(e,t,n){
'use strict';
var r = e("../utils");

function s(e) {
    this.name = e || "default";
    this.streamInfo = {};
    this.isPaused = true;
    this.isFinished = false;
    this.isError = false;
    this._listeners = {
        data: [],
        end: [],
        error: []
    }
}
s.prototype = {
    push: function(e) {
        this.emit("data", e)
    },
    end: function() {
        if (this.isFinished) {
            return false
        }
        this.isFinished = true;
        this.emit("end");
        this.cleanUp();
        return true
    },
    error: function(e) {
        if (this.isError) {
            return false
        }
        this.isError = true;
        this.emit("error", e);
        this.cleanUp();
        return true
    },
    on: function(e, t) {
        if (!this._listeners[e]) {
            throw new Error("Unknown event: " + e)
        }
        this._listeners[e].push(t);
        return this
    },
    unpipe: function(e) {
        var t = this._listeners["data"];
        if (e) {
            var n = t.indexOf(e);
            if (n !== -1) {
                t.splice(n, 1)
            }
        } else {
            this._listeners["data"] = []
        }
        return this
    },
    pipe: function(e) {
        var t = function(t) {
            e.push(t)
        };
        this.on("data", t);
        e.unpipe = function() {
            var n = this._listeners["data"];
            var r = n.indexOf(t);
            if (r !== -1) {
                n.splice(r, 1)
            }
            return this
        };
        var n = this;
        this.on("end", function() {
            e.end()
        }).on("error", function(t) {
            e.error(t)
        });
        return e
    },
    cleanUp: function() {
        this.streamInfo = this._listeners = null
    },
    emit: function(e, t) {
        if (this._listeners[e]) {
            var n = this._listeners[e];
            for (var r = 0; r < n.length; r++) {
                n[r].call(this, t)
            }
        }
    },
    resume: function() {
        this.isPaused = false;
        return true
    },
    pause: function() {
        this.isPaused = true;
        return true
    },
    withStreamInfo: function(e, t) {
        this.streamInfo[e] = t;
        return this
    }
};
t.exports = s
},{"../utils":32}],30:[function(e,t,n){
'use strict';
n.base64 = true;
n.array = true;
n.string = true;
n.arraybuffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
n.nodebuffer = typeof Buffer !== "undefined";
n.uint8array = typeof Uint8Array !== "undefined";
if (typeof ArrayBuffer === "undefined") {
    n.blob = false
} else {
    var r = new ArrayBuffer(0);
    try {
        n.blob = new Blob([r], {
            type: "application/zip"
        }).size === 0
    } catch (s) {
        try {
            var o = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
            var i = new o;
            i.append(r);
            n.blob = i.getBlob("application/zip").size === 0
        } catch (a) {
            n.blob = false
        }
    }
}
},{}],31:[function(e,t,n){
'use strict';
var r = e("../utils");
var s = e("./GenericWorker");
var o = e("../utf8");
var i = e("../base64");
var a = e("../support");

function f(e, t) {
    s.call(this, "TransformStream");
    this.from = e;
    this.to = t;
    this.chunks = [];
    this.stringResult = "";
    this.uint8arrayResult = null;
    this.nodebufferResult = null;
    this.nodebufferTotalLen = 0
}
r.inherits(f, s);
f.prototype.processChunk = function(e) {
    var t;
    if (this.from === "string") {
        t = o.decode(e.data)
    } else if (this.from === "base64") {
        t = i.decode(e.data)
    } else if (this.from === "uint8array") {
        t = e.data
    } else {
        t = r.transformTo(this.from, e.data)
    }
    var n = this;
    var s = false;
    var f = false;
    if (this.to === "string") {
        this.stringResult += o.encode(t)
    } else if (this.to === "base64") {
        this.stringResult += i.encode(t)
    } else if (this.to === "uint8array") {
        this.chunks.push(t);
        this.uint8arrayResult = r.concat(this.chunks)
    } else if (this.to === "nodebuffer") {
        s = true;
        if (!a.nodebuffer) {
            throw new Error("nodebuffer is not supported by this browser")
        }
        var l = new Buffer(t.length);
        l.set(t, 0);
        this.nodebufferResult = this.nodebufferResult ? Buffer.concat([this.nodebufferResult, l]) : l
    }
    this.push({
        data: s ? this.nodebufferResult : this.uint8arrayResult || this.stringResult,
        meta: e.meta
    })
};
t.exports = f
},{"../base64":1,"../support":30,"../utf8":33,"../utils":32,"./GenericWorker":29}],32:[function(e,t,n){
'use strict';
var r = e("./support");
var s = e("./base64");
var o = e("./nodejsUtils");
var i = e("lie");

function a(e) {
    return Object.prototype.toString.call(e).slice(8, -1).toLowerCase()
}

function f(e, t) {
    var n = "";
    for (var r = 0; r < t.length; r++) {
        n += String.fromCharCode(t.charCodeAt(r) & e)
    }
    return n
}

function l(e, t) {
    var n = new(r.uint8array ? Uint8Array : Array)(e.length);
    for (var s = 0; s < e.length; s++) {
        n[s] = e.charCodeAt(s) & t
    }
    return n
}

function h(e) {
    return "Ðà¡±"
}

function u(e) {
    var t, n = e.length,
        r = "";
    for (t = 0; t < n; t++) {
        r += String.fromCharCode(e[t])
    }
    return r
}

function c(e) {
    var t, n = e.length,
        r = new Array(n);
    for (t = 0; t < n; t++) {
        r[t] = e.charCodeAt(t)
    }
    return r
}
n.inherits = function(e, t) {
    function n() {}
    n.prototype = t.prototype;
    e.prototype = new n;
    e.prototype.constructor = e
};
n.extend = function() {
    var e = {},
        t, n;
    for (t = 0; t < arguments.length; t++) {
        n = arguments[t];
        for (var r in n) {
            if (Object.prototype.hasOwnProperty.call(n, r)) {
                e[r] = n[r]
            }
        }
    }
    return e
};
n.isRegExp = function(e) {
    return a(e) === "regexp"
};
n.getTypeOf = function(e) {
    if (e === null || e === undefined) {
        return "null"
    }
    var t = a(e);
    if (t === "array" || t === "object" || t === "string") {
        return t
    }
    if (r.nodebuffer && o.isBuffer(e)) {
        return "nodebuffer"
    }
    if (r.uint8array && e instanceof Uint8Array) {
        return "uint8array"
    }
    if (r.arraybuffer && e instanceof ArrayBuffer) {
        return "arraybuffer"
    }
};
n.endsWith = function(e, t) {
    var n = String(e);
    t = String(t);
    var r = n.length;
    var s = t.length;
    var o;
    if (s > r) {
        return false
    }
    o = n.substring(r - s);
    return o === t
};
n.transformTo = function(e, t) {
    if (!t) {
        t = ""
    }
    if (e === "string") {
        return typeof t === "string" ? t : u(t)
    }
    if (e === "text") {
        return typeof t === "string" ? t : u(t)
    }
    if (e === "base64") {
        return typeof t === "string" ? s.encode(t) : s.encode(u(t))
    }
    if (e === "uint8array") {
        return typeof t === "string" ? l(t, 255) : t
    }
    if (e === "arraybuffer") {
        return n.transformTo("uint8array", t).buffer
    }
    if (e === "nodebuffer") {
        return o.newBuffer(n.transformTo("uint8array", t))
    }
    if (e === "array") {
        return typeof t === "string" ? c(t) : Array.prototype.slice.call(t, 0)
    }
    return t
};
n.concat = function(e) {
    var t = 0,
        n, s = 0,
        o = e[0],
        i;
    for (n = 0; n < e.length; n++) {
        t += e[n].length
    }
    if (r.uint8array) {
        i = new Uint8Array(t);
        for (n = 0; n < e.length; n++) {
            i.set(e[n], s);
            s += e[n].length
        }
    } else {
        if (o instanceof Array) {
            i = []
        } else {
            i = ""
        }
        for (n = 0; n < e.length; n++) {
            i = i.concat(e[n])
        }
    }
    return i
};
n.delay = function(e, t, n) {
    setTimeout(function() {
        e.apply(n || null, t || [])
    }, 0)
};
n.Promise = i;
n.dosToJSDate = function(e) {
    var t = e;
    var n = Math.floor(t / 65536);
    var r = t % 65536;
    var s = n >> 9;
    var o = (n & 511) >> 5;
    var i = n & 31;
    var a = r >> 11;
    var f = (r & 2047) >> 5;
    var l = (r & 31) * 2;
    return new Date(1980 + s, o - 1, i, a, f, l)
}
},
{"./base64":1,
"./nodejsUtils":15,
"./support":30,
"lie":37}],
33: [function(e, t, n) {
    "use strict";
    var r = e("./utils");
    var s = e("./support");
    var o = e("./base64");
    var i = "\x00";
    while (i.length < 16) {
        i += i
    }
    var a = {
        decode: function(e) {
            if (s.nodebuffer) {
                return e.toString("utf-8")
            }
            if (s.uint8array) {
                var t = new Uint8Array(e);
                var n = new r.transformTo("string", t);
                return decodeURIComponent(escape(n))
            }
            return e
        },
        encode: function(e) {
            if (s.nodebuffer) {
                return new Buffer(e, "utf-8")
            }
            if (s.uint8array) {
                var t = unescape(encodeURIComponent(e));
                var n = new Uint8Array(t.length);
                for (var o = 0; o < t.length; o++) {
                    n[o] = t.charCodeAt(o)
                }
                return n
            }
            return e
        },
        isUTF8: function(e) {
            var t, n, r, s, o, i = 0,
                a = e.length;
            for (o = 0; o < a; o++) {
                t = e.charCodeAt(o);
                if (t >= 240) {
                    n = e.charCodeAt(++o);
                    r = e.charCodeAt(++o);
                    s = e.charCodeAt(++o);
                    if (t >= 240 && t <= 247 && n >= 128 && n <= 191 && r >= 128 && r <= 191 && s >= 128 && s <= 191) {
                        i++
                    }
                } else if (t >= 224) {
                    n = e.charCodeAt(++o);
                    r = e.charCodeAt(++o);
                    if (t >= 224 && t <= 239 && n >= 128 && n <= 191 && r >= 128 && r <= 191) {
                        i++
                    }
                } else if (t >= 192) {
                    n = e.charCodeAt(++o);
                    if (t >= 192 && t <= 223 && n >= 128 && n <= 191) {
                        i++
                    }
                } else {
                    i++
                }
            }
            return i === a
        }
    };
    t.exports = a
}, {
    "./base64": 1,
    "./support": 30,
    "./utils": 32
}],
34: [function(e, t, n) {
    "use strict";
    var r = e("./reader/stringReader");
    var s = e("./reader/uint8ArrayReader");
    var o = e("./utf8");
    var i = e("./utils");
    var a = e("./compressions");
    var f = e("./crc32");
    var l = e("./stream/GenericWorker");
    var h = e("./date");
    var u = e("./support");
    var c = function(e, t) {
        this.options = e;
        this.streamInfo = t;
        this.name = e.name;
        this.dir = e.dir;
        this.date = e.date;
        this.comment = e.comment;
        this.unixPermissions = e.unixPermissions;
        this.dosPermissions = e.dosPermissions;
        this.compressedSize = 0;
        this.uncompressedSize = 0;
        this.crc32 = 0;
        this.compression = null;
        this.compressedContent = null;
        this.restOfHeader = null;
        this.extraFields = [];
        this.centralDirectory = false;
        this.offset = 0;
        this.fileOffset = 0
    };
    c.prototype = {
        load: function(e) {
            var t = e.reader,
                n = t.readString(4);
            if (n !== c.LOCAL_FILE_HEADER) {
                throw new Error("Corrupted zip: missing " + c.LOCAL_FILE_HEADER + " signature")
            }
            t.readString(2);
            var r = t.readString(2);
            var i = t.readString(2);
            var a = t.readString(2);
            var f = t.readInt(4);
            var l = t.readInt(4);
            var h = t.readInt(4);
            var d = t.readInt(2);
            var g = t.readInt(2);
            var m = o.isUTF8(r);
            if (!m) {
                this.name = o.decode(t.readString(d))
            } else {
                this.name = t.readString(d)
            }
            this.options.flags = r;
            this.options.date = a;
            this.options.compression = i;
            this.options.crc32 = f;
            this.options.compressedSize = l;
            this.options.uncompressedSize = h;
            var b = this.options.compression;
            var v = u.uint8array ? new Uint8Array(l) : new Array(l);
            t.readData(v);
            this.compressedContent = v;
            this.process()
        },
        fileheader: function() {
            var e;
            var t = this.name,
                n = this.comment || "",
                r = this.options.compression,
                s = r.magic;
            var i = new h(this.date);
            if (!u.nodebuffer && o.isUTF8(t)) {
                t = o.encode(t)
            }
            if (!u.nodebuffer && o.isUTF8(n)) {
                n = o.encode(n)
            }
            var a = "\n\0" + "\0" + i.dosTime + i.dosDate + f(o.decode(t)) + (this.dir ? "/" : "") + n;
            var l = 0;
            if (this.centralDirectory) {
                l = 65536 * (this.dir ? 16 : 0) + this.unixPermissions;
                a += "\0\0\0\0" + l + this.fileOffset
            }
            e = t.length;
            var c = n.length;
            var p = "";
            p += s;
            p += r.compressionOptions ? "\0" : "\0\0";
            p += i.dosTime;
            p += i.dosDate;
            p += this.crc32;
            p += this.compressedSize;
            p += this.uncompressedSize;
            p += e;
            p += this.extraFields.reduce(function(e, t) {
                return e + t.length
            }, 0);
            p = String.fromCharCode.apply(null, p);
            return p + t + this.extraFields.join("")
        },
        compress: function(e, t) {
            var n = this.options._data,
                r = new l("compression");
            var s = this;
            var o = new h(new Date);
            if (u.nodebuffer && n instanceof Buffer) {
                var i = new a(n);
                var c = new l("crc32");
                var p = new l("uncompressed size");
                var d = i.pipe(c).pipe(p);
                d.on("end", function() {
                    s.crc32 = c.get_crc32();
                    s.uncompressedSize = p.streamInfo["uncompressed size"]
                });
                return d.pipe(e.compressWorker(t))
            } else {
                return r
            }
        },
        process: function() {
            var e = new l("uncompress");
            var t = this,
                n = this.options.compression.uncompressWorker();
            n.on("data", function(e) {
                t.uncompressedContent = e.data
            }).on("end", function() {
                t.uncompressedSize = t.uncompressedContent.length;
                if (f(t.uncompressedContent) !== t.options.crc32) {
                    throw new Error("Bad compressed data")
                }
            }).on("error", function(e) {
                throw e
            });
            var r = new l("crc32");
            var s = new l("size");
            var o = new a(this.compressedContent);
            o.pipe(r).pipe(s).pipe(n);
            o.resume()
        },
        uncompress: function(e, t) {
            var n, r = this;
            if (!this.uncompressedContent) {
                var s = this.options.compression.uncompress(this.compressedContent, {
                    base64: true,
                    checkCRC32: false
                });
                if (s.error) {
                    throw s.error
                }
                this.uncompressedContent = s.data
            }
            n = i.transformTo(e || "string", this.uncompressedContent);
            return n
        }
    };
    c.LOCAL_FILE_HEADER = "PK";
    c.CENTRAL_FILE_HEADER = "PK";
    c.CENTRAL_DIRECTORY_END = "PK";
    c.EOCDR = function(e, t, n, r) {
        var s = new Array(22);
        for (var o = 0; o < 22; o++) {
            s[o] = 0
        }
        var i = e;
        var a = t;
        var f = n;
        var l = r.length;
        s[0] = i & 255;
        s[1] = i >> 8 & 255;
        s[2] = i & 255;
        s[3] = i >> 8 & 255;
        s[4] = a & 255;
        s[5] = a >> 8 & 255;
        s[6] = a >> 16 & 255;
        s[7] = a >> 24 & 255;
        s[8] = f & 255;
        s[9] = f >> 8 & 255;
        s[10] = f >> 16 & 255;
        s[11] = f >> 24 & 255;
        s[12] = l & 255;
        s[13] = l >> 8 & 255;
        return String.fromCharCode.apply(null, s) + r
    };
    t.exports = c
}, {
    "./compressions": 11,
    "./crc32": 19,
    "./date": 20,
    "./reader/stringReader": 17,
    "./reader/uint8ArrayReader": 23,
    "./stream/GenericWorker": 29,
    "./support": 30,
    "./utf8": 33,
    "./utils": 32
}],
35: [function(e, t, n) {
    "use strict";
    var r = e("../utils");
    var s = e("../common");
    var o = e("./adler32");
    var i = e("./crc32");
    var a = e("./trees");
    var f = 4,
        l = 0,
        h = 1,
        u = 2;

    function c(e) {
        if (!(this instanceof c)) return new c(e);
        this.options = s.assign({
            level: -1,
            method: 8,
            chunkSize: 16384,
            windowBits: 15,
            memLevel: 8,
            strategy: 0,
            wrapperType: 0
        }, e || {});
        var t = this.options;
        if (t.raw && t.windowBits > 0) {
            t.wrapperType = -t.windowBits
        } else if (t.gzip && t.windowBits > 0) {
            t.wrapperType = t.windowBits + 16
        } else if (t.windowBits < 0) {
            t.raw = true
        }
        this.err = 0;
        this.msg = "";
        this.ended = false;
        this.chunks = [];
        this.strm = {
            avail_in: 0,
            next_in: null,
            avail_out: 0,
            next_out: null,
            total_in: 0,
            total_out: 0,
            msg: "",
            state: null,
            zalloc: function(e, t, n) {
                var r = new Array(n);
                for (var s = 0; s < n; s++) {
                    r[s] = 0
                }
                return r
            },
            zfree: function() {},
            adler: 0
        };
        var n = a.deflateInit2(this.strm, t.level, t.method, t.windowBits, t.memLevel, t.strategy);
        if (n !== l) {
            throw new Error(this.strm.msg)
        }
        if (t.header) {
            a.deflateSetHeader(this.strm, t.header)
        }
        if (t.dictionary) {
            var r;
            if (typeof t.dictionary === "string") {
                r = t.dictionary.split("")
            } else if (Object.prototype.toString.call(t.dictionary) === "[object ArrayBuffer]") {
                r = new Uint8Array(t.dictionary)
            } else {
                r = t.dictionary
            }
            n = a.deflateSetDictionary(this.strm, r);
            if (n !== l) {
                throw new Error(this.strm.msg)
            }
            this._dict_set = true
        }
    }
    c.prototype.push = function(e, t) {
        var n, o, c = this.strm,
            p = this.options.chunkSize;
        if (this.ended) {
            return false
        }
        o = t === ~~t ? t : t === true ? f : 4;
        if (typeof e === "string") {
            c.next_in = r.string2buf(e)
        } else if (Object.prototype.toString.call(e) === "[object ArrayBuffer]") {
            c.next_in = new Uint8Array(e)
        } else {
            c.next_in = e
        }
        c.avail_in = c.next_in.length;
        for (;;) {
            if (c.avail_out === 0) {
                c.avail_out = p;
                c.next_out = new r.Buf8(p)
            }
            n = a.deflate(c, o);
            if (n === h) {
                if (c.avail_out > 0) {
                    this.onData(r.shrinkBuf(c.next_out, c.next_out.length - c.avail_out))
                }
                c.avail_out = 0;
                if (o === f) {
                    this.ended = true;
                    this.onEnd(0);
                    return true
                }
                if (o === 4) {
                    return true
                }
            } else if (n === l) {
                if (c.avail_out > 0) {
                    this.onData(r.shrinkBuf(c.next_out, c.next_out.length - c.avail_out))
                }
                c.avail_out = 0;
                if (c.avail_in === 0 && (o === f || o === 4)) {
                    if (o === 4) {
                        this.onData(r.shrinkBuf(c.next_out, c.next_out.length - c.avail_out))
                    }
                    if (o === f) {
                        this.ended = true;
                        this.onEnd(0)
                    }
                    return true
                }
            } else {
                this.onEnd(n);
                this.ended = true;
                return false
            }
        }
    };
    c.prototype.onData = function(e) {
        this.chunks.push(e)
    };
    c.prototype.onEnd = function(e) {
        if (e === l) {
            this.result = r.flattenChunks(this.chunks)
        }
        this.chunks = [];
        this.err = e;
        this.msg = this.strm.msg
    };

    function p(e, t) {
        var n = new c(t);
        n.push(e, true);
        if (n.err) {
            throw n.msg
        }
        return n.result
    }

    function d(e, t) {
        t = t || {};
        t.raw = true;
        return p(e, t)
    }

    function g(e, t) {
        t = t || {};
        t.gzip = true;
        return p(e, t)
    }
    n.Deflate = c;
    n.deflate = p;
    n.deflateRaw = d;
    n.gzip = g
}, {
    "../common": 7,
    "../utils": 32,
    "./adler32": 36,
    "./crc32": 19,
    "./trees": 20
}],
36: [function(e, t, n) {
    "use strict";
    var r = 1,
        s = 0;

    function o(e) {
        var t = 1,
            n = 0;
        for (var r = 0, s = e.length; r < s; r++) {
            t = (t + e[r]) % 65521;
            n = (n + t) % 65521
        }
        return n << 16 | t
    }

    function i(e, t) {
        var n = e & 65535,
            o = e >>> 16;
        for (var i = 0, a = t.length; i < a; i++) {
            n = (n + t[i]) % 65521;
            o = (o + n) % 65521
        }
        return o << 16 | n
    }
    var a = {
        adler32: o,
        adler32_combine: i
    };
    t.exports = a
}, {}],
37: [function(e, t, n) {
    'use strict';
    var r = e("./utils");
    var s = e("./nextTick");
    var o = e("./builtins");
    var i = e("./Promise.prototype");
    var a = r.noop;

    function f(e) {
        var t;
        if (typeof this !== "object") {
            throw new TypeError("Promises must be constructed via new")
        }
        if (typeof e !== "function") {
            throw new TypeError("not a function")
        }
        this._state = null;
        this._value = null;
        this._deferreds = [];
        try {
            e(function(e) {
                t = true;
                l(this, e)
            }.bind(this), function(e) {
                t = true;
                h(this, e)
            }.bind(this))
        } catch (n) {
            if (t) {
                return
            }
            h(this, n)
        }
    }

    function l(e, t) {
        if (e._state !== null) {
            return
        }
        try {
            if (t === e) throw new TypeError("A promise cannot be resolved with itself.");
            if (r.isObject(t) || r.isFunction(t)) {
                var n = t.then;
                if (r.isFunction(n)) {
                    u(n.bind(t), e);
                    return
                }
            }
            e._state = true;
            e._value = t;
            c(e)
        } catch (s) {
            h(e, s)
        }
    }

    function h(e, t) {
        if (e._state !== null) {
            return
        }
        e._state = false;
        e._value = t;
        c(e)
    }

    function u(e, t) {
        var n = false;
        try {
            e(function(e) {
                if (n) {
                    return
                }
                n = true;
                l(t, e)
            }, function(e) {
                if (n) {
                    return
                }
                n = true;
                h(t, e)
            })
        } catch (r) {
            if (n) {
                return
            }
            n = true;
            h(t, r)
        }
    }

    function c(e) {
        if (e._state === null) {
            return
        }
        s(function() {
            var t = e._deferreds;
            for (var n = 0; n < t.length; n++) {
                p(e, t[n])
            }
            e._deferreds = null
        })
    }

    function p(e, t) {
        s(function() {
            var n;
            try {
                n = t.onFulfilled(e._value)
            } catch (r) {
                h(t.promise, r);
                return
            }
            l(t.promise, n)
        })
    }
    f.prototype.catch = i.catch;
    f.prototype.then = i.then;
    f.all = o.all;
    f.resolve = o.resolve;
    f.reject = o.reject;
    f.race = o.race;
    t.exports = f
}, {
    "./Promise.prototype": 18,
    "./builtins": 19,
    "./nextTick": 20,
    "./utils": 21
}],
38: [function(e, t, n) {
    var r = {
        "function": true,
        object: true
    };
    var s;
    if (r[typeof window]) {
        s = window
    } else if (r[typeof self]) {
        s = self
    }
    t.exports = s
}, {}]
}, {}, [1])(1)
});