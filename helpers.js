module.exports = function () {
  const hbs = require('hbs');

  hbs.registerHelper('firstLetter', function (str) {
    return str ? str.charAt(0).toUpperCase() : '';
  });

  hbs.registerHelper('eq', function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });
};
