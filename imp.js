/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file scanner.js
*
* @author juanvallejo
* @date 10/15/14
*
* Scanner application 'server'. Handles all data processing and i/o.
* Reads data from a local mysql database, builds an internal structure
* with it, and allows for easy manipulation of it. Outputs to .xlsx file.
*
* Note: @callback_params are parameters passed to a callback function
*
* Important: Requires the following dependencies / node.js packages:
*
*		- csv 	-> npm install fast-csv
* 		- excel -> npm install excel
* 		- mysql	-> npm install mysql
* 		- xlsx 	-> npm install xlsx-writer
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
 * define util functions for program
 */

/**
 * sends a request to imp agent with param
 * "?led=1" instructing led to turn on
 *
 * @event data
**/
function setImpLEDToOn() {
	console.log('turning on LED');
	clearTimeout(timeout);

	sendDataToImp(1);
}

/**
 * sends a request to imp agent with param
 * "?led=0" instructing led to turn off
 *
 * @event data
**/
function setImpLEDToOff() {
	console.log('turning off LED');

	// send off data to imp
	sendDataToImp(0);
}

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
		} else {
			// route request to path
			route((request.url == '/' ? '/index.html' : request.url), request, response);
		}
	});

	// have server listen on specific port
	server.listen(WEB_PORT);
}

/**
 * Sends an http request to imp-board server with passed command
 * as a GET parameter
 *
 * @param command {int} defining 'data' to send to board with param of 'led'
**/
function sendDataToImp(command) {
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