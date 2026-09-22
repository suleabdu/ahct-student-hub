/* =============================================================================
   js/api.js
   AH Student Hub — fetch wrapper

   Replaces every `google.script.run.withSuccessHandler(...).withFailureHandler
   (...).someFunction(args)` call from the original Apps Script pages with a
   plain fetch() against the Flask API (js/config.js's API_BASE_URL). Kept
   deliberately callback-shaped (onSuccess/onFailure) rather than switched to
   async/await everywhere, so each page's script file could be ported with
   minimal structural change from its original google.script.run call —
   compare any call site here with its original in the extracted Apps
   Script project.
   ============================================================================= */

const Api = {
  /**
   * @param {string} path e.g. "/api/auth/login"
   * @param {object} body JSON body (sent as-is)
   * @param {function} onSuccess called with the parsed JSON response
   * @param {function} onFailure called with an Error-like {message}
   * @param {string|null} token optional bearer session token
   */
  call(path, body, onSuccess, onFailure, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    fetch(API_BASE_URL + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data };
        });
      })
      .then(function (result) {
        if (!result.ok || result.data.success === false) {
          onFailure && onFailure({ message: result.data.error || "Something went wrong. Please try again." });
          return;
        }
        onSuccess && onSuccess(result.data);
      })
      .catch(function (err) {
        onFailure && onFailure({ message: err.message || "Network error — please check your connection and try again." });
      });
  },

  get(path, onSuccess, onFailure) {
    fetch(API_BASE_URL + path)
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          onFailure && onFailure({ message: result.data.error || "Something went wrong." });
          return;
        }
        onSuccess && onSuccess(result.data);
      })
      .catch(function (err) {
        onFailure && onFailure({ message: err.message || "Network error — please check your connection and try again." });
      });
  },
};
