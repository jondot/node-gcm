/*!
 * node-gcm
 * Copyright(c) 2012 Marcus Farkas <marcus.farkas@spaceteam.at>
 * MIT Licensed
 */

var Constants = require('./constants');
var Message = require('./message');
var Result = require('./result');
var MulitcastResult = require('./multicastresult');

var https = require('https');
var timer = require('timers');

exports = module.exports = Sender;

function Sender (key) {
	this.key = key;
};

Sender.prototype.send = function(message, registrationId, retries, callback) {
	
	var attempt = 1;
	var backoff = Constants.BACKOFF_INITIAL_DELAY;
	
	var tryAgain;
	if(registrationId.length === 1) {

		this.sendNoRetry(message, registrationId, function lambda (result) {
			
			if(result === undefined) {
				if(attempt < retries) {
					var sleepTime = backoff * 2 * attempt;
					if (sleepTime > Constants.MAX_BACKOFF_DELAY)
						sleepTime = Constants.MAX_BACKOFF_DELAY;
					timer.setTimeout(function () {
							sendNoRetryMethod(message, registrationId, lambda);
					},sleepTime);
				}
				else {
					console.log('Could not send message after ' + retries + ' attempts');
					callback(null, result);
					} 
				attempt++;
			}
			else callback(null, result);
		});
	}
	else if (registrationId.length > 1) {
		this.sendNoRetry(message, registrationId, function lambda (err, result) {

				if(attempt < retries) {
					var sleepTime = backoff * 2 * attempt;
					if (sleepTime > Constants.MAX_BACKOFF_DELAY)
						sleepTime = Constants.MAX_BACKOFF_DELAY;
					
					var unsentRegIds = [];

					for (var i = 0; i < registrationId.length;i++) {
						if (result.results[i].error === 'Unavailable')
							unsentRegIds.push(registrationId[i]); 
					}

					registrationId = unsentRegIds;
					if(registrationId.length !== 0) {
						timer.setTimeout(function () {
							sendNoRetryMethod(message, registrationId, lambda);
						},sleepTime);
						attempt++;
					}
					else callback(null, result);	
				}
				else {
					console.log('Could not send message to all devices after ' + retries + ' attempts');
					callback(null, result);
				} 
		});
	}

	else console.log('No RegistrationIds given!');
};

var sendNoRetryMethod = Sender.prototype.sendNoRetry = function(message, registrationIds, callback) {
	var body = {}, result = new Result();

	body[Constants.JSON_REGISTRATION_IDS] = registrationIds;

	if (message.delayWhileIdle !== undefined) {
		body[Constants.PARAM_DELAY_WHILE_IDLE] = message.delayWhileIdle;
	}
	if (message.collapseKey !== undefined) {
		body[Constants.PARAM_COLLAPSE_KEY] = message.collapseKey;
	}
	if (message.hasData) {
		body[Constants.PARAM_PAYLOAD_KEY] = message.data;
	}

	var requestBody = JSON.stringify(body);

	var post_options = {
      	host: Constants.GCM_SEND_ENDPOINT,
      	port: '443',
      	path: Constants.GCM_SEND_ENDPATH,
      	method: 'POST',
      	headers: {
          	'Content-Type' : 'application/json',
          	'Content-length' : requestBody.length,
          	'Authorization' : 'key=' + this.key
      	}
  	};

  	var post_req = https.request(post_options, function(res) {
    	res.setEncoding('utf-8');
    	var statusCode = res.statusCode;

    	var buf = '';
    	
    	res.on('data', function (data) {
      		buf += data;
    	});
    
    	res.on('end', function () {
      		
      		if (statusCode === 503) {
        		return callback("unavailable", null);
      		}
          else if(statusCode == 401){
            return callback("unauthorized", null);
          }
          else if(statusCode == 500){
            return callback("internal_error", null);
          }
      		else if (statusCode !== 200) {
        		return callback("invalid_request", null);
      		}

      		var data = JSON.parse(buf);

      		callback(null, data);
    	});
	});

	post_req.on('error', function(e) {
		console.log("Exception during GCM request: " + e);
		callback("request error", null);
	});

  	post_req.write(requestBody);
  	post_req.end();
};
