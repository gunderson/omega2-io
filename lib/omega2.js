var FS = require( 'fs' );
var CP = require( 'child_process' );
var Emitter = require( 'events' ).EventEmitter;
var Promise = require( 'bluebird' );
var tick = process.setImmediate || process.nextTick;

var MODES = Object.freeze( require( './modes.json' ) );
var pinGroups = require( './pingroups-omega2.json' );

// translate lexical modes in json to numerical modes
pinGroups = pinGroups.map((group) => {
	group.modes = group.modes.map((mode) => {
		return modes[mode];
	})
})

// assign pin modes for each pin based on group membership
var pinModes = [];
for (var groupName in pinGroups){
	let group = pinGroups[groupName];
	for (var i = 0; i < group.pins.length; i++){

		var pin = pinModes[group.pins[i]] || {modes:[]};
		pin.modes = pin.modes.concat(group.modes);
		pinModes[group.pins[i]] = pin;
	}
}

// redundancy for group names
pinGroups.ANALOG = pinGroups.PWM;



var boards = [ ];
var _i2cBus;
var _i2cPollDelay; // delay before each i2c read in milliseconds

function Omega2( opts ) {
	Emitter.call( this );

	if ( !( this instanceof Omega2 ) ) {
		return new Omega2( opts );
	}

	this.name = 'Omega2-IO';

	this.pins = pinModes.map( function( pin, index ) {
		var p = {
			index: index,
			port: index,
			supportedModes: pin.modes,
			value: 0,
			report: 0,
			mode: null,
			isPwm: false
		};

		return p;
	}, this );

	boards[0] = this;

	this.defaultLed = 13;
	this.isReady = false;
	tick( function( ) {
		this.isReady = true;
		this.emit( 'connect' );
		this.emit( 'ready' );
	}.bind( this ) );
}

Omega2.reset = function( ) {
	return null;
};

Omega2.prototype = Object.create( Emitter.prototype, {
	constructor: {
		value: Omega2
	},
	MODES: {
		value: modes
	},
	HIGH: {
		value: 1
	},
	LOW: {
		value: 0
	}
} );

Omega2.prototype.pinMode = function( pin, mode ) {
	var pinIndex = pin;
	this.pins[pinIndex].mode = mode;

	switch ( mode ) {
		case modes.OUTPUT:
			CP.spawn( 'fast-gpio', [ 'set-output', pinIndex ] );
			this.pins[pinIndex].mode = modes.OUTPUT;
			this.pins[pinIndex].isPwm = false;
			break;

		case modes.INPUT:
			CP.spawn( 'fast-gpio', [ 'set-input', pinIndex ] );
			this.pins[pinIndex].mode = modes.INPUT;
			this.pins[pinIndex].isPwm = false;
			break;

		case modes.ANALOG:
			// intentional fallthrough
		case modes.PWM:
			this.pins[pinIndex].mode = modes.PWM;
			this.pins[pinIndex].isPwm = true;
			break;

		case modes.SERVO:
			console.error( 'Omega2 doesn\'t support servo mode' );
			break;
	}

	return this;
};


Omega2.prototype.analogWrite = function( pin, value, dutycycle ) {
	if ( this.pins[pin].mode !== MODES.PWM ) {
		this.pinMode( pin, MODES.PWM );
	}

	this.pins[pin].value = value;

	// set pin mode to PMW
	// set pwm value

	return this;
};

Omega2.prototype.pwmWrite = Omega2.prototype.analogWrite;

Omega2.prototype.digitalRead = function( pinIndex, handler ) {
	var pin = this.pins[pinIndex];
	if ( this.pins[pinIndex].mode !== this.MODES.INPUT ) {
		this.pinMode( pinIndex, this.MODES.INPUT );
	}

	var cp = CP.spawn( 'fast-gpio', [ 'read', pinIndex ] );
	cp.stdout.on( 'data', function( err, data ) {
		if ( err ) return console.error( 'Error reading Omega2 pin ' + pinIndex, err );
		var changed = false;
		if ( data.indexOf( ': 1' ) > -1 ) {
			if ( pin.value !== 1 ) {
				pin.value = 1;
				changed = true;
			}
		} else if ( data.indexOf( ': 0' ) > -1 ) {
			if ( pin.value !== 0 ) {
				pin.value = 0;
				changed = true;
			}
		}
		if ( changed ) {
			// TODO: Emit event
		}
	} );
	cp.on( 'exit', function() {
		handler( pin.value );
	} );

	return this;
};

