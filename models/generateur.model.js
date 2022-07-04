const fs = require('fs')
const { extname, join } = require('path')
const sizeOf = require('image-size')
const mime = require('mime-types')
const { getVideoDurationInSeconds } = require('get-video-duration')
const { getAudioDurationInSeconds } = require('get-audio-duration')
const singleManifestTemplate = require('../config/manifest-template.json')
const directoryManifestTemplate = require('../config/directory-manifest-template.json')
const config = require('config');
const tiff = require('tiff');
const PDFParser = require("pdf2json");
const utils = require("../utils.js");

const fileExists = async function (path) {
  return new Promise((resolve, reject) => {
    // check if file exists
    fs.stat(path, (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

const getFileType = function (path) {
  const ext = extname(path);
  return config.get('fileTypes')[ext];
}

// Lit un fichier PDF et retourne les tailles des images
// On passe le path et le tableau des tailles en objet
// pour qu'ils soient passés par référence
// TODO: comment retourner une valeur avec resolve()? Ce serait plus propre
const getPDFImageSizes = async function testGetImageSizes(obj) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataReady", pdfData => {
      for (let p=0; p < pdfData.Pages.length; p++) {
        // Pour l'instant on bricole une taille qui donne à peu près le info.json
        // TODO: je ne sais pas d'où vient le 1.4, c'est empirique
        // Le 24 vient du fait que la librairie considère que c'est du 96dpi
        // et retourne en points
        obj.sizes.push({width: Math.round(pdfData.Pages[p].Width * 24 * 1.4), height: Math.round(pdfData.Pages[p].Height * 24 * 1.4)});
      }
      return resolve();
    });
    pdfParser.loadPDF(config.get("baseDir") + obj.path);
  });
}

module.exports = async function getManifest(path) {
  path = decodeURI(path);
  // On accepte les URI qui se terminent en .json
  if (path.endsWith(".json")) {
    path = path.substring(0, path.length - 5);
  }
  const thePath = config.get('baseDir') + path;
  try {
    await fileExists(thePath)
  }
  catch (e) {
    return null
  }

  if (utils.isDirectory(thePath)) {
    return getDirectoryManifest(path);
  }
  else {
    // Manifest pour une ressource unique (un fichier)
    return getSingleImageManifest(path);
  }
}

/* Produit un manifest pour un dossier */
async function getDirectoryManifest(path) {
    // On va fabriquer l'ID de l'objet
    let objectId = config.get("server.origin") + encodeURI(path);

    // On charge le gabarit dans un objet qu'on va modifier
    let manifest = JSON.parse(JSON.stringify(directoryManifestTemplate));
    manifest.id = objectId + ".json";
    manifest.label.fr[0] = "Manifest généré automatiquement pour " + path;

    // Les items
    let items = [];
    let baseItem = manifest.items[0];

    let files = fs.readdirSync(config.get("baseDir") + path);
    for (let i=0; i<files.length; i++) {
      if (utils.iiifViewable(path + "/" + files[i])) {
        let currentItem = JSON.parse(JSON.stringify(baseItem));
        currentItem.id = config.get("server.origin") + config.get('generateurURL') + encodeURI(path.substring(1) + "/" + files[i]);
        currentItem.label.fr[0] = "Manifest généré automatiquement pour " + path + "/" + files[i];
        items.push(currentItem);
      }
    }

    // On ajoute les items et on retourne le manifest
    manifest.items.pop();
    manifest.items = items;
    return manifest;
}

/* Retourne un manifest en cache s'il est disponible.
    Retourne null sinon. */
function getManifestFromCache(p) {

  // On véfifie d'abord la config
  if (!config.get("useCache")) return null;

  // Ensuite on vérifie si on l'a en cache
  try {
    const thePath = getManifestCachePath(p);
    if (fs.existsSync(thePath)) {
      const originalPath = config.get("baseDir") + p;
      if (fs.statSync(thePath).mtimeMs >  fs.statSync(originalPath).mtimeMs) {
        // La cache est plus récente, on la retoure
        return JSON.parse(fs.readFileSync(thePath));
      }
      else {
        // La cache est plus ancienne on ne le retourne pas
        return null;
      }
    }
  }
  catch {
    // En cas d'erreur on retourne tout simplement null, comme si pas d'objet en cache
    return null;
  }

  // On n'a pas le fichier en cache
  return null;
}

/* Stocke le manifeste en cache */
function saveManifestInCache(p, manifest) {
  if (config.get("useCache")) {
    try {
      fs.writeFileSync(getManifestCachePath(p), JSON.stringify(manifest));    
    }
    catch {
      return;
    }
  }
}

/* Retourne le chemin complet d'un manifest en cache */
function getManifestCachePath(p) {
  return config.get("manifestCacheDir") + "/" + p.substring(1).replaceAll('/', '%2F') + ".json";
}

/* Produit un manifest pour une image, une vidéo ou un fichier sonore en
    fonction d'un gabarit en config. */
