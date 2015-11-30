(define => {define((require,exports,module) => {
'use strict';

function Storage() {}

Storage.prototype = {
  get(key) {
    if (!key) return;
    return decodeURIComponent(document.cookie.replace(new RegExp('(?:(?:^|.*;)\\s*' + encodeURIComponent(key).replace(/[\-\.\+\*]/g, '\\$&') + '\\s*\\=\\s*([^;]*).*$)|^.*$'), '$1')) || undefined;
  },

  set(key, value) {
    var forever = 'Fri, 31 Dec 9999 23:59:59 GMT';
    key = encodeURIComponent(key);
    value = encodeURIComponent(value);
    document.cookie = `${key}=${value}; expires=${forever}; path=/;`;
  },

  clear(key) {
    if (!arguments.length) return this.clearAll();
    if (!this.has(key)) return;
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${encodeURIComponent(key)}=; expires=${past}; path=/;`;
  },

  clearAll() {
    decodeURIComponent(document.cookie)
      .split(';')
      .forEach(cookie => {
        var equal = cookie.indexOf('=');
        var name = ~equal ? cookie.substr(0, equal) : cookie;
        this.clear(name);
      });
  },

  has(key) {
    return !!~document.cookie.indexOf(`${encodeURIComponent(key)}=`);
  }
};

/**
 * Exports
 */

module.exports = new Storage();

})})(((n,w)=>{return(typeof define)[0]=='f'&&define.amd?define:(typeof module)[0]=='o'?c =>{c(require,exports,module)}:c=>{var m={exports:{}},r=n=>w[n];w[n]=c(r,m.exports,m)||m.exports;};})('../storage',this));/*jshint ignore:line*/
