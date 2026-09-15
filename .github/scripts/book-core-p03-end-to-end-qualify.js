'use strict';

const fs = require('fs');
fs.isFileSync = file => fs.existsSync(file) && fs.statSync(file).isFile();
require('./book-core-p03-end-to-end-runtime');
