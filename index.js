var express = require('express');
var app = express();
var server = require('http').createServer(app);
var cluster = require('cluster');
var io = require('socket.io').listen(server);
var ejs = require('ejs');
var fn = require('./static/fn');

var RedisStore = require('socket.io/lib/stores/redis')
, redis  = require('socket.io/node_modules/redis')
, pub    = redis.createClient()
, sub    = redis.createClient()
, client = redis.createClient();

/*      n
     o o o o
  m   o o o
     o o o o    
*/
var m = 24,  n = 12;

// Setup redis
io.set('store', new RedisStore({
            redisPub : pub, 
            redisSub : sub, 
            redisClient : client
}));

client.on('error', function (err) {
    console.log("Error " + err);
});

function getZeroedState() {
    var arr = [];
    var len = Math.ceil(m * n / 32);
    for (var i = 0; i < len; i++) {
        arr.push(0);
    }
    return arr;
}
    

if (cluster.isMaster) {
    // Initialize
    client.flushdb();
    client.get('state', function (err, obj) {
       if (!obj) {        
           client.set('state', getZeroedState());
       }
    });
    
    // Fork workers.
    var numCPUs = require('os').cpus().length;
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });

} else {    
    app.engine('html', ejs.renderFile);
    console.log('forked');

    // Serve static file
    app.use('/static', express.static( __dirname + '/static'));
    server.listen(8080);

    // Setup the values for lattice coordinates (in miller indices)
    // All units are in % of the total width of the lattice
    var w = 4;
    var d_10 = (100 - w) / (n-1);
    var d_01 = d_10 / Math.sqrt(3);
    var d_m = d_01 / 2;
    var d_n = d_10;    
    var height = m * d_m + w / 2;
    var h = w * 100 / height;

    // Colors
    var dim = "#A4A49F";
    var light = "#FFD659";

    function get(req, res) {
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
        res.render('index.html', context);   
    };   

    // Update the state with data from client. Data comes in with the form:
    //       0 | (1 << index) if we are lighting up a circle (eg 01000000)
    // or   
    //    ~ (0 | (1 << index)) if we are dimming a circle (eg 11111011)
    function tap(data) {
        var light = fn.accumulate(data, fn.and) == 0;
        var process = function (err, state) {
            state = state.split(',');
            // If it is lighting up, we simply || with the state
            // If it is dimming, we simply && with the state
            state = fn.map(state, data, light ? fn.or : fn.and);        
            io.sockets.emit('update', state);
            client.set('state', state);
        };        
        client.get('state', process);
    }

    app.get('/', get);   
    io.on('connection', function (socket) {
        socket.on('tap', tap);       
        client.get('state', function(err, state) {
            state = state.split(',');
            socket.emit('update', state);
        });
    });
}