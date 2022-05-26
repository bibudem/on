#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";

const express = require("express");
const { engine: hbs } = require("express-handlebars");
const session = require("express-session");
const busboy = require("connect-busboy");
const flash = require("connect-flash");
const querystring = require("querystring");
const assets = require("./assets");
const archiver = require("archiver");
const config = require('config');
const utils = require("./utils.js");
const { extname, join } = require('path');

const notp = require("notp");

const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");

const mime = require('mime-types');
const tiff = require('tiff');
const filesize = require("filesize");
const octicons = require("@primer/octicons");
const handlebars = require("handlebars");

const console = require('./lib/console')

const port = config.get('server.port');

const manifestStoreRouter = require('./routes/manifest-store.route')
const generateurRouter = require('./routes/generateur.route');

const app = express();
const http = app.listen(port);



app.set("views", path.join(__dirname, "views"));
app.engine(
  "handlebars",
  hbs({
    partialsDir: path.join(__dirname, "views", "partials"),
    layoutsDir: path.join(__dirname, "views", "layouts"),
    defaultLayout: "main",
    helpers: {
      either: function (a, b, options) {
        if (a || b) {
          return options.fn(this);
        }
      },
      filesize: filesize,
      octicon: function (i, options) {
        if (!octicons[i]) {
          return new handlebars.SafeString(octicons.question.toSVG());
        }
        return new handlebars.SafeString(octicons[i].toSVG());
      },
      eachpath: function (path, options) {
        if (typeof path != "string") {
          return "";
        }
        let out = "";
        path = path.split("/");
        path.splice(path.length - 1, 1);
        path.unshift("");
        path.forEach((folder, index) => {
          out += options.fn({
            name: folder + "/",
            path: "/" + path.slice(1, index + 1).join("/"),
            current: index === path.length - 1,
          });
        });
        return out;
      },
    },
  })
);
app.set("view engine", "handlebars");

app.use('/manifest-store', manifestStoreRouter)

app.use('/generateur', generateurRouter)

app.use('/mirador', express.static(path.join(__dirname, 'mirador')))
app.use('/universalviewer', express.static(path.join(__dirname, 'universalviewer')))
app.use('/openseadragon', express.static(path.join(__dirname, 'openseadragon')))

app.use("/@assets", express.static(path.join(__dirname, "assets")));
// init assets
assets.forEach((asset) => {
  const { path: url, modulePath } = asset;
  app.use(
    `/@assets/${url}`,
    express.static(path.join(__dirname, `node_modules/${modulePath}`))
  );
});