async function getSingleImageManifest(path) {

  // On va d'abord vérifier la cache
  let manifest = getManifestFromCache(path);
  if (manifest) return manifest;

  try {
    // On doit d'abord déterminer le nombre d'images ou de pages dans l'objet
    let nbPages = 1;
    let mimeType = mime.lookup(path);
    let fileType = getFileType(path);

    // Les fichiers TIFF ou PDF peuvent avoir plusieurs pages
    let imgPages = [];
    if (mimeType === "application/pdf") {
      let myObj = {path: path, sizes: imgPages};  // Pour pouvoir passer des valeurs par référence
      await getPDFImageSizes(myObj);
      imgPages = myObj.sizes;
      nbPages = imgPages.length;
    }

    // Le traitement des TIFF, qui peuvent avoir plusieurs pages/images
    if (mimeType === "image/tiff") {
      if (fs.statSync(config.get("baseDir") + path).size < 2 * 1024 * 1024 * 1024 ) {
        let dataBuffer = fs.readFileSync(config.get("baseDir") + path);
        nbPages = tiff.pageCount(dataBuffer);
        imgPages = tiff.decode(dataBuffer);
      }
    }

    // Ensuite déterminer la taille de l'image
    let imgWidth = 600;
    let imgHeight = 800;
    if (fileType === "image" && imgPages.length === 0) {
      const imageSize = sizeOf(config.get('baseDir') + path);
      imgHeight = imageSize.height;
      imgWidth = imageSize.width;
    }


    // On va fabriquer l'ID de l'objet
    let objectId = config.get("server.origin") + encodeURI(path);

    // On charge le gabarit dans un objet qu'on va modifier
    manifest = JSON.parse(JSON.stringify(singleManifestTemplate));

    // Les informations de premier niveau
    manifest.id = objectId;
    manifest.label.fr[0] = "Manifest généré automatiquement pour " + path;

    // On peut maintenant boucler sur les pages

    for (let i = 0; i < nbPages; i++) {

      // Pour les services IIIF de Cantaloupe dans le cas des multipages
      let pageIndex = "";

      // Si ce n'est pas la première page, on clone la page précédente
      if (i > 0) {
        const newItem = JSON.parse(JSON.stringify(manifest.items[i-1]))
        manifest.items.push(newItem);
      }

      // Un canvas par page
      let canvasId = objectId + "/canvas/" + (i+1);

      // Maintenant on va préciser le canvas
      let c = manifest.items[i];
      c.id = canvasId;

      // Dans le cas des fichiers vidéo ou audio, on retire le hauteur et
      // la largeur pour ajouter la durée
      if (fileType === "audio" || fileType === "video") {
        delete c.height;
        delete c.width;
        if (fileType === "audio") {
          c.duration = await getAudioDurationInSeconds(config.get('baseDir') + path);
        }
        else {
          c.duration = await getVideoDurationInSeconds(config.get('baseDir') + path);
        }
      }
      else {
        delete c.duration;

        // Si on a les tailles pour chaque image...
        if (imgPages.length > 0) {
          imgHeight = imgPages[i].height;
          imgWidth = imgPages[i].width;
        }

        c.height = imgHeight;
        c.width = imgWidth;
      }

      c.label.fr[0] = "Page " + (i+1);


      // Dans le canvas, on précise la AnnotationPage
      let ap = c.items[0];
      ap.id = objectId + "/page/p" + (i+1);

      // Ensuite la ressource comme telle

      // Son service IIIF
      if (mimeType === "application/pdf" || mimeType === "image/tiff") {
        pageIndex = ";" + (i+1);
      }
      let annot = ap.items[0];
      annot.id = objectId + "/annotation/image" + (i+1);
      annot.target = canvasId;

      let body = annot.body;
      if (fileType === "audio" || fileType === "video") {
        delete body.height;
        delete body.width;
        delete body.service;
        delete annot.thumbnail;
        body.id = config.get('server.origin') + path;
        if (fileType === "audio") {
          body.duration = await getAudioDurationInSeconds(config.get('baseDir') + path);
          body.type = "Sound";
        }
        else {
          body.duration = await getVideoDurationInSeconds(config.get('baseDir') + path);
          body.type = "Video";
        }
      }
      else {
        delete body.duration;
        body.type = "Image";
        body.id = config.get("iiifImageServerURL") + encodeURI(path.substring(1)).replaceAll("/", "%2f") + pageIndex + "/full/max/0/default.jpg";
        body.height = imgHeight;
        body.width = imgWidth;  
      }
      body.format = mimeType;
      if (mimeType === "application/pdf" || fileType === "image") body.format = "image/jpeg"; // Parce qu'on demande des .jpg à Cantaloupe
      // On va ajouter une vignette pour les images
      if (fileType === "image" || mimeType === "application/pdf") {
        let thumb = annot.thumbnail[0];
        // On va calculer la taille idéale
        let thumbMax = 150;
        let thumbSizeURL = "";
        let thumbWidth = thumbMax;
        let thumbHeight = thumbMax;
        if (imgHeight > imgWidth) { 
          thumbWidth = Math.round(imgWidth * (thumbMax/imgHeight));
          thumbSizeURL = "," + thumbMax; 
        }
        else {
          thumbHeight = Math.round(imgHeight * (thumbMax/imgWidth))
          thumbSizeURL = "" + thumbMax + ","; 
        };
        thumb.height = thumbHeight;
        thumb.width = thumbWidth;
        thumb.id = config.get("iiifImageServerURL") + encodeURI(path.substring(1)).replaceAll("/", "%2f") + pageIndex + "/full/" + thumbSizeURL + "/0/default.jpg";
  
  
        // Maintenant on indique que c'est un service IIIF
        let serv = body.service[0];
        serv.id = config.get("iiifImageServerURL") + encodeURI(path.substring(1)).replaceAll("/", "%2f") + pageIndex;
      }
    }

    // On sauvegarde en cache
    saveManifestInCache(path, manifest);

    // On a terminé on retourne notre objet
    return manifest;

  } catch (e) {
      console.error(e)
     return null;
  }
}
