/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true*/
(function () {
	"use strict";

	var path = require('path'),
		Stream = require('stream').Stream,
    EventEmitter = require('events').EventEmitter,
		Header = require("./header"),
		utils = require("./utils"),
		recordSize = 512,
		blockSize,
		queue = [];
	
	function Tar(opt) {
		var tape;

		opt = opt || {};

		blockSize = (opt.recordsPerBlock ? opt.recordsPerBlock : 20) * recordSize;

		Stream.apply(this, arguments);

		tape = this;

		this.written = 0;

		this.consolidate = 'consolidate' in opt ? opt.consolidate : false;
		this.normalize = 'normalize' in opt ? opt.normalize : true;

		this.on('end', function () {
			tape.emit('data', utils.clean(blockSize - (tape.written % blockSize)));
		});

		if (opt && opt.output) {
			this.pipe(opt.output);
		}
	}

	Tar.prototype = Object.create(Stream.prototype, {
		constructor: { value: Tar }
	});

	Tar.prototype.close = function () {
		this.emit('end');
	};

  function updateChecksum(key) {
    /*jshint validthis:true*/
    var i, value = this.data[key], length;

    for (i = 0, length = value.length; i < length; i += 1) {
      this.checksum += value.charCodeAt(i);
    }
  }

	Tar.prototype.append = function (filepath, input, opts, callback) {
		var data,
			checksum,
			mode,
			mtime,
			uid,
			gid,
			size,
			tape = this,
      treatAsBuffer,
      inputStream,
      realInput,
      headerContainer,
			headerBuf;

    function emitFakeStream() {
      inputStream.emit('data', realInput);
      inputStream.emit('end', realInput);
    }

    function addChunkToTar(chunk) {
      tape.emit('data', chunk);
      tape.written += chunk.length;
    }

    function checkQueue() {
      tape.processing = false;

      if (typeof callback === 'function') {
        callback();
      }

      if (!queue.length) {
        return;
      }

      var elem = queue.splice(0, 1)[0];

      tape.append(elem.filepath, elem.input, elem.opts, elem.cb);
    }

    function padTarAndEnd() {
      var extraBytes = recordSize - (size % recordSize || recordSize)
        ;

      addChunkToTar(utils.clean(extraBytes));

      process.nextTick(checkQueue);
    }


    // callback mangling
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}

    // If we're in the middle of something, wait until we
    // finish to queue up the next
		if (this.processing || queue.length) {
      if ('function' === typeof input.pause) {
        input.pause();
      }

      // TODO check for drain before resuming
			queue.push({
				filepath: filepath,
				input: input,
				opts: opts,
				cb: callback
			});

			return;
		}

		opts = opts || {};

		mode = opts.mode || parseInt('777', 8) & 0xfff;
		mtime = opts.mtime || parseInt(Date.now() / 1000, 10);
		uid = opts.uid || 0;
		gid = opts.gid || 0;
		size = opts.size || input.length || 0;

		data = {
			filename: this.consolidate ? path.basename(filepath) : filepath,
			mode: utils.pad(mode, 7),
			uid: utils.pad(uid, 7),
			gid: utils.pad(gid, 7),
			size: utils.pad(size, 11),
			mtime: utils.pad(mtime, 11),
			checksum: '        ',
			type: '0', // just a file
			ustar: 'ustar  ',
			owner: '',
			group: ''
		};

		if (this.normalize && !this.consolidate) {
			data.filename = path.normalize(data.filename);
		}

		// calculate the checksum
    headerContainer = { data: data, checksum: 0 };
		Object.keys(data).forEach(updateChecksum, headerContainer);
		checksum = headerContainer.checksum;

		data.checksum = utils.pad(checksum, 6) + "\u0000 ";

		headerBuf = Header.format(data);
		this.emit('data', headerBuf);
		this.written += headerBuf.length;

    // a step towards making this browser-usable code
    if ('undefined' !== typeof Buffer) {
      if (input instanceof Buffer) {
        treatAsBuffer = true;
      }
      if ('string' === typeof input) {
        // get correct number of bytes with unicode chars
        input = new Buffer(input);
      }
    }

    // TODO get correct number of bytes for unicode characters
    // when the environment isn't NodeJS (no Buffer)
		if (typeof input === 'string' || treatAsBuffer) {
      inputStream = new EventEmitter();

      // emitFakeStream uses realInput
      realInput = input;
      process.nextTick(emitFakeStream);
		} else {
      inputStream = input;
    }

    tape.processing = true;

    if ('function' === typeof inputStream.resume) {
      inputStream.resume();
    }

    inputStream.on('data', addChunkToTar);
    inputStream.on('end', padTarAndEnd);
	};
	
	module.exports = Tar;
}());
