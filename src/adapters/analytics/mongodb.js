/**
 * ga.js - analytics adapter for google analytics
 */
import { ajax } from 'src/ajax';
var events = require('./../../events');
var utils = require('./../../utils');
var CONSTANTS = require('./../../constants.json');

var BID_REQUESTED = CONSTANTS.EVENTS.BID_REQUESTED;
var BID_TIMEOUT = CONSTANTS.EVENTS.BID_TIMEOUT;
var BID_RESPONSE = CONSTANTS.EVENTS.BID_RESPONSE;
var BID_WON = CONSTANTS.EVENTS.BID_WON;

var _analyticsQueue = [];
var _mongodGlobal = null;
var _enableCheck = true;
var _category = 'Prebid.js Bids';
var _eventCount = 0;
var _enableDistribution = false;

/**
 * This will enable sending data to MongoDB. Only call once, or duplicate data will be sent!
 * @param  {object} provider use to set URL (if changed);
 * @param  {object} options use to configure adapter;
 * @return {[type]}    [description]
 */
exports.enableAnalytics = function ({ provider, options }) {
  _mongodGlobal = options.global || 'http://localhost:3000';
  _mongodGlobal += '/prebid_analytics';
  
  if (options && typeof options.enableDistribution !== 'undefined') {
    _enableDistribution = options.enableDistribution;
  }

  var bid = null;

  //first send all events fired before enableAnalytics called

  var existingEvents = events.getEvents();
  utils._each(existingEvents, function (eventObj) {
    var args = eventObj.args;
    if (!eventObj) {
      return;
    }

    if (eventObj.eventType === BID_REQUESTED) {
      bid = args;
      sendBidRequestToMongod(bid);
    } else if (eventObj.eventType === BID_RESPONSE) {
      //bid is 2nd args
      bid = args;
      sendBidResponseToMongod(bid);

    } else if (eventObj.eventType === BID_TIMEOUT) {
      const bidderArray = args;
      sendBidTimeoutsToMongod(bidderArray);
    } else if (eventObj.eventType === BID_WON) {
      bid = args;
      sendBidWonToMongod(bid);
    }
  });

  //Next register event listeners to send data immediately

  //bidRequests
  events.on(BID_REQUESTED, function (bidRequestObj) {
    sendBidRequestToMongod(bidRequestObj);
  });

  //bidResponses
  events.on(BID_RESPONSE, function (bid) {
    sendBidResponseToMongod(bid);
  });

  //bidTimeouts
  events.on(BID_TIMEOUT, function (bidderArray) {
    sendBidTimeoutsToMongod(bidderArray);
  });

  //wins
  events.on(BID_WON, function (bid) {
    sendBidWonToMongod(bid);
  });

  // finally set this function to return log message, prevents multiple adapter listeners
  this.enableAnalytics = function _enable() {
    return utils.logMessage(`Analytics adapter already enabled, unnecessary call to \`enableAnalytics\`.`);
  };
};


function checkAnalytics() {
  if (_enableCheck) {

    for (var i = 0; i < _analyticsQueue.length; i++) {
      _analyticsQueue[i].call();
    }

    //override push to execute the command immediately from now on
    _analyticsQueue.push = function (fn) {
      fn.call();
    };

    //turn check into NOOP
    _enableCheck = false;
  }

  utils.logMessage('event count sent to MongoDB: ' + _eventCount);
}

function convertToCents(dollars) {
  if (dollars) {
    return Math.floor(dollars * 100);
  }

  return 0;
}

function getLoadTimeDistribution(time) {
  var distribution;
  if (time >= 0 && time < 200) {
    distribution = '0-200ms';
  } else if (time >= 200 && time < 300) {
    distribution = '0200-300ms';
  } else if (time >= 300 && time < 400) {
    distribution = '0300-400ms';
  } else if (time >= 400 && time < 500) {
    distribution = '0400-500ms';
  } else if (time >= 500 && time < 600) {
    distribution = '0500-600ms';
  } else if (time >= 600 && time < 800) {
    distribution = '0600-800ms';
  } else if (time >= 800 && time < 1000) {
    distribution = '0800-1000ms';
  } else if (time >= 1000 && time < 1200) {
    distribution = '1000-1200ms';
  } else if (time >= 1200 && time < 1500) {
    distribution = '1200-1500ms';
  } else if (time >= 1500 && time < 2000) {
    distribution = '1500-2000ms';
  } else if (time >= 2000) {
    distribution = '2000ms above';
  }

  return distribution;
}

