const { randomUUID } = require('crypto');

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

module.exports = { id };
