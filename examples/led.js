var five = require( 'johnny-five' );
var Omega2 = require( './omega2' );

var board = new five.Board({io: new Omega2( )});

board.on( 'ready', function( ) {
	var led = new five.Led( 0 );
	led.blink( 250 );
});
