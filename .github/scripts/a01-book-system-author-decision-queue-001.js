'use strict';

const path = require('path');

if (process.env.A01_EVIDENCE_DIR) {
  process.env.BOOK_AUTHOR_DECISION_EVIDENCE_DIR = process.env.A01_EVIDENCE_DIR;
}

require(path.join(__dirname, 'book-system-author-decision-queue-001-qualify.js'));
