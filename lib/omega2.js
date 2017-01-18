var CP = require( 'child_process' );
var Emitter = require( 'events' ).EventEmitter;
// var i2c = require( 'i2c-bus' );
var tick = process.setImmediate || process.nextTick;

var modes = Object.freeze( { INPUT: 0, OUTPUT: 1, ANALOG: 2, PWM: 3, SERVO: 4 } );
var pinModes = [
	{
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}, {
		modes: [ 0, 1 ]
	}
];

var boards = [ ];
var _i2cBus;
var _i2cDelay; // delay before each i2c read in milliseconds

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

		if ( typeof pin.analogChannel !== 'undefined' ) {
			p.analogChannel = pin.analogChannel;
		}

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
			CP.spawn( 'fast-gpio', [ 'set-output', pin ] );
			this.pins[pinIndex].mode = modes.OUTPUT;
			this.pins[pinIndex].isPwm = false;
			break;

		case modes.INPUT:
			CP.spawn( 'fast-gpio', [ 'set-input', pin ] );
			this.pins[pinIndex].mode = modes.INPUT;
			this.pins[pinIndex].isPwm = false;
			break;

		case 2:
			break;

		case modes.PWM:
			this.pins[pinIndex].mode = modes.PWM;
			this.pins[pinIndex].isPwm = true;
			break;

		case 4:
			break;
	}

	return this;
};

Omega2.prototype.analogRead = function( pin, handler ) {
	console.error( 'Omega2 doesn\'t support analog read' );
	return this;
};

Omega2.prototype.analogWrite = function( pin, value, dutycycle ) {
	if ( this.pins[pin].mode !== this.MODES.PWM ) {
		this.pinMode( pin, this.MODES.PWM );
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

	var cp = CP.spawn( 'fast-gpio', [ 'read', pin ] );
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
	CP.on( 'exit', function() {
		handler( {} );
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

Omega2.prototype.servoWrite = function( pin, value, frequency ) {
	console.error( 'Omega2 doesn\'t support servo mode' );

	return this;
};

Omega2.prototype.i2cConfig = function( options ) {
	var delay;

	if ( typeof options === 'number' ) {
		delay = options;
	} else {
		if ( typeof options === 'object' && options !== null ) {
			delay = options.delay;
		}
	}

	delay = delay || 0;

	if ( _i2cBus === undefined ) {
		_i2cBus = i2c.openSync( 1 );
		_i2cDelay = delay;
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

	buffer = new Buffer([ cmdRegOrData ].concat( inBytes ));

	// Only write if bytes provided
	if ( buffer.length ) {
		_i2cBus.i2cWriteSync( address, buffer.length, buffer );
	}

	return this;
};

Omega2.prototype.i2cWriteReg = function( address, register, value ) {
	this.i2cConfig( );

	_i2cBus.writeByteSync( address, register, value );

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

	data = new Buffer( bytesToRead );

	callback = typeof callback === 'function'
		? callback
		: function( ) {};

	event += register !== null
		? register
		: 0;

	setTimeout( function read( ) {
		var afterRead = function( err, bytesRead, buffer ) {
			if ( err ) {
				return this.emit( 'error', err );
			}

			// Convert buffer to Array before emit
			this.emit(event, [ ].slice.call( buffer ));

			if ( continuous ) {
				setTimeout( read.bind( this ), _i2cDelay );
			}
		}.bind( this );

		this.once( event, callback );

		if ( register !== null ) {
			_i2cBus.readI2cBlock( address, register, bytesToRead, data, afterRead );
		} else {
			_i2cBus.i2cRead( address, bytesToRead, data, afterRead );
		}
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

// Necessary for Firmata.js compatibility.
Omega2.prototype.sendI2CConfig = Omega2.prototype.i2cConfig;
Omega2.prototype.sendI2CReadRequest = Omega2.prototype.i2cReadOnce;
Omega2.prototype.sendI2CWriteRequest = Omega2.prototype.i2cWrite;

// Not Supported
[
	'pulseIn',
		'pulseOut',
		'queryPinState',
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
		'stepperConfig',
		'stepperStep'
	].forEach( function( method ) {
	Omega2.prototype[method] = function( ) {
		throw method + ' is not yet implemented.';
	};

});

module.exports = Omega2;
