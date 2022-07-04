const fs = require('fs')
const { join } = require('path')
const config = require('config')

module.exports.fileExists = function (filename) {
  return new Promise((resolve, reject) => {
    // check if file exists
    fs.stat(relative(filename), (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });
}
function relative(...paths) {
  const finalPath = paths.reduce((a, b) => join(a, b), config.get('baseDir'));

  return finalPath;
}
module.exports.relative = relative