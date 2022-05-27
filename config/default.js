module.exports = {
  server: {
    port: 8080,
    session: 'meowmeow',
    origin: 'http://localhost:8080'
  },
  key: null,
  baseDir: 'd:\\projets\\on\\public\\data\\cs',
  fileTypes: {
    '.jpg': 'image',
    '.jpeg': 'image',
    '.jp2': 'image',
    '.png': 'image',
    '.tiff': 'image',
    '.tif': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.mp4': 'video',
    '.mpg': 'video',
    '.mpeg': 'video',
    '.mkv': 'video',
    '.avi': 'video',
    '.ogg': 'video',
    '.mp3': 'audio',
    '.wav': 'audio',
    '.m4a': 'audio',
    '.pdf': 'pdf'
  },
  iiifImageServerURL: 'http://localhost:8182/iiif/3/',
  generateurURL: '/generateur/',
  miradorURL: '/mirador/',
  uvURL: '/universalviewer/',
  osdURL: '/openseadragon/',
  storeBaseDir: 'd:\\projets\\on\\public\\data\\cs\\_manifests',
  manifestCacheDir: 'd:\\projets\\on\\public\\data\\cs\\manifest-cache',
  useCache: false,
  storeURL: 'https://oncs.bib.umontreal.ca/manifest-store'
}