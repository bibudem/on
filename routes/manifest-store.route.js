const { Router } = require('express');
const fs = require('fs');
const { join } = require('path')
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const config = require('config')


// Create app
const app = Router();

/*
Route                         HTTP Verb Description
-------------------------------------------------------------------------------------------
/                GET       Get all manifests
/                POST      Create a manifest - returns manifest uri
/:manifestId    GET       Get manifest by id
/:manifestId    PUT       Update manifest with id
/:manifestId    DELETE    Delete manifest with id (currently not implemented)
-------------------------------------------------------------------------------------------
*/

// ## CORS middleware
// 
// see: http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
// app.use(express.methodOverride());

var allowCrossDomain = function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // intercept OPTIONS method
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  }
  else {
    next();
  }
};
app.use(allowCrossDomain);

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));

app.route('/')
  // list all manifets
  .get(function (req, res) {
    // look up manifest list on the file system
    var manifestFiles = fs.readdirSync(config.get("storeBaseDir"));

    var manifestUris = [];
    manifestFiles.map((manifestFilename, index) => {
      manifestUris.push({
        uri: config.get("storeURL") + "/" + manifestFilename
      })
    });

    // generate JSON list with manifest uris
    res.json({ manifests: manifestUris });
  })

  // create a manifest
  .post(function (req, res) {
    // create a unique id for the manifest
    var manifestId = uuidv4();

    // store the manifest on the file system
    fs.writeFileSync(join(config.get("storeBaseDir"), manifestId), JSON.stringify(req.body));

    // set the status code in the response
    res.status(201);

    // return the manifest uri
    res.json({
      uri: config.get("storeURL") + "/" + manifestId,
      location: config.get("storeURL") + "/" + manifestId,
      updateLocation: config.get("storeURL") + "/" + manifestId });
  });

app.route('/:manifestId')
  // get manifest with id
  .get(function (req, res) {
    // get the manifest from the file system
    var manifestData = fs.readFileSync(join(config.get("storeBaseDir"), req.params.manifestId), 'utf8');

    // return the manifest data
    res.json(JSON.parse(manifestData));
  })

  // update an existing manifest with id
  .put(function (req, res) {
    var manId = req.params.manifestId;
    var manifestPath = join(config.get("storeBaseDir"), manId);
    var statusCode = 200;

    // check the file system to determine whether the resource exists
    if (fs.existsSync(manifestPath)) {
      // overwrite the manifest data on the file system
      fs.writeFileSync(manifestPath, JSON.stringify(req.body));
    } else {
      statusCode = 404;
    }

    // set the status code in the response
    res.status(statusCode);
    res.json({
      uri: config.get("storeURL") + "/" + manId,
      location: config.get("storeURL") + "/" + manId,
      updateLocation: config.get("storeURL") + "/" + manId,
      message: 'Manifest successfully updated' });
  })

  // delete an existing manifest with id
  .delete(function (req, res) {
    // Note: this is currently not implemented - we need authentication for this
    res.json({ errorMessage: 'Deleting manifests is currently not supported' });
  });

module.exports = app;