const hostnamesLocais = ["localhost", "127.0.0.1"];
const siteLocal = hostnamesLocais.includes(window.location.hostname);

window.APP_CONFIG = {
  API_BASE: siteLocal
    ? "http://localhost:8080/api"
    : "https://appmusica-api.onrender.com/api",
};