Omega2.prototype.digitalWrite = function( pin, value ) {
	if ( this.pins[pin].mode !== this.MODES.OUTPUT ) {
		this.pinMode( pin, this.MODES.OUTPUT );
	}

	this.pins[pin].value = value;
	CP.spawn( 'fast-gpio', [ 'set', pin, value] );

	return this;
};


Omega2.prototype.i2cConfig = function( options ) {
	_i2cPollDelay = 0;
	if ( typeof options === 'number' ) {
		_i2cPollDelay = 1000 / options;
	} else {
		if ( typeof options === 'object' && options !== null ) {
			_i2cPollDelay = 1000 / options.frequency || options.delay;
		}
	}
	return this;
};

// this method supports both
// i2cWrite(address, register, inBytes)
// and
// i2cWrite(address, inBytes)
Omega2.prototype.i2cWrite = function( address, cmdRegOrData, inBytes ) {
	/**
	 * cmdRegOrData:
	 * [... arbitrary bytes]
	 *
	 * or
	 *
	 * cmdRegOrData, inBytes:
	 * command [, ...]
	 *
	 */
	var buffer;

	this.i2cConfig( );

	// If i2cWrite was used for an i2cWriteReg call...
	if (arguments.length === 3 && !Array.isArray( cmdRegOrData ) && !Array.isArray( inBytes )) {
		return this.i2cWriteReg( address, cmdRegOrData, inBytes );
	}

	// Fix arguments if called with Firmata.js API
	if ( arguments.length === 2 ) {
		if (Array.isArray( cmdRegOrData )) {
			inBytes = cmdRegOrData.slice( );
			cmdRegOrData = inBytes.shift( );
		} else {
			inBytes = [ ];
		}
	}

	// Only write if bytes provided
	while ( inBytes.length ) {
		var cp = CP.spawn( 'i2cset', [ '-y', '0', toHexString(cmdRegOrData), toHexString(inBytes.shift()) ]);
	}

	return this;
};

Omega2.prototype.i2cWriteReg = function( address, register, value ) {
	this.i2cConfig( );

	var cp = CP.spawn( 'i2cset', [ '-y', '0', toHexString(address), toHexString(register), toHexString(value) ]);

	return this;
};

Omega2.prototype._i2cRead = function( continuous, address, register, bytesToRead, callback ) {
	var data;
	var event = 'I2C-reply' + address + '-';

	this.i2cConfig( );

	// Fix arguments if called with Firmata.js API
	if ( arguments.length === 4 && typeof register === 'number' && typeof bytesToRead === 'function' ) {
		callback = bytesToRead;
		bytesToRead = register;
		register = null;
	}

	register = register || 0;

	data = new Buffer( bytesToRead );

	callback = typeof callback === 'function'
		? callback
		: function( ) {};

	event += register !== null
		? register
		: 0;

	var timeout = setTimeout( function read( ) {
		var afterRead = function( err, bytesRead, buffer ) {
			if ( err ) {
				return this.emit( 'error', err );
			}

			// Convert buffer to Array before emit
			this.emit(event, [ ].slice.call( buffer ));

			if ( continuous && --bytesRead ) {
				setTimeout( read.bind( this ), _i2cDelay );
			}
		}.bind( this );

		this.once( event, callback );

		var args =  ['-y' '0', toHexString(address), toHexString(register)];
		var cp = CP.spawn('i2cget', args);
		cp.on('data', (data) => {
			afterRead(null, 1, data);
		});

	}.bind( this ), _i2cDelay);

	return this;
};

// this method supports both
// i2cRead(address, register, bytesToRead, handler)
// and
// i2cRead(address, bytesToRead, handler)
Omega2.prototype.i2cRead = function( address, register, bytesToRead, handler ) {
	return this
		._i2cRead
		.apply(this, [ true ].concat([ ].slice.call( arguments )));
};

// this method supports both
// i2cReadOnce(address, register, bytesToRead, handler)
// and
// i2cReadOnce(address, bytesToRead, handler)
Omega2.prototype.i2cReadOnce = function( address, register, bytesToRead, handler ) {
	return this
		._i2cRead
		.apply(this, [ false ].concat([ ].slice.call( arguments )));
};

