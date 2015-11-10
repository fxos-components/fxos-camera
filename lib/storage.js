
function Storage() {}

Storage.prototype = {
  get(key) {
    if (!key) return;
    return decodeURIComponent(document.cookie.replace(new RegExp('(?:(?:^|.*;)\\s*' + encodeURIComponent(key).replace(/[\-\.\+\*]/g, '\\$&') + '\\s*\\=\\s*([^;]*).*$)|^.*$'), '$1')) || null;
  },

  set(key, value, options) {
    var forever = 'Fri, 31 Dec 9999 23:59:59 GMT';
    var expires = (options && options.expires) || forever;
    key = encodeURIComponent(key);
    value = encodeURIComponent(value);
    document.cookie = `${key}=${value}; expires=${expires}; path=/`;
  },

  remove(key) {
    if (!this.has(key)) return;
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    this.set(key, '', { expires: past });
  },

  has(key) {
    return !!~document.cookie.indexOf(`${key}=`);
  }
};
