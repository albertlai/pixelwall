var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var cluster = require('cluster');
var pixelwall = require('./pixelwall');

var RedisStore = require('socket.io/lib/stores/redis');
var redis  = require('socket.io/node_modules/redis');
var pub    = redis.createClient();
var sub    = redis.createClient();
var client = redis.createClient();

client.on('error', function (err) {
    console.log("Redis Error " + err);
});
    
io.set('log level', 1);
// Setup redis
io.set('store', new RedisStore({
            redisPub : pub, 
            redisSub : sub, 
            redisClient : client
}));

// TODO: log to S3 and playback

if (cluster.isMaster) { 
    pixelwall.initialize(client);
    client.set('num_connections', 0);
    // Fork workers.
    var numCPUs = require('os').cpus().length;
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }    
    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });

} else {    
    console.log('forked');
    function get(req, res) {
        context = pixelwall.getContext();
        res.render('index.html', context);   
    };   
    app.engine('html', require('ejs').renderFile);
    app.use('/static', express.static( __dirname + '/static'));
    app.get('/', get);   
    
    var conn_count = 0;
    io.on('connection', pixelwall.onConnection(client, io, function(socket) {
            conn_count++;
            client.incr('num_connections');
            socket.on('disconnect', function(socket) {
                    client.decr('num_connections');
            });
                
    }));

    server.listen(8080);
}