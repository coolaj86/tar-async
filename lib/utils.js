/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true*/
(function () {
	"use strict";

	function clean(length) {
    var buf = new Buffer(length)
      ;

    buf.fill(0);

		return buf;
	}

	function pad(num, bytes, base) {
		num = num.toString(base || 8);
		return "000000000000".substr(num.length + 12 - bytes) + num;
	}	
	
	module.exports.clean = clean;
	module.exports.pad = pad;
}());