app.use(
  session({
    secret: config.get('server.session'),
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());
app.use(busboy());
app.use(
  express.urlencoded({
    extended: false,
  })
);
// AUTH

const KEY = config.get('key');

app.get("/@logout", (req, res) => {
  if (KEY) {
    req.session.login = false;
    req.flash("success", "Signed out.");
    res.redirect("/@login");
    return;
  }
  req.flash("error", "You were never logged in...");
  res.redirect("back");
});

app.get("/@login", (req, res) => {
  res.render("login", flashify(req, {}));
});
app.post("/@login", (req, res) => {
  let pass = notp.totp.verify(req.body.token.replace(" ", ""), KEY);
  if (pass) {
    req.session.login = true;
    res.redirect("/");
    return;
  }
  req.flash("error", "Bad token.");
  res.redirect("/@login");
});

app.use((req, res, next) => {
  if (!KEY) {
    return next();
  }
  if (req.session.login === true) {
    return next();
  }
  req.flash("error", "Please sign in.");
  res.redirect("/@login");
});

function relative(...paths) {
  const finalPath = paths.reduce((a, b) => path.join(a, b), config.get('baseDir'));
/*  if (path.relative(process.cwd(), finalPath).startsWith("..")) {
    throw new Error("Failed to resolve path outside of the working directory");
  }
*/
  return finalPath;
}
function flashify(req, obj) {
  let error = req.flash("error");
  if (error && error.length > 0) {
    if (!obj.errors) {
      obj.errors = [];
    }
    obj.errors.push(error);
  }
  let success = req.flash("success");
  if (success && success.length > 0) {
    if (!obj.successes) {
      obj.successes = [];
    }
    obj.successes.push(success);
  }
  obj.isloginenabled = !!KEY;
  return obj;
}

app.use((req, res, next) => {
  if (req.method === "GET") {
    res.header('Access-Control-Allow-Origin', '*');
    return next();
  }
  let sourceHost = null;
  if (req.headers.origin) {
    sourceHost = new URL(req.headers.origin).host;
  } else if (req.headers.referer) {
    sourceHost = new URL(req.headers.referer).host;
  }
  if (sourceHost !== req.headers.host) {
    throw new Error(
      "Origin or Referer header does not match or is missing. Request has been blocked to prevent CSRF"
    );
  }
  next();
});

app.all("/*", (req, res, next) => {
  res.filename = req.params[0];

  let fileExists = new Promise((resolve, reject) => {
    // check if file exists
    fs.stat(relative(res.filename), (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });

  fileExists
    .then((stats) => {
      res.stats = stats;
      next();
    })
    .catch((err) => {
      res.stats = { error: err };
      next();
    });
});

app.post("/*@upload", (req, res) => {
  res.filename = req.params[0];

  let buff = null;
  let saveas = null;
  req.busboy.on("file", (key, stream, filename) => {
    if (key == "file") {
      let buffs = [];
      stream.on("data", (d) => {
        buffs.push(d);
      });
      stream.on("end", () => {
        buff = Buffer.concat(buffs);
        buffs = null;
      });
    }
  });
  req.busboy.on("field", (key, value) => {
    if (key == "saveas") {
      saveas = value;
    }
  });
  req.busboy.on("finish", () => {
    if (!buff || !saveas) {
      return res.status(400).end();
    }
    let fileExists = new Promise((resolve, reject) => {
      // check if file exists
      fs.stat(relative(res.filename, saveas), (err, stats) => {
        if (err) {
          return reject(err);
        }
        return resolve(stats);
      });
    });

    fileExists
      .then((stats) => {
        console.warn("file exists, cannot overwrite");
        req.flash("error", "Le fichier existe, on ne peut le remplacer.");
        res.redirect("back");
      })
      .catch((err) => {
        const saveName = relative(res.filename, saveas);
        console.log("saving file to " + saveName);
        let save = fs.createWriteStream(saveName);
        save.on("close", () => {
          if (res.headersSent) {
            return;
          }
          if (buff.length === 0) {
            req.flash("success", "Fichier enregistré. Attention: le fichier est vide.");
          } else {
            buff = null;
            req.flash("success", "Fichier enregistré.");
          }
          res.redirect("back");
        });
        save.on("error", (err) => {
          console.warn(err);
          req.flash("error", err.toString());
          res.redirect("back");
        });
        save.write(buff);
        save.end();
      });
  });
  req.pipe(req.busboy);
});

app.post("/*@mkdir", (req, res) => {
  res.filename = req.params[0];

  let folder = req.body.folder;
  if (!folder || folder.length < 1) {
    return res.status(400).end();
  }

  let fileExists = new Promise((resolve, reject) => {
    // Check if file exists
    fs.stat(relative(res.filename, folder), (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });

  fileExists
    .then((stats) => {
      req.flash("error", "Folder exists, cannot overwrite. ");
      res.redirect("back");
    })
    .catch((err) => {
      fs.mkdir(relative(res.filename, folder), (err) => {
        if (err) {
          console.warn(err);
          req.flash("error", err.toString());
          res.redirect("back");
          return;
        }
        req.flash("success", "Dossier créé. ");
        res.redirect("back");
      });
    });
});

app.post("/*@delete", (req, res) => {
  res.filename = req.params[0];

  let files = JSON.parse(req.body.files);
  if (!files || !files.map) {
    req.flash("error", "Aucun fichier sélectionné.");
    res.redirect("back");
    return; // res.status(400).end();
  }

  let promises = files.map((f) => {
    return new Promise((resolve, reject) => {
      fs.stat(relative(res.filename, f), (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve({
          name: f,
          isdirectory: stats.isDirectory(),
          isfile: stats.isFile(),
        });
      });
    });
  });
  Promise.all(promises)
    .then((files) => {
      let promises = files.map((f) => {
        return new Promise((resolve, reject) => {
          let op = null;
          if (f.isdirectory) {
            op = (dir, cb) =>
              rimraf(
                dir,
                {
                  glob: false,
                },
                cb
              );
          } else if (f.isfile) {
            op = fs.unlink;
          }
          if (op) {
            op(relative(res.filename, f.name), (err) => {
              if (err) {
                return reject(err);
              }
              resolve();
            });
          }
        });
      });
      Promise.all(promises)
        .then(() => {
          req.flash("success", "Fichier(s) supprimé(s).");
          res.redirect("back");
        })
        .catch((err) => {
          console.warn(err);
          req.flash("error", "Impossible de supprimer un ou des fichiers: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.get("/*@download", (req, res) => {
  res.filename = req.params[0];

  let files = null;
  try {
    files = JSON.parse(req.query.files);
  } catch (e) { }
  if (!files || !files.map) {
    req.flash("error", "Aucun fichier sélectionné.");
    res.redirect("back");
    return; // res.status(400).end();
  }

  let promises = files.map((f) => {
    return new Promise((resolve, reject) => {
      fs.stat(relative(res.filename, f), (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve({
          name: f,
          isdirectory: stats.isDirectory(),
          isfile: stats.isFile(),
        });
      });
    });
  });
  Promise.all(promises)
    .then((files) => {
      let zip = archiver("zip", {});
      zip.on("error", function (err) {
        console.warn(err);
        res.status(500).send({
          error: err.message,
        });
      });

      files
        .filter((f) => f.isfile)
        .forEach((f) => {
          zip.file(relative(res.filename, f.name), { name: f.name });
        });
      files
        .filter((f) => f.isdirectory)
        .forEach((f) => {
          zip.directory(relative(res.filename, f.name), f.name);
        });

      res.attachment("Archive.zip");
      zip.pipe(res);

      zip.finalize();
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.post("/*@rename", (req, res) => {
  res.filename = req.params[0];

  let files = JSON.parse(req.body.files);
  if (!files || !files.map) {
    req.flash("error", "Aucun fichier sélectionné.");
    res.redirect("back");
    return;
  }

  new Promise((resolve, reject) => {
    fs.access(relative(res.filename), fs.constants.W_OK, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  })
    .then(() => {
      let promises = files.map((f) => {
        return new Promise((resolve, reject) => {
          fs.rename(
            relative(res.filename, f.original),
            relative(res.filename, f.new),
            (err) => {
              if (err) {
                return reject(err);
              }
              resolve();
            }
          );
        });
      });
      Promise.all(promises)
        .then(() => {
          req.flash("success", "Fichier(s) renommé(s).");
          res.redirect("back");
        })
        .catch((err) => {
          console.warn(err);
          req.flash("error", "Impossible de renommer un ou des fichiers: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

// On retire la possibilité d'ouvrir un terminal et de lancer une commande
// TODO: rendre cela paramétrable
const shellable = false;
//const shellable = process.env.SHELL != "false" && process.env.SHELL;
const cmdable = false;
//const cmdable = process.env.CMD != "false" && process.env.CMD;
if (shellable || cmdable) {
  const shellArgs = process.env.SHELL.split(" ");
  const exec = process.env.SHELL == "login" ? "/usr/bin/env" : shellArgs[0];
  const args = process.env.SHELL == "login" ? ["login"] : shellArgs.slice(1);

  const child_process = require("child_process");

  app.post("/*@cmd", (req, res) => {
    res.filename = req.params[0];

    let cmd = req.body.cmd;
    if (!cmd || cmd.length < 1) {
      return res.status(400).end();
    }
    console.log("running command " + cmd);

    child_process.exec(
      cmd,
      {
        cwd: relative(res.filename),
        timeout: 60 * 1000,
      },
      (err, stdout, stderr) => {
        if (err) {
          console.log("command run failed: " + JSON.stringify(err));
          req.flash("error", "Command failed due to non-zero exit code");
        }
        res.render(
          "cmd",
          flashify(req, {
            path: res.filename,
            cmd: cmd,
            stdout: stdout,
            stderr: stderr,
          })
        );
      }
    );
  });

  const pty = require("node-pty");
  const WebSocket = require("ws");

  app.get("/*@shell", (req, res) => {
    res.filename = req.params[0];

    res.render(
      "shell",
      flashify(req, {
        path: res.filename,
      })
    );
  });

  const ws = new WebSocket.Server({ server: http });
  ws.on("connection", (socket, request) => {
    const { path } = querystring.parse(request.url.split("?")[1]);
    let cwd = relative(path);
    let term = pty.spawn(exec, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 30,
      cwd: cwd,
    });
    console.log(
      "pid " + term.pid + " shell " + process.env.SHELL + " started in " + cwd
    );

    term.on("data", (data) => {
      socket.send(data, { binary: true });
    });
    term.on("exit", (code) => {
      console.log("pid " + term.pid + " ended");
      socket.close();
    });
    socket.on("message", (data) => {
      // special messages should decode to Buffers
      if (data.length == 6) {
        switch (data.readUInt16BE(0)) {
          case 0:
            term.resize(data.readUInt16BE(1), data.readUInt16BE(2));
            return;
        }
      }
      term.write(data);
    });
    socket.on("close", () => {
      term.end();
    });
  });
}

app.get('/a-propos', function (req, res) {
  res.render('a-propos')
})

const SMALL_IMAGE_MAX_SIZE = config.get('smallImageMaxSize')

// Retourne le nom du fichier à afficher dans l'explorateur
// Si c'est dans le dossier des manifest, on parse le JSON,
// Sinon on retourne le nom de fichier standard
function getFilename(parent, f) {
  let parentFolder = config.get("baseDir") + "/" + parent;
  if (parentFolder === config.get("storeBaseDir") + "/") {
    const ext = extname(f);
    if (!ext || ext === '.json' || ext === '') {
      try {
        const contenu = fs.readFileSync(parentFolder + f);
        const man = JSON.parse(contenu);
        let ret = "";
        const label = man.label;
        if ( label ) {
          // On a un label, on construit un nom en commençant par ça
          if ( label.fr ) ret = label.fr[0];
          else if ( label.en ) ret = label.en[0];
          else { ret = f; }
        }
        else ret = f;
        // On ajoute l'id et la date de modification
        ret = ret + " (date: " + fs.statSync(parentFolder + f).mtime.toISOString() + "; id: " + f + ")";
        return ret;
      }
      catch (err) {
        return f;
      }
    }
  }
  return f;
}

// Retourne une liste d'actions à afficher pour un fichier ou un dossier
// p est le chemin relatif complet du fichier
function getActions(p) {
  // L'array qu'on va retourner
  const ret = [];

  // Les actions pour les objets que l'on peut consulter dans un viewer IIIF
  if (utils.iiifViewable(p)) {
    // Ouvrir dans Mirador
    ret.push({ label: 'Ouvrir dans Mirador', href: config.get('miradorURL') + '?manifest=' + config.get('generateurURL') + p });
    // Ouvrir dans UniversalViewer
    ret.push({ label: 'Ouvrir dans UniversalViewer', href: config.get('uvURL') + '?manifest=' + config.get('generateurURL') + p });
    // Ouvrir dans OpenSeaDragon
    if (utils.isimage(p)) {
      let nbPages = 1;
      let mimeType = mime.lookup(p);
      if (mimeType === "image/tiff") {
        let dataBuffer = fs.readFileSync(config.get("baseDir") + "/" + p);
        nbPages = tiff.pageCount(dataBuffer);
      }
      let infoURL = config.get('osdURL') + '?info=' + encodeURI(config.get('iiifImageServerURL') + p.replaceAll('/', '%2F') + '/info.json&nb=' + nbPages);
      ret.push({ label: 'Ouvrir dans OpenSeaDragon', href: infoURL });
    }
    // Afficher le manifest
    ret.push({ label: 'Afficher le manifest', href: config.get('generateurURL') + p });
    if (utils.isimage(p)) {
        // Afficher l'image via le serveur d'images IIIF
      ret.push({ label: 'Afficher l\'image avec le serveur d\'images IIIF', href: config.get('iiifImageServerURL') + p.replaceAll('/', '%2F') + '/full/max/0/default.jpg' });
      // Afficher le info.json via le serveur d'images IIIF
      ret.push({ label: 'Afficher le info.json', href: config.get('iiifImageServerURL') + p.replaceAll('/', '%2F') + '/info.json' });
    }
  }

  // Si on est dans le dossier des manifest, on va permettre de les montrer
  // dans un viewer IIIF
  const parent = p.split('/')[0];
  if (config.get("storeBaseDir") === config.get("baseDir") + "/" + parent ) {
    // Ouvrir dans Mirador
    ret.push({ label: 'Ouvrir dans Mirador', href: config.get('miradorURL') + '?manifest=' + config.get('server.origin') + "/" + p });
    // Ouvrir dans UniversalViewer
    ret.push({ label: 'Ouvrir dans UniversalViewer', href: config.get('uvURL') + '?manifest=' + config.get('server.origin') + "/" + p });
  }

  // On retourne la liste d'actions
  return ret;
}

app.get("/*", (req, res) => {
  if (res.stats.error) {
    res.render(
      "list",
      flashify(req, {
        shellable: shellable,
        cmdable: cmdable,
        path: res.filename,
        errors: [res.stats.error],
      })
    );
  } else if (res.stats.isDirectory()) {
    if (!req.url.endsWith("/")) {
      return res.redirect(req.url + "/");
    }

    let readDir = new Promise((resolve, reject) => {
      fs.readdir(relative(res.filename), (err, filenames) => {
        if (err) {
          return reject(err);
        }
        return resolve(filenames);
      });
    });

    readDir
      .then((filenames) => {
        const promises = filenames.map(
          (f) =>
            new Promise((resolve, reject) => {
              fs.stat(relative(res.filename, f), (err, stats) => {
                if (err) {
                  console.warn(err);
                  return resolve({
                    name: f,
                    error: err,
                  });
                }
                resolve({
                  name: getFilename(res.filename, f),
                  href: f,
                  isdirectory: stats.isDirectory(),
                  issmallimage: utils.isimage(f) && stats.size < SMALL_IMAGE_MAX_SIZE,
                  size: ((stats.size/1024/1024)).toLocaleString('fr-CA', {maximumSignificantDigits: 2}),
                  actions: getActions(res.filename + f),
                });
              });
            })
        );

        Promise.all(promises)
          .then((files) => {
            res.render(
              "list",
              flashify(req, {
                shellable: shellable,
                cmdable: cmdable,
                path: res.filename,
                files: files,
              })
            );
          })
          .catch((err) => {
            console.error(err);
            res.render(
              "list",
              flashify(req, {
                shellable: shellable,
                cmdable: cmdable,
                path: res.filename,
                errors: [err],
              })
            );
          });
      })
      .catch((err) => {
        console.warn(err);
        res.render(
          "list",
          flashify(req, {
            shellable: shellable,
            cmdable: cmdable,
            path: res.filename,
            errors: [err],
          })
        );
      });
  } else if (res.stats.isFile()) {
    res.sendFile(relative(res.filename), {
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'none'; sandbox",
      },
      dotfiles: "allow",
    });
  }
});

console.log(`Listening on port ${port}`);
