/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file imp.js
*
* @author juanvallejo, jlpeyton
* @date 11/13/14
*
* Local application 'server'. Handles all data processing and i/o.
* Relays data from command line / web interface to Electric Imp Cloud Agent
*/

/**
 * import required node packages
 */

var fs 				= require('fs');
var http 			= require('http');
var https 			= require('https');
var readline		= require('readline');

/**
 * define variables and settings used by the program's
 * interface modules. Also contains global flags and 
 * varying settings used by the server.
**/
var useWebInterface = false;										// tells program if accepting user input from web or cli interface
var server 			= null;											// holds http server object when initialized
var timeout 		= null;											// holds timeout object; allows it to be cleared when necessary
var data 			= '';											// stores chunk data returned from server as response
var value			= '';											// buffer containing current input entered into command line on enter
var buffer 			= '';											// buffer containing individual input entered into command line
var ready 			= false;										// Specifies whether value 'buffer' is ready to be parsed. Also
																	// used by spreadsheet parser function to indicate contents of file
																	// have been read and have been added to the database object

/**
 * define constants used by program interface modules
 */

WEB_PORT 			= 8000;											// port at which server listens for client connections
WEB_HOST			= 'agent.electricimp.com';						// host of server to send response in GET format to

// set stdinp to treat all keyboard input as 'raw' input
process.stdin.setRawMode(true);

// set character encoding for keyboard input
process.stdin.setEncoding('utf8');

/**
 * listens for data input from keyboard
 *
 * @event data
**/
process.stdin.on('data', function(key) {
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
			if(!buffer) {
				return;
			}

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
				// reset value of buffer
				buffer = '';
			}
		}
	} else {
		// add current key to char buffer to be parsed as a command
		buffer += key;

		// if an interface has been chosen, and user is using command line interface, listen for repeated same-key input
		// if it is the same, reset timeout designed to kill LED in order to keep it on, else, turn LED on. Once no keys are pressed
		// set timeout takes care of turning LED off
		if(ready) {
			if(!useWebInterface) {
				// if key does not equal the one already pressed, send messag to turn on LED
				if(value != key) {
					// set current value to key
					value = key;

					// turn on imp LED
					setImpLEDToOn();

					clearTimeout(timeout);

					// set individual keypress timeout
					timeout = setTimeout(function() {
						// turn off LED after a few millisconds of inactivity
						setImpLEDToOff();
					}, 720);
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
 * inits http function that creates web interface for interacting
 * with application @ address
 *
 * http://localhost:8000
 *
 * @event data
**/
function initWebServer() {
	// create routing for files and serve files
	function route(path, request, response) {
		// file extension header definitions
		var extensions = {
			'css' : 'text/css',
			'gif' : 'image/gif',
			'html' : 'text/html',
			'ico' : 'image/x-ico',
			'jpg' : 'image/jpeg',
			'jpeg' : 'image/jpeg',
			'json' : 'application/json',
			'js' : 'application/javascript',
			'png' : 'image/png',
			'txt' : 'text/plain'
		};

		// extract file extension from path
		var extension = path.split('.');
		extension = extension[extension.length-1];

		// read file from path
		fs.readFile(__dirname + path, function(err, file) {
			if(err) {
				// advertise error
				console.log('There was an error reading the file \'' + path + '\' -> ' + err);

				// send error response to client
				response.writeHead(404);
				return response.end("File Not Found.");
			}

			// advertise web interface loaded
			console.log('[WEB] web interface loaded for address -> ' + request.connection.remoteAddress);

			response.writeHead(200, {'Content-Type' : extensions[extension]});
			response.end(file);
		});
	};

	// create an http web server
	server = http.createServer(function(request, response) {
		//determine if request is a command
		if(request.url == '/command') {
			// advertise to console
			console.log('command detected');
			// init command buffer
			var commandBuffer = '';

			request.on('data', function(chunk) {
				commandBuffer += chunk;
			})

			request.on('end', function() {
				// define command from its buffer
				var command = commandBuffer.split('/');

				console.log('Received command: ' + command[2]);

				if(command[1] == 'value') {
					if(ready) {
						// send data to Imp module
						if(command[2] == '1') {
							// turn LED on and wait for response before setting program ready state to true
							setImpLEDToOn();
						} else if(command[2] == '0') {
							// turn LED on and wait for response before setting program ready state to true
							setImpLEDToOff();
						}
					} else {
						// advertise program is not ready for next request to be processed
						console.log('Unable to process request at this time');
					}
				} else {
					console.log('Command \'' + command[1] + '\' not yet implemented.');
				}

			});

			// send response back to client
			response.end('success');
		} else {
			// route request to file path
			route((request.url == '/' ? '/index.html' : request.url), request, response);
		}
	});

	// have server listen on specific port
	server.listen(WEB_PORT);
}

/**
 * define util functions for program
 */

/**
 * sends a request to imp agent with param
 * "?led=1" instructing led to turn on
 *
 * @param callback {Function} to call after response from server is received
**/
function setImpLEDToOn(callback) {
	console.log('turning on LED');

	// send on data to imp
	sendDataToImp(1, callback);
}

/**
 * sends a request to imp agent with param
 * "?led=0" instructing led to turn off
 *
 * @param callback {Function} to call after response from server is received
**/
function setImpLEDToOff(callback) {
	console.log('turning off LED');

	// send off data to imp
	sendDataToImp(0, callback);
}

/**
 * Sends an http request to imp-board server with passed command
 * as a GET parameter
 *
 * @param command {int} defining 'data' to send to board with param of 'led'
 * @param callback {Function} to call after response from server is received
**/
function sendDataToImp(command, callback) {
	//send request to imp
	var request = https.request({
		host : WEB_HOST,
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
			// advertise data chunks received
			console.log('[SERVER] ' + data);

			// reset chunk buffer
			data = '';

			// make sure callback is of type function and call it
			callback = callback || function() {};
			callback.call(this, data);
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