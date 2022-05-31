/* Code utilitaire */

const config = require('config');
const path = require("path");
const fs = require("fs");
const { extname } = require('path');



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
  

// Retourne une URL pour une vignette selon la nature de l'objet
module.exports.getThumbURL = function(p) {

    // Le cas des dossiers et des fichiers audios: on retourne une image spécifique
    if (this.isDirectory(config.get("baseDir") + "/" + p)) return "/@assets/folder.svg";
    if (this.isaudio(p)) return "/@assets/file-music.svg";

    // Ce qui peut être servi par Cantaloupe
    if (this.isimage(p) || this.isvideo(p) || this.isPDF(p)) return config.get("iiifImageServerURL") + p.replaceAll('/', '%2F') + "/full/!50,50/0/default.jpg";

    // Le cas particulier du dossier des manifests
    const parent = p.split('/')[0];
    if (config.get("storeBaseDir") === config.get("baseDir") + "/" + parent ) {
        const ext = path.extname(p);
        if (ext === "" || ext === ".json") return "/@assets/iiif.png";
    }

    // Sinon on retourne un point d'interrogation
    return "/@assets/question-square.svg";
}

// Retourne le content-type d'une ressource
// On va simplement le modifier dans le cas du dossier _manifests
// pour les fichiers sans extensions...
module.exports.setContentType = function(res) {
    const parent = res.filename.split('/')[0];
    if (config.get("storeBaseDir") === config.get("baseDir") + "/" + parent ) {
        const ext = path.extname(res.filename);
        if (ext === "") res.contentType("application/json");
    }
}