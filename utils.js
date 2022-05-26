/* Code utilitaire */

const config = require('config');
const path = require("path");
const fs = require("fs");



// Retourne true si un viewer IIIF peut faire quelque chose avec cet objet
module.exports.iiifViewable = function(f) {
    return this.isimage(f) || this.isvideo(f) || this.isaudio(f) || this.isPDF(f) || this.isDirectory(config.get("baseDir") + "/" + f);
}

// Retourne true si c'est un fichier PDF
module.exports.isPDF = function(f) {
    const ext = path.extname(f);
    if (ext == undefined || ext == "") return false;
    if (config.get("fileTypes")[ext] && config.get("fileTypes")[ext] == 'pdf') return true;
    return false;
}

// Retourne true si c'est une vidéo
module.exports.isvideo = function(f) {
    const ext = path.extname(f);
    if (ext == undefined || ext == "") return false;
    if (config.get("fileTypes")[ext] && config.get("fileTypes")[ext] == 'video') return true;
    return false;
}
  
// Retourne true si c'est un audio
module.exports.isaudio = function(f) {
    const ext = path.extname(f);
    if (ext == undefined || ext == "") return false;
    if (config.get("fileTypes")[ext] && config.get("fileTypes")[ext] == 'audio') return true;
    return false;
}

// Retourne true si c'est une image
module.exports.isimage = function(f) {
    const ext = path.extname(f);
    if (ext == undefined || ext == "") return false;
    if (config.get("fileTypes")[ext] && config.get("fileTypes")[ext] == 'image') return true;
    return false;
}

// Retourne true si c'est un répertoire
module.exports.isDirectory = function(path) {
    let st = fs.statSync(path);
    return st.isDirectory();
  }
  