/**
 * Copyright 2010 Tim Down.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * jshashtable
 *
 * jshashtable is a JavaScript implementation of a hash table. It creates a single constructor function called Hashtable
 * in the global scope.
 *
 * Author: Tim Down <tim@timdown.co.uk>
 * Version: 2.1
 * Build date: 21 March 2010
 * Website: http://www.timdown.co.uk/jshashtable
 */

var Hashtable = (function() {
	var FUNCTION = "function";

	var arrayRemoveAt = (typeof Array.prototype.splice == FUNCTION) ?
		function(arr, idx) {
			arr.splice(idx, 1);
		} :

		function(arr, idx) {
			var itemsAfterDeleted, i, len;
			if (idx === arr.length - 1) {
				arr.length = idx;
			} else {
				itemsAfterDeleted = arr.slice(idx + 1);
				arr.length = idx;
				for (i = 0, len = itemsAfterDeleted.length; i < len; ++i) {
					arr[idx + i] = itemsAfterDeleted[i];
				}
			}
		};

	function hashObject(obj) {
		var hashCode;
		if (typeof obj == "string") {
			return obj;
		} else if (typeof obj.hashCode == FUNCTION) {
			// Check the hashCode method really has returned a string
			hashCode = obj.hashCode();
			return (typeof hashCode == "string") ? hashCode : hashObject(hashCode);
		} else if (typeof obj.toString == FUNCTION) {
			return obj.toString();
		} else {
			try {
				return String(obj);
			} catch (ex) {
				// For host objects (such as ActiveObjects in IE) that have no toString() method and throw an error when
				// passed to String()
				return Object.prototype.toString.call(obj);
			}
		}
	}

	function equals_fixedValueHasEquals(fixedValue, variableValue) {
		return fixedValue.equals(variableValue);
	}

	function equals_fixedValueNoEquals(fixedValue, variableValue) {
		return (typeof variableValue.equals == FUNCTION) ?
			   variableValue.equals(fixedValue) : (fixedValue === variableValue);
	}

	function createKeyValCheck(kvStr) {
		return function(kv) {
			if (kv === null) {
				throw new Error("null is not a valid " + kvStr);
			} else if (typeof kv == "undefined") {
				throw new Error(kvStr + " must not be undefined");
			}
		};
	}

	var checkKey = createKeyValCheck("key"), checkValue = createKeyValCheck("value");

	/*----------------------------------------------------------------------------------------------------------------*/

	function Bucket(hash, firstKey, firstValue, equalityFunction) {
        this[0] = hash;
		this.entries = [];
		this.addEntry(firstKey, firstValue);

		if (equalityFunction !== null) {
			this.getEqualityFunction = function() {
				return equalityFunction;
			};
		}
	}

	var EXISTENCE = 0, ENTRY = 1, ENTRY_INDEX_AND_VALUE = 2;

	function createBucketSearcher(mode) {
		return function(key) {
			var i = this.entries.length, entry, equals = this.getEqualityFunction(key);
			while (i--) {
				entry = this.entries[i];
				if ( equals(key, entry[0]) ) {
					switch (mode) {
						case EXISTENCE:
							return true;
						case ENTRY:
							return entry;
						case ENTRY_INDEX_AND_VALUE:
							return [ i, entry[1] ];
					}
				}
			}
			return false;
		};
	}

	function createBucketLister(entryProperty) {
		return function(aggregatedArr) {
			var startIndex = aggregatedArr.length;
			for (var i = 0, len = this.entries.length; i < len; ++i) {
				aggregatedArr[startIndex + i] = this.entries[i][entryProperty];
			}
		};
	}

	Bucket.prototype = {
		getEqualityFunction: function(searchValue) {
			return (typeof searchValue.equals == FUNCTION) ? equals_fixedValueHasEquals : equals_fixedValueNoEquals;
		},

		getEntryForKey: createBucketSearcher(ENTRY),

		getEntryAndIndexForKey: createBucketSearcher(ENTRY_INDEX_AND_VALUE),

		removeEntryForKey: function(key) {
			var result = this.getEntryAndIndexForKey(key);
			if (result) {
				arrayRemoveAt(this.entries, result[0]);
				return result[1];
			}
			return null;
		},

		addEntry: function(key, value) {
			this.entries[this.entries.length] = [key, value];
		},

		keys: createBucketLister(0),

		values: createBucketLister(1),

		getEntries: function(entries) {
			var startIndex = entries.length;
			for (var i = 0, len = this.entries.length; i < len; ++i) {
				// Clone the entry stored in the bucket before adding to array
				entries[startIndex + i] = this.entries[i].slice(0);
			}
		},

		containsKey: createBucketSearcher(EXISTENCE),

		containsValue: function(value) {
			var i = this.entries.length;
			while (i--) {
				if ( value === this.entries[i][1] ) {
					return true;
				}
			}
			return false;
		}
	};

	/*----------------------------------------------------------------------------------------------------------------*/

	// Supporting functions for searching hashtable buckets

	function searchBuckets(buckets, hash) {
		var i = buckets.length, bucket;
		while (i--) {
			bucket = buckets[i];
			if (hash === bucket[0]) {
				return i;
			}
		}
		return null;
	}

	function getBucketForHash(bucketsByHash, hash) {
		var bucket = bucketsByHash[hash];

		// Check that this is a genuine bucket and not something inherited from the bucketsByHash's prototype
		return ( bucket && (bucket instanceof Bucket) ) ? bucket : null;
	}

	/*----------------------------------------------------------------------------------------------------------------*/

	function Hashtable(hashingFunctionParam, equalityFunctionParam) {
		var that = this;
		var buckets = [];
		var bucketsByHash = {};

		var hashingFunction = (typeof hashingFunctionParam == FUNCTION) ? hashingFunctionParam : hashObject;
		var equalityFunction = (typeof equalityFunctionParam == FUNCTION) ? equalityFunctionParam : null;

		this.put = function(key, value) {
			checkKey(key);
			checkValue(value);
			var hash = hashingFunction(key), bucket, bucketEntry, oldValue = null;

			// Check if a bucket exists for the bucket key
			bucket = getBucketForHash(bucketsByHash, hash);
			if (bucket) {
				// Check this bucket to see if it already contains this key
				bucketEntry = bucket.getEntryForKey(key);
				if (bucketEntry) {
					// This bucket entry is the current mapping of key to value, so replace old value and we're done.
					oldValue = bucketEntry[1];
					bucketEntry[1] = value;
				} else {
					// The bucket does not contain an entry for this key, so add one
					bucket.addEntry(key, value);
				}
			} else {
				// No bucket exists for the key, so create one and put our key/value mapping in
				bucket = new Bucket(hash, key, value, equalityFunction);
				buckets[buckets.length] = bucket;
				bucketsByHash[hash] = bucket;
			}
			return oldValue;
		};

		this.get = function(key) {
			checkKey(key);

			var hash = hashingFunction(key);

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, hash);
			if (bucket) {
				// Check this bucket to see if it contains this key
				var bucketEntry = bucket.getEntryForKey(key);
				if (bucketEntry) {
					// This bucket entry is the current mapping of key to value, so return the value.
					return bucketEntry[1];
				}
			}
			return null;
		};

		this.containsKey = function(key) {
			checkKey(key);
			var bucketKey = hashingFunction(key);

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, bucketKey);

			return bucket ? bucket.containsKey(key) : false;
		};

		this.containsValue = function(value) {
			checkValue(value);
			var i = buckets.length;
			while (i--) {
				if (buckets[i].containsValue(value)) {
					return true;
				}
			}
			return false;
		};

		this.clear = function() {
			buckets.length = 0;
			bucketsByHash = {};
		};

		this.isEmpty = function() {
			return !buckets.length;
		};

		var createBucketAggregator = function(bucketFuncName) {
			return function() {
				var aggregated = [], i = buckets.length;
				while (i--) {
					buckets[i][bucketFuncName](aggregated);
				}
				return aggregated;
			};
		};

		this.keys = createBucketAggregator("keys");
		this.values = createBucketAggregator("values");
		this.entries = createBucketAggregator("getEntries");

		this.remove = function(key) {
			checkKey(key);

			var hash = hashingFunction(key), bucketIndex, oldValue = null;

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, hash);

			if (bucket) {
				// Remove entry from this bucket for this key
				oldValue = bucket.removeEntryForKey(key);
				if (oldValue !== null) {
					// Entry was removed, so check if bucket is empty
					if (!bucket.entries.length) {
						// Bucket is empty, so remove it from the bucket collections
						bucketIndex = searchBuckets(buckets, hash);
						arrayRemoveAt(buckets, bucketIndex);
						delete bucketsByHash[hash];
					}
				}
			}
			return oldValue;
		};

		this.size = function() {
			var total = 0, i = buckets.length;
			while (i--) {
				total += buckets[i].entries.length;
			}
			return total;
		};

		this.each = function(callback) {
			var entries = that.entries(), i = entries.length, entry;
			while (i--) {
				entry = entries[i];
				callback(entry[0], entry[1]);
			}
		};

		this.putAll = function(hashtable, conflictCallback) {
			var entries = hashtable.entries();
			var entry, key, value, thisValue, i = entries.length;
			var hasConflictCallback = (typeof conflictCallback == FUNCTION);
			while (i--) {
				entry = entries[i];
				key = entry[0];
				value = entry[1];

				// Check for a conflict. The default behaviour is to overwrite the value for an existing key
				if ( hasConflictCallback && (thisValue = that.get(key)) ) {
					value = conflictCallback(key, thisValue, value);
				}
				that.put(key, value);
			}
		};

		this.clone = function() {
			var clone = new Hashtable(hashingFunctionParam, equalityFunctionParam);
			clone.putAll(that);
			return clone;
		};
	}

	return Hashtable;
})();
/**
 * A Javascript object to encode and/or decode html characters using HTML or Numeric entities that handles double or partial encoding
 * Author: R Reid
 * source: http://www.strictly-software.com/htmlencode
 * Licences: GPL, The MIT License (MIT)
 * Copyright: (c) 2011 Robert Reid - Strictly-Software.com
 */

Encoder={EncodeType:"entity",isEmpty:function(val){return val?val===null||val.length==0||/^\s+$/.test(val):true},arr1:["&nbsp;","&iexcl;","&cent;","&pound;","&curren;","&yen;","&brvbar;","&sect;","&uml;","&copy;","&ordf;","&laquo;","&not;","&shy;","&reg;","&macr;","&deg;","&plusmn;","&sup2;","&sup3;","&acute;","&micro;","&para;","&middot;","&cedil;","&sup1;","&ordm;","&raquo;","&frac14;","&frac12;","&frac34;","&iquest;","&Agrave;","&Aacute;","&Acirc;","&Atilde;","&Auml;","&Aring;","&AElig;","&Ccedil;","&Egrave;","&Eacute;","&Ecirc;","&Euml;","&Igrave;","&Iacute;","&Icirc;","&Iuml;","&ETH;","&Ntilde;","&Ograve;","&Oacute;","&Ocirc;","&Otilde;","&Ouml;","&times;","&Oslash;","&Ugrave;","&Uacute;","&Ucirc;","&Uuml;","&Yacute;","&THORN;","&szlig;","&agrave;","&aacute;","&acirc;","&atilde;","&auml;","&aring;","&aelig;","&ccedil;","&egrave;","&eacute;","&ecirc;","&euml;","&igrave;","&iacute;","&icirc;","&iuml;","&eth;","&ntilde;","&ograve;","&oacute;","&ocirc;","&otilde;","&ouml;","&divide;","&oslash;","&ugrave;","&uacute;","&ucirc;","&uuml;","&yacute;","&thorn;","&yuml;","&quot;","&amp;","&lt;","&gt;","&OElig;","&oelig;","&Scaron;","&scaron;","&Yuml;","&circ;","&tilde;","&ensp;","&emsp;","&thinsp;","&zwnj;","&zwj;","&lrm;","&rlm;","&ndash;","&mdash;","&lsquo;","&rsquo;","&sbquo;","&ldquo;","&rdquo;","&bdquo;","&dagger;","&Dagger;","&permil;","&lsaquo;","&rsaquo;","&euro;","&fnof;","&Alpha;","&Beta;","&Gamma;","&Delta;","&Epsilon;","&Zeta;","&Eta;","&Theta;","&Iota;","&Kappa;","&Lambda;","&Mu;","&Nu;","&Xi;","&Omicron;","&Pi;","&Rho;","&Sigma;","&Tau;","&Upsilon;","&Phi;","&Chi;","&Psi;","&Omega;","&alpha;","&beta;","&gamma;","&delta;","&epsilon;","&zeta;","&eta;","&theta;","&iota;","&kappa;","&lambda;","&mu;","&nu;","&xi;","&omicron;","&pi;","&rho;","&sigmaf;","&sigma;","&tau;","&upsilon;","&phi;","&chi;","&psi;","&omega;","&thetasym;","&upsih;","&piv;","&bull;","&hellip;","&prime;","&Prime;","&oline;","&frasl;","&weierp;","&image;","&real;","&trade;","&alefsym;","&larr;","&uarr;","&rarr;","&darr;","&harr;","&crarr;","&lArr;","&uArr;","&rArr;","&dArr;","&hArr;","&forall;","&part;","&exist;","&empty;","&nabla;","&isin;","&notin;","&ni;","&prod;","&sum;","&minus;","&lowast;","&radic;","&prop;","&infin;","&ang;","&and;","&or;","&cap;","&cup;","&int;","&there4;","&sim;","&cong;","&asymp;","&ne;","&equiv;","&le;","&ge;","&sub;","&sup;","&nsub;","&sube;","&supe;","&oplus;","&otimes;","&perp;","&sdot;","&lceil;","&rceil;","&lfloor;","&rfloor;","&lang;","&rang;","&loz;","&spades;","&clubs;","&hearts;","&diams;"],arr2:["&#160;","&#161;","&#162;","&#163;","&#164;","&#165;","&#166;","&#167;","&#168;","&#169;","&#170;","&#171;","&#172;","&#173;","&#174;","&#175;","&#176;","&#177;","&#178;","&#179;","&#180;","&#181;","&#182;","&#183;","&#184;","&#185;","&#186;","&#187;","&#188;","&#189;","&#190;","&#191;","&#192;","&#193;","&#194;","&#195;","&#196;","&#197;","&#198;","&#199;","&#200;","&#201;","&#202;","&#203;","&#204;","&#205;","&#206;","&#207;","&#208;","&#209;","&#210;","&#211;","&#212;","&#213;","&#214;","&#215;","&#216;","&#217;","&#218;","&#219;","&#220;","&#221;","&#222;","&#223;","&#224;","&#225;","&#226;","&#227;","&#228;","&#229;","&#230;","&#231;","&#232;","&#233;","&#234;","&#235;","&#236;","&#237;","&#238;","&#239;","&#240;","&#241;","&#242;","&#243;","&#244;","&#245;","&#246;","&#247;","&#248;","&#249;","&#250;","&#251;","&#252;","&#253;","&#254;","&#255;","&#34;","&#38;","&#60;","&#62;","&#338;","&#339;","&#352;","&#353;","&#376;","&#710;","&#732;","&#8194;","&#8195;","&#8201;","&#8204;","&#8205;","&#8206;","&#8207;","&#8211;","&#8212;","&#8216;","&#8217;","&#8218;","&#8220;","&#8221;","&#8222;","&#8224;","&#8225;","&#8240;","&#8249;","&#8250;","&#8364;","&#402;","&#913;","&#914;","&#915;","&#916;","&#917;","&#918;","&#919;","&#920;","&#921;","&#922;","&#923;","&#924;","&#925;","&#926;","&#927;","&#928;","&#929;","&#931;","&#932;","&#933;","&#934;","&#935;","&#936;","&#937;","&#945;","&#946;","&#947;","&#948;","&#949;","&#950;","&#951;","&#952;","&#953;","&#954;","&#955;","&#956;","&#957;","&#958;","&#959;","&#960;","&#961;","&#962;","&#963;","&#964;","&#965;","&#966;","&#967;","&#968;","&#969;","&#977;","&#978;","&#982;","&#8226;","&#8230;","&#8242;","&#8243;","&#8254;","&#8260;","&#8472;","&#8465;","&#8476;","&#8482;","&#8501;","&#8592;","&#8593;","&#8594;","&#8595;","&#8596;","&#8629;","&#8656;","&#8657;","&#8658;","&#8659;","&#8660;","&#8704;","&#8706;","&#8707;","&#8709;","&#8711;","&#8712;","&#8713;","&#8715;","&#8719;","&#8721;","&#8722;","&#8727;","&#8730;","&#8733;","&#8734;","&#8736;","&#8743;","&#8744;","&#8745;","&#8746;","&#8747;","&#8756;","&#8764;","&#8773;","&#8776;","&#8800;","&#8801;","&#8804;","&#8805;","&#8834;","&#8835;","&#8836;","&#8838;","&#8839;","&#8853;","&#8855;","&#8869;","&#8901;","&#8968;","&#8969;","&#8970;","&#8971;","&#9001;","&#9002;","&#9674;","&#9824;","&#9827;","&#9829;","&#9830;"],HTML2Numerical:function(s){return this.swapArrayVals(s,this.arr1,this.arr2)},NumericalToHTML:function(s){return this.swapArrayVals(s,this.arr2,this.arr1)},numEncode:function(s){if(this.isEmpty(s))return"";for(var e="",i=0;i<s.length;i++){var c=s.charAt(i);if(c<" "||c>"~")c="&#"+c.charCodeAt()+";";e+=c}return e},htmlDecode:function(s){var c,m,d=s;if(this.isEmpty(d))return"";d=this.HTML2Numerical(d);arr=d.match(/&#[0-9]{1,5};/g);if(arr!=null)for(var x=0;x<arr.length;x++){m=arr[x];c=m.substring(2,m.length-1);if(c>=-32768&&c<=65535)d=d.replace(m,String.fromCharCode(c));else d=d.replace(m,"")}return d},htmlEncode:function(s,dbl){if(this.isEmpty(s))return"";dbl=dbl||false;if(dbl)if(this.EncodeType=="numerical")s=s.replace(/&/g,"&#38;");else s=s.replace(/&/g,"&amp;");s=this.XSSEncode(s,false);if(this.EncodeType=="numerical"||!dbl)s=this.HTML2Numerical(s);s=this.numEncode(s);if(!dbl){s=s.replace(/&#/g,"##AMPHASH##");if(this.EncodeType=="numerical")s=s.replace(/&/g,"&#38;");else s=s.replace(/&/g,"&amp;");s=s.replace(/##AMPHASH##/g,"&#")}s=s.replace(/&#\d*([^\d;]|$)/g,"$1");if(!dbl)s=this.correctEncoding(s);if(this.EncodeType=="entity")s=this.NumericalToHTML(s);return s},XSSEncode:function(s,en){if(!this.isEmpty(s)){en=en||true;if(en){s=s.replace(/\'/g,"&#39;");s=s.replace(/\"/g,"&quot;");s=s.replace(/</g,"&lt;");s=s.replace(/>/g,"&gt;")}else{s=s.replace(/\'/g,"&#39;");s=s.replace(/\"/g,"&#34;");s=s.replace(/</g,"&#60;");s=s.replace(/>/g,"&#62;")}return s}else return""},hasEncoded:function(s){return/&#[0-9]{1,5};/g.test(s)?true:/&[A-Z]{2,6};/gi.test(s)?true:false},stripUnicode:function(s){return s.replace(/[^\x20-\x7E]/g,"")},correctEncoding:function(s){return s.replace(/(&amp;)(amp;)+/,"$1")},swapArrayVals:function(s,arr1,arr2){if(this.isEmpty(s))return"";var re;if(arr1&&arr2)if(arr1.length==arr2.length)for(var x=0,i=arr1.length;x<i;x++){re=new RegExp(arr1[x],"g");s=s.replace(re,arr2[x])}return s},inArray:function(item,arr){for(var i=0,x=arr.length;i<x;i++)if(arr[i]===item)return i;return-1}}
//Note: Microsoft Corporation is not the original author of this script file. Microsoft obtained the original file from http://dev.iceburg.net/jquery/jqModal/ under the license that is referred to below. That license and the other notices below are provided for informational purposes only and are not the license terms under which Microsoft distributes this file. Microsoft grants you the right to use this file for the sole purpose of either: (i) interacting through your browser with the Microsoft web site hosting this file, subject to that web site’s terms of use; or (ii) using this file in conjunction with the Microsoft product with which it was distributed subject to that product’s End User License Agreement. Microsoft reserves all other rights and grants no additional rights, whether by implication, estoppel or otherwise.

/*
* jqModal - Minimalist Modaling with jQuery
*   (http://dev.iceburg.net/jquery/jqModal/)
*
* Copyright (c) 2007,2008 Brice Burgess <bhb@iceburg.net>
* Dual licensed under the MIT and GPL licenses:
*   http://www.opensource.org/licenses/mit-license.php
*   http://www.gnu.org/licenses/gpl.html
* 
* $Version: 03/01/2009 +r14
*/
; (function ($) {
    $.fn.jqm = function (o) {
        var p = {
            overlay: 50,
            overlayClass: 'jqmOverlay',
            closeClass: 'jqmClose',
            trigger: '.jqModal',
            ajax: F,
            ajaxText: '',
            target: F,
            modal: F,
            toTop: F,
            onShow: F,
            onHide: F,
            onLoad: F
        };
        return this.each(function () {
            if (this._jqm) return H[this._jqm].c = $.extend({}, H[this._jqm].c, o); s++; this._jqm = s;
            H[s] = { c: $.extend(p, $.jqm.params, o), a: F, w: $(this).addClass('jqmID' + s), s: s };
            if (p.trigger) $(this).jqmAddTrigger(p.trigger);
        });
    };

    $.fn.jqmAddClose = function (e) { return hs(this, e, 'jqmHide'); };
    $.fn.jqmAddTrigger = function (e) { return hs(this, e, 'jqmShow'); };
    $.fn.jqmShow = function (t) { return this.each(function () { t = t || window.event; $.jqm.open(this._jqm, t); }); };
    $.fn.jqmHide = function (t) { return this.each(function () { t = t || window.event; $.jqm.close(this._jqm, t) }); };

    $.jqm = {
        hash: {},
        open: function (s, t) {
            var h = H[s], c = h.c, cc = '.' + c.closeClass, z = (parseInt(h.w.css('z-index'))), z = (z > 0) ? z : 3000, o = $('<div></div>').css({ height: '100%', width: '100%', position: 'fixed', left: 0, top: 0, 'z-index': z - 1, opacity: c.overlay / 100 }); if (h.a) return F; h.t = t; h.a = true; h.w.css('z-index', z);
            if (c.modal) { if (!A[0]) L('bind'); A.push(s); }
            else if (c.overlay > 0) h.w.jqmAddClose(o);
            else o = F;

            h.o = (o) ? o.addClass(c.overlayClass).prependTo('body') : F;
            if (ie6) { $('html,body').css({ height: '100%', width: '100%' }); if (o) { o = o.css({ position: 'absolute' })[0]; for (var y in { Top: 1, Left: 1 }) o.style.setExpression(y.toLowerCase(), "(_=(document.documentElement.scroll" + y + " || document.body.scroll" + y + "))+'px'"); } }

            if (c.ajax) {
                var r = c.target || h.w, u = c.ajax, r = (typeof r == 'string') ? $(r, h.w) : $(r), u = (u.substr(0, 1) == '@') ? $(t).attr(u.substring(1)) : u;
                r.html(c.ajaxText).load(u, function () { if (c.onLoad) c.onLoad.call(this, h); if (cc) h.w.jqmAddClose($(cc, h.w)); e(h); });
            }
            else if (cc) h.w.jqmAddClose($(cc, h.w));

            if (c.toTop && h.o) h.w.before('<span id="jqmP' + h.w[0]._jqm + '"></span>').insertAfter(h.o);
            (c.onShow) ? c.onShow(h) : h.w.show(); e(h); return F;
        },
        close: function (s) {
            var h = H[s]; if (!h.a) return F; h.a = F;
            if (A[0]) { A.pop(); if (!A[0]) L('unbind'); }
            if (h.c.toTop && h.o) $('#jqmP' + h.w[0]._jqm).after(h.w).remove();
            if (h.c.onHide) h.c.onHide(h); else { h.w.hide(); if (h.o) h.o.remove(); } return F;
        },
        params: {}
    };
    var s = 0, H = $.jqm.hash, A = [], ie6 = $.browser.msie && ($.browser.version == "6.0"), F = false,
i = $('<iframe src="javascript:false;document.write(\'\');" class="jqm"></iframe>').css({ opacity: 0 }),
e = function (h) { if (ie6) if (h.o) h.o.html('<p style="width:100%;height:100%"/>').prepend(i); else if (!$('iframe.jqm', h.w)[0]) h.w.prepend(i); f(h); },
f = function (h) { try { $(':input:visible', h.w)[0].focus(); } catch (_) { } },
L = function (t) { $()[t]("keypress", m)[t]("keydown", m)[t]("mousedown", m); },
m = function (e) { var h = H[A[A.length - 1]], r = (!$(e.target).parents('.jqmID' + h.s)[0]); if (r) f(h); return !r; },
hs = function (w, t, c) {
    return w.each(function () {
        var s = this._jqm; $(t).each(function () {
            if (!this[c]) { this[c] = []; $(this).click(function () { for (var i in { jqmShow: 1, jqmHide: 1 }) for (var s in this[i]) if (H[this[i][s]]) H[this[i][s]].w[i](this); return F; }); } this[c].push(s);
        });
    });
};
})(jQuery);
//Note: Microsoft Corporation is not the original author of this script file. Microsoft obtained the original file from http://benalman.com/projects/jquery-bbq-plugin/ under the license that is referred to below. That license and the other notices below are provided for informational purposes only and are not the license terms under which Microsoft distributes this file. Microsoft grants you the right to use this file for the sole purpose of either: (i) interacting through your browser with the Microsoft web site hosting this file, subject to that web site�s terms of use; or (ii) using this file in conjunction with the Microsoft product with which it was distributed subject to that product�s End User License Agreement. Microsoft reserves all other rights and grants no additional rights, whether by implication, estoppel or otherwise.

/*
 * jQuery BBQ: Back Button & Query Library - v1.3pre - 8/26/2010
 * http://benalman.com/projects/jquery-bbq-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function($,r){var h,n=Array.prototype.slice,t=decodeURIComponent,a=$.param,j,c,m,y,b=$.bbq=$.bbq||{},s,x,k,e=$.event.special,d="hashchange",B="querystring",F="fragment",z="elemUrlAttr",l="href",w="src",p=/^.*\?|#.*$/g,u,H,g,i,C,E={};function G(I){return typeof I==="string"}function D(J){var I=n.call(arguments,1);return function(){return J.apply(this,I.concat(n.call(arguments)))}}function o(I){return I.replace(H,"$2")}function q(I){return I.replace(/(?:^[^?#]*\?([^#]*).*$)?.*/,"$1")}function f(K,P,I,L,J){var R,O,N,Q,M;if(L!==h){N=I.match(K?H:/^([^#?]*)\??([^#]*)(#?.*)/);M=N[3]||"";if(J===2&&G(L)){O=L.replace(K?u:p,"")}else{Q=m(N[2]);L=G(L)?m[K?F:B](L):L;O=J===2?L:J===1?$.extend({},L,Q):$.extend({},Q,L);O=j(O);if(K){O=O.replace(g,t)}}R=N[1]+(K?C:O||!N[1]?"?":"")+O+M}else{R=P(I!==h?I:location.href)}return R}a[B]=D(f,0,q);a[F]=c=D(f,1,o);a.sorted=j=function(J,K){var I=[],L={};$.each(a(J,K).split("&"),function(P,M){var O=M.replace(/(?:%5B|=).*$/,""),N=L[O];if(!N){N=L[O]=[];I.push(O)}N.push(M)});return $.map(I.sort(),function(M){return L[M]}).join("&")};c.noEscape=function(J){J=J||"";var I=$.map(J.split(""),encodeURIComponent);g=new RegExp(I.join("|"),"g")};c.noEscape(",/");c.ajaxCrawlable=function(I){if(I!==h){if(I){u=/^.*(?:#!|#)/;H=/^([^#]*)(?:#!|#)?(.*)$/;C="#!"}else{u=/^.*#/;H=/^([^#]*)#?(.*)$/;C="#"}i=!!I}return i};c.ajaxCrawlable(0);$.deparam=m=function(L,I){var K={},J={"true":!0,"false":!1,"null":null};$.each(L.replace(/\+/g," ").split("&"),function(O,T){var N=T.split("="),S=t(N[0]),M,R=K,P=0,U=S.split("]["),Q=U.length-1;if(/\[/.test(U[0])&&/\]$/.test(U[Q])){U[Q]=U[Q].replace(/\]$/,"");U=U.shift().split("[").concat(U);Q=U.length-1}else{Q=0}if(N.length===2){M=t(N[1]);if(I){M=M&&!isNaN(M)?+M:M==="undefined"?h:J[M]!==h?J[M]:M}if(Q){for(;P<=Q;P++){S=U[P]===""?R.length:U[P];R=R[S]=P<Q?R[S]||(U[P+1]&&isNaN(U[P+1])?{}:[]):M}}else{if($.isArray(K[S])){K[S].push(M)}else{if(K[S]!==h){K[S]=[K[S],M]}else{K[S]=M}}}}else{if(S){K[S]=I?h:""}}});return K};function A(K,I,J){if(I===h||typeof I==="boolean"){J=I;I=a[K?F:B]()}else{I=G(I)?I.replace(K?u:p,""):I}return m(I,J)}m[B]=D(A,0);m[F]=y=D(A,1);$[z]||($[z]=function(I){return $.extend(E,I)})({a:l,base:l,iframe:w,img:w,input:w,form:"action",link:l,script:w});k=$[z];function v(L,J,K,I){if(!G(K)&&typeof K!=="object"){I=K;K=J;J=h}return this.each(function(){var O=$(this),M=J||k()[(this.nodeName||"").toLowerCase()]||"",N=M&&O.attr(M)||"";O.attr(M,a[L](N,K,I))})}$.fn[B]=D(v,B);$.fn[F]=D(v,F);b.pushState=s=function(L,I){if(G(L)&&/^#/.test(L)&&I===h){I=2}var K=L!==h,J=c(location.href,K?L:{},K?I:2);location.href=J};b.getState=x=function(I,J){return I===h||typeof I==="boolean"?y(I):y(J)[I]};b.removeState=function(I){var J={};if(I!==h){J=x();$.each($.isArray(I)?I:arguments,function(L,K){delete J[K]})}s(J,2)};e[d]=$.extend(e[d],{add:function(I){var K;function J(M){var L=M[F]=c();M.getState=function(N,O){return N===h||typeof N==="boolean"?m(L,N):m(L,O)[N]};K.apply(this,arguments)}if($.isFunction(I)){K=I;return J}else{K=I.handler;I.handler=J}}})})(jQuery,this);

//Note: Microsoft Corporation is not the original author of this script file. Microsoft obtained the original file from http://benalman.com/projects/jquery-hashchange-plugin/ under the license that is referred to below. That license and the other notices below are provided for informational purposes only and are not the license terms under which Microsoft distributes this file. Microsoft grants you the right to use this file for the sole purpose of either: (i) interacting through your browser with the Microsoft web site hosting this file, subject to that web site�s terms of use; or (ii) using this file in conjunction with the Microsoft product with which it was distributed subject to that product�s End User License Agreement. Microsoft reserves all other rights and grants no additional rights, whether by implication, estoppel or otherwise.

/*
 * jQuery hashchange event - v1.3 - 7/21/2010
 * http://benalman.com/projects/jquery-hashchange-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function($,e,b){var c="hashchange",h=document,f,g=$.event.special,i=h.documentMode,d="on"+c in e&&(i===b||i>7);function a(j){j=j||location.href;return"#"+j.replace(/^[^#]*#?(.*)$/,"$1")}$.fn[c]=function(j){return j?this.bind(c,j):this.trigger(c)};$.fn[c].delay=50;g[c]=$.extend(g[c],{setup:function(){if(d){return false}$(f.start)},teardown:function(){if(d){return false}$(f.stop)}});f=(function(){var j={},p,m=a(),k=function(q){return q},l=k,o=k;j.start=function(){p||n()};j.stop=function(){p&&clearTimeout(p);p=b};function n(){var r=a(),q=o(m);if(r!==m){l(m=r,q);$(e).trigger(c)}else{if(q!==m){location.href=location.href.replace(/#.*/,"")+q}}p=setTimeout(n,$.fn[c].delay)}(!!window.ActiveXObject)&&!d&&(function(){var q,r;j.start=function(){if(!q){r=$.fn[c].src;r=r&&r+a();q=$('<iframe tabindex="-1" title="empty"/>').hide().one("load",function(){r||l(a());n()}).attr("src",r||"javascript:0").insertAfter("body")[0].contentWindow;h.onpropertychange=function(){try{if(event.propertyName==="title"){q.document.title=h.title}}catch(s){}}}};j.stop=k;o=function(){return a(q.location.href)};l=function(v,s){var u=q.document,t=$.fn[c].domain;if(v!==s){u.title=h.title;u.open();t&&u.write('<script>document.domain="'+t+'"<\/script>');u.close();q.location.hash=v}}})();return j})()})(jQuery,this);
/**
 * Cookie plugin
 *
 * Copyright (c) 2006 Klaus Hartl (stilbuero.de)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 */

/**
 * Create a cookie with the given name and value and other optional parameters.
 *
 * @example $.cookie('the_cookie', 'the_value');
 * @desc Set the value of a cookie.
 * @example $.cookie('the_cookie', 'the_value', { expires: 7, path: '/', domain: 'jquery.com', secure: true });
 * @desc Create a cookie with all available options.
 * @example $.cookie('the_cookie', 'the_value');
 * @desc Create a session cookie.
 * @example $.cookie('the_cookie', null);
 * @desc Delete a cookie by passing null as value. Keep in mind that you have to use the same path and domain
 *       used when the cookie was set.
 *
 * @param String name The name of the cookie.
 * @param String value The value of the cookie.
 * @param Object options An object literal containing key/value pairs to provide optional cookie attributes.
 * @option Number|Date expires Either an integer specifying the expiration date from now on in days or a Date object.
 *                             If a negative value is specified (e.g. a date in the past), the cookie will be deleted.
 *                             If set to null or omitted, the cookie will be a session cookie and will not be retained
 *                             when the the browser exits.
 * @option String path The value of the path atribute of the cookie (default: path of page that created the cookie).
 * @option String domain The value of the domain attribute of the cookie (default: domain of page that created the cookie).
 * @option Boolean secure If true, the secure attribute of the cookie will be set and the cookie transmission will
 *                        require a secure protocol (like HTTPS).
 * @type undefined
 *
 * @name $.cookie
 * @cat Plugins/Cookie
 * @author Klaus Hartl/klaus.hartl@stilbuero.de
 */

/**
 * Get the value of a cookie with the given name.
 *
 * @example $.cookie('the_cookie');
 * @desc Get the value of a cookie.
 *
 * @param String name The name of the cookie.
 * @return The value of the cookie.
 * @type String
 *
 * @name $.cookie
 * @cat Plugins/Cookie
 * @author Klaus Hartl/klaus.hartl@stilbuero.de
 */
jQuery.cookie = function(name, value, options) {
    if (typeof value != 'undefined') { // name and value given, set cookie
        options = options || {};
        if (value === null) {
            value = '';
            options = $.extend({}, options); // clone object since it's unexpected behavior if the expired property were changed
            options.expires = -1;
        }
        var expires = '';
        if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
            var date;
            if (typeof options.expires == 'number') {
                date = new Date();
                date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            } else {
                date = options.expires;
            }
            expires = '; expires=' + date.toUTCString(); // use expires attribute, max-age is not supported by IE
        }
        // NOTE Needed to parenthesize options.path and options.domain
        // in the following expressions, otherwise they evaluate to undefined
        // in the packed version for some reason...
        var path = options.path ? '; path=' + (options.path) : '';
        var domain = options.domain ? '; domain=' + (options.domain) : '';
        var secure = options.secure ? '; secure' : '';
        document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
    } else { // only name given, get cookie
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
};
!function (t) { t.color = {}, t.color.make = function (i, e, o, n) { var a = {}; return a.r = i || 0, a.g = e || 0, a.b = o || 0, a.a = null != n ? n : 1, a.add = function (t, i) { for (var e = 0; e < t.length; ++e) a[t.charAt(e)] += i; return a.normalize() }, a.scale = function (t, i) { for (var e = 0; e < t.length; ++e) a[t.charAt(e)] *= i; return a.normalize() }, a.toString = function () { return a.a >= 1 ? "rgb(" + [a.r, a.g, a.b].join(",") + ")" : "rgba(" + [a.r, a.g, a.b, a.a].join(",") + ")" }, a.normalize = function () { function t(t, i, e) { return t > i ? t : i > e ? e : i } return a.r = t(0, parseInt(a.r), 255), a.g = t(0, parseInt(a.g), 255), a.b = t(0, parseInt(a.b), 255), a.a = t(0, a.a, 1), a }, a.clone = function () { return t.color.make(a.r, a.b, a.g, a.a) }, a.normalize() }, t.color.extract = function (i, e) { var o; do { if (o = i.css(e).toLowerCase(), "" != o && "transparent" != o) break; i = i.parent() } while (i.length && !t.nodeName(i.get(0), "body")); return "rgba(0, 0, 0, 0)" == o && (o = "transparent"), t.color.parse(o) }, t.color.parse = function (e) { var o, n = t.color.make; if (o = /rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(e)) return n(parseInt(o[1], 10), parseInt(o[2], 10), parseInt(o[3], 10)); if (o = /rgba\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(e)) return n(parseInt(o[1], 10), parseInt(o[2], 10), parseInt(o[3], 10), parseFloat(o[4])); if (o = /rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(e)) return n(2.55 * parseFloat(o[1]), 2.55 * parseFloat(o[2]), 2.55 * parseFloat(o[3])); if (o = /rgba\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(e)) return n(2.55 * parseFloat(o[1]), 2.55 * parseFloat(o[2]), 2.55 * parseFloat(o[3]), parseFloat(o[4])); if (o = /#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(e)) return n(parseInt(o[1], 16), parseInt(o[2], 16), parseInt(o[3], 16)); if (o = /#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(e)) return n(parseInt(o[1] + o[1], 16), parseInt(o[2] + o[2], 16), parseInt(o[3] + o[3], 16)); var a = t.trim(e).toLowerCase(); return "transparent" == a ? n(255, 255, 255, 0) : (o = i[a] || [0, 0, 0], n(o[0], o[1], o[2])) }; var i = { aqua: [0, 255, 255], azure: [240, 255, 255], beige: [245, 245, 220], black: [0, 0, 0], blue: [0, 0, 255], brown: [165, 42, 42], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgrey: [169, 169, 169], darkgreen: [0, 100, 0], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkviolet: [148, 0, 211], fuchsia: [255, 0, 255], gold: [255, 215, 0], green: [0, 128, 0], indigo: [75, 0, 130], khaki: [240, 230, 140], lightblue: [173, 216, 230], lightcyan: [224, 255, 255], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightyellow: [255, 255, 224], lime: [0, 255, 0], magenta: [255, 0, 255], maroon: [128, 0, 0], navy: [0, 0, 128], olive: [128, 128, 0], orange: [255, 165, 0], pink: [255, 192, 203], purple: [128, 0, 128], violet: [128, 0, 128], red: [255, 0, 0], silver: [192, 192, 192], white: [255, 255, 255], yellow: [255, 255, 0] } }(jQuery), function (t) {
    function i(i, e) { var o = e.children("." + i)[0]; if (null == o && (o = document.createElement("canvas"), o.className = i, t(o).css({ direction: "ltr", position: "absolute", left: 0, top: 0 }).appendTo(e), !o.getContext)) { if (!window.G_vmlCanvasManager) throw new Error("Canvas is not available. If you're using IE with a fall-back such as Excanvas, then there's either a mistake in your conditional include, or the page has no DOCTYPE and is rendering in Quirks Mode."); o = window.G_vmlCanvasManager.initElement(o) } this.element = o; var n = this.context = o.getContext("2d"), a = window.devicePixelRatio || 1, r = n.webkitBackingStorePixelRatio || n.mozBackingStorePixelRatio || n.msBackingStorePixelRatio || n.oBackingStorePixelRatio || n.backingStorePixelRatio || 1; this.pixelRatio = a / r, this.resize(e.width(), e.height()), this.textContainer = null, this.text = {}, this._textCache = {} } function e(e, n, a, r) {
        function l(t, i) { i = [xt].concat(i); for (var e = 0; e < t.length; ++e) t[e].apply(this, i) } function s() { for (var e = { Canvas: i }, o = 0; o < r.length; ++o) { var n = r[o]; n.init(xt, e), n.options && t.extend(!0, nt, n.options) } } function c(i) { t.extend(!0, nt, i), i && i.colors && (nt.colors = i.colors), null == nt.xaxis.color && (nt.xaxis.color = t.color.parse(nt.grid.color).scale("a", .22).toString()), null == nt.yaxis.color && (nt.yaxis.color = t.color.parse(nt.grid.color).scale("a", .22).toString()), null == nt.xaxis.tickColor && (nt.xaxis.tickColor = nt.grid.tickColor || nt.xaxis.color), null == nt.yaxis.tickColor && (nt.yaxis.tickColor = nt.grid.tickColor || nt.yaxis.color), null == nt.grid.borderColor && (nt.grid.borderColor = nt.grid.color), null == nt.grid.tickColor && (nt.grid.tickColor = t.color.parse(nt.grid.color).scale("a", .22).toString()); var o, n, a, r = e.css("font-size"), s = r ? +r.replace("px", "") : 13, c = { style: e.css("font-style"), size: Math.round(.8 * s), variant: e.css("font-variant"), weight: e.css("font-weight"), family: e.css("font-family") }; for (a = nt.xaxes.length || 1, o = 0; a > o; ++o) n = nt.xaxes[o], n && !n.tickColor && (n.tickColor = n.color), n = t.extend(!0, {}, nt.xaxis, n), nt.xaxes[o] = n, n.font && (n.font = t.extend({}, c, n.font), n.font.color || (n.font.color = n.color), n.font.lineHeight || (n.font.lineHeight = Math.round(1.15 * n.font.size))); for (a = nt.yaxes.length || 1, o = 0; a > o; ++o) n = nt.yaxes[o], n && !n.tickColor && (n.tickColor = n.color), n = t.extend(!0, {}, nt.yaxis, n), nt.yaxes[o] = n, n.font && (n.font = t.extend({}, c, n.font), n.font.color || (n.font.color = n.color), n.font.lineHeight || (n.font.lineHeight = Math.round(1.15 * n.font.size))); for (nt.xaxis.noTicks && null == nt.xaxis.ticks && (nt.xaxis.ticks = nt.xaxis.noTicks), nt.yaxis.noTicks && null == nt.yaxis.ticks && (nt.yaxis.ticks = nt.yaxis.noTicks), nt.x2axis && (nt.xaxes[1] = t.extend(!0, {}, nt.xaxis, nt.x2axis), nt.xaxes[1].position = "top", null == nt.x2axis.min && (nt.xaxes[1].min = null), null == nt.x2axis.max && (nt.xaxes[1].max = null)), nt.y2axis && (nt.yaxes[1] = t.extend(!0, {}, nt.yaxis, nt.y2axis), nt.yaxes[1].position = "right", null == nt.y2axis.min && (nt.yaxes[1].min = null), null == nt.y2axis.max && (nt.yaxes[1].max = null)), nt.grid.coloredAreas && (nt.grid.markings = nt.grid.coloredAreas), nt.grid.coloredAreasColor && (nt.grid.markingsColor = nt.grid.coloredAreasColor), nt.lines && t.extend(!0, nt.series.lines, nt.lines), nt.points && t.extend(!0, nt.series.points, nt.points), nt.bars && t.extend(!0, nt.series.bars, nt.bars), null != nt.shadowSize && (nt.series.shadowSize = nt.shadowSize), null != nt.highlightColor && (nt.series.highlightColor = nt.highlightColor), o = 0; o < nt.xaxes.length; ++o) x(ht, o + 1).options = nt.xaxes[o]; for (o = 0; o < nt.yaxes.length; ++o) x(ft, o + 1).options = nt.yaxes[o]; for (var h in mt) nt.hooks[h] && nt.hooks[h].length && (mt[h] = mt[h].concat(nt.hooks[h])); l(mt.processOptions, [nt]) } function h(t) { ot = f(t), g(), b() } function f(i) { for (var e = [], o = 0; o < i.length; ++o) { var n = t.extend(!0, {}, nt.series); null != i[o].data ? (n.data = i[o].data, delete i[o].data, t.extend(!0, n, i[o]), i[o].data = n.data) : n.data = i[o], e.push(n) } return e } function u(t, i) { var e = t[i + "axis"]; return "object" == typeof e && (e = e.n), "number" != typeof e && (e = 1), e } function d() { return t.grep(ht.concat(ft), function (t) { return t }) } function p(t) { var i, e, o = {}; for (i = 0; i < ht.length; ++i) e = ht[i], e && e.used && (o["x" + e.n] = e.c2p(t.left)); for (i = 0; i < ft.length; ++i) e = ft[i], e && e.used && (o["y" + e.n] = e.c2p(t.top)); return void 0 !== o.x1 && (o.x = o.x1), void 0 !== o.y1 && (o.y = o.y1), o } function m(t) { var i, e, o, n = {}; for (i = 0; i < ht.length; ++i) if (e = ht[i], e && e.used && (o = "x" + e.n, null == t[o] && 1 == e.n && (o = "x"), null != t[o])) { n.left = e.p2c(t[o]); break } for (i = 0; i < ft.length; ++i) if (e = ft[i], e && e.used && (o = "y" + e.n, null == t[o] && 1 == e.n && (o = "y"), null != t[o])) { n.top = e.p2c(t[o]); break } return n } function x(i, e) { return i[e - 1] || (i[e - 1] = { n: e, direction: i == ht ? "x" : "y", options: t.extend(!0, {}, i == ht ? nt.xaxis : nt.yaxis) }), i[e - 1] } function g() { var i, e = ot.length, o = -1; for (i = 0; i < ot.length; ++i) { var n = ot[i].color; null != n && (e--, "number" == typeof n && n > o && (o = n)) } o >= e && (e = o + 1); var a, r = [], l = nt.colors, s = l.length, c = 0; for (i = 0; e > i; i++) a = t.color.parse(l[i % s] || "#666"), i % s == 0 && i && (c = c >= 0 ? .5 > c ? -c - .2 : 0 : -c), r[i] = a.scale("rgb", 1 + c); var h, f = 0; for (i = 0; i < ot.length; ++i) { if (h = ot[i], null == h.color ? (h.color = r[f].toString(), ++f) : "number" == typeof h.color && (h.color = r[h.color].toString()), null == h.lines.show) { var d, p = !0; for (d in h) if (h[d] && h[d].show) { p = !1; break } p && (h.lines.show = !0) } null == h.lines.zero && (h.lines.zero = !!h.lines.fill), h.xaxis = x(ht, u(h, "x")), h.yaxis = x(ft, u(h, "y")) } } function b() { function i(t, i, e) { i < t.datamin && i != -b && (t.datamin = i), e > t.datamax && e != b && (t.datamax = e) } var e, o, n, a, r, s, c, h, f, u, p, m, x = Number.POSITIVE_INFINITY, g = Number.NEGATIVE_INFINITY, b = Number.MAX_VALUE; for (t.each(d(), function (t, i) { i.datamin = x, i.datamax = g, i.used = !1 }), e = 0; e < ot.length; ++e) r = ot[e], r.datapoints = { points: [] }, l(mt.processRawData, [r, r.data, r.datapoints]); for (e = 0; e < ot.length; ++e) { if (r = ot[e], p = r.data, m = r.datapoints.format, !m) { if (m = [], m.push({ x: !0, number: !0, required: !0 }), m.push({ y: !0, number: !0, required: !0 }), r.bars.show || r.lines.show && r.lines.fill) { var v = !!(r.bars.show && r.bars.zero || r.lines.show && r.lines.zero); m.push({ y: !0, number: !0, required: !1, defaultValue: 0, autoscale: v }), r.bars.horizontal && (delete m[m.length - 1].y, m[m.length - 1].x = !0) } r.datapoints.format = m } if (null == r.datapoints.pointsize) { r.datapoints.pointsize = m.length, c = r.datapoints.pointsize, s = r.datapoints.points; var k = r.lines.show && r.lines.steps; for (r.xaxis.used = r.yaxis.used = !0, o = n = 0; o < p.length; ++o, n += c) { u = p[o]; var y = null == u; if (!y) for (a = 0; c > a; ++a) h = u[a], f = m[a], f && (f.number && null != h && (h = +h, isNaN(h) ? h = null : h == 1 / 0 ? h = b : h == -(1 / 0) && (h = -b)), null == h && (f.required && (y = !0), null != f.defaultValue && (h = f.defaultValue))), s[n + a] = h; if (y) for (a = 0; c > a; ++a) h = s[n + a], null != h && (f = m[a], f.autoscale !== !1 && (f.x && i(r.xaxis, h, h), f.y && i(r.yaxis, h, h))), s[n + a] = null; else if (k && n > 0 && null != s[n - c] && s[n - c] != s[n] && s[n - c + 1] != s[n + 1]) { for (a = 0; c > a; ++a) s[n + c + a] = s[n + a]; s[n + 1] = s[n - c + 1], n += c } } } } for (e = 0; e < ot.length; ++e) r = ot[e], l(mt.processDatapoints, [r, r.datapoints]); for (e = 0; e < ot.length; ++e) { r = ot[e], s = r.datapoints.points, c = r.datapoints.pointsize, m = r.datapoints.format; var w = x, M = x, T = g, C = g; for (o = 0; o < s.length; o += c) if (null != s[o]) for (a = 0; c > a; ++a) h = s[o + a], f = m[a], f && f.autoscale !== !1 && h != b && h != -b && (f.x && (w > h && (w = h), h > T && (T = h)), f.y && (M > h && (M = h), h > C && (C = h))); if (r.bars.show) { var S; switch (r.bars.align) { case "left": S = 0; break; case "right": S = -r.bars.barWidth; break; default: S = -r.bars.barWidth / 2 } r.bars.horizontal ? (M += S, C += S + r.bars.barWidth) : (w += S, T += S + r.bars.barWidth) } i(r.xaxis, w, T), i(r.yaxis, M, C) } t.each(d(), function (t, i) { i.datamin == x && (i.datamin = null), i.datamax == g && (i.datamax = null) }) } function v() { e.css("padding", 0).children().filter(function () { return !t(this).hasClass("flot-overlay") && !t(this).hasClass("flot-base") }).remove(), "static" == e.css("position") && e.css("position", "relative"), at = new i("flot-base", e), rt = new i("flot-overlay", e), st = at.context, ct = rt.context, lt = t(rt.element).unbind(); var o = e.data("plot"); o && (o.shutdown(), rt.clear()), e.data("plot", xt) } function k() { nt.grid.hoverable && (lt.mousemove(X), lt.bind("mouseleave", Y)), nt.grid.clickable && lt.click(q), l(mt.bindEvents, [lt]) } function y() { bt && clearTimeout(bt), lt.unbind("mousemove", X), lt.unbind("mouseleave", Y), lt.unbind("click", q), l(mt.shutdown, [lt]) } function w(t) { function i(t) { return t } var e, o, n = t.options.transform || i, a = t.options.inverseTransform; "x" == t.direction ? (e = t.scale = dt / Math.abs(n(t.max) - n(t.min)), o = Math.min(n(t.max), n(t.min))) : (e = t.scale = pt / Math.abs(n(t.max) - n(t.min)), e = -e, o = Math.max(n(t.max), n(t.min))), n == i ? t.p2c = function (t) { return (t - o) * e } : t.p2c = function (t) { return (n(t) - o) * e }, a ? t.c2p = function (t) { return a(o + t / e) } : t.c2p = function (t) { return o + t / e } } function M(t) { for (var i = t.options, e = t.ticks || [], o = i.labelWidth || 0, n = i.labelHeight || 0, a = o || ("x" == t.direction ? Math.floor(at.width / (e.length || 1)) : null), r = t.direction + "Axis " + t.direction + t.n + "Axis", l = "flot-" + t.direction + "-axis flot-" + t.direction + t.n + "-axis " + r, s = i.font || "flot-tick-label tickLabel", c = 0; c < e.length; ++c) { var h = e[c]; if (h.label) { var f = at.getTextInfo(l, h.label, s, null, a); o = Math.max(o, f.width), n = Math.max(n, f.height) } } t.labelWidth = i.labelWidth || o, t.labelHeight = i.labelHeight || n } function T(i) { var e = i.labelWidth, o = i.labelHeight, n = i.options.position, a = "x" === i.direction, r = i.options.tickLength, l = nt.grid.axisMargin, s = nt.grid.labelMargin, c = !0, h = !0, f = !0, u = !1; t.each(a ? ht : ft, function (t, e) { e && (e.show || e.reserveSpace) && (e === i ? u = !0 : e.options.position === n && (u ? h = !1 : c = !1), u || (f = !1)) }), h && (l = 0), null == r && (r = f ? "full" : 5), isNaN(+r) || (s += +r), a ? (o += s, "bottom" == n ? (ut.bottom += o + l, i.box = { top: at.height - ut.bottom, height: o }) : (i.box = { top: ut.top + l, height: o }, ut.top += o + l)) : (e += s, "left" == n ? (i.box = { left: ut.left + l, width: e }, ut.left += e + l) : (ut.right += e + l, i.box = { left: at.width - ut.right, width: e })), i.position = n, i.tickLength = r, i.box.padding = s, i.innermost = c } function C(t) { "x" == t.direction ? (t.box.left = ut.left - t.labelWidth / 2, t.box.width = at.width - ut.left - ut.right + t.labelWidth) : (t.box.top = ut.top - t.labelHeight / 2, t.box.height = at.height - ut.bottom - ut.top + t.labelHeight) } function S() { var i, e = nt.grid.minBorderMargin; if (null == e) for (e = 0, i = 0; i < ot.length; ++i) e = Math.max(e, 2 * (ot[i].points.radius + ot[i].points.lineWidth / 2)); var o = { left: e, right: e, top: e, bottom: e }; t.each(d(), function (t, i) { i.reserveSpace && i.ticks && i.ticks.length && ("x" === i.direction ? (o.left = Math.max(o.left, i.labelWidth / 2), o.right = Math.max(o.right, i.labelWidth / 2)) : (o.bottom = Math.max(o.bottom, i.labelHeight / 2), o.top = Math.max(o.top, i.labelHeight / 2))) }), ut.left = Math.ceil(Math.max(o.left, ut.left)), ut.right = Math.ceil(Math.max(o.right, ut.right)), ut.top = Math.ceil(Math.max(o.top, ut.top)), ut.bottom = Math.ceil(Math.max(o.bottom, ut.bottom)) } function W() { var i, e = d(), o = nt.grid.show; for (var n in ut) { var a = nt.grid.margin || 0; ut[n] = "number" == typeof a ? a : a[n] || 0 } l(mt.processOffset, [ut]); for (var n in ut) "object" == typeof nt.grid.borderWidth ? ut[n] += o ? nt.grid.borderWidth[n] : 0 : ut[n] += o ? nt.grid.borderWidth : 0; if (t.each(e, function (t, i) { var e = i.options; i.show = null == e.show ? i.used : e.show, i.reserveSpace = null == e.reserveSpace ? i.show : e.reserveSpace, z(i) }), o) { var r = t.grep(e, function (t) { return t.show || t.reserveSpace }); for (t.each(r, function (t, i) { I(i), A(i), F(i, i.ticks), M(i) }), i = r.length - 1; i >= 0; --i) T(r[i]); S(), t.each(r, function (t, i) { C(i) }) } dt = at.width - ut.left - ut.right, pt = at.height - ut.bottom - ut.top, t.each(e, function (t, i) { w(i) }), o && O(), _() } function z(t) { var i = t.options, e = +(null != i.min ? i.min : t.datamin), o = +(null != i.max ? i.max : t.datamax), n = o - e; if (0 == n) { var a = 0 == o ? 1 : .01; null == i.min && (e -= a), (null == i.max || null != i.min) && (o += a) } else { var r = i.autoscaleMargin; null != r && (null == i.min && (e -= n * r, 0 > e && null != t.datamin && t.datamin >= 0 && (e = 0)), null == i.max && (o += n * r, o > 0 && null != t.datamax && t.datamax <= 0 && (o = 0))) } t.min = e, t.max = o } function I(i) { var e, n = i.options; e = "number" == typeof n.ticks && n.ticks > 0 ? n.ticks : .3 * Math.sqrt("x" == i.direction ? at.width : at.height); var a = (i.max - i.min) / e, r = -Math.floor(Math.log(a) / Math.LN10), l = n.tickDecimals; null != l && r > l && (r = l); var s, c = Math.pow(10, -r), h = a / c; if (1.5 > h ? s = 1 : 3 > h ? (s = 2, h > 2.25 && (null == l || l >= r + 1) && (s = 2.5, ++r)) : s = 7.5 > h ? 5 : 10, s *= c, null != n.minTickSize && s < n.minTickSize && (s = n.minTickSize), i.delta = a, i.tickDecimals = Math.max(0, null != l ? l : r), i.tickSize = n.tickSize || s, "time" == n.mode && !i.tickGenerator) throw new Error("Time mode requires the flot.time plugin."); if (i.tickGenerator || (i.tickGenerator = function (t) { var i, e = [], n = o(t.min, t.tickSize), a = 0, r = Number.NaN; do i = r, r = n + a * t.tickSize, e.push(r), ++a; while (r < t.max && r != i); return e }, i.tickFormatter = function (t, i) { var e = i.tickDecimals ? Math.pow(10, i.tickDecimals) : 1, o = "" + Math.round(t * e) / e; if (null != i.tickDecimals) { var n = o.indexOf("."), a = -1 == n ? 0 : o.length - n - 1; if (a < i.tickDecimals) return (a ? o : o + ".") + ("" + e).substr(1, i.tickDecimals - a) } return o }), t.isFunction(n.tickFormatter) && (i.tickFormatter = function (t, i) { return "" + n.tickFormatter(t, i) }), null != n.alignTicksWithAxis) { var f = ("x" == i.direction ? ht : ft)[n.alignTicksWithAxis - 1]; if (f && f.used && f != i) { var u = i.tickGenerator(i); if (u.length > 0 && (null == n.min && (i.min = Math.min(i.min, u[0])), null == n.max && u.length > 1 && (i.max = Math.max(i.max, u[u.length - 1]))), i.tickGenerator = function (t) { var i, e, o = []; for (e = 0; e < f.ticks.length; ++e) i = (f.ticks[e].v - f.min) / (f.max - f.min), i = t.min + i * (t.max - t.min), o.push(i); return o }, !i.mode && null == n.tickDecimals) { var d = Math.max(0, -Math.floor(Math.log(i.delta) / Math.LN10) + 1), p = i.tickGenerator(i); p.length > 1 && /\..*0$/.test((p[1] - p[0]).toFixed(d)) || (i.tickDecimals = d) } } } } function A(i) { var e = i.options.ticks, o = []; null == e || "number" == typeof e && e > 0 ? o = i.tickGenerator(i) : e && (o = t.isFunction(e) ? e(i) : e); var n, a; for (i.ticks = [], n = 0; n < o.length; ++n) { var r = null, l = o[n]; "object" == typeof l ? (a = +l[0], l.length > 1 && (r = l[1])) : a = +l, null == r && (r = i.tickFormatter(a, i)), isNaN(a) || i.ticks.push({ v: a, label: r }) } } function F(t, i) { t.options.autoscaleMargin && i.length > 0 && (null == t.options.min && (t.min = Math.min(t.min, i[0].v)), null == t.options.max && i.length > 1 && (t.max = Math.max(t.max, i[i.length - 1].v))) } function P() { at.clear(), l(mt.drawBackground, [st]); var t = nt.grid; t.show && t.backgroundColor && D(), t.show && !t.aboveData && L(); for (var i = 0; i < ot.length; ++i) l(mt.drawSeries, [st, ot[i]]), R(ot[i]); l(mt.draw, [st]), t.show && t.aboveData && L(), at.render(), U() } function N(t, i) { for (var e, o, n, a, r = d(), l = 0; l < r.length; ++l) if (e = r[l], e.direction == i && (a = i + e.n + "axis", t[a] || 1 != e.n || (a = i + "axis"), t[a])) { o = t[a].from, n = t[a].to; break } if (t[a] || (e = "x" == i ? ht[0] : ft[0], o = t[i + "1"], n = t[i + "2"]), null != o && null != n && o > n) { var s = o; o = n, n = s } return { from: o, to: n, axis: e } } function D() { st.save(), st.translate(ut.left, ut.top), st.fillStyle = et(nt.grid.backgroundColor, pt, 0, "rgba(255, 255, 255, 0)"), st.fillRect(0, 0, dt, pt), st.restore() } function L() { var i, e, o, n; st.save(), st.translate(ut.left, ut.top); var a = nt.grid.markings; if (a) for (t.isFunction(a) && (e = xt.getAxes(), e.xmin = e.xaxis.min, e.xmax = e.xaxis.max, e.ymin = e.yaxis.min, e.ymax = e.yaxis.max, a = a(e)), i = 0; i < a.length; ++i) { var r = a[i], l = N(r, "x"), s = N(r, "y"); if (null == l.from && (l.from = l.axis.min), null == l.to && (l.to = l.axis.max), null == s.from && (s.from = s.axis.min), null == s.to && (s.to = s.axis.max), !(l.to < l.axis.min || l.from > l.axis.max || s.to < s.axis.min || s.from > s.axis.max)) { l.from = Math.max(l.from, l.axis.min), l.to = Math.min(l.to, l.axis.max), s.from = Math.max(s.from, s.axis.min), s.to = Math.min(s.to, s.axis.max); var c = l.from === l.to, h = s.from === s.to; if (!c || !h) if (l.from = Math.floor(l.axis.p2c(l.from)), l.to = Math.floor(l.axis.p2c(l.to)), s.from = Math.floor(s.axis.p2c(s.from)), s.to = Math.floor(s.axis.p2c(s.to)), c || h) { var f = r.lineWidth || nt.grid.markingsLineWidth, u = f % 2 ? .5 : 0; st.beginPath(), st.strokeStyle = r.color || nt.grid.markingsColor, st.lineWidth = f, c ? (st.moveTo(l.to + u, s.from), st.lineTo(l.to + u, s.to)) : (st.moveTo(l.from, s.to + u), st.lineTo(l.to, s.to + u)), st.stroke() } else st.fillStyle = r.color || nt.grid.markingsColor, st.fillRect(l.from, s.to, l.to - l.from, s.from - s.to) } } e = d(), o = nt.grid.borderWidth; for (var p = 0; p < e.length; ++p) { var m, x, g, b, v = e[p], k = v.box, y = v.tickLength; if (v.show && 0 != v.ticks.length) { for (st.lineWidth = 1, "x" == v.direction ? (m = 0, x = "full" == y ? "top" == v.position ? 0 : pt : k.top - ut.top + ("top" == v.position ? k.height : 0)) : (x = 0, m = "full" == y ? "left" == v.position ? 0 : dt : k.left - ut.left + ("left" == v.position ? k.width : 0)), v.innermost || (st.strokeStyle = v.options.color, st.beginPath(), g = b = 0, "x" == v.direction ? g = dt + 1 : b = pt + 1, 1 == st.lineWidth && ("x" == v.direction ? x = Math.floor(x) + .5 : m = Math.floor(m) + .5), st.moveTo(m, x), st.lineTo(m + g, x + b), st.stroke()), st.strokeStyle = v.options.tickColor, st.beginPath(), i = 0; i < v.ticks.length; ++i) { var w = v.ticks[i].v; g = b = 0, isNaN(w) || w < v.min || w > v.max || "full" == y && ("object" == typeof o && o[v.position] > 0 || o > 0) && (w == v.min || w == v.max) || ("x" == v.direction ? (m = v.p2c(w), b = "full" == y ? -pt : y, "top" == v.position && (b = -b)) : (x = v.p2c(w), g = "full" == y ? -dt : y, "left" == v.position && (g = -g)), 1 == st.lineWidth && ("x" == v.direction ? m = Math.floor(m) + .5 : x = Math.floor(x) + .5), st.moveTo(m, x), st.lineTo(m + g, x + b)) } st.stroke() } } o && (n = nt.grid.borderColor, "object" == typeof o || "object" == typeof n ? ("object" != typeof o && (o = { top: o, right: o, bottom: o, left: o }), "object" != typeof n && (n = { top: n, right: n, bottom: n, left: n }), o.top > 0 && (st.strokeStyle = n.top, st.lineWidth = o.top, st.beginPath(), st.moveTo(0 - o.left, 0 - o.top / 2), st.lineTo(dt, 0 - o.top / 2), st.stroke()), o.right > 0 && (st.strokeStyle = n.right, st.lineWidth = o.right, st.beginPath(), st.moveTo(dt + o.right / 2, 0 - o.top), st.lineTo(dt + o.right / 2, pt), st.stroke()), o.bottom > 0 && (st.strokeStyle = n.bottom, st.lineWidth = o.bottom, st.beginPath(), st.moveTo(dt + o.right, pt + o.bottom / 2), st.lineTo(0, pt + o.bottom / 2), st.stroke()), o.left > 0 && (st.strokeStyle = n.left, st.lineWidth = o.left, st.beginPath(), st.moveTo(0 - o.left / 2, pt + o.bottom), st.lineTo(0 - o.left / 2, 0), st.stroke())) : (st.lineWidth = o, st.strokeStyle = nt.grid.borderColor, st.strokeRect(-o / 2, -o / 2, dt + o, pt + o))), st.restore() } function O() { t.each(d(), function (t, i) { var e, o, n, a, r, l = i.box, s = i.direction + "Axis " + i.direction + i.n + "Axis", c = "flot-" + i.direction + "-axis flot-" + i.direction + i.n + "-axis " + s, h = i.options.font || "flot-tick-label tickLabel"; if (at.removeText(c), i.show && 0 != i.ticks.length) for (var f = 0; f < i.ticks.length; ++f) e = i.ticks[f], !e.label || e.v < i.min || e.v > i.max || ("x" == i.direction ? (a = "center", o = ut.left + i.p2c(e.v), "bottom" == i.position ? n = l.top + l.padding : (n = l.top + l.height - l.padding, r = "bottom")) : (r = "middle", n = ut.top + i.p2c(e.v), "left" == i.position ? (o = l.left + l.width - l.padding, a = "right") : o = l.left + l.padding), at.addText(c, o, n, e.label, h, null, null, a, r)) }) } function R(t) { t.lines.show && H(t), t.bars.show && B(t), t.points.show && j(t) } function H(t) { function i(t, i, e, o, n) { var a = t.points, r = t.pointsize, l = null, s = null; st.beginPath(); for (var c = r; c < a.length; c += r) { var h = a[c - r], f = a[c - r + 1], u = a[c], d = a[c + 1]; if (null != h && null != u) { if (d >= f && f < n.min) { if (d < n.min) continue; h = (n.min - f) / (d - f) * (u - h) + h, f = n.min } else if (f >= d && d < n.min) { if (f < n.min) continue; u = (n.min - f) / (d - f) * (u - h) + h, d = n.min } if (f >= d && f > n.max) { if (d > n.max) continue; h = (n.max - f) / (d - f) * (u - h) + h, f = n.max } else if (d >= f && d > n.max) { if (f > n.max) continue; u = (n.max - f) / (d - f) * (u - h) + h, d = n.max } if (u >= h && h < o.min) { if (u < o.min) continue; f = (o.min - h) / (u - h) * (d - f) + f, h = o.min } else if (h >= u && u < o.min) { if (h < o.min) continue; d = (o.min - h) / (u - h) * (d - f) + f, u = o.min } if (h >= u && h > o.max) { if (u > o.max) continue; f = (o.max - h) / (u - h) * (d - f) + f, h = o.max } else if (u >= h && u > o.max) { if (h > o.max) continue; d = (o.max - h) / (u - h) * (d - f) + f, u = o.max } (h != l || f != s) && st.moveTo(o.p2c(h) + i, n.p2c(f) + e), l = u, s = d, st.lineTo(o.p2c(u) + i, n.p2c(d) + e) } } st.stroke() } function e(t, i, e) { for (var o = t.points, n = t.pointsize, a = Math.min(Math.max(0, e.min), e.max), r = 0, l = !1, s = 1, c = 0, h = 0; ;) { if (n > 0 && r > o.length + n) break; r += n; var f = o[r - n], u = o[r - n + s], d = o[r], p = o[r + s]; if (l) { if (n > 0 && null != f && null == d) { h = r, n = -n, s = 2; continue } if (0 > n && r == c + n) { st.fill(), l = !1, n = -n, s = 1, r = c = h + n; continue } } if (null != f && null != d) { if (d >= f && f < i.min) { if (d < i.min) continue; u = (i.min - f) / (d - f) * (p - u) + u, f = i.min } else if (f >= d && d < i.min) { if (f < i.min) continue; p = (i.min - f) / (d - f) * (p - u) + u, d = i.min } if (f >= d && f > i.max) { if (d > i.max) continue; u = (i.max - f) / (d - f) * (p - u) + u, f = i.max } else if (d >= f && d > i.max) { if (f > i.max) continue; p = (i.max - f) / (d - f) * (p - u) + u, d = i.max } if (l || (st.beginPath(), st.moveTo(i.p2c(f), e.p2c(a)), l = !0), u >= e.max && p >= e.max) st.lineTo(i.p2c(f), e.p2c(e.max)), st.lineTo(i.p2c(d), e.p2c(e.max)); else if (u <= e.min && p <= e.min) st.lineTo(i.p2c(f), e.p2c(e.min)), st.lineTo(i.p2c(d), e.p2c(e.min)); else { var m = f, x = d; p >= u && u < e.min && p >= e.min ? (f = (e.min - u) / (p - u) * (d - f) + f, u = e.min) : u >= p && p < e.min && u >= e.min && (d = (e.min - u) / (p - u) * (d - f) + f, p = e.min), u >= p && u > e.max && p <= e.max ? (f = (e.max - u) / (p - u) * (d - f) + f, u = e.max) : p >= u && p > e.max && u <= e.max && (d = (e.max - u) / (p - u) * (d - f) + f, p = e.max), f != m && st.lineTo(i.p2c(m), e.p2c(u)), st.lineTo(i.p2c(f), e.p2c(u)), st.lineTo(i.p2c(d), e.p2c(p)), d != x && (st.lineTo(i.p2c(d), e.p2c(p)), st.lineTo(i.p2c(x), e.p2c(p))) } } } } st.save(), st.translate(ut.left, ut.top), st.lineJoin = "round"; var o = t.lines.lineWidth, n = t.shadowSize; if (o > 0 && n > 0) { st.lineWidth = n, st.strokeStyle = "rgba(0,0,0,0.1)"; var a = Math.PI / 18; i(t.datapoints, Math.sin(a) * (o / 2 + n / 2), Math.cos(a) * (o / 2 + n / 2), t.xaxis, t.yaxis), st.lineWidth = n / 2, i(t.datapoints, Math.sin(a) * (o / 2 + n / 4), Math.cos(a) * (o / 2 + n / 4), t.xaxis, t.yaxis) } st.lineWidth = o, st.strokeStyle = t.color; var r = G(t.lines, t.color, 0, pt); r && (st.fillStyle = r, e(t.datapoints, t.xaxis, t.yaxis)), o > 0 && i(t.datapoints, 0, 0, t.xaxis, t.yaxis), st.restore() } function j(t) { function i(t, i, e, o, n, a, r, l) { for (var s = t.points, c = t.pointsize, h = 0; h < s.length; h += c) { var f = s[h], u = s[h + 1]; null == f || f < a.min || f > a.max || u < r.min || u > r.max || (st.beginPath(), f = a.p2c(f), u = r.p2c(u) + o, "circle" == l ? st.arc(f, u, i, 0, n ? Math.PI : 2 * Math.PI, !1) : l(st, f, u, i, n), st.closePath(), e && (st.fillStyle = e, st.fill()), st.stroke()) } } st.save(), st.translate(ut.left, ut.top); var e = t.points.lineWidth, o = t.shadowSize, n = t.points.radius, a = t.points.symbol; if (0 == e && (e = 1e-4), e > 0 && o > 0) { var r = o / 2; st.lineWidth = r, st.strokeStyle = "rgba(0,0,0,0.1)", i(t.datapoints, n, null, r + r / 2, !0, t.xaxis, t.yaxis, a), st.strokeStyle = "rgba(0,0,0,0.2)", i(t.datapoints, n, null, r / 2, !0, t.xaxis, t.yaxis, a) } st.lineWidth = e, st.strokeStyle = t.color, i(t.datapoints, n, G(t.points, t.color), 0, !1, t.xaxis, t.yaxis, a), st.restore() } function E(t, i, e, o, n, a, r, l, s, c, h) { var f, u, d, p, m, x, g, b, v; c ? (b = x = g = !0, m = !1, f = e, u = t, p = i + o, d = i + n, f > u && (v = u, u = f, f = v, m = !0, x = !1)) : (m = x = g = !0, b = !1, f = t + o, u = t + n, d = e, p = i, d > p && (v = p, p = d, d = v, b = !0, g = !1)), u < r.min || f > r.max || p < l.min || d > l.max || (f < r.min && (f = r.min, m = !1), u > r.max && (u = r.max, x = !1), d < l.min && (d = l.min, b = !1), p > l.max && (p = l.max, g = !1), f = r.p2c(f), d = l.p2c(d), u = r.p2c(u), p = l.p2c(p), a && (s.fillStyle = a(d, p), s.fillRect(f, p, u - f, d - p)), h > 0 && (m || x || g || b) && (s.beginPath(), s.moveTo(f, d), m ? s.lineTo(f, p) : s.moveTo(f, p), g ? s.lineTo(u, p) : s.moveTo(u, p), x ? s.lineTo(u, d) : s.moveTo(u, d), b ? s.lineTo(f, d) : s.moveTo(f, d), s.stroke())) } function B(t) { function i(i, e, o, n, a, r) { for (var l = i.points, s = i.pointsize, c = 0; c < l.length; c += s) null != l[c] && E(l[c], l[c + 1], l[c + 2], e, o, n, a, r, st, t.bars.horizontal, t.bars.lineWidth) } st.save(), st.translate(ut.left, ut.top), st.lineWidth = t.bars.lineWidth, st.strokeStyle = t.color; var e; switch (t.bars.align) { case "left": e = 0; break; case "right": e = -t.bars.barWidth; break; default: e = -t.bars.barWidth / 2 } var o = t.bars.fill ? function (i, e) { return G(t.bars, t.color, i, e) } : null; i(t.datapoints, e, e + t.bars.barWidth, o, t.xaxis, t.yaxis), st.restore() } function G(i, e, o, n) { var a = i.fill; if (!a) return null; if (i.fillColor) return et(i.fillColor, o, n, e); var r = t.color.parse(e); return r.a = "number" == typeof a ? a : .4, r.normalize(), r.toString() } function _() { if (null != nt.legend.container ? t(nt.legend.container).html("") : e.find(".legend").remove(), nt.legend.show) { for (var i, o, n = [], a = [], r = !1, l = nt.legend.labelFormatter, s = 0; s < ot.length; ++s) i = ot[s], i.label && (o = l ? l(i.label, i) : i.label, o && a.push({ label: o, color: i.color })); if (nt.legend.sorted) if (t.isFunction(nt.legend.sorted)) a.sort(nt.legend.sorted); else if ("reverse" == nt.legend.sorted) a.reverse(); else { var c = "descending" != nt.legend.sorted; a.sort(function (t, i) { return t.label == i.label ? 0 : t.label < i.label != c ? 1 : -1 }) } for (var s = 0; s < a.length; ++s) { var h = a[s]; s % nt.legend.noColumns == 0 && (r && n.push("</tr>"), n.push("<tr>"), r = !0), n.push('<td class="legendColorBox"><div style="border:1px solid ' + nt.legend.labelBoxBorderColor + ';padding:1px"><div style="width:4px;height:0;border:5px solid ' + h.color + ';overflow:hidden"></div></div></td><td class="legendLabel">' + h.label + "</td>") } if (r && n.push("</tr>"), 0 != n.length) { var f = '<table style="font-size:smaller;color:' + nt.grid.color + '">' + n.join("") + "</table>"; if (null != nt.legend.container) t(nt.legend.container).html(f); else { var u = "", d = nt.legend.position, p = nt.legend.margin; null == p[0] && (p = [p, p]), "n" == d.charAt(0) ? u += "top:" + (p[1] + ut.top) + "px;" : "s" == d.charAt(0) && (u += "bottom:" + (p[1] + ut.bottom) + "px;"), "e" == d.charAt(1) ? u += "right:" + (p[0] + ut.right) + "px;" : "w" == d.charAt(1) && (u += "left:" + (p[0] + ut.left) + "px;"); var m = t('<div class="legend">' + f.replace('style="', 'style="position:absolute;' + u + ";") + "</div>").appendTo(e); if (0 != nt.legend.backgroundOpacity) { var x = nt.legend.backgroundColor; null == x && (x = nt.grid.backgroundColor, x = x && "string" == typeof x ? t.color.parse(x) : t.color.extract(m, "background-color"), x.a = 1, x = x.toString()); var g = m.children(); t('<div style="position:absolute;width:' + g.width() + "px;height:" + g.height() + "px;" + u + "background-color:" + x + ';"> </div>').prependTo(m).css("opacity", nt.legend.backgroundOpacity) } } } } } function V(t, i, e) { var o, n, a, r = nt.grid.mouseActiveRadius, l = r * r + 1, s = null; for (o = ot.length - 1; o >= 0; --o) if (e(ot[o])) { var c = ot[o], h = c.xaxis, f = c.yaxis, u = c.datapoints.points, d = h.c2p(t), p = f.c2p(i), m = r / h.scale, x = r / f.scale; if (a = c.datapoints.pointsize, h.options.inverseTransform && (m = Number.MAX_VALUE), f.options.inverseTransform && (x = Number.MAX_VALUE), c.lines.show || c.points.show) for (n = 0; n < u.length; n += a) { var g = u[n], b = u[n + 1]; if (null != g && !(g - d > m || -m > g - d || b - p > x || -x > b - p)) { var v = Math.abs(h.p2c(g) - t), k = Math.abs(f.p2c(b) - i), y = v * v + k * k; l > y && (l = y, s = [o, n / a]) } } if (c.bars.show && !s) { var w, M; switch (c.bars.align) { case "left": w = 0; break; case "right": w = -c.bars.barWidth; break; default: w = -c.bars.barWidth / 2 } for (M = w + c.bars.barWidth, n = 0; n < u.length; n += a) { var g = u[n], b = u[n + 1], T = u[n + 2]; null != g && (ot[o].bars.horizontal ? d <= Math.max(T, g) && d >= Math.min(T, g) && p >= b + w && b + M >= p : d >= g + w && g + M >= d && p >= Math.min(T, b) && p <= Math.max(T, b)) && (s = [o, n / a]) } } } return s ? (o = s[0], n = s[1], a = ot[o].datapoints.pointsize, { datapoint: ot[o].datapoints.points.slice(n * a, (n + 1) * a), dataIndex: n, series: ot[o], seriesIndex: o }) : null } function X(t) { nt.grid.hoverable && Q("plothover", t, function (t) { return 0 != t.hoverable }) } function Y(t) { nt.grid.hoverable && Q("plothover", t, function (t) { return !1 }) } function q(t) { Q("plotclick", t, function (t) { return 0 != t.clickable }) } function Q(t, i, o) { var n = lt.offset(), a = i.pageX - n.left - ut.left, r = i.pageY - n.top - ut.top, l = p({ left: a, top: r }); l.pageX = i.pageX, l.pageY = i.pageY; var s = V(a, r, o); if (s && (s.pageX = parseInt(s.series.xaxis.p2c(s.datapoint[0]) + n.left + ut.left, 10), s.pageY = parseInt(s.series.yaxis.p2c(s.datapoint[1]) + n.top + ut.top, 10)), nt.grid.autoHighlight) { for (var c = 0; c < gt.length; ++c) { var h = gt[c]; h.auto != t || s && h.series == s.series && h.point[0] == s.datapoint[0] && h.point[1] == s.datapoint[1] || K(h.series, h.point) } s && $(s.series, s.datapoint, t) } e.trigger(t, [l, s]) } function U() { var t = nt.interaction.redrawOverlayInterval; return -1 == t ? void J() : void (bt || (bt = setTimeout(J, t))) } function J() { bt = null, ct.save(), rt.clear(), ct.translate(ut.left, ut.top); var t, i; for (t = 0; t < gt.length; ++t) i = gt[t], i.series.bars.show ? it(i.series, i.point) : tt(i.series, i.point); ct.restore(), l(mt.drawOverlay, [ct]) } function $(t, i, e) { if ("number" == typeof t && (t = ot[t]), "number" == typeof i) { var o = t.datapoints.pointsize; i = t.datapoints.points.slice(o * i, o * (i + 1)) } var n = Z(t, i); -1 == n ? (gt.push({ series: t, point: i, auto: e }), U()) : e || (gt[n].auto = !1) } function K(t, i) { if (null == t && null == i) return gt = [], void U(); if ("number" == typeof t && (t = ot[t]), "number" == typeof i) { var e = t.datapoints.pointsize; i = t.datapoints.points.slice(e * i, e * (i + 1)) } var o = Z(t, i); -1 != o && (gt.splice(o, 1), U()) } function Z(t, i) { for (var e = 0; e < gt.length; ++e) { var o = gt[e]; if (o.series == t && o.point[0] == i[0] && o.point[1] == i[1]) return e } return -1 } function tt(i, e) { var o = e[0], n = e[1], a = i.xaxis, r = i.yaxis, l = "string" == typeof i.highlightColor ? i.highlightColor : t.color.parse(i.color).scale("a", .5).toString(); if (!(o < a.min || o > a.max || n < r.min || n > r.max)) { var s = i.points.radius + i.points.lineWidth / 2; ct.lineWidth = s, ct.strokeStyle = l; var c = 1.5 * s; o = a.p2c(o), n = r.p2c(n), ct.beginPath(), "circle" == i.points.symbol ? ct.arc(o, n, c, 0, 2 * Math.PI, !1) : i.points.symbol(ct, o, n, c, !1), ct.closePath(), ct.stroke() } } function it(i, e) { var o, n = "string" == typeof i.highlightColor ? i.highlightColor : t.color.parse(i.color).scale("a", .5).toString(), a = n; switch (i.bars.align) { case "left": o = 0; break; case "right": o = -i.bars.barWidth; break; default: o = -i.bars.barWidth / 2 } ct.lineWidth = i.bars.lineWidth, ct.strokeStyle = n, E(e[0], e[1], e[2] || 0, o, o + i.bars.barWidth, function () { return a }, i.xaxis, i.yaxis, ct, i.bars.horizontal, i.bars.lineWidth) } function et(i, e, o, n) { if ("string" == typeof i) return i; for (var a = st.createLinearGradient(0, o, 0, e), r = 0, l = i.colors.length; l > r; ++r) { var s = i.colors[r]; if ("string" != typeof s) { var c = t.color.parse(n); null != s.brightness && (c = c.scale("rgb", s.brightness)), null != s.opacity && (c.a *= s.opacity), s = c.toString() } a.addColorStop(r / (l - 1), s) } return a } var ot = [], nt = {
            colors: ["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"], legend: { show: !0, noColumns: 1, labelFormatter: null, labelBoxBorderColor: "#ccc", container: null, position: "ne", margin: 5, backgroundColor: null, backgroundOpacity: .85, sorted: null }, xaxis: { show: null, position: "bottom", mode: null, font: null, color: null, tickColor: null, transform: null, inverseTransform: null, min: null, max: null, autoscaleMargin: null, ticks: null, tickFormatter: null, labelWidth: null, labelHeight: null, reserveSpace: null, tickLength: null, alignTicksWithAxis: null, tickDecimals: null, tickSize: null, minTickSize: null }, yaxis: { autoscaleMargin: .02, position: "left" }, xaxes: [], yaxes: [], series: {
                points: { show: !1, radius: 3, lineWidth: 2, fill: !0, fillColor: "#ffffff", symbol: "circle" }, lines: { lineWidth: 2, fill: !1, fillColor: null, steps: !1 }, bars: {
                    show: !1, lineWidth: 2, barWidth: 1, fill: !0,
                    fillColor: null, align: "left", horizontal: !1, zero: !0
                }, shadowSize: 3, highlightColor: null
            }, grid: { show: !0, aboveData: !1, color: "#545454", backgroundColor: null, borderColor: null, tickColor: null, margin: 0, labelMargin: 5, axisMargin: 8, borderWidth: 2, minBorderMargin: null, markings: null, markingsColor: "#f4f4f4", markingsLineWidth: 2, clickable: !1, hoverable: !1, autoHighlight: !0, mouseActiveRadius: 10 }, interaction: { redrawOverlayInterval: 1e3 / 60 }, hooks: {}
        }, at = null, rt = null, lt = null, st = null, ct = null, ht = [], ft = [], ut = { left: 0, right: 0, top: 0, bottom: 0 }, dt = 0, pt = 0, mt = { processOptions: [], processRawData: [], processDatapoints: [], processOffset: [], drawBackground: [], drawSeries: [], draw: [], bindEvents: [], drawOverlay: [], shutdown: [] }, xt = this; xt.setData = h, xt.setupGrid = W, xt.draw = P, xt.getPlaceholder = function () { return e }, xt.getCanvas = function () { return at.element }, xt.getPlotOffset = function () { return ut }, xt.width = function () { return dt }, xt.height = function () { return pt }, xt.offset = function () { var t = lt.offset(); return t.left += ut.left, t.top += ut.top, t }, xt.getData = function () { return ot }, xt.getAxes = function () { var i = {}; return t.each(ht.concat(ft), function (t, e) { e && (i[e.direction + (1 != e.n ? e.n : "") + "axis"] = e) }), i }, xt.getXAxes = function () { return ht }, xt.getYAxes = function () { return ft }, xt.c2p = p, xt.p2c = m, xt.getOptions = function () { return nt }, xt.highlight = $, xt.unhighlight = K, xt.triggerRedrawOverlay = U, xt.pointOffset = function (t) { return { left: parseInt(ht[u(t, "x") - 1].p2c(+t.x) + ut.left, 10), top: parseInt(ft[u(t, "y") - 1].p2c(+t.y) + ut.top, 10) } }, xt.shutdown = y, xt.destroy = function () { y(), e.removeData("plot").empty(), ot = [], nt = null, at = null, rt = null, lt = null, st = null, ct = null, ht = [], ft = [], mt = null, gt = [], xt = null }, xt.resize = function () { var t = e.width(), i = e.height(); at.resize(t, i), rt.resize(t, i) }, xt.hooks = mt, s(xt), c(a), v(), h(n), W(), P(), k(); var gt = [], bt = null
    } function o(t, i) { return i * Math.floor(t / i) } var n = Object.prototype.hasOwnProperty; t.fn.detach || (t.fn.detach = function () { return this.each(function () { this.parentNode && this.parentNode.removeChild(this) }) }), i.prototype.resize = function (t, i) { if (0 >= t || 0 >= i) throw new Error("Invalid dimensions for plot, width = " + t + ", height = " + i); var e = this.element, o = this.context, n = this.pixelRatio; this.width != t && (e.width = t * n, e.style.width = t + "px", this.width = t), this.height != i && (e.height = i * n, e.style.height = i + "px", this.height = i), o.restore(), o.save(), o.scale(n, n) }, i.prototype.clear = function () { this.context.clearRect(0, 0, this.width, this.height) }, i.prototype.render = function () { var t = this._textCache; for (var i in t) if (n.call(t, i)) { var e = this.getTextLayer(i), o = t[i]; e.hide(); for (var a in o) if (n.call(o, a)) { var r = o[a]; for (var l in r) if (n.call(r, l)) { for (var s, c = r[l].positions, h = 0; s = c[h]; h++) s.active ? s.rendered || (e.append(s.element), s.rendered = !0) : (c.splice(h--, 1), s.rendered && s.element.detach()); 0 == c.length && delete r[l] } } e.show() } }, i.prototype.getTextLayer = function (i) { var e = this.text[i]; return null == e && (null == this.textContainer && (this.textContainer = t("<div class='flot-text'></div>").css({ position: "absolute", top: 0, left: 0, bottom: 0, right: 0, "font-size": "smaller", color: "#545454" }).insertAfter(this.element)), e = this.text[i] = t("<div></div>").addClass(i).css({ position: "absolute", top: 0, left: 0, bottom: 0, right: 0 }).appendTo(this.textContainer)), e }, i.prototype.getTextInfo = function (i, e, o, n, a) { var r, l, s, c; if (e = "" + e, r = "object" == typeof o ? o.style + " " + o.variant + " " + o.weight + " " + o.size + "px/" + o.lineHeight + "px " + o.family : o, l = this._textCache[i], null == l && (l = this._textCache[i] = {}), s = l[r], null == s && (s = l[r] = {}), c = s[e], null == c) { var h = t("<div></div>").html(e).css({ position: "absolute", "max-width": a, top: -9999 }).appendTo(this.getTextLayer(i)); "object" == typeof o ? h.css({ font: r, color: o.color }) : "string" == typeof o && h.addClass(o), c = s[e] = { width: h.outerWidth(!0), height: h.outerHeight(!0), element: h, positions: [] }, h.detach() } return c }, i.prototype.addText = function (t, i, e, o, n, a, r, l, s) { var c = this.getTextInfo(t, o, n, a, r), h = c.positions; "center" == l ? i -= c.width / 2 : "right" == l && (i -= c.width), "middle" == s ? e -= c.height / 2 : "bottom" == s && (e -= c.height); for (var f, u = 0; f = h[u]; u++) if (f.x == i && f.y == e) return void (f.active = !0); f = { active: !0, rendered: !1, element: h.length ? c.element.clone() : c.element, x: i, y: e }, h.push(f), f.element.css({ top: Math.round(e), left: Math.round(i), "text-align": l }) }, i.prototype.removeText = function (t, i, e, o, a, r) { if (null == o) { var l = this._textCache[t]; if (null != l) for (var s in l) if (n.call(l, s)) { var c = l[s]; for (var h in c) if (n.call(c, h)) for (var f, u = c[h].positions, d = 0; f = u[d]; d++) f.active = !1 } } else for (var f, u = this.getTextInfo(t, o, a, r).positions, d = 0; f = u[d]; d++) f.x == i && f.y == e && (f.active = !1) }, t.plot = function (i, o, n) { var a = new e(t(i), o, n, t.plot.plugins); return a }, t.plot.version = "0.8.3", t.plot.plugins = [], t.fn.plot = function (i, e) { return this.each(function () { t.plot(this, i, e) }) }
}(jQuery);
!function (e) { function t(e, t) { return t * Math.floor(e / t) } function n(e, t, n, r) { if ("function" == typeof e.strftime) return e.strftime(t); var a = function (e, t) { return e = "" + e, t = "" + (null == t ? "0" : t), 1 == e.length ? t + e : e }, i = [], o = !1, s = e.getHours(), u = 12 > s; null == n && (n = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]), null == r && (r = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]); var m; m = s > 12 ? s - 12 : 0 == s ? 12 : s; for (var c = 0; c < t.length; ++c) { var l = t.charAt(c); if (o) { switch (l) { case "a": l = "" + r[e.getDay()]; break; case "b": l = "" + n[e.getMonth()]; break; case "d": l = a(e.getDate()); break; case "e": l = a(e.getDate(), " "); break; case "h": case "H": l = a(s); break; case "I": l = a(m); break; case "l": l = a(m, " "); break; case "m": l = a(e.getMonth() + 1); break; case "M": l = a(e.getMinutes()); break; case "q": l = "" + (Math.floor(e.getMonth() / 3) + 1); break; case "S": l = a(e.getSeconds()); break; case "y": l = a(e.getFullYear() % 100); break; case "Y": l = "" + e.getFullYear(); break; case "p": l = u ? "am" : "pm"; break; case "P": l = u ? "AM" : "PM"; break; case "w": l = "" + e.getDay() } i.push(l), o = !1 } else "%" == l ? o = !0 : i.push(l) } return i.join("") } function r(e) { function t(e, t, n, r) { e[t] = function () { return n[r].apply(n, arguments) } } var n = { date: e }; void 0 != e.strftime && t(n, "strftime", e, "strftime"), t(n, "getTime", e, "getTime"), t(n, "setTime", e, "setTime"); for (var r = ["Date", "Day", "FullYear", "Hours", "Milliseconds", "Minutes", "Month", "Seconds"], a = 0; a < r.length; a++) t(n, "get" + r[a], e, "getUTC" + r[a]), t(n, "set" + r[a], e, "setUTC" + r[a]); return n } function a(e, t) { if ("browser" == t.timezone) return new Date(e); if (t.timezone && "utc" != t.timezone) { if ("undefined" != typeof timezoneJS && "undefined" != typeof timezoneJS.Date) { var n = new timezoneJS.Date; return n.setTimezone(t.timezone), n.setTime(e), n } return r(new Date(e)) } return r(new Date(e)) } function i(r) { r.hooks.processOptions.push(function (r, i) { e.each(r.getAxes(), function (e, r) { var i = r.options; "time" == i.mode && (r.tickGenerator = function (e) { var n = [], r = a(e.min, i), o = 0, u = i.tickSize && "quarter" === i.tickSize[1] || i.minTickSize && "quarter" === i.minTickSize[1] ? c : m; null != i.minTickSize && (o = "number" == typeof i.tickSize ? i.tickSize : i.minTickSize[0] * s[i.minTickSize[1]]); for (var l = 0; l < u.length - 1 && !(e.delta < (u[l][0] * s[u[l][1]] + u[l + 1][0] * s[u[l + 1][1]]) / 2 && u[l][0] * s[u[l][1]] >= o) ; ++l); var h = u[l][0], f = u[l][1]; if ("year" == f) { if (null != i.minTickSize && "year" == i.minTickSize[1]) h = Math.floor(i.minTickSize[0]); else { var k = Math.pow(10, Math.floor(Math.log(e.delta / s.year) / Math.LN10)), d = e.delta / s.year / k; h = 1.5 > d ? 1 : 3 > d ? 2 : 7.5 > d ? 5 : 10, h *= k } 1 > h && (h = 1) } e.tickSize = i.tickSize || [h, f]; var g = e.tickSize[0]; f = e.tickSize[1]; var M = g * s[f]; "second" == f ? r.setSeconds(t(r.getSeconds(), g)) : "minute" == f ? r.setMinutes(t(r.getMinutes(), g)) : "hour" == f ? r.setHours(t(r.getHours(), g)) : "month" == f ? r.setMonth(t(r.getMonth(), g)) : "quarter" == f ? r.setMonth(3 * t(r.getMonth() / 3, g)) : "year" == f && r.setFullYear(t(r.getFullYear(), g)), r.setMilliseconds(0), M >= s.minute && r.setSeconds(0), M >= s.hour && r.setMinutes(0), M >= s.day && r.setHours(0), M >= 4 * s.day && r.setDate(1), M >= 2 * s.month && r.setMonth(t(r.getMonth(), 3)), M >= 2 * s.quarter && r.setMonth(t(r.getMonth(), 6)), M >= s.year && r.setMonth(0); var y, S = 0, z = Number.NaN; do if (y = z, z = r.getTime(), n.push(z), "month" == f || "quarter" == f) if (1 > g) { r.setDate(1); var p = r.getTime(); r.setMonth(r.getMonth() + ("quarter" == f ? 3 : 1)); var v = r.getTime(); r.setTime(z + S * s.hour + (v - p) * g), S = r.getHours(), r.setHours(0) } else r.setMonth(r.getMonth() + g * ("quarter" == f ? 3 : 1)); else "year" == f ? r.setFullYear(r.getFullYear() + g) : r.setTime(z + M); while (z < e.max && z != y); return n }, r.tickFormatter = function (e, t) { var r = a(e, t.options); if (null != i.timeformat) return n(r, i.timeformat, i.monthNames, i.dayNames); var o, u = t.options.tickSize && "quarter" == t.options.tickSize[1] || t.options.minTickSize && "quarter" == t.options.minTickSize[1], m = t.tickSize[0] * s[t.tickSize[1]], c = t.max - t.min, l = i.twelveHourClock ? " %p" : "", h = i.twelveHourClock ? "%I" : "%H"; o = m < s.minute ? h + ":%M:%S" + l : m < s.day ? c < 2 * s.day ? h + ":%M" + l : "%b %d " + h + ":%M" + l : m < s.month ? "%b %d" : u && m < s.quarter || !u && m < s.year ? c < s.year ? "%b" : "%b %Y" : u && m < s.year ? c < s.year ? "Q%q" : "Q%q %Y" : "%Y"; var f = n(r, o, i.monthNames, i.dayNames); return f }) }) }) } var o = { xaxis: { timezone: null, timeformat: null, twelveHourClock: !1, monthNames: null } }, s = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, month: 2592e6, quarter: 7776e6, year: 525949.2 * 60 * 1e3 }, u = [[1, "second"], [2, "second"], [5, "second"], [10, "second"], [30, "second"], [1, "minute"], [2, "minute"], [5, "minute"], [10, "minute"], [30, "minute"], [1, "hour"], [2, "hour"], [4, "hour"], [8, "hour"], [12, "hour"], [1, "day"], [2, "day"], [3, "day"], [.25, "month"], [.5, "month"], [1, "month"], [2, "month"]], m = u.concat([[3, "month"], [6, "month"], [1, "year"]]), c = u.concat([[1, "quarter"], [2, "quarter"], [1, "year"]]); e.plot.plugins.push({ init: i, options: o, name: "time", version: "1.0" }), e.plot.formatDate = n, e.plot.dateGenerator = a }(jQuery);
!function (o) { function e(o) { function e(e) { i.locked || -1 != i.x && (i.x = -1, o.triggerRedrawOverlay()) } function t(e) { if (!i.locked) { if (o.getSelection && o.getSelection()) return void (i.x = -1); var t = o.offset(); i.x = Math.max(0, Math.min(e.pageX - t.left, o.width())), i.y = Math.max(0, Math.min(e.pageY - t.top, o.height())), o.triggerRedrawOverlay() } } var i = { x: -1, y: -1, locked: !1 }; o.setCrosshair = function (e) { if (e) { var t = o.p2c(e); i.x = Math.max(0, Math.min(t.left, o.width())), i.y = Math.max(0, Math.min(t.top, o.height())) } else i.x = -1; o.triggerRedrawOverlay() }, o.clearCrosshair = o.setCrosshair, o.lockCrosshair = function (e) { e && o.setCrosshair(e), i.locked = !0 }, o.unlockCrosshair = function () { i.locked = !1 }, o.hooks.bindEvents.push(function (o, i) { o.getOptions().crosshair.mode && (i.mouseout(e), i.mousemove(t)) }), o.hooks.drawOverlay.push(function (o, e) { var t = o.getOptions().crosshair; if (t.mode) { var r = o.getPlotOffset(); if (e.save(), e.translate(r.left, r.top), -1 != i.x) { var n = o.getOptions().crosshair.lineWidth % 2 ? .5 : 0; if (e.strokeStyle = t.color, e.lineWidth = t.lineWidth, e.lineJoin = "round", e.beginPath(), -1 != t.mode.indexOf("x")) { var s = Math.floor(i.x) + n; e.moveTo(s, 0), e.lineTo(s, o.height()) } if (-1 != t.mode.indexOf("y")) { var a = Math.floor(i.y) + n; e.moveTo(0, a), e.lineTo(o.width(), a) } e.stroke() } e.restore() } }), o.hooks.shutdown.push(function (o, i) { i.unbind("mouseout", e), i.unbind("mousemove", t) }) } var t = { crosshair: { mode: null, color: "rgba(170, 0, 0, 0.80)", lineWidth: 1 } }; o.plot.plugins.push({ init: e, options: t, name: "crosshair", version: "1.0" }) }(jQuery);
/*
 * Metadata - jQuery plugin for parsing metadata from elements
 *
 * Copyright (c) 2006 John Resig, Yehuda Katz, Jörn Zaefferer, Paul McLanahan
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 * Revision: $Id: jquery.metadata.min.js,v 1.1.4.3.2.1 2009/09/24 00:39:19 mfb Exp $
 *
 */
(function($){$.extend({metadata:{defaults:{type:"class",name:"metadata",cre:/({.*})/,single:"metadata"},setType:function(type,name){this.defaults.type=type;this.defaults.name=name},get:function(elem,opts){var settings=$.extend({},this.defaults,opts);if(!settings.single.length){settings.single="metadata"}var data=$.data(elem,settings.single);if(data){return data}data="{}";var getData=function(data){if(typeof data!="string"){return data}if(data.indexOf("{")<0){data=eval("("+data+")")}};var getObject=function(data){if(typeof data!="string"){return data}data=eval("("+data+")");return data};if(settings.type=="html5"){var object={};$(elem.attributes).each(function(){var name=this.nodeName;if(name.match(/^data-/)){name=name.replace(/^data-/,"")}else{return true}object[name]=getObject(this.nodeValue)})}else{if(settings.type=="class"){var m=settings.cre.exec(elem.className);if(m){data=m[1]}}else{if(settings.type=="elem"){if(!elem.getElementsByTagName){return}var e=elem.getElementsByTagName(settings.name);if(e.length){data=$.trim(e[0].innerHTML)}}else{if(elem.getAttribute!=undefined){var attr=elem.getAttribute(settings.name);if(attr){data=attr}}}}object=getObject(data.indexOf("{")<0?"{"+data+"}":data)}$.data(elem,settings.single,object);return object}}});$.fn.metadata=function(opts){return $.metadata.get(this[0],opts)}})(jQuery);

//Note: Microsoft Corporation is not the original author of this script file. Microsoft obtained the original file from http://plugins.jquery.com/project/number_format under the license that is referred to below. That license and the other notices below are provided for informational purposes only and are not the license terms under which Microsoft distributes this file. Microsoft grants you the right to use this file for the sole purpose of either: (i) interacting through your browser with the Microsoft web site hosting this file, subject to that web site�s terms of use; or (ii) using this file in conjunction with the Microsoft product with which it was distributed subject to that product�s End User License Agreement. Microsoft reserves all other rights and grants no additional rights, whether by implication, estoppel or otherwise.

/**
* jquery.numberformatter - Formatting/Parsing Numbers in jQuery
* 
* Written by
* Michael Abernethy (mike@abernethysoft.com),
* Andrew Parry (aparry0@gmail.com)
*
* Dual licensed under the MIT (MIT-LICENSE.txt)
* and GPL (GPL-LICENSE.txt) licenses.
*
* @author Michael Abernethy, Andrew Parry
* @version 1.2.1-RELEASE ($Id$)
* 
* Dependencies
* 
* jQuery (http://jquery.com)
* jshashtable (http://www.timdown.co.uk/jshashtable)
* 
**/

(function(k){var a=new Hashtable();var f=["ae","au","ca","cn","eg","gb","hk","il","in","jp","sk","th","tw","us"];var b=["at","br","de","dk","es","gr","it","nl","pt","tr","vn"];var i=["cz","fi","fr","ru","se","pl"];var d=["ch"];var g=[[".",","],[",","."],[","," "],[".","'"]];var c=[f,b,i,d];function j(n,l,m){this.dec=n;this.group=l;this.neg=m}function h(){for(var l in c){localeGroup=c[l];for(var m=0;m<localeGroup.length;m++){a.put(localeGroup[m],l)}}}function e(l){if(a.size()==0){h()}var q=".";var o=",";var p="-";var n=a.get(l);if(n){var m=g[n];if(m){q=m[0];o=m[1]}}return new j(q,o,p)}k.fn.formatNumber=function(l,m,n){return this.each(function(){if(m==null){m=true}if(n==null){n=true}var p;if(k(this).is(":input")){p=new String(k(this).val())}else{p=new String(k(this).text())}var o=k.formatNumber(p,l);if(m){if(k(this).is(":input")){k(this).val(o)}else{k(this).text(o)}}if(n){return o}})};k.formatNumber=function(q,w){var w=k.extend({},k.fn.formatNumber.defaults,w);var l=e(w.locale.toLowerCase());var n=l.dec;var u=l.group;var o=l.neg;var m="0#-,.";var t="";var s=false;for(var r=0;r<w.format.length;r++){if(m.indexOf(w.format.charAt(r))==-1){t=t+w.format.charAt(r)}else{if(r==0&&w.format.charAt(r)=="-"){s=true;continue}else{break}}}var v="";for(var r=w.format.length-1;r>=0;r--){if(m.indexOf(w.format.charAt(r))==-1){v=w.format.charAt(r)+v}else{break}}w.format=w.format.substring(t.length);w.format=w.format.substring(0,w.format.length-v.length);var p=new Number(q);return k._formatNumber(p,w,v,t,s)};k._formatNumber=function(m,q,n,F,s){var q=k.extend({},k.fn.formatNumber.defaults,q);var D=e(q.locale.toLowerCase());var C=D.dec;var v=D.group;var l=D.neg;var x=false;if(isNaN(m)){if(q.nanForceZero==true){m=0;x=true}else{return null}}if(n=="%"){m=m*100}var z="";if(q.format.indexOf(".")>-1){var E=C;var t=q.format.substring(q.format.lastIndexOf(".")+1);if(q.round==true){m=new Number(m.toFixed(t.length))}else{var I=m.toString();I=I.substring(0,I.lastIndexOf(".")+t.length+1);m=new Number(I)}var y=m%1;var A=new String(y.toFixed(t.length));A=A.substring(A.lastIndexOf(".")+1);for(var G=0;G<t.length;G++){if(t.charAt(G)=="#"&&A.charAt(G)!="0"){E+=A.charAt(G);continue}else{if(t.charAt(G)=="#"&&A.charAt(G)=="0"){var r=A.substring(G);if(r.match("[1-9]")){E+=A.charAt(G);continue}else{break}}else{if(t.charAt(G)=="0"){E+=A.charAt(G)}}}}z+=E}else{m=Math.round(m)}var u=Math.floor(m);if(m<0){u=Math.ceil(m)}var B="";if(q.format.indexOf(".")==-1){B=q.format}else{B=q.format.substring(0,q.format.indexOf("."))}var H="";if(!(u==0&&B.substr(-1,1)=="#")||x){var w=new String(Math.abs(u));var p=9999;if(B.lastIndexOf(",")!=-1){p=B.length-B.lastIndexOf(",")-1}var o=0;for(var G=w.length-1;G>-1;G--){H=w.charAt(G)+H;o++;if(o==p&&G!=0){H=v+H;o=0}}}z=H+z;if(m<0&&s&&F.length>0){F=l+F}else{if(m<0){z=l+z}}if(!q.decimalSeparatorAlwaysShown){if(z.lastIndexOf(C)==z.length-1){z=z.substring(0,z.length-1)}}z=F+z+n;return z};k.fn.parseNumber=function(l,m,o){if(m==null){m=true}if(o==null){o=true}var p;if(k(this).is(":input")){p=new String(k(this).val())}else{p=new String(k(this).text())}var n=k.parseNumber(p,l);if(n){if(m){if(k(this).is(":input")){k(this).val(n.toString())}else{k(this).text(n.toString())}}if(o){return n}}};k.parseNumber=function(r,v){var v=k.extend({},k.fn.parseNumber.defaults,v);var m=e(v.locale.toLowerCase());var o=m.dec;var t=m.group;var p=m.neg;var l="1234567890.-";while(r.indexOf(t)>-1){r=r.replace(t,"")}r=r.replace(o,".").replace(p,"-");var u="";var n=false;if(r.charAt(r.length-1)=="%"){n=true}for(var s=0;s<r.length;s++){if(l.indexOf(r.charAt(s))>-1){u=u+r.charAt(s)}}var q=new Number(u);if(n){q=q/100;q=q.toFixed(u.length-1)}return q};k.fn.parseNumber.defaults={locale:"us",decimalSeparatorAlwaysShown:false};k.fn.formatNumber.defaults={format:"#,###.00",locale:"us",decimalSeparatorAlwaysShown:false,nanForceZero:true,round:true}})(jQuery);
/* jquery.sparkline 2.1.2 - http://omnipotent.net/jquery.sparkline/ 
** Licensed under the New BSD License - see above site for details */

(function(a,b,c){(function(a){typeof define=="function"&&define.amd?define(["jquery"],a):jQuery&&!jQuery.fn.sparkline&&a(jQuery)})(function(d){"use strict";var e={},f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,K,L=0;f=function(){return{common:{type:"line",lineColor:"#00f",fillColor:"#cdf",defaultPixelsPerValue:3,width:"auto",height:"auto",composite:!1,tagValuesAttribute:"values",tagOptionsPrefix:"spark",enableTagOptions:!1,enableHighlight:!0,highlightLighten:1.4,tooltipSkipNull:!0,tooltipPrefix:"",tooltipSuffix:"",disableHiddenCheck:!1,numberFormatter:!1,numberDigitGroupCount:3,numberDigitGroupSep:",",numberDecimalMark:".",disableTooltips:!1,disableInteraction:!1},line:{spotColor:"#f80",highlightSpotColor:"#5f5",highlightLineColor:"#f22",spotRadius:1.5,minSpotColor:"#f80",maxSpotColor:"#f80",lineWidth:1,normalRangeMin:c,normalRangeMax:c,normalRangeColor:"#ccc",drawNormalOnTop:!1,chartRangeMin:c,chartRangeMax:c,chartRangeMinX:c,chartRangeMaxX:c,tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{prefix}}{{y}}{{suffix}}')},bar:{barColor:"#3366cc",negBarColor:"#f44",stackedBarColor:["#3366cc","#dc3912","#ff9900","#109618","#66aa00","#dd4477","#0099c6","#990099"],zeroColor:c,nullColor:c,zeroAxis:!0,barWidth:4,barSpacing:1,chartRangeMax:c,chartRangeMin:c,chartRangeClip:!1,colorMap:c,tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{prefix}}{{value}}{{suffix}}')},tristate:{barWidth:4,barSpacing:1,posBarColor:"#6f6",negBarColor:"#f44",zeroBarColor:"#999",colorMap:{},tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{value:map}}'),tooltipValueLookups:{map:{"-1":"Loss",0:"Draw",1:"Win"}}},discrete:{lineHeight:"auto",thresholdColor:c,thresholdValue:0,chartRangeMax:c,chartRangeMin:c,chartRangeClip:!1,tooltipFormat:new h("{{prefix}}{{value}}{{suffix}}")},bullet:{targetColor:"#f33",targetWidth:3,performanceColor:"#33f",rangeColors:["#d3dafe","#a8b6ff","#7f94ff"],base:c,tooltipFormat:new h("{{fieldkey:fields}} - {{value}}"),tooltipValueLookups:{fields:{r:"Range",p:"Performance",t:"Target"}}},pie:{offset:0,sliceColors:["#3366cc","#dc3912","#ff9900","#109618","#66aa00","#dd4477","#0099c6","#990099"],borderWidth:0,borderColor:"#000",tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{value}} ({{percent.1}}%)')},box:{raw:!1,boxLineColor:"#000",boxFillColor:"#cdf",whiskerColor:"#000",outlierLineColor:"#333",outlierFillColor:"#fff",medianColor:"#f00",showOutliers:!0,outlierIQR:1.5,spotRadius:1.5,target:c,targetColor:"#4a2",chartRangeMax:c,chartRangeMin:c,tooltipFormat:new h("{{field:fields}}: {{value}}"),tooltipFormatFieldlistKey:"field",tooltipValueLookups:{fields:{lq:"Lower Quartile",med:"Median",uq:"Upper Quartile",lo:"Left Outlier",ro:"Right Outlier",lw:"Left Whisker",rw:"Right Whisker"}}}}},E='.jqstooltip { position: absolute;left: 0px;top: 0px;visibility: hidden;background: rgb(0, 0, 0) transparent;background-color: rgba(0,0,0,0.6);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=#99000000, endColorstr=#99000000);-ms-filter: "progid:DXImageTransform.Microsoft.gradient(startColorstr=#99000000, endColorstr=#99000000)";color: white;font: 10px arial, san serif;text-align: left;white-space: nowrap;padding: 5px;border: 1px solid white;z-index: 10000;}.jqsfield { color: white;font: 10px arial, san serif;text-align: left;}',g=function(){var a,b;return a=function(){this.init.apply(this,arguments)},arguments.length>1?(arguments[0]?(a.prototype=d.extend(new arguments[0],arguments[arguments.length-1]),a._super=arguments[0].prototype):a.prototype=arguments[arguments.length-1],arguments.length>2&&(b=Array.prototype.slice.call(arguments,1,-1),b.unshift(a.prototype),d.extend.apply(d,b))):a.prototype=arguments[0],a.prototype.cls=a,a},d.SPFormatClass=h=g({fre:/\{\{([\w.]+?)(:(.+?))?\}\}/g,precre:/(\w+)\.(\d+)/,init:function(a,b){this.format=a,this.fclass=b},render:function(a,b,d){var e=this,f=a,g,h,i,j,k;return this.format.replace(this.fre,function(){var a;return h=arguments[1],i=arguments[3],g=e.precre.exec(h),g?(k=g[2],h=g[1]):k=!1,j=f[h],j===c?"":i&&b&&b[i]?(a=b[i],a.get?b[i].get(j)||j:b[i][j]||j):(n(j)&&(d.get("numberFormatter")?j=d.get("numberFormatter")(j):j=s(j,k,d.get("numberDigitGroupCount"),d.get("numberDigitGroupSep"),d.get("numberDecimalMark"))),j)})}}),d.spformat=function(a,b){return new h(a,b)},i=function(a,b,c){return a<b?b:a>c?c:a},j=function(a,c){var d;return c===2?(d=b.floor(a.length/2),a.length%2?a[d]:(a[d-1]+a[d])/2):a.length%2?(d=(a.length*c+c)/4,d%1?(a[b.floor(d)]+a[b.floor(d)-1])/2:a[d-1]):(d=(a.length*c+2)/4,d%1?(a[b.floor(d)]+a[b.floor(d)-1])/2:a[d-1])},k=function(a){var b;switch(a){case"undefined":a=c;break;case"null":a=null;break;case"true":a=!0;break;case"false":a=!1;break;default:b=parseFloat(a),a==b&&(a=b)}return a},l=function(a){var b,c=[];for(b=a.length;b--;)c[b]=k(a[b]);return c},m=function(a,b){var c,d,e=[];for(c=0,d=a.length;c<d;c++)a[c]!==b&&e.push(a[c]);return e},n=function(a){return!isNaN(parseFloat(a))&&isFinite(a)},s=function(a,b,c,e,f){var g,h;a=(b===!1?parseFloat(a).toString():a.toFixed(b)).split(""),g=(g=d.inArray(".",a))<0?a.length:g,g<a.length&&(a[g]=f);for(h=g-c;h>0;h-=c)a.splice(h,0,e);return a.join("")},o=function(a,b,c){var d;for(d=b.length;d--;){if(c&&b[d]===null)continue;if(b[d]!==a)return!1}return!0},p=function(a){var b=0,c;for(c=a.length;c--;)b+=typeof a[c]=="number"?a[c]:0;return b},r=function(a){return d.isArray(a)?a:[a]},q=function(b){var c;a.createStyleSheet?a.createStyleSheet().cssText=b:(c=a.createElement("style"),c.type="text/css",a.getElementsByTagName("head")[0].appendChild(c),c[typeof a.body.style.WebkitAppearance=="string"?"innerText":"innerHTML"]=b)},d.fn.simpledraw=function(b,e,f,g){var h,i;if(f&&(h=this.data("_jqs_vcanvas")))return h;if(d.fn.sparkline.canvas===!1)return!1;if(d.fn.sparkline.canvas===c){var j=a.createElement("canvas");if(!j.getContext||!j.getContext("2d")){if(!a.namespaces||!!a.namespaces.v)return d.fn.sparkline.canvas=!1,!1;a.namespaces.add("v","urn:schemas-microsoft-com:vml","#default#VML"),d.fn.sparkline.canvas=function(a,b,c,d){return new J(a,b,c)}}else d.fn.sparkline.canvas=function(a,b,c,d){return new I(a,b,c,d)}}return b===c&&(b=d(this).innerWidth()),e===c&&(e=d(this).innerHeight()),h=d.fn.sparkline.canvas(b,e,this,g),i=d(this).data("_jqs_mhandler"),i&&i.registerCanvas(h),h},d.fn.cleardraw=function(){var a=this.data("_jqs_vcanvas");a&&a.reset()},d.RangeMapClass=t=g({init:function(a){var b,c,d=[];for(b in a)a.hasOwnProperty(b)&&typeof b=="string"&&b.indexOf(":")>-1&&(c=b.split(":"),c[0]=c[0].length===0?-Infinity:parseFloat(c[0]),c[1]=c[1].length===0?Infinity:parseFloat(c[1]),c[2]=a[b],d.push(c));this.map=a,this.rangelist=d||!1},get:function(a){var b=this.rangelist,d,e,f;if((f=this.map[a])!==c)return f;if(b)for(d=b.length;d--;){e=b[d];if(e[0]<=a&&e[1]>=a)return e[2]}return c}}),d.range_map=function(a){return new t(a)},u=g({init:function(a,b){var c=d(a);this.$el=c,this.options=b,this.currentPageX=0,this.currentPageY=0,this.el=a,this.splist=[],this.tooltip=null,this.over=!1,this.displayTooltips=!b.get("disableTooltips"),this.highlightEnabled=!b.get("disableHighlight")},registerSparkline:function(a){this.splist.push(a),this.over&&this.updateDisplay()},registerCanvas:function(a){var b=d(a.canvas);this.canvas=a,this.$canvas=b,b.mouseenter(d.proxy(this.mouseenter,this)),b.mouseleave(d.proxy(this.mouseleave,this)),b.click(d.proxy(this.mouseclick,this))},reset:function(a){this.splist=[],this.tooltip&&a&&(this.tooltip.remove(),this.tooltip=c)},mouseclick:function(a){var b=d.Event("sparklineClick");b.originalEvent=a,b.sparklines=this.splist,this.$el.trigger(b)},mouseenter:function(b){d(a.body).unbind("mousemove.jqs"),d(a.body).bind("mousemove.jqs",d.proxy(this.mousemove,this)),this.over=!0,this.currentPageX=b.pageX,this.currentPageY=b.pageY,this.currentEl=b.target,!this.tooltip&&this.displayTooltips&&(this.tooltip=new v(this.options),this.tooltip.updatePosition(b.pageX,b.pageY)),this.updateDisplay()},mouseleave:function(){d(a.body).unbind("mousemove.jqs");var b=this.splist,c=b.length,e=!1,f,g;this.over=!1,this.currentEl=null,this.tooltip&&(this.tooltip.remove(),this.tooltip=null);for(g=0;g<c;g++)f=b[g],f.clearRegionHighlight()&&(e=!0);e&&this.canvas.render()},mousemove:function(a){this.currentPageX=a.pageX,this.currentPageY=a.pageY,this.currentEl=a.target,this.tooltip&&this.tooltip.updatePosition(a.pageX,a.pageY),this.updateDisplay()},updateDisplay:function(){var a=this.splist,b=a.length,c=!1,e=this.$canvas.offset(),f=this.currentPageX-e.left,g=this.currentPageY-e.top,h,i,j,k,l;if(!this.over)return;for(j=0;j<b;j++)i=a[j],k=i.setRegionHighlight(this.currentEl,f,g),k&&(c=!0);if(c){l=d.Event("sparklineRegionChange"),l.sparklines=this.splist,this.$el.trigger(l);if(this.tooltip){h="";for(j=0;j<b;j++)i=a[j],h+=i.getCurrentRegionTooltip();this.tooltip.setContent(h)}this.disableHighlight||this.canvas.render()}k===null&&this.mouseleave()}}),v=g({sizeStyle:"position: static !important;display: block !important;visibility: hidden !important;float: left !important;",init:function(b){var c=b.get("tooltipClassname","jqstooltip"),e=this.sizeStyle,f;this.container=b.get("tooltipContainer")||a.body,this.tooltipOffsetX=b.get("tooltipOffsetX",10),this.tooltipOffsetY=b.get("tooltipOffsetY",12),d("#jqssizetip").remove(),d("#jqstooltip").remove(),this.sizetip=d("<div/>",{id:"jqssizetip",style:e,"class":c}),this.tooltip=d("<div/>",{id:"jqstooltip","class":c}).appendTo(this.container),f=this.tooltip.offset(),this.offsetLeft=f.left,this.offsetTop=f.top,this.hidden=!0,d(window).unbind("resize.jqs scroll.jqs"),d(window).bind("resize.jqs scroll.jqs",d.proxy(this.updateWindowDims,this)),this.updateWindowDims()},updateWindowDims:function(){this.scrollTop=d(window).scrollTop(),this.scrollLeft=d(window).scrollLeft(),this.scrollRight=this.scrollLeft+d(window).width(),this.updatePosition()},getSize:function(a){this.sizetip.html(a).appendTo(this.container),this.width=this.sizetip.width()+1,this.height=this.sizetip.height(),this.sizetip.remove()},setContent:function(a){if(!a){this.tooltip.css("visibility","hidden"),this.hidden=!0;return}this.getSize(a),this.tooltip.html(a).css({width:this.width,height:this.height,visibility:"visible"}),this.hidden&&(this.hidden=!1,this.updatePosition())},updatePosition:function(a,b){if(a===c){if(this.mousex===c)return;a=this.mousex-this.offsetLeft,b=this.mousey-this.offsetTop}else this.mousex=a-=this.offsetLeft,this.mousey=b-=this.offsetTop;if(!this.height||!this.width||this.hidden)return;b-=this.height+this.tooltipOffsetY,a+=this.tooltipOffsetX,b<this.scrollTop&&(b=this.scrollTop),a<this.scrollLeft?a=this.scrollLeft:a+this.width>this.scrollRight&&(a=this.scrollRight-this.width),this.tooltip.css({left:a,top:b})},remove:function(){this.tooltip.remove(),this.sizetip.remove(),this.sizetip=this.tooltip=c,d(window).unbind("resize.jqs scroll.jqs")}}),F=function(){q(E)},d(F),K=[],d.fn.sparkline=function(b,e){return this.each(function(){var f=new d.fn.sparkline.options(this,e),g=d(this),h,i;h=function(){var e,h,i,j,k,l,m;if(b==="html"||b===c){m=this.getAttribute(f.get("tagValuesAttribute"));if(m===c||m===null)m=g.html();e=m.replace(/(^\s*<!--)|(-->\s*$)|\s+/g,"").split(",")}else e=b;h=f.get("width")==="auto"?e.length*f.get("defaultPixelsPerValue"):f.get("width");if(f.get("height")==="auto"){if(!f.get("composite")||!d.data(this,"_jqs_vcanvas"))j=a.createElement("span"),j.innerHTML="a",g.html(j),i=d(j).innerHeight()||d(j).height(),d(j).remove(),j=null}else i=f.get("height");f.get("disableInteraction")?k=!1:(k=d.data(this,"_jqs_mhandler"),k?f.get("composite")||k.reset():(k=new u(this,f),d.data(this,"_jqs_mhandler",k)));if(f.get("composite")&&!d.data(this,"_jqs_vcanvas")){d.data(this,"_jqs_errnotify")||(alert("Attempted to attach a composite sparkline to an element with no existing sparkline"),d.data(this,"_jqs_errnotify",!0));return}l=new(d.fn.sparkline[f.get("type")])(this,e,f,h,i),l.render(),k&&k.registerSparkline(l)};if(d(this).html()&&!f.get("disableHiddenCheck")&&d(this).is(":hidden")||!d(this).parents("body").length){if(!f.get("composite")&&d.data(this,"_jqs_pending"))for(i=K.length;i;i--)K[i-1][0]==this&&K.splice(i-1,1);K.push([this,h]),d.data(this,"_jqs_pending",!0)}else h.call(this)})},d.fn.sparkline.defaults=f(),d.sparkline_display_visible=function(){var a,b,c,e=[];for(b=0,c=K.length;b<c;b++)a=K[b][0],d(a).is(":visible")&&!d(a).parents().is(":hidden")?(K[b][1].call(a),d.data(K[b][0],"_jqs_pending",!1),e.push(b)):!d(a).closest("html").length&&!d.data(a,"_jqs_pending")&&(d.data(K[b][0],"_jqs_pending",!1),e.push(b));for(b=e.length;b;b--)K.splice(e[b-1],1)},d.fn.sparkline.options=g({init:function(a,b){var c,f,g,h;this.userOptions=b=b||{},this.tag=a,this.tagValCache={},f=d.fn.sparkline.defaults,g=f.common,this.tagOptionsPrefix=b.enableTagOptions&&(b.tagOptionsPrefix||g.tagOptionsPrefix),h=this.getTagSetting("type"),h===e?c=f[b.type||g.type]:c=f[h],this.mergedOptions=d.extend({},g,c,b)},getTagSetting:function(a){var b=this.tagOptionsPrefix,d,f,g,h;if(b===!1||b===c)return e;if(this.tagValCache.hasOwnProperty(a))d=this.tagValCache.key;else{d=this.tag.getAttribute(b+a);if(d===c||d===null)d=e;else if(d.substr(0,1)==="["){d=d.substr(1,d.length-2).split(",");for(f=d.length;f--;)d[f]=k(d[f].replace(/(^\s*)|(\s*$)/g,""))}else if(d.substr(0,1)==="{"){g=d.substr(1,d.length-2).split(","),d={};for(f=g.length;f--;)h=g[f].split(":",2),d[h[0].replace(/(^\s*)|(\s*$)/g,"")]=k(h[1].replace(/(^\s*)|(\s*$)/g,""))}else d=k(d);this.tagValCache.key=d}return d},get:function(a,b){var d=this.getTagSetting(a),f;return d!==e?d:(f=this.mergedOptions[a])===c?b:f}}),d.fn.sparkline._base=g({disabled:!1,init:function(a,b,e,f,g){this.el=a,this.$el=d(a),this.values=b,this.options=e,this.width=f,this.height=g,this.currentRegion=c},initTarget:function(){var a=!this.options.get("disableInteraction");(this.target=this.$el.simpledraw(this.width,this.height,this.options.get("composite"),a))?(this.canvasWidth=this.target.pixelWidth,this.canvasHeight=this.target.pixelHeight):this.disabled=!0},render:function(){return this.disabled?(this.el.innerHTML="",!1):!0},getRegion:function(a,b){},setRegionHighlight:function(a,b,d){var e=this.currentRegion,f=!this.options.get("disableHighlight"),g;return b>this.canvasWidth||d>this.canvasHeight||b<0||d<0?null:(g=this.getRegion(a,b,d),e!==g?(e!==c&&f&&this.removeHighlight(),this.currentRegion=g,g!==c&&f&&this.renderHighlight(),!0):!1)},clearRegionHighlight:function(){return this.currentRegion!==c?(this.removeHighlight(),this.currentRegion=c,!0):!1},renderHighlight:function(){this.changeHighlight(!0)},removeHighlight:function(){this.changeHighlight(!1)},changeHighlight:function(a){},getCurrentRegionTooltip:function(){var a=this.options,b="",e=[],f,g,i,j,k,l,m,n,o,p,q,r,s,t;if(this.currentRegion===c)return"";f=this.getCurrentRegionFields(),q=a.get("tooltipFormatter");if(q)return q(this,a,f);a.get("tooltipChartTitle")&&(b+='<div class="jqs jqstitle">'+a.get("tooltipChartTitle")+"</div>\n"),g=this.options.get("tooltipFormat");if(!g)return"";d.isArray(g)||(g=[g]),d.isArray(f)||(f=[f]),m=this.options.get("tooltipFormatFieldlist"),n=this.options.get("tooltipFormatFieldlistKey");if(m&&n){o=[];for(l=f.length;l--;)p=f[l][n],(t=d.inArray(p,m))!=-1&&(o[t]=f[l]);f=o}i=g.length,s=f.length;for(l=0;l<i;l++){r=g[l],typeof r=="string"&&(r=new h(r)),j=r.fclass||"jqsfield";for(t=0;t<s;t++)if(!f[t].isNull||!a.get("tooltipSkipNull"))d.extend(f[t],{prefix:a.get("tooltipPrefix"),suffix:a.get("tooltipSuffix")}),k=r.render(f[t],a.get("tooltipValueLookups"),a),e.push('<div class="'+j+'">'+k+"</div>")}return e.length?b+e.join("\n"):""},getCurrentRegionFields:function(){},calcHighlightColor:function(a,c){var d=c.get("highlightColor"),e=c.get("highlightLighten"),f,g,h,j;if(d)return d;if(e){f=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(a)||/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a);if(f){h=[],g=a.length===4?16:1;for(j=0;j<3;j++)h[j]=i(b.round(parseInt(f[j+1],16)*g*e),0,255);return"rgb("+h.join(",")+")"}}return a}}),w={changeHighlight:function(a){var b=this.currentRegion,c=this.target,e=this.regionShapes[b],f;e&&(f=this.renderRegion(b,a),d.isArray(f)||d.isArray(e)?(c.replaceWithShapes(e,f),this.regionShapes[b]=d.map(f,function(a){return a.id})):(c.replaceWithShape(e,f),this.regionShapes[b]=f.id))},render:function(){var a=this.values,b=this.target,c=this.regionShapes,e,f,g,h;if(!this.cls._super.render.call(this))return;for(g=a.length;g--;){e=this.renderRegion(g);if(e)if(d.isArray(e)){f=[];for(h=e.length;h--;)e[h].append(),f.push(e[h].id);c[g]=f}else e.append(),c[g]=e.id;else c[g]=null}b.render()}},d.fn.sparkline.line=x=g(d.fn.sparkline._base,{type:"line",init:function(a,b,c,d,e){x._super.init.call(this,a,b,c,d,e),this.vertices=[],this.regionMap=[],this.xvalues=[],this.yvalues=[],this.yminmax=[],this.hightlightSpotId=null,this.lastShapeId=null,this.initTarget()},getRegion:function(a,b,d){var e,f=this.regionMap;for(e=f.length;e--;)if(f[e]!==null&&b>=f[e][0]&&b<=f[e][1])return f[e][2];return c},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.yvalues[a]===null,x:this.xvalues[a],y:this.yvalues[a],color:this.options.get("lineColor"),fillColor:this.options.get("fillColor"),offset:a}},renderHighlight:function(){var a=this.currentRegion,b=this.target,d=this.vertices[a],e=this.options,f=e.get("spotRadius"),g=e.get("highlightSpotColor"),h=e.get("highlightLineColor"),i,j;if(!d)return;f&&g&&(i=b.drawCircle(d[0],d[1],f,c,g),this.highlightSpotId=i.id,b.insertAfterShape(this.lastShapeId,i)),h&&(j=b.drawLine(d[0],this.canvasTop,d[0],this.canvasTop+this.canvasHeight,h),this.highlightLineId=j.id,b.insertAfterShape(this.lastShapeId,j))},removeHighlight:function(){var a=this.target;this.highlightSpotId&&(a.removeShapeId(this.highlightSpotId),this.highlightSpotId=null),this.highlightLineId&&(a.removeShapeId(this.highlightLineId),this.highlightLineId=null)},scanValues:function(){var a=this.values,c=a.length,d=this.xvalues,e=this.yvalues,f=this.yminmax,g,h,i,j,k;for(g=0;g<c;g++)h=a[g],i=typeof a[g]=="string",j=typeof a[g]=="object"&&a[g]instanceof Array,k=i&&a[g].split(":"),i&&k.length===2?(d.push(Number(k[0])),e.push(Number(k[1])),f.push(Number(k[1]))):j?(d.push(h[0]),e.push(h[1]),f.push(h[1])):(d.push(g),a[g]===null||a[g]==="null"?e.push(null):(e.push(Number(h)),f.push(Number(h))));this.options.get("xvalues")&&(d=this.options.get("xvalues")),this.maxy=this.maxyorg=b.max.apply(b,f),this.miny=this.minyorg=b.min.apply(b,f),this.maxx=b.max.apply(b,d),this.minx=b.min.apply(b,d),this.xvalues=d,this.yvalues=e,this.yminmax=f},processRangeOptions:function(){var a=this.options,b=a.get("normalRangeMin"),d=a.get("normalRangeMax");b!==c&&(b<this.miny&&(this.miny=b),d>this.maxy&&(this.maxy=d)),a.get("chartRangeMin")!==c&&(a.get("chartRangeClip")||a.get("chartRangeMin")<this.miny)&&(this.miny=a.get("chartRangeMin")),a.get("chartRangeMax")!==c&&(a.get("chartRangeClip")||a.get("chartRangeMax")>this.maxy)&&(this.maxy=a.get("chartRangeMax")),a.get("chartRangeMinX")!==c&&(a.get("chartRangeClipX")||a.get("chartRangeMinX")<this.minx)&&(this.minx=a.get("chartRangeMinX")),a.get("chartRangeMaxX")!==c&&(a.get("chartRangeClipX")||a.get("chartRangeMaxX")>this.maxx)&&(this.maxx=a.get("chartRangeMaxX"))},drawNormalRange:function(a,d,e,f,g){var h=this.options.get("normalRangeMin"),i=this.options.get("normalRangeMax"),j=d+b.round(e-e*((i-this.miny)/g)),k=b.round(e*(i-h)/g);this.target.drawRect(a,j,f,k,c,this.options.get("normalRangeColor")).append()},render:function(){var a=this.options,e=this.target,f=this.canvasWidth,g=this.canvasHeight,h=this.vertices,i=a.get("spotRadius"),j=this.regionMap,k,l,m,n,o,p,q,r,s,u,v,w,y,z,A,B,C,D,E,F,G,H,I,J,K;if(!x._super.render.call(this))return;this.scanValues(),this.processRangeOptions(),I=this.xvalues,J=this.yvalues;if(!this.yminmax.length||this.yvalues.length<2)return;n=o=0,k=this.maxx-this.minx===0?1:this.maxx-this.minx,l=this.maxy-this.miny===0?1:this.maxy-this.miny,m=this.yvalues.length-1,i&&(f<i*4||g<i*4)&&(i=0);if(i){G=a.get("highlightSpotColor")&&!a.get("disableInteraction");if(G||a.get("minSpotColor")||a.get("spotColor")&&J[m]===this.miny)g-=b.ceil(i);if(G||a.get("maxSpotColor")||a.get("spotColor")&&J[m]===this.maxy)g-=b.ceil(i),n+=b.ceil(i);if(G||(a.get("minSpotColor")||a.get("maxSpotColor"))&&(J[0]===this.miny||J[0]===this.maxy))o+=b.ceil(i),f-=b.ceil(i);if(G||a.get("spotColor")||a.get("minSpotColor")||a.get("maxSpotColor")&&(J[m]===this.miny||J[m]===this.maxy))f-=b.ceil(i)}g--,a.get("normalRangeMin")!==c&&!a.get("drawNormalOnTop")&&this.drawNormalRange(o,n,g,f,l),q=[],r=[q],z=A=null,B=J.length;for(K=0;K<B;K++)s=I[K],v=I[K+1],u=J[K],w=o+b.round((s-this.minx)*(f/k)),y=K<B-1?o+b.round((v-this.minx)*(f/k)):f,A=w+(y-w)/2,j[K]=[z||0,A,K],z=A,u===null?K&&(J[K-1]!==null&&(q=[],r.push(q)),h.push(null)):(u<this.miny&&(u=this.miny),u>this.maxy&&(u=this.maxy),q.length||q.push([w,n+g]),p=[w,n+b.round(g-g*((u-this.miny)/l))],q.push(p),h.push(p));C=[],D=[],E=r.length;for(K=0;K<E;K++)q=r[K],q.length&&(a.get("fillColor")&&(q.push([q[q.length-1][0],n+g]),D.push(q.slice(0)),q.pop()),q.length>2&&(q[0]=[q[0][0],q[1][1]]),C.push(q));E=D.length;for(K=0;K<E;K++)e.drawShape(D[K],a.get("fillColor"),a.get("fillColor")).append();a.get("normalRangeMin")!==c&&a.get("drawNormalOnTop")&&this.drawNormalRange(o,n,g,f,l),E=C.length;for(K=0;K<E;K++)e.drawShape(C[K],a.get("lineColor"),c,a.get("lineWidth")).append();if(i&&a.get("valueSpots")){F=a.get("valueSpots"),F.get===c&&(F=new t(F));for(K=0;K<B;K++)H=F.get(J[K]),H&&e.drawCircle(o+b.round((I[K]-this.minx)*(f/k)),n+b.round(g-g*((J[K]-this.miny)/l)),i,c,H).append()}i&&a.get("spotColor")&&J[m]!==null&&e.drawCircle(o+b.round((I[I.length-1]-this.minx)*(f/k)),n+b.round(g-g*((J[m]-this.miny)/l)),i,c,a.get("spotColor")).append(),this.maxy!==this.minyorg&&(i&&a.get("minSpotColor")&&(s=I[d.inArray(this.minyorg,J)],e.drawCircle(o+b.round((s-this.minx)*(f/k)),n+b.round(g-g*((this.minyorg-this.miny)/l)),i,c,a.get("minSpotColor")).append()),i&&a.get("maxSpotColor")&&(s=I[d.inArray(this.maxyorg,J)],e.drawCircle(o+b.round((s-this.minx)*(f/k)),n+b.round(g-g*((this.maxyorg-this.miny)/l)),i,c,a.get("maxSpotColor")).append())),this.lastShapeId=e.getLastShapeId(),this.canvasTop=n,e.render()}}),d.fn.sparkline.bar=y=g(d.fn.sparkline._base,w,{type:"bar",init:function(a,e,f,g,h){var j=parseInt(f.get("barWidth"),10),n=parseInt(f.get("barSpacing"),10),o=f.get("chartRangeMin"),p=f.get("chartRangeMax"),q=f.get("chartRangeClip"),r=Infinity,s=-Infinity,u,v,w,x,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R;y._super.init.call(this,a,e,f,g,h);for(A=0,B=e.length;A<B;A++){O=e[A],u=typeof O=="string"&&O.indexOf(":")>-1;if(u||d.isArray(O))J=!0,u&&(O=e[A]=l(O.split(":"))),O=m(O,null),v=b.min.apply(b,O),w=b.max.apply(b,O),v<r&&(r=v),w>s&&(s=w)}this.stacked=J,this.regionShapes={},this.barWidth=j,this.barSpacing=n,this.totalBarWidth=j+n,this.width=g=e.length*j+(e.length-1)*n,this.initTarget(),q&&(H=o===c?-Infinity:o,I=p===c?Infinity:p),z=[],x=J?[]:z;var S=[],T=[];for(A=0,B=e.length;A<B;A++)if(J){K=e[A],e[A]=N=[],S[A]=0,x[A]=T[A]=0;for(L=0,M=K.length;L<M;L++)O=N[L]=q?i(K[L],H,I):K[L],O!==null&&(O>0&&(S[A]+=O),r<0&&s>0?O<0?T[A]+=b.abs(O):x[A]+=O:x[A]+=b.abs(O-(O<0?s:r)),z.push(O))}else O=q?i(e[A],H,I):e[A],O=e[A]=k(O),O!==null&&z.push(O);this.max=G=b.max.apply(b,z),this.min=F=b.min.apply(b,z),this.stackMax=s=J?b.max.apply(b,S):G,this.stackMin=r=J?b.min.apply(b,z):F,f.get("chartRangeMin")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMin")<F)&&(F=f.get("chartRangeMin")),f.get("chartRangeMax")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMax")>G)&&(G=f.get("chartRangeMax")),this.zeroAxis=D=f.get("zeroAxis",!0),F<=0&&G>=0&&D?E=0:D==0?E=F:F>0?E=F:E=G,this.xaxisOffset=E,C=J?b.max.apply(b,x)+b.max.apply(b,T):G-F,this.canvasHeightEf=D&&F<0?this.canvasHeight-2:this.canvasHeight-1,F<E?(Q=J&&G>=0?s:G,P=(Q-E)/C*this.canvasHeight,P!==b.ceil(P)&&(this.canvasHeightEf-=2,P=b.ceil(P))):P=this.canvasHeight,this.yoffset=P,d.isArray(f.get("colorMap"))?(this.colorMapByIndex=f.get("colorMap"),this.colorMapByValue=null):(this.colorMapByIndex=null,this.colorMapByValue=f.get("colorMap"),this.colorMapByValue&&this.colorMapByValue.get===c&&(this.colorMapByValue=new t(this.colorMapByValue))),this.range=C},getRegion:function(a,d,e){var f=b.floor(d/this.totalBarWidth);return f<0||f>=this.values.length?c:f},getCurrentRegionFields:function(){var a=this.currentRegion,b=r(this.values[a]),c=[],d,e;for(e=b.length;e--;)d=b[e],c.push({isNull:d===null,value:d,color:this.calcColor(e,d,a),offset:a});return c},calcColor:function(a,b,e){var f=this.colorMapByIndex,g=this.colorMapByValue,h=this.options,i,j;return this.stacked?i=h.get("stackedBarColor"):i=b<0?h.get("negBarColor"):h.get("barColor"),b===0&&h.get("zeroColor")!==c&&(i=h.get("zeroColor")),g&&(j=g.get(b))?i=j:f&&f.length>e&&(i=f[e]),d.isArray(i)?i[a%i.length]:i},renderRegion:function(a,e){var f=this.values[a],g=this.options,h=this.xaxisOffset,i=[],j=this.range,k=this.stacked,l=this.target,m=a*this.totalBarWidth,n=this.canvasHeightEf,p=this.yoffset,q,r,s,t,u,v,w,x,y,z;f=d.isArray(f)?f:[f],w=f.length,x=f[0],t=o(null,f),z=o(h,f,!0);if(t)return g.get("nullColor")?(s=e?g.get("nullColor"):this.calcHighlightColor(g.get("nullColor"),g),q=p>0?p-1:p,l.drawRect(m,q,this.barWidth-1,0,s,s)):c;u=p;for(v=0;v<w;v++){x=f[v];if(k&&x===h){if(!z||y)continue;y=!0}j>0?r=b.floor(n*(b.abs(x-h)/j))+1:r=1,x<h||x===h&&p===0?(q=u,u+=r):(q=p-r,p-=r),s=this.calcColor(v,x,a),e&&(s=this.calcHighlightColor(s,g)),i.push(l.drawRect(m,q,this.barWidth-1,r-1,s,s))}return i.length===1?i[0]:i}}),d.fn.sparkline.tristate=z=g(d.fn.sparkline._base,w,{type:"tristate",init:function(a,b,e,f,g){var h=parseInt(e.get("barWidth"),10),i=parseInt(e.get("barSpacing"),10);z._super.init.call(this,a,b,e,f,g),this.regionShapes={},this.barWidth=h,this.barSpacing=i,this.totalBarWidth=h+i,this.values=d.map(b,Number),this.width=f=b.length*h+(b.length-1)*i,d.isArray(e.get("colorMap"))?(this.colorMapByIndex=e.get("colorMap"),this.colorMapByValue=null):(this.colorMapByIndex=null,this.colorMapByValue=e.get("colorMap"),this.colorMapByValue&&this.colorMapByValue.get===c&&(this.colorMapByValue=new t(this.colorMapByValue))),this.initTarget()},getRegion:function(a,c,d){return b.floor(c/this.totalBarWidth)},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],color:this.calcColor(this.values[a],a),offset:a}},calcColor:function(a,b){var c=this.values,d=this.options,e=this.colorMapByIndex,f=this.colorMapByValue,g,h;return f&&(h=f.get(a))?g=h:e&&e.length>b?g=e[b]:c[b]<0?g=d.get("negBarColor"):c[b]>0?g=d.get("posBarColor"):g=d.get("zeroBarColor"),g},renderRegion:function(a,c){var d=this.values,e=this.options,f=this.target,g,h,i,j,k,l;g=f.pixelHeight,i=b.round(g/2),j=a*this.totalBarWidth,d[a]<0?(k=i,h=i-1):d[a]>0?(k=0,h=i-1):(k=i-1,h=2),l=this.calcColor(d[a],a);if(l===null)return;return c&&(l=this.calcHighlightColor(l,e)),f.drawRect(j,k,this.barWidth-1,h-1,l,l)}}),d.fn.sparkline.discrete=A=g(d.fn.sparkline._base,w,{type:"discrete",init:function(a,e,f,g,h){A._super.init.call(this,a,e,f,g,h),this.regionShapes={},this.values=e=d.map(e,Number),this.min=b.min.apply(b,e),this.max=b.max.apply(b,e),this.range=this.max-this.min,this.width=g=f.get("width")==="auto"?e.length*2:this.width,this.interval=b.floor(g/e.length),this.itemWidth=g/e.length,f.get("chartRangeMin")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMin")<this.min)&&(this.min=f.get("chartRangeMin")),f.get("chartRangeMax")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMax")>this.max)&&(this.max=f.get("chartRangeMax")),this.initTarget(),this.target&&(this.lineHeight=f.get("lineHeight")==="auto"?b.round(this.canvasHeight*.3):f.get("lineHeight"))},getRegion:function(a,c,d){return b.floor(c/this.itemWidth)},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],offset:a}},renderRegion:function(a,c){var d=this.values,e=this.options,f=this.min,g=this.max,h=this.range,j=this.interval,k=this.target,l=this.canvasHeight,m=this.lineHeight,n=l-m,o,p,q,r;return p=i(d[a],f,g),r=a*j,o=b.round(n-n*((p-f)/h)),q=e.get("thresholdColor")&&p<e.get("thresholdValue")?e.get("thresholdColor"):e.get("lineColor"),c&&(q=this.calcHighlightColor(q,e)),k.drawLine(r,o,r,o+m,q)}}),d.fn.sparkline.bullet=B=g(d.fn.sparkline._base,{type:"bullet",init:function(a,d,e,f,g){var h,i,j;B._super.init.call(this,a,d,e,f,g),this.values=d=l(d),j=d.slice(),j[0]=j[0]===null?j[2]:j[0],j[1]=d[1]===null?j[2]:j[1],h=b.min.apply(b,d),i=b.max.apply(b,d),e.get("base")===c?h=h<0?h:0:h=e.get("base"),this.min=h,this.max=i,this.range=i-h,this.shapes={},this.valueShapes={},this.regiondata={},this.width=f=e.get("width")==="auto"?"4.0em":f,this.target=this.$el.simpledraw(f,g,e.get("composite")),d.length||(this.disabled=!0),this.initTarget()},getRegion:function(a,b,d){var e=this.target.getShapeAt(a,b,d);return e!==c&&this.shapes[e]!==c?this.shapes[e]:c},getCurrentRegionFields:function(){var a=this.currentRegion;return{fieldkey:a.substr(0,1),value:this.values[a.substr(1)],region:a}},changeHighlight:function(a){var b=this.currentRegion,c=this.valueShapes[b],d;delete this.shapes[c];switch(b.substr(0,1)){case"r":d=this.renderRange(b.substr(1),a);break;case"p":d=this.renderPerformance(a);break;case"t":d=this.renderTarget(a)}this.valueShapes[b]=d.id,this.shapes[d.id]=b,this.target.replaceWithShape(c,d)},renderRange:function(a,c){var d=this.values[a],e=b.round(this.canvasWidth*((d-this.min)/this.range)),f=this.options.get("rangeColors")[a-2];return c&&(f=this.calcHighlightColor(f,this.options)),this.target.drawRect(0,0,e-1,this.canvasHeight-1,f,f)},renderPerformance:function(a){var c=this.values[1],d=b.round(this.canvasWidth*((c-this.min)/this.range)),e=this.options.get("performanceColor");return a&&(e=this.calcHighlightColor(e,this.options)),this.target.drawRect(0,b.round(this.canvasHeight*.3),d-1,b.round(this.canvasHeight*.4)-1,e,e)},renderTarget:function(a){var c=this.values[0],d=b.round(this.canvasWidth*((c-this.min)/this.range)-this.options.get("targetWidth")/2),e=b.round(this.canvasHeight*.1),f=this.canvasHeight-e*2,g=this.options.get("targetColor");return a&&(g=this.calcHighlightColor(g,this.options)),this.target.drawRect(d,e,this.options.get("targetWidth")-1,f-1,g,g)},render:function(){var a=this.values.length,b=this.target,c,d;if(!B._super.render.call(this))return;for(c=2;c<a;c++)d=this.renderRange(c).append(),this.shapes[d.id]="r"+c,this.valueShapes["r"+c]=d.id;this.values[1]!==null&&(d=this.renderPerformance().append(),this.shapes[d.id]="p1",this.valueShapes.p1=d.id),this.values[0]!==null&&(d=this.renderTarget().append(),this.shapes[d.id]="t0",this.valueShapes.t0=d.id),b.render()}}),d.fn.sparkline.pie=C=g(d.fn.sparkline._base,{type:"pie",init:function(a,c,e,f,g){var h=0,i;C._super.init.call(this,a,c,e,f,g),this.shapes={},this.valueShapes={},this.values=c=d.map(c,Number),e.get("width")==="auto"&&(this.width=this.height);if(c.length>0)for(i=c.length;i--;)h+=c[i];this.total=h,this.initTarget(),this.radius=b.floor(b.min(this.canvasWidth,this.canvasHeight)/2)},getRegion:function(a,b,d){var e=this.target.getShapeAt(a,b,d);return e!==c&&this.shapes[e]!==c?this.shapes[e]:c},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],percent:this.values[a]/this.total*100,color:this.options.get("sliceColors")[a%this.options.get("sliceColors").length],offset:a}},changeHighlight:function(a){var b=this.currentRegion,c=this.renderSlice(b,a),d=this.valueShapes[b];delete this.shapes[d],this.target.replaceWithShape(d,c),this.valueShapes[b]=c.id,this.shapes[c.id]=b},renderSlice:function(a,d){var e=this.target,f=this.options,g=this.radius,h=f.get("borderWidth"),i=f.get("offset"),j=2*b.PI,k=this.values,l=this.total,m=i?2*b.PI*(i/360):0,n,o,p,q,r;q=k.length;for(p=0;p<q;p++){n=m,o=m,l>0&&(o=m+j*(k[p]/l));if(a===p)return r=f.get("sliceColors")[p%f.get("sliceColors").length],d&&(r=this.calcHighlightColor(r,f)),e.drawPieSlice(g,g,g-h,n,o,c,r);m=o}},render:function(){var a=this.target,d=this.values,e=this.options,f=this.radius,g=e.get("borderWidth"),h,i;if(!C._super.render.call(this))return;g&&a.drawCircle(f,f,b.floor(f-g/2),e.get("borderColor"),c,g).append();for(i=d.length;i--;)d[i]&&(h=this.renderSlice(i).append(),this.valueShapes[i]=h.id,this.shapes[h.id]=i);a.render()}}),d.fn.sparkline.box=D=g(d.fn.sparkline._base,{type:"box",init:function(a,b,c,e,f){D._super.init.call(this,a,b,c,e,f),this.values=d.map(b,Number),this.width=c.get("width")==="auto"?"4.0em":e,this.initTarget(),this.values.length||(this.disabled=1)},getRegion:function(){return 1},getCurrentRegionFields:function(){var a=[{field:"lq",value:this.quartiles[0]},{field:"med",value:this.quartiles
[1]},{field:"uq",value:this.quartiles[2]}];return this.loutlier!==c&&a.push({field:"lo",value:this.loutlier}),this.routlier!==c&&a.push({field:"ro",value:this.routlier}),this.lwhisker!==c&&a.push({field:"lw",value:this.lwhisker}),this.rwhisker!==c&&a.push({field:"rw",value:this.rwhisker}),a},render:function(){var a=this.target,d=this.values,e=d.length,f=this.options,g=this.canvasWidth,h=this.canvasHeight,i=f.get("chartRangeMin")===c?b.min.apply(b,d):f.get("chartRangeMin"),k=f.get("chartRangeMax")===c?b.max.apply(b,d):f.get("chartRangeMax"),l=0,m,n,o,p,q,r,s,t,u,v,w;if(!D._super.render.call(this))return;if(f.get("raw"))f.get("showOutliers")&&d.length>5?(n=d[0],m=d[1],p=d[2],q=d[3],r=d[4],s=d[5],t=d[6]):(m=d[0],p=d[1],q=d[2],r=d[3],s=d[4]);else{d.sort(function(a,b){return a-b}),p=j(d,1),q=j(d,2),r=j(d,3),o=r-p;if(f.get("showOutliers")){m=s=c;for(u=0;u<e;u++)m===c&&d[u]>p-o*f.get("outlierIQR")&&(m=d[u]),d[u]<r+o*f.get("outlierIQR")&&(s=d[u]);n=d[0],t=d[e-1]}else m=d[0],s=d[e-1]}this.quartiles=[p,q,r],this.lwhisker=m,this.rwhisker=s,this.loutlier=n,this.routlier=t,w=g/(k-i+1),f.get("showOutliers")&&(l=b.ceil(f.get("spotRadius")),g-=2*b.ceil(f.get("spotRadius")),w=g/(k-i+1),n<m&&a.drawCircle((n-i)*w+l,h/2,f.get("spotRadius"),f.get("outlierLineColor"),f.get("outlierFillColor")).append(),t>s&&a.drawCircle((t-i)*w+l,h/2,f.get("spotRadius"),f.get("outlierLineColor"),f.get("outlierFillColor")).append()),a.drawRect(b.round((p-i)*w+l),b.round(h*.1),b.round((r-p)*w),b.round(h*.8),f.get("boxLineColor"),f.get("boxFillColor")).append(),a.drawLine(b.round((m-i)*w+l),b.round(h/2),b.round((p-i)*w+l),b.round(h/2),f.get("lineColor")).append(),a.drawLine(b.round((m-i)*w+l),b.round(h/4),b.round((m-i)*w+l),b.round(h-h/4),f.get("whiskerColor")).append(),a.drawLine(b.round((s-i)*w+l),b.round(h/2),b.round((r-i)*w+l),b.round(h/2),f.get("lineColor")).append(),a.drawLine(b.round((s-i)*w+l),b.round(h/4),b.round((s-i)*w+l),b.round(h-h/4),f.get("whiskerColor")).append(),a.drawLine(b.round((q-i)*w+l),b.round(h*.1),b.round((q-i)*w+l),b.round(h*.9),f.get("medianColor")).append(),f.get("target")&&(v=b.ceil(f.get("spotRadius")),a.drawLine(b.round((f.get("target")-i)*w+l),b.round(h/2-v),b.round((f.get("target")-i)*w+l),b.round(h/2+v),f.get("targetColor")).append(),a.drawLine(b.round((f.get("target")-i)*w+l-v),b.round(h/2),b.round((f.get("target")-i)*w+l+v),b.round(h/2),f.get("targetColor")).append()),a.render()}}),G=g({init:function(a,b,c,d){this.target=a,this.id=b,this.type=c,this.args=d},append:function(){return this.target.appendShape(this),this}}),H=g({_pxregex:/(\d+)(px)?\s*$/i,init:function(a,b,c){if(!a)return;this.width=a,this.height=b,this.target=c,this.lastShapeId=null,c[0]&&(c=c[0]),d.data(c,"_jqs_vcanvas",this)},drawLine:function(a,b,c,d,e,f){return this.drawShape([[a,b],[c,d]],e,f)},drawShape:function(a,b,c,d){return this._genShape("Shape",[a,b,c,d])},drawCircle:function(a,b,c,d,e,f){return this._genShape("Circle",[a,b,c,d,e,f])},drawPieSlice:function(a,b,c,d,e,f,g){return this._genShape("PieSlice",[a,b,c,d,e,f,g])},drawRect:function(a,b,c,d,e,f){return this._genShape("Rect",[a,b,c,d,e,f])},getElement:function(){return this.canvas},getLastShapeId:function(){return this.lastShapeId},reset:function(){alert("reset not implemented")},_insert:function(a,b){d(b).html(a)},_calculatePixelDims:function(a,b,c){var e;e=this._pxregex.exec(b),e?this.pixelHeight=e[1]:this.pixelHeight=d(c).height(),e=this._pxregex.exec(a),e?this.pixelWidth=e[1]:this.pixelWidth=d(c).width()},_genShape:function(a,b){var c=L++;return b.unshift(c),new G(this,c,a,b)},appendShape:function(a){alert("appendShape not implemented")},replaceWithShape:function(a,b){alert("replaceWithShape not implemented")},insertAfterShape:function(a,b){alert("insertAfterShape not implemented")},removeShapeId:function(a){alert("removeShapeId not implemented")},getShapeAt:function(a,b,c){alert("getShapeAt not implemented")},render:function(){alert("render not implemented")}}),I=g(H,{init:function(b,e,f,g){I._super.init.call(this,b,e,f),this.canvas=a.createElement("canvas"),f[0]&&(f=f[0]),d.data(f,"_jqs_vcanvas",this),d(this.canvas).css({display:"inline-block",width:b,height:e,verticalAlign:"top"}),this._insert(this.canvas,f),this._calculatePixelDims(b,e,this.canvas),this.canvas.width=this.pixelWidth,this.canvas.height=this.pixelHeight,this.interact=g,this.shapes={},this.shapeseq=[],this.currentTargetShapeId=c,d(this.canvas).css({width:this.pixelWidth,height:this.pixelHeight})},_getContext:function(a,b,d){var e=this.canvas.getContext("2d");return a!==c&&(e.strokeStyle=a),e.lineWidth=d===c?1:d,b!==c&&(e.fillStyle=b),e},reset:function(){var a=this._getContext();a.clearRect(0,0,this.pixelWidth,this.pixelHeight),this.shapes={},this.shapeseq=[],this.currentTargetShapeId=c},_drawShape:function(a,b,d,e,f){var g=this._getContext(d,e,f),h,i;g.beginPath(),g.moveTo(b[0][0]+.5,b[0][1]+.5);for(h=1,i=b.length;h<i;h++)g.lineTo(b[h][0]+.5,b[h][1]+.5);d!==c&&g.stroke(),e!==c&&g.fill(),this.targetX!==c&&this.targetY!==c&&g.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a)},_drawCircle:function(a,d,e,f,g,h,i){var j=this._getContext(g,h,i);j.beginPath(),j.arc(d,e,f,0,2*b.PI,!1),this.targetX!==c&&this.targetY!==c&&j.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a),g!==c&&j.stroke(),h!==c&&j.fill()},_drawPieSlice:function(a,b,d,e,f,g,h,i){var j=this._getContext(h,i);j.beginPath(),j.moveTo(b,d),j.arc(b,d,e,f,g,!1),j.lineTo(b,d),j.closePath(),h!==c&&j.stroke(),i&&j.fill(),this.targetX!==c&&this.targetY!==c&&j.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a)},_drawRect:function(a,b,c,d,e,f,g){return this._drawShape(a,[[b,c],[b+d,c],[b+d,c+e],[b,c+e],[b,c]],f,g)},appendShape:function(a){return this.shapes[a.id]=a,this.shapeseq.push(a.id),this.lastShapeId=a.id,a.id},replaceWithShape:function(a,b){var c=this.shapeseq,d;this.shapes[b.id]=b;for(d=c.length;d--;)c[d]==a&&(c[d]=b.id);delete this.shapes[a]},replaceWithShapes:function(a,b){var c=this.shapeseq,d={},e,f,g;for(f=a.length;f--;)d[a[f]]=!0;for(f=c.length;f--;)e=c[f],d[e]&&(c.splice(f,1),delete this.shapes[e],g=f);for(f=b.length;f--;)c.splice(g,0,b[f].id),this.shapes[b[f].id]=b[f]},insertAfterShape:function(a,b){var c=this.shapeseq,d;for(d=c.length;d--;)if(c[d]===a){c.splice(d+1,0,b.id),this.shapes[b.id]=b;return}},removeShapeId:function(a){var b=this.shapeseq,c;for(c=b.length;c--;)if(b[c]===a){b.splice(c,1);break}delete this.shapes[a]},getShapeAt:function(a,b,c){return this.targetX=b,this.targetY=c,this.render(),this.currentTargetShapeId},render:function(){var a=this.shapeseq,b=this.shapes,c=a.length,d=this._getContext(),e,f,g;d.clearRect(0,0,this.pixelWidth,this.pixelHeight);for(g=0;g<c;g++)e=a[g],f=b[e],this["_draw"+f.type].apply(this,f.args);this.interact||(this.shapes={},this.shapeseq=[])}}),J=g(H,{init:function(b,c,e){var f;J._super.init.call(this,b,c,e),e[0]&&(e=e[0]),d.data(e,"_jqs_vcanvas",this),this.canvas=a.createElement("span"),d(this.canvas).css({display:"inline-block",position:"relative",overflow:"hidden",width:b,height:c,margin:"0px",padding:"0px",verticalAlign:"top"}),this._insert(this.canvas,e),this._calculatePixelDims(b,c,this.canvas),this.canvas.width=this.pixelWidth,this.canvas.height=this.pixelHeight,f='<v:group coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'"'+' style="position:absolute;top:0;left:0;width:'+this.pixelWidth+"px;height="+this.pixelHeight+'px;"></v:group>',this.canvas.insertAdjacentHTML("beforeEnd",f),this.group=d(this.canvas).children()[0],this.rendered=!1,this.prerender=""},_drawShape:function(a,b,d,e,f){var g=[],h,i,j,k,l,m,n;for(n=0,m=b.length;n<m;n++)g[n]=""+b[n][0]+","+b[n][1];return h=g.splice(0,1),f=f===c?1:f,i=d===c?' stroked="false" ':' strokeWeight="'+f+'px" strokeColor="'+d+'" ',j=e===c?' filled="false"':' fillColor="'+e+'" filled="true" ',k=g[0]===g[g.length-1]?"x ":"",l='<v:shape coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'" '+' id="jqsshape'+a+'" '+i+j+' style="position:absolute;left:0px;top:0px;height:'+this.pixelHeight+"px;width:"+this.pixelWidth+'px;padding:0px;margin:0px;" '+' path="m '+h+" l "+g.join(", ")+" "+k+'e">'+" </v:shape>",l},_drawCircle:function(a,b,d,e,f,g,h){var i,j,k;return b-=e,d-=e,i=f===c?' stroked="false" ':' strokeWeight="'+h+'px" strokeColor="'+f+'" ',j=g===c?' filled="false"':' fillColor="'+g+'" filled="true" ',k='<v:oval  id="jqsshape'+a+'" '+i+j+' style="position:absolute;top:'+d+"px; left:"+b+"px; width:"+e*2+"px; height:"+e*2+'px"></v:oval>',k},_drawPieSlice:function(a,d,e,f,g,h,i,j){var k,l,m,n,o,p,q,r;if(g===h)return"";h-g===2*b.PI&&(g=0,h=2*b.PI),l=d+b.round(b.cos(g)*f),m=e+b.round(b.sin(g)*f),n=d+b.round(b.cos(h)*f),o=e+b.round(b.sin(h)*f);if(l===n&&m===o){if(h-g<b.PI)return"";l=n=d+f,m=o=e}return l===n&&m===o&&h-g<b.PI?"":(k=[d-f,e-f,d+f,e+f,l,m,n,o],p=i===c?' stroked="false" ':' strokeWeight="1px" strokeColor="'+i+'" ',q=j===c?' filled="false"':' fillColor="'+j+'" filled="true" ',r='<v:shape coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'" '+' id="jqsshape'+a+'" '+p+q+' style="position:absolute;left:0px;top:0px;height:'+this.pixelHeight+"px;width:"+this.pixelWidth+'px;padding:0px;margin:0px;" '+' path="m '+d+","+e+" wa "+k.join(", ")+' x e">'+" </v:shape>",r)},_drawRect:function(a,b,c,d,e,f,g){return this._drawShape(a,[[b,c],[b,c+e],[b+d,c+e],[b+d,c],[b,c]],f,g)},reset:function(){this.group.innerHTML=""},appendShape:function(a){var b=this["_draw"+a.type].apply(this,a.args);return this.rendered?this.group.insertAdjacentHTML("beforeEnd",b):this.prerender+=b,this.lastShapeId=a.id,a.id},replaceWithShape:function(a,b){var c=d("#jqsshape"+a),e=this["_draw"+b.type].apply(this,b.args);c[0].outerHTML=e},replaceWithShapes:function(a,b){var c=d("#jqsshape"+a[0]),e="",f=b.length,g;for(g=0;g<f;g++)e+=this["_draw"+b[g].type].apply(this,b[g].args);c[0].outerHTML=e;for(g=1;g<a.length;g++)d("#jqsshape"+a[g]).remove()},insertAfterShape:function(a,b){var c=d("#jqsshape"+a),e=this["_draw"+b.type].apply(this,b.args);c[0].insertAdjacentHTML("afterEnd",e)},removeShapeId:function(a){var b=d("#jqsshape"+a);this.group.removeChild(b[0])},getShapeAt:function(a,b,c){var d=a.id.substr(8);return d},render:function(){this.rendered||(this.group.innerHTML=this.prerender,this.rendered=!0)}})})})(document,Math);
/*
 * Copyright (c) 2007 Josh Bush (digitalbush.com)
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:

 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

/*
 * Version: Beta 1
 * Release: 2007-06-01
 */
(function($){var map=[];$.Watermark={ShowAll:function(){for(var i=0;i<map.length;i++)if(map[i].obj.val()==""){map[i].obj.val(map[i].text);map[i].obj.css("color",map[i].WatermarkColor)}else map[i].obj.css("color",map[i].DefaultColor)},HideAll:function(){for(var i=0;i<map.length;i++)map[i].obj.val()==map[i].text&&map[i].obj.val("")}};$.fn.Watermark=function(text,color){if(!color)color="#aaa";return this.each(function(){var input=$(this),defaultColor=input.css("color");map[map.length]={text:text,obj:input,DefaultColor:defaultColor,WatermarkColor:color};function clearMessage(){input.val()==text&&input.val("");input.css("color",defaultColor)}function insertMessage(){if(input.val().length==0||input.val()==text){input.val(text);input.css("color",color)}else input.css("color",defaultColor)}input.focus(clearMessage);input.blur(insertMessage);input.change(insertMessage);insertMessage()})}})(jQuery);

if (!this.JSON){this.JSON = {};} ( function () { "use strict"; function f(n) { return n < 10 ? '0' + n : n; } if (typeof Date.prototype.toJSON !== 'function') { Date.prototype.toJSON = function (key) { return isFinite(this.valueOf()) ? this.getUTCFullYear() + '-' + f(this.getUTCMonth() + 1) + '-' + f(this.getUTCDate()) + 'T' + f(this.getUTCHours()) + ':' + f(this.getUTCMinutes()) + ':' + f(this.getUTCSeconds()) + 'Z' : null; }; String.prototype.toJSON = Number.prototype.toJSON = Boolean.prototype.toJSON = function (key) { return this.valueOf(); }; } var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta = {'\b': '\\b', '\t': '\\t','\n': '\\n','\f': '\\f','\r': '\\r','"': '\\"','\\': '\\\\'},rep; function quote(string) { escapable.lastIndex = 0; return escapable.test(string) ? '"' + string.replace(escapable, function (a) {var c = meta[a];return typeof c === 'string' ? c :'\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);}) + '"' :'"' + string + '"';}function str(key, holder) {var i,k,v,length,mind=gap,partial,value = holder[key]; if (value && typeof value === 'object' && typeof value.toJSON === 'function') {value = value.toJSON(key);}if (typeof rep === 'function') {value = rep.call(holder, key, value);} switch (typeof value) {case 'string':return quote(value);case 'number':return isFinite(value) ? String(value) : 'null';case 'boolean':case 'null':return String(value);case 'object':if (!value) {return 'null';} gap += indent;partial = [];if (Object.prototype.toString.apply(value) === '[object Array]') { length = value.length;for (i = 0; i < length; i += 1) {partial[i] = str(i, value) || 'null';}v = partial.length === 0 ? '[]' :gap ? '[\n' + gap +partial.join(',\n' + gap) + '\n' +mind + ']' :'[' + partial.join(',') + ']';gap = mind;return v;} if (rep && typeof rep === 'object') {length = rep.length;for (i = 0; i < length; i += 1) {k = rep[i];if (typeof k === 'string') {v = str(k, value);if (v) {partial.push(quote(k) + (gap ? ': ' : ':') + v);}}}} else {for (k in value) {if (Object.hasOwnProperty.call(value, k)) {v = str(k, value);if (v) {partial.push(quote(k) + (gap ? ': ' : ':') + v);}}}}v = partial.length === 0 ? '{}' :gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +mind + '}' : '{' + partial.join(',') + '}';gap = mind;return v;}}if (typeof JSON.stringify !== 'function') {JSON.stringify = function (value, replacer, space) {var i;gap = '';indent = '';if (typeof space === 'number') {for (i = 0; i < space; i += 1) {indent += ' ';}} else if (typeof space === 'string') {indent = space;}rep = replacer;if (replacer && typeof replacer !== 'function' &&(typeof replacer !== 'object' ||typeof replacer.length !== 'number')) {throw new Error('JSON.stringify');}return str('', { '': value });};}if (typeof JSON.parse !== 'function') {JSON.parse = function (text, reviver) {var j;function walk(holder, key) {var k, v, value = holder[key];if (value && typeof value === 'object') {for (k in value) {if (Object.hasOwnProperty.call(value, k)) {v = walk(value, k);if (v !== undefined) {value[k] = v;} else {delete value[k];}}}}return reviver.call(holder, key, value);}text = String(text);cx.lastIndex = 0;if (cx.test(text)) {text = text.replace(cx, function (a) {return '\\u' +('0000' + a.charCodeAt(0).toString(16)).slice(-4);});}if (/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {j = eval('(' + text + ')');return typeof reviver === 'function' ?walk({ '': j }, '') : j;}throw new SyntaxError('JSON.parse');};}} ());
window.PR_SHOULD_USE_CONTINUATION=true;window.PR_TAB_WIDTH=8;window.PR_normalizedHtml=window.PR=window.prettyPrintOne=window.prettyPrint=void 0;window._pr_isIE6=function(){var a=navigator&&navigator.userAgent&&navigator.userAgent.match(/\bMSIE ([678])\./);a=a?+a[1]:false;window._pr_isIE6=function(){return a};return a};(function(){var g="break continue do else for if return while ",db=g+"auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile ",m=db+"catch class delete false import new operator private protected public this throw true try typeof ",B=m+"alignof align_union asm axiom bool concept concept_map const_cast constexpr decltype dynamic_cast explicit export friend inline late_check mutable namespace nullptr reinterpret_cast static_assert static_cast template typeid typename using virtual wchar_t where ",y=m+"abstract boolean byte extends final finally implements import instanceof null native package strictfp super synchronized throws transient ",t=y+"as base by checked decimal delegate descending event fixed foreach from group implicit in interface internal into is lock object out override orderby params partial readonly ref sbyte sealed stackalloc string select uint ulong unchecked unsafe ushort var ",s=m+"debugger eval export function get null set undefined var with Infinity NaN ",z="caller delete die do dump elsif eval exit foreach for goto if import last local my next no our print package redo require sub undef unless until use wantarray while BEGIN END ",u=g+"and as assert class def del elif except exec finally from global import in is lambda nonlocal not or pass print raise try with yield False True None ",A=g+"alias and begin case class def defined elsif end ensure false in module next nil not or redo rescue retry self super then true undef unless until when yield BEGIN END ",E=g+"case done elif esac eval fi function in local set then until ",W=B+t+s+z+u+A+E,c="str",F="kwd",f="com",I="typ",o="lit",j="pun",d="pln",K="tag",x="dec",H="src",w="atn",n="atv",G="nocode",O=function(){for(var c=["!","!=","!==","#","%","%=","&","&&","&&=","&=","(","*","*=","+=",",","-=","->","/","/=",":","::",";","<","<<","<<=","<=","=","==","===",">",">=",">>",">>=",">>>",">>>=","?","@","[","^","^=","^^","^^=","{","|","|=","||","||=","~","break","case","continue","delete","do","else","finally","instanceof","return","throw","try","typeof"],a="(?:^^|[+-]",b=0;b<c.length;++b)a+="|"+c[b].replace(/([^=<>:&a-z])/g,"\\$1");a+=")\\s*";return a}(),J=/&/g,M=/</g,L=/>/g,mb=/\"/g;function X(a){return a.replace(J,"&amp;").replace(M,"&lt;").replace(L,"&gt;").replace(mb,"&quot;")}function p(a){return a.replace(J,"&amp;").replace(M,"&lt;").replace(L,"&gt;")}var lb=/&lt;/g,kb=/&gt;/g,fb=/&apos;/g,hb=/&quot;/g,jb=/&amp;/g,gb=/&nbsp;/g;function eb(a){var b=a.indexOf("&");if(b<0)return a;for(--b;(b=a.indexOf("&#",b+1))>=0;){var d=a.indexOf(";",b);if(d>=0){var c=a.substring(b+3,d),f=10;if(c&&c.charAt(0)==="x"){c=c.substring(1);f=16}var e=parseInt(c,f);if(!isNaN(e))a=a.substring(0,b)+String.fromCharCode(e)+a.substring(d+1)}}return a.replace(lb,"<").replace(kb,">").replace(fb,"'").replace(hb,'"').replace(gb," ").replace(jb,"&")}function C(a){return"XMP"===a.tagName}var ib=/[\r\n]/g;function T(b,c){if("PRE"===b.tagName)return true;if(!ib.test(c))return true;var a="";if(b.currentStyle)a=b.currentStyle.whiteSpace;else if(window.getComputedStyle)a=window.getComputedStyle(b,null).whiteSpace;return!a||a==="pre"}function i(a,b){switch(a.nodeType){case 1:var d=a.tagName.toLowerCase();b.push("<",d);for(var e=0;e<a.attributes.length;++e){var f=a.attributes[e];if(!f.specified)continue;b.push(" ");i(f,b)}b.push(">");for(var c=a.firstChild;c;c=c.nextSibling)i(c,b);(a.firstChild||!/^(?:br|link|img)$/.test(d))&&b.push("</",d,">");break;case 2:b.push(a.name.toLowerCase(),'="',X(a.value),'"');break;case 3:case 4:b.push(p(a.nodeValue))}}function r(c){for(var k=0,e=false,d=false,b=0,i=c.length;b<i;++b){var a=c[b];if(a.ignoreCase)d=true;else if(/[a-z]/i.test(a.source.replace(/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[^ux]/gi,""))){e=true;d=false;break}}function f(a){if(a.charAt(0)!=="\\")return a.charCodeAt(0);switch(a.charAt(1)){case"b":return 8;case"t":return 9;case"n":return 10;case"v":return 11;case"f":return 12;case"r":return 13;case"u":case"x":return parseInt(a.substring(2),16)||a.charCodeAt(1);case"0":case"1":case"2":case"3":case"4":case"5":case"6":case"7":return parseInt(a.substring(1),8);default:return a.charCodeAt(1)}}function g(b){if(b<32)return(b<16?"\\x0":"\\x")+b.toString(16);var a=String.fromCharCode(b);if(a==="\\"||a==="-"||a==="["||a==="]")a="\\"+a;return a}function l(m){for(var i=m.substring(1,m.length-1).match(new RegExp("\\\\u[0-9A-Fa-f]{4}|\\\\x[0-9A-Fa-f]{2}|\\\\[0-3][0-7]{0,2}|\\\\[0-7]{1,2}|\\\\[\\s\\S]|-|[^-\\\\]","g")),o=[],h=[],n=i[0]==="^",a=n?1:0,p=i.length;a<p;++a){var l=i[a];switch(l){case"\\B":case"\\b":case"\\D":case"\\d":case"\\S":case"\\s":case"\\W":case"\\w":o.push(l);continue}var e=f(l),c;if(a+2<p&&"-"===i[a+1]){c=f(i[a+2]);a+=2}else c=e;h.push([e,c]);if(!(c<65||e>122)){!(c<65||e>90)&&h.push([Math.max(65,e)|32,Math.min(c,90)|32]);!(c<97||e>122)&&h.push([Math.max(97,e)&~32,Math.min(c,122)&~32])}}h.sort(function(a,b){return a[0]-b[0]||b[1]-a[1]});for(var k=[],j=[NaN,NaN],a=0;a<h.length;++a){var b=h[a];if(b[0]<=j[1]+1)j[1]=Math.max(j[1],b[1]);else k.push(j=b)}var d=["["];n&&d.push("^");d.push.apply(d,o);for(var a=0;a<k.length;++a){var b=k[a];d.push(g(b[0]));if(b[1]>b[0]){b[1]+1>b[0]&&d.push("-");d.push(g(b[1]))}}d.push("]");return d.join("")}function j(i){for(var b=i.source.match(new RegExp("(?:\\[(?:[^\\x5C\\x5D]|\\\\[\\s\\S])*\\]|\\\\u[A-Fa-f0-9]{4}|\\\\x[A-Fa-f0-9]{2}|\\\\[0-9]+|\\\\[^ux0-9]|\\(\\?[:!=]|[\\(\\)\\^]|[^\\x5B\\x5C\\(\\)\\^]+)","g")),h=b.length,d=[],a=0,f=0;a<h;++a){var c=b[a];if(c==="(")++f;else if("\\"===c.charAt(0)){var g=+c.substring(1);if(g&&g<=f)d[g]=-1}}for(var a=1;a<d.length;++a)if(-1===d[a])d[a]=++k;for(var a=0,f=0;a<h;++a){var c=b[a];if(c==="("){++f;if(d[f]===undefined)b[a]="(?:"}else if("\\"===c.charAt(0)){var g=+c.substring(1);if(g&&g<=f)b[a]="\\"+d[f]}}for(var a=0,f=0;a<h;++a)if("^"===b[a]&&"^"!==b[a+1])b[a]="";if(i.ignoreCase&&e)for(var a=0;a<h;++a){var c=b[a],j=c.charAt(0);if(c.length>=2&&j==="[")b[a]=l(c);else if(j!=="\\")b[a]=c.replace(/[a-zA-Z]/g,function(b){var a=b.charCodeAt(0);return"["+String.fromCharCode(a&~32,a|32)+"]"})}return b.join("")}for(var h=[],b=0,i=c.length;b<i;++b){var a=c[b];if(a.global||a.multiline)throw new Error(""+a);h.push("(?:"+j(a)+")")}return new RegExp(h.join("|"),d?"gi":"g")}var l=null;function Y(c){if(null===l){var d=document.createElement("PRE");d.appendChild(document.createTextNode('<!DOCTYPE foo PUBLIC "foo bar">\n<foo />'));l=!/</.test(d.innerHTML)}if(l){var a=c.innerHTML;if(C(c))a=p(a);else if(!T(c,a))a=a.replace(/(<br\s*\/?>)[\r\n]+/g,"$1").replace(/(?:[\r\n]+[ \t]*)+/g," ");return a}for(var e=[],b=c.firstChild;b;b=b.nextSibling)i(b,e);return e.join("")}function Q(b){var c="                ",a=0;return function(e){for(var d=null,h=0,f=0,j=e.length;f<j;++f){var i=e.charAt(f);switch(i){case"\t":if(!d)d=[];d.push(e.substring(h,f));var g=b-a%b;a+=g;for(;g>=0;g-=c.length)d.push(c.substring(0,g));h=f+1;break;case"\n":a=0;break;default:++a}}if(!d)return e;d.push(e.substring(h));return d.join("")}}var R=new RegExp("[^<]+|<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|</?[a-zA-Z](?:[^>\"']|'[^']*'|\"[^\"]*\")*>|<","g"),P=/^<\!--/,V=/^<!\[CDATA\[/,cb=/^<br\b/i,D=/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/;function Z(m){var e=m.match(R),g=[],c=0,f=[];if(e)for(var d=0,i=e.length;d<i;++d){var a=e[d];if(a.length>1&&a.charAt(0)==="<"){if(P.test(a))continue;if(V.test(a)){g.push(a.substring(9,a.length-3));c+=a.length-12}else if(cb.test(a)){g.push("\n");++c}else if(a.indexOf(G)>=0&&ab(a)){var l=a.match(D)[2],k=1,b;a:for(b=d+1;b<i;++b){var h=e[b].match(D);if(h&&h[2]===l)if(h[1]==="/"){if(--k===0)break a}else++k}if(b<i){f.push(c,e.slice(d,b+1).join(""));d=b}else f.push(c,a)}else f.push(c,a)}else{var j=eb(a);g.push(j);c+=j.length}}return{source:g.join(""),tags:f}}function ab(a){return!!a.replace(/\s(\w+)\s*=\s*(?:\"([^\"]*)\"|'([^\']*)'|(\S+))/g,' $1="$2$3$4"').match(/[cC][lL][aA][sS][sS]=\"[^\"]*\bnocode\b/)}function k(e,a,d,c){if(!a)return;var b={source:a,basePos:e};d(b);c.push.apply(c,b.decorations)}function e(f,a){var c={},e;(function(){for(var i=f.concat(a),g=[],j={},h=0,n=i.length;h<n;++h){var d=i[h],b=d[3];if(b)for(var l=b.length;--l>=0;)c[b.charAt(l)]=d;var k=d[1],m=""+k;if(!j.hasOwnProperty(m)){g.push(k);j[m]=null}}g.push(/[\0-\uffff]/);e=r(g)})();var g=a.length,h=/\S/,b=function(t){for(var z=t.source,o=t.basePos,n=[o,d],y=0,x=z.match(e)||[],w={},u=0,A=x.length;u<A;++u){var h=x[u],f=w[h],i=void 0,l;if(typeof f==="string")l=false;else{var j=c[h.charAt(0)];if(j){i=h.match(j[1]);f=j[0]}else{for(var v=0;v<g;++v){j=a[v];i=h.match(j[1]);if(i){f=j[0];break}}if(!i)f=d}l=f.length>=5&&"lang-"===f.substring(0,5);if(l&&!(i&&typeof i[1]==="string")){l=false;f=H}if(!l)w[h]=f}var s=y;y+=h.length;if(!l)n.push(o+s,f);else{var m=i[1],p=h.indexOf(m),r=p+m.length;if(i[2]){r=h.length-i[2].length;p=r-m.length}var B=f.substring(5);k(o+s,h.substring(0,p),b,n);k(o+s+p,m,q(B,m),n);k(o+s+r,h.substring(r),b,n)}}t.decorations=n};return b}function b(b){var g=[],a=[];if(b.tripleQuotedStrings)g.push([c,/^(?:\'\'\'(?:[^\'\\]|\\[\s\S]|\'{1,2}(?=[^\']))*(?:\'\'\'|$)|\"\"\"(?:[^\"\\]|\\[\s\S]|\"{1,2}(?=[^\"]))*(?:\"\"\"|$)|\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$))/,null,"'\""]);else if(b.multiLineStrings)g.push([c,/^(?:\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$)|\`(?:[^\\\`]|\\[\s\S])*(?:\`|$))/,null,"'\"`"]);else g.push([c,/^(?:\'(?:[^\\\'\r\n]|\\.)*(?:\'|$)|\"(?:[^\\\"\r\n]|\\.)*(?:\"|$))/,null,"\"'"]);b.verbatimStrings&&a.push([c,/^@\"(?:[^\"]|\"\")*(?:\"|$)/,null]);if(b.hashComments)if(b.cStyleComments){g.push([f,/^#(?:(?:define|elif|else|endif|error|ifdef|include|ifndef|line|pragma|undef|warning)\b|[^\r\n]*)/,null,"#"]);a.push([c,/^<(?:(?:(?:\.\.\/)*|\/?)(?:[\w-]+(?:\/[\w-]+)+)?[\w-]+\.h|[a-z]\w*)>/,null])}else g.push([f,/^#[^\r\n]*/,null,"#"]);if(b.cStyleComments){a.push([f,/^\/\/[^\r\n]*/,null]);a.push([f,/^\/\*[\s\S]*?(?:\*\/|$)/,null])}if(b.regexLiterals){var i="/(?=[^/*])(?:[^/\\x5B\\x5C]|\\x5C[\\s\\S]|\\x5B(?:[^\\x5C\\x5D]|\\x5C[\\s\\S])*(?:\\x5D|$))+/";a.push(["lang-regex",new RegExp("^"+O+"("+i+")")])}var h=b.keywords.replace(/^\s+|\s+$/g,"");h.length&&a.push([F,new RegExp("^(?:"+h.replace(/\s+/g,"|")+")\\b"),null]);g.push([d,/^\s+/,null," \r\n\t\u00a0"]);a.push([o,/^@[a-z_$][a-z_$@0-9]*/i,null],[I,/^@?[A-Z]+[a-z][A-Za-z_$@0-9]*/,null],[d,/^[a-z_$][a-z_$@0-9]*/i,null],[o,new RegExp("^(?:0x[a-f0-9]+|(?:\\d(?:_\\d+)*\\d*(?:\\.\\d*)?|\\.\\d\\+)(?:e[+\\-]?\\d+)?)[a-z]*","i"),null,"0123456789"],[j,/^.[^\s\w\.$@\'\"\`\/\#]*/,null]);return e(g,a)}var S=b({keywords:W,hashComments:true,cStyleComments:true,multiLineStrings:true,regexLiterals:true});function N(i){var m=i.source,g=i.extractedTags,d=i.decorations,b=[],k=0,a=null,f=null,e=0,c=0,r=Q(window.PR_TAB_WIDTH),n=/([\r\n ]) /g,q=/(^| ) /gm,s=/\r\n?|\n/g,o=/[ \r\n]$/,l=true;function j(c){if(c>k){if(a&&a!==f){b.push("</span>");a=null}if(!a&&f){a=f;b.push('<span class="',a,'">')}var d=p(r(m.substring(k,c))).replace(l?q:n,"$1&nbsp;");l=o.test(d);var e=window._pr_isIE6()?"&nbsp;<br />":"<br />";b.push(d.replace(s,e));k=c}}while(true){var h;if(e<g.length)if(c<d.length)h=g[e]<=d[c];else h=true;else h=false;if(h){j(g[e]);if(a){b.push("</span>");a=null}b.push(g[e+1]);e+=2}else if(c<d.length){j(d[c]);f=d[c+1];c+=2}else break}j(m.length);a&&b.push("</span>");i.prettyPrintedHtml=b.join("")}var h={};function a(d,b){for(var c=b.length;--c>=0;){var a=b[c];if(!h.hasOwnProperty(a))h[a]=d;else"console"in window&&console.warn("cannot override language handler %s",a)}}function q(a,b){if(!(a&&h.hasOwnProperty(a)))a=/^\s*</.test(b)?"default-markup":"default-code";return h[a]}a(S,["default-code"]);a(e([],[[d,/^[^<?]+/],[x,/^<!\w[^>]*(?:>|$)/],[f,/^<\!--[\s\S]*?(?:-\->|$)/],["lang-",/^<\?([\s\S]+?)(?:\?>|$)/],["lang-",/^<%([\s\S]+?)(?:%>|$)/],[j,/^(?:<[%?]|[%?]>)/],["lang-",/^<xmp\b[^>]*>([\s\S]+?)<\/xmp\b[^>]*>/i],["lang-js",/^<script\b[^>]*>([\s\S]*?)(<\/script\b[^>]*>)/i],["lang-css",/^<style\b[^>]*>([\s\S]*?)(<\/style\b[^>]*>)/i],["lang-in.tag",/^(<\/?[a-z][^<>]*>)/i]]),["default-markup","htm","html","mxml","xhtml","xml","xsl"]);a(e([[d,/^[\s]+/,null," \t\r\n"],[n,/^(?:\"[^\"]*\"?|\'[^\']*\'?)/,null,"\"'"]],[[K,/^^<\/?[a-z](?:[\w.:-]*\w)?|\/?>$/i],[w,/^(?!style[\s=]|on)[a-z](?:[\w:-]*\w)?/i],["lang-uq.val",/^=\s*([^>\'\"\s]*(?:[^>\'\"\s\/]|\/(?=\s)))/],[j,/^[=<>\/]+/],["lang-js",/^on\w+\s*=\s*\"([^\"]+)\"/i],["lang-js",/^on\w+\s*=\s*\'([^\']+)\'/i],["lang-js",/^on\w+\s*=\s*([^\"\'>\s]+)/i],["lang-css",/^style\s*=\s*\"([^\"]+)\"/i],["lang-css",/^style\s*=\s*\'([^\']+)\'/i],["lang-css",/^style\s*=\s*([^\"\'>\s]+)/i]]),["in.tag"]);a(e([],[[n,/^[\s\S]+/]]),["uq.val"]);a(b({keywords:B,hashComments:true,cStyleComments:true}),["c","cc","cpp","cxx","cyc","m"]);a(b({keywords:"null true false"}),["json"]);a(b({keywords:t,hashComments:true,cStyleComments:true,verbatimStrings:true}),["cs"]);a(b({keywords:y,cStyleComments:true}),["java"]);a(b({keywords:E,hashComments:true,multiLineStrings:true}),["bsh","csh","sh"]);a(b({keywords:u,hashComments:true,multiLineStrings:true,tripleQuotedStrings:true}),["cv","py"]);a(b({keywords:z,hashComments:true,multiLineStrings:true,regexLiterals:true}),["perl","pl","pm"]);a(b({keywords:A,hashComments:true,multiLineStrings:true,regexLiterals:true}),["rb"]);a(b({keywords:s,cStyleComments:true,regexLiterals:true}),["js"]);a(e([],[[c,/^[\s\S]+/]]),["regex"]);function v(a){var c=a.sourceCodeHtml,e=a.langExtension;a.prettyPrintedHtml=c;try{var b=Z(c),d=b.source;a.source=d;a.basePos=0;a.extractedTags=b.tags;q(e,d)(a);N(a)}catch(f){if("console"in window){console.log(f);console.trace()}}}function U(c,b){var a={sourceCodeHtml:c,langExtension:b};v(a);return a.prettyPrintedHtml}function bb(h){for(var i=window._pr_isIE6(),l=i===6?"\r\n":"\r",b=[document.getElementsByTagName("pre"),document.getElementsByTagName("code"),document.getElementsByTagName("xmp")],c=[],e=0;e<b.length;++e)for(var g=0,m=b[e].length;g<m;++g)c.push(b[e][g]);b=null;var d=Date;if(!d.now)d={now:function(){return(new Date).getTime()}};var f=0,a;function j(){for(var m=window.PR_SHOULD_USE_CONTINUATION?d.now()+250:Infinity;f<c.length&&d.now()<m;f++){var e=c[f];if(e.className&&e.className.indexOf("prettyprint")>=0){var g=e.className.match(/\blang-(\w+)\b/);if(g)g=g[1];for(var l=false,b=e.parentNode;b;b=b.parentNode)if((b.tagName==="pre"||b.tagName==="code"||b.tagName==="xmp")&&b.className&&b.className.indexOf("prettyprint")>=0){l=true;break}if(!l){var i=Y(e);i=i.replace(/(?:\r\n?|\n)$/,"");a={sourceCodeHtml:i,langExtension:g,sourceNode:e};v(a);k()}}}if(f<c.length)setTimeout(j,250);else h&&h()}function k(){var e=a.prettyPrintedHtml;if(!e)return;var b=a.sourceNode;if(!C(b))b.innerHTML=e;else{for(var c=document.createElement("PRE"),f=0;f<b.attributes.length;++f){var d=b.attributes[f];if(d.specified){var k=d.name.toLowerCase();if(k==="class")c.className=d.value;else c.setAttribute(d.name,d.value)}}c.innerHTML=e;b.parentNode.replaceChild(c,b);b=c}if(i&&b.tagName==="PRE")for(var g=b.getElementsByTagName("br"),j=g.length;--j>=0;){var h=g[j];h.parentNode.replaceChild(document.createTextNode(l),h)}}j()}window.PR_normalizedHtml=i;window.prettyPrintOne=U;window.prettyPrint=bb;window.PR={combinePrefixPatterns:r,createSimpleLexer:e,registerLangHandler:a,sourceDecorator:b,PR_ATTRIB_NAME:w,PR_ATTRIB_VALUE:n,PR_COMMENT:f,PR_DECLARATION:x,PR_KEYWORD:F,PR_LITERAL:o,PR_NOCODE:G,PR_PLAIN:d,PR_PUNCTUATION:j,PR_SOURCE:H,PR_STRING:c,PR_TAG:K,PR_TYPE:I}})();
/*!
 * zeroclipboard
 * The Zero Clipboard library provides an easy way to copy text to the clipboard using an invisible Adobe Flash movie, and a JavaScript interface.
 * Copyright 2012 Jon Rohan, James M. Greene, .
 * Released under the MIT license
 * http://jonrohan.github.com/ZeroClipboard/
 * v1.1.7
 */;(function(){"use strict";var a=function(a,b){var c=a.style[b];a.currentStyle?c=a.currentStyle[b]:window.getComputedStyle&&(c=document.defaultView.getComputedStyle(a,null).getPropertyValue(b));if(c=="auto"&&b=="cursor"){var d=["a"];for(var e=0;e<d.length;e++)if(a.tagName.toLowerCase()==d[e])return"pointer"}return c},b=function(a){if(!l.prototype._singleton)return;a||(a=window.event);var b;this!==window?b=this:a.target?b=a.target:a.srcElement&&(b=a.srcElement),l.prototype._singleton.setCurrent(b)},c=function(a,b,c){a.addEventListener?a.addEventListener(b,c,!1):a.attachEvent&&a.attachEvent("on"+b,c)},d=function(a,b,c){a.removeEventListener?a.removeEventListener(b,c,!1):a.detachEvent&&a.detachEvent("on"+b,c)},e=function(a,b){if(a.addClass)return a.addClass(b),a;if(b&&typeof b=="string"){var c=(b||"").split(/\s+/);if(a.nodeType===1)if(!a.className)a.className=b;else{var d=" "+a.className+" ",e=a.className;for(var f=0,g=c.length;f<g;f++)d.indexOf(" "+c[f]+" ")<0&&(e+=" "+c[f]);a.className=e.replace(/^\s+|\s+$/g,"")}}return a},f=function(a,b){if(a.removeClass)return a.removeClass(b),a;if(b&&typeof b=="string"||b===undefined){var c=(b||"").split(/\s+/);if(a.nodeType===1&&a.className)if(b){var d=(" "+a.className+" ").replace(/[\n\t]/g," ");for(var e=0,f=c.length;e<f;e++)d=d.replace(" "+c[e]+" "," ");a.className=d.replace(/^\s+|\s+$/g,"")}else a.className=""}return a},g=function(b){var c={left:0,top:0,width:b.width||b.offsetWidth||0,height:b.height||b.offsetHeight||0,zIndex:9999},d=a(b,"zIndex");d&&d!="auto"&&(c.zIndex=parseInt(d,10));while(b){var e=parseInt(a(b,"borderLeftWidth"),10),f=parseInt(a(b,"borderTopWidth"),10);c.left+=isNaN(b.offsetLeft)?0:b.offsetLeft,c.left+=isNaN(e)?0:e,c.top+=isNaN(b.offsetTop)?0:b.offsetTop,c.top+=isNaN(f)?0:f,b=b.offsetParent}return c},h=function(a){return(a.indexOf("?")>=0?"&":"?")+"nocache="+(new Date).getTime()},i=function(a){var b=[];return a.trustedDomains&&(typeof a.trustedDomains=="string"?b.push("trustedDomain="+a.trustedDomains):b.push("trustedDomain="+a.trustedDomains.join(","))),b.join("&")},j=function(a,b){if(b.indexOf)return b.indexOf(a);for(var c=0,d=b.length;c<d;c++)if(b[c]===a)return c;return-1},k=function(a){if(typeof a=="string")throw new TypeError("ZeroClipboard doesn't accept query strings.");return a.length?a:[a]},l=function(a,b){a&&(l.prototype._singleton||this).glue(a);if(l.prototype._singleton)return l.prototype._singleton;l.prototype._singleton=this,this.options={};for(var c in o)this.options[c]=o[c];for(var d in b)this.options[d]=b[d];this.handlers={},l.detectFlashSupport()&&p()},m,n=[];l.prototype.setCurrent=function(b){m=b,this.reposition(),b.getAttribute("title")&&this.setTitle(b.getAttribute("title")),this.setHandCursor(a(b,"cursor")=="pointer")},l.prototype.setText=function(a){a&&a!==""&&(this.options.text=a,this.ready()&&this.flashBridge.setText(a))},l.prototype.setTitle=function(a){a&&a!==""&&this.htmlBridge.setAttribute("title",a)},l.prototype.setSize=function(a,b){this.ready()&&this.flashBridge.setSize(a,b)},l.prototype.setHandCursor=function(a){this.ready()&&this.flashBridge.setHandCursor(a)},l.version="1.1.7";var o={moviePath:"ZeroClipboard.swf",trustedDomains:null,text:null,hoverClass:"zeroclipboard-is-hover",activeClass:"zeroclipboard-is-active",allowScriptAccess:"sameDomain"};l.setDefaults=function(a){for(var b in a)o[b]=a[b]},l.destroy=function(){l.prototype._singleton.unglue(n);var a=l.prototype._singleton.htmlBridge;a.parentNode.removeChild(a),delete l.prototype._singleton},l.detectFlashSupport=function(){var a=!1;try{new ActiveXObject("ShockwaveFlash.ShockwaveFlash")&&(a=!0)}catch(b){navigator.mimeTypes["application/x-shockwave-flash"]&&(a=!0)}return a};var p=function(){var a=l.prototype._singleton,b=document.getElementById("global-zeroclipboard-html-bridge");if(!b){var c='      <object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000" id="global-zeroclipboard-flash-bridge" width="100%" height="100%">         <param name="movie" value="'+a.options.moviePath+h(a.options.moviePath)+'"/>         <param name="allowScriptAccess" value="'+a.options.allowScriptAccess+'"/>         <param name="scale" value="exactfit"/>         <param name="loop" value="false"/>         <param name="menu" value="false"/>         <param name="quality" value="best" />         <param name="bgcolor" value="#ffffff"/>         <param name="wmode" value="transparent"/>         <param name="flashvars" value="'+i(a.options)+'"/>         <embed src="'+a.options.moviePath+h(a.options.moviePath)+'"           loop="false" menu="false"           quality="best" bgcolor="#ffffff"           width="100%" height="100%"           name="global-zeroclipboard-flash-bridge"           allowScriptAccess="always"           allowFullScreen="false"           type="application/x-shockwave-flash"           wmode="transparent"           pluginspage="http://www.macromedia.com/go/getflashplayer"           flashvars="'+i(a.options)+'"           scale="exactfit">         </embed>       </object>';b=document.createElement("div"),b.id="global-zeroclipboard-html-bridge",b.setAttribute("class","global-zeroclipboard-container"),b.setAttribute("data-clipboard-ready",!1),b.style.position="absolute",b.style.left="-9999px",b.style.top="-9999px",b.style.width="15px",b.style.height="15px",b.style.zIndex="9999",b.innerHTML=c,document.body.appendChild(b)}a.htmlBridge=b,a.flashBridge=document["global-zeroclipboard-flash-bridge"]||b.children[0].lastElementChild};l.prototype.resetBridge=function(){this.htmlBridge.style.left="-9999px",this.htmlBridge.style.top="-9999px",this.htmlBridge.removeAttribute("title"),this.htmlBridge.removeAttribute("data-clipboard-text"),f(m,this.options.activeClass),m=null,this.options.text=null},l.prototype.ready=function(){var a=this.htmlBridge.getAttribute("data-clipboard-ready");return a==="true"||a===!0},l.prototype.reposition=function(){if(!m)return!1;var a=g(m);this.htmlBridge.style.top=a.top+"px",this.htmlBridge.style.left=a.left+"px",this.htmlBridge.style.width=a.width+"px",this.htmlBridge.style.height=a.height+"px",this.htmlBridge.style.zIndex=a.zIndex+1,this.setSize(a.width,a.height)},l.dispatch=function(a,b){l.prototype._singleton.receiveEvent(a,b)},l.prototype.on=function(a,b){var c=a.toString().split(/\s/g);for(var d=0;d<c.length;d++)a=c[d].toLowerCase().replace(/^on/,""),this.handlers[a]||(this.handlers[a]=b);this.handlers.noflash&&!l.detectFlashSupport()&&this.receiveEvent("onNoFlash",null)},l.prototype.addEventListener=l.prototype.on,l.prototype.off=function(a,b){var c=a.toString().split(/\s/g);for(var d=0;d<c.length;d++){a=c[d].toLowerCase().replace(/^on/,"");for(var e in this.handlers)e===a&&this.handlers[e]===b&&delete this.handlers[e]}},l.prototype.removeEventListener=l.prototype.off,l.prototype.receiveEvent=function(a,b){a=a.toString().toLowerCase().replace(/^on/,"");var c=m;switch(a){case"load":if(b&&parseFloat(b.flashVersion.replace(",",".").replace(/[^0-9\.]/gi,""))<10){this.receiveEvent("onWrongFlash",{flashVersion:b.flashVersion});return}this.htmlBridge.setAttribute("data-clipboard-ready",!0);break;case"mouseover":e(c,this.options.hoverClass);break;case"mouseout":f(c,this.options.hoverClass),this.resetBridge();break;case"mousedown":e(c,this.options.activeClass);break;case"mouseup":f(c,this.options.activeClass);break;case"datarequested":var d=c.getAttribute("data-clipboard-target"),g=d?document.getElementById(d):null;if(g){var h=g.value||g.textContent||g.innerText;h&&this.setText(h)}else{var i=c.getAttribute("data-clipboard-text");i&&this.setText(i)}break;case"complete":this.options.text=null}if(this.handlers[a]){var j=this.handlers[a];typeof j=="function"?j.call(c,this,b):typeof j=="string"&&window[j].call(c,this,b)}},l.prototype.glue=function(a){a=k(a);for(var d=0;d<a.length;d++)j(a[d],n)==-1&&(n.push(a[d]),c(a[d],"mouseover",b))},l.prototype.unglue=function(a){a=k(a);for(var c=0;c<a.length;c++){d(a[c],"mouseover",b);var e=j(a[c],n);e!=-1&&n.splice(e,1)}},typeof module!="undefined"?module.exports=l:typeof define=="function"&&define.amd?define(function(){return l}):window.ZeroClipboard=l})();
/* http://keith-wood.name/calendars.html
   Calendars for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Calendars - generic date access and manipulation. */
function Calendars() {
	this.regional = {
		'': {invalidCalendar: 'Calendar {0} not found',
			invalidDate: 'Invalid {0} date',
			invalidMonth: 'Invalid {0} month',
			invalidYear: 'Invalid {0} year',
			differentCalendars: 'Cannot mix {0} and {1} dates'}
	};
	this.local = this.regional[''];
	this.calendars = {};
	this._localCals = {};
}

$.extend(Calendars.prototype, {

	/* Obtain a calendar implementation and localisation.
	   @param  name      (string) the name of the calendar,
	                     e.g. 'gregorian' (default), 'persian', 'islamic' (optional)
	   @param  language  (string) the language code to use for localisation
	                     (optional, default English = 'en')
	   @return  the calendar and localisation
	   @throws  error if calendar not found */
	instance: function(name, language) {
		name = (name || 'gregorian').toLowerCase();
		language = language || '';
		var cal = this._localCals[name + '-' + language];
		if (!cal && this.calendars[name]) {
			cal = new this.calendars[name](language);
			this._localCals[name + '-' + language] = cal;
		}
		if (!cal) {
			throw (this.local.invalidCalendar || this.regional[''].invalidCalendar).
				replace(/\{0\}/, name);
		}
		return cal;
	},

	/* Create a new date - for today if no other parameters given.
	   @param  year      (CDate) the date to copy or
	                     (number) the year for the date
	   @param  month     (number, optional) the month for the date
	   @param  day       (number, optional) the day for the date
	   @param  calendar  (*Calendar) the underlying calendar
	                     or (string) the name of the calendar (optional, default Gregorian)
	   @param  language  (string) the language to use for localisation (optional, default English)
	   @return  (CDate) the new date
	   @throws  error if an invalid date */
	newDate: function(year, month, day, calendar, language) {
		calendar = (year != null && year.year ? year.calendar() : (typeof calendar == 'string' ?
			this.instance(calendar, language) : calendar)) || this.instance();
		return calendar.newDate(year, month, day);
	}
});

/* Generic date, based on a particular calendar.
   @param  calendar  (*Calendar) the underlying calendar implementation
   @param  year      (number) the year for this date
   @param  month     (number) the month for this date
   @param  day       (number) the day for this date
   @return  (CDate) the date object
   @throws  error if an invalid date */
function CDate(calendar, year, month, day) {
	this._calendar = calendar;
	this._year = year;
	this._month = month;
	this._day = day;
	if (this._calendar._validateLevel == 0 &&
			!this._calendar.isValid(this._year, this._month, this._day)) {
		throw ($.calendars.local.invalidDate || $.calendars.regional[''].invalidDate).
			replace(/\{0\}/, this._calendar.local.name);
	}
}

/* Pad a numeric value with leading zeroes.
   @param  value   (number) the number to format
   @param  length  (number) the minimum length
   @return  (string) the formatted number */
function pad(value, length) {
	value = '' + value;
	return '000000'.substring(0, length - value.length) + value;
}

$.extend(CDate.prototype, {

	/* Create a new date.
	   @param  year   (CDate) the date to copy or
	                  (number) the year for the date (optional, default this date)
	   @param  month  (number) the month for the date (optional)
	   @param  day    (number) the day for the date (optional)
	   @return  (CDate) the new date
	   @throws  error if an invalid date */
	newDate: function(year, month, day) {
		return this._calendar.newDate((year == null ? this : year), month, day);
	},

	/* Set or retrieve the year for this date.
	   @param  year  (number) the year for the date (optional)
	   @return  (number) the date's year (if no parameter) or
	            (CDate) the updated date
	   @throws  error if an invalid date */
	year: function(year) {
		return (arguments.length == 0 ? this._year : this.set(year, 'y'));
	},

	/* Set or retrieve the month for this date.
	   @param  month  (number) the month for the date (optional)
	   @return  (number) the date's month (if no parameter) or
	            (CDate) the updated date
	   @throws  error if an invalid date */
	month: function(month) {
		return (arguments.length == 0 ? this._month : this.set(month, 'm'));
	},

	/* Set or retrieve the day for this date.
	   @param  day  (number) the day for the date (optional)
	   @return  (number) the date's day (if no parameter) or
	            (CDate) the updated date
	   @throws  error if an invalid date */
	day: function(day) {
		return (arguments.length == 0 ? this._day : this.set(day, 'd'));
	},

	/* Set new values for this date.
	   @param  year   (number) the year for the date
	   @param  month  (number) the month for the date
	   @param  day    (number) the day for the date
	   @return  (CDate) the updated date
	   @throws  error if an invalid date */
	date: function(year, month, day) {
		if (!this._calendar.isValid(year, month, day)) {
			throw ($.calendars.local.invalidDate || $.calendars.regional[''].invalidDate).
				replace(/\{0\}/, this._calendar.local.name);
		}
		this._year = year;
		this._month = month;
		this._day = day;
		return this;
	},

	/* Determine whether this date is in a leap year.
	   @return  (boolean) true if this is a leap year, false if not */
	leapYear: function() {
		return this._calendar.leapYear(this);
	},

	/* Retrieve the epoch designator for this date, e.g. BCE or CE.
	   @return  (string) the current epoch */
	epoch: function() {
		return this._calendar.epoch(this);
	},

	/* Format the year, if not a simple sequential number.
	   @return  (string) the formatted year */
	formatYear: function() {
		return this._calendar.formatYear(this);
	},

	/* Retrieve the month of the year for this date,
	   i.e. the month's position within a numbered year.
	   @return  (number) the month of the year: minMonth to months per year */
	monthOfYear: function() {
		return this._calendar.monthOfYear(this);
	},

	/* Retrieve the week of the year for this date.
	   @return  (number) the week of the year: 1 to weeks per year */
	weekOfYear: function() {
		return this._calendar.weekOfYear(this);
	},

	/* Retrieve the number of days in the year for this date.
	   @return  (number) the number of days in this year */
	daysInYear: function() {
		return this._calendar.daysInYear(this);
	},

	/* Retrieve the day of the year for this date.
	   @return  (number) the day of the year: 1 to days per year */
	dayOfYear: function() {
		return this._calendar.dayOfYear(this);
	},

	/* Retrieve the number of days in the month for this date.
	   @return  (number) the number of days */
	daysInMonth: function() {
		return this._calendar.daysInMonth(this);
	},

	/* Retrieve the day of the week for this date.
	   @return  (number) the day of the week: 0 to number of days - 1 */
	dayOfWeek: function() {
		return this._calendar.dayOfWeek(this);
	},

	/* Determine whether this date is a week day.
	   @return  (boolean) true if a week day, false if not */
	weekDay: function() {
		return this._calendar.weekDay(this);
	},

	/* Retrieve additional information about this date.
	   @return  (object) additional information - contents depends on calendar */
	extraInfo: function() {
		return this._calendar.extraInfo(this);
	},

	/* Add period(s) to a date.
	   @param  offset  (number) the number of periods to adjust by
	   @param  period  (string) one of 'y' for year, 'm' for month, 'w' for week, 'd' for day
	   @return  (CDate) the updated date */
	add: function(offset, period) {
		return this._calendar.add(this, offset, period);
	},

	/* Set a portion of the date.
	   @param  value   (number) the new value for the period
	   @param  period  (string) one of 'y' for year, 'm' for month, 'd' for day
	   @return  (CDate) the updated date
	   @throws  error if not a valid date */
	set: function(value, period) {
		return this._calendar.set(this, value, period);
	},

	/* Compare this date to another date.
	   @param  date  (CDate) the other date
	   @return  (number) -1 if this date is before the other date,
	            0 if they are equal, or +1 if this date is after the other date */
	compareTo: function(date) {
		if (this._calendar.name != date._calendar.name) {
			throw ($.calendars.local.differentCalendars || $.calendars.regional[''].differentCalendars).
				replace(/\{0\}/, this._calendar.local.name).replace(/\{1\}/, date._calendar.local.name);
		}
		var c = (this._year != date._year ? this._year - date._year :
			this._month != date._month ? this.monthOfYear() - date.monthOfYear() :
			this._day - date._day);
		return (c == 0 ? 0 : (c < 0 ? -1 : +1));
	},

	/* Retrieve the calendar backing this date.
	   @return  (*Calendar) the calendar implementation */
	calendar: function() {
		return this._calendar;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @return  (number) the equivalent Julian date */
	toJD: function() {
		return this._calendar.toJD(this);
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		return this._calendar.fromJD(jd);
	},

	/* Convert this date to a standard (Gregorian) JavaScript Date.
	   @return  (Date) the equivalent JavaScript date */
	toJSDate: function() {
		return this._calendar.toJSDate(this);
	},

	/* Create a new date from a standard (Gregorian) JavaScript Date.
	   @param  jsd  (Date) the JavaScript date to convert
	   @return  (CDate) the equivalent date */
	fromJSDate: function(jsd) {
		return this._calendar.fromJSDate(jsd);
	},

	/* Convert to a string for display.
	   @return  (string) this date as a string */
	toString: function() {
		return (this.year() < 0 ? '-' : '') + pad(Math.abs(this.year()), 4) +
			'-' + pad(this.month(), 2) + '-' + pad(this.day(), 2);
	}
});

/* Basic functionality for all calendars.
   Other calendars should extend this:
   OtherCalendar.prototype = new BaseCalendar; */
function BaseCalendar() {
	this.shortYearCutoff = '+10';
}

$.extend(BaseCalendar.prototype, {
	_validateLevel: 0, // "Stack" to turn validation on/off

	/* Create a new date within this calendar - today if no parameters given.
	   @param  year   (CDate) the date to duplicate or
	                  (number) the year for the date
	   @param  month  (number) the month for the date
	   @param  day    (number) the day for the date
	   @return  (CDate) the new date
	   @throws  error if not a valid date or a different calendar used */
	newDate: function(year, month, day) {
		if (year == null) {
			return this.today();
		}
		if (year.year) {
			this._validate(year, month, day,
				$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
			day = year.day();
			month = year.month();
			year = year.year();
		}
		return new CDate(this, year, month, day);
	},

	/* Create a new date for today.
	   @return  (CDate) today's date */
	today: function() {
		return this.fromJSDate(new Date());
	},

	/* Retrieve the epoch designator for this date.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (string) the current epoch
	   @throws  error if an invalid year or a different calendar used */
	epoch: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return (date.year() < 0 ? this.local.epochs[0] : this.local.epochs[1]);
	},

	/* Format the year, if not a simple sequential number
	   @param  year  (CDate) the date to format or
	                 (number) the year to format
	   @return  (string) the formatted year
	   @throws  error if an invalid year or a different calendar used */
	formatYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return (date.year() < 0 ? '-' : '') + pad(Math.abs(date.year()), 4)
	},

	/* Retrieve the number of months in a year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (number) the number of months
	   @throws  error if an invalid year or a different calendar used */
	monthsInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return 12;
	},

	/* Calculate the month's ordinal position within the year -
	   for those calendars that don't start at month 1!
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @return  (number) the ordinal position, starting from minMonth
	   @throws  error if an invalid year/month or a different calendar used */
	monthOfYear: function(year, month) {
		var date = this._validate(year, month, this.minDay,
			$.calendars.local.invalidMonth || $.calendars.regional[''].invalidMonth);
		return (date.month() + this.monthsInYear(date) - this.firstMonth) %
			this.monthsInYear(date) + this.minMonth;
	},

	/* Calculate actual month from ordinal position, starting from minMonth.
	   @param  year  (number) the year to examine
	   @param  ord   (number) the month's ordinal position
	   @return  (number) the month's number
	   @throws  error if an invalid year/month */
	fromMonthOfYear: function(year, ord) {
		var m = (ord + this.firstMonth - 2 * this.minMonth) %
			this.monthsInYear(year) + this.minMonth;
		this._validate(year, m, this.minDay,
			$.calendars.local.invalidMonth || $.calendars.regional[''].invalidMonth);
		return m;
	},

	/* Retrieve the number of days in a year.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @return  (number) the number of days
	   @throws  error if an invalid year or a different calendar used */
	daysInYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return (this.leapYear(date) ? 366 : 365);
	},

	/* Retrieve the day of the year for a date.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the day of the year
	   @throws  error if an invalid date or a different calendar used */
	dayOfYear: function(year, month, day) {
		var date = this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		return date.toJD() - this.newDate(date.year(),
			this.fromMonthOfYear(date.year(), this.minMonth), this.minDay).toJD() + 1;
	},

	/* Retrieve the number of days in a week.
	   @return  (number) the number of days */
	daysInWeek: function() {
		return 7;
	},

	/* Retrieve the day of the week for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the day of the week: 0 to number of days - 1
	   @throws  error if an invalid date or a different calendar used */
	dayOfWeek: function(year, month, day) {
		var date = this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		return (Math.floor(this.toJD(date)) + 2) % this.daysInWeek();
	},

	/* Retrieve additional information about a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (object) additional information - contents depends on calendar
	   @throws  error if an invalid date or a different calendar used */
	extraInfo: function(year, month, day) {
		this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		return {};
	},

	/* Add period(s) to a date.
	   Cater for no year zero.
	   @param  date    (CDate) the starting date
	   @param  offset  (number) the number of periods to adjust by
	   @param  period  (string) one of 'y' for year, 'm' for month, 'w' for week, 'd' for day
	   @return  (CDate) the updated date
	   @throws  error if a different calendar used */
	add: function(date, offset, period) {
		this._validate(date, this.minMonth, this.minDay,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		return this._correctAdd(date, this._add(date, offset, period), offset, period);
	},

	/* Add period(s) to a date.
	   @param  date    (CDate) the starting date
	   @param  offset  (number) the number of periods to adjust by
	   @param  period  (string) one of 'y' for year, 'm' for month, 'w' for week, 'd' for day
	   @return  (CDate) the updated date */
	_add: function(date, offset, period) {
		this._validateLevel++;
		if (period == 'd' || period == 'w') {
			var jd = date.toJD() + offset * (period == 'w' ? this.daysInWeek() : 1);
			var d = date.calendar().fromJD(jd);
			this._validateLevel--;
			return [d.year(), d.month(), d.day()];
		}
		try {
			var y = date.year() + (period == 'y' ? offset : 0);
			var m = date.monthOfYear() + (period == 'm' ? offset : 0);
			var d = date.day();// + (period == 'd' ? offset : 0) +
				//(period == 'w' ? offset * this.daysInWeek() : 0);
			var resyncYearMonth = function(calendar) {
				while (m < calendar.minMonth) {
					y--;
					m += calendar.monthsInYear(y);
					}
				var yearMonths = calendar.monthsInYear(y);
				while (m > yearMonths - 1 + calendar.minMonth) {
					y++;
					m -= yearMonths;
					yearMonths = calendar.monthsInYear(y);
				}
			};
			if (period == 'y') {
				if (date.month() != this.fromMonthOfYear(y, m)) { // Hebrew
					m = this.newDate(y, date.month(), this.minDay).monthOfYear();
				}
				m = Math.min(m, this.monthsInYear(y));
				d = Math.min(d, this.daysInMonth(y, this.fromMonthOfYear(y, m)));
			}
			else if (period == 'm') {
				resyncYearMonth(this);
				d = Math.min(d, this.daysInMonth(y, this.fromMonthOfYear(y, m)));
			}
			var ymd = [y, this.fromMonthOfYear(y, m), d];
			this._validateLevel--;
			return ymd;
		}
		catch (e) {
			this._validateLevel--;
			throw e;
		}
	},

	/* Correct a candidate date after adding period(s) to a date.
	   Handle no year zero if necessary.
	   @param  date    (CDate) the starting date
	   @param  ymd     (number[3]) the added date
	   @param  offset  (number) the number of periods to adjust by
	   @param  period  (string) one of 'y' for year, 'm' for month, 'w' for week, 'd' for day
	   @return  (CDate) the updated date */
	_correctAdd: function(date, ymd, offset, period) {
		if (!this.hasYearZero && (period == 'y' || period == 'm')) {
			if (ymd[0] == 0 || // In year zero
					(date.year() > 0) != (ymd[0] > 0)) { // Crossed year zero
				var adj = {y: [1, 1, 'y'], m: [1, this.monthsInYear(-1), 'm'],
					w: [this.daysInWeek(), this.daysInYear(-1), 'd'],
					d: [1, this.daysInYear(-1), 'd']}[period];
				var dir = (offset < 0 ? -1 : +1);
				ymd = this._add(date, offset * adj[0] + dir * adj[1], adj[2]);
			}
		}
		return date.date(ymd[0], ymd[1], ymd[2]);
	},

	/* Set a portion of the date.
	   @param  date    (CDate) the starting date
	   @param  value   (number) the new value for the period
	   @param  period  (string) one of 'y' for year, 'm' for month, 'd' for day
	   @return  (CDate) the updated date
	   @throws  error if an invalid date or a different calendar used */
	set: function(date, value, period) {
		this._validate(date, this.minMonth, this.minDay,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		var y = (period == 'y' ? value : date.year());
		var m = (period == 'm' ? value : date.month());
		var d = (period == 'd' ? value : date.day());
		if (period == 'y' || period == 'm') {
			d = Math.min(d, this.daysInMonth(y, m));
		}
		return date.date(y, m, d);
	},

	/* Determine whether a date is valid for this calendar.
	   @param  year   (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a valid date, false if not */
	isValid: function(year, month, day) {
		this._validateLevel++;
		var valid = (this.hasYearZero || year != 0);
		if (valid) {
			var date = this.newDate(year, month, this.minDay);
			valid = (month >= this.minMonth && month - this.minMonth < this.monthsInYear(date)) &&
				(day >= this.minDay && day - this.minDay < this.daysInMonth(date));
		}
		this._validateLevel--;
		return valid;
	},

	/* Convert the date to a standard (Gregorian) JavaScript Date.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (Date) the equivalent JavaScript date
	   @throws  error if an invalid date or a different calendar used */
	toJSDate: function(year, month, day) {
		var date = this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		return $.calendars.instance().fromJD(this.toJD(date)).toJSDate();
	},

	/* Convert the date from a standard (Gregorian) JavaScript Date.
	   @param  jsd  (Date) the JavaScript date
	   @return  (CDate) the equivalent DateUtils date */
	fromJSDate: function(jsd) {
		return this.fromJD($.calendars.instance().fromJSDate(jsd).toJD());
	},

	/* Check that a candidate date is from the same calendar and is valid.
	   @param  year   (CDate) the date to validate or
	                  (number) the year to validate
	   @param  month  (number) the month to validate
	   @param  day    (number) the day to validate
	   @param  error  (string) error message if invalid
	   @throws  error if different calendars used or invalid date */
	_validate: function(year, month, day, error) {
		if (year.year) {
			if (this._validateLevel == 0 && this.name != year.calendar().name) {
				throw ($.calendars.local.differentCalendars || $.calendars.regional[''].differentCalendars).
					replace(/\{0\}/, this.local.name).replace(/\{1\}/, year.calendar().local.name);
			}
			return year;
		}
		try {
			this._validateLevel++;
			if (this._validateLevel == 1 && !this.isValid(year, month, day)) {
				throw error.replace(/\{0\}/, this.local.name);
			}
			var date = this.newDate(year, month, day);
			this._validateLevel--;
			return date;
		}
		catch (e) {
			this._validateLevel--;
			throw e;
		}
	}
});

/* Implementation of the Proleptic Gregorian Calendar.
   See http://en.wikipedia.org/wiki/Gregorian_calendar
   and http://en.wikipedia.org/wiki/Proleptic_Gregorian_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function GregorianCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

GregorianCalendar.prototype = new BaseCalendar;

$.extend(GregorianCalendar.prototype, {
	name: 'Gregorian', // The calendar name
	jdEpoch: 1721425.5, // Julian date of start of Gregorian epoch: 1 January 0001 CE
	daysPerMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Gregorian', // The calendar name
			epochs: ['BCE', 'CE'],
			monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'],
			monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
			dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
			dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
			dateFormat: 'mm/dd/yyyy', // See format options on parseDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},
	
	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		var year = date.year() + (date.year() < 0 ? 1 : 0); // No year zero
		return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
	},

	/* Determine the week of the year for a date - ISO 8601.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Thursday of this week starting on Monday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(4 - (checkDate.dayOfWeek() || 7), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay,
			$.calendars.local.invalidMonth || $.calendars.regional[''].invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 2 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		year = date.year();
		month = date.month();
		day = date.day();
		if (year < 0) { year++; } // No year zero
		// Jean Meeus algorithm, "Astronomical Algorithms", 1991
		if (month < 3) {
			month += 12;
			year--;
		}
		var a = Math.floor(year / 100);
		var b = 2 - a + Math.floor(a / 4);
		return Math.floor(365.25 * (year + 4716)) +
			Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		// Jean Meeus algorithm, "Astronomical Algorithms", 1991
		var z = Math.floor(jd + 0.5);
		var a = Math.floor((z - 1867216.25) / 36524.25);
		a = z + 1 + a - Math.floor(a / 4);
		var b = a + 1524;
		var c = Math.floor((b - 122.1) / 365.25);
		var d = Math.floor(365.25 * c);
		var e = Math.floor((b - d) / 30.6001);
		var day = b - d - Math.floor(e * 30.6001);
		var month = e - (e > 13.5 ? 13 : 1);
		var year = c - (month > 2.5 ? 4716 : 4715);
		if (year <= 0) { year--; } // No year zero
		return this.newDate(year, month, day);
	},

	/* Convert this date to a standard (Gregorian) JavaScript Date.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (Date) the equivalent JavaScript date
	   @throws  error if an invalid date or a different calendar used */
	toJSDate: function(year, month, day) {
		var date = this._validate(year, month, day,
			$.calendars.local.invalidDate || $.calendars.regional[''].invalidDate);
		var jsd = new Date(date.year(), date.month() - 1, date.day());
		jsd.setHours(0);
		jsd.setMinutes(0);
		jsd.setSeconds(0);
		jsd.setMilliseconds(0);
		// Hours may be non-zero on daylight saving cut-over:
		// > 12 when midnight changeover, but then cannot generate
		// midnight datetime, so jump to 1AM, otherwise reset.
		jsd.setHours(jsd.getHours() > 12 ? jsd.getHours() + 2 : 0);
		return jsd;
	},

	/* Create a new date from a standard (Gregorian) JavaScript Date.
	   @param  jsd  (Date) the JavaScript date to convert
	   @return  (CDate) the equivalent date */
	fromJSDate: function(jsd) {
		return this.newDate(jsd.getFullYear(), jsd.getMonth() + 1, jsd.getDate());
	}
});

// Singleton manager
$.calendars = new Calendars();

// Date template
$.calendars.cdate = CDate;

// Base calendar template
$.calendars.baseCalendar = BaseCalendar;

// Gregorian calendar implementation
$.calendars.calendars.gregorian = GregorianCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Calendars extras for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

(function($) { // Hide scope, no $ conflict

$.extend($.calendars.regional[''], {
	invalidArguments: 'Invalid arguments',
	invalidFormat: 'Cannot format a date from another calendar',
	missingNumberAt: 'Missing number at position {0}',
	unknownNameAt: 'Unknown name at position {0}',
	unexpectedLiteralAt: 'Unexpected literal at position {0}',
	unexpectedText: 'Additional text found at end'
});
$.calendars.local = $.calendars.regional[''];

$.extend($.calendars.cdate.prototype, {

	/* Format this date.
	   @param  format  (string) the date format to use (see BaseCalendar.formatDate) (optional)
	   @return  (string) the formatted date */
	formatDate: function(format) {
		return this._calendar.formatDate(format || '', this);
	}
});

$.extend($.calendars.baseCalendar.prototype, {

	UNIX_EPOCH: $.calendars.instance().newDate(1970, 1, 1).toJD(),
	SECS_PER_DAY: 24 * 60 * 60,
	TICKS_EPOCH: $.calendars.instance().jdEpoch, // 1 January 0001 CE
	TICKS_PER_DAY: 24 * 60 * 60 * 10000000,

	ATOM: 'yyyy-mm-dd', // RFC 3339/ISO 8601
	COOKIE: 'D, dd M yyyy',
	FULL: 'DD, MM d, yyyy',
	ISO_8601: 'yyyy-mm-dd',
	JULIAN: 'J',
	RFC_822: 'D, d M yy',
	RFC_850: 'DD, dd-M-yy',
	RFC_1036: 'D, d M yy',
	RFC_1123: 'D, d M yyyy',
	RFC_2822: 'D, d M yyyy',
	RSS: 'D, d M yy', // RFC 822
	TICKS: '!',
	TIMESTAMP: '@',
	W3C: 'yyyy-mm-dd', // ISO 8601

	/* Format a date object into a string value.
	   The format can be combinations of the following:
	   d  - day of month (no leading zero)
	   dd - day of month (two digit)
	   o  - day of year (no leading zeros)
	   oo - day of year (three digit)
	   D  - day name short
	   DD - day name long
	   w  - week of year (no leading zero)
	   ww - week of year (two digit)
	   m  - month of year (no leading zero)
	   mm - month of year (two digit)
	   M  - month name short
	   MM - month name long
	   yy - year (two digit)
	   yyyy - year (four digit)
	   YYYY - formatted year
	   J  - Julian date (days since January 1, 4713 BCE Greenwich noon)
	   @  - Unix timestamp (s since 01/01/1970)
	   !  - Windows ticks (100ns since 01/01/0001)
	   '...' - literal text
	   '' - single quote
	   @param  format    (string) the desired format of the date (optional, default calendar format)
	   @param  date      (CDate) the date value to format
	   @param  settings  (object) attributes include:
	                     dayNamesShort    (string[]) abbreviated names of the days from Sunday (optional)
	                     dayNames         (string[]) names of the days from Sunday (optional)
	                     monthNamesShort  (string[]) abbreviated names of the months (optional)
	                     monthNames       (string[]) names of the months (optional)
						 calculateWeek    (function) function that determines week of the year (optional)
	   @return  (string) the date in the above format
	   @throws  errors if the date is from a different calendar */
	formatDate: function(format, date, settings) {
		if (typeof format != 'string') {
			settings = date;
			date = format;
			format = '';
		}
		if (!date) {
			return '';
		}
		if (date.calendar() != this) {
			throw $.calendars.local.invalidFormat || $.calendars.regional[''].invalidFormat;
		}
		format = format || this.local.dateFormat;
		settings = settings || {};
		var dayNamesShort = settings.dayNamesShort || this.local.dayNamesShort;
		var dayNames = settings.dayNames || this.local.dayNames;
		var monthNamesShort = settings.monthNamesShort || this.local.monthNamesShort;
		var monthNames = settings.monthNames || this.local.monthNames;
		var calculateWeek = settings.calculateWeek || this.local.calculateWeek;
		// Check whether a format character is doubled
		var doubled = function(match, step) {
			var matches = 1;
			while (iFormat + matches < format.length && format.charAt(iFormat + matches) == match) {
				matches++;
			}
			iFormat += matches - 1;
			return Math.floor(matches / (step || 1)) > 1;
		};
		// Format a number, with leading zeroes if necessary
		var formatNumber = function(match, value, len, step) {
			var num = '' + value;
			if (doubled(match, step)) {
				while (num.length < len) {
					num = '0' + num;
				}
			}
			return num;
		};
		// Format a name, short or long as requested
		var formatName = function(match, value, shortNames, longNames) {
			return (doubled(match) ? longNames[value] : shortNames[value]);
		};
		var output = '';
		var literal = false;
		for (var iFormat = 0; iFormat < format.length; iFormat++) {
			if (literal) {
				if (format.charAt(iFormat) == "'" && !doubled("'")) {
					literal = false;
				}
				else {
					output += format.charAt(iFormat);
				}
			}
			else {
				switch (format.charAt(iFormat)) {
					case 'd': output += formatNumber('d', date.day(), 2); break;
					case 'D': output += formatName('D', date.dayOfWeek(),
						dayNamesShort, dayNames); break;
					case 'o': output += formatNumber('o', date.dayOfYear(), 3); break;
					case 'w': output += formatNumber('w', date.weekOfYear(), 2); break;
					case 'm': output += formatNumber('m', date.month(), 2); break;
					case 'M': output += formatName('M', date.month() - this.minMonth,
						monthNamesShort, monthNames); break;
					case 'y':
						output += (doubled('y', 2) ? date.year() :
							(date.year() % 100 < 10 ? '0' : '') + date.year() % 100);
						break;
					case 'Y':
						doubled('Y', 2);
						output += date.formatYear();
						break;
					case 'J': output += date.toJD(); break;
					case '@': output += (date.toJD() - this.UNIX_EPOCH) * this.SECS_PER_DAY; break;
					case '!': output += (date.toJD() - this.TICKS_EPOCH) * this.TICKS_PER_DAY; break;
					case "'":
						if (doubled("'")) {
							output += "'";
						}
						else {
							literal = true;
						}
						break;
					default:
						output += format.charAt(iFormat);
				}
			}
		}
		return output;
	},

	/* Parse a string value into a date object.
	   See formatDate for the possible formats, plus:
	   * - ignore rest of string
	   @param  format    (string) the expected format of the date ('' for default calendar format)
	   @param  value     (string) the date in the above format
	   @param  settings  (object) attributes include:
	                     shortYearCutoff  (number) the cutoff year for determining the century (optional)
	                     dayNamesShort    (string[]) abbreviated names of the days from Sunday (optional)
	                     dayNames         (string[]) names of the days from Sunday (optional)
	                     monthNamesShort  (string[]) abbreviated names of the months (optional)
	                     monthNames       (string[]) names of the months (optional)
	   @return  (CDate) the extracted date value or null if value is blank
	   @throws  errors if the format and/or value are missing,
	            if the value doesn't match the format,
	            or if the date is invalid */
	parseDate: function(format, value, settings) {
		if (value == null) {
			throw $.calendars.local.invalidArguments || $.calendars.regional[''].invalidArguments;
		}
		value = (typeof value == 'object' ? value.toString() : value + '');
		if (value == '') {
			return null;
		}
		format = format || this.local.dateFormat;
		settings = settings || {};
		var shortYearCutoff = settings.shortYearCutoff || this.shortYearCutoff;
		shortYearCutoff = (typeof shortYearCutoff != 'string' ? shortYearCutoff :
			this.today().year() % 100 + parseInt(shortYearCutoff, 10));
		var dayNamesShort = settings.dayNamesShort || this.local.dayNamesShort;
		var dayNames = settings.dayNames || this.local.dayNames;
		var monthNamesShort = settings.monthNamesShort || this.local.monthNamesShort;
		var monthNames = settings.monthNames || this.local.monthNames;
		var jd = -1;
		var year = -1;
		var month = -1;
		var day = -1;
		var doy = -1;
		var shortYear = false;
		var literal = false;
		// Check whether a format character is doubled
		var doubled = function(match, step) {
			var matches = 1;
			while (iFormat + matches < format.length && format.charAt(iFormat + matches) == match) {
				matches++;
			}
			iFormat += matches - 1;
			return Math.floor(matches / (step || 1)) > 1;
		};
		// Extract a number from the string value
		var getNumber = function(match, step) {
			var isDoubled = doubled(match, step);
			var size = [2, 3, isDoubled ? 4 : 2, isDoubled ? 4 : 2, 10, 11, 20]['oyYJ@!'.indexOf(match) + 1];
			var digits = new RegExp('^-?\\d{1,' + size + '}');
			var num = value.substring(iValue).match(digits);
			if (!num) {
				throw ($.calendars.local.missingNumberAt || $.calendars.regional[''].missingNumberAt).
					replace(/\{0\}/, iValue);
			}
			iValue += num[0].length;
			return parseInt(num[0], 10);
		};
		// Extract a name from the string value and convert to an index
		var calendar = this;
		var getName = function(match, shortNames, longNames, step) {
			var names = (doubled(match, step) ? longNames : shortNames);
			for (var i = 0; i < names.length; i++) {
				if (value.substr(iValue, names[i].length) == names[i]) {
					iValue += names[i].length;
					return i + calendar.minMonth;
				}
			}
			throw ($.calendars.local.unknownNameAt || $.calendars.regional[''].unknownNameAt).
				replace(/\{0\}/, iValue);
		};
		// Confirm that a literal character matches the string value
		var checkLiteral = function() {
			if (value.charAt(iValue) != format.charAt(iFormat)) {
				throw ($.calendars.local.unexpectedLiteralAt ||
					$.calendars.regional[''].unexpectedLiteralAt).replace(/\{0\}/, iValue);
			}
			iValue++;
		};
		var iValue = 0;
		for (var iFormat = 0; iFormat < format.length; iFormat++) {
			if (literal) {
				if (format.charAt(iFormat) == "'" && !doubled("'")) {
					literal = false;
				}
				else {
					checkLiteral();
				}
			}
			else {
				switch (format.charAt(iFormat)) {
					case 'd': day = getNumber('d'); break;
					case 'D': getName('D', dayNamesShort, dayNames); break;
					case 'o': doy = getNumber('o'); break;
					case 'w': getNumber('w'); break;
					case 'm': month = getNumber('m'); break;
					case 'M': month = getName('M', monthNamesShort, monthNames); break;
					case 'y':
						var iSave = iFormat;
						shortYear = !doubled('y', 2);
						iFormat = iSave;
						year = getNumber('y', 2);
						break;
					case 'Y': year = getNumber('Y', 2); break;
					case 'J':
						jd = getNumber('J') + 0.5;
						if (value.charAt(iValue) == '.') {
							iValue++;
							getNumber('J');
						}
						break;
					case '@': jd = getNumber('@') / this.SECS_PER_DAY + this.UNIX_EPOCH; break;
					case '!': jd = getNumber('!') / this.TICKS_PER_DAY + this.TICKS_EPOCH; break;
					case '*': iValue = value.length; break;
					case "'":
						if (doubled("'")) {
							checkLiteral();
						}
						else {
							literal = true;
						}
						break;
					default: checkLiteral();
				}
			}
		}
		if (iValue < value.length) {
			throw $.calendars.local.unexpectedText || $.calendars.regional[''].unexpectedText;
		}
		if (year == -1) {
			year = this.today().year();
		}
		else if (year < 100 && shortYear) {
			year += (shortYearCutoff == -1 ? 1900 : this.today().year() -
				this.today().year() % 100 - (year <= shortYearCutoff ? 0 : 100));
		}
		if (doy > -1) {
			month = 1;
			day = doy;
			for (var dim = this.daysInMonth(year, month); day > dim; dim = this.daysInMonth(year, month)) {
				month++;
				day -= dim;
			}
		}
		return (jd > -1 ? this.fromJD(jd) : this.newDate(year, month, day));
	},

	/* A date may be specified as an exact value or a relative one.
	   @param  dateSpec     (CDate or number or string) the date as an object or string
	                        in the given format or an offset - numeric days from today,
	                        or string amounts and periods, e.g. '+1m +2w'
	   @param  defaultDate  (CDate) the date to use if no other supplied, may be null
	   @param  currentDate  (CDate) the current date as a possible basis for relative dates,
	                        if null today is used (optional)
	   @param  dateFormat   (string) the expected date format - see formatDate above (optional)
	   @param  settings     (object) attributes include:
	                        shortYearCutoff  (number) the cutoff year for determining the century (optional)
	                        dayNamesShort    (string[7]) abbreviated names of the days from Sunday (optional)
	                        dayNames         (string[7]) names of the days from Sunday (optional)
	                        monthNamesShort  (string[12]) abbreviated names of the months (optional)
	                        monthNames       (string[12]) names of the months (optional)
	   @return  (CDate) the decoded date */
	determineDate: function(dateSpec, defaultDate, currentDate, dateFormat, settings) {
		if (currentDate && typeof currentDate != 'object') {
			settings = dateFormat;
			dateFormat = currentDate;
			currentDate = null;
		}
		if (typeof dateFormat != 'string') {
			settings = dateFormat;
			dateFormat = '';
		}
		var calendar = this;
		var offsetString = function(offset) {
			try {
				return calendar.parseDate(dateFormat, offset, settings);
			}
			catch (e) {
				// Ignore
			}
			offset = offset.toLowerCase();
			var date = (offset.match(/^c/) && currentDate ?
				currentDate.newDate() : null) || calendar.today();
			var pattern = /([+-]?[0-9]+)\s*(d|w|m|y)?/g;
			var matches = pattern.exec(offset);
			while (matches) {
				date.add(parseInt(matches[1], 10), matches[2] || 'd');
				matches = pattern.exec(offset);
			}
			return date;
		};
		defaultDate = (defaultDate ? defaultDate.newDate() : null);
		dateSpec = (dateSpec == null ? defaultDate :
			(typeof dateSpec == 'string' ? offsetString(dateSpec) : (typeof dateSpec == 'number' ?
			(isNaN(dateSpec) || dateSpec == Infinity || dateSpec == -Infinity ? defaultDate :
			calendar.today().add(dateSpec, 'd')) : calendar.newDate(dateSpec))));
		return dateSpec;
	}
});

})(jQuery);
/* http://keith-wood.name/calendars.html
   Calendars date picker for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

(function($) { // Hide scope, no $ conflict

/* Calendar picker manager. */
function CalendarsPicker() {
	this._defaults = {
		calendar: $.calendars.instance(), // The calendar to use
		pickerClass: '', // CSS class to add to this instance of the datepicker
		showOnFocus: true, // True for popup on focus, false for not
		showTrigger: null, // Element to be cloned for a trigger, null for none
		showAnim: 'show', // Name of jQuery animation for popup, '' for no animation
		showOptions: {}, // Options for enhanced animations
		showSpeed: 'normal', // Duration of display/closure
		popupContainer: null, // The element to which a popup calendar is added, null for body
		alignment: 'bottom', // Alignment of popup - with nominated corner of input:
			// 'top' or 'bottom' aligns depending on language direction,
			// 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'
		fixedWeeks: false, // True to always show 6 weeks, false to only show as many as are needed
		firstDay: null, // First day of the week, 0 = Sunday, 1 = Monday, ...
			// defaults to calendar local setting if null
		calculateWeek: null, // Calculate week of the year from a date, null for calendar default
		monthsToShow: 1, // How many months to show, cols or [rows, cols]
		monthsOffset: 0, // How many months to offset the primary month by
		monthsToStep: 1, // How many months to move when prev/next clicked
		monthsToJump: 12, // How many months to move when large prev/next clicked
		useMouseWheel: true, // True to use mousewheel if available, false to never use it
		changeMonth: true, // True to change month/year via drop-down, false for navigation only
		yearRange: 'c-10:c+10', // Range of years to show in drop-down: 'any' for direct text entry
			// or 'start:end', where start/end are '+-nn' for relative to today
			// or 'c+-nn' for relative to the currently selected date
			// or 'nnnn' for an absolute year
		showOtherMonths: false, // True to show dates from other months, false to not show them
		selectOtherMonths: false, // True to allow selection of dates from other months too
		defaultDate: null, // Date to show if no other selected
		selectDefaultDate: false, // True to pre-select the default date if no other is chosen
		minDate: null, // The minimum selectable date
		maxDate: null, // The maximum selectable date
		dateFormat: null, // Format for dates, defaults to calendar setting if null
		autoSize: false, // True to size the input field according to the date format
		rangeSelect: false, // Allows for selecting a date range on one date picker
		rangeSeparator: ' - ', // Text between two dates in a range
		multiSelect: 0, // Maximum number of selectable dates, zero for single select
		multiSeparator: ',', // Text between multiple dates
		onDate: null, // Callback as a date is added to the datepicker
		onShow: null, // Callback just before a datepicker is shown
		onChangeMonthYear: null, // Callback when a new month/year is selected
		onSelect: null, // Callback when a date is selected
		onClose: null, // Callback when a datepicker is closed
		altField: null, // Alternate field to update in synch with the datepicker
		altFormat: null, // Date format for alternate field, defaults to dateFormat
		constrainInput: true, // True to constrain typed input to dateFormat allowed characters
		commandsAsDateFormat: false, // True to apply formatDate to the command texts
		commands: this.commands // Command actions that may be added to a layout by name
	};
	this.regional = {
		'': {
			renderer: this.defaultRenderer, // The rendering templates
			prevText: '&lt;Prev', // Text for the previous month command
			prevStatus: 'Show the previous month', // Status text for the previous month command
			prevJumpText: '&lt;&lt;', // Text for the previous year command
			prevJumpStatus: 'Show the previous year', // Status text for the previous year command
			nextText: 'Next&gt;', // Text for the next month command
			nextStatus: 'Show the next month', // Status text for the next month command
			nextJumpText: '&gt;&gt;', // Text for the next year command
			nextJumpStatus: 'Show the next year', // Status text for the next year command
			currentText: 'Current', // Text for the current month command
			currentStatus: 'Show the current month', // Status text for the current month command
			todayText: 'Today', // Text for the today's month command
			todayStatus: 'Show today\'s month', // Status text for the today's month command
			clearText: 'Clear', // Text for the clear command
			clearStatus: 'Clear all the dates', // Status text for the clear command
			closeText: 'Close', // Text for the close command
			closeStatus: 'Close the datepicker', // Status text for the close command
			yearStatus: 'Change the year', // Status text for year selection
			monthStatus: 'Change the month', // Status text for month selection
			weekText: 'Wk', // Text for week of the year column header
			weekStatus: 'Week of the year', // Status text for week of the year column header
			dayStatus: 'Select DD, M d, yyyy', // Status text for selectable days
			defaultStatus: 'Select a date', // Status text shown by default
			isRTL: false // True if language is right-to-left
		}};
	$.extend(this._defaults, this.regional['']);
	this._disabled = [];
}

$.extend(CalendarsPicker.prototype, {
	dataName: 'calendarsPicker',
	
	/* Class name added to elements to indicate already configured with calendar picker. */
	markerClass: 'hasCalendarsPicker',

	_popupClass: 'calendars-popup', // Marker for popup division
	_triggerClass: 'calendars-trigger', // Marker for trigger element
	_disableClass: 'calendars-disable', // Marker for disabled element
	_coverClass: 'calendars-cover', // Marker for iframe backing element
	_monthYearClass: 'calendars-month-year', // Marker for month/year inputs
	_curMonthClass: 'calendars-month-', // Marker for current month/year
	_anyYearClass: 'calendars-any-year', // Marker for year direct input
	_curDoWClass: 'calendars-dow-', // Marker for day of week
	
	commands: { // Command actions that may be added to a layout by name
		// name: { // The command name, use '{button:name}' or '{link:name}' in layouts
		//		text: '', // The field in the regional settings for the displayed text
		//		status: '', // The field in the regional settings for the status text
		//      // The keystroke to trigger the action
		//		keystroke: {keyCode: nn, ctrlKey: boolean, altKey: boolean, shiftKey: boolean},
		//		enabled: fn, // The function that indicates the command is enabled
		//		date: fn, // The function to get the date associated with this action
		//		action: fn} // The function that implements the action
		prev: {text: 'prevText', status: 'prevStatus', // Previous month
			keystroke: {keyCode: 33}, // Page up
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				return (!minDate || inst.drawDate.newDate().
					add(1 - inst.get('monthsToStep') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay).add(-1, 'd').compareTo(minDate) != -1); },
			date: function(inst) {
				return inst.drawDate.newDate().
					add(-inst.get('monthsToStep') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay); },
			action: function(inst) {
				$.calendars.picker.changeMonth(this, -inst.get('monthsToStep')); }
		},
		prevJump: {text: 'prevJumpText', status: 'prevJumpStatus', // Previous year
			keystroke: {keyCode: 33, ctrlKey: true}, // Ctrl + Page up
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				return (!minDate || inst.drawDate.newDate().
					add(1 - inst.get('monthsToJump') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay).add(-1, 'd').compareTo(minDate) != -1); },
			date: function(inst) {
				return inst.drawDate.newDate().
					add(-inst.get('monthsToJump') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay); },
			action: function(inst) {
				$.calendars.picker.changeMonth(this, -inst.get('monthsToJump')); }
		},
		next: {text: 'nextText', status: 'nextStatus', // Next month
			keystroke: {keyCode: 34}, // Page down
			enabled: function(inst) {
				var maxDate = inst.get('maxDate');
				return (!maxDate || inst.drawDate.newDate().
					add(inst.get('monthsToStep') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay).compareTo(maxDate) != +1); },
			date: function(inst) {
				return inst.drawDate.newDate().
					add(inst.get('monthsToStep') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay); },
			action: function(inst) {
				$.calendars.picker.changeMonth(this, inst.get('monthsToStep')); }
		},
		nextJump: {text: 'nextJumpText', status: 'nextJumpStatus', // Next year
			keystroke: {keyCode: 34, ctrlKey: true}, // Ctrl + Page down
			enabled: function(inst) {
				var maxDate = inst.get('maxDate');
				return (!maxDate || inst.drawDate.newDate().
					add(inst.get('monthsToJump') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay).compareTo(maxDate) != +1);	},
			date: function(inst) {
				return inst.drawDate.newDate().
					add(inst.get('monthsToJump') - inst.get('monthsOffset'), 'm').
					day(inst.get('calendar').minDay); },
			action: function(inst) {
				$.calendars.picker.changeMonth(this, inst.get('monthsToJump')); }
		},
		current: {text: 'currentText', status: 'currentStatus', // Current month
			keystroke: {keyCode: 36, ctrlKey: true}, // Ctrl + Home
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				var maxDate = inst.get('maxDate');
				var curDate = inst.selectedDates[0] || inst.get('calendar').today();
				return (!minDate || curDate.compareTo(minDate) != -1) &&
					(!maxDate || curDate.compareTo(maxDate) != +1); },
			date: function(inst) {
				return inst.selectedDates[0] || inst.get('calendar').today(); },
			action: function(inst) {
				var curDate = inst.selectedDates[0] || inst.get('calendar').today();
				$.calendars.picker.showMonth(this, curDate.year(), curDate.month()); }
		},
		today: {text: 'todayText', status: 'todayStatus', // Today's month
			keystroke: {keyCode: 36, ctrlKey: true}, // Ctrl + Home
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				var maxDate = inst.get('maxDate');
				return (!minDate || inst.get('calendar').today().compareTo(minDate) != -1) &&
					(!maxDate || inst.get('calendar').today().compareTo(maxDate) != +1); },
			date: function(inst) { return inst.get('calendar').today(); },
			action: function(inst) { $.calendars.picker.showMonth(this); }
		},
		clear: {text: 'clearText', status: 'clearStatus', // Clear the datepicker
			keystroke: {keyCode: 35, ctrlKey: true}, // Ctrl + End
			enabled: function(inst) { return true; },
			date: function(inst) { return null; },
			action: function(inst) { $.calendars.picker.clear(this); }
		},
		close: {text: 'closeText', status: 'closeStatus', // Close the datepicker
			keystroke: {keyCode: 27}, // Escape
			enabled: function(inst) { return true; },
			date: function(inst) { return null; },
			action: function(inst) { $.calendars.picker.hide(this); }
		},
		prevWeek: {text: 'prevWeekText', status: 'prevWeekStatus', // Previous week
			keystroke: {keyCode: 38, ctrlKey: true}, // Ctrl + Up
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				return (!minDate || inst.drawDate.newDate().
					add(-inst.get('calendar').daysInWeek(), 'd').compareTo(minDate) != -1); },
			date: function(inst) { return inst.drawDate.newDate().
				add(-inst.get('calendar').daysInWeek(), 'd'); },
			action: function(inst) { $.calendars.picker.changeDay(
				this, -inst.get('calendar').daysInWeek()); }
		},
		prevDay: {text: 'prevDayText', status: 'prevDayStatus', // Previous day
			keystroke: {keyCode: 37, ctrlKey: true}, // Ctrl + Left
			enabled: function(inst) {
				var minDate = inst.curMinDate();
				return (!minDate || inst.drawDate.newDate().add(-1, 'd').
					compareTo(minDate) != -1); },
			date: function(inst) { return inst.drawDate.newDate().add(-1, 'd'); },
			action: function(inst) { $.calendars.picker.changeDay(this, -1); }
		},
		nextDay: {text: 'nextDayText', status: 'nextDayStatus', // Next day
			keystroke: {keyCode: 39, ctrlKey: true}, // Ctrl + Right
			enabled: function(inst) {
				var maxDate = inst.get('maxDate');
				return (!maxDate || inst.drawDate.newDate().add(1, 'd').
					compareTo(maxDate) != +1); },
			date: function(inst) { return inst.drawDate.newDate().add(1, 'd'); },
			action: function(inst) { $.calendars.picker.changeDay(this, 1); }
		},
		nextWeek: {text: 'nextWeekText', status: 'nextWeekStatus', // Next week
			keystroke: {keyCode: 40, ctrlKey: true}, // Ctrl + Down
			enabled: function(inst) {
				var maxDate = inst.get('maxDate');
				return (!maxDate || inst.drawDate.newDate().
					add(inst.get('calendar').daysInWeek(), 'd').compareTo(maxDate) != +1); },
			date: function(inst) { return inst.drawDate.newDate().
				add(inst.get('calendar').daysInWeek(), 'd'); },
			action: function(inst) { $.calendars.picker.changeDay(
				this, inst.get('calendar').daysInWeek()); }
		}
	},

	/* Default template for generating a calendar picker. */
	defaultRenderer: {
		// Anywhere: '{l10n:name}' to insert localised value for name,
		// '{link:name}' to insert a link trigger for command name,
		// '{button:name}' to insert a button trigger for command name,
		// '{popup:start}...{popup:end}' to mark a section for inclusion in a popup datepicker only,
		// '{inline:start}...{inline:end}' to mark a section for inclusion in an inline datepicker only
		// Overall structure: '{months}' to insert calendar months
		picker: '<div class="calendars">' +
		'<div class="calendars-nav">{link:prev}{link:today}{link:next}</div>{months}' +
		'{popup:start}<div class="calendars-ctrl">{link:clear}{link:close}</div>{popup:end}' +
		'<div class="calendars-clear-fix"></div></div>',
		// One row of months: '{months}' to insert calendar months
		monthRow: '<div class="calendars-month-row">{months}</div>',
		// A single month: '{monthHeader:dateFormat}' to insert the month header -
		// dateFormat is optional and defaults to 'MM yyyy',
		// '{weekHeader}' to insert a week header, '{weeks}' to insert the month's weeks
		month: '<div class="calendars-month"><div class="calendars-month-header">{monthHeader}</div>' +
		'<table><thead>{weekHeader}</thead><tbody>{weeks}</tbody></table></div>',
		// A week header: '{days}' to insert individual day names
		weekHeader: '<tr>{days}</tr>',
		// Individual day header: '{day}' to insert day name
		dayHeader: '<th>{day}</th>',
		// One week of the month: '{days}' to insert the week's days, '{weekOfYear}' to insert week of year
		week: '<tr>{days}</tr>',
		// An individual day: '{day}' to insert day value
		day: '<td>{day}</td>',
		// jQuery selector, relative to picker, for a single month
		monthSelector: '.calendars-month',
		// jQuery selector, relative to picker, for individual days
		daySelector: 'td',
		// Class for right-to-left (RTL) languages
		rtlClass: 'calendars-rtl',
		// Class for multi-month datepickers
		multiClass: 'calendars-multi',
		// Class for selectable dates
		defaultClass: '',
		// Class for currently selected dates
		selectedClass: 'calendars-selected',
		// Class for highlighted dates
		highlightedClass: 'calendars-highlight',
		// Class for today
		todayClass: 'calendars-today',
		// Class for days from other months
		otherMonthClass: 'calendars-other-month',
		// Class for days on weekends
		weekendClass: 'calendars-weekend',
		// Class prefix for commands
		commandClass: 'calendars-cmd',
		// Extra class(es) for commands that are buttons
		commandButtonClass: '',
		// Extra class(es) for commands that are links
		commandLinkClass: '',
		// Class for disabled commands
		disabledClass: 'calendars-disabled'
	},

	/* Override the default settings for all calendar picker instances.
	   @param  settings  (object) the new settings to use as defaults
	   @return  (CalendarPicker) this object */
	setDefaults: function(settings) {
		$.extend(this._defaults, settings || {});
		return this;
	},

	/* Attach the calendar picker functionality to an input field.
	   @param  target    (element) the control to affect
	   @param  settings  (object) the custom options for this instance */
	_attachPicker: function(target, settings) {
		target = $(target);
		if (target.hasClass(this.markerClass)) {
			return;
		}
		target.addClass(this.markerClass);
		var inst = {target: target, selectedDates: [], drawDate: null, pickingRange: false,
			inline: ($.inArray(target[0].nodeName.toLowerCase(), ['div', 'span']) > -1),
			get: function(name) { // Get a setting value, defaulting if necessary
				var value = this.settings[name] !== undefined ?
					this.settings[name] : $.calendars.picker._defaults[name];
				if ($.inArray(name, ['defaultDate', 'minDate', 'maxDate']) > -1) { // Decode date settings
					value = this.get('calendar').determineDate(
						value, null, this.selectedDates[0], this.get('dateFormat'), inst.getConfig());
				}
				else if (name == 'dateFormat') {
					value = value || this.get('calendar').local.dateFormat;
				}
				return value;
			},
			curMinDate: function() {
				return (this.pickingRange ? this.selectedDates[0] : this.get('minDate'));
			},
			getConfig: function() {
				return {dayNamesShort: this.get('dayNamesShort'), dayNames: this.get('dayNames'),
					monthNamesShort: this.get('monthNamesShort'), monthNames: this.get('monthNames'),
					calculateWeek: this.get('calculateWeek'),
					shortYearCutoff: this.get('shortYearCutoff')};
			}
		};
		$.data(target[0], this.dataName, inst);
		var inlineSettings = ($.fn.metadata ? target.metadata() : {});
		inst.settings = $.extend({}, settings || {}, inlineSettings || {});
		if (inst.inline) {
			this._update(target[0]);
			if ($.fn.mousewheel) {
				target.mousewheel(this._doMouseWheel);
			}
		}
		else {
			this._attachments(target, inst);
			target.bind('keydown.' + this.dataName, this._keyDown).
				bind('keypress.' + this.dataName, this._keyPress).
				bind('keyup.' + this.dataName, this._keyUp);
			if (target.attr('disabled')) {
				this.disable(target[0]);
			}
		}
	},

	/* Retrieve the settings for a calendar picker control.
	   @param  target  (element) the control to affect
	   @param  name    (string) the name of the setting (optional)
	   @return  (object) the current instance settings (name == 'all') or
	            (object) the default settings (no name) or
	            (any) the setting value (name supplied) */
	options: function(target, name) {
		var inst = $.data(target, this.dataName);
		return (inst ? (name ? (name == 'all' ?
			inst.settings : inst.settings[name]) : $.calendars.picker._defaults) : {});
	},

	/* Reconfigure the settings for a calendar picker control.
	   @param  target    (element) the control to affect
	   @param  settings  (object) the new options for this instance or
	                     (string) an individual property name
	   @param  value     (any) the individual property value (omit if settings is an object) */
	option: function(target, settings, value) {
		target = $(target);
		if (!target.hasClass(this.markerClass)) {
			return;
		}
		settings = settings || {};
		if (typeof settings == 'string') {
			var name = settings;
			settings = {};
			settings[name] = value;
		}
		var inst = $.data(target[0], this.dataName);
		if (settings.calendar && settings.calendar != inst.get('calendar')) {
			var discardDate = function(name) {
				return (typeof inst.settings[name] == 'object' ? null : inst.settings[name]);
			};
			settings = $.extend({defaultDate: discardDate('defaultDate'),
				minDate: discardDate('minDate'), maxDate: discardDate('maxDate')}, settings);
			inst.selectedDates = [];
			inst.drawDate = null;
		}
		var dates = inst.selectedDates;
		extendRemove(inst.settings, settings);
		this.setDate(target[0], dates, null, false, true);
		inst.pickingRange = false;
		var calendar = inst.get('calendar');
		inst.drawDate = this._checkMinMax(
			(settings.defaultDate ? inst.get('defaultDate') : inst.drawDate) ||
			inst.get('defaultDate') || calendar.today(), inst).newDate();
		if (!inst.inline) {
			this._attachments(target, inst);
		}
		if (inst.inline || inst.div) {
			this._update(target[0]);
		}
	},

	/* Attach events and trigger, if necessary.
	   @param  target  (jQuery) the control to affect
	   @param  inst    (object) the current instance settings */
	_attachments: function(target, inst) {
		target.unbind('focus.' + this.dataName);
		if (inst.get('showOnFocus')) {
			target.bind('focus.' + this.dataName, this.show);
		}
		if (inst.trigger) {
			inst.trigger.remove();
		}
		var trigger = inst.get('showTrigger');
		inst.trigger = (!trigger ? $([]) :
			$(trigger).clone().addClass(this._triggerClass)
				[inst.get('isRTL') ? 'insertBefore' : 'insertAfter'](target).
				click(function() {
					if (!$.calendars.picker.isDisabled(target[0])) {
						$.calendars.picker[$.calendars.picker.curInst == inst ?
							'hide' : 'show'](target[0]);
					}
				}));
		this._autoSize(target, inst);
		var dates = this._extractDates(inst, target.val());
		if (dates) {
			this.setDate(target[0], dates, null, true);
		}
		if (inst.get('selectDefaultDate') && inst.get('defaultDate') &&
				inst.selectedDates.length == 0) {
			var calendar = inst.get('calendar');
			this.setDate(target[0], 
				(inst.get('defaultDate') || calendar.today()).newDate());
		}
	},

	/* Apply the maximum length for the date format.
	   @param  inst  (object) the current instance settings */
	_autoSize: function(target, inst) {
		if (inst.get('autoSize') && !inst.inline) {
			var calendar = inst.get('calendar');
			var date = calendar.newDate(2009, 10, 20); // Ensure double digits
			var dateFormat = inst.get('dateFormat');
			if (dateFormat.match(/[DM]/)) {
				var findMax = function(names) {
					var max = 0;
					var maxI = 0;
					for (var i = 0; i < names.length; i++) {
						if (names[i].length > max) {
							max = names[i].length;
							maxI = i;
						}
					}
					return maxI;
				};
				date.month(findMax(calendar.local[dateFormat.match(/MM/) ? // Longest month
					'monthNames' : 'monthNamesShort']) + 1);
				date.day(findMax(calendar.local[dateFormat.match(/DD/) ? // Longest day
					'dayNames' : 'dayNamesShort']) + 20 - date.dayOfWeek());
			}
			inst.target.attr('size', date.formatDate(dateFormat).length);
		}
	},

	/* Remove the calendar picker functionality from a control.
	   @param  target  (element) the control to affect */
	destroy: function(target) {
		target = $(target);
		if (!target.hasClass(this.markerClass)) {
			return;
		}
		var inst = $.data(target[0], this.dataName);
		if (inst.trigger) {
			inst.trigger.remove();
		}
		target.removeClass(this.markerClass).empty().unbind('.' + this.dataName);
		if (inst.inline && $.fn.mousewheel) {
			target.unmousewheel();
		}
		if (!inst.inline && inst.get('autoSize')) {
			target.removeAttr('size');
		}
		$.removeData(target[0], this.dataName);
	},

	/* Apply multiple event functions.
	   Usage, for example: onShow: multipleEvents(fn1, fn2, ...)
	   @param  fns  (function...) the functions to apply */
	multipleEvents: function(fns) {
		var funcs = arguments;
		return function(args) {
			for (var i = 0; i < funcs.length; i++) {
				funcs[i].apply(this, arguments);
			}
		};
	},

	/* Enable the datepicker and any associated trigger.
	   @param  target  (element) the control to use */
	enable: function(target) {
		var $target = $(target);
		if (!$target.hasClass(this.markerClass)) {
			return;
		}
		var inst = $.data(target, this.dataName);
		if (inst.inline)
			$target.children('.' + this._disableClass).remove().end().
				find('button,select').attr('disabled', '').end().
				find('a').attr('href', 'javascript:void(0)');
		else {
			target.disabled = false;
			inst.trigger.filter('button.' + this._triggerClass).
				attr('disabled', '').end().
				filter('img.' + this._triggerClass).
				css({opacity: '1.0', cursor: ''});
		}
		this._disabled = $.map(this._disabled,
			function(value) { return (value == target ? null : value); }); // Delete entry
	},

	/* Disable the datepicker and any associated trigger.
	   @param  target  (element) the control to use */
	disable: function(target) {
		var $target = $(target);
		if (!$target.hasClass(this.markerClass))
			return;
		var inst = $.data(target, this.dataName);
		if (inst.inline) {
			var inline = $target.children(':last');
			var offset = inline.offset();
			var relOffset = {left: 0, top: 0};
			inline.parents().each(function() {
				if ($(this).css('position') == 'relative') {
					relOffset = $(this).offset();
					return false;
				}
			});
			var zIndex = $target.css('zIndex');
			zIndex = (zIndex == 'auto' ? 0 : parseInt(zIndex, 10)) + 1;
			$target.prepend('<div class="' + this._disableClass + '" style="' +
				'width: ' + inline.outerWidth() + 'px; height: ' + inline.outerHeight() +
				'px; left: ' + (offset.left - relOffset.left) + 'px; top: ' +
				(offset.top - relOffset.top) + 'px; z-index: ' + zIndex + '"></div>').
				find('button,select').attr('disabled', 'disabled').end().
				find('a').removeAttr('href');
		}
		else {
			target.disabled = true;
			inst.trigger.filter('button.' + this._triggerClass).
				attr('disabled', 'disabled').end().
				filter('img.' + this._triggerClass).
				css({opacity: '0.5', cursor: 'default'});
		}
		this._disabled = $.map(this._disabled,
			function(value) { return (value == target ? null : value); }); // Delete entry
		this._disabled.push(target);
	},

	/* Is the first field in a jQuery collection disabled as a datepicker?
	   @param  target  (element) the control to examine
	   @return  (boolean) true if disabled, false if enabled */
	isDisabled: function(target) {
		return (target && $.inArray(target, this._disabled) > -1);
	},

	/* Show a popup datepicker.
	   @param  target  (event) a focus event or
	                   (element) the control to use */
	show: function(target) {
		target = target.target || target;
		var inst = $.data(target, $.calendars.picker.dataName);
		if ($.calendars.picker.curInst == inst) {
			return;
		}
		if ($.calendars.picker.curInst) {
			$.calendars.picker.hide($.calendars.picker.curInst, true);
		}
		if (inst) {
			// Retrieve existing date(s)
			inst.lastVal = null;
			inst.selectedDates = $.calendars.picker._extractDates(inst, $(target).val());
			inst.pickingRange = false;
			inst.drawDate = $.calendars.picker._checkMinMax((inst.selectedDates[0] ||
				inst.get('defaultDate') || inst.get('calendar').today()).newDate(), inst);
			$.calendars.picker.curInst = inst;
			// Generate content
			$.calendars.picker._update(target, true);
			// Adjust position before showing
			var offset = $.calendars.picker._checkOffset(inst);
			inst.div.css({left: offset.left, top: offset.top});
			// And display
			var showAnim = inst.get('showAnim');
			var showSpeed = inst.get('showSpeed');
			showSpeed = (showSpeed == 'normal' && $.ui && $.ui.version >= '1.8' ?
				'_default' : showSpeed);
			var postProcess = function() {
				var cover = inst.div.find('.' + $.calendars.picker._coverClass); // IE6- only
				if (cover.length) {
					var borders = $.calendars.picker._getBorders(inst.div);
					cover.css({left: -borders[0], top: -borders[1],
						width: inst.div.outerWidth() + borders[0],
						height: inst.div.outerHeight() + borders[1]});
				}
			};
			if ($.effects && $.effects[showAnim]) {
				var data = inst.div.data(); // Update old effects data
				for (var key in data) {
					if (key.match(/^ec\.storage\./)) {
						data[key] = inst._mainDiv.css(key.replace(/ec\.storage\./, ''));
					}
				}
				inst.div.data(data).show(showAnim, inst.get('showOptions'), showSpeed, postProcess);
			}
			else {
				inst.div[showAnim || 'show']((showAnim ? showSpeed : ''), postProcess);
			}
			if (!showAnim) {
				postProcess();
			}
		}
	},

	/* Extract possible dates from a string.
	   @param  inst  (object) the current instance settings
	   @param  text  (string) the text to extract from
	   @return  (CDate[]) the extracted dates */
	_extractDates: function(inst, datesText) {
		if (datesText == inst.lastVal) {
			return;
		}
		inst.lastVal = datesText;
		var calendar = inst.get('calendar');
		var dateFormat = inst.get('dateFormat');
		var multiSelect = inst.get('multiSelect');
		var rangeSelect = inst.get('rangeSelect');
		datesText = datesText.split(multiSelect ? inst.get('multiSeparator') :
			(rangeSelect ? inst.get('rangeSeparator') : '\x00'));
		var dates = [];
		for (var i = 0; i < datesText.length; i++) {
			try {
				var date = calendar.parseDate(dateFormat, datesText[i]);
				if (date) {
					var found = false;
					for (var j = 0; j < dates.length; j++) {
						if (dates[j].compareTo(date) == 0) {
							found = true;
							break;
						}
					}
					if (!found) {
						dates.push(date);
					}
				}
			}
			catch (e) {
				// Ignore
			}
		}
		dates.splice(multiSelect || (rangeSelect ? 2 : 1), dates.length);
		if (rangeSelect && dates.length == 1) {
			dates[1] = dates[0];
		}
		return dates;
	},

	/* Update the datepicker display.
	   @param  target  (event) a focus event or
	                   (element) the control to use
	   @param  hidden  (boolean) true to initially hide the datepicker */
	_update: function(target, hidden) {
		target = $(target.target || target);
		var inst = $.data(target[0], $.calendars.picker.dataName);
		if (inst) {
			if (inst.inline || $.calendars.picker.curInst == inst) {
				var onChange = inst.get('onChangeMonthYear');
				if (onChange && (!inst.prevDate || inst.prevDate.year() != inst.drawDate.year() ||
						inst.prevDate.month() != inst.drawDate.month())) {
					onChange.apply(target[0], [inst.drawDate.year(), inst.drawDate.month()]);
				}
			}
			if (inst.inline) {
				target.html(this._generateContent(target[0], inst));
			}
			else if ($.calendars.picker.curInst == inst) {
				if (!inst.div) {
					inst.div = $('<div></div>').addClass(this._popupClass).
						css({display: (hidden ? 'none' : 'static'), position: 'absolute',
							left: target.offset().left,
							top: target.offset().top + target.outerHeight()}).
						appendTo($(inst.get('popupContainer') || 'body'));
					if ($.fn.mousewheel) {
						inst.div.mousewheel(this._doMouseWheel);
					}
				}
				inst.div.html(this._generateContent(target[0], inst));
				target.focus();
			}
		}
	},

	/* Update the input field and any alternate field with the current dates.
	   @param  target  (element) the control to use
	   @param  keyUp   (boolean, internal) true if coming from keyUp processing */
	_updateInput: function(target, keyUp) {
		var inst = $.data(target, this.dataName);
		if (inst) {
			var value = '';
			var altValue = '';
			var sep = (inst.get('multiSelect') ? inst.get('multiSeparator') :
				inst.get('rangeSeparator'));
			var calendar = inst.get('calendar');
			var dateFormat = inst.get('dateFormat') || calendar.local.dateFormat;
			var altFormat = inst.get('altFormat') || dateFormat;
			for (var i = 0; i < inst.selectedDates.length; i++) {
				value += (keyUp ? '' : (i > 0 ? sep : '') +
					calendar.formatDate(dateFormat, inst.selectedDates[i]));
				altValue += (i > 0 ? sep : '') +
					calendar.formatDate(altFormat, inst.selectedDates[i]);
			}
			if (!inst.inline && !keyUp) {
				$(target).val(value);
			}
			$(inst.get('altField')).val(altValue);
			var onSelect = inst.get('onSelect');
			if (onSelect && !keyUp && !inst.inSelect) {
				inst.inSelect = true; // Prevent endless loops
				onSelect.apply(target, [inst.selectedDates]);
				inst.inSelect = false;
			}
		}
	},

	/* Retrieve the size of left and top borders for an element.
	   @param  elem  (jQuery) the element of interest
	   @return  (number[2]) the left and top borders */
	_getBorders: function(elem) {
		var convert = function(value) {
			var extra = ($.browser.msie ? 1 : 0);
			return {thin: 1 + extra, medium: 3 + extra, thick: 5 + extra}[value] || value;
		};
		return [parseFloat(convert(elem.css('border-left-width'))),
			parseFloat(convert(elem.css('border-top-width')))];
	},

	/* Check positioning to remain on the screen.
	   @param  inst  (object) the current instance settings
	   @return  (object) the updated offset for the datepicker */
	_checkOffset: function(inst) {
		var base = (inst.target.is(':hidden') && inst.trigger ? inst.trigger : inst.target);
		var offset = base.offset();
		var isFixed = false;
		$(inst.target).parents().each(function() {
			isFixed |= $(this).css('position') == 'fixed';
			return !isFixed;
		});
		if (isFixed && $.browser.opera) { // Correction for Opera when fixed and scrolled
			offset.left -= document.documentElement.scrollLeft;
			offset.top -= document.documentElement.scrollTop;
		}
		var browserWidth = (!$.browser.mozilla || document.doctype ?
			document.documentElement.clientWidth : 0) || document.body.clientWidth;
		var browserHeight = (!$.browser.mozilla || document.doctype ?
			document.documentElement.clientHeight : 0) || document.body.clientHeight;
		if (browserWidth == 0) {
			return offset;
		}
		var alignment = inst.get('alignment');
		var isRTL = inst.get('isRTL');
		var scrollX = document.documentElement.scrollLeft || document.body.scrollLeft;
		var scrollY = document.documentElement.scrollTop || document.body.scrollTop;
		var above = offset.top - inst.div.outerHeight() -
			(isFixed && $.browser.opera ? document.documentElement.scrollTop : 0);
		var below = offset.top + base.outerHeight();
		var alignL = offset.left;
		var alignR = offset.left + base.outerWidth() - inst.div.outerWidth() -
			(isFixed && $.browser.opera ? document.documentElement.scrollLeft : 0);
		var tooWide = (offset.left + inst.div.outerWidth() - scrollX) > browserWidth;
		var tooHigh = (offset.top + inst.target.outerHeight() + inst.div.outerHeight() -
			scrollY) > browserHeight;
		if (alignment == 'topLeft') {
			offset = {left: alignL, top: above};
		}
		else if (alignment == 'topRight') {
			offset = {left: alignR, top: above};
		}
		else if (alignment == 'bottomLeft') {
			offset = {left: alignL, top: below};
		}
		else if (alignment == 'bottomRight') {
			offset = {left: alignR, top: below};
		}
		else if (alignment == 'top') {
			offset = {left: (isRTL || tooWide ? alignR : alignL), top: above};
		}
		else { // bottom
			offset = {left: (isRTL || tooWide ? alignR : alignL),
				top: (tooHigh ? above : below)};
		}
		offset.left = Math.max((isFixed ? 0 : scrollX), offset.left - (isFixed ? scrollX : 0));
		offset.top = Math.max((isFixed ? 0 : scrollY), offset.top - (isFixed ? scrollY : 0));
		return offset;
	},

	/* Close date picker if clicked elsewhere.
	   @param  event  (MouseEvent) the mouse click to check */
	_checkExternalClick: function(event) {
		if (!$.calendars.picker.curInst) {
			return;
		}
		var target = $(event.target);
		if (!target.parents().andSelf().hasClass($.calendars.picker._popupClass) &&
				!target.hasClass($.calendars.picker.markerClass) &&
				!target.parents().andSelf().hasClass($.calendars.picker._triggerClass)) {
			$.calendars.picker.hide($.calendars.picker.curInst);
		}
	},

	/* Hide a popup datepicker.
	   @param  target     (element) the control to use or
	                      (object) the current instance settings
	   @param  immediate  (boolean) true to close immediately without animation */
	hide: function(target, immediate) {
		var inst = $.data(target, this.dataName) || target;
		if (inst && inst == $.calendars.picker.curInst) {
			var showAnim = (immediate ? '' : inst.get('showAnim'));
			var showSpeed = inst.get('showSpeed');
			showSpeed = (showSpeed == 'normal' && $.ui && $.ui.version >= '1.8' ?
				'_default' : showSpeed);
			var postProcess = function() {
				inst.div.remove();
				inst.div = null;
				$.calendars.picker.curInst = null;
				var onClose = inst.get('onClose');
				if (onClose) {
					onClose.apply(target, [inst.selectedDates]);
				}
			};
			inst.div.stop();
			if ($.effects && $.effects[showAnim]) {
				inst.div.hide(showAnim, inst.get('showOptions'), showSpeed, postProcess);
			}
			else {
				var hideAnim = (showAnim == 'slideDown' ? 'slideUp' :
					(showAnim == 'fadeIn' ? 'fadeOut' : 'hide'));
				inst.div[hideAnim]((showAnim ? showSpeed : ''), postProcess);
			}
			if (!showAnim) {
				postProcess();
			}
		}
	},

	/* Handle keystrokes in the datepicker.
	   @param  event  (KeyEvent) the keystroke
	   @return  (boolean) true if not handled, false if handled */
	_keyDown: function(event) {
		var target = event.target;
		var inst = $.data(target, $.calendars.picker.dataName);
		var handled = false;
		if (inst.div) {
			if (event.keyCode == 9) { // Tab - close
				$.calendars.picker.hide(target);
			}
			else if (event.keyCode == 13) { // Enter - select
				$.calendars.picker.selectDate(target,
					$('a.' + inst.get('renderer').highlightedClass, inst.div)[0]);
				handled = true;
			}
			else { // Command keystrokes
				var commands = inst.get('commands');
				for (var name in commands) {
					var command = commands[name];
					if (command.keystroke.keyCode == event.keyCode &&
							!!command.keystroke.ctrlKey == !!(event.ctrlKey || event.metaKey) &&
							!!command.keystroke.altKey == event.altKey &&
							!!command.keystroke.shiftKey == event.shiftKey) {
						$.calendars.picker.performAction(target, name);
						handled = true;
						break;
					}
				}
			}
		}
		else { // Show on 'current' keystroke
			var command = inst.get('commands').current;
			if (command.keystroke.keyCode == event.keyCode &&
					!!command.keystroke.ctrlKey == !!(event.ctrlKey || event.metaKey) &&
					!!command.keystroke.altKey == event.altKey &&
					!!command.keystroke.shiftKey == event.shiftKey) {
				$.calendars.picker.show(target);
				handled = true;
			}
		}
		inst.ctrlKey = ((event.keyCode < 48 && event.keyCode != 32) ||
			event.ctrlKey || event.metaKey);
		if (handled) {
			event.preventDefault();
			event.stopPropagation();
		}
		return !handled;
	},

	/* Filter keystrokes in the datepicker.
	   @param  event  (KeyEvent) the keystroke
	   @return  (boolean) true if allowed, false if not allowed */
	_keyPress: function(event) {
		var target = event.target;
		var inst = $.data(target, $.calendars.picker.dataName);
		if (inst && inst.get('constrainInput')) {
			var ch = String.fromCharCode(event.keyCode || event.charCode);
			var allowedChars = $.calendars.picker._allowedChars(inst);
			return (event.metaKey || inst.ctrlKey || ch < ' ' ||
				!allowedChars || allowedChars.indexOf(ch) > -1);
		}
		return true;
	},

	/* Determine the set of characters allowed by the date format.
	   @param  inst  (object) the current instance settings
	   @return  (string) the set of allowed characters, or null if anything allowed */
	_allowedChars: function(inst) {
		var dateFormat = inst.get('dateFormat');
		var allowedChars = (inst.get('multiSelect') ? inst.get('multiSeparator') :
			(inst.get('rangeSelect') ? inst.get('rangeSeparator') : ''));
		var literal = false;
		var hasNum = false;
		for (var i = 0; i < dateFormat.length; i++) {
			var ch = dateFormat.charAt(i);
			if (literal) {
				if (ch == "'" && dateFormat.charAt(i + 1) != "'") {
					literal = false;
				}
				else {
					allowedChars += ch;
				}
			}
			else {
				switch (ch) {
					case 'd': case 'm': case 'o': case 'w':
						allowedChars += (hasNum ? '' : '0123456789'); hasNum = true; break;
					case 'y': case '@': case '!':
						allowedChars += (hasNum ? '' : '0123456789') + '-'; hasNum = true; break;
					case 'J':
						allowedChars += (hasNum ? '' : '0123456789') + '-.'; hasNum = true; break;
					case 'D': case 'M': case 'Y':
						return null; // Accept anything
					case "'":
						if (dateFormat.charAt(i + 1) == "'") {
							allowedChars += "'";
						}
						else {
							literal = true;
						}
						break;
					default:
						allowedChars += ch;
				}
			}
		}
		return allowedChars;
	},

	/* Synchronise datepicker with the field.
	   @param  event  (KeyEvent) the keystroke
	   @return  (boolean) true if allowed, false if not allowed */
	_keyUp: function(event) {
		var target = event.target;
		var inst = $.data(target, $.calendars.picker.dataName);
		if (inst && !inst.ctrlKey && inst.lastVal != inst.target.val()) {
			try {
				var dates = $.calendars.picker._extractDates(inst, inst.target.val());
				if (dates.length > 0) {
					$.calendars.picker.setDate(target, dates, null, true);
				}
			}
			catch (event) {
				// Ignore
			}
		}
		return true;
	},

	/* Increment/decrement month/year on mouse wheel activity.
	   @param  event  (event) the mouse wheel event
	   @param  delta  (number) the amount of change */
	_doMouseWheel: function(event, delta) {
		var target = ($.calendars.picker.curInst && $.calendars.picker.curInst.target[0]) ||
			$(event.target).closest('.' + $.calendars.picker.markerClass)[0];
		if ($.calendars.picker.isDisabled(target)) {
			return;
		}
		var inst = $.data(target, $.calendars.picker.dataName);
		if (inst.get('useMouseWheel')) {
			delta = ($.browser.opera ? -delta : delta);
			delta = (delta < 0 ? -1 : +1);
			$.calendars.picker.changeMonth(target,
				-inst.get(event.ctrlKey ? 'monthsToJump' : 'monthsToStep') * delta);
		}
		event.preventDefault();
	},

	/* Clear an input and close a popup datepicker.
	   @param  target  (element) the control to use */
	clear: function(target) {
		var inst = $.data(target, this.dataName);
		if (inst) {
			inst.selectedDates = [];
			this.hide(target);
			if (inst.get('selectDefaultDate') && inst.get('defaultDate')) {
				var calendar = inst.get('calendar');
				this.setDate(target, (inst.get('defaultDate') || calendar.today()).newDate());
			}
			else {
				this._updateInput(target);
			}
		}
	},

	/* Retrieve the selected date(s) for a calendar picker.
	   @param  target  (element) the control to examine
	   @return  (CDate[]) the selected date(s) */
	getDate: function(target) {
		var inst = $.data(target, this.dataName);
		return (inst ? inst.selectedDates : []);
	},

	/* Set the selected date(s) for a calendar picker.
	   @param  target   (element) the control to examine
	   @param  dates    (CDate or number or string or [] of these) the selected date(s)
	   @param  endDate  (CDate or number or string) the ending date for a range (optional)
	   @param  keyUp    (boolean, internal) true if coming from keyUp processing
	   @param  setOpt   (boolean, internal) true if coming from option processing */
	setDate: function(target, dates, endDate, keyUp, setOpt) {
		var inst = $.data(target, this.dataName);
		if (inst) {
			if (!$.isArray(dates)) {
				dates = [dates];
				if (endDate) {
					dates.push(endDate);
				}
			}
			var calendar = inst.get('calendar');
			var dateFormat = inst.get('dateFormat');
			var minDate = inst.get('minDate');
			var maxDate = inst.get('maxDate');
			var curDate = inst.selectedDates[0];
			inst.selectedDates = [];
			for (var i = 0; i < dates.length; i++) {
				var date = calendar.determineDate(
					dates[i], null, curDate, dateFormat, inst.getConfig());
				if (date) {
					if ((!minDate || date.compareTo(minDate) != -1) &&
							(!maxDate || date.compareTo(maxDate) != +1)) {
						var found = false;
						for (var j = 0; j < inst.selectedDates.length; j++) {
							if (inst.selectedDates[j].compareTo(date) == 0) {
								found = true;
								break;
							}
						}
						if (!found) {
							inst.selectedDates.push(date);
						}
					}
				}
			}
			var rangeSelect = inst.get('rangeSelect');
			inst.selectedDates.splice(inst.get('multiSelect') ||
				(rangeSelect ? 2 : 1), inst.selectedDates.length);
			if (rangeSelect) {
				switch (inst.selectedDates.length) {
					case 1: inst.selectedDates[1] = inst.selectedDates[0]; break;
					case 2: inst.selectedDates[1] =
						(inst.selectedDates[0].compareTo(inst.selectedDates[1]) == +1 ?
						inst.selectedDates[0] : inst.selectedDates[1]); break;
				}
				inst.pickingRange = false;
			}
			inst.prevDate = (inst.drawDate ? inst.drawDate.newDate() : null);
			inst.drawDate = this._checkMinMax((inst.selectedDates[0] ||
				inst.get('defaultDate') || calendar.today()).newDate(), inst);
			if (!setOpt) {
				this._update(target);
				this._updateInput(target, keyUp);
			}
		}
	},

	/* Determine whether a date is selectable for this datepicker.
	   @param  target  (element) the control to check
	   @param  date    (Date or string or number) the date to check
	   @return  (boolean) true if selectable, false if not */
	isSelectable: function(target, date) {
		var inst = $.data(target, this.dataName);
		if (!inst) {
			return false;
		}
		date = inst.get('calendar').determineDate(date,
			inst.selectedDates[0] || inst.get('calendar').today(), null,
			inst.get('dateFormat'), inst.getConfig());
		return this._isSelectable(target, date, inst.get('onDate'),
			inst.get('minDate'), inst.get('maxDate'));
	},

	/* Internally determine whether a date is selectable for this datepicker.
	   @param  target   (element) the control to check
	   @param  date     (Date) the date to check
	   @param  onDate   (function or boolean) any onDate callback or callback.selectable
	   @param  mindate  (Date) the minimum allowed date
	   @param  maxdate  (Date) the maximum allowed date
	   @return  (boolean) true if selectable, false if not */
	_isSelectable: function(target, date, onDate, minDate, maxDate) {
		var dateInfo = (typeof onDate == 'boolean' ? {selectable: onDate} :
			(!onDate ? {} : onDate.apply(target, [date, true])));
		return (dateInfo.selectable != false) &&
			(!minDate || date.toJD() >= minDate.toJD()) &&
			(!maxDate || date.toJD() <= maxDate.toJD());
	},

	/* Perform a named action for a calendar picker.
	   @param  target  (element) the control to affect
	   @param  action  (string) the name of the action */
	performAction: function(target, action) {
		var inst = $.data(target, this.dataName);
		if (inst && !this.isDisabled(target)) {
			var commands = inst.get('commands');
			if (commands[action] && commands[action].enabled.apply(target, [inst])) {
				commands[action].action.apply(target, [inst]);
			}
		}
	},

	/* Set the currently shown month, defaulting to today's.
	   @param  target  (element) the control to affect
	   @param  year    (number) the year to show (optional)
	   @param  month   (number) the month to show (optional)
	   @param  day     (number) the day to show (optional) */
	showMonth: function(target, year, month, day) {
		var inst = $.data(target, this.dataName);
		if (inst && (day != null ||
				(inst.drawDate.year() != year || inst.drawDate.month() != month))) {
			inst.prevDate = inst.drawDate.newDate();
			var calendar = inst.get('calendar');
			var show = this._checkMinMax((year != null ?
				calendar.newDate(year, month, 1) : calendar.today()), inst);
			inst.drawDate.date(show.year(), show.month(), 
				(day != null ? day : Math.min(inst.drawDate.day(),
				calendar.daysInMonth(show.year(), show.month()))));
			this._update(target);
		}
	},

	/* Adjust the currently shown month.
	   @param  target  (element) the control to affect
	   @param  offset  (number) the number of months to change by */
	changeMonth: function(target, offset) {
		var inst = $.data(target, this.dataName);
		if (inst) {
			var date = inst.drawDate.newDate().add(offset, 'm');
			this.showMonth(target, date.year(), date.month());
		}
	},

	/* Adjust the currently shown day.
	   @param  target  (element) the control to affect
	   @param  offset  (number) the number of days to change by */
	changeDay: function(target, offset) {
		var inst = $.data(target, this.dataName);
		if (inst) {
			var date = inst.drawDate.newDate().add(offset, 'd');
			this.showMonth(target, date.year(), date.month(), date.day());
		}
	},

	/* Restrict a date to the minimum/maximum specified.
	   @param  date  (CDate) the date to check
	   @param  inst  (object) the current instance settings */
	_checkMinMax: function(date, inst) {
		var minDate = inst.get('minDate');
		var maxDate = inst.get('maxDate');
		date = (minDate && date.compareTo(minDate) == -1 ? minDate.newDate() : date);
		date = (maxDate && date.compareTo(maxDate) == +1 ? maxDate.newDate() : date);
		return date;
	},

	/* Retrieve the date associated with an entry in the datepicker.
	   @param  target  (element) the control to examine
	   @param  elem    (element) the selected datepicker element
	   @return  (CDate) the corresponding date, or null */
	retrieveDate: function(target, elem) {
		var inst = $.data(target, this.dataName);
		return (!inst ? null : inst.get('calendar').fromJD(
			parseFloat(elem.className.replace(/^.*jd(\d+\.5).*$/, '$1'))));
	},

	/* Select a date for this datepicker.
	   @param  target  (element) the control to examine
	   @param  elem    (element) the selected datepicker element */
	selectDate: function(target, elem) {
		var inst = $.data(target, this.dataName);
		if (inst && !this.isDisabled(target)) {
			var date = this.retrieveDate(target, elem);
			var multiSelect = inst.get('multiSelect');
			var rangeSelect = inst.get('rangeSelect');
			if (multiSelect) {
				var found = false;
				for (var i = 0; i < inst.selectedDates.length; i++) {
					if (date.compareTo(inst.selectedDates[i]) == 0) {
						inst.selectedDates.splice(i, 1);
						found = true;
						break;
					}
				}
				if (!found && inst.selectedDates.length < multiSelect) {
					inst.selectedDates.push(date);
				}
			}
			else if (rangeSelect) {
				if (inst.pickingRange) {
					inst.selectedDates[1] = date;
				}
				else {
					inst.selectedDates = [date, date];
				}
				inst.pickingRange = !inst.pickingRange;
			}
			else {
				inst.selectedDates = [date];
			}
			this._updateInput(target);
			if (inst.inline || inst.pickingRange || inst.selectedDates.length <
					(multiSelect || (rangeSelect ? 2 : 1))) {
				this._update(target);
			}
			else {
				this.hide(target);
			}
		}
	},

	/* Generate the datepicker content for this control.
	   @param  target  (element) the control to affect
	   @param  inst    (object) the current instance settings
	   @return  (jQuery) the datepicker content */
	_generateContent: function(target, inst) {
		var calendar = inst.get('calendar');
		var renderer = inst.get('renderer');
		var monthsToShow = inst.get('monthsToShow');
		monthsToShow = ($.isArray(monthsToShow) ? monthsToShow : [1, monthsToShow]);
		inst.drawDate = this._checkMinMax(
			inst.drawDate || inst.get('defaultDate') || calendar.today(), inst);
		var drawDate = inst.drawDate.newDate().add(-inst.get('monthsOffset'), 'm');
		// Generate months
		var monthRows = '';
		for (var row = 0; row < monthsToShow[0]; row++) {
			var months = '';
			for (var col = 0; col < monthsToShow[1]; col++) {
				months += this._generateMonth(target, inst, drawDate.year(),
					drawDate.month(), calendar, renderer, (row == 0 && col == 0));
				drawDate.add(1, 'm');
			}
			monthRows += this._prepare(renderer.monthRow, inst).replace(/\{months\}/, months);
		}
		var picker = this._prepare(renderer.picker, inst).replace(/\{months\}/, monthRows).
			replace(/\{weekHeader\}/g, this._generateDayHeaders(inst, calendar, renderer)) +
			($.browser.msie && parseInt($.browser.version, 10) < 7 && !inst.inline ?
			'<iframe src="javascript:void(0);" class="' + this._coverClass + '"></iframe>' : '');
		// Add commands
		var commands = inst.get('commands');
		var asDateFormat = inst.get('commandsAsDateFormat');
		var addCommand = function(type, open, close, name, classes) {
			if (picker.indexOf('{' + type + ':' + name + '}') == -1) {
				return;
			}
			var command = commands[name];
			var date = (asDateFormat ? command.date.apply(target, [inst]) : null);
			picker = picker.replace(new RegExp('\\{' + type + ':' + name + '\\}', 'g'),
				'<' + open +
				(command.status ? ' title="' + inst.get(command.status) + '"' : '') +
				' class="' + renderer.commandClass + ' ' +
				renderer.commandClass + '-' + name + ' ' + classes +
				(command.enabled(inst) ? '' : ' ' + renderer.disabledClass) + '">' +
				(date ? date.formatDate(inst.get(command.text)) : inst.get(command.text)) +
				'</' + close + '>');
		};
		for (var name in commands) {
			addCommand('button', 'button type="button"', 'button', name,
				renderer.commandButtonClass);
			addCommand('link', 'a href="javascript:void(0)"', 'a', name,
				renderer.commandLinkClass);
		}
		picker = $(picker);
		if (monthsToShow[1] > 1) {
			var count = 0;
			$(renderer.monthSelector, picker).each(function() {
				var nth = ++count % monthsToShow[1];
				$(this).addClass(nth == 1 ? 'first' : (nth == 0 ? 'last' : ''));
			});
		}
		// Add calendar behaviour
		var self = this;
		picker.find(renderer.daySelector + ' a').hover(
				function() { $(this).addClass(renderer.highlightedClass); },
				function() {
					(inst.inline ? $(this).parents('.' + self.markerClass) : inst.div).
						find(renderer.daySelector + ' a').
						removeClass(renderer.highlightedClass);
				}).
			click(function() {
				self.selectDate(target, this);
			}).end().
			find('select.' + this._monthYearClass + ':not(.' + this._anyYearClass + ')').change(function() {
				var monthYear = $(this).val().split('/');
				self.showMonth(target, parseInt(monthYear[1], 10), parseInt(monthYear[0], 10));
			}).end().
			find('select.' + this._anyYearClass).click(function() {
				$(this).next('input').css({left: this.offsetLeft, top: this.offsetTop,
					width: this.offsetWidth, height: this.offsetHeight}).show().focus();
			}).end().
			find('input.' + self._monthYearClass).change(function() {
				try {
					var year = parseInt($(this).val(), 10);
					year = (isNaN(year) ? inst.drawDate.year() : year);
					self.showMonth(target, year, inst.drawDate.month(), inst.drawDate.day());
				}
				catch (e) {
					alert(e);
				}
			}).keydown(function(event) {
				if (event.keyCode == 27) { // Escape
					$(event.target).hide();
					inst.target.focus();
				}
			});
		// Add command behaviour
		picker.find('.' + renderer.commandClass).click(function() {
				if (!$(this).hasClass(renderer.disabledClass)) {
					var action = this.className.replace(
						new RegExp('^.*' + renderer.commandClass + '-([^ ]+).*$'), '$1');
					$.calendars.picker.performAction(target, action);
				}
			});
		// Add classes
		if (inst.get('isRTL')) {
			picker.addClass(renderer.rtlClass);
		}
		if (monthsToShow[0] * monthsToShow[1] > 1) {
			picker.addClass(renderer.multiClass);
		}
		var pickerClass = inst.get('pickerClass');
		if (pickerClass) {
			picker.addClass(pickerClass);
		}
		// Resize
		$('body').append(picker);
		var width = 0;
		picker.find(renderer.monthSelector).each(function() {
			width += $(this).outerWidth();
		});
		picker.width(width / monthsToShow[0]);
		// Pre-show customisation
		var onShow = inst.get('onShow');
		if (onShow) {
			onShow.apply(target, [picker, calendar, inst]);
		}
		return picker;
	},

	/* Generate the content for a single month.
	   @param  target    (element) the control to affect
	   @param  inst      (object) the current instance settings
	   @param  year      (number) the year to generate
	   @param  month     (number) the month to generate
	   @param  calendar  (*Calendar) the current calendar
	   @param  renderer  (object) the rendering templates
	   @param  first     (boolean) true if first of multiple months
	   @return  (string) the month content */
	_generateMonth: function(target, inst, year, month, calendar, renderer, first) {
		var daysInMonth = calendar.daysInMonth(year, month);
		var monthsToShow = inst.get('monthsToShow');
		monthsToShow = ($.isArray(monthsToShow) ? monthsToShow : [1, monthsToShow]);
		var fixedWeeks = inst.get('fixedWeeks') || (monthsToShow[0] * monthsToShow[1] > 1);
		var firstDay = inst.get('firstDay');
		firstDay = (firstDay == null ? calendar.local.firstDay : firstDay);
		var leadDays = (calendar.dayOfWeek(year, month, calendar.minDay) -
			firstDay + calendar.daysInWeek()) % calendar.daysInWeek();
		var numWeeks = (fixedWeeks ? 6 : Math.ceil((leadDays + daysInMonth) / calendar.daysInWeek()));
		var showOtherMonths = inst.get('showOtherMonths');
		var selectOtherMonths = inst.get('selectOtherMonths') && showOtherMonths;
		var dayStatus = inst.get('dayStatus');
		var minDate = (inst.pickingRange ? inst.selectedDates[0] : inst.get('minDate'));
		var maxDate = inst.get('maxDate');
		var rangeSelect = inst.get('rangeSelect');
		var onDate = inst.get('onDate');
		var showWeeks = renderer.week.indexOf('{weekOfYear}') > -1;
		var calculateWeek = inst.get('calculateWeek');
		var today = calendar.today();
		var drawDate = calendar.newDate(year, month, calendar.minDay);
		drawDate.add(-leadDays - (fixedWeeks &&
			(drawDate.dayOfWeek() == firstDay || drawDate.daysInMonth() < calendar.daysInWeek())?
			calendar.daysInWeek() : 0), 'd');
		var jd = drawDate.toJD();
		// Generate weeks
		var weeks = '';
		for (var week = 0; week < numWeeks; week++) {
			var weekOfYear = (!showWeeks ? '' : '<span class="jd' + jd + '">' +
				(calculateWeek ? calculateWeek(drawDate) : drawDate.weekOfYear()) + '</span>');
			var days = '';
			for (var day = 0; day < calendar.daysInWeek(); day++) {
				var selected = false;
				if (rangeSelect && inst.selectedDates.length > 0) {
					selected = (drawDate.compareTo(inst.selectedDates[0]) != -1 &&
						drawDate.compareTo(inst.selectedDates[1]) != +1)
				}
				else {
					for (var i = 0; i < inst.selectedDates.length; i++) {
						if (inst.selectedDates[i].compareTo(drawDate) == 0) {
							selected = true;
							break;
						}
					}
				}
				var dateInfo = (!onDate ? {} :
					onDate.apply(target, [drawDate, drawDate.month() == month]));
				var selectable = (selectOtherMonths || drawDate.month() == month) &&
					this._isSelectable(target, drawDate, dateInfo.selectable, minDate, maxDate);
				days += this._prepare(renderer.day, inst).replace(/\{day\}/g,
					(selectable ? '<a href="javascript:void(0)"' : '<span') +
					' class="jd' + jd + ' ' + (dateInfo.dateClass || '') +
					(selected && (selectOtherMonths || drawDate.month() == month) ?
					' ' + renderer.selectedClass : '') +
					(selectable ? ' ' + renderer.defaultClass : '') +
					(drawDate.weekDay() ? '' : ' ' + renderer.weekendClass) +
					(drawDate.month() == month ? '' : ' ' + renderer.otherMonthClass) +
					(drawDate.compareTo(today) == 0 && drawDate.month() == month ?
					' ' + renderer.todayClass : '') +
					(drawDate.compareTo(inst.drawDate) == 0 && drawDate.month() == month ?
					' ' + renderer.highlightedClass : '') + '"' +
					(dateInfo.title || (dayStatus && selectable) ? ' title="' +
					(dateInfo.title || drawDate.formatDate(dayStatus)) + '"' : '') + '>' +
					(showOtherMonths || drawDate.month() == month ?
					dateInfo.content || drawDate.day() : '&nbsp;') +
					(selectable ? '</a>' : '</span>'));
				drawDate.add(1, 'd');
				jd++;
			}
			weeks += this._prepare(renderer.week, inst).replace(/\{days\}/g, days).
				replace(/\{weekOfYear\}/g, weekOfYear);
		}
		var monthHeader = this._prepare(renderer.month, inst).match(/\{monthHeader(:[^\}]+)?\}/);
		monthHeader = (monthHeader[0].length <= 13 ? 'MM yyyy' :
			monthHeader[0].substring(13, monthHeader[0].length - 1));
		monthHeader = (first ? this._generateMonthSelection(
			inst, year, month, minDate, maxDate, monthHeader, calendar, renderer) :
			calendar.formatDate(monthHeader, calendar.newDate(year, month, calendar.minDay)));
		var weekHeader = this._prepare(renderer.weekHeader, inst).
			replace(/\{days\}/g, this._generateDayHeaders(inst, calendar, renderer));
		return this._prepare(renderer.month, inst).replace(/\{monthHeader(:[^\}]+)?\}/g, monthHeader).
			replace(/\{weekHeader\}/g, weekHeader).replace(/\{weeks\}/g, weeks);
	},

	/* Generate the HTML for the day headers.
	   @param  inst      (object) the current instance settings
	   @param  calendar  (*Calendar) the current calendar
	   @param  renderer  (object) the rendering templates
	   @return  (string) a week's worth of day headers */
	_generateDayHeaders: function(inst, calendar, renderer) {
		var firstDay = inst.get('firstDay');
		firstDay = (firstDay == null ? calendar.local.firstDay : firstDay);
		var header = '';
		for (var day = 0; day < calendar.daysInWeek(); day++) {
			var dow = (day + firstDay) % calendar.daysInWeek();
			header += this._prepare(renderer.dayHeader, inst).replace(/\{day\}/g,
				'<span class="' + this._curDoWClass + dow + '" title="' +
				calendar.local.dayNames[dow] + '">' +
				calendar.local.dayNamesMin[dow] + '</span>');
		}
		return header;
	},

	/* Generate selection controls for month.
	   @param  inst         (object) the current instance settings
	   @param  year         (number) the year to generate
	   @param  month        (number) the month to generate
	   @param  minDate      (CDate) the minimum date allowed
	   @param  maxDate      (CDate) the maximum date allowed
	   @param  monthHeader  (string) the month/year format
	   @param  calendar     (*Calendar) the current calendar
	   @return  (string) the month selection content */
	_generateMonthSelection: function(inst, year, month, minDate, maxDate, monthHeader, calendar) {
		if (!inst.get('changeMonth')) {
			return calendar.formatDate(monthHeader, calendar.newDate(year, month, 1));
		}
		// Months
		var monthNames = calendar.local[
			'monthNames' + (monthHeader.match(/mm/i) ? '' : 'Short')];
		var html = monthHeader.replace(/m+/i, '\\x2E').replace(/y+/i, '\\x2F');
		var selector = '<select class="' + this._monthYearClass +
			'" title="' + inst.get('monthStatus') + '">';
		var maxMonth = calendar.monthsInYear(year) + calendar.minMonth;
		for (var m = calendar.minMonth; m < maxMonth; m++) {
			if ((!minDate || calendar.newDate(year, m,
					calendar.daysInMonth(year, m) - 1 + calendar.minDay).
					compareTo(minDate) != -1) &&
					(!maxDate || calendar.newDate(year, m, calendar.minDay).
					compareTo(maxDate) != +1)) {
				selector += '<option value="' + m + '/' + year + '"' +
					(month == m ? ' selected="selected"' : '') + '>' +
					monthNames[m - calendar.minMonth] + '</option>';
			}
		}
		selector += '</select>';
		html = html.replace(/\\x2E/, selector);
		// Years
		var yearRange = inst.get('yearRange');
		if (yearRange == 'any') {
			selector = '<select class="' + this._monthYearClass + ' ' + this._anyYearClass +
				'" title="' + inst.get('yearStatus') + '">' +
				'<option>' + year + '</option></select>' +
				'<input class="' + this._monthYearClass + ' ' + this._curMonthClass +
				month + '" value="' + year + '">';
		}
		else {
			yearRange = yearRange.split(':');
			var todayYear = calendar.today().year();
			var start = (yearRange[0].match('c[+-].*') ? year + parseInt(yearRange[0].substring(1), 10) :
				((yearRange[0].match('[+-].*') ? todayYear : 0) + parseInt(yearRange[0], 10)));
			var end = (yearRange[1].match('c[+-].*') ? year + parseInt(yearRange[1].substring(1), 10) :
				((yearRange[1].match('[+-].*') ? todayYear : 0) + parseInt(yearRange[1], 10)));
			selector = '<select class="' + this._monthYearClass +
				'" title="' + inst.get('yearStatus') + '">';
			start = calendar.newDate(start + 1, calendar.firstMonth, calendar.minDay).add(-1, 'd');
			end = calendar.newDate(end, calendar.firstMonth, calendar.minDay);
			var addYear = function(y) {
				if (y != 0 || calendar.hasYearZero) {
					selector += '<option value="' +
						Math.min(month, calendar.monthsInYear(y) - 1 + calendar.minMonth) +
						'/' + y + '"' + (year == y ? ' selected="selected"' : '') + '>' +
						y + '</option>';
				}
			};
			if (start.toJD() < end.toJD()) {
				start = (minDate && minDate.compareTo(start) == +1 ? minDate : start).year();
				end = (maxDate && maxDate.compareTo(end) == -1 ? maxDate : end).year();
				for (var y = start; y <= end; y++) {
					addYear(y);
				}
			}
			else {
				start = (maxDate && maxDate.compareTo(start) == -1 ? maxDate : start).year();
				end = (minDate && minDate.compareTo(end) == +1 ? minDate : end).year();
				for (var y = start; y >= end; y--) {
					addYear(y);
				}
			}
			selector += '</select>';
		}
		html = html.replace(/\\x2F/, selector);
		return html;
	},

	/* Prepare a render template for use.
	   Exclude popup/inline sections that are not applicable.
	   Localise text of the form: {l10n:name}.
	   @param  text  (string) the text to localise
	   @param  inst  (object) the current instance settings
	   @return  (string) the localised text */
	_prepare: function(text, inst) {
		var replaceSection = function(type, retain) {
			while (true) {
				var start = text.indexOf('{' + type + ':start}');
				if (start == -1) {
					return;
				}
				var end = text.substring(start).indexOf('{' + type + ':end}');
				if (end > -1) {
					text = text.substring(0, start) +
						(retain ? text.substr(start + type.length + 8, end - type.length - 8) : '') +
						text.substring(start + end + type.length + 6);
				}
			}
		};
		replaceSection('inline', inst.inline);
		replaceSection('popup', !inst.inline);
		var pattern = /\{l10n:([^\}]+)\}/;
		var matches = null;
		while (matches = pattern.exec(text)) {
			text = text.replace(matches[0], inst.get(matches[1]));
		}
		return text;
	}
});

/* jQuery extend now ignores nulls!
   @param  target  (object) the object to extend
   @param  props   (object) the new settings
   @return  (object) the updated object */
function extendRemove(target, props) {
	$.extend(target, props);
	for (var name in props)
		if (props[name] == null || props[name] == undefined)
			target[name] = props[name];
	return target;
};

/* Attach the calendar picker functionality to a jQuery selection.
   @param  command  (string) the command to run (optional, default 'attach')
   @param  options  (object) the new settings to use for these instances (optional)
   @return  (jQuery) for chaining further calls */
$.fn.calendarsPicker = function(options) {
	var otherArgs = Array.prototype.slice.call(arguments, 1);
	if ($.inArray(options, ['getDate', 'isDisabled', 'isSelectable', 'options', 'retrieveDate']) > -1) {
		return $.calendars.picker[options].apply($.calendars.picker, [this[0]].concat(otherArgs));
	}
	return this.each(function() {
		if (typeof options == 'string') {
			$.calendars.picker[options].apply($.calendars.picker, [this].concat(otherArgs));
		}
		else {
			$.calendars.picker._attachPicker(this, options || {});
		}
	});
};

/* Initialise the calendar picker functionality. */
$.calendars.picker = new CalendarsPicker(); // singleton instance

$(function() {
	$(document).mousedown($.calendars.picker._checkExternalClick).
		resize(function() { $.calendars.picker.hide($.calendars.picker.curInst); });
});

})(jQuery);

/* http://keith-wood.name/calendars.html
   Coptic calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) February 2010.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Coptic calendar.
   See http://en.wikipedia.org/wiki/Coptic_calendar.
   See also Calendrical Calculations: The Millennium Edition
   (http://emr.cs.iit.edu/home/reingold/calendar-book/index.shtml).
   @param  language  (string) the language code (default English) for localisation (optional) */
function CopticCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

CopticCalendar.prototype = new $.calendars.baseCalendar;

$.extend(CopticCalendar.prototype, {
	name: 'Coptic', // The calendar name
	jdEpoch: 1825029.5, // Julian date of start of Coptic epoch: 29 August 284 CE (Gregorian)
	daysPerMonth: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 5], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Coptic', // The calendar name
			epochs: ['BAM', 'AM'],
			monthNames: ['Thout', 'Paopi', 'Hathor', 'Koiak', 'Tobi', 'Meshir',
			'Paremhat', 'Paremoude', 'Pashons', 'Paoni', 'Epip', 'Mesori', 'Pi Kogi Enavot'],
			monthNamesShort: ['Tho', 'Pao', 'Hath', 'Koi', 'Tob', 'Mesh',
			'Pat', 'Pad', 'Pash', 'Pao', 'Epi', 'Meso', 'PiK'],
			dayNames: ['Tkyriaka', 'Pesnau', 'Pshoment', 'Peftoou', 'Ptiou', 'Psoou', 'Psabbaton'],
			dayNamesShort: ['Tky', 'Pes', 'Psh', 'Pef', 'Pti', 'Pso', 'Psa'],
			dayNamesMin: ['Tk', 'Pes', 'Psh', 'Pef', 'Pt', 'Pso', 'Psa'],
			dateFormat: 'dd/mm/yyyy', // See format options on BaseCalendar.formatDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = date.year() + (date.year() < 0 ? 1 : 0); // No year zero
		return year % 4 == 3 || year % 4 == -1;
	},

	/* Retrieve the number of months in a year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (number) the number of months
	   @throws  error if an invalid year or a different calendar used */
	monthsInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return 13;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Sunday of this week starting on Sunday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(-checkDate.dayOfWeek(), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 13 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		if (year < 0) { year++; } // No year zero
		return date.day() + (date.month() - 1) * 30 +
			(year - 1) * 365 + Math.floor(year / 4) + this.jdEpoch - 1;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		var c = Math.floor(jd) + 0.5 - this.jdEpoch;
		var year = Math.floor((c - Math.floor((c + 366) / 1461)) / 365) + 1;
		if (year <= 0) { year--; } // No year zero
		c = Math.floor(jd) + 0.5 - this.newDate(year, 1, 1).toJD();
		var month = Math.floor(c / 30) + 1;
		var day = c - (month - 1) * 30 + 1;
		return this.newDate(year, month, day);
	}
});

// Coptic calendar implementation
$.calendars.calendars.coptic = CopticCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Ethiopian calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) February 2010.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Ethiopian calendar.
   See http://en.wikipedia.org/wiki/Ethiopian_calendar.
   See also Calendrical Calculations: The Millennium Edition
   (http://emr.cs.iit.edu/home/reingold/calendar-book/index.shtml).
   @param  language  (string) the language code (default English) for localisation (optional) */
function EthiopianCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

EthiopianCalendar.prototype = new $.calendars.baseCalendar;

$.extend(EthiopianCalendar.prototype, {
	name: 'Ethiopian', // The calendar name
	jdEpoch: 1724220.5, // Julian date of start of Ethiopian epoch: 27 August 8 CE (Gregorian)
	daysPerMonth: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 5], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Ethiopian', // The calendar name
			epochs: ['BEE', 'EE'],
			monthNames: ['Meskerem', 'Tikemet', 'Hidar', 'Tahesas', 'Tir', 'Yekatit',
			'Megabit', 'Miazia', 'Genbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
			monthNamesShort: ['Mes', 'Tik', 'Hid', 'Tah', 'Tir', 'Yek',
			'Meg', 'Mia', 'Gen', 'Sen', 'Ham', 'Neh', 'Pag'],
			dayNames: ['Ehud', 'Segno', 'Maksegno', 'Irob', 'Hamus', 'Arb', 'Kidame'],
			dayNamesShort: ['Ehu', 'Seg', 'Mak', 'Iro', 'Ham', 'Arb', 'Kid'],
			dayNamesMin: ['Eh', 'Se', 'Ma', 'Ir', 'Ha', 'Ar', 'Ki'],
			dateFormat: 'dd/mm/yyyy', // See format options on BaseCalendar.formatDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = date.year() + (date.year() < 0 ? 1 : 0); // No year zero
		return year % 4 == 3 || year % 4 == -1;
	},

	/* Retrieve the number of months in a year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (number) the number of months
	   @throws  error if an invalid year or a different calendar used */
	monthsInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay,
			$.calendars.local.invalidYear || $.calendars.regional[''].invalidYear);
		return 13;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Sunday of this week starting on Sunday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(-checkDate.dayOfWeek(), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 13 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		if (year < 0) { year++; } // No year zero
		return date.day() + (date.month() - 1) * 30 +
			(year - 1) * 365 + Math.floor(year / 4) + this.jdEpoch - 1;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		var c = Math.floor(jd) + 0.5 - this.jdEpoch;
		var year = Math.floor((c - Math.floor((c + 366) / 1461)) / 365) + 1;
		if (year <= 0) { year--; } // No year zero
		c = Math.floor(jd) + 0.5 - this.newDate(year, 1, 1).toJD();
		var month = Math.floor(c / 30) + 1;
		var day = c - (month - 1) * 30 + 1;
		return this.newDate(year, month, day);
	}
});

// Ethiopian calendar implementation
$.calendars.calendars.ethiopian = EthiopianCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Hebrew calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Hebrew civil calendar.
   Based on code from http://www.fourmilab.ch/documents/calendar/.
   See also http://en.wikipedia.org/wiki/Hebrew_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function HebrewCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

HebrewCalendar.prototype = new $.calendars.baseCalendar;

$.extend(HebrewCalendar.prototype, {
	name: 'Hebrew', // The calendar name
	jdEpoch: 347995.5, // Julian date of start of Hebrew epoch: 7 October 3761 BCE
	daysPerMonth: [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 29], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 7, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Hebrew', // The calendar name
			epochs: ['BAM', 'AM'],
			monthNames: ['Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul',
			'Tishrei', 'Cheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Adar II'],
			monthNamesShort: ['Nis', 'Iya', 'Siv', 'Tam', 'Av', 'Elu', 'Tis', 'Che', 'Kis', 'Tev', 'She', 'Ada', 'Ad2'],
			dayNames: ['Yom Rishon', 'Yom Sheni', 'Yom Shlishi', 'Yom Revi\'i', 'Yom Chamishi', 'Yom Shishi', 'Yom Shabbat'],
			dayNamesShort: ['Ris', 'She', 'Shl', 'Rev', 'Cha', 'Shi', 'Sha'],
			dayNamesMin: ['Ri','She','Shl','Re','Ch','Shi','Sha'],
			dateFormat: 'dd/mm/yyyy', // See format options on BaseCalendar.formatDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false, // True if right-to-left language, false if left-to-right
			showMonthAfterYear: false, // True if the year select precedes month, false for month then year
			yearSuffix: '' // Additional text to append to the year in the month headers
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return this._leapYear(date.year());
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	_leapYear: function(year) {
		year = (year < 0 ? year + 1 : year);
		return mod(year * 7 + 1, 19) < 7;
	},

	/* Retrieve the number of months in a year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (number) the number of months
	   @throws  error if an invalid year or a different calendar used */
	monthsInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return this._leapYear(year.year ? year.year() : year) ? 13 : 12;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Sunday of this week starting on Sunday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(-checkDate.dayOfWeek(), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a year.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @return  (number) the number of days
	   @throws  error if an invalid year or a different calendar used */
	daysInYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		year = date.year();
		return this.toJD((year == -1 ? +1 : year + 1), 7, 1) - this.toJD(year, 7, 1);
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		if (year.year) {
			month = year.month();
			year = year.year();
		}
		this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return (month == 12 && this.leapYear(year) ? 30 : // Adar I
				(month == 8 && mod(this.daysInYear(year), 10) == 5 ? 30 : // Cheshvan in shlemah year
				(month == 9 && mod(this.daysInYear(year), 10) == 3 ? 29 : // Kislev in chaserah year
				this.daysPerMonth[month - 1])));
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return this.dayOfWeek(year, month, day) != 6;
	},

	/* Retrieve additional information about a date - year type.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (object) additional information - contents depends on calendar
	   @throws  error if an invalid date or a different calendar used */
	extraInfo: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		return {yearType: (this.leapYear(date) ? 'embolismic' : 'common') + ' ' +
			['deficient', 'regular', 'complete'][this.daysInYear(date) % 10 - 3]};
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		month = date.month();
		day = date.day();
		var adjYear = (year <= 0 ? year + 1 : year);
		var jd = this.jdEpoch + this._delay1(adjYear) +
			this._delay2(adjYear) + day + 1;
		if (month < 7) {
			for (var m = 7; m <= this.monthsInYear(year); m++) {
				jd += this.daysInMonth(year, m);
			}
			for (var m = 1; m < month; m++) {
				jd += this.daysInMonth(year, m);
			}
		}
		else {
			for (var m = 7; m < month; m++) {
				jd += this.daysInMonth(year, m);
			}
		}
		return jd;
	},

	/* Test for delay of start of new year and to avoid
	   Sunday, Wednesday, or Friday as start of the new year.
	   @param  year  (number) the year to examine
	   @return  (number) the days to offset by */
	_delay1: function(year) {
		var months = Math.floor((235 * year - 234) / 19);
		var parts = 12084 + 13753 * months;
		var day = months * 29 + Math.floor(parts / 25920);
		if (mod(3 * (day + 1), 7) < 3) {
			day++;
		}
		return day;
	},

	/* Check for delay in start of new year due to length of adjacent years.
	   @param  year  (number) the year to examine
	   @return  (number) the days to offset by */
	_delay2: function(year) {
		var last = this._delay1(year - 1);
		var present = this._delay1(year);
		var next = this._delay1(year + 1);
		return ((next - present) == 356 ? 2 : ((present - last) == 382 ? 1 : 0));
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		jd = Math.floor(jd) + 0.5;
		var year = Math.floor(((jd - this.jdEpoch) * 98496.0) / 35975351.0) - 1;
		while (jd >= this.toJD((year == -1 ? +1 : year + 1), 7, 1)) {
			year++;
		}
		var month = (jd < this.toJD(year, 1, 1)) ? 7 : 1;
		while (jd > this.toJD(year, month, this.daysInMonth(year, month))) {
			month++;
		}
		var day = jd - this.toJD(year, month, 1) + 1;
		return this.newDate(year, month, day);
	}
});

// Modulus function which works for non-integers.
function mod(a, b) {
	return a - (b * Math.floor(a / b));
}

// Hebrew calendar implementation
$.calendars.calendars.hebrew = HebrewCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Islamic calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Islamic or '16 civil' calendar.
   Based on code from http://www.iranchamber.com/calendar/converter/iranian_calendar_converter.php.
   See also http://en.wikipedia.org/wiki/Islamic_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function IslamicCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

IslamicCalendar.prototype = new $.calendars.baseCalendar;

$.extend(IslamicCalendar.prototype, {
	name: 'Islamic', // The calendar name
	jdEpoch: 1948439.5, // Julian date of start of Islamic epoch: 16 July 622 CE
	daysPerMonth: [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Islamic', // The calendar name
			epochs: ['BH', 'AH'],
			monthNames: ['Muharram', 'Safar', 'Rabi\' al-awwal', 'Rabi\' al-thani', 'Jumada al-awwal', 'Jumada al-thani',
			'Rajab', 'Sha\'aban', 'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'],
			monthNamesShort: ['Muh', 'Saf', 'Rab1', 'Rab2', 'Jum1', 'Jum2', 'Raj', 'Sha\'', 'Ram', 'Shaw', 'DhuQ', 'DhuH'],
			dayNames: ['Yawm al-ahad', 'Yawm al-ithnayn', 'Yawm ath-thulaathaa\'',
			'Yawm al-arbi\'aa\'', 'Yawm al-khamīs', 'Yawm al-jum\'a', 'Yawm as-sabt'],
			dayNamesShort: ['Aha', 'Ith', 'Thu', 'Arb', 'Kha', 'Jum', 'Sab'],
			dayNamesMin: ['Ah','It','Th','Ar','Kh','Ju','Sa'],
			dateFormat: 'yyyy/mm/dd', // See format options on BaseCalendar.formatDate
			firstDay: 6, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return (date.year() * 11 + 14) % 30 < 11;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Sunday of this week starting on Sunday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(-checkDate.dayOfWeek(), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a year.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @return  (number) the number of days
	   @throws  error if an invalid year or a different calendar used */
	daysInYear: function(year) {
		return (this.leapYear(year) ? 355 : 354);
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 12 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return this.dayOfWeek(year, month, day) != 5;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		month = date.month();
		day = date.day();
		year = (year <= 0 ? year + 1 : year);
		return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 +
			Math.floor((3 + (11 * year)) / 30) + this.jdEpoch - 1;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		jd = Math.floor(jd) + 0.5;
		var year = Math.floor((30 * (jd - this.jdEpoch) + 10646) / 10631);
		year = (year <= 0 ? year - 1 : year);
		var month = Math.min(12, Math.ceil((jd - 29 - this.toJD(year, 1, 1)) / 29.5) + 1);
		var day = jd - this.toJD(year, month, 1) + 1;
		return this.newDate(year, month, day);
	}
});

// Islamic (16 civil) calendar implementation
$.calendars.calendars.islamic = IslamicCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Julian calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Julian calendar.
   Based on code from http://www.fourmilab.ch/documents/calendar/.
   See also http://en.wikipedia.org/wiki/Julian_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function JulianCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

JulianCalendar.prototype = new $.calendars.baseCalendar;

$.extend(JulianCalendar.prototype, {
	name: 'Julian', // The calendar name
	jdEpoch: 1721423.5, // Julian date of start of Persian epoch: 1 January 0001 AD = 30 December 0001 BCE
	daysPerMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Julian', // The calendar name
			epochs: ['BC', 'AD'],
			monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'],
			monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
			dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
			dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
			dateFormat: 'mm/dd/yyyy', // See format options on parseDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = (date.year() < 0 ? date.year() + 1 : date.year()); // No year zero
		return (year % 4) == 0;
	},

	/* Determine the week of the year for a date - ISO 8601.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Thursday of this week starting on Monday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(4 - (checkDate.dayOfWeek() || 7), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 2 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		month = date.month();
		day = date.day();
		if (year < 0) { year++; } // No year zero
		// Jean Meeus algorithm, "Astronomical Algorithms", 1991
		if (month <= 2) {
			year--;
			month += 12;
		}
		return Math.floor(365.25 * (year + 4716)) +
			Math.floor(30.6001 * (month + 1)) + day - 1524.5;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		// Jean Meeus algorithm, "Astronomical Algorithms", 1991
		var a = Math.floor(jd + 0.5);
		var b = a + 1524;
		var c = Math.floor((b - 122.1) / 365.25);
		var d = Math.floor(365.25 * c);
		var e = Math.floor((b - d) / 30.6001);
		var month = e - Math.floor(e < 14 ? 1 : 13);
		var year = c - Math.floor(month > 2 ? 4716 : 4715);
		var day = b - d - Math.floor(30.6001 * e);
		if (year <= 0) { year--; } // No year zero
		return this.newDate(year, month, day);
	}
});

// Julian calendar implementation
$.calendars.calendars.julian = JulianCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Mayan calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Mayan Long Count calendar.
   See also http://en.wikipedia.org/wiki/Mayan_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function MayanCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

MayanCalendar.prototype = new $.calendars.baseCalendar;

$.extend(MayanCalendar.prototype, {
	name: 'Mayan', // The calendar name
	jdEpoch: 584282.5, // Julian date of start of Mayan epoch: 11 August 3114 BCE
	hasYearZero: true, // True if has a year zero, false if not
	minMonth: 0, // The minimum month number
	firstMonth: 0, // The first month in the year
	minDay: 0, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Mayan', // The calendar name
			epochs: ['', ''],
			monthNames: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'10', '11', '12', '13', '14', '15', '16', '17'],
			monthNamesShort: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'10', '11', '12', '13', '14', '15', '16', '17'],
			dayNames: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'10', '11', '12', '13', '14', '15', '16', '17', '18', '19'],
			dayNamesShort: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'10', '11', '12', '13', '14', '15', '16', '17', '18', '19'],
			dayNamesMin: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'10', '11', '12', '13', '14', '15', '16', '17', '18', '19'],
			dateFormat: 'YYYY.m.d', // See format options on BaseCalendar.formatDate
			firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false, // True if right-to-left language, false if left-to-right
			haabMonths: ['Pop', 'Uo', 'Zip', 'Zotz', 'Tzec', 'Xul', 'Yaxkin', 'Mol', 'Chen', 'Yax',
			'Zac', 'Ceh', 'Mac', 'Kankin', 'Muan', 'Pax', 'Kayab', 'Cumku', 'Uayeb'],
			tzolkinMonths: ['Imix', 'Ik', 'Akbal', 'Kan', 'Chicchan', 'Cimi', 'Manik', 'Lamat', 'Muluc', 'Oc',
			'Chuen', 'Eb', 'Ben', 'Ix', 'Men', 'Cib', 'Caban', 'Etznab', 'Cauac', 'Ahau']
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return false;
	},

	/* Format the year, if not a simple sequential number.
	   @param  year  (CDate) the date to format or
	                 (number) the year to format
	   @return  (string) the formatted year
	   @throws  error if an invalid year or a different calendar used */
	formatYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		year = date.year();
		var baktun = Math.floor(year / 400);
		year = year % 400;
		year += (year < 0 ? 400 : 0);
		var katun = Math.floor(year / 20);
		return baktun + '.' + katun + '.' + (year % 20);
	},

	/* Convert from the formatted year back to a single number.
	   @param  years  (string) the year as n.n.n
	   @return  (number) the sequential year
	   @throws  error if an invalid value is supplied */
	forYear: function(years) {
		years = years.split('.');
		if (years.length < 3) {
			throw 'Invalid Mayan year';
		}
		var year = 0;
		for (var i = 0; i < years.length; i++) {
			var y = parseInt(years[i], 10);
			if (Math.abs(y) > 19 || (i > 0 && y < 0)) {
				throw 'Invalid Mayan year';
			}
			year = year * 20 + y;
		}
		return year;
	},

	/* Retrieve the number of months in a year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (number) the number of months
	   @throws  error if an invalid year or a different calendar used */
	monthsInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return 18;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		this._validate(year, month, day, $.calendars.local.invalidDate);
		return 0;
	},

	/* Retrieve the number of days in a year.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @return  (number) the number of days
	   @throws  error if an invalid year or a different calendar used */
	daysInYear: function(year) {
		this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return 360;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return 20;
	},

	/* Retrieve the number of days in a week.
	   @return  (number) the number of days */
	daysInWeek: function() {
		return 5; // Just for formatting
	},

	/* Retrieve the day of the week for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the day of the week: 0 to number of days - 1
	   @throws  error if an invalid date or a different calendar used */
	dayOfWeek: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		return date.day();
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		this._validate(year, month, day, $.calendars.local.invalidDate);
		return true;
	},

	/* Retrieve additional information about a date - Haab and Tzolkin equivalents.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (object) additional information - contents depends on calendar
	   @throws  error if an invalid date or a different calendar used */
	extraInfo: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		var jd = date.toJD();
		var haab = this._toHaab(jd);
		var tzolkin = this._toTzolkin(jd);
		return {haabMonthName: this.local.haabMonths[haab[0] - 1],
			haabMonth: haab[0], haabDay: haab[1],
			tzolkinDayName: this.local.tzolkinMonths[tzolkin[0] - 1],
			tzolkinDay: tzolkin[0], tzolkinTrecena: tzolkin[1]};
	},

	/* Retrieve Haab date from a Julian date.
	   @param  jd  (number) the Julian date
	   @return  (number[2]) corresponding Haab month and day */
	_toHaab: function(jd) {
		jd -= this.jdEpoch;
		var day = mod(jd + 8 + ((18 - 1) * 20), 365);
		return [Math.floor(day / 20) + 1, mod(day, 20)];
	},

	/* Retrieve Tzolkin date from a Julian date.
	   @param  jd  (number) the Julian date
	   @return  (number[2]) corresponding Tzolkin day and trecena */
	_toTzolkin: function(jd) {
		jd -= this.jdEpoch;
		return [amod(jd + 20, 20), amod(jd + 4, 13)];
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		return date.day() + (date.month() * 20) + (date.year() * 360) + this.jdEpoch;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		jd = Math.floor(jd) + 0.5 - this.jdEpoch;
		var year = Math.floor(jd / 360);
		jd = jd % 360;
		jd += (jd < 0 ? 360 : 0);
		var month = Math.floor(jd / 20);
		var day = jd % 20;
		return this.newDate(year, month, day);
	}
});

// Modulus function which works for non-integers.
function mod(a, b) {
	return a - (b * Math.floor(a / b));
}

// Modulus function which returns numerator if modulus is zero.
function amod(a, b) {
    return mod(a - 1, b) + 1;
}

// Mayan calendar implementation
$.calendars.calendars.mayan = MayanCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Persian calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2009.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

/* Implementation of the Persian or Jalali calendar.
   Based on code from http://www.iranchamber.com/calendar/converter/iranian_calendar_converter.php.
   See also http://en.wikipedia.org/wiki/Iranian_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function PersianCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

PersianCalendar.prototype = new $.calendars.baseCalendar;

$.extend(PersianCalendar.prototype, {
	name: 'Persian', // The calendar name
	jdEpoch: 1948320.5, // Julian date of start of Persian epoch: 19 March 622 CE
	daysPerMonth: [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Persian', // The calendar name
			epochs: ['BP', 'AP'],
			monthNames: ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
			'Mehr', 'Aban', 'Azar', 'Day', 'Bahman', 'Esfand'],
			monthNamesShort: ['Far', 'Ord', 'Kho', 'Tir', 'Mor', 'Sha', 'Meh', 'Aba', 'Aza', 'Day', 'Bah', 'Esf'],
			dayNames: ['Yekshambe', 'Doshambe', 'Seshambe', 'Chæharshambe', 'Panjshambe', 'Jom\'e', 'Shambe'],
			dayNamesShort: ['Yek', 'Do', 'Se', 'Chæ', 'Panj', 'Jom', 'Sha'],
			dayNamesMin: ['Ye','Do','Se','Ch','Pa','Jo','Sh'],
			dateFormat: 'yyyy/mm/dd', // See format options on BaseCalendar.formatDate
			firstDay: 6, // The first day of the week, Sun = 0, Mon = 1, ...
			isRTL: false // True if right-to-left language, false if left-to-right
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		return (((((date.year() - (date.year() > 0 ? 474 : 473)) % 2820) +
			474 + 38) * 682) % 2816) < 682;
	},

	/* Determine the week of the year for a date.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		// Find Saturday of this week starting on Saturday
		var checkDate = this.newDate(year, month, day);
		checkDate.add(-((checkDate.dayOfWeek() + 1) % 7), 'd');
		return Math.floor((checkDate.dayOfYear() - 1) / 7) + 1;
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 12 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return this.dayOfWeek(year, month, day) != 5;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		year = date.year();
		month = date.month();
		day = date.day();
		var epBase = year - (year >= 0 ? 474 : 473);
		var epYear = 474 + mod(epBase, 2820);
		return day + (month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6) +
			Math.floor((epYear * 682 - 110) / 2816) + (epYear - 1) * 365 +
			Math.floor(epBase / 2820) * 1029983 + this.jdEpoch - 1;
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		jd = Math.floor(jd) + 0.5;
		var depoch = jd - this.toJD(475, 1, 1);
		var cycle = Math.floor(depoch / 1029983);
		var cyear = mod(depoch, 1029983);
		var ycycle = 2820;
		if (cyear != 1029982) {
			var aux1 = Math.floor(cyear / 366);
			var aux2 = mod(cyear, 366);
			ycycle = Math.floor(((2134 * aux1) + (2816 * aux2) + 2815) / 1028522) + aux1 + 1;
		}
		var year = ycycle + (2820 * cycle) + 474;
		year = (year <= 0 ? year - 1 : year);
		var yday = jd - this.toJD(year, 1, 1) + 1;
		var month = (yday <= 186 ? Math.ceil(yday / 31) : Math.ceil((yday - 6) / 30));
		var day = jd - this.toJD(year, month, 1) + 1;
		return this.newDate(year, month, day);
	}
});

// Modulus function which works for non-integers.
function mod(a, b) {
	return a - (b * Math.floor(a / b));
}

// Persian (Jalali) calendar implementation
$.calendars.calendars.persian = PersianCalendar;
$.calendars.calendars.jalali = PersianCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Taiwanese (Minguo) calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) February 2010.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

var gregorianCalendar = $.calendars.instance();

/* Implementation of the Taiwanese calendar.
   See http://en.wikipedia.org/wiki/Minguo_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function TaiwanCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

TaiwanCalendar.prototype = new $.calendars.baseCalendar;

$.extend(TaiwanCalendar.prototype, {
	name: 'Taiwan', // The calendar name
	jdEpoch: 2419402.5, // Julian date of start of Taiwan epoch: 1 January 1912 CE (Gregorian)
	yearsOffset: 1911, // Difference in years between Taiwan and Gregorian calendars
	daysPerMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Taiwan', // The calendar name
			epochs: ['BROC', 'ROC'],
			monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'],
			monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
			dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
			dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
			dateFormat: 'yyyy/mm/dd',
			firstDay: 1,
			isRTL: false
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.leapYear(year);
	},

	/* Determine the week of the year for a date - ISO 8601.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.weekOfYear(year, date.month(), date.day());
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 2 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.toJD(year, date.month(), date.day());
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		var date = gregorianCalendar.fromJD(jd);
		var year = this._g2tYear(date.year());
		return this.newDate(year, date.month(), date.day());
	},

	/* Convert Taiwanese to Gregorian year.
	   @param  year  the Taiwanese year
	   @return  the corresponding Gregorian year */
	_t2gYear: function(year) {
		return year + this.yearsOffset + (year >= -this.yearsOffset && year <= -1 ? 1 : 0);
	},

	/* Convert Gregorian to Taiwanese year.
	   @param  year  the Gregorian year
	   @return  the corresponding Taiwanese year */
	_g2tYear: function(year) {
		return year - this.yearsOffset - (year >= 1 && year <= this.yearsOffset ? 1 : 0);
	}
});

// Taiwan calendar implementation
$.calendars.calendars.taiwan = TaiwanCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Thai calendar for jQuery v1.1.4.
   Written by Keith Wood (kbwood{at}iinet.com.au) February 2010.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide scope, no $ conflict

var gregorianCalendar = $.calendars.instance();

/* Implementation of the Thai calendar.
   See http://en.wikipedia.org/wiki/Thai_calendar.
   @param  language  (string) the language code (default English) for localisation (optional) */
function ThaiCalendar(language) {
	this.local = this.regional[language || ''] || this.regional[''];
}

ThaiCalendar.prototype = new $.calendars.baseCalendar;

$.extend(ThaiCalendar.prototype, {
	name: 'Thai', // The calendar name
	jdEpoch: 1523098.5, // Julian date of start of Thai epoch: 1 January 543 BCE (Gregorian)
	yearsOffset: 543, // Difference in years between Thai and Gregorian calendars
	daysPerMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], // Days per month in a common year
	hasYearZero: false, // True if has a year zero, false if not
	minMonth: 1, // The minimum month number
	firstMonth: 1, // The first month in the year
	minDay: 1, // The minimum day number

	regional: { // Localisations
		'': {
			name: 'Thai', // The calendar name
			epochs: ['BBE', 'BE'],
			monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'],
			monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
			dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
			dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
			dateFormat: 'dd/mm/yyyy',
			firstDay: 0,
			isRTL: false
		}
	},

	/* Determine whether this date is in a leap year.
	   @param  year  (CDate) the date to examine or
	                 (number) the year to examine
	   @return  (boolean) true if this is a leap year, false if not
	   @throws  error if an invalid year or a different calendar used */
	leapYear: function(year) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.leapYear(year);
	},

	/* Determine the week of the year for a date - ISO 8601.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (number) the week of the year
	   @throws  error if an invalid date or a different calendar used */
	weekOfYear: function(year, month, day) {
		var date = this._validate(year, this.minMonth, this.minDay, $.calendars.local.invalidYear);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.weekOfYear(year, date.month(), date.day());
	},

	/* Retrieve the number of days in a month.
	   @param  year   (CDate) the date to examine or
	                  (number) the year of the month
	   @param  month  (number) the month
	   @return  (number) the number of days in this month
	   @throws  error if an invalid month/year or a different calendar used */
	daysInMonth: function(year, month) {
		var date = this._validate(year, month, this.minDay, $.calendars.local.invalidMonth);
		return this.daysPerMonth[date.month() - 1] +
			(date.month() == 2 && this.leapYear(date.year()) ? 1 : 0);
	},

	/* Determine whether this date is a week day.
	   @param  year   (CDate) the date to examine or
	                  (number) the year to examine
	   @param  month  (number) the month to examine
	   @param  day    (number) the day to examine
	   @return  (boolean) true if a week day, false if not
	   @throws  error if an invalid date or a different calendar used */
	weekDay: function(year, month, day) {
		return (this.dayOfWeek(year, month, day) || 7) < 6;
	},

	/* Retrieve the Julian date equivalent for this date,
	   i.e. days since January 1, 4713 BCE Greenwich noon.
	   @param  year   (CDate) the date to convert or
	                  (number) the year to convert
	   @param  month  (number) the month to convert
	   @param  day    (number) the day to convert
	   @return  (number) the equivalent Julian date
	   @throws  error if an invalid date or a different calendar used */
	toJD: function(year, month, day) {
		var date = this._validate(year, month, day, $.calendars.local.invalidDate);
		var year = this._t2gYear(date.year());
		return gregorianCalendar.toJD(year, date.month(), date.day());
	},

	/* Create a new date from a Julian date.
	   @param  jd  (number) the Julian date to convert
	   @return  (CDate) the equivalent date */
	fromJD: function(jd) {
		var date = gregorianCalendar.fromJD(jd);
		var year = this._g2tYear(date.year());
		return this.newDate(year, date.month(), date.day());
	},

	/* Convert Thai to Gregorian year.
	   @param  year  the Thai year
	   @return  the corresponding Gregorian year */
	_t2gYear: function(year) {
		return year - this.yearsOffset - (year >= 1 && year <= this.yearsOffset ? 1 : 0);
	},

	/* Convert Gregorian to Thai year.
	   @param  year  the Gregorian year
	   @return  the corresponding Thai year */
	_g2tYear: function(year) {
		return year + this.yearsOffset + (year >= -this.yearsOffset && year <= -1 ? 1 : 0);
	}
});

// Thai calendar implementation
$.calendars.calendars.thai = ThaiCalendar;

})(jQuery);
/* http://keith-wood.name/calendars.html
   Calendars Validation extension for jQuery 1.1.4.
   Requires Jörn Zaefferer's Validation plugin (http://plugins.jquery.com/project/validate).
   Written by Keith Wood (kbwood{at}iinet.com.au).
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

;(function($) { // Hide the namespace

/* Add validation methods if validation plugin available. */
if ($.fn.validate) {

	$.calendars.picker.selectDateOrig = $.calendars.picker.selectDate;
	
	$.extend($.calendars.picker.regional[''], {
		validateDate: 'Please enter a valid date',
		validateDateMin: 'Please enter a date on or after {0}',
		validateDateMax: 'Please enter a date on or before {0}',
		validateDateMinMax: 'Please enter a date between {0} and {1}',
		validateDateCompare: 'Please enter a date {0} {1}',
		validateDateToday: 'today',
		validateDateOther: 'the other date',
		validateDateEQ: 'equal to',
		validateDateNE: 'not equal to',
		validateDateLT: 'before',
		validateDateGT: 'after',
		validateDateLE: 'not after',
		validateDateGE: 'not before'
	});
	
	$.extend($.calendars.picker._defaults, $.calendars.picker.regional['']);

	$.extend($.calendars.picker, {

		/* Trigger a validation after updating the input field with the selected date.
		   @param  target  (element) the control to examine
		   @param  elem    (element) the selected datepicker element */
		selectDate: function(target, elem) {
			this.selectDateOrig(target, elem);
			var inst = $.data(target, $.calendars.picker.dataName);
			if (!inst.inline && $.fn.validate) {
				var validation = $(target).parents('form').validate();
				if (validation) {
					validation.element('#' + target.id);
				}
			}
		},

		/* Correct error placement for validation errors - after any trigger.
		   @param  error    (jQuery) the error message
		   @param  element  (jQuery) the field in error */
		errorPlacement: function(error, element) {
			var inst = $.data(element[0], $.calendars.picker.dataName);
			if (inst) {
				error[inst.get('isRTL') ? 'insertBefore' : 'insertAfter'](
					inst.trigger.length > 0 ? inst.trigger : element);
			}
			else {
				error.insertAfter(element);
			}
		},

		/* Format a validation error message involving dates.
		   @param  source  (string) the error message
		   @param  params  (Date[]) the dates
		   @return  (string) the formatted message */
		errorFormat: function(source, params) {
			var format = ($.calendars.picker.curInst ?
				$.calendars.picker.curInst.get('dateFormat') :
				$.calendars.picker._defaults.dateFormat);
			$.each(params, function(index, value) {
				source = source.replace(new RegExp('\\{' + index + '\\}', 'g'),
					value.formatDate(format) || 'nothing');
			});
			return source;
		}
	});

	var lastElement = null;

	/* Validate date field. */
	$.validator.addMethod('cpDate', function(value, element, params) {
			lastElement = element;
			return this.optional(element) || validateEach(value, element);
		},
		function(params) {
			var inst = $.data(lastElement, $.calendars.picker.dataName);
			var minDate = inst.get('minDate');
			var maxDate = inst.get('maxDate');
			var messages = $.calendars.picker._defaults;
			return (minDate && maxDate ?
				$.calendars.picker.errorFormat(messages.validateDateMinMax, [minDate, maxDate]) :
				(minDate ? $.calendars.picker.errorFormat(messages.validateDateMin, [minDate]) :
				(maxDate ? $.calendars.picker.errorFormat(messages.validateDateMax, [maxDate]) :
				messages.validateDate)));
		});

	/* Apply a validation test to each date provided.
	   @param  value    (string) the current field value
	   @param  element  (element) the field control
	   @return  (boolean) true if OK, false if failed validation */
	function validateEach(value, element) {
		var inst = $.data(element, $.calendars.picker.dataName);
		var rangeSelect = inst.get('rangeSelect');
		var multiSelect = inst.get('multiSelect');
		var dates = (multiSelect ? value.split(inst.get('multiSeparator')) :
			(rangeSelect ? value.split(inst.get('rangeSeparator')) : [value]));
		var ok = (multiSelect && dates.length <= multiSelect) ||
			(!multiSelect && rangeSelect && dates.length == 2) ||
			(!multiSelect && !rangeSelect && dates.length == 1);
		if (ok) {
			try {
				var dateFormat = inst.get('dateFormat');
				var minDate = inst.get('minDate');
				var maxDate = inst.get('maxDate');
				var cp = $(element);
				$.each(dates, function(i, v) {
					dates[i] = inst.get('calendar').parseDate(dateFormat, v);
					ok = ok && (!dates[i] || (cp.calendarsPicker('isSelectable', dates[i]) &&
						(!minDate || dates[i].compareTo(minDate) != -1) &&
						(!maxDate || dates[i].compareTo(maxDate) != +1)));
				});
			}
			catch (e) {
				ok = false;
			}
		}
		if (ok && rangeSelect) {
			ok = (dates[0].compareTo(dates[1]) != +1);
		}
		return ok;
	}

	/* And allow as a class rule. */
	$.validator.addClassRules('cpDate', {cpDate: true});

	var comparisons = {equal: 'eq', same: 'eq', notEqual: 'ne', notSame: 'ne',
		lessThan: 'lt', before: 'lt', greaterThan: 'gt', after: 'gt',
		notLessThan: 'ge', notBefore: 'ge', notGreaterThan: 'le', notAfter: 'le'};

	/* Cross-validate date fields.
	   params should be an array with [0] comparison type eq/ne/lt/gt/le/ge or synonyms,
	   [1] 'today' or date string or CDate or other field selector/element/jQuery OR
	   an object with one attribute with name eq/ne/lt/gt/le/ge or synonyms
	   and value 'today' or date string or CDate or other field selector/element/jQuery OR
	   a string with eq/ne/lt/gt/le/ge or synonyms followed by 'today' or date string or jQuery selector */
	$.validator.addMethod('cpCompareDate', function(value, element, params) {
			if (this.optional(element)) {
				return true;
			}
			params = normaliseParams(params);
			var thisDate = $(element).calendarsPicker('getDate');
			var thatDate = extractOtherDate(element, params[1]);
			if (thisDate.length == 0 || thatDate.length == 0) {
				return true;
			}
			lastElement = element;
			var finalResult = true;
			for (var i = 0; i < thisDate.length; i++) {
				var result = thisDate[i].compareTo(thatDate[0]);
				switch (comparisons[params[0]] || params[0]) {
					case 'eq': finalResult = (result == 0); break;
					case 'ne': finalResult = (result != 0); break;
					case 'lt': finalResult = (result < 0); break;
					case 'gt': finalResult = (result > 0); break;
					case 'le': finalResult = (result <= 0); break;
					case 'ge': finalResult = (result >= 0); break;
					default:   finalResult = true;
				}
				if (!finalResult) {
					break;
				}
			}
			return finalResult;
		},
		function(params) {
			var messages = $.calendars.picker._defaults;
			params = normaliseParams(params);
			var thatDate = extractOtherDate(lastElement, params[1], true);
			thatDate = (params[1] == 'today' ? messages.validateDateToday : 
				(thatDate.length ? thatDate[0].formatDate() : messages.validateDateOther));
			return messages.validateDateCompare.replace(/\{0\}/,
				messages['validateDate' + (comparisons[params[0]] || params[0]).toUpperCase()]).
				replace(/\{1\}/, thatDate);
		});

	/* Normalise the comparison parameters to an array.
	   @param  params  (array or object or string) the original parameters
	   @return  (array) the normalised parameters */
	function normaliseParams(params) {
		if (typeof params == 'string') {
			params = params.split(' ');
		}
		else if (!$.isArray(params)) {
			var opts = [];
			for (var name in params) {
				opts[0] = name;
				opts[1] = params[name];
			}
			params = opts;
		}
		return params;
	}

	/* Determine the comparison date.
	   @param  element  (element) the current datepicker element
	   @param  source   (string or CDate or jQuery or element) the source of the other date
	   @param  noOther  (boolean) true to not get the date from another field
	   @return  (CDate[1]) the date for comparison */
	function extractOtherDate(element, source, noOther) {
		if (source.newDate && source.extraInfo) { // Already a CDate
			return [source];
		}
		var inst = $.data(element, $.calendars.picker.dataName);
		var calendar = inst.get('calendar');
		var thatDate = null;
		try {
			if (typeof source == 'string' && source != 'today') {
				thatDate = calendar.parseDate(inst.get('dateFormat'), source);
			}
		}
		catch (e) {
			// Ignore
		}
		thatDate = (thatDate ? [thatDate] : (source == 'today' ?
			[calendar.today()] : (noOther ? [] : $(source).calendarsPicker('getDate'))));
		return thatDate;
	}
}

})(jQuery);

