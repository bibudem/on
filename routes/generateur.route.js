const { Router } = require('express')

const getModel = require('../models/generateur.model')

const router = Router();

router.get('/*', async function (req, res, next) {
  if (req.method === "GET") {
    res.header('Access-Control-Allow-Origin', '*');
//    return next();
  }
  const model = await getModel(req.url)
  if (model) {
    res.send(model)
  } else {
    res.sendStatus(404)
  }
});

module.exports = router