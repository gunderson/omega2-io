# Omega2-IO
Onion Omega2 IO Plugin for [Johnny-Five](http://johnny-five.io)

Heavily based on [BeagleBone-IO](https://github.com/julianduque/beaglebone-io) by [Julian Duque](https://github.com/julianduque)

This [Johnny-Five](http://johnny-five.io) io adapter is built for running on [Onion Omega2 and Omega2+](http://onion.io) IoT boards.

## Install

**Requisites**

```
$ opkg update && opkg install nodejs npm
```

**Node Packages**
```
$ npm install --save johnny-five omega2-io
```


## Usage

``` js
var Omega2 = require('omega2-io');
var board = new Omega2();

board.on('ready', function () {
  this.digitalWrite(13, this.HIGH);
  this.digitalRead(13, handler);
  // analogWrite(pin, Freq_in_Hz, duty_cycle)
  this.analogWrite(15, 2048, 0.5);
});

```

With Johnny-Five
``` js
var five = require('johnny-five');
var Omega2 = require('omega2-io');

var board = new five.Board({
  io: new Omega2()
});

board.on('ready', function () {
  var led = new five.Led();
  led.blink();

  this.repl.inject({ led: led });
});
```

## The MIT License (MIT)

Copyright (c) Patrick Gunderson 2017

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
