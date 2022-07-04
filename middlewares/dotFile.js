module.exports = function (req, res, next) {
  var file = req.url.split('/').pop();
  if (file.startsWith('.')) {
    res.sendStatus(404);
    return
  }
  next()
}