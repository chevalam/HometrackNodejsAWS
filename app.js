// Include the cluster module
var cluster = require('cluster');

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for terminating workers
    cluster.on('exit', function (worker) {

        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });

// Code to run if we're in a worker process
} else {
    var AWS = require('aws-sdk');
    var express = require('express');
    var bodyParser = require('body-parser');

    AWS.config.region = process.env.REGION

    var sns = new AWS.SNS();
    var ddb = new AWS.DynamoDB();

    var ddbTable =  process.env.STARTUP_SIGNUP_TABLE;
    var snsTopic =  process.env.NEW_SIGNUP_TOPIC;
    var app = express();

    app.set('view engine', 'ejs');
    app.set('views', __dirname + '/views');

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(function (req, res, next) {
     next();
    });

    // app.use(cors());

    app.get("/ping", function (req, res) {
        res.writeHead(200, {"Content-Type": "text/json"});
        res.end();
    });

    app.get("/", function (req, res) {
        res.writeHead(200, {"Content-Type": "text/json"});
        res.end();
    });

    app.post('/signup', function(req, res) {
        var item = {
            'email': {'S': req.body.email},
            'name': {'S': req.body.name},
            'preview': {'S': req.body.previewAccess},
            'theme': {'S': req.body.theme}
        };

        ddb.putItem({
            'TableName': ddbTable,
            'Item': item,
            'Expected': { email: { Exists: false } }
        }, function(err, data) {
            if (err) {
                var returnStatus = 500;

                if (err.code === 'ConditionalCheckFailedException') {
                    returnStatus = 409;
                }

                res.status(returnStatus).end();
                console.log('DDB Error: ' + err);
            } else {
                sns.publish({
                    'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email
                                        + "\r\nPreviewAccess: " + req.body.previewAccess
                                        + "\r\nTheme: " + req.body.theme,
                    'Subject': 'New user sign up!!!',
                    'TopicArn': snsTopic
                }, function(err, data) {
                    if (err) {
                        res.status(500).end();
                        console.log('SNS Error: ' + err);
                    } else {
                        res.status(201).end();
                    }
                });
            }
        });
    });

    app.post("/", function (req, res) {
    try {
     if(req.body.payload) {
        if (Array.isArray(req.body.payload)) {
         var results = [];
         var resultaddressTerms = req.body.payload.filter(function(indvaddress) {
               return (indvaddress.type === 'htv' && indvaddress.workflow === 'completed');
         });
        resultaddressTerms.map((indvaddress) => {
        var concatenatedAddress = indvaddress.address.buildingNumber+"  "+indvaddress.address.street+" "+indvaddress.address.suburb+" "+indvaddress.address.state+" "+indvaddress.address.postcode;
        results.push({
          concataddress: concatenatedAddress,
          type: 'htv',
          workflow: 'completed',
       });
       });
       res.json(results);
       } else {
        res.writeHead(400,{"ContentType":"text/html"});
        res.end("Incorrect format: JSON payload is not array");
       }
    } else {
       res.writeHead(400,{"ContentType":"text/html"});
       res.end("Incorrect format: JSON missing payload key");
          }
     } catch (e) {
       console.error(e);
       res.writeHead(400,{"ContentType":"text/html"});
       res.end("Could not decode request: JSON parsing failed");
          }
    });
    var port = process.env.PORT || 3000;

    var server = app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });
}
