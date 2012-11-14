// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2012 Google Inc. johnjbarton@google.com

(function(){

window.Querypoint = window.Querypoint || {};

function protect(expr) {
    return "eval(" + expr + ")"; // unwrapped by Querypoints
}

function unprotect(str) {
    return str.replace(/:\"eval\(([^\)]*)\)\"/,":$1");
}

Querypoint.IdentifierQuery = function(identifier) {
    this.identifier = identifier;
}

Querypoint.IdentifierQuery.prototype = {

  // A jsonable object inserted to create the tracepoint output
  tracepointMessage: function(traceLocationIndex) {
    return {
        tq: this.id,
        value: protect(this.identifier),  
        locationIndex: traceLocationIndex
    };
  },
  
  // augment the tracepoint output with additional (static) data
  tracepoint: function(tracepointData) {
      // probably want to do this in a formatter object
      var traceLocation = this.traceLocations[tracepointData.locationIndex];
      tracepointData.line = traceLocation.start.line;
      tracepointData.column = traceLocation.start.column;
      tracepointData.name = traceLocation.start.source.name;
      
      tracepointData.tracequeryType = "Identifier";
      tracepointData.tracequery = this;
      return tracepointData;
  },
    
};

var getTreeNameForType = traceur.syntax.trees.getTreeNameForType;

Querypoint.ValueChangeQueryVisitor = {
  visitSome: function(tree) {
    var method = 'visit' + getTreeNameForType(tree.type);
    if (this.hasOwnProperty(method)) {
      return this[method].call(this, tree);
    }
  },
  visitMemberExpression: function(tree) {
    return tree.memberName;
  }
};

Querypoint.ValueChangeQuery = function(identifier, tree) {
  this.identifier = identifier;
  this.queryLocation = tree;
  this._transformer = new Querypoint.ValueChangeQueryTransformer(this.identifier);
}

Querypoint.ValueChangeQuery.ifAvailableFor = function(tree) {
  var identifier = Querypoint.ValueChangeQueryVisitor.visitSome(tree);
  if (identifier) {
    return new Querypoint.ValueChangeQuery(identifier, tree);
  }
}

Querypoint.ValueChangeQuery.prototype = {
  buttonName: function() {
    return 'lastChange';
  },
  toolTip: function() {
    return "Trace the changes to the current expression and report the last one";
  },
  
  activate: function() {
    console.log("query activated", this);
    // mark tree as qp
    this.queryLocation.location.query = this;
  },

  // Add tracing code to the parse tree. Record the traces onto __qp.propertyChanges.<identifier>
  // 
  transformParseTree: function(tree) {

    return this._transformer.transformAny(tree);
  },

  runtimeSource: function() {
    var tree = this._transformer.runtimeInitializationStatements();
    return traceur.outputgeneration.TreeWriter.write(tree);
  },

  // Pull trace results out of the page for this querypoint
  extractTracepoints: function(onTracepoint) {
    function onEval(result, isException) {
       if (!isException) {       
        onTracepoint(result)
      }
    }
    chrome.devtools.inspectedWindow.eval('window.__qp.extractTracepoint("propertyChanges","prop")', onEval);
  },
};

Querypoint.Querypoints = {
  ValueChangeQuery: Querypoint.ValueChangeQuery,

    _tracequeries: {
        _tqs: [],
        
        by: function(field) {
            var tqByField = {};
            this._tqs.forEach(function(tq){
                if (field in tq)
                  tqByField[tq[field]] = tq;
            });
            return tqByField;
        },
        
        byIdentifier: function() {
            return this.by('identifier');
        },
        
        byId: function() {
            return this.by('id');
        },

        getTraceSource: function(previousLocation, currentLocation) {
          // todo sort tqs
          var previous = previousLocation ? previousLocation.start.offset : 0;
          var current = currentLocation.start.offset;
          var message;
          this._tqs.forEach(function(tq, tqIndex) {
            return tq.traceLocations.forEach(function(traceLocation, locationIndex) {
              var offset = traceLocation.start.offset;
              console.log(previous + " <= " + offset + " < " + current);
              if ( (previous <= offset) &&  (offset < current) ) {
                message = Querypoints.formatTraceMessage(tq.tracepointMessage(locationIndex));
                return true;
              } 
            });
          });
          return message;
        },

        add: function(tq) {
            tq.traceLocations = [];
            tq.tracepoints = [];
            tq.id = this._tqs.length;
            this._tqs.push(tq);
        },

        clear: function() {
            this._tqs = [];
        }
    },

    // Query Definitions

    appendQuery: function(query, tree) {
      this._tracequeries.add(query);
    },
    // Query Acccess

    tracequeries: function() {
        return this._tracequeries._tqs;
    },

    // Query Actions
    
    setConsole: function(qpConsole) {
        this.qpConsole = qpConsole;
    },

    // Different deployments may need different ways to transport the tracepoint
    // result back to the querypoint storage. 
    
    // Each trace is passed
    // through this function before injecting in the syntax tree. 
    
    formatTraceMessage: function(traceJSONable) {
      var json = JSON.stringify(traceJSONable);
      // expressions we want to evaluate at the tracepoint are escaped by wrapping 'eval()' around them.
      // convert these back. 
      return "__qp_tps.push(" + unprotect(json) + ");";
    },
    
    // The stream of tracepoint results 
    
    tracepoints: function() {
        var tqById = this._tracequeries.byId();
        return __qp_tps.map(function (tp) {
            tq = tqById[tp.tq];
            console.log(tp);
            return tq.tracepoint(tp);
        });
    },
    
    // The querypoint results
    querypoints: function() {
        console.log("TODO: analyze the tracepoints");
    },
    
    initialize: function() {
      this._tracequeries.clear();
      __qp_tps = [];
      return this;
    },
};

}());