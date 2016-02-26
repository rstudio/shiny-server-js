var pinkySwear = require("pinkyswear");

exports.addPathParams = function(url, params) {
  var pathFragment = "";
  for (var key in params) {
    if (params.hasOwnProperty(key)) {
      if (!/^\w*$/.test(key) || !/^\w*$/.test(params[key])) {
        throw new Error("util.addPathParams doesn't implement escaping");
      }
      pathFragment += "/" + key + "=" + params[key];
    }
  }
  return url.replace(/\/?(\?|$)/, pathFragment + "$1");
};

exports.createNiceBackoffDelayFunc = function() {
  // delays, in seconds; recycle the last value as needed
  var niceBackoff = [0, 1, 2, 3, 5];
  var pos = -1;
  return function() {
    pos = Math.min(++pos, niceBackoff.length - 1);
    return niceBackoff[pos] * 1000;
  };
};

// Call a function that returns a promise one or more times, until
// it either returns successfully, or time expires. Use a configurable
// delay in between attempts.
exports.retryPromise_p = function(create_p, delayFunc, expiration) {
  var promise = exports.promise();

  var delay = delayFunc();
  // Don't let the delay exceed the remaining time til expiration.
  delay = Math.min(delay, expiration - Date.now());
  // But in no case should the delay be less than zero, either.
  delay = Math.max(0, delay);

  setTimeout(function() {
    create_p().then(
      function(value) {
        promise(true, [value]);
      },
      function(err) {
        if (Date.now() >= expiration) {
          promise(false, [err]);
        } else {
          // Recurse. pinkySwear doesn't give us a way to easily
          // resolve a promise with another promise, so we have to
          // do it manually.
          exports.retryPromise_p(create_p, delayFunc, expiration).then(
            function() { promise(true, arguments); },
            function() { promise(false, arguments); }
          ).done();
        }
      }
    ).done();
  }, delay);

  return promise;
};

exports.createEvent = function(type, props) {
  if (global.document) {
    return new Event(type, props);
  } else if (props) {
    props.type = type;
    return props;
  } else {
    return {type: type};
  }
};

function addDone(prom) {
  prom.done = function() {
    prom.then(null, function(err) {
      console.log("Unhandled promise error: " + err);
      console.log(err.stack);
    });
  };
  return prom;
}
exports.promise = function() {
  return pinkySwear(addDone);
};

exports.PauseConnection = PauseConnection;
function PauseConnection(conn) {
  this._conn = conn;
  this._paused = true;
  this._events = [];
  this._timeout = null;

  var self = this;
  ["onopen", "onmessage", "onerror", "onclose"].forEach(function(evt) {
    conn[evt] = function() {
      if (self._paused) {
        self._events.push({event: evt, args: arguments});
      } else {
        self[evt].apply(this, arguments);
      }
    };
  });
}

PauseConnection.prototype.resume = function() {
  var self = this;
  this._timeout = setTimeout(function() {
    while (self._events.length) {
      var e = self._events.shift();
      self[e.event].apply(self, e.args);
    }
    self._paused = false;
  }, 0);
};
PauseConnection.prototype.pause = function() {
  clearTimeout(this._timeout);
  this._paused = true;
}

PauseConnection.prototype.close = function() {
  this._conn.close.apply(this._conn, arguments);
}
PauseConnection.prototype.send = function() {
  this._conn.send.apply(this._conn, arguments);
}

Object.defineProperty(PauseConnection.prototype, "readyState", {
  get: function readyState() {
    return this._conn.readyState;
  }
});
Object.defineProperty(PauseConnection.prototype, "url", {
  get: function readyState() {
    return this._conn.url;
  }
});
Object.defineProperty(PauseConnection.prototype, "protocol", {
  get: function readyState() {
    return this._conn.protocol;
  }
});
Object.defineProperty(PauseConnection.prototype, "extensions", {
  get: function readyState() {
    return this._conn.extensions;
  }
});