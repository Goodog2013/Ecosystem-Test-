function ok(value = null) {
  return { ok: true, value, error: null };
}

function fail(code, message, details = null) {
  return {
    ok: false,
    value: null,
    error: { code, message, details },
  };
}

module.exports = { ok, fail };

