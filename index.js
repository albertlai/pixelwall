var app = require('express')();
var server = require('http').createServer(app);
var cluster = require('cluster');
var io = require('socket.io').listen(server);
var ejs = require('ejs');

var RedisStore = require('socket.io/lib/stores/redis')
, redis  = require('socket.io/node_modules/redis')
, pub    = redis.createClient()
, sub    = redis.createClient()
, client = redis.createClient();

/*     n
     o o o
  m   o o
     o o o     
*/
var m = 14;
var n = 9;

io.set('store', new RedisStore({
    redisPub : pub, 
    redisSub : sub, 
    redisClient : client
}));

client.on('error', function (err) {
    console.log("Error " + err);
});

client.flushdb();

// Initialize
client.get('state', function (err, obj) {
    if (!obj) {
        var arr = [];
        var len = Math.ceil(m * n / 32);
        for (var i = 0; i < len; i++) {
            arr.push(0);
        }
        client.set('state', arr);
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
    server.listen(8080);

    var w = 5;
    var d_100 = (100 - w) / n;
    var d_010 = d_100 / Math.sqrt(3);
    var d_m = d_010 / 2;
    var d_n = d_100;    

    function get(req, res) {
        var render = function (err, initial_state) {
            var context = {
                m: m,
                n: n, 
                diameter: w,
                d_m: d_m,
                d_n: d_n,
                initial_state: initial_state
            };
            res.render('index.html', context);   
        }
        client.get('state', render);
    };   
    
    function map2(arr1, arr2, fn) {
        for (var i = 0; i < arr1.length; i++) {
            arr1[i] = fn(arr1[i], arr2[i]);
        }
    }

    function map(arr, fn) {
        for (var i = 0; i < arr.length; i++) {
            arr[i] = fn(arr[i]);
        }        
    }
    
    function accumulate(arr, fn) {
        var n = arr[0];
        if (arr.length > 1) {
            for (var i = 1; i < arr.length; i++) {
                n = fn(arr[i], n);
            }
        }
        return n;
    }

    function and(a, b) { return parseInt(a) & b; };
    function or(a, b) { return parseInt(a) | b; };
    
    function tap(data) {
        var light = accumulate(data, and) == 0;
        var process = function (err, state) {
            state = state.split(',');
            map2 (state, data, light ? or : and);        
            io.sockets.emit('update', state);
            client.set('state', state, redis.print);
        };        
        client.get('state', process);
    }

    app.get('/', get);   
    io.on('connection', function (socket) {
        socket.on('tap', tap);
    });
}