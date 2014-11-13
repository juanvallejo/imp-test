
var fs 		= require('fs');
var http 	= require('http');
var https 	= require('https');

/**
 * define stdin variables and settings used in the command line
 * interface part of the program, as well as global flags and 
 * varying settings used in the general application.
**/
var useWebInterface = false;										// tells program if accepting user input from web or cli interface
var server 			= null;											// holds http server object when initialized
var timeout 		= null;											// holds timeout object; allows it to be cleared when necessary
var host 			= 'agent.electricimp.com';						// host of server to send response in GET format to
var stdin 			= process.stdin;								// grabs all keyboard input
var data 			= '';											// stores chunk data returned from server as response
var value			= '';											// buffer containing current input entered into command line on enter
var buffer 			= '';											// buffer containing individual input entered into command line
var ready 			= false;										// Specifies whether value 'buffer' is ready to be parsed. Also
																	// used by spreadsheet parser function to indicate contents of file
																	// have been read and have been added to the database object

// set stdinp to treat all keyboard input as 'raw' input
stdin.setRawMode(true);

// set character encoding for keyboard input
process.stdin.setEncoding('utf8');

/**
 * listens for data input from keyboard
 *
 * @event data
**/
stdin.on('data', function(key) {
	// if keyboard input is Ctrl-c
	if(key =='\3') {
		process.exit();
	} else if(key == '\r') {
		//start a new line in the console
		console.log('');
		// if program is ready to parse input
		if(ready) {
			if(useWebInterface) {
				console.log('[WEB] ' + key);
			} else {
				console.log('[CLI] ' + key);
			}
		} else {
			// parses series of keys before a line break
			var command = buffer.split('/');

			if(command[1] == 'web') {
				// log web server started
				console.log('[IMP] Loading web server interface...');
				
				// tell program web interface is to be used
				useWebInterface = true;

				initWebServer();

				// tell program an interface has been chosen
				ready = true;
			} else if(command[1] == 'cli') {
				//log cli intrface started
				console.log('[IMP] Command line interface started.');

				// tell program an interface has been chosen
				ready = true;
			} else {
				// command does not exist
				console.log('[IMP] Command not recognized \'' + command[1] + '\'');
			}
		}
	} else {
		// add current key to char buffer to be parsed as a command
		buffer += key;

		if(ready) {
			if(!useWebInterface) {
				// if key does not equal the one already pressed, send messag to turn on LED
				if(value != key) {
					// set current value to key
					value = key;

					// turn on imp LED
					setImpLEDToOn();
				} else {
					// detect when key is no longer pressed
					clearTimeout(timeout);

					timeout = setTimeout(function() {
						// turn off the LED's light
						setImpLEDToOff();

						// reset current value key
						value = '';
					}, 50);
				}
			}
		} else {
			process.stdout.write(key);
		}
	}
});

/**
 * define util functions for program
 *
 */

function setImpLEDToOn() {
	console.log('turning on LED');
	clearTimeout(timeout);

	sendDataToImp(1);
}

function setImpLEDToOff() {
	console.log('turning off LED');

	// send off data to imp
	sendDataToImp(0);
}

function initWebServer() {
	// create an http web server
	server = http.createServer(function(request, response) {
		fs.readFile(__dirname + '/index.html', function(err, data) {
			if(err) {
				return console.log('There was an error reading the file \'index.html\' -> ' + err);
			}

			// advertise web interface loaded
			console.log('[WEB ]web interface loaded for address -> ' + request.connection.remoteAddress);

			// write headers and send file data
			response.writeHead({'Content-type' : 'text/html'});
			response.end(data);
		});
	});

	server.listen(8000);
}

/**
 * Sends an http request to imp-board server with a command
 * as a GET parameter
 *
 * @param command {String} of 'data' to send to board
**/
function sendDataToImp(command) {
	//send request to imp
	var request = https.request({
		host : host,
		method : 'GET',
		path : '/FlA7isVKL8K-?led=' + command
	}, function(response) {
		// set char encoding
		response.setEncoding('utf-8');

		// listen for incoming chunks of data
		response.on('data', function(chunk) {
			data += chunk;
		});

		// once all response packets have fully arrived
		response.on('end', function() {
			console.log('[SERVER] ' + data);

			// reset chunk buffer
			data = '';
		});
	});

	// listen for errors from server
	request.on('error', function(error) {
		console.log('[SERVER] ' + error.message);
	});

	// finalize our request
	request.end();
}

(function main() {
	// ask for specific input to start interface module
	console.log('Electric Imp Interface: Enter /web or /cli to choose an interface module.');
})();