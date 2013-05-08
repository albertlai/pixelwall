var app = require('express')();
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

// Initialize
client.flushdb();
client.get('state', function (err, obj) {
    if (!obj) {        
        client.set('state', getZeroedState());
    }
});

if (cluster.isMaster) {
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
    io.static.add('/static/fn.js', {
	    mime: {
		type: 'application/javascript',
                encoding: 'utf8',
                gzip: true
            },
            file: __dirname + '/static/fn.js'
    }); 

    server.listen(8080);

    // Setup the values for lattice coordinates (in miller indices)
    var w = 4;
    var d_10 = (100 - w) / n;
    var d_01 = d_10 / Math.sqrt(3);
    var d_m = d_01 / 2;
    var d_n = d_10;    

    function get(req, res) {
        var context = {
            m: m,
            n: n, 
            diameter: w,
            d_m: d_m,
            d_n: d_n,
            initial_state: getZeroedState()
        };
        res.render('index.html', context);   
    };   

    // Update the state with data from client. Data comes in with the form:
    //    0 | (1 << index) if we are lighting up a circle (eg 01000000)
    // or   
    //    ~ (0 | 1 << index) if we are dimming a circle (eg 11111011)
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