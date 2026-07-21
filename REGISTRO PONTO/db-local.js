(function () {
  const VER_KEY = '_rh_ver';

  function getVersioned(key) {
    const ver = localStorage.getItem(VER_KEY + '_' + key);
    return ver ? parseInt(ver, 10) || 0 : 0;
  }

  function setVersioned(key, val, expectedVer) {
    const current = getVersioned(key);
    if (expectedVer != null && current !== expectedVer) {
      const err = new Error('version_conflict');
      err.code = 'version_conflict';
      throw err;
    }
    localStorage.setItem(VER_KEY + '_' + key, String(expectedVer != null ? expectedVer + 1 : current + 1));
    localStorage.setItem(key, JSON.stringify(val));
  }

  const DB = {
    get: async function (key, def) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return def !== undefined ? def : null;
        return JSON.parse(raw);
      } catch (e) {
        console.error('[DB] get error:', e);
        return def !== undefined ? def : null;
      }
    },

    set: async function (key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (e) {
        console.error('[DB] set error:', e);
        throw e;
      }
    },

    remove: async function (key) {
      try {
        localStorage.removeItem(key);
        localStorage.removeItem(VER_KEY + '_' + key);
      } catch (e) { }
    },

    setVersioned: async function (key, val, expectedVer) {
      setVersioned(key, val, expectedVer);
    },

    sync: async function (key) {
      // No-op: storage já é local
      return;
    },

    setMerge: async function (key, mergeFn) {
      const current = await this.get(key, null);
      const result = mergeFn(current);
      await this.set(key, result);
      return result;
    },

    setMergeSync: function (key, mergeFn) {
      const raw = localStorage.getItem(key);
      let current = null;
      try { current = raw ? JSON.parse(raw) : null; } catch(e) {}
      const result = mergeFn(current);
      localStorage.setItem(key, JSON.stringify(result));
      return result;
    }
  };

  window.DB = DB;
  console.log('[db-local] Storage local ativo (100% localStorage)');
})();