function getCpmDistribution(cpm) {
  var distribution;
  if (cpm >= 0 && cpm < 0.5) {
    distribution = '$0-0.5';
  } else if (cpm >= 0.5 && cpm < 1) {
    distribution = '$0.5-1';
  } else if (cpm >= 1 && cpm < 1.5) {
    distribution = '$1-1.5';
  } else if (cpm >= 1.5 && cpm < 2) {
    distribution = '$1.5-2';
  } else if (cpm >= 2 && cpm < 2.5) {
    distribution = '$2-2.5';
  } else if (cpm >= 2.5 && cpm < 3) {
    distribution = '$2.5-3';
  } else if (cpm >= 3 && cpm < 4) {
    distribution = '$3-4';
  } else if (cpm >= 4 && cpm < 6) {
    distribution = '$4-6';
  } else if (cpm >= 6 && cpm < 8) {
    distribution = '$6-8';
  } else if (cpm >= 8) {
    distribution = '$8 above';
  }

  return distribution;
}

function sendBidRequestToMongod(bid) {
  if (bid && bid.bidderCode) { utils.logMessage('sendBidRequestToMongod ' + JSON.stringify(bid));
    _analyticsQueue.push(function () {
      _eventCount++;
      ajax(_mongodGlobal, '', 'category='+_category+'&action=Requests&ad=&label='+bid.bidderCode+'&value=1&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});      
    });
  }

  //check the queue
  checkAnalytics();
}

function sendBidResponseToMongod(bid) {

  if (bid && bid.bidderCode) {utils.logMessage('sendBidResponseToMongod ' + JSON.stringify(bid));
    _analyticsQueue.push(function () {
      var cpmCents = convertToCents(bid.cpm);
      var bidder = bid.bidderCode;
      if (typeof bid.timeToRespond !== 'undefined' && _enableDistribution) {
        _eventCount++;
        var dis = getLoadTimeDistribution(bid.timeToRespond);
        ajax(_mongodGlobal, '', 'category='+_category+' Load Time Distribution&action='+dis+'&ad='+bid.adUnitCode+'&label='+bidder+'&value=1&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});        
      }

      if (bid.cpm > 0) {
        _eventCount = _eventCount + 2;
        var cpmDis = getCpmDistribution(bid.cpm);
        if (_enableDistribution) {
          _eventCount++;
          ajax(_mongodGlobal, '','category='+_category+' CPM Distribution&action='+cpmDis+'&ad='+bid.adUnitCode+'&label='+bidder+'&value=1&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});          
        }

        ajax(_mongodGlobal, '', 'category='+_category+'&action=Bids&ad='+bid.adUnitCode+'&label='+bidder+'&value='+cpmCents+'&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});
        ajax(_mongodGlobal, '', 'category='+_category+'&action=Bid Load Time&ad='+bid.adUnitCode+'&label='+bidder+'&value='+bid.timeToRespond+'&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});
      }
    });
  }

  //check the queue
  checkAnalytics();
}

function sendBidTimeoutsToMongod(timedOutBidders) {

  _analyticsQueue.push(function () {
    utils._each(timedOutBidders, function (bidderCode) {
      _eventCount++;
      ajax(_mongodGlobal, '', 'category='+_category+'&action=Timeouts&ad=&label='+bidderCode+'&value=&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});
    });
  });

  checkAnalytics();
}

function sendBidWonToMongod(bid) {utils.logMessage('sendBidWonToMongod ' + JSON.stringify(bid));
  var cpmCents = convertToCents(bid.cpm);
  _analyticsQueue.push(function () {
    _eventCount++;
    ajax(_mongodGlobal, '', 'category='+_category+'&action=Wins&ad='+bid.adUnitCode+'&label='+bid.bidderCode+'&value='+cpmCents+'&date='+new Date().getTime(), {method: 'POST', contentType: 'application/x-www-form-urlencoded'});
  });

  checkAnalytics();
}
