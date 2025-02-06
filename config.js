// config.js - NEVER commit real API keys to version control
const CONFIG = {
  API_KEY:
    localStorage.getItem("DS_API_KEY") ||
    prompt("Please enter your Deepseek API key:"),
};
localStorage.setItem("DS_API_KEY", CONFIG.API_KEY);
window.CONFIG = CONFIG; // Expose the config globally

window.NEWS_CONFIG = {
  apiKey: "53a284f3a77f475a9b211b5596e40560",
  // For example, fetch top headlines for Germany:
  endpoint: "https://newsapi.org/v2/everything?domains=wsj.com",
};
