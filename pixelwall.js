// All the logic for getting / updating the pixel wall 
var fn = require('./static/fn');

/*      n
     o o o o
  m   o o o
     o o o o    
*/
var m = 17,  n = 3;
var STATE = 'pixelwall::state';

function getZeroedState() {
    var arr = [];
    var len = Math.ceil(m * n / 32);
    for (var i = 0; i < len; i++) {
        arr.push(0);
    }
    return arr;
}

// Initialize the database
function initialize(redisclient) {
    // Initialize
    redisclient.get(STATE, function (err, obj) {
        if (!obj) {        
            redisclient.set(STATE, getZeroedState());
        }
    });
}

// Setup the values for lattice coordinates (in miller indices)
// All units are in % of the total width of the lattice
var w = 16;
var d_10 = (100 - w) / (n-1);
var d_01 = d_10 / Math.sqrt(3);
var d_m = d_01 / 2;
var d_n = d_10;    
var height = m * d_m + w / 2;
// rescale to be % of height
d_m = d_m * 100 / height; 
var h = w * 100 / height; 

// Colors
var dim = "#A4A49F";
var light = "#FFD659";

function getContext() {
    var context = {
        initial_state: getZeroedState(),
        height: height,
        m: m,
        n: n, 
        w: w,
        h: h,
        d_m: d_m,
        d_n: d_n,
        dim: dim,
        light: light
    };
    return context;
};   

function getTap(redisclient, io) {    
    // Update the state with data from client. Data comes in with the form:
    //       0 | (1 << index) if we are lighting up a circle (eg 01000000)
    // or   
    //    ~ (0 | (1 << index)) if we are dimming a circle (eg 11111011)
    var tap = function (data) {
        console.log(new Date() + ': pixelwall-tap: ' + data);
        var light = fn.accumulate(data, fn.and) == 0;
        var process = function (err, state) {
            state = state.split(',');
            // If it is lighting up, we simply || with the state
            // If it is dimming, we simply && with the state
            state = fn.map(state, data, light ? fn.or : fn.and);        
            console.log(new Date() + ': pixelwall-state: ' + state);
            io.sockets.emit('pixelwall_update', state);
            redisclient.set(STATE, state);
        };
        redisclient.get(STATE, process);
    };
    return tap;
}

// Hook up the pixelwall_tap event as well as update the client with 
// the latest state on connection
function onConnection(redisclient, io, fn) {
    var tap = getTap(redisclient, io);
    var connection = function (socket) {
            socket.on('pixelwall_tap', tap);       
            redisclient.get(STATE, function(err, state) {
                    state = state.split(',');
                    socket.emit('pixelwall_update', state);
            });
            if (fn) {
                fn(socket);
            }
        };
    return connection;
}



exports.initialize = initialize;
exports.getContext = getContext;
exports.onConnection = onConnection;