var serialStates = {
	IDLE: 0,
	READING: 1,
	WRITING: 2,
	MESSAGE_RECIEVED: 3
}

Omega2.prototype.queryPinState = function( pinIndex, handler ) {
	var pin = this.pins[pinIndex];

	var event = ['change:pin.state'];

	var cp = CP.spawn( 'fast-gpio', [ 'get-direction', pinIndex ] );
	cp.stdout.on( 'data', function( err, data ) {
		if ( err ) return console.error( 'Error reading Omega2 pin ' + pinIndex, err );
		var changed = false;
		if ( data.indexOf( ': output' ) > -1 ) {

			if ( pin.mode !== modes.OUTPUT ) {
				pin.mode = modes.OUTPUT;
				changed = true;
			}
		} else if ( data.indexOf( ': input' ) > -1 ) {
			if ( pin.mode !== modes.INPUT ) {
				pin.mode = modes.INPUT;
				changed = true;
			}
		}
		if ( changed ) {
			event.push(pin);
			this.emit.apply(this, event);
		}
	} );
	cp.on( 'exit', function() {
		handler && handler( pin.mode );
	} );

	return this;
};

Omega2.prototype.serialOpen = function ( baudRate, channel ){
	baudRate = baudRate || 115200;
	channel = channel || 0;
	address = '/dev/ttyS' + channel;

	// set the baud rate on the port
	CP.spawnSync('stty', ['-F', address, baudRate ]);


	// open streams to sysfs node
	var readStream = FS.ReadStream( address );
	var writeStream = FS.WriteStream( address );

	this.serial[channel] = {
		address: address,
		baudRate: baudRate,
		parity: parity,
		stopBits: stopBits,
		channel: channel,
		buffer: [],
		readStream: readStream,
		writeStream: writeStream
	}
}

Omega2.prototype.serialClose = function ( channel ){
	channel = channel || 0;
	var serial = this.serial[channel];
	serial.readStream && serial.readStream.end();
	serial.writeStream && serial.writeStream.end();
	return this;
}

Omega2.prototype.serialListen = function ( messageTerminator, channel){
	messageTerminator = messageTerminator || "\n";
	channel = channel || 0;

	var serial = this.serial[channel];
	serial.messageTerminator = messageTerminator;
	if (serial.encoding !== encoding){
		serial.readStream.setEncoding(encoding);
	}

	readStream.on('data', function( chunk ){
		serial.buffer = serial.buffer.concat(Array.from(chunk));
		this.serialOnMessage( serial );
	});
	return this;
}

Omega2.prototype.serialOnMessage( serialObject ){
	while(serialObject.indexOf(serialObject.messageTerminator) > -1){
		var termIndex = serialObject.indexOf(serialObject.messageTerminator);
		var message = buffer.splice(0, termIndex + 1);
		serialObject.message = message;
		this.emit('serial:message', serialObject);
	}
	return this;
}

Omega2.prototype.serialWrite = function ( message, encoding, channel ){
	channel = channel || 0;
	var serial = this.serial[channel];
	serial.writeStream.write(message, encoding);
	return this;
}

// Necessary for Firmata.js compatibility.
Omega2.prototype.sendI2CConfig = Omega2.prototype.i2cConfig;
Omega2.prototype.sendI2CReadRequest = Omega2.prototype.i2cReadOnce;
Omega2.prototype.sendI2CWriteRequest = Omega2.prototype.i2cWrite;

// Not Supported
[
	'analogRead',
	'pulseIn',
	'pulseOut',
	'_sendOneWireRequest',
	'_sendOneWireSearch',
	'sendOneWireWriteAndRead',
	'sendOneWireDelay',
	'sendOneWireDelay',
	'sendOneWireReset',
	'sendOneWireRead',
	'sendOneWireSearch',
	'sendOneWireAlarmsSearch',
	'sendOneWireConfig',
	'servoWrite',
	'stepperConfig',
	'stepperStep'
	].forEach( function( method ) {
	Omega2.prototype[method] = function( ) {
		throw method + ' is not yet implemented.';
	};

});

function defer(){
	var deferred = {};
	new Promise( _resolve, _reject ) {
		deferred.resolve = _resolve;
		deferred.reject = _reject;
	}
	return deferred;
}

function toHexString( num ){
	return '0x' + num.toString(16);
}

module.exports = Omega2;
