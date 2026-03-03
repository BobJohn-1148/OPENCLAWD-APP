const { randomUUID } = require('crypto');

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function makeId(prefix) {
  return id(prefix);
}

module.exports = { id, makeId };
