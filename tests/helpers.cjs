"use strict";
const api = {
  ...require("../dist/company.js"),
  ...require("../dist/core.js"),
  ...require("../dist/backup.js"),
  ...require("../dist/storage.js"),
  ...require("../dist/documents.js"),
};
const fixture = require("../examples/demo-backup.json");
module.exports = { api, fixture };
